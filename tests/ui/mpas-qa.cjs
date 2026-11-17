/* Browser QA: live official pages in one context; fault pages are explicit local fixtures. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const base = process.env.MT_INFO_QA_URL || 'http://127.0.0.1:5173';
const official = 'https://watch.ncdr.nat.gov.tw/watch_mpas2weeks';
const entry = `${base}/?layer=weather&rain=ncdr-mpas`;
const output = path.resolve('artifacts/mpas-qa');
const controlledOnly = process.argv.includes('--controlled');
const liveOnly = process.argv.includes('--live');
const result = { base, entry, checkedAt: new Date().toISOString(), checks: {}, screenshots: [], pageErrors: [], consoleErrors: [] };
const fixtureHtml = '<!doctype html><meta charset="utf-8"><title>MPAS 受控測試頁，非氣象資料</title><h1>MPAS 受控測試頁，非氣象資料</h1><p>這不是官方預報。</p>';

function monitor(page, name) {
  page.on('pageerror', error => result.pageErrors.push({ context: name, message: error.message }));
  page.on('console', message => { if (message.type() === 'error') result.consoleErrors.push({ context: name, message: message.text() }); });
}
async function paint(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(200);
}
async function screenshot(page, filename) {
  await paint(page);
  await page.screenshot({ path: path.join(output, filename), type: 'jpeg', quality: 90 });
  result.screenshots.push(filename);
}
async function viewerReady(page) { await page.locator('.ncdr-mpas-viewer').waitFor({ timeout: 20000 }); }
async function officialFrame(page) {
  const element = await page.locator('.ncdr-mpas-frame').elementHandle();
  const frame = await element.contentFrame();
  await frame.waitForURL(official, { timeout: 40000 });
  return frame;
}
async function verifyTrueImages(page) {
  const frame = await officialFrame(page);
  await frame.waitForFunction(() => {
    const images = [...document.images].filter(node => node.currentSrc.includes('/2F4_'));
    return images.length >= 15 && images.every(node => node.complete && node.naturalWidth > 0);
  }, null, { timeout: 40000 });
  return frame.evaluate(() => ({
    url: location.href,
    modelRunUtcInput: document.querySelector('#wrfinitid')?.value,
    documentWidth: document.documentElement.scrollWidth,
    images: [...document.images].filter(node => node.currentSrc.includes('/2F4_')).map(node => ({ src: node.currentSrc, width: node.naturalWidth, height: node.naturalHeight, complete: node.complete })),
    hasExperimentalText: document.body.innerText.includes('實驗性產品'),
  }));
}
async function layout(page) {
  return page.evaluate(() => ({
    width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth,
    frameCount: document.querySelectorAll('.ncdr-mpas-frame').length,
    sameFrame: document.querySelector('.ncdr-mpas-frame') === window.__qaMpasFrame,
    sizeButtons: [...document.querySelectorAll('.ncdr-mpas-size-controls button')].map(node => ({ text: node.textContent, height: node.getBoundingClientRect().height, pressed: node.getAttribute('aria-pressed') })),
    actionTargets: [...document.querySelectorAll('.ncdr-mpas-actions > *')].map(node => ({ text: node.textContent, height: node.getBoundingClientRect().height })),
    headerMenu: [...document.querySelectorAll('.header-nav button')].map(node => ({ text: node.textContent, height: node.getBoundingClientRect().height })),
    status: [...document.querySelectorAll('.ncdr-mpas-status')].map(node => node.textContent),
    frameStyle: document.querySelector('.ncdr-mpas-frame')?.getAttribute('style'),
  }));
}
function assertLinks(page) {
  return page.locator('.ncdr-mpas-viewer').getByRole('link', { name: '開啟 NCDR 原站', exact: true }).getAttribute('href').then(href => assert.equal(href, official));
}
async function liveChecks(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(); monitor(page, 'live');
  let navigations = 0;
  page.on('request', request => { if (request.resourceType() === 'document' && request.url() === official) navigations++; });
  try {
    await page.goto(entry, { waitUntil: 'domcontentloaded' });
    await viewerReady(page);
    const catalog = await (await page.request.get(`${base}/api/rain-maps`)).json();
    const mpas = catalog.products.find(product => product.id === 'ncdr-mpas');
    assert.equal(mpas.status, 'available'); assert.equal(mpas.display, 'official-page');
    assert.equal(mpas.pageUrl, official); assert.equal(mpas.timeStatus, 'on-page'); assert.deepEqual(mpas.frames, []);
    assert.equal(catalog.products.find(product => product.id === 'cwa-qpf-6h').frames.length, 8);
    assert.equal(catalog.products.find(product => product.id === 'cwa-qpf-12h').frames.length, 4);
    result.checks.catalog = { mpas, cwa6Frames: 8, cwa12Frames: 4 };
    result.checks.trueOfficialImages = await verifyTrueImages(page);
    await page.locator('.ncdr-mpas-frame').evaluate(node => { window.__qaMpasFrame = node; });
    const initialNavigations = navigations;
    for (const size of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 360, height: 640 }]) {
      await page.setViewportSize(size); await paint(page);
      await page.locator('.ncdr-mpas-size-controls').getByRole('button', { name: '原始大小', exact: true }).click();
      const original = await layout(page);
      assert.equal(original.documentWidth, size.width); assert.equal(original.frameCount, 1); assert.ok(original.sameFrame);
      assert.ok(original.actionTargets.every(button => button.height >= 44));
      assert.ok(original.sizeButtons.every(button => button.height >= 44));
      assert.ok(original.headerMenu.every(button => button.height >= 44));
      await assertLinks(page);
      await screenshot(page, `integrated-${size.width}-original.jpg`);
      await page.locator('.ncdr-mpas-size-controls').getByRole('button', { name: '符合寬度（概覽）', exact: true }).click();
      const fit = await layout(page);
      assert.equal(fit.documentWidth, size.width); assert.ok(fit.sameFrame); assert.equal(fit.frameCount, 1);
      assert.equal(navigations, initialNavigations, 'Display-size changes must not reload the official page');
      await page.locator('.ncdr-mpas-status').first().scrollIntoViewIfNeeded();
      await screenshot(page, `integrated-${size.width}-fit.jpg`);
      result.checks[`layout${size.width}`] = { original, fit, officialNavigations: navigations };
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const canvas = page.locator('.rain-map-canvas');
    await page.locator('.rain-canvas-products').getByRole('button', { name: '每 6 小時', exact: true }).click();
    assert.equal(await page.locator('.ncdr-mpas-frame').count(), 0);
    await page.getByText('圖面已載入', { exact: true }).waitFor({ timeout: 25000 });
    const before = await page.locator('.rain-canvas-playback > span').innerText();
    await canvas.getByRole('button', { name: '播放時段', exact: true }).click();
    await page.waitForFunction(before => document.querySelector('.rain-canvas-playback > span')?.innerText !== before, before, { timeout: 10000 });
    await canvas.getByRole('button', { name: '暫停播放', exact: true }).click();
    result.checks.cwa6 = { before, after: await page.locator('.rain-canvas-playback > span').innerText(), playbackAdvanced: true };
    await page.locator('.rain-canvas-products').getByRole('button', { name: '每 12 小時', exact: true }).click();
    await page.getByText('圖面已載入', { exact: true }).waitFor({ timeout: 25000 });
    result.checks.cwa12 = await page.locator('.rain-image-viewport img').evaluate(node => ({ src: node.currentSrc, width: node.naturalWidth, height: node.naturalHeight }));
    assert.ok(result.checks.cwa12.width > 0);
    const offPageNavigations = navigations;
    const menu = page.getByRole('navigation', { name: '主要工具', exact: true });
    await menu.getByRole('button', { name: '路況', exact: true }).click();
    await page.locator('.conditions-panel').waitFor();
    assert.equal(await page.locator('.ncdr-mpas-frame').count(), 0);
    await page.waitForTimeout(2000);
    assert.equal(navigations, offPageNavigations);
    await menu.getByRole('button', { name: '雨量', exact: true }).click();
    await page.locator('.rain-canvas-products').getByRole('button', { name: 'MPAS 雙週', exact: true }).click();
    await viewerReady(page);
    result.checks.returnToMpas = await verifyTrueImages(page);
    assert.equal(await page.locator('.ncdr-mpas-frame').count(), 1);
    assert.equal(navigations, initialNavigations + 1);
    await page.locator('.ncdr-mpas-frame').evaluate(node => { window.__qaMpasFrame = node; });
    await context.setOffline(true);
    await page.getByText('目前離線；保留已開啟頁面，無法確認更新狀態。', { exact: true }).waitFor();
    result.checks.offlineAfterLiveLoad = await layout(page);
    assert.ok(result.checks.offlineAfterLiveLoad.sameFrame);
    assert.equal(result.checks.offlineAfterLiveLoad.frameCount, 1);
    assert.equal(navigations, initialNavigations + 1);
    await screenshot(page, 'integrated-offline-retained.jpg');
    result.checks.realOfficialNavigations = navigations;
  } finally { await context.close(); }
}
async function controlledChecks(browser) {
  const requestContext = await browser.newContext();
  const catalog = await (await requestContext.request.get(`${base}/api/rain-maps`)).json();
  await requestContext.close();
  async function setup(name, handler, initialOffline = false, clock = false) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    if (initialOffline) await context.addInitScript(() => Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => false }));
    const page = await context.newPage(); monitor(page, name);
    if (clock) await page.clock.install();
    await page.route('**/api/rain-maps', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(catalog) }));
    await page.route(official, handler);
    await page.goto(entry, { waitUntil: 'domcontentloaded' });
    await viewerReady(page);
    return { context, page };
  }

  let failedRequests = 0;
  const failure = await setup('503 fixture', route => { failedRequests++; return route.fulfill({ status: 503, contentType: 'text/html', body: fixtureHtml }); });
  try {
    await failure.page.locator('.ncdr-mpas-status').filter({ hasText: '官方頁面已開啟' }).waitFor();
    await assertLinks(failure.page);
    const status = await failure.page.locator('.ncdr-mpas-status').allTextContents();
    assert.ok(status.every(text => !/雨量已取得|圖面已載入|資料已取得/.test(text)));
    assert.ok(await failure.page.locator('.ncdr-mpas-actions').getByRole('button', { name: '重新載入', exact: true }).isEnabled());
    assert.ok((await failure.page.locator('.ncdr-mpas-limitation').innerText()).includes('無法確認'));
    // The old frame can still display "opened" until React replaces it; await the actual retry.
    const retriedResponse = failure.page.waitForResponse(response => response.url() === official);
    await failure.page.locator('.ncdr-mpas-actions').getByRole('button', { name: '重新載入', exact: true }).click();
    await retriedResponse;
    await failure.page.waitForFunction(() => document.querySelector('.ncdr-mpas-status')?.textContent.includes('官方頁面已開啟'));
    assert.equal(failedRequests, 2);
    assert.equal(await failure.page.locator('.ncdr-mpas-frame').count(), 1);
    result.checks.controlled503 = { status, requestsAfterExplicitRetry: failedRequests, noRainSuccessClaim: true, limitationAndOfficialLinkRetained: true };
    await screenshot(failure.page, 'controlled-503.jpg');
  } finally { await failure.context.close(); }

  let pendingRoute;
  const delayed = await setup('delayed fixture', route => { pendingRoute = route; }, false, true);
  try {
    await delayed.page.waitForFunction(() => document.querySelector('.ncdr-mpas-frame'));
    await delayed.page.clock.fastForward(17000);
    await delayed.page.getByText('官方頁面載入較久，可重新載入或開啟原站。', { exact: true }).waitFor();
    await assertLinks(delayed.page);
    assert.ok(await delayed.page.locator('.ncdr-mpas-actions').getByRole('button', { name: '重新載入', exact: true }).isEnabled());
    result.checks.controlledDelay = { simulatedSeconds: 17, slowMessage: await delayed.page.locator('.ncdr-mpas-status').innerText(), retainedFrame: await delayed.page.locator('.ncdr-mpas-frame').count() };
    await screenshot(delayed.page, 'controlled-slow.jpg');
    assert.ok(pendingRoute);
    await pendingRoute.fulfill({ status: 200, contentType: 'text/html', body: fixtureHtml });
    await delayed.page.getByText('官方頁面已開啟；請核對原圖時間。', { exact: true }).waitFor();
    result.checks.controlledDelay.eventualLoadNeutral = true;
  } finally { await delayed.context.close(); }

  let offlineNavigations = 0;
  const initialOffline = await setup('first-render offline fixture', route => { offlineNavigations++; return route.fulfill({ status: 200, contentType: 'text/html', body: fixtureHtml }); }, true);
  try {
    await initialOffline.page.getByText('目前離線，連線恢復後才能開啟官方頁面。', { exact: true }).first().waitFor();
    assert.equal(await initialOffline.page.locator('.ncdr-mpas-frame').count(), 0);
    assert.equal(offlineNavigations, 0);
    await assertLinks(initialOffline.page);
    assert.ok(await initialOffline.page.locator('.ncdr-mpas-actions').getByRole('button', { name: '重新載入', exact: true }).isDisabled());
    result.checks.controlledInitialOffline = { method: 'navigator.onLine=false before application mounts; official URL route is mocked', frameCount: 0, officialNavigations: 0, officialLinkRetained: true };
    await screenshot(initialOffline.page, 'controlled-initial-offline.jpg');
  } finally { await initialOffline.context.close(); }
}

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.MT_INFO_QA_BROWSER_CHANNEL || 'chrome', headless: true });
  try {
    if (!controlledOnly) await liveChecks(browser);
    if (!liveOnly) await controlledChecks(browser);
    assert.deepEqual(result.pageErrors, []);
  } catch (error) { result.failure = error.stack || error.message; throw error; }
  finally {
    await browser.close();
    const name = controlledOnly ? 'integrated-controlled-result.json' : liveOnly ? 'integrated-live-result.json' : 'integrated-result.json';
    await fs.writeFile(path.join(output, name), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  }
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
