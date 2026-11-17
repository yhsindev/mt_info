import { calculatePlan, formatPlanTime } from './model';
import type { PlanDay, PlanDraft } from './types';

export interface PlanDiagramInput {
  title: string; routeName: string; day: PlanDay; dayIndex: number; generatedAt: string;
}
export interface DiagramSegment {
  id: string; from: string; to: string; depart: string; arrive: string;
  minutes: string; rest: string; distance: string; gapBefore: boolean;
}
export const PLAN_DIAGRAM_VERSION = '1';
const xml = (value: string) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '').replace(/[&<>"']/g, character => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;'}[character]!));
const number = (value: number | null, suffix: string) => value === null ? '未知' : `${value}${suffix}`;
const lines = (value: string, length: number) => {
  const characters = Array.from(value); const result: string[] = [];
  for (let i = 0; i < characters.length; i += length) result.push(characters.slice(i, i + length).join(''));
  return result.length ? result : [''];
};
function labelLines(value: string, length: number) {
  const wrapped = lines(value, length);
  return wrapped.length <= 2 ? wrapped : [wrapped[0], `${Array.from(wrapped[1]).slice(0, length - 1).join('')}…`];
}
function calculation(input: PlanDiagramInput) {
  const draft: PlanDraft = {
    schemaVersion: 1, id: 'diagram', title: input.title, routeName: input.routeName, referenceRouteId: null,
    startDate: '', members: null, leader: '', leaderPhone: '', keeper: '', keeperPhone: '',
    checkInPlan: '', overdueAt: '', communication: '', gear: '', notes: '', reviewNotes: '',
    days: [input.day], advisories: [], createdAt: input.generatedAt, updatedAt: input.generatedAt,
  };
  return calculatePlan(draft).days[0];
}
/** Sequence only: equal names on a return journey are distinct visits; gaps stay disconnected. */
export function planDiagramSegments(input: PlanDiagramInput): DiagramSegment[] {
  const calculated = calculation(input);
  return input.day.legs.map((leg, index) => ({
    id: leg.id, from: leg.from.trim() || '起點待填', to: leg.to.trim() || '終點待填',
    depart: formatPlanTime(calculated.legs[index]?.depart ?? null), arrive: formatPlanTime(calculated.legs[index]?.arrive ?? null),
    minutes: number(leg.minutes, ' 分'), rest: number(leg.restMinutes, ' 分'), distance: number(leg.distanceKm, ' km'),
    gapBefore: index > 0 && (!leg.from.trim() || input.day.legs[index - 1].to.trim() !== leg.from.trim()),
  }));
}
export function planDiagramSize(input: PlanDiagramInput) {
  const rows = planDiagramSegments(input);
  const sources = [...new Set(input.day.legs.map(leg => leg.sourceUrl.trim()).filter(Boolean))];
  const sourceLines = sources.flatMap((source, index) => lines(`[${index + 1}] ${source}`, 94));
  return {width: 960, height: 364 + Math.max(rows.length, 1) * 160 + (sourceLines.length || 1) * 21};
}
/** Self-contained SVG: no basemap, external assets, contact fields, scripts, or inferred coordinates. */
export function createPlanDiagramSvg(input: PlanDiagramInput, options: {transparent?: boolean; selectedLegId?: string | null} = {}): string {
  const rows = planDiagramSegments(input), calculated = calculation(input), {width, height} = planDiagramSize(input);
  const sources = [...new Set(input.day.legs.map(leg => leg.sourceUrl.trim()).filter(Boolean))];
  const heading = `${input.title.trim() || input.routeName.trim() || '登山計畫'}・第 ${input.dayIndex + 1} 天`;
  const text = (content: string, x: number, y: number, size = 22, color = '#314b40', extra = '') => `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" ${extra}>${xml(content)}</text>`;
  const pieces: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${xml(heading)} 路點示意圖">`,
    `<title>${xml(heading)}</title>`,
    `<desc>${xml(JSON.stringify({product:'mt_info', version:PLAN_DIAGRAM_VERSION, generatedAt:input.generatedAt, dayIndex:input.dayIndex, dayLabel:input.day.label, routeName:input.routeName, sources, segments:rows, kind:'路點示意・非地理軌跡'}))}</desc>`,
    options.transparent ? '' : `<rect width="${width}" height="${height}" fill="#fffefb"/>`,
    '<g font-family="system-ui, -apple-system, sans-serif">',
    text('mt_info', 52, 54, 26, '#183d30', 'font-family="Georgia, serif" font-weight="700"'),
    ...labelLines(heading, 31).map((line, index) => text(line, 52, 104 + index * 34, 28, '#18271f', 'font-weight="700"')),
    text('路點示意・非地理軌跡', 52, 184, 20, '#53685d'),
    text(`行進 ${number(calculated.travelMinutes.value, ' 分')}　餐休 ${number(calculated.restMinutes.value, ' 分')}　距離 ${number(calculated.distanceKm.value, ' km')}`, 52, 217, 21),
  ];
  rows.forEach((row, index) => {
    const y = 264 + index * 160, selected = options.selectedLegId === row.id;
    pieces.push(`<g data-leg-id="${xml(row.id)}" role="button" tabindex="0" aria-label="${xml(`第 ${index + 1} 段 ${row.from} 到 ${row.to}`)}" aria-pressed="${selected}">`);
    pieces.push(`<title>${xml(`${row.from} → ${row.to}`)}</title>`);
    if (selected) pieces.push(`<rect x="36" y="${y - 25}" width="888" height="148" rx="12" fill="#e8efe8"/>`);
    if (row.gapBefore) pieces.push(text('路點未銜接', 572, y - 8, 17, '#8d5731'));
    pieces.push(`<path d="M86 ${y + 6} V${y + 94}" stroke="#39644e" stroke-width="4" fill="none"/>`);
    // A connector is drawn only when the next leg explicitly starts at this leg's endpoint.
    if (index < rows.length - 1 && !rows[index + 1].gapBefore) pieces.push(`<path d="M86 ${y + 102} V${y + 154}" stroke="#a3b4a8" stroke-width="2" stroke-dasharray="4 5" fill="none"/>`);
    pieces.push(`<circle cx="86" cy="${y}" r="8" fill="#fffefb" stroke="#39644e" stroke-width="3"/><circle cx="86" cy="${y + 100}" r="8" fill="#39644e"/>`);
    pieces.push(text(`${index + 1}`, 50, y + 7, 17), text(row.depart, 720, y + 7, 22), text(row.arrive, 720, y + 107, 22));
    pieces.push(...labelLines(row.from, 25).map((line, lineIndex) => text(line, 114, y + 7 + lineIndex * 25, 22)));
    pieces.push(text(`行進 ${row.minutes}　餐休 ${row.rest}　${row.distance}`, 114, y + 58, 19, '#5d6d62'));
    pieces.push(...labelLines(row.to, 25).map((line, lineIndex) => text(line, 114, y + 107 + lineIndex * 25, 22)));
    pieces.push('</g>');
  });
  if (!rows.length) pieces.push(text('尚未加入路段', 52, 304, 24));
  const footer = 264 + Math.max(rows.length, 1) * 160;
  pieces.push(`<path d="M52 ${footer - 15} H908" stroke="#d4ddd3"/>`);
  pieces.push(text('路段來源', 52, footer + 16, 18));
  const sourceLines = sources.length ? sources.flatMap((source, index) => lines(`[${index + 1}] ${source}`, 94)) : ['未填寫路段來源'];
  sourceLines.forEach((line, index) => pieces.push(text(line, 52, footer + 42 + index * 21, 16)));
  pieces.push(text(`mt_info 圖面 v${PLAN_DIAGRAM_VERSION}・匯出 ${input.generatedAt}`, 52, height - 18, 15, '#53685d'), '</g></svg>');
  return pieces.join('');
}
