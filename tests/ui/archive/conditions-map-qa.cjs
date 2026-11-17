/* Historical UI coverage for the conditions map, replaced by the dashboard on 2026-10-22.
 * Kept for prior design traceability; use ../conditions-dashboard-qa.cjs for current UI. */
/* Local browser QA only; no application test API or network data mutations. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const base = process.env.MT_INFO_QA_URL || 'http://127.0.0.1:5173';
const output = path.resolve('artifacts');
const result = { base, checks: {}, screenshots: [], pageErrors: [], consoleErrors: [] };

async function observeMap(page) {
  // Observe the existing component's ref. This lives only in this browser context.
  await page.locator('.map-canvas').evaluate(node => {
    const key = Object.keys(node).find(value => value.startsWith('__reactFiber'));
    for (let fiber = node[key]; fiber; fiber = fiber.return) {
      for (let hook = fiber.memoizedState, count = 0; hook && count < 100; hook = hook.next, count++) {
        const candidate = hook.memoizedState?.current;
        if (candidate?.getSource && candidate?.getCenter && candidate?.getCanvas) {
          window.__mtConditionsQaMap = candidate;
          return;
        }
      }
    }
    throw new Error('Cannot observe the existing MapLibre component ref');
  });
}
async function settle(page) {
  await page.waitForFunction(() => {
    const m = window.__mtConditionsQaMap;
    return m && !m.isMoving() && m.getSource('conditions-routes') && m.isSourceLoaded('conditions-routes');
  }, null, { timeout: 25000 });
  await page.waitForTimeout(150);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function ready(page) {
  await page.locator('.conditions-panel').waitFor();
  await page.waitForFunction(() => {
    const summary = document.querySelector('.conditions-source-summary > summary');
    return summary && !summary.textContent.includes('載入中');
  }, null, { timeout: 25000 });
  await page.locator('.map-state').filter({ hasText: '正在載入地圖…' }).waitFor({ state: 'hidden', timeout: 25000 });
  await observeMap(page);
  await settle(page);
}
async function screenshot(page, filename) {
  await settle(page);
  await page.screenshot({ path: path.join(output, filename), type: 'jpeg', quality: 88 });
  result.screenshots.push(filename);
}
async function snapshot(page) {
  return page.evaluate(() => {
    const m = window.__mtConditionsQaMap;
    const padding = m.getPadding(), box = m.getContainer().getBoundingClientRect();
    const features = m.queryRenderedFeatures([[padding.left || 0, padding.top || 0], [box.width - (padding.right || 0), box.height - (padding.bottom || 0)]], { layers: ['conditions-route-line'] });
    const visibleCards = [...document.querySelectorAll('.trail-condition')].filter(node => node.checkVisibility());
    return {
      center: m.getCenter(), zoom: m.getZoom(), padding, mapBox: { x: box.x, y: box.y, width: box.width, height: box.height },
      summary: document.querySelector('.conditions-view-count')?.textContent,
      selected: document.querySelector('.condition-card.is-selected')?.getAttribute('data-condition-id') || null,
      visibleCards: visibleCards.map(node => node.getAttribute('data-condition-id')),
      routeSourceFeatures: m.getSource('conditions-routes').serialize().data.features.length,
      renderedRouteIds: [...new Set(features.map(feature => feature.properties.id))],
      unlocatedToggle: document.querySelector('.conditions-unlocated > button')?.textContent,
      documentWidth: document.documentElement.scrollWidth,
      horizontalViewport: innerWidth,
    };
  });
}
function exactCard(page, id) { return page.locator(`.trail-condition[data-condition-id="${id}"]`); }
async function selectLocation(page, id) {
  await exactCard(page, id).getByRole('button', { name: '查看位置', exact: true }).click();
  await settle(page);
  await page.waitForFunction(id => document.querySelector(`.trail-condition[data-condition-id="${id}"] .condition-card-toggle`)?.getAttribute('aria-expanded') === 'true', id);
}
async function clickRenderedRoute(page, id) {
  const point = await page.evaluate(id => {
    const m = window.__mtConditionsQaMap, padding = m.getPadding();
    const box = m.getContainer().getBoundingClientRect();
    const features = m.queryRenderedFeatures(undefined, { layers: ['conditions-route-line'] }).filter(feature => feature.properties.id === id);
    const candidates = features.flatMap(feature => feature.geometry.type === 'LineString' ? feature.geometry.coordinates : feature.geometry.coordinates.flat())
      .map(coordinates => m.project(coordinates))
      .filter(p => p.x > Math.max(35, (padding.left || 0) + 10) && p.x < box.width - Math.max(65, (padding.right || 0) + 10) && p.y > Math.max(140, (padding.top || 0) + 15) && p.y < box.height - Math.max(25, (padding.bottom || 0) + 15))
      .sort((a, b) => Math.hypot(a.x - box.width / 2, a.y - ((padding.top || 0) + box.height - (padding.bottom || 0)) / 2) - Math.hypot(b.x - box.width / 2, b.y - ((padding.top || 0) + box.height - (padding.bottom || 0)) / 2));
    return candidates.length ? { x: box.x + candidates[0].x, y: box.y + candidates[0].y } : null;
  }, id);
  assert.ok(point, 'Expected a rendered route inside the unobscured map');
  await page.mouse.click(point.x, point.y);
  await settle(page);
}
async function panTo(page, center) {
  // A normal public camera operation fires the same moveend callback as panning.
  await page.evaluate(center => window.__mtConditionsQaMap.jumpTo({ center, zoom: 12 }), center);
  await settle(page);
}
function monitor(page) {
  page.on('pageerror', error => result.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') result.consoleErrors.push(message.text()); });
}

async function controlledScenarios(browser) {
  const requestContext = await browser.newContext();
  const live = await (await requestContext.request.get(`${base}/api/conditions`)).json();
  await requestContext.close();
  const first = live.trails.items.find(item => item.location?.kind === 'route');
  assert.ok(first, 'Controlled overlap needs an actual official reference route');
  const equipmentRequests = [];
  async function createPage(fixture) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage(); monitor(page);
    page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/equipment')) equipmentRequests.push(request.url()); });
    if (fixture) await page.route('**/api/conditions', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) }));
    return { context, page };
  }

  const duplicate = structuredClone(live);
  const synthetic = { ...structuredClone(first), id: 'qa:synthetic:overlap-only', name: `【測試合成公告】${first.name}／第二則`, headline: '僅供本機 QA 的重疊公告，非官方訊息', description: '僅供本機 QA，這不是官方公告。', source: { ...first.source, name: '測試合成公告，非官方來源' } };
  duplicate.trails.items.push(synthetic);
  const overlap = await createPage(duplicate);
  try {
    await overlap.page.goto(`${base}/?layer=conditions`, { waitUntil: 'domcontentloaded' });
    await ready(overlap.page);
    await selectLocation(overlap.page, first.id);
    const firstToggle = exactCard(overlap.page, first.id).locator('.condition-card-toggle');
    await firstToggle.click();
    assert.equal(await firstToggle.getAttribute('aria-expanded'), 'false');
    await clickRenderedRoute(overlap.page, first.id);
    const choices = overlap.page.getByRole('group', { name: '此處有多則公告，請選擇', exact: true });
    await choices.waitFor();
    assert.equal(await firstToggle.getAttribute('aria-expanded'), 'false', 'A multiple hit must not silently expand the first record');
    assert.equal(await choices.getByRole('button').count(), 2);
    await choices.getByRole('button', { name: synthetic.name, exact: true }).click();
    await exactCard(overlap.page, synthetic.id).locator('.condition-expanded').waitFor();
    assert.ok(await exactCard(overlap.page, synthetic.id).evaluate(node => node.classList.contains('is-selected')));
    result.checks.controlledOverlap = { candidates: 2, noAutomaticFirstSelection: true, secondSelectedId: synthetic.id, syntheticExplicitlyLabelled: true };
    await screenshot(overlap.page, 'conditions-map-controlled-overlap.jpg');
  } finally { await overlap.context.close(); }

  const old = structuredClone(live), oldTime = new Date(Date.now() - 61 * 60_000).toISOString();
  for (const feed of [old.trails, old.alerts]) { feed.status = 'ready'; feed.checkedAt = oldTime; }
  const stale = await createPage(old);
  try {
    await stale.page.goto(`${base}/?layer=conditions`, { waitUntil: 'domcontentloaded' });
    await ready(stale.page);
    const badges = await stale.page.locator('.conditions-source-summary > summary .conditions-state').allTextContents();
    assert.ok(badges.every(value => value.includes('資料過期／先前資料')));
    assert.ok(await exactCard(stale.page, first.id).count());
    assert.equal(await stale.page.locator('.official-alert').count(), live.alerts.items.length);
    result.checks.controlledOldReady = { checkedAt: oldTime, badges, retainedLocated: (await snapshot(stale.page)).visibleCards.length, retainedAlerts: await stale.page.locator('.official-alert').count(), capExpiresUnchanged: old.alerts.items.every((item, index) => item.expiresAt === live.alerts.items[index].expiresAt) };
    await screenshot(stale.page, 'conditions-map-controlled-stale.jpg');
  } finally { await stale.context.close(); }

  const empty = structuredClone(old);
  for (const feed of [empty.trails, empty.alerts]) { feed.status = 'empty'; feed.items = []; }
  const staleEmpty = await createPage(empty);
  try {
    await staleEmpty.page.goto(`${base}/?layer=conditions`, { waitUntil: 'domcontentloaded' });
    await ready(staleEmpty.page);
    const badges = await staleEmpty.page.locator('.conditions-source-summary > summary .conditions-state').allTextContents();
    assert.ok(badges.every(value => value.includes('資料過期／先前資料')));
    assert.equal(await staleEmpty.page.locator('.condition-card').count(), 0);
    result.checks.controlledOldEmpty = { badges, stillReadableEmptySnapshot: !(await staleEmpty.page.locator('.conditions-view-count').innerText()).includes('資料未就緒') };
    assert.ok(result.checks.controlledOldEmpty.stillReadableEmptySnapshot);
  } finally { await staleEmpty.context.close(); }

  const fresh = structuredClone(live), now = new Date();
  for (const feed of [fresh.trails, fresh.alerts]) { feed.status = 'ready'; feed.checkedAt = now.toISOString(); }
  const offline = await createPage(fresh);
  try {
    await offline.page.clock.install({ time: now });
    await offline.page.goto(`${base}/?layer=conditions`, { waitUntil: 'domcontentloaded' });
    await ready(offline.page);
    const before = await offline.page.locator('.conditions-source-summary > summary .conditions-state').allTextContents();
    assert.ok(before.every(value => value.includes('已取得')));
    await offline.context.setOffline(true);
    await offline.page.clock.fastForward('01:01:00');
    await offline.page.waitForFunction(() => [...document.querySelectorAll('.conditions-source-summary > summary .conditions-state')].every(node => node.textContent.includes('資料過期／先前資料')));
    const after = await offline.page.locator('.conditions-source-summary > summary .conditions-state').allTextContents();
    assert.ok(await exactCard(offline.page, first.id).count());
    result.checks.controlledOfflineAge = { advancedMinutes: 61, before, after, originalTrailRetained: true };
  } finally { await offline.context.close(); }

  const failure = await createPage(null);
  try {
    await failure.page.route('**/api/conditions', route => route.abort('failed'));
    await failure.page.goto(`${base}/?layer=conditions`, { waitUntil: 'domcontentloaded' });
    await failure.page.locator('.conditions-notice[role="alert"]').waitFor();
    const count = await failure.page.locator('.conditions-view-count').innerText();
    const sectionCounts = await failure.page.locator('.conditions-section-heading p').allTextContents();
    assert.ok(count.includes('資料未就緒'));
    assert.ok(sectionCounts.every(value => value.includes('資料未就緒')));
    assert.equal(await failure.page.locator('.condition-card').count(), 0);
    result.checks.controlledApiFailure = { count, sectionCounts, successfulZeroNotImplied: true };
  } finally { await failure.context.close(); }
  result.checks.conditionsOnlyEquipmentRequests = equipmentRequests;
  assert.deepEqual(equipmentRequests, []);
}

async function productionSmoke(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); monitor(page);
  const equipmentRequests = [];
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/equipment')) equipmentRequests.push(request.url()); });
  try {
    await page.goto(`${base}/?layer=conditions`, { waitUntil: 'domcontentloaded' });
    await ready(page);
    const data = await (await page.request.get(`${base}/api/conditions`)).json();
    const located = data.trails.items.filter(item => item.location);
    const unknown = data.trails.items.filter(item => !item.location && (item.latitude === null || item.longitude === null));
    const first = located[0];
    assert.ok(first);
    result.checks.productionOverview = await snapshot(page);
    assert.equal(result.checks.productionOverview.routeSourceFeatures, located.length);
    assert.equal(result.checks.productionOverview.renderedRouteIds.length, located.length);
    assert.equal(result.checks.productionOverview.documentWidth, 390);
    assert.deepEqual(equipmentRequests, []);
    result.checks.conditionsOnlyEquipmentRequests = [...equipmentRequests];
    await screenshot(page, 'production-map-mobile-overview.jpg');
    await selectLocation(page, first.id);
    const toggle = exactCard(page, first.id).locator('.condition-card-toggle');
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    await clickRenderedRoute(page, first.id);
    await page.waitForFunction(id => document.querySelector(`.trail-condition[data-condition-id="${id}"] .condition-card-toggle`)?.getAttribute('aria-expanded') === 'true', first.id);
    result.checks.productionRouteReselect = { expanded: true, ...(await snapshot(page)) };
    await screenshot(page, 'production-map-mobile-selected.jpg');
    assert.match(await page.locator('.conditions-unlocated > button').innerText(), new RegExp(String(unknown.length)));
    await page.locator('.conditions-unlocated > button').click();
    if (unknown.length) {
      await exactCard(page, unknown[0].id).locator('.condition-card-toggle').click();
      assert.equal(await exactCard(page, unknown[0].id).locator('.condition-original').innerText(), unknown[0].description);
    }
    result.checks.productionUnknown = { retained: unknown.length, originalReadable: true };
    if (data.alerts.items.length) {
      await page.locator('.conditions-jump').getByRole('button', { name: /官方警示/ }).click();
      const card = page.locator('.official-alert').first();
      await card.locator('.condition-card-toggle').click();
      const id = await card.getAttribute('data-condition-id');
      const item = data.alerts.items.find(item => item.id === id);
      assert.equal(await card.locator('.condition-original').first().innerText(), item.description);
      assert.equal(await card.locator('.condition-times > div').count(), 3);
      result.checks.productionCap = { retained: data.alerts.items.length, completeOriginalReadable: true, timeFields: 3 };
    }
    const selector = { selectOption: id => page.getByRole('navigation', { name: '主要工具' }).getByRole('button', { name: ({ equipment: '急救', weather: '雨量', basins: '集水區', conditions: '路況' })[id], exact: true }).click() };
    await selector.selectOption('equipment');
    await page.waitForFunction(() => /[\d,]+ 筆/.test(document.querySelector('.overview-count')?.textContent || ''));
    result.checks.productionEquipment = { count: await page.locator('.overview-count').innerText(), firstBatch: await page.locator('.equipment-card').count(), requestedOnLayerEntry: equipmentRequests.length > 0 };
    assert.ok(result.checks.productionEquipment.firstBatch > 0 && result.checks.productionEquipment.firstBatch <= 40);
    assert.ok(result.checks.productionEquipment.requestedOnLayerEntry);
    await selector.selectOption('weather');
    await page.getByText('圖面已載入', { exact: true }).waitFor({ timeout: 25000 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    result.checks.productionRain = await page.locator('.rain-image-viewport').evaluate(node => {
      const img = node.querySelector('img'), imageRect = img.getBoundingClientRect();
      return { state: document.querySelector('.rain-image-state')?.textContent, image: img.currentSrc, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, imageWidth: imageRect.width, imageHeight: imageRect.height, viewportWidth: node.clientWidth, viewportHeight: node.clientHeight, completeOfficialImagePreservesLegend: imageRect.width <= node.clientWidth && imageRect.height <= node.clientHeight };
    });
    assert.ok(result.checks.productionRain.naturalWidth > 0);
    assert.ok(result.checks.productionRain.completeOfficialImagePreservesLegend);
    await page.screenshot({ path: path.join(output, 'production-map-mobile-rain.jpg'), type: 'jpeg', quality: 88 });
    result.screenshots.push('production-map-mobile-rain.jpg');
    assert.deepEqual(result.pageErrors, []);
  } finally { await context.close(); }
}

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.MT_INFO_QA_BROWSER_CHANNEL || 'chrome', headless: true });
  let page;
  try {
    if (process.argv.includes('--production-smoke')) {
      await productionSmoke(browser);
      return;
    }
    if (process.argv.includes('--controlled')) {
      await controlledScenarios(browser);
      assert.deepEqual(result.pageErrors, []);
      return;
    }
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    page = await context.newPage(); monitor(page);
    await page.goto(`${base}/?layer=conditions`, { waitUntil: 'domcontentloaded' });
    await ready(page);
    const data = await (await page.request.get(`${base}/api/conditions`)).json();
    const located = data.trails.items.filter(item => item.location);
    const unknown = data.trails.items.filter(item => !item.location && (item.latitude === null || item.longitude === null));
    assert.ok(located.length >= 1, 'This live QA requires an officially located trail');
    const selected = located.find(item => item.name === '南澳古道') || located[0];
    result.checks.sources = { trails: data.trails.status, alerts: data.alerts.status, located: located.map(item => ({ id: item.id, name: item.name, geometry: item.location.geometry.type })), unlocatedTrails: unknown.length };
    result.checks.desktopOverview = await snapshot(page);
    assert.equal(result.checks.desktopOverview.routeSourceFeatures, located.length);
    assert.ok(result.checks.desktopOverview.renderedRouteIds.length > 0);
    assert.equal(await page.locator('.conditions-unlocated > button').getAttribute('aria-expanded'), 'false');
    await screenshot(page, 'conditions-map-desktop.jpg');

    await selectLocation(page, selected.id);
    result.checks.cardFocus = await snapshot(page);
    assert.equal(result.checks.cardFocus.selected, selected.id);
    assert.ok(result.checks.cardFocus.zoom > result.checks.desktopOverview.zoom);
    assert.ok(result.checks.cardFocus.renderedRouteIds.includes(selected.id));
    await screenshot(page, 'conditions-map-desktop-selected.jpg');
    const toggle = exactCard(page, selected.id).locator('.condition-card-toggle');
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    await clickRenderedRoute(page, selected.id);
    await page.waitForFunction(id => document.querySelector(`.trail-condition[data-condition-id="${id}"] .condition-card-toggle`)?.getAttribute('aria-expanded') === 'true', selected.id);
    result.checks.sameRouteReselectExpands = true;

    await panTo(page, [121.56, 25.04]);
    result.checks.panAway = await snapshot(page);
    assert.ok(await page.locator('.conditions-selection-note').isVisible());
    assert.ok(result.checks.panAway.visibleCards.includes(selected.id));
    assert.match(result.checks.panAway.unlocatedToggle, new RegExp(String(unknown.length)));
    await page.getByRole('button', { name: '清除公告選取', exact: true }).click();
    result.checks.emptyViewport = await snapshot(page);
    assert.equal(result.checks.emptyViewport.visibleCards.length, 0);
    assert.match(result.checks.emptyViewport.summary, /0 條有公告步道/);
    assert.match(result.checks.emptyViewport.unlocatedToggle, new RegExp(String(unknown.length)));
    await screenshot(page, 'conditions-map-empty-viewport.jpg');
    await page.getByRole('button', { name: '全部公告', exact: true }).click();
    assert.equal((await snapshot(page)).visibleCards.length, located.length);
    assert.equal(await page.getByRole('button', { name: '全部公告', exact: true }).getAttribute('aria-pressed'), 'true');
    result.checks.allAnnouncementsRestoresLocated = true;
    await page.getByRole('button', { name: '隨地圖更新', exact: true }).click();
    await page.locator('.conditions-unlocated > button').click();
    if (unknown.length) {
      const before = (await snapshot(page)).center;
      await exactCard(page, unknown[0].id).locator('.condition-card-toggle').click();
      const after = (await snapshot(page)).center;
      assert.deepEqual(after, before);
      assert.ok(await exactCard(page, unknown[0].id).locator('.condition-original').isVisible());
      result.checks.unlocatedCanReadWithoutMovingCamera = true;
      await screenshot(page, 'conditions-map-unlocated.jpg');
    }

    const mobile = await context.newPage(); monitor(mobile); page = mobile;
    await mobile.setViewportSize({ width: 390, height: 844 });
    await mobile.goto(`${base}/?layer=conditions`, { waitUntil: 'domcontentloaded' });
    await ready(mobile);
    result.checks.mobileOverview = await snapshot(mobile);
    assert.equal(result.checks.mobileOverview.documentWidth, 390);
    await screenshot(mobile, 'conditions-map-mobile.jpg');
    await selectLocation(mobile, selected.id);
    result.checks.mobileFocus = await snapshot(mobile);
    assert.ok(result.checks.mobileFocus.renderedRouteIds.includes(selected.id));
    assert.ok(await exactCard(mobile, selected.id).locator('.condition-original').isVisible());
    await screenshot(mobile, 'conditions-map-mobile-selected.jpg');
    result.checks.mobileTargets = await mobile.evaluate(() => [...document.querySelectorAll('.conditions-viewbar button,.condition-focus,.conditions-unlocated > button')].filter(node => node.checkVisibility()).map(node => ({ text: node.textContent, height: node.getBoundingClientRect().height })));
    assert.ok(result.checks.mobileTargets.every(button => button.height >= 44));
    await mobile.locator('.mobile-view-toggle').click();
    await settle(mobile);
    result.checks.mobileCollapsed = await snapshot(mobile);
    await screenshot(mobile, 'conditions-map-mobile-collapsed.jpg');
    await mobile.locator('.mobile-view-toggle').click();
    await settle(mobile);
    const mobileToggle = exactCard(mobile, selected.id).locator('.condition-card-toggle');
    await mobileToggle.click();
    await clickRenderedRoute(mobile, selected.id);
    await mobile.waitForFunction(id => document.querySelector(`.trail-condition[data-condition-id="${id}"] .condition-card-toggle`)?.getAttribute('aria-expanded') === 'true', selected.id);
    result.checks.mobileSameRouteReselectExpands = true;
    assert.deepEqual(result.pageErrors, []);
    await context.close();
  } catch (error) {
    result.failure = error.stack || error.message;
    if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, 'conditions-map-failure.jpg'), type: 'jpeg', quality: 85 }).catch(() => {});
    throw error;
  } finally {
    await browser.close();
    const reportName = process.argv.includes('--production-smoke') ? 'production-map-smoke.json' : process.argv.includes('--controlled') ? 'conditions-map-controlled-result.json' : 'conditions-map-qa-result.json';
    await fs.writeFile(path.join(output, reportName), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  }
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
