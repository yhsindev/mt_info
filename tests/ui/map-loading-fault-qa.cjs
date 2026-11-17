/* A failed map chunk must not remove equipment text or the editable local plan. */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('playwright');
const base=process.env.MT_INFO_QA_URL||'http://127.0.0.1:4173';
const out=path.resolve(process.env.MT_INFO_MAP_FAULT_OUT||'artifacts/interface-round2-2026-11-17/map-fault');
(async()=>{await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true});const result={base,checks:{},pageErrors:[]};try{
 for(const type of ['equipment','plan']){const c=await browser.newContext();const p=await c.newPage();p.on('pageerror',e=>result.pageErrors.push(e.message));await p.route(type==='equipment'?'**/assets/MapView-*.js':'**/assets/PlanRouteView-*.js',r=>r.abort('failed'));
 if(type==='equipment'){
  await p.goto(`${base}/?layer=equipment`);await p.locator('.map-unavailable').waitFor();await p.locator('.equipment-card').first().waitFor();const input=p.locator('.search-field input');await input.fill('醫院');assert.equal(await input.inputValue(),'醫院');assert.ok(await p.locator('.information-panel').isVisible());assert.ok(await p.locator('.header-nav').isVisible());await p.screenshot({path:path.join(out,'equipment.png')});result.checks.equipmentTextAndSearchRetained=true;
 }else{
  await p.goto(`${base}/?plan=1`);await p.locator('[data-template-id="xueshan"] .pc-use-template').click();await p.getByRole('alertdialog').getByRole('button',{name:'確認取代',exact:true}).click();await p.locator('.map-unavailable').waitFor();assert.ok(await p.locator('.plan-workspace-root').isVisible());assert.equal(await p.locator('.plan-day-tabs button').count(),3);const start=p.getByLabel('起走時間',{exact:true});await start.fill('06:30');await p.waitForFunction(()=>JSON.parse(localStorage.getItem('mt-info-plan-v1'))?.days[0].startTime==='06:30');assert.ok(await p.locator('.plan-timeline-leg').count()>0);await p.screenshot({path:path.join(out,'plan.png')});result.checks.planEditingAndSavingRetained=true;
 }
 await c.close();}
 assert.deepEqual(result.pageErrors,[]);
}catch(e){result.failure=e.stack||e.message;throw e;}finally{await browser.close();await fs.writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));}})().catch(e=>{console.error(e);process.exitCode=1});
