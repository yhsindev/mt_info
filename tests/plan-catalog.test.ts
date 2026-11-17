import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PlanCatalog from '../src/components/PlanCatalog';
import { PLAN_CATALOG_CHECKED_AT, PLAN_RESOURCES, PLAN_TEMPLATES, createPlanFromTemplate, findPlanTemplates, searchPlanResources, templateDataCoverage, templateSegmentReference } from '../src/plan/catalog';
import { calculatePlan, parsePlanDraft } from '../src/plan/model';
import { createDabaPlan } from '../src/plan/reference';
import { LIBRARY_RESEARCH_CHECKED_AT } from '../src/plan/library-expansion';
import { SHEIPA_NEXT_CHECKED_AT } from '../src/plan/library-sheipa-next';
import { CENTRAL_NEXT_CHECKED_AT } from '../src/plan/library-central-next';
import { shangheSheetsForTemplate } from '../src/plan/shanghe-sheets';
import shangheIndex from '../data/route-library/shanghe-source-index.json';
import { formatTime } from '../src/utils';

const NOW = '2026-10-22T09:00:00Z';

describe('traceable multiday route and resource catalog', () => {
  it('offers multiday middle mountains and two independent category/range indexes', () => {
    expect(PLAN_TEMPLATES.length).toBeGreaterThanOrEqual(15);
    expect(new Set(PLAN_TEMPLATES.map(route => route.id)).size).toBe(PLAN_TEMPLATES.length);
    expect(new Set(PLAN_TEMPLATES.map(route => route.category))).toEqual(new Set(['百岳', '中級山']));
    expect(findPlanTemplates('', '中級山').map(route => route.id)).toEqual(['songluo-lake', 'jialuo-lake', 'shuiyang-forest']);
    expect(findPlanTemplates('', '中級山').every(route => route.referenceDays >= 2)).toBe(true);
    expect(PLAN_TEMPLATES.some(route => ['tangmadan', 'malun', 'nenggao-west'].includes(route.id))).toBe(false);
    expect(findPlanTemplates('', '中級山', '中央山脈').map(route => route.id)).toEqual(['jialuo-lake']);
    expect(findPlanTemplates('', '百岳', '阿里山山脈')).toEqual([]);
    expect(findPlanTemplates('', '百岳', '玉山山脈').map(route => route.id)).toEqual(['yushan', 'yushan-main-west']);
    expect(findPlanTemplates('', '百岳', '中央山脈').some(route => route.id === 'kuhanoxin-guanshan')).toBe(true);
    expect(PLAN_TEMPLATES.every(route => route.referenceDays === route.days.length)).toBe(true);
  });

  it('links hundred-peak templates only to publisher-indexed sheets, without adding timing data', () => {
    const publisherLinks = new Set(shangheIndex.sheets.flatMap(sheet => sheet.stepDiagramLinks.map(link => link.url)));
    expect(shangheIndex.timeDataImported).toBe(false);
    for (const template of PLAN_TEMPLATES) {
      const references = shangheSheetsForTemplate(template.id);
      expect(references.length).toBe(template.category === '百岳' ? 1 : 0);
      for (const reference of references) {
        expect(shangheIndex.sheets.some(sheet => sheet.id === reference.id && sheet.title === reference.title)).toBe(true);
        expect(publisherLinks.has(reference.sourceUrl)).toBe(true);
      }
    }
    expect(shangheSheetsForTemplate('jiaming-lake')[0]?.id).toBe('G17');
    expect(shangheSheetsForTemplate('kuhanoxin-guanshan')[0]?.id).toBe('G19');
    expect(shangheSheetsForTemplate('beidawu')[0]?.id).toBe('G20');
    for (const [templateId, sheetId] of [['nanhu', 'G07'], ['qilai-main-north', 'G09']]) {
      expect(shangheSheetsForTemplate(templateId)[0]?.sourceUrl).toBe(shangheIndex.sheets.find(sheet => sheet.id === sheetId)?.stepDiagramLinks.at(-1)?.url);
    }
  });

  it('keeps only actual forestry IDs for condition matching; template IDs remain separate', () => {
    expect(Object.fromEntries(PLAN_TEMPLATES.filter(route => route.referenceRouteId).map(route => [route.id, route.referenceRouteId]))).toEqual({
      daba: '027', 'jiaming-lake': '139', beidawu: '119', 'qilai-nanhua': '064',
    });
    expect(PLAN_TEMPLATES.find(route => route.id === 'yushan')?.referenceRouteId).toBeNull();
  });

  it('deduplicates shared nodes and preserves exact per-template daily relationships', () => {
    const allIds = new Set(PLAN_RESOURCES.map(resource => resource.id));
    expect(allIds.size).toBe(PLAN_RESOURCES.length);
    const tianchi = PLAN_RESOURCES.find(resource => resource.id === 'tianchi-water')!;
    expect(tianchi.routeIds).toEqual(['qilai-nanhua']);
    expect(tianchi.dayIndex).toBeNull();
    expect(PLAN_RESOURCES.find(resource => resource.id === 'jiaming-camp')?.dayIndex).toBe(2);
    for (const route of PLAN_TEMPLATES) {
      expect(new Set(route.resourceIds)).toEqual(new Set(route.days.flatMap(day => day.resourceIds)));
      for (const [index, day] of route.days.entries()) {
        expect(day.stops.length).toBeGreaterThanOrEqual(2);
        for (const id of day.resourceIds) {
          expect(allIds.has(id), `${route.id}, day ${index + 1}: ${id}`).toBe(true);
          expect(PLAN_RESOURCES.find(resource => resource.id === id)?.routeIds).toContain(route.id);
        }
        if (day.lodgingResourceId) {
          expect(day.resourceIds).toContain(day.lodgingResourceId);
          expect(PLAN_RESOURCES.find(resource => resource.id === day.lodgingResourceId)?.type).not.toBe('water');
        }
      }
    }
    // Independently useful official resources need not be attached to a route variant.
    expect(PLAN_RESOURCES.find(resource => resource.id === 'sumida-hut')?.routeIds).toEqual([]);
  });

  it('keeps official and attributed guide sources separate from field observations', () => {
    expect(PLAN_RESOURCES.length).toBeGreaterThanOrEqual(30);
    for (const resource of PLAN_RESOURCES) {
      expect(resource.sourceName).not.toBe('');
      expect(resource.sourceUrls.length).toBeGreaterThan(0);
      expect([PLAN_CATALOG_CHECKED_AT, LIBRARY_RESEARCH_CHECKED_AT, SHEIPA_NEXT_CHECKED_AT, CENTRAL_NEXT_CHECKED_AT]).toContain(resource.checkedAt);
      expect(resource.observedAt).toBe(['siyan-camp', 'baigu-ditch-water', 'baigu-tank-water'].includes(resource.id) ? '2024-05-18' : null);
      expect(resource.currentAvailability).toBe('unknown');
      expect(resource.season).not.toBe('');
      expect(resource.limitations).not.toBe('');
      expect(resource).not.toHaveProperty('latitude');
      expect(resource).not.toHaveProperty('longitude');
      for (const url of resource.sourceUrls) {
        const parsed = new URL(url);
        expect(parsed.protocol).toBe('https:');
        expect(parsed.hostname.endsWith('.gov.tw') || parsed.hostname === 'hiking.biji.co').toBe(true);
      }
    }
    expect(PLAN_RESOURCES.some(resource => resource.name === '三六九山莊')).toBe(false);
    expect(PLAN_RESOURCES.find(resource => resource.id === '369-camp')?.limitations).toContain('舊三六九山莊停止申請');
    expect(PLAN_RESOURCES.find(resource => resource.id === 'paiyun-hut')?.limitations).toContain('無指定露營區');
  });

  it('supports Taiwan spelling, multiword queries, source/season and route resource searching', () => {
    expect(findPlanTemplates('台中 四秀').map(route => route.id)).toEqual(['wuling-four']);
    expect(findPlanTemplates('松羅湖').map(route => route.id)).toEqual(['songluo-lake']);
    expect(findPlanTemplates('松蘿湖').map(route => route.id)).toEqual(['songluo-lake']);
    expect(findPlanTemplates('阿里山山脈', '中級山').map(route => route.id)).toEqual(['shuiyang-forest']);
    expect(findPlanTemplates('  天池  奇萊  ').map(route => route.id)).toEqual(['qilai-nanhua']);
    expect(searchPlanResources('台東', 'hut').map(resource => resource.id)).toEqual(['xiangyang-hut', 'jiaming-hut']);
    expect(searchPlanResources('奇萊南華', 'water').map(resource => resource.id)).toEqual(['tianchi-water']);
    expect(searchPlanResources('冬季', 'water').map(resource => resource.id)).toEqual(['cuichi-water', 'paiyun-water', 'pingfeng-water']);
    expect(searchPlanResources('阿里山山脈', 'water').map(resource => resource.id)).toEqual(['shuiyang-water']);
    expect(searchPlanResources('不存在的溪流')).toEqual([]);
    expect(findPlanTemplates('不存在的行程')).toEqual([]);
  });

  it('preserves guide publication dates without inventing local observation times or camp approval', () => {
    const water = PLAN_RESOURCES.find(resource => resource.id === 'shuiyang-water')!;
    expect(water.sourceName).toContain('法蘭');
    expect(water.sourcePublishedAt).toBe('2022-06-04');
    expect(water.observedAt).toBeNull();
    expect(water.checkedAt).toBe(LIBRARY_RESEARCH_CHECKED_AT);
    expect(formatTime(water.sourcePublishedAt)).toBe('2022-06-04');
    expect(water.limitations).toContain('現地日期');
    for (const id of ['songluo-camp', 'jialuo-camp', 'shuiyang-camp']) {
      const resource = PLAN_RESOURCES.find(entry => entry.id === id)!;
      expect(resource.name).toContain('紀錄');
      expect(resource.limitations).toContain('非已');
      expect(resource.currentAvailability).toBe('unknown');
    }
  });

  it('uses the latest dated Shei-Pa access snapshot without claiming live opening status', () => {
    for (const id of ['daba', 'xueshan', 'wuling-four', 'xueshan-cuichi', 'xueshan-west-ridge', 'daxiaojian', 'zhijiayang-xueshan']) {
      const route = PLAN_TEMPLATES.find(entry => entry.id === id)!;
      expect(Date.parse(route.accessNotice?.checkedAt ?? '')).toBeGreaterThan(Date.parse(LIBRARY_RESEARCH_CHECKED_AT));
      expect(route.accessNotice?.text).toContain('10/26');
      expect(route.accessNotice?.text).toContain('10/27');
      expect(route.accessNotice?.text).not.toContain('恢復另行公告');
      expect(route.accessNotice?.sourceUrl).toBe('https://hike.taiwan.gov.tw/news_0_1.aspx?id=5017');
      if (route.planningReady !== false) expect(createPlanFromTemplate(id, NOW).notes).toContain('非即時狀態');
    }
    expect(PLAN_TEMPLATES.find(route => route.id === 'songluo-lake')?.accessNotice).toBeUndefined();
  });
});

describe('creating an editable draft from an official template', () => {
  it.each(PLAN_TEMPLATES.filter(route => route.planningReady !== false).map(route => [route.id]))('creates a strictly valid v1 draft for %s', id => {
    const draft = createPlanFromTemplate(id, NOW);
    expect(parsePlanDraft(draft)).toEqual(draft);
    expect(draft.createdAt).toBe(NOW);
    expect(draft.startDate).toBe('');
    expect(draft.members).toBeNull();
    expect(draft.advisories).toEqual([]);
    expect(draft.days.every(day => day.retreat.confirmed === false && day.retreat.route === '')).toBe(true);
    expect(draft.days.every(day => day.water.availability === 'unknown' && day.water.reportedAt === '')).toBe(true);
    expect(draft.days.every(day => day.water.perPersonL === null && day.water.cookingL === null && day.water.reserveL === null && day.water.detourMinutes === null)).toBe(true);
    expect(draft.days.every(day => day.lodging.reservation !== 'approved' && day.lodging.approvalReference === '')).toBe(true);
    expect(draft.days.every(day => day.legs.every(leg => leg.restMinutes === 0))).toBe(true);
    expect(draft.reviewNotes).toContain('休息尚未安排，可按需加入');
    expect(calculatePlan(draft).issues.some(issue => issue.id.endsWith('-rest'))).toBe(false);
    expect(calculatePlan(draft).waterLitres.value).toBeNull();
  });

  it('retains the detailed Daba official segment data and conflicting-day-label notes', () => {
    const result = createPlanFromTemplate('daba', NOW);
    const expected = createDabaPlan(NOW);
    expect(result.days.map(day => day.legs)).toEqual(expected.days.map(day => day.legs.map(leg => ({ ...leg, restMinutes: 0 }))));
    expect(result.days.map(day => day.label)).toEqual(expected.days.map(day => day.label));
    expected.days.forEach((day, index) => {
      expect(result.days[index]?.water.note).toContain(day.water.note);
    });
    expect(result.days.map(day => day.legs.reduce((total, leg) => total + (leg.minutes ?? 0), 0))).toEqual([570, 490, 490]);
    expect(result.days[0]?.notes).toContain('約10.5小時');
    expect(result.days[0]?.notes).toContain('570分鐘（9小時30分），與日標不一致');
    expect(result.days[1]?.notes).toContain('含休息約14小時');
    expect(result.days[1]?.notes).toContain('490分鐘（8小時10分）');
    expect(result.days[1]?.notes).toContain('不把差額當已安排休息');
    expect(result.days[2]?.notes).toContain('約9.5小時');
    expect(result.days[2]?.notes).toContain('490分鐘（8小時10分），與日標不一致');
    expect(result.days.every(day => day.legs.every(leg => leg.restMinutes === 0))).toBe(true);
    expect(result.days.every(day => !/休息(?:均)?待填/.test(day.notes))).toBe(true);
    expect(result.reviewNotes).not.toContain('每段休息先留未知');
    expect(result.days[1]?.water.primary).toContain('中霸山屋');
    expect(result.days[1]?.water.note).toContain('雨水儲存不穩定');
    expect(result.days[1]?.water.note).toContain('https://hike.taiwan.gov.tw/bed_1.aspx');
    expect(result.days[0]?.water.note).toContain('https://99online.forest.gov.tw/basic/?mode=detail&node=28');
    expect(result.days[0]?.lodging.reservation).toBe('planned');
    expect(expected.days[0]?.lodging.reservation).toBe('unknown');
    expect(expected.days[1]?.water.primary).toBe('');
    expect(expected.days[1]?.water.note).not.toContain('雨水儲存不穩定');
    const untouched = createDabaPlan(NOW);
    expect(untouched.days).toEqual(expected.days);
  });

  it('leaves the raw Daba reference rests unknown while a new user schedule can run without added rests', () => {
    const reference = createDabaPlan(NOW);
    const draft = createPlanFromTemplate('daba', NOW);
    draft.days[0].startTime = '06:00';
    const result = calculatePlan(draft).days[0];
    expect(result.restMinutes).toEqual({ known: 0, missing: 0, complete: true, value: 0 });
    expect(result.finish).toEqual({ time: '15:30', dayOffset: 0 });
    expect(reference.days.every(day => day.legs.every(leg => leg.restMinutes === null))).toBe(true);
    expect(reference.reviewNotes).toContain('每段休息先留未知');
    expect(createDabaPlan(NOW).days).toEqual(reference.days);
  });

  it('preserves null, zero and positive rests in an existing v1 draft without applying new-template defaults', () => {
    const legacy = createDabaPlan(NOW);
    legacy.days = [legacy.days[1]];
    legacy.days[0].startTime = '06:00';
    legacy.days[0].legs = legacy.days[0].legs.slice(0, 3);
    [null, 0, 30].forEach((restMinutes, index) => { legacy.days[0].legs[index].restMinutes = restMinutes; });
    const saved = JSON.stringify(legacy);
    const restored = parsePlanDraft(JSON.parse(saved));
    createPlanFromTemplate('daba', NOW);
    expect(restored).toEqual(legacy);
    expect(JSON.stringify(legacy)).toBe(saved);
    expect(restored.days[0].legs.map(leg => leg.restMinutes)).toEqual([null, 0, 30]);
    const result = calculatePlan(restored).days[0];
    expect(result.restMinutes).toEqual({ known: 30, missing: 1, complete: false, value: null });
    expect(result.legs[0].arrive).toEqual({ time: '06:50', dayOffset: 0 });
    expect(result.legs[0].afterRest).toBeNull();
    expect(result.legs[1].depart).toBeNull();
    expect(result.finish).toBeNull();
  });

  it('keeps the two Jiaming route water systems and their limitations distinct', () => {
    const xiangyang = PLAN_RESOURCES.find(resource => resource.id === 'xiangyang-water')!;
    const jiaming = PLAN_RESOURCES.find(resource => resource.id === 'jiaming-water')!;
    expect(xiangyang.limitations).toContain('山溪');
    expect(xiangyang.limitations).toContain('不沿用其充足描述');
    expect(jiaming.limitations).toContain('雨水');
    expect(jiaming.limitations).toContain('不以嘉明湖湖水代替');
    expect(xiangyang.currentAvailability).toBe('unknown');
    expect(jiaming.observedAt).toBeNull();
    const draft = createPlanFromTemplate('jiaming-lake', NOW);
    expect(draft.days[0]?.water.primary).toBe(xiangyang.name);
    expect(draft.days[1]?.water.primary).toContain(jiaming.name);
    expect(draft.days[1]?.water.note).toContain(jiaming.sourceUrls[0]);
  });

  it('uses only matching directional reference data while keeping missing values unknown', () => {
    for (const template of PLAN_TEMPLATES.filter(route => route.id !== 'daba' && route.planningReady !== false)) {
      const draft = createPlanFromTemplate(template.id, NOW);
      for (const day of draft.days) {
        for (const leg of day.legs) {
          const reference = templateSegmentReference(template, leg.from, leg.to);
          expect([leg.minutes, leg.restMinutes, leg.distanceKm, leg.ascentM, leg.descentM]).toEqual([reference?.minutes ?? null, 0, reference?.distanceKm ?? null, null, null]);
          expect(leg.sourceUrl).not.toBe('');
          if (reference) {
            expect(leg.sourceUrl).toBe(reference.sourceUrl);
            expect(day.notes).toContain(reference.sourceName);
            expect(day.notes).toContain(reference.checkedAt);
          }
        }
      }
      const result = calculatePlan(draft);
      if (draft.days.some(day => day.legs.some(leg => leg.distanceKm === null))) expect(result.distanceKm.value).toBeNull();
      if (draft.days.some(day => day.legs.some(leg => leg.minutes === null))) expect(result.totalMinutes.value).toBeNull();
      expect(result.days.every(day => day.finish === null)).toBe(true);
    }
  });

  it('distinguishes partial geometry and time coverage without treating a route framework as complete data', () => {
    const daba = PLAN_TEMPLATES.find(route => route.id === 'daba')!;
    expect(templateDataCoverage(daba)).toEqual({total:17, timed:17, track:'partial'});
    const baigu = PLAN_TEMPLATES.find(route => route.id === 'baigu')!;
    expect(templateDataCoverage(baigu)).toEqual({total:10, timed:2, track:'missing'});
    expect(templateSegmentReference(baigu, '三錐山', '白姑大山登山口')).toBeNull();
    expect(templateSegmentReference(baigu, '白姑大山登山口', '三錐山')?.minutes).toBe(170);
    for (const route of PLAN_TEMPLATES) {
      const coverage = templateDataCoverage(route);
      expect(coverage.timed).toBeLessThanOrEqual(coverage.total);
      for (const reference of route.referenceSegments ?? []) {
        expect(route.days.some(day => day.stops.some((from, index) => from === reference.from && day.stops[index + 1] === reference.to))).toBe(true);
        expect(route.sourceUrls).toContain(reference.sourceUrl);
        expect(reference.minutes === null || reference.minutes >= 0).toBe(true);
      }
    }
  });

  it('sets only intended overnight nodes to planned and keeps source/time/water limitations in the draft', () => {
    const snow = createPlanFromTemplate('xueshan', NOW);
    expect(snow.days.map(day => [day.lodging.name, day.lodging.reservation])).toEqual([
      ['七卡山莊', 'planned'], ['三六九臨時營地', 'planned'], ['', 'unknown'],
    ]);
    expect(snow.days[1]?.water.note).toContain('桶容量不等於現有水量');
    expect(snow.days[1]?.water.note).toContain(PLAN_CATALOG_CHECKED_AT);
    expect(snow.days[1]?.water.note).toContain('來源發布／現勘時間未知');
    expect(snow.days[1]?.water.sourceUrl).toBe('https://hike.taiwan.gov.tw/bed_1.aspx');
    const middle = createPlanFromTemplate('shuiyang-forest', NOW);
    expect(middle.days).toHaveLength(2);
    expect(middle.days[0]?.water.note).toContain('來源發布 2022-06-04；現地觀測 未知');
    expect(middle.days[0]?.water.note).not.toContain('來源發布／現勘時間未知');
    expect(middle.days[0]?.lodging.name).toContain('宿營紀錄');
    expect(middle.days[0]?.lodging.reservation).toBe('planned');
    expect(middle.days[0]?.notes).toContain('非已核准營位');
    expect(middle.notes).toContain('阿里山山脈');
  });

  it('creates independent mutable drafts without altering the catalog or another draft', () => {
    const original = JSON.stringify(PLAN_TEMPLATES);
    const one = createPlanFromTemplate('yushan', NOW);
    const two = createPlanFromTemplate('yushan', NOW);
    expect(one.id).not.toBe(two.id);
    expect(one.days[0]?.id).not.toBe(two.days[0]?.id);
    expect(one.days[0]?.legs[0]?.id).not.toBe(two.days[0]?.legs[0]?.id);
    one.days[0]!.legs[0]!.to = '自訂點';
    one.days[0]!.water.perPersonL = 3;
    expect(two.days[0]?.legs[0]?.to).toBe('孟祿亭');
    expect(two.days[0]?.water.perPersonL).toBeNull();
    expect(JSON.stringify(PLAN_TEMPLATES)).toBe(original);
  });

  it('rejects an unknown template or invalid creation timestamp instead of silently using another route', () => {
    expect(() => createPlanFromTemplate('made-up')).toThrow('找不到');
    expect(() => createPlanFromTemplate('yushan', 'not-a-date')).toThrow();
    expect(() => createPlanFromTemplate('daba', 'not-a-date')).toThrow();
  });

  it('keeps unverified long-day splits in the catalog without creating ready-to-use drafts', () => {
    const snow = PLAN_TEMPLATES.find(route => route.id === 'xueshan-west-ridge')!;
    const badaxiu = PLAN_TEMPLATES.find(route => route.id === 'badaxiu-four-days')!;
    const daxiaojian = PLAN_TEMPLATES.find(route => route.id === 'daxiaojian')!;
    expect(snow.planningReady).toBe(false);
    expect(snow.planningReview).toContain('第 4 天');
    expect(() => createPlanFromTemplate(snow.id, NOW)).toThrow('分日待核，暫停套用');
    expect(badaxiu.planningReady).toBe(false);
    expect(() => createPlanFromTemplate(badaxiu.id, NOW)).toThrow('分日待核，暫停套用');
    const firstDay = daxiaojian.days[0]!;
    const minutes = firstDay.stops.slice(1).map((to, index) => templateSegmentReference(daxiaojian, firstDay.stops[index]!, to)?.minutes ?? null);
    expect(minutes.every(value => value !== null)).toBe(true);
    expect(minutes.reduce<number>((sum, value) => sum + (value ?? 0), 0)).toBe(710);
    expect(daxiaojian.planningReady).toBe(false);
    expect(daxiaojian.planningReview).toContain('11 小時 50 分');
    expect(() => createPlanFromTemplate(daxiaojian.id, NOW)).toThrow('分日待核，暫停套用');
    for (const id of ['pingfeng-two-days', 'zhijiayang-xueshan']) {
      const template = PLAN_TEMPLATES.find(route => route.id === id)!;
      expect(template.planningReady).toBe(false);
      expect(template.planningReview).toBeTruthy();
      expect(() => createPlanFromTemplate(id, NOW)).toThrow('分日待核，暫停套用');
    }
  });

  it('splits North Dawu and Baigu summit days from their descent days without changing saved drafts', () => {
    const northDawu = PLAN_TEMPLATES.find(route => route.id === 'beidawu')!;
    const baigu = PLAN_TEMPLATES.find(route => route.id === 'baigu')!;
    for (const template of [northDawu, baigu]) {
      expect(template.referenceDays).toBe(3);
      expect(template.days[1]?.lodgingResourceId).toBe(template.days[0]?.lodgingResourceId);
      expect(template.days[2]?.lodgingResourceId).toBeNull();
      expect(createPlanFromTemplate(template.id, NOW).days).toHaveLength(3);
      expect(template.planningReview).toContain('舊版兩日草稿');
    }
    expect(northDawu.days[1]?.stops).toContain('高砂義勇軍紀念碑與大武祠');
    expect(northDawu.sourceUrls).toContain('https://kgonline.forest.gov.tw/questions/');
    expect(baigu.days[1]?.stops.at(-1)).toBe('司晏池');
    expect(baigu.days[2]?.stops.at(-1)).toBe('白姑大山登山口');
  });

  it('holds a template for review when known walking minutes alone exceed ten hours in one day', () => {
    for (const template of PLAN_TEMPLATES.filter(route => route.id !== 'daba')) {
      for (const day of template.days) {
        const knownMinutes = day.stops.slice(1).reduce((sum, to, index) =>
          sum + (templateSegmentReference(template, day.stops[index]!, to)?.minutes ?? 0), 0);
        if (knownMinutes > 600) {
          expect(template.planningReady, `${template.id}：${day.label} 已知移動 ${knownMinutes} 分`).toBe(false);
          expect(template.planningReview).toBeTruthy();
        }
      }
    }
  });

  it('shows planning review before the use button and disables an unverified template in the catalog', () => {
    const markup = renderToStaticMarkup(createElement(PlanCatalog, { onUseTemplate: () => {} }));
    const reviewId = 'pc-planning-review-badaxiu-four-days';
    const card = markup.slice(markup.indexOf('data-template-id="badaxiu-four-days"'), markup.indexOf('data-template-id="badaxiu-four-days"') + 3200);
    expect(card).toContain(`id="${reviewId}"`);
    expect(card).toContain('分日待核，暫停套用');
    expect(card).toMatch(/<button[^>]*disabled=""[^>]*aria-describedby="pc-planning-review-badaxiu-four-days"/u);
    for (const id of ['xueshan-west-ridge', 'daxiaojian', 'pingfeng-two-days', 'zhijiayang-xueshan']) {
      const card = markup.slice(markup.indexOf(`data-template-id="${id}"`), markup.indexOf(`data-template-id="${id}"`) + 3200);
      expect(card).toContain('分日待核，暫停套用');
      expect(card).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*aria-describedby="pc-planning-review-${id}"`, 'u'));
    }
  });
});
