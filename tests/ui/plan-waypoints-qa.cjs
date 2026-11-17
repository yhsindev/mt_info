/* Isolated Chrome checks; real reference coordinates, controlled raster tiles, no user profile. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const seed = require('../../data/plan-waypoints-daba.json');
const base = process.env.MT_INFO_QA_URL || 'http://127.0.0.1:5173';
const out = path.resolve(process.env.MT_INFO_WAYPOINTS_QA_OUT || 'artifacts/plan-waypoints-qa');
const result = { base, checkedAt: new Date().toISOString(), checks: {}, pageErrors: [], raster: 'Controlled one-pixel tiles; reference geometry and waypoint coordinates are the actual local data.' };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9YGJ3csAAAAASUVORK5CYII=', 'base64');

async function context(browser, viewport) {
  const value = await browser.newContext({ viewport });
  await value.route('https://tile.openstreetmap.org/**', route => route.fulfill({ contentType: 'image/png', body: png }));
  value.on('page', page => page.on('pageerror', error => result.pageErrors.push(error.message)));
  return value;
}
async function openDaba(context) {
  const page = await context.newPage();
  await page.goto(base + '/?plan=1', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-template-id=daba]').getByRole('button', { name: '使用此範本', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '確認取代', exact: true }).click();
  await page.locator('.plan-timeline-leg').first().waitFor();
  return page;
}
async function chooseDay(page, index) {
  await page.getByRole('navigation', { name: '行程日期', exact: true }).getByRole('button').nth(index).click();
}
async function alignWorkspace(page) {
  await page.evaluate(() => {
    const page = document.querySelector('.plan-page'), workspace = document.querySelector('.plan-workspace-root');
    page.scrollTop += workspace.getBoundingClientRect().top - page.getBoundingClientRect().top - 8;
  });
  await page.waitForTimeout(100);
}
async function workspaceLayout(page) {
  return page.evaluate(() => {
    const box = selector => {
      const node = document.querySelector(selector); if (!node) return null;
      const rect = node.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight, overflowY: getComputedStyle(node).overflowY };
    };
    return { viewport: { width: innerWidth, height: innerHeight }, pageWidth: document.documentElement.scrollWidth, workspace: box('.plan-workspace-root'), itinerary: box('.plan-itinerary-pane'), card: box('.plan-route-view'), canvas: box('.plan-route-map canvas'), footer: box('.plan-footer'), secondary: box('.workspace-secondary') };
  });
}
async function waitMarkers(page, expected) {
  await page.waitForFunction(numbers => {
    const actual = [...document.querySelectorAll('.plan-map-marker')].map(node => Number(node.dataset.waypointNumber));
    return JSON.stringify(actual) === JSON.stringify(numbers) && !document.querySelector('.plan-route-map-state');
  }, expected);
}
async function inspect(page, coordinates = []) {
  return page.evaluate(async coordinates => {
    const element = document.querySelector('.plan-route-map');
    let fiber = element?.[Object.keys(element).find(key => key.startsWith('__reactFiber'))], map;
    while (fiber && !map) {
      let hook = fiber.memoizedState;
      while (hook) {
        const current = hook.memoizedState?.current;
        if (current && typeof current.getBounds === 'function' && typeof current.getZoom === 'function') { map = current; break; }
        hook = hook.next;
      }
      fiber = fiber.return;
    }
    if (!map) return { initialized: false, width: element?.clientWidth, height: element?.clientHeight };
    const data = await map.getSource('plan-route')?.getData();
    const lines = data?.features?.flatMap(feature => feature.geometry.coordinates) || [];
    const all = [...lines, ...coordinates], projected = all.map(coordinate => map.project(coordinate));
    const extent = [Math.min(...projected.map(point => point.x)), Math.min(...projected.map(point => point.y)), Math.max(...projected.map(point => point.x)), Math.max(...projected.map(point => point.y))];
    return {
      initialized: true, width: element.clientWidth, height: element.clientHeight, zoom: map.getZoom(),
      bounds: map.getBounds().toArray(), extent, linePointCount: lines.length, allInside: all.every(coordinate => map.getBounds().contains(coordinate)),
      spanFraction: Math.max((extent[2] - extent[0]) / element.clientWidth, (extent[3] - extent[1]) / element.clientHeight),
      wheelZoomEnabled: map.scrollZoom.isEnabled(),
    };
  }, coordinates);
}
function assertFit(metrics) {
  assert.equal(metrics.initialized, true); assert.equal(metrics.allInside, true);
  assert.ok(metrics.spanFraction >= .5 && metrics.spanFraction < .98, `Route and points should fill a useful viewport: ${JSON.stringify(metrics)}`);
  assert.equal(metrics.linePointCount, 131, 'Only the published reference line is drawn; no invented connecting coordinates');
}
const coordinatesFor = names => seed.waypoints.filter(point => names.includes(point.name)).map(point => [point.longitude, point.latitude]);
async function leftNumbers(page) {
  const rows = page.locator('.plan-timeline-leg');
  const selected = page.locator('.plan-timeline-leg.is-selected');
  const previous = await selected.count() ? await selected.getAttribute('data-leg-id') : null;
  const numbers = [];
  for (let index = 0; index < await rows.count(); index++) {
    const row = rows.nth(index), button = row.locator('.timeline-route-button');
    if (await button.getAttribute('aria-pressed') !== 'true') await button.click();
    numbers.push({
      legId: await row.getAttribute('data-leg-id'),
      from: Number(await row.locator('.timeline-route-button > .timeline-waypoint-number').innerText()),
      to: Number(await row.locator('.timeline-arrival .timeline-waypoint-number').innerText()),
    });
  }
  if (previous) {
    const button = page.locator(`.plan-timeline-leg[data-leg-id="${previous}"] .timeline-route-button`);
    if (await button.getAttribute('aria-pressed') !== 'true') await button.click();
  } else await page.locator('.plan-timeline-leg.is-selected .timeline-route-button').click();
  return numbers;
}

(async () => {
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const desktopContext = await context(browser, { width: 1440, height: 900 });
    const desktop = await openDaba(desktopContext);
    const d1Coordinates = coordinatesFor(['觀霧山莊', '馬達拉溪登山口', '九九山莊']);
    const d2Coordinates = coordinatesFor(['九九山莊', '中霸山屋', '中霸坪']);
    await waitMarkers(desktop, [1, 2, 3]);
    await alignWorkspace(desktop);
    const tallDesktop = await workspaceLayout(desktop);
    result.checks.desktopMainWorkspaceHeight = tallDesktop;
    await desktop.screenshot({ path: path.join(out, 'desktop-900-workspace-entry.png') });
    const columns = await desktop.evaluate(() => ({
      itinerary: document.querySelector('.plan-itinerary-pane').getBoundingClientRect().width,
      map: document.querySelector('.plan-route-pane').getBoundingClientRect().width,
      pageWidth: document.documentElement.scrollWidth,
    }));
    const mapFraction = columns.map / (columns.map + columns.itinerary);
    assert.ok(Math.abs(mapFraction - .58) < .02, `The desktop uses the agreed 42/58 itinerary/map split: ${JSON.stringify(columns)}`);
    assert.ok(columns.map > columns.itinerary); assert.ok(columns.pageWidth <= 1440);
    const pointIndex = desktop.locator('details.plan-route-source');
    assert.equal(await pointIndex.locator('summary').innerText(), '路點索引與來源');
    assert.equal(await pointIndex.evaluate(node => node.open), false, 'The duplicate point index starts collapsed');
    assert.equal(await pointIndex.locator('.plan-map-point-key').isVisible(), false);
    assert.ok((await desktop.locator('.plan-route-note').innerText()).includes('當日 3／3 個路點已定位'));
    assert.equal(await desktop.locator('.plan-coverage-note').isVisible(), true, 'Reference line coverage remains visible outside the index');
    assert.equal(await desktop.locator('.plan-timeline-leg.is-selected').count(), 0);
    assert.deepEqual(await desktop.locator('.plan-timeline .timeline-waypoint-number').allTextContents(), ['1', '2', '3'], 'Reading mode shows each continuous route point once');
    assert.deepEqual((await leftNumbers(desktop)).map(point => [point.from, point.to]), [[1, 2], [2, 3]]);
    const d1Fit = await inspect(desktop, d1Coordinates); assertFit(d1Fit);
    await desktop.locator('.plan-workspace-root').scrollIntoViewIfNeeded();
    await desktop.screenshot({ path: path.join(out, 'desktop-day1.png') });
    const canvasHeightBeforePointInfo = (await desktop.locator('.plan-route-map canvas.maplibregl-canvas').boundingBox()).height;
    await desktop.locator('.plan-map-marker[data-waypoint-number="2"]').click();
    assert.equal(await desktop.locator('.plan-timeline-leg.is-selected').getAttribute('data-leg-id'), 'daba-d1-leg2');
    assert.ok((await desktop.locator('.plan-point-source').innerText()).includes('OpenStreetMap'));
    const canvasHeightWithPointInfo = (await desktop.locator('.plan-route-map canvas.maplibregl-canvas').boundingBox()).height;
    assert.ok(Math.abs(canvasHeightWithPointInfo - canvasHeightBeforePointInfo) <= 1, 'Opening point information must not shrink the desktop map');
    await desktop.getByRole('button', { name: '關閉路點資訊', exact: true }).click();
    await desktop.locator('.plan-point-source').waitFor({ state: 'hidden' });
    const canvasHeightAfterClosingPointInfo = (await desktop.locator('.plan-route-map canvas.maplibregl-canvas').boundingBox()).height;
    assert.ok(Math.abs(canvasHeightAfterClosingPointInfo - canvasHeightBeforePointInfo) <= 1, 'Closing point information must preserve the desktop map height');
    result.checks.desktopPointInformationPreservesCanvas = {
      before: canvasHeightBeforePointInfo, open: canvasHeightWithPointInfo, closed: canvasHeightAfterClosingPointInfo,
    };
    result.checks.desktopDay1 = { columns, fit: d1Fit, numberedFromTo: [[1, 2], [2, 3]], markerSelectsLeg: true };

    await chooseDay(desktop, 1); await waitMarkers(desktop, [3, 8, 9]);
    const day2 = await leftNumbers(desktop);
    assert.deepEqual(day2.slice(0, 7).map(point => [point.from, point.to]), [[3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10]]);
    assert.ok(day2.some(point => point.from === 9 && point.to === 8), 'Return visits reuse waypoint numbers');
    assert.equal(await desktop.locator('.plan-map-point-key button').filter({ hasText: '未定位' }).count(), 5);
    assert.equal(await pointIndex.evaluate(node => node.open), false);
    assert.ok((await desktop.locator('.plan-route-note').innerText()).includes('當日 3／8 個路點已定位；未定位點不放上地圖。'));
    const d2Fit = await inspect(desktop, d2Coordinates); assertFit(d2Fit);
    const leftScroll = await desktop.locator('.plan-itinerary-pane').evaluate(node => {
      const before = node.scrollTop, overflowY = getComputedStyle(node).overflowY;
      node.scrollTop = 0; node.scrollTop = 300;
      const moved = node.scrollTop; node.scrollTop = before;
      return { overflowY, moved, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight };
    });
    assert.equal(leftScroll.overflowY, 'auto'); assert.ok(leftScroll.moved > 0 && leftScroll.scrollHeight > leftScroll.clientHeight);
    result.checks.leftItineraryStillScrolls = leftScroll;
    await desktop.locator('.plan-map-marker[data-waypoint-number="8"]').click();
    assert.equal(await desktop.locator('.plan-timeline-leg.is-selected').getAttribute('data-leg-id'), 'daba-d2-leg6');
    await desktop.locator('.plan-map-marker[data-waypoint-number="9"]').click();
    assert.equal(await desktop.locator('.plan-timeline-leg.is-selected').getAttribute('data-leg-id'), 'daba-d2-leg7');
    await desktop.getByRole('button', { name: '顯示路線與當日路點', exact: true }).click(); await desktop.waitForTimeout(350);
    await desktop.screenshot({ path: path.join(out, 'desktop-day2.png') });
    result.checks.desktopDay2 = { fit: d2Fit, markers: [3, 8, 9], unknownPointsRemainUnlocated: 5, markerSelection: ['daba-d2-leg6', 'daba-d2-leg7'], leftNumbers: day2 };

    const beforeWheel = await inspect(desktop, d2Coordinates);
    assert.equal(beforeWheel.wheelZoomEnabled, false);
    const mapBox = await desktop.locator('.plan-route-map').boundingBox();
    await desktop.mouse.move(mapBox.x + mapBox.width / 2, Math.max(100, mapBox.y + 100));
    await desktop.mouse.wheel(0, 700); await desktop.waitForTimeout(400);
    assert.equal((await inspect(desktop, d2Coordinates)).zoom, beforeWheel.zoom);
    result.checks.wheelDoesNotZoom = true;

    await desktop.setViewportSize({ width: 1440, height: 900 }); await desktop.waitForTimeout(500);
    await pointIndex.locator('summary').click();
    assert.equal(await pointIndex.evaluate(node => node.open), true);
    assert.equal(await pointIndex.locator('.plan-map-point-key button').filter({ hasText: '未定位' }).count(), 5);
    const referenceSource = pointIndex.getByRole('link', { name: /步道參考線段/ });
    assert.equal(await referenceSource.isVisible(), true);
    assert.equal(new URL(await referenceSource.getAttribute('href')).protocol, 'https:');
    await pointIndex.locator('.plan-map-point-key button').filter({ hasText: '中霸山屋' }).click();
    assert.equal(await desktop.locator('.plan-timeline-leg.is-selected').getAttribute('data-leg-id'), 'daba-d2-leg6');
    assert.ok((await desktop.locator('.plan-point-source').innerText()).includes('中霸山屋'));
    assert.equal(await desktop.locator('.plan-point-source').getByRole('link', { name: /位置來源/ }).isVisible(), true);
    await desktop.getByRole('button', { name: '關閉路點資訊', exact: true }).click();
    await pointIndex.locator('summary').click();
    assert.equal(await pointIndex.evaluate(node => node.open), false);
    await desktop.locator('.plan-route-export').scrollIntoViewIfNeeded();
    await desktop.getByRole('button', { name: '顯示路線與當日路點', exact: true }).click(); await desktop.waitForTimeout(400);
    const shortDesktopFit = await inspect(desktop, d2Coordinates); assertFit(shortDesktopFit);
    const shortDesktop = await desktop.evaluate(() => {
      const card = document.querySelector('.plan-route-view').getBoundingClientRect();
      const footer = document.querySelector('.plan-route-export').getBoundingClientRect();
      return { height: innerHeight, cardTop: card.top, cardBottom: card.bottom, footerTop: footer.top, footerBottom: footer.bottom,
        fixedFooterTop: document.querySelector('.plan-footer').getBoundingClientRect().top,
        indexClosed: !document.querySelector('details.plan-route-source').open };
    });
    assert.ok(shortDesktop.footerTop >= shortDesktop.cardTop && shortDesktop.footerBottom <= shortDesktop.cardBottom + 1, `Export footer remains inside the map card: ${JSON.stringify(shortDesktop)}`);
    assert.ok(shortDesktop.footerBottom <= shortDesktop.fixedFooterTop + 1 && shortDesktop.footerTop >= 76, `Export footer remains reachable above the fixed toolbar: ${JSON.stringify(shortDesktop)}`);
    await desktop.screenshot({ path: path.join(out, 'desktop-900-collapsed-index.png') });
    result.checks.collapsedPointIndexAndShortDesktop = { initiallyCollapsed: true, unknownPointsPreserved: 5, indexSelectsPointWithSource: true, fitAfterCollapse: shortDesktopFit, layout: shortDesktop };

    await alignWorkspace(desktop);
    const day2Layout = await workspaceLayout(desktop);
    assert.ok(day2Layout.secondary.top >= day2Layout.footer.bottom - 1, `Secondary settings begin after the initial viewport: ${JSON.stringify(day2Layout)}`);
    result.checks.day2MainWorkspaceHeight = day2Layout;
    const secondary = desktop.locator('.workspace-secondary');
    const secondaryTitles = ['基本資料與留守', '路線來源與申請', '裝備、通訊與查核'];
    for (const title of secondaryTitles) {
      const section = secondary.locator(':scope > details').filter({ has: desktop.locator('summary').filter({ hasText: new RegExp(`^${title}$`) }) });
      await section.locator(':scope > summary').click(); assert.equal(await section.evaluate(node => node.open), true);
      await section.locator(':scope > summary').click(); assert.equal(await section.evaluate(node => node.open), false);
    }
    await desktop.screenshot({ path: path.join(out, 'desktop-secondary-settings.png') });
    result.checks.secondarySettingsReachableAfterScroll = secondaryTitles;

    await desktop.setViewportSize({ width: 1200, height: 900 }); await desktop.waitForTimeout(500);
    const resized = await inspect(desktop, d2Coordinates); assertFit(resized);
    await alignWorkspace(desktop);
    result.checks.desktop1200MainWorkspaceHeight = await workspaceLayout(desktop);
    await desktop.screenshot({ path: path.join(out, 'desktop-1200-workspace.png') });
    await desktop.setViewportSize({ width: 390, height: 844 }); await desktop.waitForTimeout(300);
    assert.equal(await desktop.locator('.plan-route-pane').isVisible(), false);
    await desktop.getByRole('navigation', { name: '行程檢視', exact: true }).getByRole('button', { name: '地圖', exact: true }).click();
    await waitMarkers(desktop, [3, 8, 9]); await desktop.waitForTimeout(400);
    const mobileAfterResize = await inspect(desktop, d2Coordinates); assertFit(mobileAfterResize);
    assert.equal(await desktop.evaluate(() => document.documentElement.scrollWidth), 390);
    await desktop.locator('.plan-route-map').scrollIntoViewIfNeeded();
    await desktop.screenshot({ path: path.join(out, 'phone-after-desktop.png') });
    result.checks.resizeAndHiddenToVisible = { resized, mobileAfterResize };
    await desktopContext.close();

    const phoneContext = await context(browser, { width: 390, height: 844 });
    const phone = await openDaba(phoneContext);
    await phone.waitForTimeout(700);
    assert.equal(await phone.locator('.plan-route-map canvas').count(), 0, 'Hidden phone map must not initialize with fallback dimensions');
    await phone.getByRole('navigation', { name: '行程檢視', exact: true }).getByRole('button', { name: '地圖', exact: true }).click();
    await waitMarkers(phone, [1, 2, 3]);
    const initialPhoneFit = await inspect(phone, d1Coordinates); assertFit(initialPhoneFit);
    const phoneBottomControls = await phone.locator('.plan-route-map').evaluate(node => {
      const mapBox = node.getBoundingClientRect();
      return [...node.querySelectorAll('.maplibregl-ctrl-bottom-left,.maplibregl-ctrl-bottom-right')].map(control => {
        const rect = control.getBoundingClientRect(); return { top: rect.top - mapBox.top, bottom: rect.bottom - mapBox.top };
      });
    });
    assert.ok(phoneBottomControls.every(control => control.top > initialPhoneFit.height * .75 && control.bottom <= initialPhoneFit.height + 1), 'Scale and attribution stay at the bottom of the planner map');
    result.checks.phoneBottomControls = phoneBottomControls;
    await phone.locator('.plan-route-map').scrollIntoViewIfNeeded();
    await phone.screenshot({ path: path.join(out, 'phone-day1.png') });
    await phone.getByRole('navigation', { name: '行程檢視', exact: true }).getByRole('button', { name: '行程', exact: true }).click();
    await phone.getByRole('navigation', { name: '行程檢視', exact: true }).getByRole('button', { name: '地圖', exact: true }).click();
    await phone.waitForTimeout(350); assertFit(await inspect(phone, d1Coordinates));
    assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth), 390);
    result.checks.initialPhoneMapIsLazyAndFits = initialPhoneFit;
    await phoneContext.close();

    // A route without geographic track keeps the map and a clear missing-track
    // state; itinerary and optional image export remain available.
    const diagramContext = await context(browser, { width: 1440, height: 900 });
    const noTrack = await openDaba(diagramContext);
    await noTrack.waitForTimeout(450);
    await noTrack.evaluate(() => {
      const draft = JSON.parse(localStorage.getItem('mt-info-plan-v1'));
      draft.referenceRouteId = null; draft.routeName = 'QA 無地理軌跡行程'; draft.title = 'QA 無地理軌跡行程';
      localStorage.setItem('mt-info-plan-v1', JSON.stringify(draft));
    });
    await noTrack.reload({ waitUntil: 'domcontentloaded' }); await noTrack.locator('.plan-timeline-leg').first().waitFor();
    await chooseDay(noTrack, 1); await alignWorkspace(noTrack);
    await noTrack.waitForFunction(() => document.querySelector('.plan-route-map canvas') && !document.querySelector('.plan-route-map-state'));
    assert.equal(await noTrack.locator('.plan-route-sketch').count(), 0);
    assert.ok((await noTrack.locator('.plan-route-missing').innerText()).includes('尚未收錄這條路線的地理軌跡'));
    const noTrackLayout = await workspaceLayout(noTrack);
    assert.ok(noTrackLayout.canvas.height >= 500);
    const noTrackGeometry = await inspect(noTrack);
    assert.equal(noTrackGeometry.linePointCount, 0);
    await noTrack.screenshot({ path: path.join(out, 'desktop-no-track-map-entry.png') });
    await noTrack.locator('.plan-timeline-leg').last().locator('.timeline-route-button').click();
    assert.equal(await noTrack.locator('.plan-timeline-leg.is-selected').getAttribute('data-leg-id'), 'daba-d2-leg13');
    const downloadPending = noTrack.waitForEvent('download');
    await noTrack.getByRole('button', { name: '白底 SVG', exact: true }).click();
    const downloaded = await downloadPending, exportFile = path.join(out, 'no-track-day2.svg'); await downloaded.saveAs(exportFile);
    assert.ok((await fs.readFile(exportFile, 'utf8')).includes('<svg'));
    await noTrack.screenshot({ path: path.join(out, 'desktop-no-track-map-end.png') });
    result.checks.noTrackMapAndExport = { layout: noTrackLayout, geographicSegments: 0, lastSegmentSelectable: true, export: 'no-track-day2.svg' };

    const draftBeforeGpx = await noTrack.evaluate(() => localStorage.getItem('mt-info-plan-v1'));
    const chooserPending = noTrack.waitForEvent('filechooser');
    await noTrack.getByRole('button', { name: '匯入 GPX', exact: true }).click();
    const chooser = await chooserPending;
    await chooser.setFiles({ name: 'qa-two-segments.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from('<gpx version="1.1" creator="isolated QA"><trk><name>QA two segments</name><trkseg><trkpt lat="24.4" lon="121.1"/><trkpt lat="24.41" lon="121.11"/></trkseg><trkseg><trkpt lat="24.45" lon="121.15"/><trkpt lat="24.46" lon="121.16"/></trkseg></trk></gpx>') });
    await noTrack.waitForFunction(() => document.querySelector('.plan-route-map canvas') && !document.querySelector('.plan-route-map-state') && document.querySelector('.plan-route-note')?.textContent.includes('本機軌跡'));
    // React's caption can update before MapLibre finishes initializing the new GeoJSON source.
    let importedGeometry = await inspect(noTrack);
    for (let attempt = 0; importedGeometry.linePointCount !== 4 && attempt < 50; attempt++) {
      await noTrack.waitForTimeout(100);
      importedGeometry = await inspect(noTrack);
    }
    assert.equal(importedGeometry.linePointCount, 4);
    assert.equal(await noTrack.locator('.plan-route-missing').count(), 0);
    assert.equal(await noTrack.locator('.plan-map-marker').count(), 0, 'Imported coordinates are not silently assigned to itinerary names');
    assert.equal(await noTrack.evaluate(() => localStorage.getItem('mt-info-plan-v1')), draftBeforeGpx);
    await noTrack.reload({ waitUntil: 'domcontentloaded' });
    await noTrack.locator('.plan-route-missing').waitFor();
    assert.equal((await inspect(noTrack)).linePointCount, 0, 'A local GPX is not persisted in the plan');
    result.checks.inMapGpxImport = { fileChooser: true, trackPoints: 4, draftUnchanged: true, noGuessedWaypointPositions: true, clearedOnReload: true };
    await diagramContext.close();

    const failedSourceContext = await context(browser, { width: 1440, height: 900 });
    await failedSourceContext.route('**/api/plan-route/027', route => route.fulfill({ status: 503, json: { message: '受控軌跡來源失敗' } }));
    const failedSource = await openDaba(failedSourceContext);
    await waitMarkers(failedSource, [1, 2, 3]);
    assert.ok((await failedSource.locator('.plan-route-missing').innerText()).includes('官方路線暫時無法載入'));
    const failedGeometry = await inspect(failedSource, d1Coordinates);
    assert.equal(failedGeometry.linePointCount, 0, 'Known waypoint positions must not be connected into a replacement track');
    assert.equal(failedGeometry.allInside, true);
    await alignWorkspace(failedSource);
    await failedSource.screenshot({ path: path.join(out, 'desktop-track-source-failure.png') });
    result.checks.trackFailureKeepsPointsAndVisibleStatus = { markers: [1, 2, 3], geographicLinePoints: 0, sourceFailureVisible: true };
    await failedSourceContext.close();

    for (const layout of [tallDesktop, day2Layout, result.checks.desktop1200MainWorkspaceHeight]) {
      assert.ok(layout.canvas.height >= 500, `Desktop 900px canvas must be at least 500px: ${JSON.stringify(layout)}`);
      assert.ok(layout.card.height >= 900 * .75, `Map card should occupy most of the working viewport: ${JSON.stringify(layout)}`);
    }
    assert.ok(noTrackLayout.canvas.height >= 500, `No-track map must retain a full working panel: ${JSON.stringify(noTrackLayout)}`);
    assert.deepEqual(result.pageErrors, []);
  } catch (error) { result.failure = { message: error.message, stack: error.stack }; throw error; }
  finally { await browser.close(); await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); }
  console.log(JSON.stringify(result, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
