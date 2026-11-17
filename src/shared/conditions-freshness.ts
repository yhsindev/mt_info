import type { ConditionsResponse, ConditionsSource } from './conditions';

/** Source validation age, independent of an individual CAP's effective interval. */
export const CONDITIONS_FRESHNESS_MS = { trails: 3_600_000, alerts: 300_000 } as const;
const CLOCK_SKEW_MS = 5 * 60_000;
const isoTimestamp = /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/;

function ageSource<T, S extends ConditionsSource<T>>(source: S, now: number, maximumAge: number, fetchError: boolean): S {
  if (source.status !== 'ready' && source.status !== 'empty') return source;
  const checkedAt = source.checkedAt && isoTimestamp.test(source.checkedAt) ? Date.parse(source.checkedAt) : NaN;
  const stale = fetchError || !Number.isFinite(now) || !Number.isFinite(checkedAt)
    || now - checkedAt > maximumAge || checkedAt - now > CLOCK_SKEW_MS;
  // Missing validation time on a claimed successful snapshot means freshness is
  // unknown. Keep that snapshot as stale, including an explicitly empty result;
  // do not turn it into missing data, fabricate timestamps or clear its items.
  return stale ? { ...source, status: 'stale' } : source;
}

/** Age a page left open or offline without mutating its last successful response. */
export function ageConditions(data: ConditionsResponse | null, now: number, fetchError = false): ConditionsResponse | null {
  if (!data) return data;
  const trails = ageSource(data.trails, now, CONDITIONS_FRESHNESS_MS.trails, fetchError);
  const alerts = ageSource(data.alerts, now, CONDITIONS_FRESHNESS_MS.alerts, fetchError);
  return trails === data.trails && alerts === data.alerts ? data : { ...data, trails, alerts };
}
