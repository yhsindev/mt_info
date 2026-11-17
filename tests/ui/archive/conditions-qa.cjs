/* Historical UI coverage for the conditions map, replaced by the dashboard on 2026-10-22.
 * Kept for prior design traceability; use ../conditions-dashboard-qa.cjs for current UI. */
/* Local UI verification only. Requires Playwright via the caller's Node module path. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const base = process.env.MT_INFO_QA_URL || 'http://127.0.0.1:5173';
const output = path.resolve('artifacts');
const result = { base, checks: {}, screenshots: [], errors: [], failedRequests: [] };

async function screenshot(page, filename) {
  await page.locator('.map-state').filter({ hasText: '正在載入地圖…' }).waitFor({ state: 'hidden', timeout: 25000 });
  if (await page.locator('.map-area').count()) await page.waitForTimeout(650); // Known initial camera fit is 550 ms.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: path.join(output, filename), type: 'jpeg', quality: 85 });
  result.screenshots.push(filename);
}
async function conditionsReady(page) {
  await page.locator('.conditions-panel').waitFor();
  await page.waitForFunction(() => {
    const summary = document.querySelector('.conditions-source-summary > summary');
    return summary && !summary.textContent.includes('載入中');
  }, null, { timeout: 25000 });
}

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.MT_INFO_QA_BROWSER_CHANNEL || 'chrome', headless: true });
  try {
    if (process.argv.includes('--smoke')) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.goto('about:blank');
      console.log(JSON.stringify({ connected: browser.isConnected(), version: browser.version(), viewport: page.viewportSize() }));
      return;
    }
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const mutations = [];
    page.on('pageerror', error => result.errors.push(error.message));
    page.on('requestfailed', request => { if (result.failedRequests.length < 20) result.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }); });
    page.on('request', request => { if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutations.push({ method: request.method(), url: request.url() }); });
    await page.goto(`${base}/?layer=conditions`, { waitUntil: 'domcontentloaded' });
    await conditionsReady(page);
    const dataResponse = await page.request.get(`${base}/api/conditions`);
    assert.equal(dataResponse.status(), 200);
    const data = await dataResponse.json();
    result.checks.sources = {
      trails: { status: data.trails.status, count: data.trails.items.length, fetchedAt: data.trails.fetchedAt, checkedAt: data.trails.checkedAt },
      alerts: { status: data.alerts.status, count: data.alerts.items.length, fetchedAt: data.alerts.fetchedAt, checkedAt: data.alerts.checkedAt },
    };
    const selector = { selectOption: id => page.getByRole('navigation', { name: '主要工具' }).getByRole('button', { name: ({ equipment: '急救', weather: '雨量', basins: '集水區', conditions: '路況' })[id], exact: true }).click() };
    assert.equal(await page.getByRole('navigation', { name: '主要工具' }).getByRole('button', { name: '路況', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('[role="tablist"]').count(), 0);
    assert.equal(await page.locator('.tool-rail').count(), 0);
    assert.equal(await page.getByRole('heading', { name: '步道路況', exact: true }).count(), 1);
    assert.equal(await page.getByRole('heading', { name: '官方警示', exact: true }).count(), 1);
    result.checks.singlePageTopNavigation = true;
    await screenshot(page, 'conditions-desktop.jpg');
    const initialTrailCards = await page.locator('.trail-condition').count();
    assert.ok(initialTrailCards <= 40);
    if (data.trails.items.length > 40) {
      await page.getByRole('button', { name: '載入更多路況', exact: true }).click();
      result.checks.trailPagination = { initial: initialTrailCards, afterMore: await page.locator('.trail-condition').count() };
      assert.ok(result.checks.trailPagination.afterMore > initialTrailCards);
    }

    await page.locator('.conditions-source-summary > summary').click();
    result.checks.sourceTimesVisible = await page.locator('.conditions-source-times').count() === 2;
    await page.locator('.conditions-source-summary > summary').click();
    if (data.trails.items.length) {
      const item = data.trails.items[0];
      const search = page.getByRole('textbox', { name: '搜尋步道、縣市或警示內容', exact: true });
      await search.fill(item.name);
      await page.locator('.trail-condition .condition-card-toggle').first().click();
      await page.locator('.trail-condition .condition-expanded').first().waitFor();
      assert.match(new URL(page.url()).search, /layer=conditions/);
      result.checks.trailSearchAndOriginal = {
        query: item.name,
        cards: await page.locator('.trail-condition').count(),
        originalVisible: await page.locator('.trail-condition .condition-original').first().isVisible(),
      };
      await search.fill('');
    } else result.checks.trailSearchAndOriginal = 'Not exercised: official source has no readable trail items.';

    await page.locator('.conditions-jump').getByRole('button', { name: /官方警示/ }).click();
    result.checks.samePageAlertJump = { pathname: new URL(page.url()).pathname, panelScrollTop: await page.locator('.panel-content').evaluate(node => node.scrollTop) };
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await conditionsReady(page);
    result.checks.mobile = await page.evaluate(() => ({
      width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth,
      selectorHeight: document.querySelector('.header-nav button')?.getBoundingClientRect().height,
      jumpButtons: [...document.querySelectorAll('.conditions-jump button')].map(node => ({ text: node.textContent, height: node.getBoundingClientRect().height })),
    }));
    assert.equal(result.checks.mobile.width, 390);
    assert.equal(result.checks.mobile.documentWidth, 390);
    assert.ok(result.checks.mobile.selectorHeight >= 44);
    assert.ok(result.checks.mobile.jumpButtons.every(button => button.height >= 44));
    await screenshot(page, 'conditions-mobile.jpg');
    if (data.alerts.items.length) {
      await page.locator('.conditions-jump').getByRole('button', { name: /官方警示/ }).click();
      const card = page.locator('.official-alert').first();
      await card.locator('.condition-card-toggle').click();
      await card.locator('.condition-expanded').waitFor();
      const id = await card.getAttribute('data-condition-id');
      const item = data.alerts.items.find(item => item.id === id);
      assert.ok(item);
      assert.equal(await card.locator('.condition-original').first().textContent(), item.description);
      const areas = await card.locator('.condition-area').innerText();
      assert.ok(item.areas.every(area => areas.includes(area)));
      assert.equal(await card.locator('.condition-times > div').count(), 3);
      result.checks.officialAlertDetails = { publisher: item.publisher, areas: item.areas.length, originalCharacters: item.description.length, issuedAt: item.issuedAt, effectiveAt: item.effectiveAt, expiresAt: item.expiresAt, completeOriginalVerified: true };
      await screenshot(page, 'conditions-mobile-alert-expanded.jpg');
    } else result.checks.officialAlertDetails = 'Not exercised: official source has no current readable warnings.';

    const failureContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const failurePage = await failureContext.newPage();
    await failurePage.route('**/api/conditions', route => route.abort('failed'));
    await failurePage.goto(`${base}/?layer=conditions`, { waitUntil: 'domcontentloaded' });
    await failurePage.locator('.conditions-notice[role="alert"]').waitFor();
    result.checks.sourceFailure = {
      states: await failurePage.locator('.conditions-source-summary > summary').innerText(),
      message: await failurePage.locator('.conditions-notice[role="alert"]').innerText(),
      cards: await failurePage.locator('.condition-card').count(),
      sectionCounts: await failurePage.locator('.conditions-section-heading p').allTextContents(),
    };
    assert.equal(result.checks.sourceFailure.cards, 0);
    assert.ok(result.checks.sourceFailure.sectionCounts.every(value => value.includes('資料未就緒')));
    await screenshot(failurePage, 'conditions-source-failure-mobile.jpg');
    await failureContext.close();

    await selector.selectOption('equipment');
    await page.waitForFunction(() => /[\d,]+ 筆/.test(document.querySelector('.overview-count')?.textContent || ''));
    const syncResponse = await page.request.get(`${base}/api/equipment/sync-status`);
    const sync = await syncResponse.json();
    result.checks.equipment = { count: await page.locator('.overview-count').innerText(), cards: await page.locator('.equipment-card').count(), syncState: sync.state, fetchedAt: sync.fetchedAt, syncNote: await page.locator('.equipment-sync-note').innerText() };
    assert.ok(result.checks.equipment.cards > 0 && result.checks.equipment.cards <= 40);
    const beforeRoute = Number(result.checks.equipment.count.replace(/\D/g, ''));
    const gpx = '<?xml version="1.0"?><gpx version="1.1" creator="mt_info QA" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>QA 雪山測試線</name><trkseg><trkpt lat="24.38" lon="121.29"/><trkpt lat="24.39" lon="121.30"/></trkseg></trk></gpx>';
    await page.locator('input[type="file"]').setInputFiles({ name: 'qa-route.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(gpx) });
    await page.locator('.local-route-panel').waitFor();
    await page.waitForTimeout(700); // Let the known camera transition settle for the route screenshot.
    const nearRoute = Number((await page.locator('.overview-count').innerText()).replace(/\D/g, ''));
    assert.ok(nearRoute < beforeRoute);
    assert.equal(mutations.length, 0);
    result.checks.gpx = { beforeRoute, nearRoute, panel: await page.locator('.local-route-panel').innerText(), mutations: [...mutations] };
    await screenshot(page, 'conditions-gpx-smoke.jpg');
    await page.getByRole('button', { name: '移除路線', exact: true }).click();
    await page.locator('.local-route-panel').waitFor({ state: 'detached' });
    assert.equal(Number((await page.locator('.overview-count').innerText()).replace(/\D/g, '')), beforeRoute);
    result.checks.gpx.removedRestoresCount = true;
    await selector.selectOption('weather');
    await page.locator('.rain-map-canvas').waitFor();
    try { await page.getByText('圖面已載入', { exact: true }).waitFor({ timeout: 20000 }); }
    catch { /* An external image outage is recorded as a source state, never as zero rain. */ }
    result.checks.rain = await page.evaluate(() => ({ state: document.querySelector('.rain-image-state')?.textContent, image: [...document.images].map(node => ({ src: node.currentSrc, width: node.naturalWidth, complete: node.complete })) }));
    await screenshot(page, 'conditions-rain-regression.jpg');
    result.checks.rain.layout = await page.locator('.rain-image-viewport').evaluate(node => ({ height: node.clientHeight, scrollHeight: node.scrollHeight, imageHeight: node.querySelector('img')?.getBoundingClientRect().height }));
    await page.getByRole('button', { name: '雨量站與短時資料', exact: true }).click();
    result.checks.noMountainForecast = await page.getByRole('button', { name: '登山預報', exact: true }).count() === 0;
    assert.ok(result.checks.noMountainForecast);
    assert.deepEqual(result.errors, []);
    await context.close();
  } finally {
    await browser.close();
    await fs.writeFile(path.join(output, 'conditions-qa-result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  }
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
