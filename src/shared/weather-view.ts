import type { WeatherItem, WeatherResponse } from './types';

/** Select interval factors covering the cursor; keep instantaneous factors exact. */
export function itemsAtTime(items: WeatherItem[], cursor: string | undefined): WeatherItem[] {
  if (!cursor) return [];
  const time = Date.parse(cursor);
  return items.filter(item => item.startsAt === item.endsAt
    ? Date.parse(item.startsAt) === time
    : Date.parse(item.startsAt) <= time && time < Date.parse(item.endsAt));
}

/** A page left open must not keep presenting an old response as fresh. */
export function ageWeather(response: WeatherResponse | null, now: number, refreshFailed = false): WeatherResponse | null {
  if (!response || response.mode === 'demo') return response;
  return { ...response, products: response.products.map(product => {
    const items = product.items.map(item => {
      if (product.kind !== 'observation') return item;
      const observedAt = Date.parse(item.endsAt);
      const status = item.value === null ? 'missing' as const
        : now - observedAt > 30 * 60_000 || observedAt > now + 5 * 60_000 ? 'stale' as const : 'ready' as const;
      return { ...item, status };
    });
    if (product.status !== 'ready') return { ...product, items };
    const pastValidity = !!product.validTo && Date.parse(product.validTo) < now;
    const oldForecast = product.kind === 'forecast' && !!product.issuedAt && now - Date.parse(product.issuedAt) > 9 * 60 * 60_000;
    const oldObservation = product.kind === 'observation' && !items.some(item => item.status === 'ready');
    // Observation windows describe the measured past; their end is not a forecast expiry.
    const expired = product.kind === 'observation' ? oldObservation : pastValidity || oldForecast;
    return { ...product, items, status: refreshFailed || expired ? 'stale' : product.status };
  }) };
}
