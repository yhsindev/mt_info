import { describe, expect, it } from 'vitest';
import { getTrailClosureTiming, taipeiCalendarDate } from '../src/conditions-timing';

describe('source closure calendar dates', () => {
  it('changes a planned date at Taiwan midnight rather than UTC or the device timezone', () => {
    const before = Date.parse('2026-10-22T15:59:59.999Z');
    const at = Date.parse('2026-10-22T16:00:00.000Z');
    expect(taipeiCalendarDate(before)).toBe('2026-10-22');
    expect(getTrailClosureTiming('2026-10-23', before)).toEqual({ state: 'scheduled', effectiveDate: '2026-10-23' });
    expect(taipeiCalendarDate(at)).toBe('2026-10-23');
    expect(getTrailClosureTiming('2026-10-23', at)).toEqual({ state: 'today', effectiveDate: '2026-10-23' });
  });

  it('keeps today and past distinct without supplying an effective time or inferring reopening', () => {
    const now = Date.parse('2026-10-22T04:00:00Z');
    expect(getTrailClosureTiming('2026-10-22', now)).toEqual({ state: 'today', effectiveDate: '2026-10-22' });
    expect(getTrailClosureTiming('2026-10-21', now)).toEqual({ state: 'past', effectiveDate: '2026-10-21' });
    expect(getTrailClosureTiming(null, now)).toEqual({ state: 'unknown', effectiveDate: null });
  });

  it('accepts real leap days and rejects calendar overflow and noncanonical source values', () => {
    const now = Date.parse('2026-10-22T04:00:00Z');
    expect(getTrailClosureTiming('2028-02-29', now).state).toBe('scheduled');
    expect(getTrailClosureTiming('2000-02-29', now).state).toBe('past');
    for (const invalid of ['2026-02-29', '1900-02-29', '2026-04-31', '2026-13-01', '2026-00-01', '2026-10-00', '2026-10-32', '2026-1-23', '2026/10/23', '2026-10-23T00:00:00+08:00', ' 2026-10-23 ', '預計十月二十三日', '']) {
      expect(getTrailClosureTiming(invalid, now)).toEqual({ state: 'unknown', effectiveDate: null });
    }
  });

  it('keeps a known source date but makes no future claim when the local clock is invalid', () => {
    expect(getTrailClosureTiming('2026-10-23', NaN)).toEqual({ state: 'unknown', effectiveDate: '2026-10-23' });
    expect(getTrailClosureTiming('2026-10-23', Infinity).state).toBe('unknown');
    expect(taipeiCalendarDate(9e20)).toBeNull();
  });
});
