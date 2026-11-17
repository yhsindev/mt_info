import type { OfficialAlert, TrailCondition } from './shared/conditions';

/** Match the same user query across trail names, counties and official warning areas. */
export function conditionMatchesQuery(fields: readonly (string | null | undefined)[], query: string): boolean {
  const normalize = (value: string) => value.normalize('NFKC').replace(/台/g, '臺').toLocaleLowerCase('zh-TW');
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = normalize(fields.filter((field): field is string => typeof field === 'string').join(' '));
  return terms.every(term => haystack.includes(term));
}

/** Unknown dates stay unknown; only known expired or not-yet-effective items are hidden. */
export function currentOfficialAlerts<T extends { effectiveAt: string | null; expiresAt: string | null }>(items: readonly T[], now: number): T[] {
  return items.filter(item => {
    const effective = item.effectiveAt ? Date.parse(item.effectiveAt) : NaN;
    const expires = item.expiresAt ? Date.parse(item.expiresAt) : NaN;
    return !(Number.isFinite(effective) && effective > now) && !(Number.isFinite(expires) && expires <= now);
  });
}

export function filterTrailConditions(items: readonly TrailCondition[], query: string): TrailCondition[] {
  return items.filter(item => conditionMatchesQuery([item.name, item.region, item.manager, item.rawCondition, item.headline, item.description, item.section], query));
}

/** The optional clock lets the map and list age the same official warning together. */
export function filterOfficialAlerts(items: readonly OfficialAlert[], query: string, now = Date.now()): OfficialAlert[] {
  return currentOfficialAlerts(items, now).filter(item => conditionMatchesQuery([item.headline, item.publisher, item.event, item.description, item.instruction, ...item.areas], query));
}

/** Keep a selected map item readable without mounting every source record. */
export function conditionPage<T extends { id: string }>(items: readonly T[], limit: number, selectedId: string | null): T[] {
  const count = Math.max(0, Math.floor(limit));
  const page = items.slice(0, count);
  if (!count || !selectedId || page.some(item => item.id === selectedId)) return page;
  const selected = items.find(item => item.id === selectedId);
  return selected ? [selected, ...page.slice(0, count - 1)] : page;
}
