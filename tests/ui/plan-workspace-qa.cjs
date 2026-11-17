/* Isolated Chrome regression checks. Fictional team data and controlled notice only. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const base = process.env.MT_INFO_QA_URL || 'http://127.0.0.1:5173';
const out = path.resolve('artifacts/plan-workspace-qa');
const key = 'mt-info-plan-v1';
const result = { base, checks: {}, pageErrors: [] };
const escapeReg = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
async function expand(scope, label) {
  const summary = scope.locator('summary').filter({ hasText: new RegExp('^' + escapeReg(label) + '$') }).first();
  if (!await summary.evaluate(node => node.parentElement.open)) await summary.click();
}
async function confirm(page, label = '確認取代') { await page.getByRole('alertdialog').getByRole('button', { name: label, exact: true }).click(); }
async function stored(page) {
  await page.waitForFunction(key => { try { return !!JSON.parse(localStorage.getItem(key)); } catch { return false; } }, key);
  await page.waitForTimeout(450);
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
}
async function download(page, kind, name) {
  const pending = page.waitForEvent('download');
  await page.getByLabel('匯出計畫（固定工具列）', { exact: true }).selectOption(kind);
  const file = await pending; const destination = path.join(out, name); await file.saveAs(destination); return destination;
}
async function dimensions(page) {
  return page.evaluate(() => ({
    width: innerWidth, body: document.documentElement.scrollWidth,
    page: document.querySelector('.plan-page')?.clientWidth, scroll: document.querySelector('.plan-page')?.scrollWidth,
    tooSmall: [...document.querySelectorAll('.plan-page button,.plan-page summary,.header-nav button')]
      .filter(node => node.getClientRects().length && node.getBoundingClientRect().height < 43)
      .map(node => ({ text: node.textContent, height: node.getBoundingClientRect().height })),
  }));
}
function conditionsFixture() {
  const now = new Date().toISOString();
  const source = { name: 'QA 受控官方公告來源', url: 'https://recreation.forest.gov.tw/Trail/RT?tr_id=027', license: '僅為本機回歸測試資料' };
  const feed = { status: 'ready', source, coverage: 'QA', fetchedAt: now, checkedAt: now, error: null, message: '', items: [] };
  return { generatedAt: now, trails: { ...feed, catalogCount: 1, unmatchedCount: 0, items: [{
    id: 'qa-daba-notice', trailId: '027', name: '大霸尖山步道', region: '北部', manager: 'QA 管理單位', condition: 'caution', rawCondition: '注意',
    headline: 'QA 路況快照', description: '這是隔離測試公告，不表示真實路況。', section: null,
    issuedAt: now, updatedAt: now, closureDate: null, expectedOpeningDate: null, latitude: null, longitude: null, coordinateNote: '', source,
  }] }, alerts: { ...feed, items: [], unknownTimeCount: 0 } };
}
async function newContext(browser, options = {}, failConditions = false) {
  const context = await browser.newContext(options);
  await context.route('**/api/conditions', route => failConditions
    ? route.fulfill({ status: 503, json: { message: '受控來源失敗' } })
    : route.fulfill({ status: 200, json: conditionsFixture() }));
  context.on('page', page => page.on('pageerror', error => result.pageErrors.push(error.message)));
  return context;
}
async function openPlan(context) {
  const page = await context.newPage(); await page.goto(base + '/?layer=conditions&plan=1', { waitUntil: 'domcontentloaded' });
  await page.locator('.plan-page').waitFor(); return page;
}
async function chooseDaba(page) {
  const plan = page.locator('.plan-page');
  if (!await plan.locator('.plan-catalog').isVisible()) await plan.getByRole('button', { name: '選擇路線', exact: true }).click();
  await plan.locator('[data-template-id=daba]').getByRole('button', { name: '使用此範本', exact: true }).click();
  await confirm(page); await plan.locator('.plan-timeline-leg').first().waitFor();
}
async function chooseDay(page, number) {
  await page.getByRole('navigation', { name: '行程日期', exact: true }).getByRole('button').nth(number - 1).click();
}
async function selectLeg(row) {
  const button = row.locator('.timeline-route-button');
  if (await button.getAttribute('aria-pressed') !== 'true') await button.click();
}
async function setRest(row, minutes) {
  await selectLeg(row);
  const add = row.getByRole('button', { name: '加入休息', exact: true });
  if (await add.count()) await add.click();
  await row.getByLabel('抵達後休息（分）', { exact: true }).fill(String(minutes));
}
(async () => {
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await newContext(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await openPlan(context), plan = page.locator('.plan-page');
    const requests = []; page.on('request', request => requests.push({ url: request.url(), method: request.method(), body: request.postData() }));
    assert.deepEqual(await page.locator('.header-nav button').allTextContents(), ['急救', '雨量', '集水區', '路況', '計畫通']);
    assert.equal(await page.getByText('把需要的資訊，放在同一張地圖。', { exact: true }).count(), 0);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), null, 'Browsing the route library must not create a draft');
    await plan.locator('[data-template-id=daba]').getByRole('button', { name: '使用此範本', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), null);
    await chooseDaba(page);
    assert.equal(await page.getByRole('navigation', { name: '行程日期', exact: true }).getByRole('button').count(), 3);
    assert.equal(await plan.locator('.plan-timeline-leg').count(), 2);
    assert.equal(await plan.locator('.plan-timeline-leg.is-selected').count(), 0);
    assert.equal(await plan.locator('.timeline-selected-editor').count(), 0);
    assert.ok((await stored(page)).days.every(day => day.legs.every(leg => leg.restMinutes === 0)));
    await plan.getByLabel('出發日期', { exact: true }).fill('2026-11-14');
    await expand(plan, '基本資料與留守');
    await plan.getByLabel('隊伍人數', { exact: true }).fill('4');
    await plan.getByLabel('領隊／負責人', { exact: true }).fill('測試領隊');
    await plan.getByLabel('領隊電話', { exact: true }).fill('0000000000');
    await plan.getByLabel('起走時間', { exact: true }).fill('05:00');
    const rows = plan.locator('.plan-timeline-leg');
    await selectLeg(rows.nth(0));
    assert.equal(await rows.nth(0).getByLabel('抵達後休息（分）', { exact: true }).count(), 0);
    await rows.nth(0).getByRole('button', { name: '加入休息', exact: true }).click();
    assert.equal((await stored(page)).days[0].legs[0].restMinutes, null);
    assert.equal(await plan.locator('.workspace-finish strong').innerText(), '未知');
    await rows.nth(0).getByRole('button', { name: '移除休息', exact: true }).click();
    assert.equal((await stored(page)).days[0].legs[0].restMinutes, 0);
    assert.equal(await rows.nth(0).getByLabel('抵達後休息（分）', { exact: true }).count(), 0);
    assert.equal(await plan.locator('.workspace-finish strong').innerText(), '14:30');
    await rows.nth(0).locator('.timeline-route-button').click();
    assert.equal(await plan.locator('.timeline-selected-editor').count(), 0, 'Clicking the selected route returns to reading mode');
    result.checks.readingModeAndOptionalRest = { initiallyCollapsed: true, initialRest: 0, addedRestIsUnknown: true, removedRestIsZero: true, routeClickCollapses: true };
    await setRest(rows.nth(0), 30);
    await setRest(rows.nth(1), 30);
    assert.equal(await plan.locator('.workspace-finish strong').innerText(), '15:30');
    assert.equal(await rows.nth(1).locator('.timeline-time').innerText(), '11:30');
    await selectLeg(rows.nth(0));
    await rows.nth(0).getByLabel('本隊移動（分）', { exact: true }).fill('350');
    assert.equal(await plan.locator('.workspace-finish strong').innerText(), '15:20');
    assert.ok((await rows.nth(0).locator('.timeline-reference').innerText()).includes('林業署參考 360 分'));
    assert.ok((await rows.nth(0).locator('.timeline-reference').innerText()).includes('本隊已調整'));
    await rows.nth(0).getByLabel('本隊移動（分）', { exact: true }).fill('');
    assert.equal(await rows.nth(0).locator('.timeline-arrival strong').innerText(), '馬達拉溪登山口');
    assert.equal(await rows.nth(0).locator('.timeline-arrival .timeline-waypoint-number').innerText(), '2');
    assert.equal(await rows.nth(0).locator('.timeline-arrival-time').innerText(), '抵達 未知');
    assert.equal(await rows.nth(1).locator('.timeline-time').innerText(), '未知');
    assert.equal(await plan.locator('.workspace-finish strong').innerText(), '未知');
    assert.equal((await stored(page)).days[0].legs[0].minutes, null);
    await rows.nth(0).getByLabel('本隊移動（分）', { exact: true }).fill('360');
    await plan.getByLabel('起走時間', { exact: true }).fill('23:30');
    assert.equal(await rows.nth(0).locator('.timeline-arrival-time').innerText(), '抵達 次日 05:30');
    assert.equal(await plan.locator('.workspace-finish strong').innerText(), '次日 10:00');
    await plan.getByLabel('起走時間', { exact: true }).fill('05:00');
    await selectLeg(rows.nth(1));
    const firstSelection = await rows.nth(1).getAttribute('data-leg-id');
    await chooseDay(page, 2); assert.equal(await plan.locator('.plan-timeline-leg').count(), 13);
    await selectLeg(plan.locator('.plan-timeline-leg').nth(3));
    const secondSelection = await plan.locator('.plan-timeline-leg.is-selected').getAttribute('data-leg-id');
    await chooseDay(page, 1);
    assert.equal(await plan.locator('.plan-timeline-leg.is-selected').getAttribute('data-leg-id'), firstSelection);
    assert.equal(await plan.locator('.workspace-finish strong').innerText(), '15:30');
    result.checks.inlineMinutesUnknownAndMidnight = { firstDayFinish: '15:30', referenceMinutesPreserved: 360, unknownPropagates: true, midnightFinish: '次日 10:00', independentDaySelections: true };
    await expand(plan, '水源、住宿與撤退安排');
    await expand(plan, '飲水與取水');
    await plan.getByLabel('每人飲水（L）', { exact: true }).fill('2');
    await plan.getByLabel('全隊炊煮用水（L）', { exact: true }).fill('1');
    await plan.getByLabel('全隊備用水（L）', { exact: true }).fill('2');
    await plan.getByLabel('主要水源／取水點', { exact: true }).fill('待查核測試取水點');
    await plan.getByLabel('備用水源／自攜安排', { exact: true }).fill('由隊伍另行確認');
    assert.ok((await plan.locator('.plan-day-resources').innerText()).includes('手動規劃水量：11 L'));
    await expand(plan, '大霸目前收錄的步道公告');
    await plan.getByRole('button', { name: '附入目前公告快照', exact: true }).click();
    const attached = (await stored(page)).advisories;
    assert.equal(attached.length, 1); assert.ok(attached.every(notice => notice.capturedAt && notice.sourceCheckedAt && notice.title.includes('｜')));
    result.checks.attachedSourceSnapshot = { count: attached.length, source: 'controlled test fixture', capturedAt: attached[0].capturedAt };
    await chooseDay(page, 2);
    await page.getByRole('navigation', { name: '行程檢視', exact: true }).getByRole('button', { name: '地圖', exact: true }).click();
    assert.equal(await plan.locator('.plan-itinerary-pane').isVisible(), false);
    assert.equal(await plan.locator('.plan-route-pane').isVisible(), true);
    assert.equal(await plan.getByRole('group', { name: '圖面顯示', exact: true }).count(), 0);
    assert.equal(await plan.locator('.plan-route-sketch').count(), 0);
    await expand(plan, '路點索引與來源');
    await plan.locator('.plan-map-point-key button').filter({ hasText: '中霸山屋' }).click();
    await page.getByRole('navigation', { name: '行程檢視', exact: true }).getByRole('button', { name: '行程', exact: true }).click();
    assert.equal(await plan.locator('.plan-timeline-leg.is-selected').getAttribute('data-leg-id'), 'daba-d2-leg6');
    assert.equal(await page.getByRole('navigation', { name: '行程日期', exact: true }).getByRole('button').nth(1).getAttribute('aria-pressed'), 'true');
    await selectLeg(plan.locator('.plan-timeline-leg').nth(3));
    assert.equal(await plan.locator('.plan-timeline-leg.is-selected').getAttribute('data-leg-id'), secondSelection);
    for (const width of [390, 360]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 640 });
      const metrics = await dimensions(page); assert.ok(metrics.body <= width); assert.ok(metrics.scroll <= metrics.page); assert.deepEqual(metrics.tooSmall, []);
      result.checks[`phone${width}`] = metrics;
      await plan.locator('.plan-timeline-leg.is-selected').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(out, `workspace-phone-${width}.png`) });
    }
    assert.equal(await plan.getByRole('button', { name: '白底 SVG', exact: true, includeHidden: true }).count(), 1);
    assert.equal(await plan.getByRole('button', { name: '透明 PNG', exact: true, includeHidden: true }).count(), 1);
    await page.keyboard.press('Escape'); assert.equal(await plan.isVisible(), true);
    result.checks.fullPageAndMobileSelection = true;
    await chooseDay(page, 1); await stored(page);
    await plan.getByRole('button', { name: '返回工具', exact: true }).click();
    await page.getByRole('navigation', { name: '主要工具' }).getByRole('button', { name: '計畫通', exact: true }).click();
    await plan.waitFor(); await expand(plan, '基本資料與留守');
    assert.equal(await plan.getByLabel('隊伍人數', { exact: true }).inputValue(), '4');
    assert.equal(await plan.locator('.workspace-finish strong').innerText(), '15:30');
    result.checks.restoredAfterClose = true;
    await page.reload({ waitUntil: 'domcontentloaded' }); await plan.waitFor(); await expand(plan, '基本資料與留守');
    assert.equal(await plan.getByLabel('隊伍人數', { exact: true }).inputValue(), '4');
    assert.equal(await plan.getByLabel('領隊／負責人', { exact: true }).inputValue(), '測試領隊');
    assert.equal(await plan.locator('.workspace-finish strong').innerText(), '15:30');
    assert.equal((await stored(page)).days[0].water.primary, '待查核測試取水點');
    result.checks.restoredAfterReload = true;
    await stored(page); const before = await page.evaluate(key => localStorage.getItem(key), key);
    await plan.locator('input.plan-input-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"schemaVersion":900}') });
    await plan.getByRole('alert').filter({ hasText: 'JSON 未匯入' }).waitFor();
    assert.equal(await plan.getByLabel('隊伍人數', { exact: true }).inputValue(), '4');
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), before);
    await plan.locator('input.plan-input-file').setInputFiles({ name: 'too-large.json', mimeType: 'application/json', buffer: Buffer.alloc(512 * 1024 + 1, ' ') });
    await plan.getByRole('alert').filter({ hasText: '512 KiB' }).waitFor();
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), before);
    result.checks.invalidAndOversizedImportPreserved = true;
    const jsonPath = await download(page, 'json', 'roundtrip.json');
    const exported = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
    assert.equal(exported.members, 4); assert.equal(exported.days[0].water.availability, 'unknown');
    await plan.getByLabel('隊伍人數', { exact: true }).fill('5'); await stored(page);
    await plan.locator('input.plan-input-file').setInputFiles(jsonPath);
    await page.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(await plan.getByLabel('隊伍人數', { exact: true }).inputValue(), '5');
    await plan.locator('input.plan-input-file').setInputFiles(jsonPath); await confirm(page); await stored(page); await expand(plan, '基本資料與留守');
    const restored = await stored(page);
    for (const field of ['id', 'title', 'routeName', 'startDate', 'members', 'leader', 'leaderPhone', 'days', 'advisories']) assert.deepEqual(restored[field], exported[field]);
    result.checks.jsonRoundtripExplicitReplacement = true;
    const wordPath = await download(page, 'word', 'daba-plan.docx');
    const word = await fs.readFile(wordPath); assert.equal(word.subarray(0, 2).toString(), 'PK');
    result.checks.wordDownloadBytes = word.length;
    const popupPending = page.waitForEvent('popup'); await plan.getByLabel('匯出計畫（固定工具列）', { exact: true }).selectOption('print');
    const popup = await popupPending; await popup.waitForSelector('main h1');
    assert.equal(await popup.locator('html').getAttribute('lang'), 'zh-Hant');
    assert.ok((await popup.locator('main h1').innerText()).includes(exported.title));
    await popup.close(); result.checks.printReady = true;
    await plan.getByLabel('路線名稱', { exact: true }).fill('測試改名的非官方行程');
    const renamed = await stored(page); assert.equal(renamed.referenceRouteId, null); assert.equal(renamed.advisories.length, 1);
    assert.equal(await plan.locator('.plan-section').filter({ has: plan.locator('summary', { hasText: /^大霸目前收錄的步道公告$/ }) }).count(), 0);
    result.checks.renameDetachesLiveNoticesAndKeepsSnapshots = true;
    await plan.getByRole('button', { name: '選擇路線', exact: true }).click();
    await expand(plan, '空白計畫與匯入');
    const chooserPending = page.waitForEvent('filechooser'); await plan.getByRole('button', { name: '匯入 GPX 路線', exact: true }).click();
    const chooser = await chooserPending; await chooser.setFiles({ name: '測試自訂路線.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from('<gpx><trk><name>測試自訂路線</name><trkseg><trkpt lat="24.4" lon="121.2"/><trkpt lat="24.41" lon="121.21"/></trkseg></trk></gpx>') });
    await plan.waitFor({ state: 'hidden' });
    await page.getByRole('navigation', { name: '主要工具' }).getByRole('button', { name: '計畫通', exact: true }).click(); await plan.waitFor();
    await plan.getByRole('button', { name: '選擇路線', exact: true }).click(); await expand(plan, '空白計畫與匯入');
    await plan.getByRole('button', { name: '使用目前 GPX', exact: true }).click(); await confirm(page);
    const custom = await stored(page);
    assert.equal(custom.referenceRouteId, null); assert.equal(custom.routeName, '測試自訂路線'); assert.equal(custom.days[0].water.primary, ''); assert.equal(custom.days[0].lodging.name, ''); assert.equal(custom.advisories.length, 0);
    result.checks.gpxDidNotInheritDaba = true;
    await plan.getByRole('button', { name: '返回工具', exact: true }).click(); await plan.waitFor({ state: 'hidden' });
    await page.getByRole('navigation', { name: '主要工具' }).getByRole('button', { name: '集水區', exact: true }).click(); assert.ok(page.url().includes('layer=basins'));
    await page.getByRole('navigation', { name: '主要工具' }).getByRole('button', { name: '雨量', exact: true }).click(); assert.ok(page.url().includes('layer=weather'));
    assert.ok(!requests.some(request => !['GET', 'HEAD'].includes(request.method) || /測試領隊|0000000000/.test(request.url + (request.body || ''))));
    result.checks.localOnlyAndTopNavigation = true; await context.close();

    // Regression: an editor mounted by Export must not scroll back to the itinerary.
    const phoneEntryResults = [];
    for (const width of [390, 360]) {
      const entryContext = await newContext(browser, { viewport: { width, height: width === 390 ? 844 : 640 }, isMobile: true, hasTouch: true });
      const entry = await openPlan(entryContext), entryPlan = entry.locator('.plan-page');
      await entry.locator('.plan-catalog').waitFor(); await entry.waitForTimeout(450);
      assert.equal(await entry.evaluate(key => localStorage.getItem(key), key), null);
      assert.equal(await entry.locator('.plan-workspace-root').count(), 0);
      const exportPosition = async name => {
        await entryPlan.getByRole('button', { name: '儲存／匯出', exact: true }).click();
        await entry.locator('#plan-export-section').waitFor(); await entry.waitForTimeout(350);
        const position = await entry.evaluate(() => {
          const section = document.querySelector('#plan-export-section').getBoundingClientRect();
          const heading = document.querySelector('#plan-export-title').getBoundingClientRect();
          const footerTop = document.querySelector('.plan-footer').getBoundingClientRect().top;
          return { top: section.top, bottom: section.bottom, headingTop: heading.top, headingBottom: heading.bottom, footerTop, active: document.activeElement.id };
        });
        assert.equal(position.active, 'plan-export-section');
        assert.ok(position.headingTop >= 112 && position.headingBottom < position.footerTop, `Export heading must remain visible after mounting the workspace: ${JSON.stringify(position)}`);
        await entry.screenshot({ path: path.join(out, `workspace-export-${name}-${width}.png`) });
        return position;
      };
      const blankExport = await exportPosition('blank');
      assert.equal(await entry.evaluate(key => localStorage.getItem(key), key), null, 'Opening Export from the route library must not create a draft');
      await entryPlan.getByRole('button', { name: '選擇路線', exact: true }).click(); await chooseDaba(entry); await entry.waitForTimeout(450);
      const firstScreen = await entry.evaluate(() => {
        const row = document.querySelector('.plan-timeline-leg');
        const footerTop = document.querySelector('.plan-footer').getBoundingClientRect().top;
        const review = document.querySelector('.plan-feasibility-review');
        return { width: innerWidth, height: innerHeight, workspaceTop: document.querySelector('.plan-workspace-root').getBoundingClientRect().top,
          firstLegTop: row.getBoundingClientRect().top, footerTop,
          firstLegVisible: row.getBoundingClientRect().top < footerTop,
          hasPlanningReview: !!review,
          planningReviewVisible: !!review && review.getBoundingClientRect().top < footerTop && review.getBoundingClientRect().bottom > document.querySelector('.plan-page').getBoundingClientRect().top,
          selectedLegs: document.querySelectorAll('.plan-timeline-leg.is-selected').length,
          minuteInputs: document.querySelectorAll('.timeline-quick-fields input').length,
          scrollTop: document.querySelector('.plan-page').scrollTop, documentWidth: document.documentElement.scrollWidth, pageWidth: document.querySelector('.plan-page').scrollWidth };
      });
      // Templates with a documented feasibility review intentionally keep that
      // warning ahead of the itinerary; ordinary entries still enter at the day.
      if (firstScreen.hasPlanningReview) assert.equal(firstScreen.planningReviewVisible, true);
      else assert.equal(firstScreen.firstLegVisible, true);
      assert.equal(firstScreen.selectedLegs, 0, 'The phone first screen opens in reading mode');
      assert.equal(firstScreen.minuteInputs, 0, 'Minute fields appear only after selecting a route');
      assert.equal(firstScreen.documentWidth, width); await entry.screenshot({ path: path.join(out, `workspace-firstscreen-${width}.png`) });
      await entryPlan.getByRole('button', { name: '選擇路線', exact: true }).click();
      const existingExport = await exportPosition('existing');
      phoneEntryResults.push({ ...firstScreen, catalogDoesNotCreateDraft: true, blankCatalogExport: blankExport, existingCatalogExport: existingExport });
      await entryContext.close();
    }
    result.checks.mobileFirstScreenAndExportJump = phoneEntryResults;
    let previousFirstScreens = [];
    try { previousFirstScreens = JSON.parse(await fs.readFile(path.join(out, 'firstscreen-result.json'), 'utf8')).filter(item => item.width > 1000); } catch {}
    await fs.writeFile(path.join(out, 'firstscreen-result.json'), JSON.stringify([...previousFirstScreens, ...phoneEntryResults], null, 2));

    const desktopContext = await newContext(browser, { viewport: { width: 1440, height: 1000 } });
    const desktop = await openPlan(desktopContext); await chooseDaba(desktop);
    const timelineBounds = await desktop.locator('.plan-itinerary-pane').boundingBox(), routeBounds = await desktop.locator('.plan-route-pane').boundingBox();
    assert.ok(timelineBounds && routeBounds && timelineBounds.x + timelineBounds.width <= routeBounds.x);
    assert.ok(Math.abs(timelineBounds.y - routeBounds.y) < 2);
    const desktopMetrics = await dimensions(desktop); assert.ok(desktopMetrics.page >= 1438); assert.ok(desktopMetrics.body <= 1440);
    await desktop.screenshot({ path: path.join(out, 'workspace-desktop.png') }); result.checks.desktop = { ...desktopMetrics, sideBySide: true }; await desktopContext.close();

    const corruptContext = await newContext(browser, { viewport: { width: 390, height: 844 } });
    await corruptContext.addInitScript(({ key }) => { if (!/^https?:$/.test(location.protocol)) return; if (sessionStorage.getItem('qa-corrupt-seeded') !== 'yes') { localStorage.setItem(key, '{broken-original'); sessionStorage.setItem('qa-corrupt-seeded', 'yes'); } }, { key });
    const corrupt = await openPlan(corruptContext);
    await corrupt.getByRole('alert').filter({ hasText: '停止自動覆寫' }).waitFor(); await corrupt.waitForTimeout(700);
    assert.equal(await corrupt.evaluate(key => localStorage.getItem(key), key), '{broken-original');
    const backupPending = corrupt.waitForEvent('download'); await corrupt.getByRole('button', { name: '下載原始備份', exact: true }).click();
    const backup = await backupPending; await backup.saveAs(path.join(out, 'corrupt-original.json'));
    assert.equal(await fs.readFile(path.join(out, 'corrupt-original.json'), 'utf8'), '{broken-original');
    await corrupt.locator('[data-template-id=daba]').getByRole('button', { name: '使用此範本', exact: true }).click();
    await corrupt.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(await corrupt.evaluate(key => localStorage.getItem(key), key), '{broken-original');
    await chooseDaba(corrupt); assert.equal((await stored(corrupt)).referenceRouteId, '027');
    result.checks.corruptPreservedAndExplicitlyRebuilt = true; await corruptContext.close();

    const deniedContext = await newContext(browser, { viewport: { width: 390, height: 844 } });
    await deniedContext.addInitScript(() => { Storage.prototype.setItem = function () { throw new DOMException('QA quota denied', 'QuotaExceededError'); }; });
    const denied = await openPlan(deniedContext); await chooseDaba(denied); await expand(denied.locator('.plan-page'), '基本資料與留守');
    await denied.getByLabel('計畫名稱', { exact: true }).fill('儲存失敗測試');
    await denied.getByRole('alert').filter({ hasText: '本機儲存失敗' }).waitFor();
    await denied.getByRole('navigation', { name: '主要工具' }).getByRole('button', { name: '雨量', exact: true }).click();
    await denied.getByRole('alertdialog').filter({ hasText: '尚未保存最新輸入' }).waitFor();
    assert.equal(await denied.locator('.plan-page').isVisible(), true); await denied.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(await denied.getByLabel('計畫名稱', { exact: true }).inputValue(), '儲存失敗測試');
    await denied.locator('a.brand').click(); await denied.getByRole('alertdialog').filter({ hasText: '尚未保存最新輸入' }).waitFor();
    await denied.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click();
    const deniedJson = await download(denied, 'json', 'quota-memory-draft.json'); assert.equal(JSON.parse(await fs.readFile(deniedJson, 'utf8')).title, '儲存失敗測試');
    await denied.getByRole('button', { name: '選擇路線', exact: true }).click(); await expand(denied.locator('.plan-page'), '空白計畫與匯入');
    let chooserOpened = false; denied.on('filechooser', () => { chooserOpened = true; });
    await denied.getByRole('button', { name: '匯入 GPX 路線', exact: true }).click();
    await denied.getByRole('alert').filter({ hasText: '離開前未能保存最新輸入' }).waitFor(); await denied.waitForTimeout(300); assert.equal(chooserOpened, false);
    await denied.getByRole('button', { name: '返回工具', exact: true }).click(); await confirm(denied, '仍要關閉');
    await denied.locator('.plan-page').waitFor({ state: 'hidden' });
    result.checks.failedSaveNavigationAndGpxGuard = { headerGuard: true, brandGuard: true, cancelKeepsMemory: true, jsonBackup: true, fileChooserBlocked: true, explicitClose: true }; await deniedContext.close();

    const offlineContext = await newContext(browser, { viewport: { width: 390, height: 844 } });
    const offline = await openPlan(offlineContext); await chooseDaba(offline); await expand(offline.locator('.plan-page'), '基本資料與留守');
    await offlineContext.setOffline(true); await offline.getByLabel('計畫名稱', { exact: true }).fill('離線記憶體草稿測試');
    const offlineJson = await download(offline, 'json', 'offline-draft.json'); assert.equal(JSON.parse(await fs.readFile(offlineJson, 'utf8')).title, '離線記憶體草稿測試');
    result.checks.offlineJsonWithoutExportChunk = true; await offlineContext.close();

    const networkContext = await newContext(browser, {}, true);
    const network = await openPlan(networkContext); await chooseDaba(network);
    await expand(network.locator('.plan-page'), '大霸目前收錄的步道公告');
    await network.getByText('目前無法更新公告；下方可能是先前資料，請核對來源。', { exact: true }).waitFor();
    assert.equal(await network.locator('.plan-advisory').count(), 0); assert.equal(await network.getByRole('button', { name: '附入目前公告快照', exact: true }).isDisabled(), true);
    await network.getByLabel('起走時間', { exact: true }).fill('06:00'); assert.equal(await network.getByLabel('起走時間', { exact: true }).inputValue(), '06:00');
    result.checks.sourceFailureIsExplicitAndEditingWorks = true; await networkContext.close();

    const chunkContext = await newContext(browser, { viewport: { width: 390, height: 844 } });
    await chunkContext.route(/\/(?:src\/components\/PlanPanel\.tsx|assets\/PlanPanel-[^/]+\.js)(?:\?.*)?$/, route => route.abort('failed'));
    const chunk = await chunkContext.newPage(); await chunk.goto(base + '/?layer=conditions');
    await chunk.getByRole('button', { name: '計畫通', exact: true }).click();
    await chunk.getByRole('alert').filter({ hasText: '計畫編輯器暫時無法開啟' }).waitFor();
    assert.equal(await chunk.locator('.header-nav button:visible').count(), 5);
    await chunk.locator('.planner-loading').getByRole('button', { name: '關閉', exact: true }).click();
    await chunk.getByRole('button', { name: '集水區', exact: true }).click(); assert.ok(chunk.url().includes('layer=basins'));
    result.checks.chunkFailurePreservesNavigation = true; await chunkContext.close();
    assert.deepEqual(result.pageErrors, []);
  } catch (error) { result.failure = { message: error.message, stack: error.stack }; throw error; }
  finally { await browser.close(); await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); }
  console.log(JSON.stringify(result, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
