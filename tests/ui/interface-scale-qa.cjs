/* Shared reading scale and lazy-map regression checks. Official chart contents are controlled fixtures. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {chromium} = require('playwright');
const base = process.env.MT_INFO_QA_URL || 'http://127.0.0.1:4173';
const out = path.resolve(process.env.MT_INFO_SCALE_OUT || 'artifacts/interface-round2-2026-11-17/ui');
const fixtures = JSON.parse(execFileSync(process.execPath, ['--import','tsx','--input-type=module','-e', `import {getRainMaps} from './server/rainMaps.ts';import {rainMapCopy} from './src/rain-map-copy.ts';console.log(JSON.stringify({catalog:getRainMaps(),copy:rainMapCopy}))`], {encoding:'utf8'}));
const official = 'https://watch.ncdr.nat.gov.tw/watch_mpas2weeks';
const chart = '<svg xmlns="http://www.w3.org/2000/svg" width="1245" height="1500"><rect width="100%" height="100%" fill="#fff"/><text x="50" y="100" font-size="38">受控圖面測試，非官方預報</text><path d="M550 350 L730 650 660 950 470 1100 420 800Z" fill="#edf2e9" stroke="#254b3f" stroke-width="8"/><text x="220" y="1250" font-size="32">只測試縮放、播放與版面；未產生雨量數值</text></svg>';
const result = {base,checkedAt:new Date().toISOString(),fixture:'CWA image and MPAS iframe are explicit local fixtures; no weather-value or live-source verification is claimed.',screens:[],checks:{},errors:[]};
const sizes = [320,360,390,768,820,1024,1440];
async function settle(page) { await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))); }
async function audit(page, name, width) {
  await settle(page);
  const data = await page.evaluate(()=>{
    const scope=document.querySelector('main');
    const visible=e=>e.checkVisibility()&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0;
    const get=s=>[...scope.querySelectorAll(s)].filter(visible).map(e=>({text:e.textContent.trim().slice(0,100),size:parseFloat(getComputedStyle(e).fontSize),width:e.clientWidth,scroll:e.scrollWidth}));
    const controls=[...scope.querySelectorAll('.rain-controls button,.rain-controls a,.rain-controls input,.rain-canvas-products button,.rain-canvas-playback button,.rain-zoom-controls button,.rain-time-inset,.weather-view-switch button,.ncdr-mpas-viewer button,.ncdr-mpas-actions a,.weather-panel button,.weather-panel a,.weather-panel select,.weather-panel input')].filter(visible).map(e=>({name:e.getAttribute('aria-label')||e.textContent.trim(),height:e.getBoundingClientRect().height,font:parseFloat(getComputedStyle(e).fontSize)}));
    const rect=s=>{const n=scope.querySelector(s);return n?.getBoundingClientRect().toJSON()};
    return {viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,scopeWidth:scope.clientWidth,scopeScroll:scope.scrollWidth,body:get('.rain-controls p,.rain-controls .rain-reading-note,.rain-method p,.rain-canvas-footer,.rain-image-placeholder p,.ncdr-mpas-source p,.ncdr-mpas-hint,.ncdr-mpas-status,.ncdr-mpas-limitation,.weather-panel .product-header p,.weather-panel .fine-print,.weather-panel .setup-card p,.weather-panel .ncdr-note small,.weather-panel .period-note'),meta:get('.rain-product-heading>span,.rain-frame-grid>button>span,.rain-source span,.rain-image-state,.rain-canvas-playback small,.rain-time-inset>span,.weather-panel .weather-times span,.weather-panel .value-range'),controls,canvas:rect('.rain-map-canvas'),panel:rect('.information-panel'),imageArea:rect('.rain-image-area'),zoom:rect('.rain-zoom-controls'),playback:rect('.rain-canvas-playback'),heading:rect('.rain-view-heading')};
  });
  assert.ok(data.documentWidth<=width+1 && data.scopeScroll<=data.scopeWidth+1, `${name}: horizontal overflow`);
  assert.ok(data.body.length && data.body.every(x=>x.size>=15.9),`${name}: body <16px ${JSON.stringify(data.body.filter(x=>x.size<15.9))}`);
  assert.ok(data.meta.every(x=>x.size>=13.9),`${name}: metadata <14px`);
  assert.ok(data.controls.every(x=>x.height>=47.9),`${name}: control <48px ${JSON.stringify(data.controls.filter(x=>x.height<47.9))}`);
  assert.ok(data.body.concat(data.meta).every(x=>!x.width||x.scroll<=x.width+2),`${name}: clipped display text`);
  if (data.imageArea) {
    assert.ok(data.canvas.height>300 && data.imageArea.height>=239,`${name}: chart collapsed`);
    for(const r of [data.zoom,data.playback])assert.ok(r.top>=data.imageArea.top-1 && r.bottom<=data.imageArea.bottom+1,`${name}: controls outside chart`);
    if(width<=760)assert.ok(data.canvas.top<data.panel.top,`${name}: chart must precede controls on phones`);
  }
  result.screens.push({name,width,...data});
}
async function skip(page) {
  const link=page.locator('.skip-link');
  assert.ok(await link.evaluate(n=>document.querySelector('a[href],button,input:not([hidden]),select,textarea')===n), 'skip link is first in DOM tab order');
  // The established planner entry focuses its h1 to announce the workspace; retain that behavior.
  if(await page.locator('main').evaluate(n=>n.contains(document.activeElement))){
    for(let i=0;i<20 && !await link.evaluate(n=>n===document.activeElement);i++)await page.keyboard.press('Shift+Tab');
  }else await page.keyboard.press('Tab');
  assert.ok(await link.evaluate(n=>n===document.activeElement && n.getBoundingClientRect().top>=0));
  await page.keyboard.press('Enter');
  assert.ok(await page.locator('main').evaluate(n=>n===document.activeElement));
  await page.evaluate(()=>document.activeElement.blur());
}
(async()=>{
 await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  for(const width of sizes){
   const context=await browser.newContext({viewport:{width,height:width===1440?1000:width>=768?1024:844},reducedMotion:'reduce'});const page=await context.newPage();const assets=[];let iframeRequests=0;
   page.on('pageerror',e=>result.errors.push(e.message));page.on('request',r=>{if(r.resourceType()==='stylesheet')assets.push(r.url());if(r.isNavigationRequest()&&r.url()===official)iframeRequests++;});
   await page.route('**/api/rain-maps',r=>r.fulfill({json:fixtures.catalog}));
   await page.route('https://www.cwa.gov.tw/Data/fcst_img/**',r=>r.fulfill({contentType:'image/svg+xml',body:chart}));
   await page.route(official,r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><h1>受控原頁測試，非預報</h1>'}));
   await page.goto(`${base}/?layer=weather`);await page.waitForFunction(()=>document.querySelector('.rain-image-state')?.textContent==='圖面已載入');await skip(page);await audit(page,'rain',width);
   assert.ok(!assets.some(u=>/maplibre-gl-worker.*\.css/.test(u)), 'Rain must not load MapLibre CSS');
   assert.ok((await page.locator('.rain-reading-note').innerText()).includes(fixtures.copy.noAutomaticFreshness));
   await page.locator('main').evaluate(n=>n.scrollTop=0);await page.screenshot({path:path.join(out,`rain-${width}.png`)});
   await page.locator('.rain-source').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`rain-source-${width}.png`)});
   if(width===390){
    const image=page.locator('.rain-image-stage>img'),canvas=page.locator('.rain-map-canvas');const before=await image.getAttribute('src');
    await canvas.getByRole('button',{name:'下一時段',exact:true}).click();await page.waitForFunction(before=>document.querySelector('.rain-image-stage>img')?.getAttribute('src')!==before,before);
    await page.waitForFunction(()=>!document.querySelector('.rain-time-inset').disabled);await page.locator('.rain-time-inset').click();assert.ok(await page.locator('.rain-image-viewport').evaluate(n=>n.classList.contains('zoomed')));
    await canvas.getByRole('button',{name:fixtures.copy.returnAll,exact:true}).click();
    assert.equal(await page.locator('.rain-image-viewport').evaluate(n=>n.classList.contains('zoomed')),false);
    const range=page.locator('.rain-range input');await range.focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');assert.equal(await range.inputValue(),'1');
    await page.waitForFunction(()=>!document.querySelector('.rain-time-inset').disabled);const label=await canvas.locator('.rain-canvas-playback>span').innerText();await canvas.getByRole('button',{name:'播放時段',exact:true}).click();await page.waitForFunction(label=>document.querySelector('.rain-canvas-playback>span').innerText!==label,label,{timeout:6000});await canvas.getByRole('button',{name:'暫停播放',exact:true}).click();
    await page.locator('.rain-product-tabs').getByRole('button',{name:'每 12 小時',exact:true}).click();assert.equal(await page.locator('.rain-frame-grid button').count(),4);await page.waitForFunction(()=>document.querySelector('.rain-image-state')?.textContent==='圖面已載入');
    result.checks.rainFlow={frameSwitch:true,originalTimeZoom:true,returnAll:true,keyboardRange:true,playPause:true,twelveHourFrames:4};
   }
   await page.goto(`${base}/?layer=weather&rain=ncdr-mpas`);await page.locator('.ncdr-mpas-hint').waitFor();await audit(page,'mpas',width);const start=iframeRequests;
   await page.locator('.ncdr-mpas-size-controls button').nth(1).click();const original=page.locator('.ncdr-mpas-size-controls button').first();await original.click();await original.hover();const ratio=await original.evaluate(n=>{const rgb=s=>s.match(/[\d.]+/g).slice(0,3).map(Number);const l=c=>c.map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((a,x,i)=>a+x*[.2126,.7152,.0722][i],0);const s=getComputedStyle(n),a=l(rgb(s.color)),b=l(rgb(s.backgroundColor));return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)});assert.ok(ratio>=4.5,'Selected MPAS control retains contrast on hover');assert.equal(iframeRequests,start,'Size switch must preserve iframe');assert.equal(await page.locator('iframe').getAttribute('src'),official);await page.locator('main').evaluate(n=>n.scrollTop=0);await page.screenshot({path:path.join(out,`mpas-${width}.png`)});
   await page.goto(`${base}/?layer=weather`);await page.locator('.weather-view-switch button').nth(1).click();if(width<=760){const t=page.locator('.mobile-view-toggle');if(await t.getAttribute('aria-expanded')==='false')await t.click();}
   await page.locator('.weather-panel').waitFor();await audit(page,'observations',width);await page.locator('.weather-panel').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`observations-${width}.png`)});
   await context.close();
  }
  const c=await browser.newContext();const p=await c.newPage();const loaded=[];p.on('request',r=>{if(r.resourceType()==='stylesheet')loaded.push(r.url())});
  await p.goto(`${base}/?plan=1`);await p.locator('.plan-catalog').waitFor();await skip(p);assert.ok(!loaded.some(u=>/maplibre-gl-worker.*\.css/.test(u)));result.checks.catalogNoMapCss=true;
  await p.goto(`${base}/?layer=equipment`);await p.locator('.map-canvas canvas').waitFor();assert.ok(loaded.some(u=>/maplibre-gl-worker.*\.css/.test(u)));await p.locator('canvas.maplibregl-canvas').focus();assert.ok(await p.locator('canvas.maplibregl-canvas').evaluate(n=>{const s=getComputedStyle(n);return s.outlineStyle==='solid'&&parseFloat(s.outlineWidth)>=3}));result.checks.mapCssAndFocus=true;
  await p.goto(`${base}/?layer=conditions`);await p.locator('.conditions-dashboard').waitFor();await skip(p);
  await p.goto(`${base}/cards.html`);await p.locator('.sc-main').waitFor();await skip(p);result.checks.skipLinksAcrossToolsAndCards=true;await c.close();assert.deepEqual(result.errors,[]);
 }catch(e){result.failure=e.stack||e.message;throw e;}finally{await browser.close();await fs.writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({screens:result.screens.length,checks:result.checks,errors:result.errors,failure:result.failure||null},null,2));}
})().catch(e=>{console.error(e);process.exitCode=1});
