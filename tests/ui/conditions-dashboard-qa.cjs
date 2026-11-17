/* Independent dashboard QA. Historical map QA remains a separate script. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const base = process.env.MT_INFO_QA_URL || 'http://127.0.0.1:5173';
const entry = `${base}/?layer=conditions`;
const output = path.resolve('artifacts/conditions-dashboard');
const result = { base, checkedAt: new Date().toISOString(), checks: {}, screenshots: [], pageErrors: [], consoleErrors: [] };
const controlledOnly = process.argv.includes('--controlled');
const liveOnly = process.argv.includes('--live');
const skipPlanner = process.argv.includes('--skip-planner');
const plannerOnly = process.argv.includes('--planner-only');
const card = (page, id) => page.locator(`[data-condition-id=${JSON.stringify(id)}]`);

function monitor(page, name) {
  page.on('pageerror', error => result.pageErrors.push({ context: name, message: error.message }));
  page.on('console', message => { if (message.type() === 'error') result.consoleErrors.push({ context: name, message: message.text() }); });
}
async function paint(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(100);
}
async function screenshot(page, name) {
  await paint(page);
  await page.screenshot({ path: path.join(output, name), type: 'jpeg', quality: 88 });
  result.screenshots.push(name);
}
async function ready(page) {
  await page.locator('.conditions-dashboard').waitFor();
  await page.waitForFunction(() => {
    const dashboard = document.querySelector('.conditions-dashboard');
    return dashboard && !dashboard.textContent.includes('正在取得官方資料');
  });
}
async function loadAll(page) {
  for (let index = 0; index < 40; index++) {
    const more = page.locator('.conditions-dashboard').getByRole('button', { name: /^(顯示更多|載入更多)/ }).first();
    if (!await more.count() || !await more.isVisible()) return;
    await more.click();
  }
  throw new Error('Load-more controls did not terminate');
}
async function openCard(page, id) {
  const item = card(page, id), toggle = item.locator('button[aria-expanded]').first();
  await item.waitFor();
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  return item;
}
async function layout(page) {
  return page.locator('.conditions-dashboard').evaluate(node => {
    const title = node.querySelector('h1'), style = title && getComputedStyle(title), rect = node.getBoundingClientRect();
    return {
      width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth,
      title: title?.textContent, titleStyle: style ? { color: style.color, fontSize: style.fontSize, fontWeight: style.fontWeight } : null,
      top: rect.top, boardHeight: rect.height, scrollTop: node.scrollTop, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight,
      nestedScrollContainers: [...node.querySelectorAll('*')].filter(child => /^(auto|scroll)$/.test(getComputedStyle(child).overflowY) && child.scrollHeight > child.clientHeight + 1 && child.checkVisibility()).map(child => child.className),
      cardCount: node.querySelectorAll('[data-condition-id]').length,
      groupIds: [...node.querySelectorAll('[data-region]')].map(child => child.getAttribute('data-region')),
      controlTargets: [...node.querySelectorAll('button,input,select')].filter(child => child.checkVisibility() && !child.matches('input[type=hidden],.cd-row-toggle,.cd-alert-toggle')).map(child => ({ label: child.getAttribute('aria-label') || child.textContent || child.getAttribute('placeholder'), height: child.getBoundingClientRect().height })),
    };
  });
}
async function refreshControl(page) {
  return page.locator('.conditions-dashboard').getByRole('button', { name: /^(重新取得|重新整理|重試|更新資料)/ }).first();
}
async function plannerFocusCheck(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage(); monitor(page, 'full-page planner jump');
  try {
    await page.goto(entry); await ready(page);
    const data = await (await page.request.get(`${base}/api/conditions`)).json();
    const daba = data.trails.items.find(item => item.trailId === '027'); assert.ok(daba);
    const search = page.getByRole('searchbox').first();
    await search.fill('__qa_no_match__');
    await page.getByRole('group', { name: '步道路況類型', exact: true }).getByRole('button', { name: '封閉', exact: true }).click();
    await page.getByRole('navigation', { name: '主要工具' }).getByRole('button', { name: '計畫通', exact: true }).click();
    const plan = page.locator('.plan-page'); await plan.waitFor();
    await plan.getByRole('button', { name: '編輯計畫', exact: true }).click();
    const start = plan.locator('details').filter({ has: page.locator('summary', { hasText: /^起始方式$/ }) }).first();
    if (!await start.evaluate(node => node.open)) await start.locator('summary').first().click();
    await plan.getByRole('button', { name: '大霸三日參考', exact: true }).click();
    await plan.getByRole('alertdialog').getByRole('button', { name: '確認取代', exact: true }).click();
    await plan.getByRole('button', { name: '查看路況公告', exact: true }).click();
    await plan.waitFor({ state: 'hidden' });
    const selected = card(page, daba.id); await selected.waitFor();
    assert.equal(await selected.locator('button[aria-expanded]').first().getAttribute('aria-expanded'), 'true');
    await page.waitForFunction(id => {
      const node = [...document.querySelectorAll('[data-condition-id]')].find(node => node.getAttribute('data-condition-id') === id);
      const box = node?.getBoundingClientRect(); return box && box.top >= 0 && box.top < innerHeight;
    }, daba.id);
    assert.equal(await page.getByRole('searchbox').first().inputValue(), '');
    assert.equal(await page.getByRole('group', { name: '步道路況類型', exact: true }).getByRole('button', { name: '全部路況', exact: true }).getAttribute('aria-pressed'), 'true');
    result.checks.plannerFocusClearsFiltersAndExpands = { id: daba.id, visible: true, fullPage: true };
    await screenshot(page, 'dashboard-planner-focused.jpg');
  } finally { await context.close(); }
}
async function liveChecks(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage(); monitor(page, 'live');
  const equipmentRequests = [], mapRequests = [], mutations = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/equipment')) equipmentRequests.push(request.url());
    if (/tile\.openstreetmap\.org/.test(request.url())) mapRequests.push(request.url());
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutations.push(request.url());
  });
  try {
    await page.goto(entry, { waitUntil: 'domcontentloaded' }); await ready(page);
    const data = await (await page.request.get(`${base}/api/conditions`)).json();
    result.checks.sources = { trails: { status: data.trails.status, count: data.trails.items.length, checkedAt: data.trails.checkedAt }, alerts: { status: data.alerts.status, count: data.alerts.items.length, checkedAt: data.alerts.checkedAt } };
    assert.equal(await page.locator('.map-area,canvas.maplibregl-canvas').count(), 0);
    assert.deepEqual(equipmentRequests, []); assert.deepEqual(mapRequests, []); assert.equal(page.workers().length, 0);
    result.checks.conditionsHasNoMapOrEquipmentDownloads = true;
    for (const size of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 360, height: 640 }]) {
      await page.setViewportSize(size);
      await page.locator('.conditions-dashboard').evaluate(node => node.scrollTo({ top: 0 }));
      await paint(page);
      const state = await layout(page);
      assert.equal(state.documentWidth, size.width);
      assert.equal(state.nestedScrollContainers.length, 0);
      assert.ok(parseFloat(state.titleStyle.fontSize) >= 28);
      assert.ok(state.controlTargets.every(control => control.height >= 44));
      result.checks[`layout${size.width}`] = state;
      await screenshot(page, `dashboard-${size.width}.jpg`);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    const dashboard = page.locator('.conditions-dashboard');
    const anchors = {};
    for (const [id, name] of [['north', '北部'], ['central', '中部'], ['south', '南部'], ['east', '東部']]) {
      const control = dashboard.getByRole('button', { name: new RegExp(`^${name}`) }).or(dashboard.getByRole('link', { name: new RegExp(`^${name}`) })).first();
      await control.click(); await page.waitForTimeout(500);
      const position = await dashboard.evaluate((node, id) => {
        const group = node.querySelector(`[data-region="${id}"]`), heading = group?.querySelector('h2,h3') || group;
        const top = heading?.getBoundingClientRect().top;
        const stickyBottom = Math.max(node.getBoundingClientRect().top, ...[...node.querySelectorAll('*')].filter(child => getComputedStyle(child).position === 'sticky' && child.checkVisibility()).map(child => child.getBoundingClientRect().bottom));
        return { top, stickyBottom, scrollTop: node.scrollTop };
      }, id);
      assert.ok(position.top >= position.stickyBottom - 2, `${name} heading must clear the sticky toolbar`);
      assert.ok(position.top < 1000);
      anchors[id] = position;
    }
    result.checks.regionAnchors = anchors;
    await loadAll(page);
    const ids = await dashboard.locator('[data-condition-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-condition-id')));
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(data.trails.items.every(item => ids.includes(item.id)), 'Unknown positions must remain ordinary board records');
    let originals = 0;
    for (const item of data.trails.items) {
      const element = await openCard(page, item.id);
      if (item.description) assert.ok(await element.getByText(item.description, { exact: true }).count());
      assert.ok((await element.locator('a[href]').evaluateAll(nodes => nodes.map(node => node.href))).includes(item.source.url));
      originals++;
    }
    result.checks.allTrailOriginalsAndSources = { verified: originals, uniqueCardIds: ids.length };
    let alertOriginals = 0;
    for (const item of data.alerts.items.filter(item => Date.parse(item.effectiveAt) <= Date.now() && Date.parse(item.expiresAt) > Date.now())) {
      const element = await openCard(page, item.id);
      if (item.description) assert.ok(await element.getByText(item.description, { exact: true }).count());
      else assert.ok((await element.innerText()).includes('來源未提供完整文字'));
      if (item.instruction) assert.ok(await element.getByText(item.instruction, { exact: true }).count());
      assert.ok((await element.locator('a[href]').evaluateAll(nodes => nodes.map(node => node.href))).includes(item.source.url));
      const text = await element.innerText();
      assert.ok(item.areas.every(area => text.includes(area)));
      alertOriginals++;
    }
    result.checks.allAlertOriginalsAndSources = { verified: alertOriginals };
    const search = dashboard.getByRole('searchbox').first();
    await search.fill('臺中');
    const traditional = await dashboard.locator('[data-condition-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-condition-id')));
    await search.fill('台中');
    const alternate = await dashboard.locator('[data-condition-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-condition-id')));
    assert.deepEqual(alternate, traditional);
    await search.fill('');
    const type = dashboard.getByRole('group', { name: '步道路況類型', exact: true });
    await type.getByRole('button', { name: '封閉', exact: true }).click(); await loadAll(page);
    const closed = await dashboard.locator('.cd-trail-row[data-condition-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-condition-id')));
    const expected = data.trails.items.filter(item => item.condition === 'closed').map(item => item.id);
    assert.deepEqual([...closed].sort(), [...expected].sort());
    result.checks.typeFilter = { closed: expected.length, filteredResult: await dashboard.locator('.cd-filter-result').innerText(), nationwideStatistics: await dashboard.locator('.cd-statistics').innerText(), separateAlerts: await dashboard.locator('.cd-alert-row').count() };
    await screenshot(page, 'dashboard-filtered.jpg');
    await search.fill('__qa_no_match__');
    assert.equal(await dashboard.locator('[data-condition-id]').count(), 0);
    if (!skipPlanner) {
    await page.getByRole('navigation', { name: '主要工具', exact: true }).getByRole('button', { name: '計畫通', exact: true }).click();
    const dialog = page.locator('.plan-page'); await dialog.waitFor();
    await dialog.getByRole('button', { name: '編輯計畫', exact: true }).click();
    const start = dialog.locator('details').filter({ has: page.locator('summary', { hasText: '起始方式' }) }).first();
    if (!await start.evaluate(node => node.open)) await start.locator('summary').first().click();
    await dialog.getByRole('button', { name: '大霸三日參考', exact: true }).click();
    await dialog.getByRole('button', { name: '確認取代', exact: true }).click();
    await dialog.getByRole('button', { name: '查看路況公告', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    const daba = data.trails.items.find(item => item.trailId === '027'); assert.ok(daba);
    const selected = card(page, daba.id);
    await selected.waitFor();
    assert.equal(await selected.locator('button[aria-expanded]').first().getAttribute('aria-expanded'), 'true');
    const position = await selected.boundingBox();
    assert.ok(position && position.y >= 0 && position.y < 1000);
    assert.equal(await search.inputValue(), '');
    result.checks.plannerFocusClearsFiltersAndExpands = { id: daba.id, visible: true };
    await screenshot(page, 'dashboard-planner-focused.jpg');
    } else result.checks.plannerFocusClearsFiltersAndExpands = 'Pending the new full-page planner shell; skipped explicitly.';
    assert.deepEqual(mutations, []);
    await search.fill('');
    await page.getByRole('navigation', { name: '主要工具', exact: true }).getByRole('button', { name: '急救', exact: true }).click();
    await page.locator('.map-area').waitFor();
    await page.waitForFunction(() => /[\d,]+ 筆/.test(document.querySelector('.overview-count')?.textContent || ''));
    const equipment = { count: await page.locator('.overview-count').innerText(), firstBatch: await page.locator('.equipment-card').count(), requested: equipmentRequests.length > 0 };
    assert.ok(equipment.firstBatch > 0 && equipment.firstBatch <= 40 && equipment.requested);
    result.checks.equipmentMapRegression = equipment;
  } finally { await context.close(); }
}

async function controlledChecks(browser) {
  const request = await browser.newContext();
  const live = await (await request.request.get(`${base}/api/conditions`)).json(); await request.close();
  const fresh = structuredClone(live), now = new Date();
  for (const feed of [fresh.trails, fresh.alerts]) { feed.status = 'ready'; feed.checkedAt = now.toISOString(); }
  async function open(name, handler, clock = false) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const page = await context.newPage(); monitor(page, name);
    if (clock) await page.clock.install({ time: now });
    await page.route('**/api/conditions', handler);
    await page.goto(entry, { waitUntil: 'domcontentloaded' }); await ready(page);
    return { context, page };
  }
  const failure = await open('initial 503', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"QA simulated source failure"}' }));
  try {
    await failure.page.locator('.conditions-dashboard .cd-notice[role="alert"]').first().waitFor();
    assert.equal(await failure.page.locator('[data-condition-id]').count(), 0);
    const statistics = await failure.page.locator('.cd-stat strong').allTextContents();
    assert.ok(statistics.every(value => value === '—'));
    result.checks.initial503 = { message: await failure.page.locator('.conditions-dashboard').innerText(), statistics, noSuccessfulZero: true };
    await screenshot(failure.page, 'dashboard-initial-503.jpg');
  } finally { await failure.context.close(); }
  let calls = 0;
  const stale = await open('last-good failure', route => ++calls === 1 ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fresh) }) : route.abort('failed'));
  try {
    await card(stale.page, fresh.trails.items[0].id).waitFor();
    const retry = await refreshControl(stale.page); await retry.click();
    await stale.page.locator('.cd-source-state-summary .cd-state-stale').first().waitFor();
    assert.ok(await card(stale.page, fresh.trails.items[0].id).count());
    result.checks.lastGoodFailure = { retainedTrail: true, stale: true };
    await screenshot(stale.page, 'dashboard-last-good-stale.jpg');
  } finally { await stale.context.close(); }
  for (const mode of ['missing', 'empty']) {
    const fixture = structuredClone(fresh);
    for (const feed of [fixture.trails, fixture.alerts]) { feed.status = mode; feed.items = []; }
    const state = await open(`${mode} fixture`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) }));
    try {
      const text = await state.page.locator('.conditions-dashboard').innerText();
      assert.equal(await state.page.locator('[data-condition-id]').count(), 0);
      assert.ok(mode === 'missing' ? /資料未就緒|尚未取得/.test(text) : /來源無紀錄|目前沒有/.test(text));
      result.checks[mode] = { text };
      await screenshot(state.page, `dashboard-${mode}.jpg`);
    } finally { await state.context.close(); }
  }
  const expiry = structuredClone(fresh), original = expiry.alerts.items[0];
  assert.ok(original, 'A normalized alert fixture needs the source contract');
  expiry.alerts.items = [{ ...original, id: 'qa:controlled-expiry', identifier: 'qa:controlled-expiry', headline: '【QA 受控】短效示警，非官方事件', publisher: '測試資料，非官方示警', issuedAt: new Date(+now - 60000).toISOString(), effectiveAt: new Date(+now - 30000).toISOString(), expiresAt: new Date(+now + 90000).toISOString() }];
  const clock = await open('CAP expiry clock', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(expiry) }), true);
  try {
    await card(clock.page, 'qa:controlled-expiry').waitFor();
    await clock.page.clock.fastForward(120000);
    await card(clock.page, 'qa:controlled-expiry').waitFor({ state: 'detached' });
    assert.ok(await card(clock.page, expiry.trails.items[0].id).count());
    result.checks.capExpiry = { advancedSeconds: 120, expiredCapRemoved: true, trailRetained: true };
  } finally { await clock.context.close(); }
}

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.MT_INFO_QA_BROWSER_CHANNEL || 'chrome', headless: true });
  try {
    if (plannerOnly) await plannerFocusCheck(browser);
    else { if (!controlledOnly) await liveChecks(browser); if (!liveOnly) await controlledChecks(browser); }
    assert.deepEqual(result.pageErrors, []);
  } catch (error) { result.failure = error.stack || error.message; throw error; }
  finally {
    await browser.close();
    await fs.writeFile(path.join(output, plannerOnly ? 'planner-result.json' : controlledOnly ? 'controlled-result.json' : liveOnly ? 'live-result.json' : 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ checks: Object.keys(result.checks), screenshots: result.screenshots, pageErrors: result.pageErrors, failure: result.failure || null }, null, 2));
  }
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
