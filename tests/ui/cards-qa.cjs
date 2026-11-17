/* Isolated Chrome: fictional collection state only. No personal browser profile. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('playwright');
const base = process.env.MT_INFO_QA_URL || 'http://127.0.0.1:5173';
const mode = process.argv[2] || 'ui';
const out = path.resolve('artifacts/cards-qa');
const key = 'mt-info-cards-v1';
const ids = ['ridge','clouds','forest','stream','camp','stars','lake','dawn'];
const titles = ['稜線','雲海','森林','溪谷','營地','星空','湖泊','晨光'];
const full = {schemaVersion:1,cards:ids.map(cardId => ({cardId,artworkVersion:1,firstObtainedAt:'2026-10-26T01:00:00.000Z',lastObtainedAt:'2026-10-26T01:00:00.000Z',count:1}))};
const result = {mode,base,checkedAt:new Date().toISOString(),checks:{},pageErrors:[]};
let browser;
async function context(options={}) {
  const ctx = await browser.newContext({viewport:options.viewport || {width:1440,height:1000},reducedMotion:options.reduced ? 'reduce' : 'no-preference'});
  await ctx.addInitScript(({key,raw,denied,origin}) => {
    if(location.origin !== origin) return;
    if(raw !== undefined && localStorage.getItem(key) === null) localStorage.setItem(key,raw);
    const original = Storage.prototype.setItem;
    if(denied) Storage.prototype.setItem = function(k,v) {if(k===key) throw new DOMException('QA quota','QuotaExceededError');return original.call(this,k,v)};
    // Fixed byte selects clouds. Subsequent draws remain independent acquisition events.
    crypto.getRandomValues = value => {value.fill(1);return value};
  },{key,raw:options.raw,denied:!!options.denied,origin:new URL(base).origin});
  ctx.on('page',p=>p.on('pageerror',e=>result.pageErrors.push(e.message)));
  return ctx;
}
async function open(ctx) {const p=await ctx.newPage();await p.goto(base+'/cards.html?return=%2F%3Flayer%3Dconditions%26plan%3D1');await p.locator('.sc-card-art').waitFor();return p}
async function stored(p) {return p.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null'),key)}
async function check(name,run) {result.checks[name]=await run() ?? true}
async function draw(p) {await p.getByRole('button',{name:'直接抽卡',exact:true}).click();await p.getByRole('button',{name:'加入圖鑑',exact:true}).waitFor()}
async function gallery(p) {await p.getByRole('navigation',{name:'山行卡檢視'}).getByRole('button',{name:/我的圖鑑/}).click()}
async function file(p,trigger,name) {const pending=p.waitForEvent('download');await trigger();const d=await pending;const target=path.join(out,name||d.suggestedFilename());await d.saveAs(target);return{target,name:d.suggestedFilename(),bytes:await fs.readFile(target)}}
async function upload(p,value,name='qa-collection.json') {await p.locator('input[type=file]').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(typeof value==='string'?value:JSON.stringify(value))})}
async function sizes(p) {return p.evaluate(()=>{const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';return{width:innerWidth,scroll:document.documentElement.scrollWidth,bodyFont:parseFloat(getComputedStyle(document.querySelector('.sc-intro')||document.querySelector('.sc-answers label')||document.querySelector('.sc-result-description')||document.querySelector('.sc-collection-heading p:last-child')).fontSize),notes:[...document.querySelectorAll('.sc-meta,.sc-count,.sc-eyebrow')].filter(visible).map(e=>parseFloat(getComputedStyle(e).fontSize)),controls:[...document.querySelectorAll('button,select,a,.sc-answers label')].filter(visible).map(e=>({text:e.getAttribute('aria-label')||e.textContent.slice(0,45),height:e.getBoundingClientRect().height})),images:[...document.querySelectorAll('img')].filter(visible).every(e=>e.complete&&e.naturalWidth>0)}})}
function assertSizes(m) {assert.equal(m.scroll,m.width);assert.ok(m.bodyFont>=16);assert.ok(m.notes.every(x=>x>=14));assert.deepEqual(m.controls.filter(x=>x.height<47.5),[]);assert.equal(m.images,true)}
(async()=>{
 await fs.mkdir(out,{recursive:true});browser=await chromium.launch({channel:'chrome',headless:true});
 try {
 if(mode==='ui') {
  await check('quizBackScoringFlipAndNoToolRequests',async()=>{
   const c=await context(),p=await c.newPage(),requests=[];p.on('request',r=>requests.push(r.url()));await p.goto(base+'/cards.html');await p.locator('.sc-card-art').waitFor();assert.equal(await stored(p),null);
   assertSizes(await sizes(p));await p.screenshot({path:path.join(out,'home-1440.png'),fullPage:true});
   await p.getByRole('button',{name:'開始測驗',exact:true}).click();assert.equal(await p.getByRole('button',{name:'下一題',exact:true}).isDisabled(),true);
   await p.locator('.sc-answers label').nth(1).click();await p.getByRole('button',{name:'下一題',exact:true}).click();await p.getByRole('button',{name:'上一題',exact:true}).click();assert.equal(await p.locator('.sc-answers input').nth(1).isChecked(),true);
   for(let i=0;i<6;i++){await p.locator('.sc-answers label').first().click();await p.getByRole('button',{name:i===5?'查看結果':'下一題',exact:true}).click()}
   await p.getByRole('heading',{name:'觀察派',exact:true}).waitFor();assert.ok((await p.locator('.sc-drawn-label').innerText()).includes('雲海'));
   await p.getByRole('button',{name:'翻看「雲海」背面',exact:true}).click();assert.equal(await p.locator('.sc-card').getAttribute('class').then(x=>x.includes('is-flipped')),true);
   await p.getByRole('button',{name:'翻看「雲海」正面',exact:true}).click();await p.getByRole('button',{name:'加入圖鑑',exact:true}).click();assert.equal((await stored(p)).cards[0].count,1);
   assert.equal(await p.getByRole('button',{name:'已加入圖鑑',exact:true}).isDisabled(),true);
   await p.getByRole('button',{name:'再抽一張',exact:true}).click();await p.getByRole('button',{name:'加入圖鑑',exact:true}).click();assert.equal((await stored(p)).cards.length,1);assert.equal((await stored(p)).cards[0].count,2);
   assert.equal((await stored(p)).answers,undefined);await p.screenshot({path:path.join(out,'result-1440.png'),fullPage:true});
   await p.reload();assert.equal((await stored(p)).cards[0].count,2);await gallery(p);await p.getByRole('button',{name:'查看雲海，取得 2 次',exact:true}).click();await p.getByRole('heading',{name:'雲海',exact:true}).waitFor();
   const forbidden=requests.filter(x=>/\/api\/|maplibre|three(?:\.|-)|PlanPanel/.test(x));assert.deepEqual(forbidden,[]);await c.close();return{quiz:'6 answers, return and edit, observer result; card remains independently clouds',savedCount:2,requests:requests.length,forbidden};
  });
  await check('backupRestoreConfirmationInvalidImportAndReset',async()=>{
   const c=await context(),p=await open(c);await draw(p);await p.getByRole('button',{name:'加入圖鑑',exact:true}).click();await gallery(p);
   const backup=await file(p,()=>p.getByRole('button',{name:'備份圖鑑',exact:true}).click(),'collection-backup.json');assert.equal(JSON.parse(backup.bytes).cards[0].cardId,'clouds');
   await upload(p,full);await p.getByRole('dialog').getByRole('button',{name:'取消',exact:true}).click();assert.equal((await stored(p)).cards.length,1);
   await upload(p,full);await p.getByRole('button',{name:'確認取代並還原',exact:true}).click();assert.equal((await stored(p)).cards.length,8);assert.equal(await p.locator('button.sc-collection-card').count(),8);await p.screenshot({path:path.join(out,'collection-1440.png'),fullPage:true});
   const original=JSON.stringify(await stored(p));await upload(p,'{broken');assert.equal(JSON.stringify(await stored(p)),original);assert.equal(await p.getByRole('dialog').count(),0);
   await p.getByRole('button',{name:'清空圖鑑',exact:true}).click();await p.getByRole('dialog').getByRole('button',{name:'取消',exact:true}).click();assert.equal((await stored(p)).cards.length,8);
   await p.getByRole('button',{name:'清空圖鑑',exact:true}).click();await p.getByRole('button',{name:'確認清空圖鑑',exact:true}).click();assert.equal((await stored(p)).cards.length,0);await c.close();return{backup:true,cancelPreserves:true,restoreEight:true,invalidPreserves:true,explicitReset:true};
  });
  await check('phoneLayoutsAndReducedMotion',async()=>{
   const all=[];for(const viewport of[{width:390,height:844},{width:360,height:640}]){const c=await context({viewport,reduced:true}),p=await open(c);await p.waitForTimeout(150);let m=await sizes(p);assertSizes(m);await p.screenshot({path:path.join(out,`home-${viewport.width}.png`),fullPage:true});await p.getByRole('button',{name:'開始測驗',exact:true}).click();m=await sizes(p);assertSizes(m);assert.equal(await p.locator('.sc-stage').isVisible(),false);await p.screenshot({path:path.join(out,`quiz-${viewport.width}.png`),fullPage:true});await p.getByRole('button',{name:'返回',exact:true}).click();await draw(p);assertSizes(await sizes(p));const stage=await p.locator('.sc-stage').boundingBox(),actions=await p.locator('.sc-result-actions').boundingBox();assert.ok(stage.y<actions.y,'The card reveal precedes collection/export controls on phones');assert.equal(await p.locator('.sc-card-turn').evaluate(e=>getComputedStyle(e).transitionDuration),'0s');await p.screenshot({path:path.join(out,`result-${viewport.width}.png`),fullPage:true});await p.getByRole('button',{name:'加入圖鑑',exact:true}).click();await gallery(p);assertSizes(await sizes(p));await p.screenshot({path:path.join(out,`collection-${viewport.width}.png`),fullPage:true});all.push({viewport,measurements:m,reducedMotion:true});await c.close()}return all;
  });
  await check('quotaKeepsMemoryBackupAndLeaveGuard',async()=>{
   const c=await context({denied:true}),p=await open(c);await draw(p);await p.getByRole('button',{name:'加入圖鑑',exact:true}).click();await p.getByRole('alert').waitFor();assert.equal(await stored(p),null);
   const backup=await file(p,()=>p.getByRole('button',{name:'備份本次圖鑑',exact:true}).click(),'quota-memory.json');assert.equal(JSON.parse(backup.bytes).cards[0].cardId,'clouds');await p.getByRole('link',{name:'返回工具',exact:true}).click();await p.getByRole('dialog',{name:'圖鑑尚未保存'}).waitFor();await p.getByRole('dialog').getByRole('button',{name:'取消',exact:true}).click();assert.ok(p.url().includes('cards.html'));await gallery(p);assert.equal(await p.locator('button.sc-collection-card').count(),1);await c.close();return{saved:false,memoryBackup:true,customLeaveGuard:true};
  });
  await check('corruptRawRemainsUntilExplicitReplacement',async()=>{
   const raw='{qa-broken',c=await context({raw}),p=await open(c);await p.getByRole('alert').waitFor();await draw(p);await p.getByRole('button',{name:'加入圖鑑',exact:true}).click();assert.equal(await p.evaluate(k=>localStorage.getItem(k),key),raw);const backup=await file(p,()=>p.getByRole('button',{name:'備份原始資料',exact:true}).click(),'corrupt-raw.json');assert.equal(backup.bytes.toString(),raw);await p.getByRole('button',{name:'重建圖鑑',exact:true}).click();await p.getByRole('button',{name:'確認清空圖鑑',exact:true}).click();assert.deepEqual(await stored(p),{schemaVersion:1,cards:[]});await c.close();return true;
  });
 } else if(mode==='exports') {
  await check('actualPngSvgAndA4Print',async()=>{
   const c=await context(),p=await open(c);await draw(p);const files=[];
   for(const [choice,expected] of[['card-png',[800,1120]],['bookmark-png',[591,1772]],['card-svg',null],['bookmark-svg',null]]){await p.getByLabel('匯出格式',{exact:true}).selectOption(choice);const d=await file(p,()=>p.getByRole('button',{name:'下載',exact:true}).click());if(expected){assert.equal(d.bytes.subarray(1,4).toString(),'PNG');assert.deepEqual([d.bytes.readUInt32BE(16),d.bytes.readUInt32BE(20)],expected)}else{assert.ok(d.bytes.toString().includes('<svg'));if(choice==='bookmark-svg')assert.ok(d.bytes.toString().includes('width="50mm" height="150mm"'))}files.push({name:d.name,bytes:d.bytes.length,dimensions:expected})}
   await p.evaluate(()=>{window.__printCalls=0;window.print=()=>window.__printCalls++});await p.getByRole('button',{name:'列印書籤 · A4 裁切版',exact:true}).click();await p.waitForFunction(()=>window.__printCalls===1);await p.emulateMedia({media:'print'});const metrics=await p.locator('.sc-print-bookmark').evaluate(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,cropMarks:e.querySelectorAll('.sc-crop').length}));assert.ok(Math.abs(metrics.width-50*96/25.4)<1);assert.ok(Math.abs(metrics.height-150*96/25.4)<1);assert.equal(metrics.cropMarks,4);assert.equal(await p.locator('.sc-screen').isVisible(),false);await p.pdf({path:path.join(out,'bookmark-a4.pdf'),preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});await p.screenshot({path:path.join(out,'bookmark-print-preview.png'),fullPage:true});
   // Force the browser rasterizer to fail; the UI must identify the SVG fallback.
   await p.emulateMedia({media:'screen'});await p.evaluate(()=>{HTMLCanvasElement.prototype.getContext=()=>null});await p.getByLabel('匯出格式',{exact:true}).selectOption('bookmark-png');const fallback=await file(p,()=>p.getByRole('button',{name:'下載',exact:true}).click(),'fallback.svg');assert.ok(fallback.name.endsWith('.svg'));await p.getByRole('status').filter({hasText:'PNG 未能產生，已改下載 SVG'}).waitFor();
   await c.close();return{files,printMetrics:metrics,pngFailureProducesIdentifiedSvg:true};
  });
 } else throw new Error('Use ui or exports');
 assert.deepEqual(result.pageErrors,[]);
 }catch(error){result.failure={message:error.message,stack:error.stack};throw error}
 finally{await browser?.close();await fs.writeFile(path.join(out,`${mode}-result.json`),JSON.stringify(result,null,2))}
 console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
