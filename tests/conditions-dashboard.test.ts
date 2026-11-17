import { describe, expect, it } from 'vitest';
import { buildConditionsDashboard, classifyDashboardRegion, DASHBOARD_REGIONS } from '../src/conditions-dashboard';
import type { ConditionsResponse, ConditionsStatus, OfficialAlert, TrailCondition } from '../src/shared/conditions';

const now = Date.parse('2026-10-22T10:00:00+08:00');
const source = { name: '官方來源', url: 'https://example.test/official' };
function trail(id: string, region: string, condition: TrailCondition['condition'] = 'closed'): TrailCondition {
  return { id, trailId: id, name: `${id}步道`, region, manager: '來源管理單位', condition, rawCondition: condition, headline: '官方公告', description: '原文', section: null, issuedAt: '2026-10-22', updatedAt: null, closureDate: null, expectedOpeningDate: null, latitude: null, longitude: null, coordinateNote: '未知位置', source };
}
function alert(id: string, areas: string[], overrides: Partial<OfficialAlert> = {}): OfficialAlert {
  return { id, identifier: id, publisher: '發布機關', sender: 'official', headline: '官方警示', description: '原始警示', instruction: '', event: '強風', severity: 'Moderate', areas, issuedAt: '2026-10-22T08:00:00+08:00', effectiveAt: '2026-10-22T08:00:00+08:00', expiresAt: '2026-10-22T12:00:00+08:00', polygons: [], source, ...overrides };
}
function response(trails: TrailCondition[] = [], alerts: OfficialAlert[] = []): ConditionsResponse {
  const common = { status: 'ready' as const, source, coverage: '來源適用範圍', fetchedAt: '2026-10-22T01:00:00Z', checkedAt: '2026-10-22T01:59:00Z', error: null, message: '原有來源說明' };
  return { generatedAt: '2026-10-22T02:00:00Z', trails: { ...common, items: trails, catalogCount: 118, unmatchedCount: 0 }, alerts: { ...common, items: alerts, unknownTimeCount: 0 } };
}

describe('縣市明確分區', () => {
  it.each([
    ['臺北市士林區', 'north'], ['台北市士林區', 'north'], ['宜蘭縣南澳鄉', 'north'], ['新竹市北區', 'north'],
    ['苗栗縣泰安鄉', 'central'], ['臺中市和平區', 'central'], ['雲林縣古坑鄉', 'central'],
    ['嘉義市西區', 'south'], ['嘉義縣阿里山鄉', 'south'], ['臺南市南化區；高雄市內門區', 'south'],
    ['臺東縣綠島鄉', 'east'], ['花蓮縣秀林鄉', 'east'],
    ['新竹縣尖石鄉；苗栗縣泰安鄉', 'cross'], ['嘉義縣阿里山鄉；南投縣信義鄉', 'cross'],
    ['新北市坪林區；宜蘭縣礁溪鄉、頭城鎮', 'north'],
    ['金門縣金城鎮', 'other'], ['澎湖縣馬公市', 'other'], ['連江縣南竿鄉', 'other'],
    ['雪霸地區', 'other'], ['北部山區', 'other'], ['南澳鄉', 'other'], ['', 'other'],
    ['臺灣北部海面', 'other'], ['全臺', 'cross'],
  ])('classifies explicit source region %s as %s', (input, expected) => {
    expect(classifyDashboardRegion(input)).toBe(expected);
  });
  it('uses the union of explicit CAP counties, retains uncertainty, and never infers a county from sea-area direction', () => {
    expect(classifyDashboardRegion(['台北市', '新北市'])).toBe('north');
    expect(classifyDashboardRegion(['台北市', '高雄市', '台北市'])).toBe('cross');
    expect(classifyDashboardRegion(['臺北市', '金門縣'])).toBe('cross');
    expect(classifyDashboardRegion(['臺北市', '臺灣北部海面'])).toBe('other');
    expect(classifyDashboardRegion(['宜蘭縣', '屏東縣', '臺灣東部海面'])).toBe('cross');
    expect(classifyDashboardRegion([])).toBe('other');
  });
});

describe('公告儀表板：集合與統計一致', () => {
  it('puts each announcement in exactly one group, deduplicating repeated IDs without merging different announcements on one trail', () => {
    const first = trail('a', '新竹縣尖石鄉；苗栗縣泰安鄉');
    const sameTrail = { ...trail('b', '新竹縣尖石鄉；苗栗縣泰安鄉', 'caution'), trailId: first.trailId };
    const original = response([first, first, sameTrail, trail('c', '臺東縣海端鄉')], [alert('alert', ['臺北市', '臺中市', '高雄市']), alert('alert', ['臺北市', '臺中市', '高雄市'])]);
    const board = buildConditionsDashboard(original, { now });
    expect(board.groups.map(group => group.id)).toEqual(DASHBOARD_REGIONS);
    expect(board.counts).toEqual({ total: 4, knownTotal: 4, trails: 3, alerts: 1, closed: 2, partial: 0, caution: 1, unknown: 0 });
    const cross = board.groups.find(group => group.id === 'cross')!;
    expect(cross.trails).toHaveLength(2); expect(cross.alerts).toHaveLength(1);
    expect(board.groups.reduce((sum, group) => sum + group.counts.knownTotal, 0)).toBe(board.counts.knownTotal);
    expect(new Set(board.groups.flatMap(group => [...group.trails, ...group.alerts]).map(item => item.id)).size).toBe(4);
    expect(original.trails.items).toHaveLength(4);
  });
  it('keeps CAP a separate type, excludes known expired/future items, and does not invent locations for text areas', () => {
    const original = response([trail('trail', '臺中市', 'unknown')], [
      alert('active', ['臺灣北部海面']), alert('expired', ['臺中市'], { expiresAt: '2026-10-22T10:00:00+08:00' }),
      alert('future', ['臺中市'], { effectiveAt: '2026-10-22T10:01:00+08:00' }),
    ]);
    const board = buildConditionsDashboard(original, { now, type: 'alerts' });
    expect(board.counts.total).toBe(1); expect(board.counts.trails).toBe(0);
    expect(board.groups.find(group => group.id === 'other')?.alerts.map(item => item.id)).toEqual(['active']);
    expect(board.totalCounts.total).toBe(2);
    expect(board.groups.flatMap(group => group.alerts)[0].polygons).toEqual([]);
  });
  it('uses shared multi-term 台／臺 search and filters by trail condition without changing totalCounts', () => {
    const original = response([trail('north', '臺北市士林區', 'closed'), trail('central', '臺中市和平區', 'partial'), trail('unknown', '未知', 'unknown')], [alert('wind', ['台北市'])]);
    const filtered = buildConditionsDashboard(original, { now, query: '台北 官方', type: 'closed' });
    expect(filtered.groups.flatMap(group => group.trails).map(item => item.id)).toEqual(['north']);
    expect(filtered.groups.flatMap(group => group.alerts)).toEqual([]);
    expect(filtered.counts.total).toBe(1); expect(filtered.totalCounts.total).toBe(4);
    expect(buildConditionsDashboard(original, { now, type: 'unknown' }).counts.unknown).toBe(1);
  });
  it('sorts only by official issuedAt with unknown dates last, without substituting cache freshness or mutating source order', () => {
    const recent = trail('recent', '臺北市'), older = { ...trail('older', '臺北市'), issuedAt: '2026-10-20' }, undated = { ...trail('unknown', '臺北市'), issuedAt: null };
    const original = response([undated, older, recent]);
    expect(buildConditionsDashboard(original, { now }).groups[0].trails.map(item => item.id)).toEqual(['recent', 'older', 'unknown']);
    expect(buildConditionsDashboard(original, { now, sort: 'oldest' }).groups[0].trails.map(item => item.id)).toEqual(['older', 'recent', 'unknown']);
    expect(original.trails.items.map(item => item.id)).toEqual(['unknown', 'older', 'recent']);
  });
  it('retains unknown region records even when no coordinate or reference geometry exists', () => {
    const original = response([trail('snow', ''), { ...trail('name-is-not-region', '', 'caution'), name: '臺北市示範步道', manager: '臺中市管理處' }]);
    const board = buildConditionsDashboard(original, { now });
    expect(board.groups.find(group => group.id === 'other')?.trails).toHaveLength(2);
    expect(board.groups.find(group => group.id === 'north')?.trails).toEqual([]);
  });
});

describe('來源未就緒不等於零筆', () => {
  it('returns null totals for absent data while keeping the group structure and actual known count', () => {
    const board = buildConditionsDashboard(null, { now });
    expect(board.available).toEqual({ trails: false, alerts: false });
    expect(board.counts).toEqual({ total: null, knownTotal: 0, trails: null, alerts: null, closed: null, partial: null, caution: null, unknown: null });
    expect(board.groups.every(group => group.counts.total === null)).toBe(true);
  });
  it.each(['missing', 'error', 'disabled'] satisfies ConditionsStatus[])('does not disguise %s source as an empty successful result', status => {
    const original = response([], [alert('known', ['臺北市'])]); original.trails.status = status;
    const board = buildConditionsDashboard(original, { now });
    expect(board.counts.total).toBeNull(); expect(board.counts.trails).toBeNull(); expect(board.counts.closed).toBeNull();
    expect(board.counts.alerts).toBe(1); expect(board.counts.knownTotal).toBe(1);
    expect(buildConditionsDashboard(original, { now, type: 'alerts' }).counts.total).toBe(1);
  });
  it('can count a successful empty or stale snapshot while preserving those original source states for the UI', () => {
    const original = response(); original.trails.status = 'empty'; original.alerts.status = 'stale';
    const board = buildConditionsDashboard(original, { now });
    expect(board.counts.total).toBe(0); expect(board.available).toEqual({ trails: true, alerts: true });
    expect(original.trails.status).toBe('empty'); expect(original.alerts.status).toBe('stale');
  });
  it('retains valid partial records from a failed source but does not claim their count is complete', () => {
    const original = response([trail('partial-known', '宜蘭縣')]); original.trails.status = 'error';
    const board = buildConditionsDashboard(original, { now, type: 'trails' });
    expect(board.counts.total).toBeNull(); expect(board.counts.knownTotal).toBe(1);
    expect(board.groups[0].trails.map(item => item.id)).toEqual(['partial-known']);
  });
});
