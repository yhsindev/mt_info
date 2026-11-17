/* Focused planner density/rest regression. Uses isolated Chrome and fictional local drafts. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { inflateRawSync } = require('node:zlib');
const { chromium } = require('playwright');

const base = process.env.MT_INFO_QA_URL || 'http://127.0.0.1:5173';
const out = path.resolve('artifacts/planner-density-after');
const beforePath = path.resolve('artifacts/planner-density-before/measurement.json');
const key = 'mt-info-plan-v1';
const result = {
  base, scope: 'Planner density, optional rest controls, legacy rest preservation, JSON and Word unknown values. Map/day interaction is covered separately.',
  checkedAt: new Date().toISOString(), checks: {}, measurements: [], pageErrors: [],
};

async function check(name, run) {
  try { result.checks[name] = { status: 'passed', details: await run() }; }
  catch (error) { result.checks[name] = { status: 'failed', error: error.stack || String(error) }; }
}
async function contextFor(browser, viewport, draft) {
  const context = await browser.newContext({ viewport, ...(viewport.width < 761 ? { isMobile: true, hasTouch: true } : {}) });
  // This test makes no claims about current official notices or network data.
  await context.route('**/api/conditions', route => route.fulfill({ status: 503, json: { message: '隔離版面測試未請求公告' } }));
  if (draft) await context.addInitScript(({ key, draft, origin }) => {
    if (location.origin === origin && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(draft));
  }, { key, draft, origin: new URL(base).origin });
  context.on('page', page => page.on('pageerror', error => result.pageErrors.push(error.message)));
  return context;
}
async function openPlan(context) {
  const page = await context.newPage();
  await page.goto(`${base}/?layer=conditions&plan=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('.plan-page').waitFor();
  return page;
}
async function chooseDaba(page) {
  const plan = page.locator('.plan-page');
  if (!await plan.locator('.plan-catalog').isVisible()) await plan.getByRole('button', { name: '選擇路線', exact: true }).click();
  await plan.locator('[data-template-id="daba"]').getByRole('button', { name: '使用此範本', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '確認取代', exact: true }).click();
  await plan.locator('.plan-timeline-leg').first().waitFor();
}
async function chooseDay(page, number) {
  await page.getByRole('navigation', { name: '行程日期', exact: true }).getByRole('button').nth(number - 1).click();
  await page.waitForTimeout(100);
}
async function stored(page) {
  await page.waitForFunction(key => { try { return !!JSON.parse(localStorage.getItem(key)); } catch { return false; } }, key);
  await page.waitForTimeout(450); // Existing panel debounce is 350 ms.
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
}
async function waitRest(page, values) {
  await page.waitForFunction(({ key, values }) => {
    const draft = JSON.parse(localStorage.getItem(key) || 'null');
    return JSON.stringify(draft?.days[0]?.legs.map(leg => leg.restMinutes)) === JSON.stringify(values);
  }, { key, values });
  return (await stored(page)).days[0].legs.map(leg => leg.restMinutes);
}
async function download(page, kind, name) {
  const pending = page.waitForEvent('download');
  await page.getByLabel('匯出計畫（固定工具列）', { exact: true }).selectOption(kind);
  const file = await pending, destination = path.join(out, name);
  await file.saveAs(destination); return destination;
}
function zipMembers(bytes) {
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end > 0, 'Word download must have an OOXML ZIP directory');
  const members = new Map(); let cursor = bytes.readUInt32LE(end + 16);
  for (let i = 0, count = bytes.readUInt16LE(end + 10); i < count; i++) {
    assert.equal(bytes.readUInt32LE(cursor), 0x02014b50);
    const method = bytes.readUInt16LE(cursor + 10), length = bytes.readUInt32LE(cursor + 20);
    const nameLength = bytes.readUInt16LE(cursor + 28), extra = bytes.readUInt16LE(cursor + 30), comment = bytes.readUInt16LE(cursor + 32);
    const name = bytes.toString('utf8', cursor + 46, cursor + 46 + nameLength), local = bytes.readUInt32LE(cursor + 42);
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28), payload = bytes.subarray(start, start + length);
    members.set(name, (method === 8 ? inflateRawSync(payload) : payload).toString('utf8'));
    cursor += 46 + nameLength + extra + comment;
  }
  return members;
}
async function measurement(page, label) {
  const value = await page.evaluate(() => {
    const rect = node => {
      if (!node) return null;
      const r = node.getBoundingClientRect(), s = getComputedStyle(node);
      return { x: r.x, y: r.y, width: r.width, height: r.height, fontSize: parseFloat(s.fontSize), lineHeight: s.lineHeight, overflowY: s.overflowY, scrollTop: node.scrollTop, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight };
    };
    const selectors = ['.app-header', '.plan-header', '.workspace-plan-heading', '.workspace-plan-summary', '.plan-day-navigation', '.workspace-day-header', '.workspace-start', '.workspace-time-summary', '.plan-itinerary-pane', '.plan-route-pane', '.plan-route-view', '.plan-route-map-wrap', '.plan-route-map canvas', '.plan-footer'];
    const elements = Object.fromEntries(selectors.map(selector => [selector, rect(document.querySelector(selector))]));
    const pane = document.querySelector('.plan-itinerary-pane'), paneRect = pane.getBoundingClientRect();
    const clipTop = Math.max(elements['.app-header']?.height || 0, paneRect.top);
    const clipBottom = Math.min(innerHeight, elements['.plan-footer']?.y ?? innerHeight, getComputedStyle(pane).overflowY === 'auto' ? paneRect.bottom : innerHeight);
    const rows = [...pane.querySelectorAll('.plan-timeline-leg')].map(node => {
      const button = node.querySelector('.timeline-route-button'), b = button.getBoundingClientRect();
      return { id: node.dataset.legId, selected: node.classList.contains('is-selected'), ...rect(node), routeButton: rect(button), pointFullyVisible: b.top >= clipTop - 1 && b.bottom <= clipBottom + 1, number: button.querySelector('.timeline-waypoint-number')?.textContent };
    });
    const heights = rows.filter(row => !row.selected).map(row => row.height).sort((a, b) => a - b);
    const median = heights.length ? heights.length % 2 ? heights[(heights.length - 1) / 2] : (heights[heights.length / 2 - 1] + heights[heights.length / 2]) / 2 : null;
    const visible = node => {
      if (!node.getClientRects().length || getComputedStyle(node).visibility === 'hidden') return false;
      for (let parent = node.parentElement; parent; parent = parent.parentElement) {
        if (parent.tagName === 'DETAILS' && !parent.open) {
          const summary = [...parent.children].find(child => child.tagName === 'SUMMARY');
          if (!summary?.contains(node)) return false;
        }
      }
      return true;
    };
    const controls = [...document.querySelectorAll('.plan-header button,.plan-day-navigation button,.plan-mobile-views button,.plan-itinerary-pane button,.plan-itinerary-pane input,.plan-itinerary-pane select,.plan-itinerary-pane summary,.workspace-plan-heading input,.plan-footer select,.header-nav button')].filter(visible).map(node => {
      // A checkbox's associated wrapping label is also its clickable target.
      const target = node.matches('input[type="checkbox"],input[type="radio"]') ? node.closest('label') || node : node;
      return { tag: node.tagName, label: node.getAttribute('aria-label') || target.textContent.trim().slice(0, 80) || node.type, ...rect(target), ...(target !== node ? { visualControl: rect(node), hitTarget: 'associated label' } : {}) };
    });
    const inputs = [...document.querySelectorAll('.plan-page input,.plan-page select,.plan-page textarea')].filter(visible).map(node => ({ label: node.getAttribute('aria-label') || node.closest('label')?.textContent.trim().slice(0, 80) || node.type, ...rect(node) }));
    const notes = [...document.querySelectorAll('.timeline-segment-summary,.workspace-time-summary,.workspace-unknown-note,.timeline-reference,.workspace-source-date,.workspace-resources small,.plan-field > span,.workspace-plan-summary')].filter(visible).map(node => ({ text: node.textContent.trim().slice(0, 100), ...rect(node) }));
    const plan = document.querySelector('.plan-page');
    return { viewport: { width: innerWidth, height: innerHeight }, elements, clipTop, clipBottom, rows, pointButtonsFullyVisible: rows.filter(row => row.pointFullyVisible).length, unselectedMedianHeight: median, controls, inputs, notes, overflow: { documentWidth: document.documentElement.scrollWidth, planWidth: plan.clientWidth, planScrollWidth: plan.scrollWidth, itineraryWidth: pane.clientWidth, itineraryScrollWidth: pane.scrollWidth } };
  });
  value.label = label; result.measurements.push(value); return value;
}
async function captureDay2(page, name) {
  await page.screenshot({ path: path.join(out, `${name}-entry.png`) });
  // Keep the product's own scroll behavior; no CSS/DOM style overrides for screenshots.
  const pane = page.locator('.plan-itinerary-pane');
  await pane.evaluate(node => { if (getComputedStyle(node).overflowY === 'auto') node.scrollTop = node.scrollHeight; else node.querySelector('.plan-timeline-leg:last-child').scrollIntoView({ block: 'end', behavior: 'instant' }); });
  await page.screenshot({ path: path.join(out, `${name}-end.png`) });
}
function legacyDraft(template) {
  const draft = structuredClone(template), day = draft.days[1];
  draft.id = 'qa-density-legacy'; draft.title = 'QA 舊草稿休息保留'; draft.routeName = 'QA 休息欄位隔離測試'; draft.referenceRouteId = null;
  day.id = 'qa-density-day'; day.label = '第 1 天｜QA 舊草稿'; day.startTime = '05:00';
  day.legs = [null, 0, 30].map((restMinutes, index) => ({ ...structuredClone(day.legs[index]), id: `qa-density-leg-${index}`, from: ['QA休息未知起點', 'QA不安排休息起點', 'QA三十分休息起點'][index], to: ['QA不安排休息起點', 'QA三十分休息起點', 'QA終點'][index], minutes: 60, restMinutes }));
  draft.days = [day]; draft.advisories = []; return draft;
}

(async () => {
  await fs.mkdir(out, { recursive: true });
  const before = JSON.parse(await fs.readFile(beforePath, 'utf8'));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  let template;
  try {
    await check('desktopDensityAndZeroRestTemplate', async () => {
      const context = await contextFor(browser, { width: 1440, height: 900 });
      try {
        const page = await openPlan(context), tileResponses = [], tileFailures = [];
        // No tile or route interception: these responses are the real public basemap.
        page.on('response', response => { if (response.url().startsWith('https://tile.openstreetmap.org/')) tileResponses.push({ url: response.url(), status: response.status() }); });
        page.on('requestfailed', request => { if (request.url().startsWith('https://tile.openstreetmap.org/')) tileFailures.push({ url: request.url(), error: request.failure()?.errorText }); });
        await chooseDaba(page); template = await stored(page);
        assert.ok(template.days.flatMap(day => day.legs).every(leg => leg.restMinutes === 0), 'New templates explicitly start with no arranged rest');
        assert.equal(await page.getByLabel('抵達後休息（分）', { exact: true }).count(), 0);
        await chooseDay(page, 2);
        await page.locator('.plan-route-map canvas').waitFor({ state: 'visible', timeout: 12_000 });
        await page.locator('.plan-map-marker').first().waitFor({ state: 'visible', timeout: 12_000 });
        await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
        await page.waitForTimeout(250);
        await page.evaluate(() => { document.querySelector('.plan-page').scrollTop = 0; document.querySelector('.plan-itinerary-pane').scrollTop = 0; });
        await page.waitForTimeout(150);
        const metrics = await measurement(page, 'desktop-1440-day2-entry');
        const baseline = before.local.find(item => item.label === 'local-1440-day2-entry');
        const previousTop = baseline.rows[0].y - baseline.elements['.app-header'].height;
        const currentTop = metrics.rows[0].y - metrics.elements['.app-header'].height;
        result.liveMap = {
          canvas: metrics.elements['.plan-route-map canvas'],
          itineraryWidth: metrics.elements['.plan-itinerary-pane'].width,
          mapPaneWidth: metrics.elements['.plan-route-pane'].width,
          sourceIndexCollapsed: !await page.locator('.plan-route-source').evaluate(node => node.open),
          scopeNote: await page.locator('.plan-route-note').first().innerText(),
          realTileResponses: tileResponses, tileFailures,
        };
        result.desktopComparison = { beforeFirstPointY: baseline.rows[0].y, afterFirstPointY: metrics.rows[0].y, beforeTopToFirstPoint: previousTop, afterTopToFirstPoint: currentTop, beforeDayNavigationHeight: baseline.elements['.plan-day-navigation'].height, afterDayNavigationHeight: metrics.elements['.plan-day-navigation'].height };
        await captureDay2(page, 'desktop-1440-day2');
        assert.ok(currentTop < previousTop, `Top-to-first-point should shrink (${currentTop} vs ${previousTop})`);
        assert.ok(metrics.pointButtonsFullyVisible >= 5, `Expected 5 complete waypoint buttons, saw ${metrics.pointButtonsFullyVisible}`);
        assert.ok(metrics.unselectedMedianHeight <= 100, `Expected compact unselected rows <=100px, median ${metrics.unselectedMedianHeight}`);
        assert.equal(metrics.rows.filter(row => row.selected).length, 0);
        assert.ok(result.liveMap.canvas.height > 300, `Expected map canvas >300px, got ${result.liveMap.canvas.height}`);
        assert.ok(result.liveMap.sourceIndexCollapsed, 'Repeated index/source information should initially be collapsed');
        assert.ok(tileResponses.some(response => response.status === 200), 'A genuine basemap tile must load for the real-map screenshot');
        return { ...result.desktopComparison, visibleWaypointButtons: metrics.pointButtonsFullyVisible, unselectedMedianHeight: metrics.unselectedMedianHeight, zeroRestLegs: template.days.flatMap(day => day.legs).length, mapCanvasHeight: result.liveMap.canvas.height, genuineTileResponses: tileResponses.filter(response => response.status === 200).length };
      } finally { await context.close(); }
    });

    for (const width of [390, 360]) await check(`phone${width}DensityAndControls`, async () => {
      const context = await contextFor(browser, { width, height: width === 390 ? 844 : 640 });
      try {
        const page = await openPlan(context); await chooseDaba(page); await chooseDay(page, 2);
        const overview = await measurement(page, `phone-${width}-day2-overview`);
        await captureDay2(page, `phone-${width}-day2`);
        await page.locator('.plan-timeline-leg').first().locator('.timeline-route-button').click();
        await page.locator('.plan-timeline-leg').first().getByRole('button', { name: '加入休息', exact: true }).click();
        const editing = await measurement(page, `phone-${width}-selected-rest`);
        await page.screenshot({ path: path.join(out, `phone-${width}-rest-editor.png`) });
        for (const state of [overview, editing]) {
          assert.ok(state.overflow.documentWidth <= width, `${state.label}: document overflows`);
          assert.ok(state.overflow.planScrollWidth <= state.overflow.planWidth, `${state.label}: planner overflows`);
          assert.ok(state.overflow.itineraryScrollWidth <= state.overflow.itineraryWidth, `${state.label}: itinerary overflows`);
          assert.deepEqual(state.inputs.filter(node => node.fontSize < 16), [], `${state.label}: mobile input text <16px`);
          assert.deepEqual(state.notes.filter(node => node.fontSize < 14), [], `${state.label}: supporting text <14px`);
          assert.deepEqual(state.controls.filter(node => node.height < 47.9), [], `${state.label}: interactive height <48px`);
        }
        return { overviewRowsMedian: overview.unselectedMedianHeight, visibleWaypointButtons: overview.pointButtonsFullyVisible, overflow: overview.overflow, selectedInputMinimum: Math.min(...editing.inputs.map(node => node.fontSize)), noteMinimum: Math.min(...editing.notes.map(node => node.fontSize)), controlHeightMinimum: Math.min(...editing.controls.map(node => node.height)) };
      } finally { await context.close(); }
    });

    await check('optionalRestNullThirtyZeroRecalculationAndStorage', async () => {
      const context = await contextFor(browser, { width: 1440, height: 900 });
      try {
        const page = await openPlan(context); await chooseDaba(page);
        await page.getByLabel('起走時間', { exact: true }).fill('05:00');
        const row = page.locator('.plan-timeline-leg').first();
        assert.equal(await page.locator('.workspace-finish strong').innerText(), '14:30');
        await row.locator('.timeline-route-button').click();
        assert.equal(await row.getByLabel('抵達後休息（分）', { exact: true }).count(), 0);
        await row.getByRole('button', { name: '加入休息', exact: true }).click();
        assert.equal(await row.getByLabel('抵達後休息（分）', { exact: true }).inputValue(), '');
        assert.equal(await page.locator('.workspace-finish strong').innerText(), '未知');
        assert.deepEqual(await waitRest(page, [null, 0]), [null, 0]);
        await row.getByLabel('抵達後休息（分）', { exact: true }).fill('30');
        assert.equal(await page.locator('.workspace-finish strong').innerText(), '15:00');
        assert.deepEqual(await waitRest(page, [30, 0]), [30, 0]);
        await row.getByRole('button', { name: '移除休息', exact: true }).click();
        assert.equal(await row.getByLabel('抵達後休息（分）', { exact: true }).count(), 0);
        assert.equal(await page.locator('.workspace-finish strong').innerText(), '14:30');
        assert.deepEqual(await waitRest(page, [0, 0]), [0, 0]);
        await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator('.plan-timeline-leg').first().waitFor();
        assert.deepEqual((await stored(page)).days[0].legs.map(leg => leg.restMinutes), [0, 0]);
        assert.equal(await page.locator('.workspace-finish strong').innerText(), '14:30');
        return { states: [{ rest: 0, finish: '14:30' }, { rest: null, finish: '未知' }, { rest: 30, finish: '15:00' }, { removedRest: 0, finish: '14:30' }], persistedAfterReload: true };
      } finally { await context.close(); }
    });

    await check('legacyNullZeroThirtyAndExportsPreserveUnknown', async () => {
      assert.ok(template, 'Fresh template fixture must be available from the desktop check');
      const legacy = legacyDraft(template), context = await contextFor(browser, { width: 1440, height: 900 }, legacy);
      try {
        const page = await openPlan(context); await page.locator('.plan-timeline-leg').first().waitFor();
        const values = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)).days[0].legs.map(leg => leg.restMinutes), key);
        assert.deepEqual(await values(), [null, 0, 30]);
        assert.equal(await page.locator('.workspace-finish strong').innerText(), '未知');
        assert.equal(await page.locator('.workspace-rest-pending').getByText('1 段休息未設定', { exact: true }).count(), 1);
        const rows = page.locator('.plan-timeline-leg');
        for (let index = 0; index < 3; index++) {
          await rows.nth(index).locator('.timeline-route-button').click();
          const input = rows.nth(index).getByLabel('抵達後休息（分）', { exact: true });
          if (index === 1) assert.equal(await input.count(), 0);
          else assert.equal(await input.inputValue(), index === 0 ? '' : '30');
          await rows.nth(index).getByRole('button', { name: '收合路段編輯', exact: true }).click();
        }
        assert.deepEqual(await values(), [null, 0, 30], 'Opening editors must not normalize old values');
        await page.getByLabel('出發日期', { exact: true }).fill('2026-11-14');
        assert.deepEqual((await stored(page)).days[0].legs.map(leg => leg.restMinutes), [null, 0, 30]);
        await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator('.plan-timeline-leg').first().waitFor();
        assert.deepEqual(await values(), [null, 0, 30], 'Unrelated edits and reload must preserve old values');
        const jsonPath = await download(page, 'json', 'legacy-rest-values.json');
        const exported = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
        assert.deepEqual(exported.days[0].legs.map(leg => leg.restMinutes), [null, 0, 30]);
        const wordPath = await download(page, 'word', 'legacy-rest-values.docx');
        const document = zipMembers(await fs.readFile(wordPath)).get('word/document.xml');
        assert.ok(document, 'Word download must contain document.xml');
        const tableRows = [...document.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map(match => match[0].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '));
        for (const [index, [name, expected]] of [['QA休息未知起點', '休息 未知'], ['QA不安排休息起點', '休息 0 分'], ['QA三十分休息起點', '休息 30 分']].entries()) {
          const matching = tableRows.find(text => text.includes(`${index + 1}. ${name} →`) && text.includes('行走 60 分'));
          assert.ok(matching, `Missing exported route row ${name}`); assert.ok(matching.includes(expected), `${name}: expected ${expected}, got ${matching}`);
        }
        return { storedAndJson: [null, 0, 30], unknownFinishPreserved: true, wordRowsPreserved: ['休息 未知', '休息 0 分', '休息 30 分'], wordVerification: 'Downloaded OOXML inspected; native Word rendering is not part of this focused check.' };
      } finally { await context.close(); }
    });
    await check('noBrowserRuntimeErrors', async () => { assert.deepEqual(result.pageErrors, []); return true; });
  } finally {
    await browser.close();
    result.status = Object.values(result.checks).every(item => item.status === 'passed') ? 'passed' : 'failed';
    await fs.writeFile(path.join(out, 'measurement.json'), JSON.stringify(result, null, 2));
  }
  console.log(JSON.stringify({ status: result.status, checks: result.checks, evidence: path.join(out, 'measurement.json') }, null, 2));
  if (result.status !== 'passed') process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
