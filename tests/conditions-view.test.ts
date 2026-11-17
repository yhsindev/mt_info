import { describe, expect, it } from 'vitest';
import { conditionMatchesQuery, conditionPage, currentOfficialAlerts, filterOfficialAlerts, filterTrailConditions } from '../src/conditions-view';
import type { OfficialAlert, TrailCondition } from '../src/shared/conditions';

const source = { name: '官方來源', url: 'https://example.test/official' };
function trail(overrides: Partial<TrailCondition> = {}): TrailCondition {
  return { id: 'trail', trailId: '1', name: '官方步道', region: '臺中市和平區', manager: '官方管理單位', condition: 'partial', rawCondition: '部分封閉', headline: '步道路段公告', description: '維護施工，請依公告範圍通行。', section: '一公里至二公里', issuedAt: null, updatedAt: null, closureDate: null, expectedOpeningDate: null, latitude: null, longitude: null, coordinateNote: '座標未確認', source, ...overrides };
}
function alert(overrides: Partial<OfficialAlert> = {}): OfficialAlert {
  return { id: 'alert', identifier: 'official-1', publisher: '官方發布單位', sender: 'official', headline: '官方降雨訊息', description: '請留意山區溪流水位。', instruction: '依官方指示應變。', event: '降雨', severity: 'Moderate', areas: ['台北市士林區'], issuedAt: '2026-10-21T09:00:00+08:00', effectiveAt: '2026-10-21T09:00:00+08:00', expiresAt: '2026-10-21T11:00:00+08:00', polygons: [], source, ...overrides };
}

describe('conditions view semantics', () => {
  it('shares county and place search, including 台／臺 and multiple terms', () => {
    expect(conditionMatchesQuery(['臺北市', '台北大縱走', null], '台北')).toBe(true);
    expect(conditionMatchesQuery(['台中市和平區', '雪山步道'], '臺中 雪山')).toBe(true);
    expect(conditionMatchesQuery(['臺中市', '雪山步道'], '臺中 高雄')).toBe(false);
    expect(conditionMatchesQuery([undefined, null], '  ')).toBe(true);
  });

  it('removes known expired and future alerts while keeping unknown dates explicit', () => {
    const now = Date.parse('2026-10-21T10:00:00+08:00');
    const items = [
      { id: 'active', effectiveAt: '2026-10-21T09:00:00+08:00', expiresAt: '2026-10-21T11:00:00+08:00' },
      { id: 'expired-at-boundary', effectiveAt: null, expiresAt: '2026-10-21T10:00:00+08:00' },
      { id: 'future', effectiveAt: '2026-10-21T10:01:00+08:00', expiresAt: null },
      { id: 'unknown', effectiveAt: null, expiresAt: null },
      { id: 'invalid', effectiveAt: 'invalid', expiresAt: 'invalid' },
    ];
    expect(currentOfficialAlerts(items, now).map(item => item.id)).toEqual(['active', 'unknown', 'invalid']);
    expect(items).toHaveLength(5);
  });

  it('uses official trail region, manager and section text for the shared map/list filter', () => {
    const items = [trail(), trail({ id: 'other', region: '高雄市', section: null })];
    expect(filterTrailConditions(items, '台中 二公里').map(item => item.id)).toEqual(['trail']);
    expect(filterTrailConditions(items, '官方管理單位')).toHaveLength(2);
    expect(filterTrailConditions(items, '不在來源內')).toEqual([]);
  });

  it('filters alerts by official areas and text without retaining an expired matching warning', () => {
    const items = [alert(), alert({ id: 'expired', expiresAt: '2026-10-21T10:00:00+08:00' }), alert({ id: 'other', areas: ['臺南市'], description: '道路施工' })];
    const now = Date.parse('2026-10-21T10:00:00+08:00');
    expect(filterOfficialAlerts(items, '臺北 溪流', now).map(item => item.id)).toEqual(['alert']);
    expect(filterOfficialAlerts(items, '臺南 道路', now).map(item => item.id)).toEqual(['other']);
  });

  it('keeps a selected record visible within the page limit without inventing a match', () => {
    const items = Array.from({ length: 80 }, (_, index) => ({ id: String(index) }));
    const page = conditionPage(items, 40, '70');
    expect(page).toHaveLength(40);
    expect(page[0].id).toBe('70');
    expect(new Set(page.map(item => item.id)).size).toBe(40);
    expect(conditionPage(items, 40, 'not-in-query')).toEqual(items.slice(0, 40));
    expect(conditionPage(items, 0, '70')).toEqual([]);
  });
});
