/* Full-page route catalogue QA; isolated browser storage, no official-link crawling. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const base = process.env.MT_INFO_QA_URL || 'http://127.0.0.1:5173';
const out = path.resolve(process.env.MT_INFO_CATALOG_QA_OUT || 'artifacts/plan-catalog');
const key = 'mt-info-plan-v1';
const result = { base, checkedAt: new Date().toISOString(), checks: {}, screenshots: [], pageErrors: [] };
const routeIds = page => page.locator('.pc-template-card').evaluateAll(nodes => nodes.map(node => node.dataset.templateId));
const resourceIds = page => page.locator('.pc-node-grid [data-resource-id]').evaluateAll(nodes => nodes.map(node => node.dataset.resourceId));
const catalogue = JSON.parse(execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
  import { PLAN_TEMPLATES, PLAN_RESOURCES, findPlanTemplates, searchPlanResources } from './src/plan/catalog.ts';
  const queries = ['', '天池', '臺中', '台中', '松蘿', '松羅', '加羅', '加蘿'];
  const routeSearches = Object.fromEntries(queries.map(query => [query, findPlanTemplates(query).map(route => route.id)]));
  const resourceSearches = Object.fromEntries(queries.map(query => [query, searchPlanResources(query).map(resource => resource.id)]));
  console.log(JSON.stringify({ templates: PLAN_TEMPLATES, resources: PLAN_RESOURCES, routeSearches, resourceSearches }));
`], { encoding: 'utf8', cwd: process.cwd() }));
const templateById = new Map(catalogue.templates.map(template => [template.id, template]));
const mountainRanges = [...new Set(catalogue.templates.map(template => template.mountainRange))];
const middleTemplates = catalogue.templates.filter(template => template.category === '中級山');
const categories = ['all', '百岳', '中級山'];
function expectedRoutes(category = 'all', range = 'all') {
  return catalogue.templates.filter(route => (category === 'all' || route.category === category) && (range === 'all' || route.mountainRange === range)).map(route => route.id);
}
function expectedResources(category = 'all', range = 'all', type = 'all') {
  return catalogue.resources.filter(resource => (type === 'all' || resource.type === type) && (category === 'all' && range === 'all' || resource.routeIds.some(routeId => {
    const route = templateById.get(routeId);
    return route && (category === 'all' || route.category === category) && (range === 'all' || route.mountainRange === range);
  }))).map(resource => resource.id);
}
async function saved(page, routeName) {
  await page.waitForFunction(({ key, routeName }) => {
    try { const draft = JSON.parse(localStorage.getItem(key)); return draft?.routeName === routeName; } catch { return false; }
  }, { key, routeName });
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
}
async function shot(page, name) {
  await page.screenshot({ path: path.join(out, name), type: 'jpeg', quality: 88 });
  result.screenshots.push(name);
}
async function openBasics(plan) {
  const basics = plan.locator('.workspace-secondary > .plan-section').filter({ hasText: '基本資料與留守' });
  if (!await basics.evaluate(node => node.open)) await basics.locator('summary').first().click();
  await plan.getByLabel('路線名稱', { exact: true }).waitFor({ state: 'visible' });
}
async function layout(page) {
  return page.locator('.plan-page').evaluate(node => ({
    width: innerWidth, bodyWidth: document.documentElement.scrollWidth, pageWidth: node.clientWidth, pageScrollWidth: node.scrollWidth,
    nestedScroll: [...node.querySelectorAll('*')].filter(child => child.checkVisibility() && /^(auto|scroll)$/.test(getComputedStyle(child).overflowY) && child.scrollHeight > child.clientHeight + 1).map(child => child.className),
    smallTargets: [...node.querySelectorAll('button,summary,input,select')].filter(child => child.checkVisibility() && !child.matches('[type=file]') && child.getBoundingClientRect().height < 47.9).map(child => ({ text: child.getAttribute('aria-label') || child.textContent, height: child.getBoundingClientRect().height })),
  }));
}
async function assertUnknownDraft(draft, template) {
  assert.equal(draft.routeName, template.routeName);
  assert.equal(draft.days.length, template.referenceDays);
  assert.equal(draft.referenceRouteId, template.referenceRouteId);
  assert.equal(draft.members, null);
  assert.equal(draft.startDate, '');
  assert.equal(draft.leaderPhone, '');
  assert.ok(draft.notes.includes(template.mountainRange));
  assert.ok(template.sourceUrls.every(url => draft.notes.includes(url)));
  assert.ok(draft.days.every(day => day.water.availability === 'unknown' && day.water.perPersonL === null && day.lodging.reservation !== 'approved' && day.legs.every(leg => leg.minutes === null)));
  assert.ok(draft.days.every(day => day.water.note.includes('未知') || day.water.note.includes('尚無已核實')));
}
(async () => {
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    assert.ok(middleTemplates.length >= 3, 'The library must offer at least three multi-day middle-mountain frameworks');
    assert.ok(middleTemplates.every(route => route.referenceDays >= 2 && route.days.length >= 2));
    assert.ok(catalogue.templates.every(route => route.category === '百岳' || route.category === '中級山'));
    for (const oldDayRoute of ['tangmadan', 'malun']) assert.equal(templateById.has(oldDayRoute), false, `${oldDayRoute} must not remain a middle-mountain multi-day option`);
    assert.ok(mountainRanges.length > 1 && mountainRanges.every(Boolean));
    result.checks.catalogueIntent = { routes: catalogue.templates.length, resources: catalogue.resources.length, middle: middleTemplates.map(route => ({ id: route.id, days: route.referenceDays, mountainRange: route.mountainRange })), mountainRanges, removedSingleDayRoutes: true };
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', error => result.pageErrors.push(error.message));
    const mutations = [], equipment = [];
    page.on('request', req => {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) mutations.push(req.url());
      if (new URL(req.url()).pathname.startsWith('/api/equipment')) equipment.push(req.url());
    });
    await page.goto(`${base}/?layer=conditions&plan=1`, { waitUntil: 'domcontentloaded' });
    const plan = page.locator('.plan-page');
    await plan.waitFor();
    const catalog = plan.locator('.plan-catalog');
    await catalog.waitFor();
    const category = catalog.getByRole('group', { name: '路線分類', exact: true });
    const mode = catalog.getByRole('group', { name: '範本與資源檢視', exact: true });
    const search = catalog.getByRole('searchbox', { name: '搜尋路線、山脈或資源', exact: true });
    const range = catalog.getByRole('combobox', { name: '山脈', exact: true });
    const resourceType = catalog.getByRole('combobox', { name: '資源類型', exact: true });
    const setCategory = value => category.getByRole('button', { name: value === 'all' ? '全部路線' : value, exact: true }).click();
    const setMode = value => mode.getByRole('button', { name: value === 'routes' ? '路線範本' : '水源與宿營', exact: true }).click();
    assert.equal(await page.locator('canvas.maplibregl-canvas').count(), 0);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), null, 'Browsing templates must not create a draft');
    const allRouteIds = await routeIds(page);
    assert.deepEqual(allRouteIds, catalogue.templates.map(template => template.id));
    assert.equal(new Set(allRouteIds).size, allRouteIds.length);
    assert.equal(await catalog.locator('.pc-template-coverage').count(), catalogue.templates.length);
    assert.match(await catalog.locator('[data-template-id="daba"] .pc-template-coverage').innerText(), /部分參考軌跡.*17／17 段/s);
    assert.match(await catalog.locator('[data-template-id="shuanling-three-days"] .pc-template-coverage').innerText(), /軌跡待補.*12／12 段/s);
    assert.equal(await category.getByRole('button', { name: '高山健行', exact: true }).count(), 0);
    assert.deepEqual(await range.locator('option').evaluateAll(nodes => nodes.map(node => node.value)), ['all', ...mountainRanges]);
    result.checks.initial = { routeCount: allRouteIds.length, fullPage: true, noImplicitDraft: true, onlyTwoCategories: true, rangeOptionsMatchLibrary: true, coverageLabels: true };
    for (const size of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 360, height: 640 }]) {
      await page.setViewportSize(size);
      await plan.evaluate(node => node.scrollTo({ top: 0 }));
      const dimensions = await layout(page);
      assert.equal(dimensions.bodyWidth, size.width);
      assert.equal(dimensions.pageScrollWidth, dimensions.pageWidth);
      assert.deepEqual(dimensions.nestedScroll, []);
      assert.deepEqual(dimensions.smallTargets, []);
      const fonts = await plan.evaluate(node => {
        const font = selector => parseFloat(getComputedStyle(node.querySelector(selector)).fontSize);
        return { title: font('h1'), body: font('.plan-catalog'), meta: font('.pc-reference-note'), search: font('.pc-search input'), range: font('.pc-range-filter select') };
      });
      assert.equal(fonts.title, size.width <= 760 ? 30 : 36, 'Page titles follow the shared desktop/mobile scale');
      assert.equal(fonts.body, 16);
      assert.ok(fonts.meta >= 16, 'The full reference/limitation paragraph is body text; keep it at least 16px');
      assert.ok(fonts.search >= 16 && fonts.range >= 16);
      result.checks[`layout${size.width}`] = { ...dimensions, fonts };
      await shot(page, `catalog-${size.width}.jpg`);
      const notice = catalog.locator('.pc-access-notice').first();
      assert.equal(await catalog.locator('.pc-access-notice').count(), catalogue.templates.filter(template => template.accessNotice).length);
      const noticeLayout = await notice.evaluate(node => {
        const box = node.getBoundingClientRect();
        return { font: parseFloat(getComputedStyle(node).fontSize), left: box.left, right: box.right, width: node.clientWidth, scrollWidth: node.scrollWidth, text: node.textContent };
      });
      assert.ok(noticeLayout.left >= 0 && noticeLayout.right <= size.width);
      assert.equal(noticeLayout.scrollWidth, noticeLayout.width);
      assert.ok(noticeLayout.font >= 16, 'Access restrictions are body text; keep them at least 16px');
      assert.ok(noticeLayout.text.includes('非即時'));
      result.checks[`notice${size.width}`] = noticeLayout;
      await notice.scrollIntoViewIfNeeded();
      await shot(page, `catalog-notice-${size.width}.jpg`);
    }
    const routeMatrix = [];
    for (const selectedRange of ['all', ...mountainRanges]) {
      await range.selectOption(selectedRange);
      for (const selectedCategory of categories) {
        await setCategory(selectedCategory);
        const actual = await routeIds(page);
        const expected = expectedRoutes(selectedCategory, selectedRange);
        assert.deepEqual(actual, expected);
        routeMatrix.push({ category: selectedCategory, mountainRange: selectedRange, count: actual.length });
      }
    }
    await setCategory('all');
    await range.selectOption('all');
    const routeSearches = {};
    for (const query of ['天池', '臺中', '台中', '松蘿', '松羅', '加羅', '加蘿']) {
      await search.fill(query);
      const ids = await routeIds(page);
      assert.deepEqual(ids, catalogue.routeSearches[query]);
      routeSearches[query] = ids;
    }
    assert.ok(routeSearches['天池'].includes('qilai-nanhua'));
    assert.ok(routeSearches['臺中'].length > 0);
    assert.deepEqual(routeSearches['台中'], routeSearches['臺中']);
    assert.ok(routeSearches['松蘿'].length > 0 && routeSearches['加羅'].length > 0);
    assert.deepEqual(routeSearches['松羅'], routeSearches['松蘿']);
    assert.deepEqual(routeSearches['加蘿'], routeSearches['加羅']);
    const middle = middleTemplates.find(route => route.id === 'songluo-lake') || middleTemplates[0];
    await search.fill(middle.name);
    await setCategory('中級山');
    await range.selectOption(middle.mountainRange);
    assert.deepEqual(await routeIds(page), [middle.id]);
    await setMode('resources');
    assert.equal(await search.inputValue(), middle.name);
    assert.equal(await range.inputValue(), middle.mountainRange);
    assert.equal(await category.getByRole('button', { name: '中級山', exact: true }).getAttribute('aria-pressed'), 'true');
    await resourceType.selectOption('water');
    const middleWaters = await resourceIds(page);
    assert.ok(middleWaters.length > 0);
    assert.ok(middleWaters.every(id => catalogue.resources.some(resource => resource.id === id && resource.type === 'water' && resource.routeIds.includes(middle.id))));
    await shot(page, 'catalog-middle-water-filter-360.jpg');
    await setMode('routes');
    assert.deepEqual(await routeIds(page), [middle.id]);
    await setMode('resources');
    assert.equal(await resourceType.inputValue(), 'water');
    assert.deepEqual(await resourceIds(page), middleWaters);
    await search.fill('__qa_no_match__');
    assert.equal((await resourceIds(page)).length, 0);
    await catalog.getByRole('button', { name: '清除篩選', exact: true }).click();
    assert.equal(await search.inputValue(), '');
    assert.equal(await range.inputValue(), 'all');
    assert.equal(await resourceType.inputValue(), 'all');
    assert.equal(await category.getByRole('button', { name: '全部路線', exact: true }).getAttribute('aria-pressed'), 'true');
    const allResourceIds = await resourceIds(page);
    assert.deepEqual(allResourceIds, catalogue.resources.map(resource => resource.id));
    assert.equal(new Set(allResourceIds).size, allResourceIds.length);
    result.checks.routeSearchCategoryRangeAndReset = { matrix: routeMatrix, searches: routeSearches, combination: { route: middle.id, mountainRange: middle.mountainRange, waterIds: middleWaters }, modePreservesFilters: true, emptyResultResetClearsAllFour: true };
    const resourceMatrix = [];
    for (const selectedRange of ['all', ...mountainRanges]) {
      await range.selectOption(selectedRange);
      for (const selectedCategory of categories) {
        await setCategory(selectedCategory);
        await resourceType.selectOption('water');
        const actual = await resourceIds(page);
        assert.deepEqual(actual, expectedResources(selectedCategory, selectedRange, 'water'));
        assert.equal(new Set(actual).size, actual.length);
        resourceMatrix.push({ category: selectedCategory, mountainRange: selectedRange, type: 'water', count: actual.length });
      }
    }
    await setCategory('all');
    await range.selectOption('all');
    await resourceType.selectOption('all');
    const resourceSearches = {};
    for (const query of ['臺中', '台中', '松蘿', '松羅', '加羅', '加蘿']) {
      await search.fill(query);
      const ids = await resourceIds(page);
      assert.deepEqual(ids, catalogue.resourceSearches[query]);
      resourceSearches[query] = ids;
    }
    assert.deepEqual(resourceSearches['台中'], resourceSearches['臺中']);
    assert.deepEqual(resourceSearches['松羅'], resourceSearches['松蘿']);
    assert.deepEqual(resourceSearches['加蘿'], resourceSearches['加羅']);
    await search.fill('');
    const shared = catalogue.resources.find(resource => resource.routeIds.filter(id => templateById.has(id)).length > 1);
    assert.ok(shared, 'A shared resource should remain deduplicated across routes');
    assert.equal(await catalog.locator(`.pc-node-grid [data-resource-id="${shared.id}"]`).count(), 1);
    const sharedCard = catalog.locator(`.pc-node-grid [data-resource-id="${shared.id}"]`);
    await sharedCard.locator('summary').click();
    const sharedText = await sharedCard.innerText();
    assert.ok(sharedText.includes('現況未知'));
    assert.ok(shared.routeIds.every(id => !templateById.has(id) || sharedText.includes(templateById.get(id).name)));
    result.checks.sharedResourceDedupTypeAndRange = { total: allResourceIds.length, matrix: resourceMatrix, shared: shared.id, relatedRoutes: shared.routeIds, searches: resourceSearches };
    await setMode('routes');
    assert.deepEqual(await routeIds(page), allRouteIds);
    const daba = catalog.locator('[data-template-id="daba"]');
    await daba.locator('.pc-template-details > summary').click();
    assert.equal(await daba.locator('.pc-route-outline li').count(), templateById.get('daba').referenceDays);
    const publicLinks = await daba.locator('a[href]').evaluateAll(nodes => nodes.map(node => ({ href: node.href, rel: node.rel })));
    assert.ok(publicLinks.length >= 4 && publicLinks.every(link => /^https:\/\//.test(link.href) && link.rel.includes('noopener')));
    const inlineIds = await daba.locator('[data-resource-id]').evaluateAll(nodes => nodes.map(node => node.dataset.resourceId));
    assert.equal(new Set(inlineIds).size, inlineIds.length);
    await daba.locator('[data-resource-id]').first().locator('summary').click();
    const inlineText = await daba.locator('[data-resource-id]').first().innerText();
    assert.ok(inlineText.includes('現況未知') && inlineText.includes('資料查核') && inlineText.includes('現地觀測'));
    const bijiTemplate = catalogue.templates.find(template => template.sourceUrls.some(url => new URL(url).hostname === 'hiking.biji.co'));
    assert.ok(bijiTemplate, 'Expanded references should include traceable Hiking Biji introductions');
    const bijiCard = catalog.locator(`[data-template-id="${bijiTemplate.id}"]`);
    if (!await bijiCard.locator('.pc-template-details').evaluate(node => node.open)) await bijiCard.locator('.pc-template-details > summary').click();
    const bijiLinks = await bijiCard.locator('.pc-route-sources a[href*="hiking.biji.co"]').evaluateAll(nodes => nodes.map(node => ({ text: node.textContent, href: node.href, rel: node.rel })));
    assert.ok(bijiLinks.length > 0 && bijiLinks.every(link => link.text.includes('健行筆記') && link.rel.includes('noopener')));
    result.checks.referenceLinksAndSourceTimes = { dabaLinks: publicLinks.length, inlineResources: inlineIds.length, unknownAvailability: true, hikingBiji: bijiLinks };
    await shot(page, 'catalog-route-expanded-360.jpg');
    const xueshan = catalog.locator('[data-template-id="xueshan"]');
    await xueshan.getByRole('button', { name: '使用此範本', exact: true }).click();
    assert.equal(await catalog.isVisible(), true);
    await plan.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), null);
    await xueshan.getByRole('button', { name: '使用此範本', exact: true }).click();
    await plan.getByRole('alertdialog').getByRole('button', { name: '確認取代', exact: true }).click();
    await plan.locator('.plan-day-tabs button').first().waitFor();
    await openBasics(plan);
    const routeName = await plan.getByLabel('路線名稱', { exact: true }).inputValue();
    const draft = await saved(page, routeName);
    await assertUnknownDraft(draft, templateById.get('xueshan'));
    assert.ok(draft.days[0].water.primary.includes('七卡'));
    assert.ok(draft.days[1].lodging.name.includes('三六九'));
    assert.equal(draft.days[1].lodging.reservation, 'planned');
    assert.equal(await plan.locator('.plan-day-tabs button').count(), templateById.get('xueshan').referenceDays);
    assert.ok(await plan.locator('.plan-official-links a').count());
    const secondDay = plan.locator('.plan-day-tabs button').nth(1);
    assert.equal(await secondDay.getAttribute('aria-pressed'), 'false');
    await secondDay.click();
    assert.equal(await secondDay.getAttribute('aria-pressed'), 'true');
    assert.ok((await plan.locator('.workspace-day-number').innerText()).includes('第 2 天'));
    assert.ok((await plan.locator('.workspace-resources').innerText()).includes(draft.days[1].lodging.name));
    const position = await plan.locator('.workspace-day-header').boundingBox();
    assert.ok(position && position.y >= 0 && position.y < 640);
    assert.equal(await page.locator('.header-nav').isVisible(), true);
    await shot(page, 'plan-day-jump-360.jpg');
    result.checks.templateCreatesEditableUnknownDraft = { routeName, days: draft.days.length, water: draft.days.map(day => day.water.primary), lodging: draft.days.map(day => day.lodging.name), explicitReplacement: true, editDayJump: true };
    const jsonPromise = page.waitForEvent('download');
    await plan.getByLabel('匯出計畫（固定工具列）').selectOption('json');
    const jsonDownload = await jsonPromise;
    const jsonPath = path.join(out, 'xueshan-roundtrip.json');
    await jsonDownload.saveAs(jsonPath);
    const exported = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
    assert.equal(exported.routeName, draft.routeName);
    assert.deepEqual(exported.days, draft.days);
    await plan.locator('.plan-input-file').setInputFiles(jsonPath);
    await plan.getByRole('alertdialog').getByRole('button', { name: '確認取代', exact: true }).click();
    const restored = await saved(page, routeName);
    assert.deepEqual(restored.days, exported.days);
    const wordPromise = page.waitForEvent('download');
    await plan.getByLabel('匯出計畫（固定工具列）').selectOption('word');
    const wordDownload = await wordPromise;
    const wordPath = path.join(out, 'xueshan-plan.docx');
    await wordDownload.saveAs(wordPath);
    const documentXml = execFileSync('/usr/bin/unzip', ['-p', wordPath, 'word/document.xml'], { encoding: 'utf8' });
    assert.ok(documentXml.includes('七卡山莊／營地供水記錄') && documentXml.includes('三六九臨時營地') && documentXml.includes(exported.days[0].water.sourceUrl.replaceAll('&', '&amp;')));
    assert.ok(documentXml.includes('未查核') && documentXml.includes('規劃中'));
    result.checks.catalogJsonRoundtripAndWord = { days: exported.days.length, wordBytes: (await fs.stat(wordPath)).size, waterAndSourceUrlInOoxml: true, unknownAndPlannedStatuses: true };
    await plan.getByRole('button', { name: '選擇路線', exact: true }).click();
    await catalog.waitFor();
    await plan.locator('.plan-input-file').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"schemaVersion":999}') });
    await plan.getByRole('alert').filter({ hasText: 'JSON 未匯入' }).waitFor();
    assert.equal((await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key)).routeName, routeName);
    result.checks.jsonImportAvailableFromCatalog = true;
    await catalog.locator(`[data-template-id="${middle.id}"]`).getByRole('button', { name: '使用此範本', exact: true }).click();
    await plan.getByRole('alertdialog').getByRole('button', { name: '確認取代', exact: true }).click();
    await plan.locator('.plan-day-tabs button').first().waitFor();
    const middleDraft = await saved(page, middle.routeName);
    await assertUnknownDraft(middleDraft, middle);
    assert.ok(middleDraft.days.length >= 2);
    assert.ok(middleDraft.days.some(day => day.lodging.reservation === 'planned'));
    const middleResources = catalogue.resources.filter(resource => middle.resourceIds.includes(resource.id));
    assert.ok(middleResources.length > 0 && middleResources.every(resource => resource.currentAvailability === 'unknown'));
    const sourceUnknown = middleResources.filter(resource => resource.observedAt === null);
    assert.ok(sourceUnknown.length > 0 && middleDraft.days.some(day => day.water.note.includes('現勘時間未知') || day.water.note.includes('現地觀測 未知') || day.notes.includes('現勘')));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await openBasics(plan);
    await plan.getByLabel('路線名稱', { exact: true }).waitFor();
    const middleReloaded = await saved(page, middle.routeName);
    assert.deepEqual(middleReloaded.days, middleDraft.days);
    assert.equal(await plan.getByLabel('路線名稱', { exact: true }).inputValue(), middle.routeName);
    assert.equal(await plan.locator('.plan-day-tabs button').count(), middle.referenceDays);
    const middleLayout = await layout(page);
    assert.equal(middleLayout.bodyWidth, 360);
    assert.equal(middleLayout.pageScrollWidth, middleLayout.pageWidth);
    assert.deepEqual(middleLayout.nestedScroll, []);
    assert.deepEqual(middleLayout.smallTargets, []);
    await shot(page, 'plan-middle-restored-360.jpg');
    await plan.locator('.workspace-resources').scrollIntoViewIfNeeded();
    const middleOverview = await plan.locator('.workspace-resources').innerText();
    assert.ok(middleOverview.includes('尚未確認') && middleOverview.includes('規劃中'));
    assert.ok(middleOverview.includes(middleDraft.days[0].water.primary) && middleOverview.includes(middleDraft.days[0].lodging.name));
    await shot(page, 'plan-middle-overview-360.jpg');
    result.checks.multiDayMiddleTemplatePersistsUnknowns = { template: middle.id, days: middleDraft.days.length, mountainRangeInNotes: middle.mountainRange, sourceReferences: middle.sourceUrls, unknownObservedResources: sourceUnknown.map(resource => resource.id), sameDaysAfterReload: true, layout: middleLayout };
    await plan.getByRole('button', { name: '選擇路線', exact: true }).click();
    await catalog.waitFor();
    const shuanling = templateById.get('shuanling-three-days');
    await catalog.locator('[data-template-id="shuanling-three-days"]').getByRole('button', { name: '使用此範本', exact: true }).click();
    await plan.getByRole('alertdialog').getByRole('button', { name: '確認取代', exact: true }).click();
    await plan.locator('.plan-day-tabs button').first().waitFor();
    assert.equal(await plan.locator('.plan-day-tabs button').count(), 3);
    assert.equal(await plan.locator('.plan-timeline-leg').count(), 5);
    await plan.getByLabel('起走時間', { exact: true }).fill('06:00');
    await page.waitForFunction(() => document.querySelector('.workspace-finish strong')?.textContent?.trim() === '13:05');
    const firstShuanlingLeg = plan.locator('.plan-timeline-leg').first();
    await firstShuanlingLeg.getByRole('button', { name: /^編輯路段 1：/ }).click();
    assert.match(await firstShuanlingLeg.locator('.timeline-reference').innerText(), /健行筆記編輯參考 100 分/);
    await firstShuanlingLeg.getByLabel('本隊移動（分）', { exact: true }).fill('110');
    await page.waitForFunction(() => document.querySelector('.workspace-finish strong')?.textContent?.trim() === '13:15');
    assert.match(await firstShuanlingLeg.locator('.timeline-reference').innerText(), /健行筆記編輯參考 100 分.*本隊已調整/s);
    await page.waitForFunction(key => {
      try { return JSON.parse(localStorage.getItem(key))?.days?.[0]?.legs?.[0]?.minutes === 110; } catch { return false; }
    }, key);
    const shuanlingSaved = await saved(page, shuanling.routeName);
    assert.equal(shuanlingSaved.days.length, 3);
    assert.deepEqual(shuanlingSaved.days[0].legs.map(leg => leg.minutes), [110, 120, 100, 60, 45]);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await plan.locator('.plan-day-tabs button').first().waitFor();
    assert.equal(await plan.getByLabel('起走時間', { exact: true }).inputValue(), '06:00');
    assert.equal((await plan.locator('.workspace-finish strong').innerText()).trim(), '13:15');
    assert.equal((await saved(page, shuanling.routeName)).days[0].legs[0].minutes, 110);
    await shot(page, 'plan-shuanling-reference-360.jpg');
    result.checks.sourcedRouteReferenceAndSchedule = { template: shuanling.id, days: shuanlingSaved.days.length, sourceMinutes: 100, adjustedMinutes: 110, finishBefore: '13:05', finishAfter: '13:15', persistedAfterReload: true };
    await plan.getByRole('button', { name: '選擇路線', exact: true }).click();
    await catalog.waitFor();
    await catalog.locator('[data-template-id="daba"]').getByRole('button', { name: '使用此範本', exact: true }).click();
    await plan.getByRole('alertdialog').getByRole('button', { name: '確認取代', exact: true }).click();
    await openBasics(plan);
    const originalDabaName = await plan.getByLabel('路線名稱', { exact: true }).inputValue();
    await saved(page, originalDabaName);
    const current = plan.locator('.plan-section').filter({ has: page.locator('summary', { hasText: /^大霸目前收錄的步道公告$/ }) });
    if (!await current.evaluate(node => node.open)) await current.locator('summary').first().click();
    const attach = current.getByRole('button', { name: '附入目前公告快照', exact: true });
    let snapshotCount = 0;
    if (await attach.isEnabled()) {
      await attach.click();
      await page.waitForTimeout(450);
      snapshotCount = (await saved(page, originalDabaName)).advisories.length;
      assert.ok(snapshotCount > 0);
    }
    await plan.getByLabel('路線名稱', { exact: true }).fill('測試已修改的自訂路線');
    const renamed = await saved(page, '測試已修改的自訂路線');
    assert.equal(renamed.referenceRouteId, null);
    assert.equal(renamed.advisories.length, snapshotCount);
    assert.equal(await plan.getByRole('button', { name: '查看路況公告', exact: true }).count(), 0);
    assert.equal(await plan.locator('.plan-section').filter({ has: page.locator('summary', { hasText: /^大霸目前收錄的步道公告$/ }) }).count(), 0);
    result.checks.renameClearsCurrentRouteAssociation = { referenceRouteId: renamed.referenceRouteId, historicalSnapshotsPreserved: snapshotCount };
    assert.deepEqual(equipment, []);
    assert.deepEqual(mutations, []);
    assert.deepEqual(result.pageErrors, []);
    await context.close();
  } catch (error) {
    result.failure = error.stack || error.message;
    throw error;
  } finally {
    await browser.close();
    await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  }
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
