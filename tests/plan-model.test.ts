import { describe, expect, it } from 'vitest';
import { calculatePlan, createBlankPlan, createPlanDay, createPlanLeg, formatPlanTime, parsePlanDraft } from '../src/plan/model';
import type { PlanAdvisory, PlanDraft } from '../src/plan/types';

const now = '2026-10-22T02:00:00.000Z';
function completeDay(draft: PlanDraft) {
  draft.members = 3;
  const day = draft.days[0]; day.startTime = '06:00';
  Object.assign(day.legs[0], { from: '登山口', to: '山屋', minutes: 120, restMinutes: 30, distanceKm: 6.5, ascentM: 500, descentM: 100 });
  Object.assign(day.water, { primary: '公告水源', backup: '另行攜帶', availability: 'confirmed', reportedAt: '2026-10-22', sourceUrl: 'https://example.test/water', perPersonL: 2, cookingL: 1, reserveL: 2 });
  Object.assign(day.lodging, { name: '山屋', reservation: 'approved', approvalReference: '已取得的核准資料' });
  Object.assign(day.retreat, { decisionPoint: '分岔口', deadline: '10:00', trigger: '依原計畫條件', route: '原路返回', confirmed: true });
  return day;
}
function advisory(): PlanAdvisory {
  return { id: 'official-advisory', title: '官方公告', description: '原文', publisher: '官方機關', sourceUrl: 'https://example.test/notice', issuedAt: '2026-10-21', closureDate: null, expectedOpeningDate: '2026-11-01', capturedAt: now, sourceCheckedAt: now, sourceStatus: 'ready' };
}

describe('計畫未知值與時間計算', () => {
  it('creates one day with unknown route, party and water, explicit zero rest and unique IDs', () => {
    const plan = createBlankPlan(now), day = plan.days[0], result = calculatePlan(plan);
    expect(plan.createdAt).toBe(now); expect(plan.updatedAt).toBe(now);
    expect(plan.days).toHaveLength(1); expect(day.legs).toHaveLength(1);
    expect(plan.members).toBeNull(); expect(day.legs[0].minutes).toBeNull(); expect(day.legs[0].restMinutes).toBe(0);
    expect(day.water.availability).toBe('unknown'); expect(day.water.perPersonL).toBeNull(); expect(day.lodging.reservation).toBe('unknown'); expect(day.retreat.confirmed).toBe(false);
    expect(new Set([plan.id, day.id, day.legs[0].id, createPlanDay(2).id, createPlanLeg().id]).size).toBe(5);
    expect(result.days[0].finish).toBeNull(); expect(result.days[0].date).toBeNull(); expect(result.endDate).toBeNull();
    expect(result.totalMinutes).toMatchObject({ known: 0, missing: 1, complete: false, value: null });
    expect(result.waterLitres.value).toBeNull();
    expect(result.issues.every(issue => ['missing', 'review'].includes(issue.level))).toBe(true);
    expect(parsePlanDraft(plan)).toEqual(plan);
  });

  it('propagates unknown travel and unknown rest through remaining timings, retaining partial known totals', () => {
    const plan = createBlankPlan(now); const day = completeDay(plan);
    day.legs.push({ ...createPlanLeg(), from: '山屋', to: '稜線', minutes: null, restMinutes: 10, distanceKm: null, ascentM: null, descentM: 50 });
    day.legs.push({ ...createPlanLeg(), from: '稜線', to: '終點', minutes: 40, restMinutes: 0, distanceKm: 2, ascentM: 100, descentM: 200 });
    let result = calculatePlan(plan);
    expect(result.days[0].legs[0]).toMatchObject({ depart: { time: '06:00', dayOffset: 0 }, arrive: { time: '08:00', dayOffset: 0 }, afterRest: { time: '08:30', dayOffset: 0 } });
    expect(result.days[0].legs[1]).toMatchObject({ depart: { time: '08:30', dayOffset: 0 }, arrive: null, afterRest: null });
    expect(result.days[0].legs[2]).toMatchObject({ depart: null, arrive: null, afterRest: null });
    expect(result.totalMinutes).toEqual({ known: 200, missing: 1, complete: false, value: null });
    expect(result.distanceKm).toEqual({ known: 8.5, missing: 1, complete: false, value: null });
    expect(result.descentM.value).toBe(350);
    day.legs[0].restMinutes = null; day.legs[1].minutes = 20;
    result = calculatePlan(plan);
    expect(result.days[0].legs[0].arrive?.time).toBe('08:00'); expect(result.days[0].legs[0].afterRest).toBeNull(); expect(result.days[0].legs[1].depart).toBeNull();
    expect(result.totalMinutes).toEqual({ known: 190, missing: 1, complete: false, value: null });
  });

  it('keeps midnight offsets and derives calendar dates in UTC through leap day and year end', () => {
    const plan = createBlankPlan(now); const day = completeDay(plan); plan.startDate = '2028-02-28'; day.startTime = '23:30'; day.legs[0].minutes = 90; day.legs[0].restMinutes = 30;
    let result = calculatePlan(plan);
    expect(result.days[0].legs[0].arrive).toEqual({ time: '01:00', dayOffset: 1 });
    expect(result.days[0].finish).toEqual({ time: '01:30', dayOffset: 1 });
    expect(result.endDate).toBe('2028-02-29');
    plan.startDate = '2026-12-31';
    expect(calculatePlan(plan).endDate).toBe('2027-01-01');
    plan.days.push(createPlanDay(2)); plan.days[1].startTime = '06:00'; plan.days[1].legs[0].minutes = 60;
    result = calculatePlan(plan);
    expect(result.days.map(day => day.date)).toEqual(['2026-12-31', '2027-01-01']); expect(result.endDate).toBe('2027-01-01');
    expect(formatPlanTime({ time: '01:30', dayOffset: 1 })).toBe('次日 01:30');
    expect(formatPlanTime({ time: '01:30', dayOffset: 2 })).toBe('第 3 日 01:30'); expect(formatPlanTime(null)).toBe('未知');
    day.legs[0].minutes = null; plan.days[1].legs[0].restMinutes = null;
    expect(calculatePlan(plan).endDate).toBeNull();
  });

  it('computes group water only when all inputs and a positive party are known; detours remain separate notes', () => {
    const plan = createBlankPlan(now); const day = completeDay(plan);
    expect(calculatePlan(plan).waterLitres.value).toBe(9);
    day.water.detourMinutes = 40;
    expect(calculatePlan(plan).totalMinutes.value).toBe(150);
    expect(calculatePlan(plan).issues.some(issue => issue.id.endsWith('water-detour'))).toBe(true);
    day.water.reserveL = null;
    expect(calculatePlan(plan).days[0].waterLitres).toBeNull(); expect(calculatePlan(plan).waterLitres.value).toBeNull();
    day.water.reserveL = 0; day.water.cookingL = 0; day.water.perPersonL = 0;
    expect(calculatePlan(plan).waterLitres.value).toBe(0);
    plan.members = 0; expect(calculatePlan(plan).waterLitres.value).toBeNull();
    plan.members = null; expect(calculatePlan(plan).waterLitres.value).toBeNull();
  });

  it('combines known and missing values across days without replacing the known part with zero', () => {
    const plan = createBlankPlan(now); completeDay(plan); plan.days.push(createPlanDay(2));
    const result = calculatePlan(plan);
    expect(result.distanceKm).toEqual({ known: 6.5, missing: 1, complete: false, value: null });
    expect(result.totalMinutes).toEqual({ known: 150, missing: 1, complete: false, value: null });
    expect(result.waterLitres).toEqual({ known: 9, missing: 1, complete: false, value: null });
  });

  it('does not let confirmation flags replace retreat, lodging or water evidence', () => {
    const plan = createBlankPlan(now); const day = completeDay(plan);
    day.retreat.decisionPoint = ''; day.retreat.deadline = ''; day.retreat.trigger = ''; day.retreat.route = '';
    day.lodging.name = ''; day.lodging.approvalReference = ''; day.water.reportedAt = ''; day.water.sourceUrl = '';
    const result = calculatePlan(plan);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: `${day.id}-retreat-fields`, level: 'missing' }),
      expect.objectContaining({ id: `${day.id}-lodging-evidence`, level: 'missing' }),
      expect.objectContaining({ id: `${day.id}-water-review`, level: 'review' }),
    ]));
  });

  it('flags cross-day schedule overlap but never compares a decision deadline to the final arrival', () => {
    const plan = createBlankPlan(now); const day = completeDay(plan); day.startTime = '23:00'; day.legs[0].minutes = 180; day.legs[0].restMinutes = 0;
    plan.days.push(createPlanDay(2)); plan.days[1].startTime = '01:00';
    expect(calculatePlan(plan).issues.some(issue => issue.id.endsWith('overlap'))).toBe(true);
    plan.days[1].startTime = '06:00';
    expect(calculatePlan(plan).issues.some(issue => issue.id.endsWith('overlap'))).toBe(false);
    expect(calculatePlan(plan).issues.some(issue => /安全|風險評分/.test(issue.message))).toBe(false);
  });
});

describe('strict v1 計畫匯入', () => {
  it('round trips every field, preserving null, explicit zero, source dates and advisory state without aging it', () => {
    const original = createBlankPlan(now); completeDay(original); original.startDate = '2028-02-29'; original.overdueAt = '2028-03-01T18:30'; original.advisories.push(advisory());
    const parsed = parsePlanDraft(JSON.parse(JSON.stringify(original)));
    expect(parsed).toEqual(original); expect(parsed).not.toBe(original); expect(parsed.days[0]).not.toBe(original.days[0]);
    expect(parsed.advisories[0].sourceStatus).toBe('ready');
    expect(calculatePlan(parsed).issues.some(issue => issue.id === 'advisory-official-advisory' && issue.level === 'review')).toBe(true);
  });
  it.each([
    (plan: PlanDraft) => { (plan as unknown as Record<string, unknown>).schemaVersion = 2; },
    (plan: PlanDraft) => { (plan as unknown as Record<string, unknown>).extra = true; },
    (plan: PlanDraft) => { delete (plan as unknown as Record<string, unknown>).title; },
    (plan: PlanDraft) => { plan.days[0].id = plan.id; },
    (plan: PlanDraft) => { plan.days[0].legs.push({ ...plan.days[0].legs[0] }); },
    (plan: PlanDraft) => { plan.days[0].water.sourceUrl = 'javascript:alert(1)'; },
    (plan: PlanDraft) => { plan.days[0].legs[0].sourceUrl = 'file:///private/data'; },
    (plan: PlanDraft) => { plan.days[0].legs[0].sourceUrl = 'https://name:password@example.test/'; },
    (plan: PlanDraft) => { plan.days[0].water.sourceUrl = ' https://example.test/'; },
    (plan: PlanDraft) => { plan.days[0].lodging.sourceUrl = 'https://exam\nple.test/'; },
    (plan: PlanDraft) => { plan.members = NaN; },
    (plan: PlanDraft) => { plan.days[0].legs[0].minutes = Infinity; },
    (plan: PlanDraft) => { plan.days[0].legs[0].restMinutes = -1; },
    (plan: PlanDraft) => { plan.days[0].water.perPersonL = -1; },
    (plan: PlanDraft) => { plan.days[0].legs[0].minutes = 1.5; },
    (plan: PlanDraft) => { (plan.days[0].legs[0] as unknown as Record<string, unknown>).minutes = '30'; },
    (plan: PlanDraft) => { plan.notes = 'x'.repeat(10_001); },
    (plan: PlanDraft) => { plan.days = Array.from({ length: 31 }, (_, index) => ({ ...createPlanDay(), id: `day-${index}` })); },
    (plan: PlanDraft) => { plan.days[0].legs = Array.from({ length: 41 }, () => createPlanLeg()); },
  ])('rejects invalid structure, numbers, identifiers, URL or limits (%#)', mutate => {
    const plan = createBlankPlan(now); mutate(plan); expect(() => parsePlanDraft(plan)).toThrow(/計畫格式不符/);
  });
  it.each(['2026-02-29', '2026-02-30', '2026-13-01', '2026-00-01', '0000-01-01', '2026-1-01'])('rejects nonexistent calendar date %s', value => {
    const plan = createBlankPlan(now); plan.startDate = value; expect(() => parsePlanDraft(plan)).toThrow();
  });
  it.each(['24:00', '12:60', '6:00', '12:00:00', 'invalid'])('rejects invalid HH:mm %s', value => {
    const plan = createBlankPlan(now); plan.days[0].startTime = value; expect(() => parsePlanDraft(plan)).toThrow();
  });
  it('validates nested dates and treats empty days as incomplete rather than complete zero travel', () => {
    const plan = createBlankPlan(now); plan.advisories.push(advisory()); plan.advisories[0].issuedAt = '2026-02-30T00:00:00Z';
    expect(() => parsePlanDraft(plan)).toThrow();
    plan.advisories = []; plan.days[0].water.reportedAt = '2026-02-30'; expect(() => parsePlanDraft(plan)).toThrow();
    plan.days[0].water.reportedAt = ''; plan.days[0].legs = [];
    expect(calculatePlan(parsePlanDraft(plan)).totalMinutes.value).toBeNull();
    expect(() => createBlankPlan('2026-02-30T00:00:00Z')).toThrow();
  });
});
