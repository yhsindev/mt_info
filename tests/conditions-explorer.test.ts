import { describe, expect, it } from 'vitest';
import { buildConditionsView } from '../src/conditions-explorer';
import type { ConditionsResponse, TrailCondition } from '../src/shared/conditions';

const source = { name: '官方來源', url: 'https://example.invalid/official' };
const now = Date.parse('2026-10-21T09:00:00+08:00');
const trail = (id: string, lng?: number): TrailCondition => ({ id, trailId: id, name: id, region: '臺灣', manager: '', condition: 'caution', rawCondition: '注意', headline: '官方公告', description: '', section: null, issuedAt: null, updatedAt: null, closureDate: null, expectedOpeningDate: null, latitude: lng === undefined ? null : 24, longitude: lng ?? null, coordinateNote: '', source });
const data = (): ConditionsResponse => ({ generatedAt: new Date(now).toISOString(), trails: { status: 'ready', source, coverage: '', fetchedAt: null, checkedAt: new Date(now).toISOString(), error: null, message: '', items: [trail('inside', 121), trail('outside', 122), trail('unknown')], catalogCount: 3, unmatchedCount: 0 }, alerts: { status: 'empty', source, coverage: '', fetchedAt: null, checkedAt: new Date(now).toISOString(), error: null, message: '', items: [], unknownTimeCount: 0 } });
const bounds = { west: 120.5, east: 121.5, south: 23.5, north: 24.5 };
describe('conditions explorer scope and selection', () => {
  it('pins an explicit selection without inflating the actual viewport counts or dropping unknown locations', () => {
    const original = data();
    const result = buildConditionsView(original, '', now, bounds, true, 'outside');
    expect(result.data?.trails.items.map(item => item.id)).toEqual(['outside', 'inside', 'unknown']);
    expect(result.summary).toMatchObject({ inView: true, routeCount: 1, locatedTrailCount: 1, unlocatedTrailCount: 1, outsideSelection: true });
    expect(original.trails.items.map(item => item.id)).toEqual(['inside', 'outside', 'unknown']);
    expect(buildConditionsView(original, '', now, bounds, true, null).data?.trails.items.map(item => item.id)).toEqual(['inside', 'unknown']);
  });
  it('does not pin an item excluded by search and restores the whole matching list when viewport filtering is disabled', () => {
    expect(buildConditionsView(data(), 'inside', now, bounds, true, 'outside').data?.trails.items.map(item => item.id)).toEqual(['inside']);
    const all = buildConditionsView(data(), '', now, bounds, false, null);
    expect(all.summary.inView).toBe(false); expect(all.summary.routeCount).toBe(2);
    expect(all.data?.trails.items).toHaveLength(3);
    expect(buildConditionsView(null, '', now, null, true, null).data).toBeNull();
  });
});
