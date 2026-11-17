export interface TrailClosureTiming {
  state: 'scheduled' | 'today' | 'past' | 'unknown';
  effectiveDate: string | null;
}
const taipeiDateFormatter = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' });

/** A display-only date, using Taiwan's calendar rather than the device timezone. */
export function taipeiCalendarDate(now: number): string | null {
  if (!Number.isFinite(now) || !Number.isFinite(new Date(now).getTime())) return null;
  const parts = taipeiDateFormatter.formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value;
  return `${value('year')?.padStart(4, '0')}-${value('month')}-${value('day')}`;
}

/** Only the source closureDate participates. No opening date or headline can imply reopening. */
export function getTrailClosureTiming(closureDate: string | null | undefined, now = Date.now()): TrailClosureTiming {
  if (!closureDate || !/^\d{4}-\d{2}-\d{2}$/.test(closureDate)) return { state: 'unknown', effectiveDate: null };
  const parsed = new Date(`${closureDate}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== closureDate) return { state: 'unknown', effectiveDate: null };
  const today = taipeiCalendarDate(now);
  if (!today) return { state: 'unknown', effectiveDate: closureDate };
  return { state: closureDate > today ? 'scheduled' : closureDate === today ? 'today' : 'past', effectiveDate: closureDate };
}
