import { describe, expect, it } from 'vitest';
import { ageConditions, CONDITIONS_FRESHNESS_MS } from '../src/shared/conditions-freshness';
import type { ConditionsResponse, ConditionsStatus } from '../src/shared/conditions';

const checkedAt = '2026-10-22T01:00:00.000Z';
const now = Date.parse(checkedAt);
function response(): ConditionsResponse {
  const source = { name: '官方來源', url: 'https://example.test/official' };
  const common = { status: 'ready' as const, source, coverage: '依官方來源適用範圍', fetchedAt: '2026-10-21T00:00:00Z', checkedAt, error: null, message: '官方來源原有說明' };
  return {
    generatedAt: checkedAt,
    trails: { ...common, catalogCount: 118, unmatchedCount: 0, items: [{
      id: 'trail', trailId: '027', name: '官方步道', region: '新竹縣', manager: '管理機關',
      condition: 'closed', rawCondition: '暫停開放', headline: '官方公告', description: '原有路況全文',
      section: null, issuedAt: null, updatedAt: null, closureDate: null, expectedOpeningDate: null,
      latitude: null, longitude: null, coordinateNote: '座標未知', source,
    }] },
    alerts: { ...common, unknownTimeCount: 0, items: [{
      id: 'alert', identifier: 'a', publisher: '官方機關', sender: 'official', headline: '正式示警',
      description: '完整訊息', instruction: '官方指示', event: '強風', severity: 'Severe',
      areas: ['雪霸地區'], issuedAt: checkedAt, effectiveAt: checkedAt, expiresAt: '2026-10-22T03:00:00Z', polygons: [], source,
    }] },
  };
}

describe('路況與示警的裝置端來源時效', () => {
  it('uses the shared source-specific checkedAt limits, including their exact boundary, rather than fetchedAt', () => {
    const original = response();
    expect(CONDITIONS_FRESHNESS_MS).toEqual({ trails: 3_600_000, alerts: 300_000 });
    expect(ageConditions(original, now)).toBe(original);
    expect(ageConditions(original, now + CONDITIONS_FRESHNESS_MS.alerts)?.alerts.status).toBe('ready');
    const oldAlerts = ageConditions(original, now + CONDITIONS_FRESHNESS_MS.alerts + 1)!;
    expect(oldAlerts.alerts.status).toBe('stale'); expect(oldAlerts.trails.status).toBe('ready');
    expect(ageConditions(original, now + CONDITIONS_FRESHNESS_MS.trails)?.trails.status).toBe('ready');
    expect(ageConditions(original, now + CONDITIONS_FRESHNESS_MS.trails + 1)?.trails.status).toBe('stale');
    expect(original.alerts.status).toBe('ready');
  });

  it('ages a formerly successful empty result without inventing zero events or dropping last-known content', () => {
    const original = response(); original.alerts.status = 'empty'; original.alerts.items = [];
    const aged = ageConditions(original, now + 301_000)!;
    expect(aged.alerts.status).toBe('stale');
    expect(aged.alerts.items).toBe(original.alerts.items);
    expect(aged.alerts.message).toBe(original.alerts.message);
    expect(aged.alerts.fetchedAt).toBe(original.alerts.fetchedAt);
    expect(aged.alerts.checkedAt).toBe(checkedAt);
    expect(aged.generatedAt).toBe(original.generatedAt);
    expect(original.alerts.status).toBe('empty');
  });

  it('marks successful data stale after a fetch failure while preserving source information, items and original dates', () => {
    const original = response();
    const failed = ageConditions(original, now, true)!;
    expect(failed.trails.status).toBe('stale'); expect(failed.alerts.status).toBe('stale');
    expect(failed.trails.items).toBe(original.trails.items);
    expect(failed.alerts.items).toBe(original.alerts.items);
    expect(failed.trails.items[0].latitude).toBeNull();
    expect(failed.trails.source).toBe(original.trails.source);
    expect(failed.trails.error).toBeNull();
    expect(failed.trails.fetchedAt).toBe(original.trails.fetchedAt);
    expect(failed.alerts.items[0].expiresAt).toBe(original.alerts.items[0].expiresAt);
  });

  it.each([null, '', 'invalid', '2026-10-22', '0'])('treats a success with unknown checkedAt %j as stale, preserving its previous result', checked => {
    const original = response(); original.trails.checkedAt = checked; original.alerts.checkedAt = checked; original.alerts.status = 'empty'; original.alerts.items = [];
    const aged = ageConditions(original, now)!;
    expect(aged.trails.status).toBe('stale'); expect(aged.alerts.status).toBe('stale');
    expect(aged.trails.items).toBe(original.trails.items);
    expect(aged.alerts.items).toBe(original.alerts.items);
    expect(aged.trails.checkedAt).toBe(checked);
  });

  it.each(['missing', 'error', 'disabled', 'stale'] satisfies ConditionsStatus[])('never upgrades existing %s state or replaces its error', status => {
    const original = response(); original.trails.status = status; original.alerts.status = status; original.alerts.error = '原有來源錯誤';
    const result = ageConditions(original, now, true)!;
    expect(result).toBe(original);
    expect(result.alerts.status).toBe(status); expect(result.alerts.error).toBe('原有來源錯誤');
  });

  it('allows minor clock skew but does not present far-future timestamps or an invalid clock as fresh', () => {
    const original = response();
    expect(ageConditions(original, now - 60_000)).toBe(original);
    expect(ageConditions(original, now - 301_000)?.alerts.status).toBe('stale');
    expect(ageConditions(original, NaN)?.trails.status).toBe('stale');
    expect(ageConditions(null, now, true)).toBeNull();
  });
});
