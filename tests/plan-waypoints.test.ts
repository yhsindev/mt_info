import { describe, expect, it } from 'vitest';
import { createPlanDay, createPlanLeg } from '../src/plan/model';
import { buildPlanWaypoints, waypointForVisit } from '../src/plan/waypoints';
import type { PlanWaypointSource } from '../src/shared/plan-waypoints';

const source = (change: Partial<PlanWaypointSource> = {}): PlanWaypointSource => ({
  id: 'hut', name: '九九山莊', aliases: ['九十九山莊'], longitude: 121.2, latitude: 24.5,
  sourceUrl: 'https://example.test/official', sourceName: '測試來源', checkedAt: '2026-10-25',
  coordinateBasis: '測試座標', limitations: '僅供測試', ...change,
});
function day(...pairs: [string, string][]) {
  return { ...createPlanDay(1), legs: pairs.map(([from, to]) => ({ ...createPlanLeg(), from, to })) };
}

describe('計畫通全行程路點編號', () => {
  it('keeps one number across days, aliases and return visits', () => {
    const days = [day(['觀霧', '九九山莊']), day(['九十九山莊', '大霸尖山'], ['大霸尖山', '九九山莊']), day(['九九山莊', '觀霧'])];
    const points = buildPlanWaypoints(days, '027', [source()]);
    expect(points.map(point => [point.number, point.name])).toEqual([[1, '觀霧'], [2, '九九山莊'], [3, '大霸尖山']]);
    expect(points[1].coordinate).toEqual([121.2, 24.5]);
    expect(points[1].visits).toEqual([
      { dayIndex: 0, legId: days[0].legs[0].id, side: 'to' },
      { dayIndex: 1, legId: days[1].legs[0].id, side: 'from' },
      { dayIndex: 1, legId: days[1].legs[1].id, side: 'to' },
      { dayIndex: 2, legId: days[2].legs[0].id, side: 'from' },
    ]);
    expect(waypointForVisit(points, days[1].legs[0].id, 'from')).toBe(points[1]);
    expect(waypointForVisit(points, 'unknown-leg', 'from')).toBeUndefined();
    expect(buildPlanWaypoints(days, '027', [source()]).map(point => point.id)).toEqual(points.map(point => point.id));
  });

  it('keeps unknown points numbered without inferring locations or correcting names', () => {
    const points = buildPlanWaypoints([day([' 九九山莊 ', '九九山莊附近'], ['九九山莊附近', '九九 山莊'])], '027', [source()]);
    expect(points.map(point => [point.name, point.coordinate])).toEqual([
      ['九九山莊', [121.2, 24.5]], ['九九山莊附近', null], ['九九 山莊', null],
    ]);
    expect(points[1].source).toBeNull(); expect(points[1].visits).toHaveLength(2);
  });

  it.each([null, '139'])('does not attach Daba point sources to a different or detached route: %s', referenceRouteId => {
    const points = buildPlanWaypoints([day(['九九山莊', '九十九山莊'])], referenceRouteId, [source()]);
    expect(points).toHaveLength(2);
    expect(points.every(point => point.coordinate === null && point.source === null)).toBe(true);
  });

  it('does not merge blank names across legs or their two endpoints', () => {
    const points = buildPlanWaypoints([day(['', ''], [' ', ''])], '027', [source()]);
    expect(points.map(point => point.number)).toEqual([1, 2, 3, 4]);
    expect(points.every(point => point.coordinate === null && point.visits.length === 1)).toBe(true);
  });

  it.each([
    { longitude: NaN }, { latitude: Infinity }, { longitude: 181 }, { longitude: -181 }, { latitude: 91 }, { latitude: -91 },
  ])('leaves invalid source coordinates unlocated: %j', coordinate => {
    const points = buildPlanWaypoints([day(['九九山莊', '九十九山莊'])], '027', [source(coordinate)]);
    expect(points.every(point => point.coordinate === null && point.source === null)).toBe(true);
  });

  it('does not silently choose between duplicate source IDs', () => {
    const points = buildPlanWaypoints([day(['九九山莊', '九十九山莊'])], '027', [source(), source({ longitude: 121.3 })]);
    expect(points.every(point => point.coordinate === null && point.source === null)).toBe(true);
  });

  it('leaves a shared name or alias unlocated while keeping unambiguous names usable', () => {
    const points = buildPlanWaypoints([day(['共同名稱', '甲山屋'], ['共同名稱', '乙山屋'])], '027', [
      source({ id: 'a', name: '甲山屋', aliases: ['共同名稱'] }),
      source({ id: 'b', name: '乙山屋', aliases: ['共同名稱'], longitude: 121.3 }),
    ]);
    expect(points.map(point => [point.name, point.coordinate])).toEqual([
      ['共同名稱', null], ['甲山屋', [121.2, 24.5]], ['乙山屋', [121.3, 24.5]],
    ]);
    expect(points[0].visits).toHaveLength(2);
  });

  it('does not treat repeated aliases within one source as a source collision', () => {
    const points = buildPlanWaypoints([day(['九九山莊', '九十九山莊'])], '027', [source({ aliases: ['九九山莊', '九十九山莊', '九十九山莊'] })]);
    expect(points).toHaveLength(1); expect(points[0].coordinate).toEqual([121.2, 24.5]);
  });

  it('returns an empty list for an itinerary without legs', () => {
    expect(buildPlanWaypoints([], '027', [source()])).toEqual([]);
    expect(buildPlanWaypoints([day()], '027', [source()])).toEqual([]);
  });
});
