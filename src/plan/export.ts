import { calculatePlan } from './model';
import type { PlanDraft, PlanTime, PlanTotal } from './types';

type ReportBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string; newPage?: boolean }
  | { kind: 'paragraph'; text: string; small?: boolean }
  | { kind: 'table'; headers: string[]; rows: string[][]; widths?: number[] }
  | { kind: 'source'; number: number; url: string };
const FONT = 'Microsoft JhengHei';
const clean = (value: string) => Array.from(value).map(char => {
  const cp = char.codePointAt(0)!;
  return cp === 9 || cp === 10 || cp === 13 || cp >= 32 && cp <= 0xd7ff || cp >= 0xe000 && cp <= 0xfffd || cp > 0xffff && cp <= 0x10ffff ? char : '�';
}).join('');
const filled = (value: string | null | undefined) => value?.trim() ? clean(value) : '待填／未知';
const numberText = (value: number | null, unit: string) => value !== null && Number.isFinite(value) ? `${Number(value.toFixed(3))}${unit}` : '未知';
function totalText(total: PlanTotal, unit: string): string {
  if (total.complete && total.value !== null) return numberText(total.value, unit);
  return `已填 ${numberText(total.known, unit)}；${total.missing} 欄未知（非完整總計）`;
}
function timeText(time: PlanTime | null, date: string | null): string {
  if (!time) return '未知';
  const offset = time.dayOffset > 0 ? `（+${time.dayOffset}日）` : '';
  const parsedDate = date && /^\d{4}-\d\d-\d\d$/.test(date) ? new Date(Date.parse(`${date}T00:00:00Z`) + time.dayOffset * 86_400_000) : null;
  const actualDate = parsedDate && Number.isFinite(parsedDate.getTime()) && parsedDate.getUTCFullYear() <= 9999 ? parsedDate.toISOString().slice(0, 10) : null;
  return `${actualDate ? `${actualDate} ` : ''}${time.time}${offset}`;
}
export function safePlanUrl(value: string): string | null {
  if (!value || /[\u0000-\u0020\u007f]/.test(value)) return null;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
const sourceState = { ready: '已取得', empty: '來源空結果', stale: '來源過期或暫時無法更新', missing: '來源尚未完成', error: '來源失敗', disabled: '未啟用' } as const;
const waterState = { unknown: '未查核', reported: '有回報（不等於現場可取用）', confirmed: '使用者標為已查核', dry: '使用者標為缺水' } as const;
const lodgingState = { unknown: '未知／未確認', planned: '規劃中', applied: '已申請，待核准', approved: '使用者標為已核准' } as const;

/** Both formats use the same complete report model, including unknown fields and source snapshots. */
function report(draft: PlanDraft): ReportBlock[] {
  const result = calculatePlan(draft); const sources = new Map<string, number>();
  const sourceRef = (url: string) => {
    if (!url) return '來源待填';
    if (!sources.has(url)) sources.set(url, sources.size + 1);
    return `來源 [${sources.get(url)}]${safePlanUrl(url) ? '' : '（未建立連結）'}`;
  };
  const rows = (items: [string, string][]): ReportBlock => ({ kind: 'table', headers: ['欄位', '內容'], rows: items, widths: [25, 75] });
  const blocks: ReportBlock[] = [
    { kind: 'heading', level: 1, text: filled(draft.title) },
    { kind: 'paragraph', text: '行程草稿。時間與水量依填入資料計算；參考路程不是隊伍配速，供水、床位核准與撤退條件須依來源及實際查核結果判讀。' },
    rows([
      ['路線名稱', filled(draft.routeName)], ['參考路線代碼', draft.referenceRouteId ?? '未指定'],
      ['出發日期／結束日期', `${filled(draft.startDate)} ／ ${result.endDate ?? '未知（資料不完整）'}`],
      ['人數', numberText(draft.members, ' 人')], ['領隊／聯絡電話', `${filled(draft.leader)} ／ ${filled(draft.leaderPhone)}`], ['留守人／聯絡電話', `${filled(draft.keeper)} ／ ${filled(draft.keeperPhone)}`],
      ['報平安安排', filled(draft.checkInPlan)], ['逾時啟動時間', filled(draft.overdueAt)], ['通訊方式／限制', filled(draft.communication)], ['裝備', filled(draft.gear)],
      ['全程備註', filled(draft.notes)], ['行前複核紀錄', filled(draft.reviewNotes)],
    ]),
    { kind: 'heading', level: 2, text: '輸入加總與待查項目' },
    rows([
      ['距離', totalText(result.distanceKm, ' 公里')], ['累計上升', totalText(result.ascentM, ' 公尺')], ['累計下降', totalText(result.descentM, ' 公尺')],
      ['行走＋休息時間', totalText(result.totalMinutes, ' 分鐘')], ['用水欄位加總', totalText(result.waterLitres, ' 公升')],
    ]),
    { kind: 'paragraph', text: '加總只涵蓋已填欄位；部分未知不等於零。每日用水＝人數×每人用水＋全隊煮食＋全隊預備，數字來自使用者輸入，不是建議飲水量、可靠供水量或可用水保證。起走或任一前段時間未知時，不補算後續確定抵達時間。' },
  ];
  if (result.issues.length) blocks.push({ kind: 'table', headers: ['類型', '待查／複核事項'], widths: [15, 85], rows: result.issues.map(issue => [issue.level === 'missing' ? '待填' : '複核', `${issue.dayId ? `${draft.days.find(day => day.id === issue.dayId)?.label ?? issue.dayId}：` : ''}${issue.message}`]) });
  else blocks.push({ kind: 'paragraph', text: '目前計算器未列出缺欄；這不表示現場條件、核准或行程安全性已獲確認。' });

  draft.days.forEach((day, index) => {
    const calculated = result.days[index];
    blocks.push(
      { kind: 'heading', level: 2, text: day.label.trim() ? day.label : `第 ${index + 1} 天（標籤待填）`, newPage: false },
      { kind: 'paragraph', text: `日期：${calculated?.date ?? '待填'}　起走：${filled(day.startTime)}　結束：${calculated ? timeText(calculated.finish, calculated.date) : '未知'}` },
      { kind: 'table', headers: ['路段', '出發／抵達／休息後', '行走／休息', '距離／升降', '背負／來源'], widths: [28, 25, 15, 20, 12], rows: day.legs.map((leg, legIndex) => {
        const timing = calculated?.legs[legIndex];
        return [
          `${legIndex + 1}. ${filled(leg.from)} → ${filled(leg.to)}`,
          `出發 ${timeText(timing?.depart ?? null, calculated?.date ?? null)}\n抵達 ${timeText(timing?.arrive ?? null, calculated?.date ?? null)}\n休息後 ${timeText(timing?.afterRest ?? null, calculated?.date ?? null)}`,
          `行走 ${numberText(leg.minutes, ' 分')}\n休息 ${numberText(leg.restMinutes, ' 分')}`,
          `${numberText(leg.distanceKm, ' 公里')}\n上升 ${numberText(leg.ascentM, ' 公尺')}\n下降 ${numberText(leg.descentM, ' 公尺')}`,
          `${leg.load === 'full' ? '全裝' : '輕裝'}\n${sourceRef(leg.sourceUrl)}`,
        ];
      }) },
      rows([
        ['當日加總', calculated ? `距離：${totalText(calculated.distanceKm, ' 公里')}\n上升：${totalText(calculated.ascentM, ' 公尺')}\n下降：${totalText(calculated.descentM, ' 公尺')}\n行走：${totalText(calculated.travelMinutes, ' 分鐘')}\n休息：${totalText(calculated.restMinutes, ' 分鐘')}\n合計：${totalText(calculated.totalMinutes, ' 分鐘')}` : '未知'],
        ['主要水源／備援', `${filled(day.water.primary)}\n備援：${filled(day.water.backup)}`],
        ['水情／回報日期', `${waterState[day.water.availability]}\n回報日期：${filled(day.water.reportedAt)}\n${filled(day.water.note)}\n${sourceRef(day.water.sourceUrl)}`],
        ['用水輸入（公升）', `每人：${numberText(day.water.perPersonL, ' L')}\n全隊煮食：${numberText(day.water.cookingL, ' L')}\n全隊預備：${numberText(day.water.reserveL, ' L')}\n當日欄位合計：${numberText(calculated?.waterLitres ?? null, ' L')}\n取水往返：${numberText(day.water.detourMinutes, ' 分鐘')}（未自動加進路段）`],
        ['住宿／備案', `${filled(day.lodging.name)}\n備案：${filled(day.lodging.backup)}\n預約狀態：${lodgingState[day.lodging.reservation]}\n核准紀錄：${filled(day.lodging.approvalReference)}\n${sourceRef(day.lodging.sourceUrl)}`],
        ['撤退判斷', `決策點：${filled(day.retreat.decisionPoint)}\n截止時間：${filled(day.retreat.deadline)}\n觸發條件：${filled(day.retreat.trigger)}\n路線：${filled(day.retreat.route)}\n可行性：${day.retreat.confirmed ? '使用者標為已查核' : '尚未查核'}\n${sourceRef(day.retreat.sourceUrl)}`],
        ['菜單', filled(day.menu)], ['當日備註', filled(day.notes)],
      ]),
    );
  });
  blocks.push({ kind: 'heading', level: 2, text: '已附入的路況快照' });
  if (!draft.advisories.length) blocks.push({ kind: 'paragraph', text: '沒有附入路況快照；不代表目前沒有公告。' });
  for (const advisory of draft.advisories) {
    blocks.push({ kind: 'heading', level: 3, text: filled(advisory.title) }, rows([
      ['完整訊息', filled(advisory.description)], ['發布單位', filled(advisory.publisher)],
      ['官方發布日期', filled(advisory.issuedAt)], ['官方封閉日期', filled(advisory.closureDate)], ['官方預定開放日期', `${filled(advisory.expectedOpeningDate)}（預定日期不等於已恢復開放）`],
      ['快照擷取時間', filled(advisory.capturedAt)], ['來源成功查核時間', filled(advisory.sourceCheckedAt)], ['擷取時來源狀態', sourceState[advisory.sourceStatus]], ['來源', sourceRef(advisory.sourceUrl)],
    ]));
  }
  blocks.push({ kind: 'paragraph', text: '路況快照保留擷取當時內容。封閉／預定開放日期是原欄位意義，不是 CAP 生效或解除時間；現在的路況與來源衝突仍須重新查核，舊快照不會自動代表目前現況。' });
  blocks.push({ kind: 'heading', level: 2, text: '來源附錄' });
  if (!sources.size) blocks.push({ kind: 'paragraph', text: '尚未填入來源。' });
  for (const [url, number] of sources) blocks.push({ kind: 'source', number, url });
  blocks.push({ kind: 'heading', level: 2, text: '草稿版本紀錄' }, { kind: 'paragraph', small: true, text: `建立：${filled(draft.createdAt)}\n更新：${filled(draft.updatedAt)}\n資料格式版本：${draft.schemaVersion}` });
  return blocks;
}

const escapeHtml = (value: string) => clean(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const htmlText = (value: string) => escapeHtml(value).replace(/\r\n?|\n/g, '<br>');
export function createPlanPrintHtml(draft: PlanDraft): string {
  const content = report(draft).map(block => {
    if (block.kind === 'heading') return `<h${block.level}${block.newPage ? ' class="new-day"' : ''}>${htmlText(block.text)}</h${block.level}>`;
    if (block.kind === 'paragraph') return `<p${block.small ? ' class="small"' : ''}>${htmlText(block.text)}</p>`;
    if (block.kind === 'source') { const url = safePlanUrl(block.url); return `<p class="source">[${block.number}] ${url ? `<a href="${escapeHtml(url)}" rel="noopener noreferrer">${htmlText(block.url)}</a>` : `${htmlText(block.url)}（未建立連結：只接受不含登入資訊的 HTTP／HTTPS URL）`}</p>`; }
    const cols = block.widths?.map(width => `<col style="width:${width}%">`).join('') ?? '';
    return `<table>${cols ? `<colgroup>${cols}</colgroup>` : ''}<thead><tr>${block.headers.map(header => `<th scope="col">${htmlText(header)}</th>`).join('')}</tr></thead><tbody>${block.rows.map(row => `<tr>${row.map(cell => `<td>${htmlText(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }).join('\n');
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escapeHtml(draft.title || '登山行程草稿')}</title><style>
@page{size:A4 portrait;margin:16mm 15mm}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#111}body{font-family:"Microsoft JhengHei","PingFang TC","Heiti TC",sans-serif;font-size:10.5pt;line-height:1.55}main{max-width:180mm;margin:auto}h1{font-size:19pt;color:#000;margin:0 0 12pt;border:0}h2{font-size:14pt;color:#000;margin:16pt 0 8pt}h3{font-size:11.5pt;color:#000;margin:12pt 0 6pt}h1,h2,h3{break-after:avoid;page-break-after:avoid}p{margin:5pt 0 9pt;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;table-layout:fixed;margin:6pt 0 12pt;font-size:9pt;line-height:1.45}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}th,td{border:.5pt solid #aaa;padding:5pt 6pt;vertical-align:top;overflow-wrap:anywhere;word-break:normal}th{background:#f1f3f3;font-weight:700;text-align:left}a{color:#173e56;overflow-wrap:anywhere}.small,.source{font-size:9pt;overflow-wrap:anywhere}.new-day{break-before:page;page-break-before:always}@media screen{body{padding:20px}main{max-width:980px}}@media print{main{max-width:none}.new-day{margin-top:0}}
</style></head><body><main>${content}</main></body></html>`;
}

/** Generates actual Office Open XML in memory. No HTML disguised as a Word file. */
export async function exportPlanDocx(draft: PlanDraft): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, TableLayoutType, BorderStyle, HeadingLevel, ExternalHyperlink, Footer, PageNumber, VerticalAlign } = await import('docx');
  const font = { ascii: 'Arial', hAnsi: 'Arial', eastAsia: FONT, cs: 'Arial' };
  const textRuns = (value: string, bold = false, size = 21) => clean(value).split(/\r\n?|\n/).map((text, index) => new TextRun({ text, ...(index ? { break: 1 } : {}), bold, size, font, color: '000000' }));
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'D9D9D9' };
  const children = report(draft).flatMap(block => {
    if (block.kind === 'heading') return new Paragraph({ heading: block.level === 1 ? HeadingLevel.TITLE : block.level === 2 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2, children: textRuns(block.text, true, block.level === 1 ? 38 : block.level === 2 ? 28 : 23), spacing: { before: block.level === 1 ? 0 : 220, after: 100 }, keepNext: true, keepLines: true, pageBreakBefore: block.newPage ?? false });
    if (block.kind === 'paragraph') return new Paragraph({ children: textRuns(block.text, false, block.small ? 18 : 21), spacing: { after: 120, line: 300 } });
    if (block.kind === 'source') {
      const url = safePlanUrl(block.url);
      return new Paragraph({ children: [new TextRun({ text: `[${block.number}] `, font, size: 18 }), ...(url ? [new ExternalHyperlink({ link: url, children: [new TextRun({ text: clean(block.url), font, size: 18, color: '173E56', underline: {} })] })] : textRuns(`${block.url}（未建立連結）`, false, 18))], spacing: { after: 100 } });
    }
    const available = 10_206; const widths = (block.widths ?? block.headers.map(() => 100 / block.headers.length)).map(width => Math.floor(available * width / 100));
    const makeRow = (row: string[], header: boolean) => new TableRow({ tableHeader: header, cantSplit: header || row.join('').length < 900, children: row.map((cell, index) => new TableCell({ width: { size: widths[index], type: WidthType.DXA }, margins: { top: 70, bottom: 70, left: 90, right: 90 }, verticalAlign: VerticalAlign.CENTER, shading: header ? { fill: 'F1F3F3' } : undefined, children: [new Paragraph({ children: textRuns(cell, header, 18), spacing: { after: 30, line: 270 }, keepNext: false })] })) });
    return [new Table({ rows: [makeRow(block.headers, true), ...block.rows.map(row => makeRow(row, false))], width: { size: available, type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED, borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border } }), new Paragraph({ children: [new TextRun({ text: '', size: 2 })], spacing: { before: 0, after: 80, line: 60 } })];
  });
  const document = new Document({
    title: clean(draft.title || '登山行程草稿'), creator: 'mt_info', description: '依使用者草稿輸出；包含未知欄位、待查項目與來源快照。',
    styles: { default: { document: { run: { font, size: 21, color: '000000', language: { value: 'zh-TW', eastAsia: 'zh-TW' } }, paragraph: { spacing: { after: 100, line: 300 } } } } },
    sections: [{ properties: { page: { size: { width: 11_906, height: 16_838 }, margin: { top: 907, bottom: 907, left: 850, right: 850 } } }, children, footers: { default: new Footer({ children: [new Paragraph({ children: [new TextRun({ text: '行程草稿　', font, size: 16 }), new TextRun({ children: [PageNumber.CURRENT], font, size: 16 }), new TextRun({ text: ' / ', font, size: 16 }), new TextRun({ children: [PageNumber.TOTAL_PAGES], font, size: 16 })], spacing: { before: 80 } })] }) } }],
  });
  return Packer.toBlob(document);
}

export { exportFilename } from './filename';
