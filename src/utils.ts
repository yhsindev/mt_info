import { text } from './config';
export function formatTime(value: string | null | undefined, compact = false): string {
  if (!value) return text.unknown;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', ...(!compact && { year: 'numeric' }), hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}
export function distanceKm(a: [number, number], b: [number, number]): number {
  const rad = (n: number) => n * Math.PI / 180;
  const dLat = rad(b[1] - a[1]), dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
