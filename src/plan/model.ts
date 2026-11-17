import type { PlanAdvisory, PlanCalculation, PlanDay, PlanDayCalculation, PlanDraft, PlanIssue, PlanLeg, PlanTime, PlanTotal } from './types';

const MAX_NUMBER = 1_000_000;
const MAX_DAYS = 30;
const MAX_LEGS = 40;
let sequence = 0;
const identifier = (prefix: string) => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${++sequence}-${Math.random().toString(36).slice(2)}`}`;

function calendar(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  if (year < 1 || year > 9999) return null;
  const date = new Date(0); date.setUTCHours(0, 0, 0, 0); date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}
const isTime = (value: string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
function isTimestamp(value: string): boolean {
  const match = /^(\d{4}-\d{2}-\d{2})T((?:[01]\d|2[0-3]):[0-5]\d):[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  return !!match && calendar(match[1]) !== null && Number.isFinite(Date.parse(value));
}
function addDate(value: string, days: number): string | null {
  const date = calendar(value);
  if (!date || !Number.isSafeInteger(days)) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.getUTCFullYear() >= 1 && date.getUTCFullYear() <= 9999 ? date.toISOString().slice(0, 10) : null;
}

export function createPlanLeg(): PlanLeg {
  return { id: identifier('leg'), from: '', to: '', minutes: null, restMinutes: 0, distanceKm: null, ascentM: null, descentM: null, load: 'full', sourceUrl: '' };
}
/** The label uses a one-based day number; dates are derived separately in UTC. */
export function createPlanDay(index = 1): PlanDay {
  if (!Number.isInteger(index) || index < 1 || index > MAX_DAYS) throw new Error('計畫日序需介於 1 至 30。');
  return {
    id: identifier('day'), label: `第 ${index} 天`, startTime: '', legs: [createPlanLeg()],
    water: { primary: '', backup: '', note: '', availability: 'unknown', reportedAt: '', sourceUrl: '', perPersonL: null, cookingL: null, reserveL: null, detourMinutes: null },
    lodging: { name: '', backup: '', reservation: 'unknown', approvalReference: '', sourceUrl: '' },
    retreat: { decisionPoint: '', deadline: '', trigger: '', route: '', confirmed: false, sourceUrl: '' },
    menu: '', notes: '',
  };
}
export function createBlankPlan(now = new Date().toISOString()): PlanDraft {
  if (!isTimestamp(now)) throw new Error('建立計畫需有效的完整時間。');
  return {
    schemaVersion: 1, id: identifier('plan'), title: '', routeName: '', referenceRouteId: null,
    startDate: '', members: null, leader: '', leaderPhone: '', keeper: '', keeperPhone: '',
    checkInPlan: '', overdueAt: '', communication: '', gear: '', notes: '', reviewNotes: '',
    days: [createPlanDay()], advisories: [], createdAt: now, updatedAt: now,
  };
}

const known = (value: number | null): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_NUMBER;
const duration = (value: number | null): value is number => known(value) && Number.isInteger(value);
function total(values: (number | null)[]): PlanTotal {
  const present = values.filter(known);
  const missing = values.length ? values.length - present.length : 1;
  const sum = present.reduce((sum, value) => sum + value, 0);
  return { known: sum, missing, complete: missing === 0, value: missing === 0 ? sum : null };
}
function combine(values: PlanTotal[]): PlanTotal {
  const sum = values.reduce((sum, value) => sum + value.known, 0);
  const missing = values.length ? values.reduce((sum, value) => sum + value.missing, 0) : 1;
  return { known: sum, missing, complete: missing === 0, value: missing === 0 ? sum : null };
}
function timeValue(value: string): number | null { return isTime(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null; }
function planTime(minutes: number | null): PlanTime | null {
  if (minutes === null || !Number.isSafeInteger(minutes) || minutes < 0) return null;
  const dayOffset = Math.floor(minutes / 1440), inDay = minutes % 1440;
  return { time: `${String(Math.floor(inDay / 60)).padStart(2, '0')}:${String(inDay % 60).padStart(2, '0')}`, dayOffset };
}
export function formatPlanTime(value: PlanTime | null): string {
  if (!value || !isTime(value.time) || !Number.isSafeInteger(value.dayOffset) || value.dayOffset < 0) return '未知';
  return value.dayOffset === 0 ? value.time : value.dayOffset === 1 ? `次日 ${value.time}` : `第 ${value.dayOffset + 1} 日 ${value.time}`;
}

/** Manual estimates only: missing travel/rest durations propagate through the remaining day. */
export function calculatePlan(draft: PlanDraft): PlanCalculation {
  const issues: PlanIssue[] = [];
  const issue = (id: string, level: PlanIssue['level'], message: string, dayId?: string) => issues.push({ id, level, message, ...(dayId ? { dayId } : {}) });
  for (const [field, label] of [['title', '計畫名稱'], ['routeName', '路線名稱'], ['startDate', '出發日期'], ['leader', '領隊'], ['leaderPhone', '領隊聯絡方式'], ['keeper', '留守人'], ['keeperPhone', '留守聯絡方式'], ['checkInPlan', '回報安排'], ['overdueAt', '逾時處置時間'], ['communication', '通訊安排'], ['gear', '裝備清單']] as const) {
    if (!draft[field].trim()) issue(`plan-${field}`, 'missing', `待填寫${label}。`);
  }
  if (draft.startDate && !calendar(draft.startDate)) issue('plan-startDate-invalid', 'review', '出發日期格式需人工確認。');
  if (!duration(draft.members) || draft.members < 1) issue('plan-members', 'missing', '待確認參與人數，至少需有一位成員。');
  if (!draft.days.length) issue('plan-days', 'missing', '待新增每日行程。');
  const days: PlanDayCalculation[] = draft.days.map((day, index) => {
    let cursor = timeValue(day.startTime);
    if (cursor === null) issue(`${day.id}-start`, 'missing', '待填寫當日起登時間。', day.id);
    if (!day.legs.length) issue(`${day.id}-legs`, 'missing', '待新增當日路段。', day.id);
    const absentPlaces: number[] = [], absentTravel: number[] = [], absentRest: number[] = [];
    const legs = day.legs.map((leg, legIndex) => {
      const depart = planTime(cursor);
      if (!leg.from.trim() || !leg.to.trim()) absentPlaces.push(legIndex + 1);
      if (!duration(leg.minutes)) absentTravel.push(legIndex + 1);
      cursor = cursor !== null && duration(leg.minutes) ? cursor + leg.minutes : null;
      const arrive = planTime(cursor);
      if (!duration(leg.restMinutes)) absentRest.push(legIndex + 1);
      cursor = cursor !== null && duration(leg.restMinutes) ? cursor + leg.restMinutes : null;
      return { id: leg.id, depart, arrive, afterRest: planTime(cursor) };
    });
    const segmentNames = (indices: number[]) => indices.length <= 5 ? `第 ${indices.join('、')} 路段` : `${indices.length} 個路段`;
    if (absentPlaces.length) issue(`${day.id}-places`, 'missing', `${segmentNames(absentPlaces)}的起點或終點待填。`, day.id);
    if (absentTravel.length) issue(`${day.id}-travel`, 'missing', `${segmentNames(absentTravel)}的行進時間待填，後續抵達時間保持未知。`, day.id);
    if (absentRest.length) issue(`${day.id}-rest`, 'missing', `${segmentNames(absentRest)}的休息時間待填，後續出發時間保持未知。`, day.id);
    const walk = day.legs.map(leg => duration(leg.minutes) ? leg.minutes : null);
    const rests = day.legs.map(leg => duration(leg.restMinutes) ? leg.restMinutes : null);
    const { water } = day;
    const waterLitres = duration(draft.members) && draft.members >= 1 && known(water.perPersonL) && known(water.cookingL) && known(water.reserveL)
      ? draft.members * water.perPersonL + water.cookingL + water.reserveL : null;
    if (waterLitres === null) issue(`${day.id}-water-amount`, 'missing', '待填寫人數、每人用水、炊煮與備用水量；未知值不當成零。', day.id);
    if (!water.primary.trim() || !water.backup.trim()) issue(`${day.id}-water-source`, 'missing', '待確認主要與備援取水安排。', day.id);
    if (water.availability !== 'confirmed' || !water.reportedAt || !water.sourceUrl.trim()) issue(`${day.id}-water-review`, 'review', '水情、查核日期與資訊來源待人工確認；紀錄不代表可飲用或當日仍有水。', day.id);
    if (water.detourMinutes !== null) issue(`${day.id}-water-detour`, 'review', '取水往返時間僅為備註，請自行確認是否已納入路段行進或餐休時間。', day.id);
    if (day.lodging.reservation !== 'approved') issue(`${day.id}-lodging`, 'review', '待人工確認當日住宿或返回安排與申請狀態。', day.id);
    else if (!day.lodging.name.trim() || !day.lodging.approvalReference.trim()) issue(`${day.id}-lodging-evidence`, 'missing', '住宿標為已核准，仍需填寫住宿名稱與核准資訊。', day.id);
    if (!day.retreat.confirmed) issue(`${day.id}-retreat`, 'review', '撤退路線、決策點、截止時間與觸發條件尚未完成個別查核。', day.id);
    if (!day.retreat.decisionPoint.trim() || !isTime(day.retreat.deadline) || !day.retreat.trigger.trim() || !day.retreat.route.trim()) issue(`${day.id}-retreat-fields`, 'missing', '待填寫撤退決策點、截止時間、觸發條件與路線；勾選查核不代替內容。', day.id);
    return {
      id: day.id, date: addDate(draft.startDate, index), legs, finish: day.legs.length ? planTime(cursor) : null,
      distanceKm: total(day.legs.map(leg => leg.distanceKm)), ascentM: total(day.legs.map(leg => leg.ascentM)), descentM: total(day.legs.map(leg => leg.descentM)),
      travelMinutes: total(walk), restMinutes: total(rests), totalMinutes: total([...walk, ...rests]), waterLitres,
    };
  });
  for (let index = 1; index < days.length; index++) {
    const previous = days[index - 1].finish, start = timeValue(draft.days[index].startTime);
    if (previous && start !== null && previous.dayOffset * 1440 + timeValue(previous.time)! > 1440 + start) issue(`${days[index].id}-overlap`, 'review', '前日預計結束晚於本日起登時間，請人工調整跨日安排。', days[index].id);
  }
  for (const advisory of draft.advisories) issue(`advisory-${advisory.id}`, 'review', ['stale', 'error', 'missing', 'disabled'].includes(advisory.sourceStatus)
    ? `收錄的「${advisory.title || '官方公告'}」來源狀態待重新查核。` : `請在出發前人工重查「${advisory.title || '官方公告'}」原文及適用範圍。`);
  const last = days.at(-1);
  return {
    days, endDate: last?.finish ? addDate(draft.startDate, days.length - 1 + last.finish.dayOffset) : null,
    distanceKm: combine(days.map(day => day.distanceKm)), ascentM: combine(days.map(day => day.ascentM)), descentM: combine(days.map(day => day.descentM)),
    totalMinutes: combine(days.map(day => day.totalMinutes)), waterLitres: combine(days.map(day => day.waterLitres === null
      ? { known: 0, missing: 1, complete: false, value: null }
      : { known: day.waterLitres, missing: 0, complete: true, value: day.waterLitres })), issues,
  };
}

function fail(field: string): never { throw new Error(`計畫格式不符：${field}。`); }
function object(value: unknown, keys: string[], field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return fail(field);
  const actual = Reflect.ownKeys(value);
  if (actual.length !== keys.length || actual.some(key => typeof key !== 'string' || !keys.includes(key))) return fail(`${field}欄位`);
  return value as Record<string, unknown>;
}
function string(value: unknown, field: string, maximum = 1000): string {
  if (typeof value !== 'string' || value.length > maximum) return fail(field);
  return value;
}
function number(value: unknown, field: string, integer = false): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !known(value) || integer && !Number.isInteger(value)) return fail(field);
  return value;
}
function choice<T extends string>(value: unknown, values: readonly T[], field: string): T {
  if (typeof value !== 'string' || !values.includes(value as T)) return fail(field);
  return value as T;
}
function date(value: unknown, field: string, kind: 'date' | 'time' | 'timestamp' | 'local' = 'date', blank = true): string {
  const result = string(value, field, 40);
  if (blank && !result) return result;
  const valid = kind === 'date' ? calendar(result) !== null : kind === 'time' ? isTime(result) : kind === 'timestamp' ? isTimestamp(result)
    : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(result) && calendar(result.slice(0, 10)) !== null && isTime(result.slice(11));
  return valid ? result : fail(field);
}
function url(value: unknown, field: string): string {
  const result = string(value, field, 2000);
  if (!result) return result;
  if (/[\u0000-\u0020\u007f]/.test(result)) return fail(field);
  try {
    const parsed = new URL(result);
    if (['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password) return result;
  } catch { /* Invalid URL. */ }
  return fail(field);
}
function list(value: unknown, maximum: number, field: string): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) return fail(field);
  return value;
}

/** Strict v1 JSON import; reconstructs a new object and never coerces unknowns to zero. */
export function parsePlanDraft(input: unknown): PlanDraft {
  const ids = new Set<string>();
  const id = (value: unknown, field: string) => {
    const result = string(value, field, 128);
    if (!result.trim() || /[\u0000-\u001f\u007f]/.test(result) || ids.has(result)) return fail(`${field}識別碼`);
    ids.add(result); return result;
  };
  const root = object(input, ['schemaVersion', 'id', 'title', 'routeName', 'referenceRouteId', 'startDate', 'members', 'leader', 'leaderPhone', 'keeper', 'keeperPhone', 'checkInPlan', 'overdueAt', 'communication', 'gear', 'notes', 'reviewNotes', 'days', 'advisories', 'createdAt', 'updatedAt'], '草稿');
  if (root.schemaVersion !== 1) return fail('僅支援 schemaVersion 1');
  const planId = id(root.id, '計畫');
  const days = list(root.days, MAX_DAYS, '每日行程').map((input): PlanDay => {
    const day = object(input, ['id', 'label', 'startTime', 'legs', 'water', 'lodging', 'retreat', 'menu', 'notes'], '每日行程');
    const dayId = id(day.id, '每日行程');
    const legs = list(day.legs, MAX_LEGS, '每日路段').map((input): PlanLeg => {
      const leg = object(input, ['id', 'from', 'to', 'minutes', 'restMinutes', 'distanceKm', 'ascentM', 'descentM', 'load', 'sourceUrl'], '路段');
      return { id: id(leg.id, '路段'), from: string(leg.from, '起點'), to: string(leg.to, '終點'), minutes: number(leg.minutes, '行進分鐘', true), restMinutes: number(leg.restMinutes, '餐休分鐘', true), distanceKm: number(leg.distanceKm, '距離'), ascentM: number(leg.ascentM, '上升'), descentM: number(leg.descentM, '下降'), load: choice(leg.load, ['full', 'light'], '背負'), sourceUrl: url(leg.sourceUrl, '路段來源') };
    });
    const water = object(day.water, ['primary', 'backup', 'note', 'availability', 'reportedAt', 'sourceUrl', 'perPersonL', 'cookingL', 'reserveL', 'detourMinutes'], '水源');
    const lodging = object(day.lodging, ['name', 'backup', 'reservation', 'approvalReference', 'sourceUrl'], '住宿');
    const retreat = object(day.retreat, ['decisionPoint', 'deadline', 'trigger', 'route', 'confirmed', 'sourceUrl'], '撤退');
    if (typeof retreat.confirmed !== 'boolean') return fail('撤退查核');
    return {
      id: dayId, label: string(day.label, '每日標籤', 240), startTime: date(day.startTime, '起登時間', 'time'), legs,
      water: { primary: string(water.primary, '主要水源'), backup: string(water.backup, '備援水源'), note: string(water.note, '水源備註', 10_000), availability: choice(water.availability, ['unknown', 'reported', 'confirmed', 'dry'], '水情'), reportedAt: date(water.reportedAt, '水情日期'), sourceUrl: url(water.sourceUrl, '水源來源'), perPersonL: number(water.perPersonL, '每人用水'), cookingL: number(water.cookingL, '炊煮用水'), reserveL: number(water.reserveL, '備用水'), detourMinutes: number(water.detourMinutes, '取水往返分鐘', true) },
      lodging: { name: string(lodging.name, '住宿'), backup: string(lodging.backup, '備援住宿'), reservation: choice(lodging.reservation, ['unknown', 'planned', 'applied', 'approved'], '住宿申請'), approvalReference: string(lodging.approvalReference, '核准資訊'), sourceUrl: url(lodging.sourceUrl, '住宿來源') },
      retreat: { decisionPoint: string(retreat.decisionPoint, '撤退決策點'), deadline: date(retreat.deadline, '撤退截止', 'time'), trigger: string(retreat.trigger, '撤退條件', 10_000), route: string(retreat.route, '撤退路線', 10_000), confirmed: retreat.confirmed, sourceUrl: url(retreat.sourceUrl, '撤退來源') },
      menu: string(day.menu, '菜單', 10_000), notes: string(day.notes, '每日備註', 10_000),
    };
  });
  const advisories = list(root.advisories, 200, '官方公告').map((input): PlanAdvisory => {
    const advisory = object(input, ['id', 'title', 'description', 'publisher', 'sourceUrl', 'issuedAt', 'closureDate', 'expectedOpeningDate', 'capturedAt', 'sourceCheckedAt', 'sourceStatus'], '官方公告');
    const optionalDate = (value: unknown, field: string) => value === null ? null : typeof value === 'string' && calendar(value) ? value : date(value, field, 'timestamp', false);
    return { id: id(advisory.id, '官方公告'), title: string(advisory.title, '公告標題'), description: string(advisory.description, '公告全文', 20_000), publisher: string(advisory.publisher, '發布機關'), sourceUrl: url(advisory.sourceUrl, '公告來源'), issuedAt: optionalDate(advisory.issuedAt, '公告發布時間'), closureDate: optionalDate(advisory.closureDate, '封閉日期'), expectedOpeningDate: optionalDate(advisory.expectedOpeningDate, '預計開放日期'), capturedAt: date(advisory.capturedAt, '公告收錄時間', 'timestamp', false), sourceCheckedAt: advisory.sourceCheckedAt === null ? null : date(advisory.sourceCheckedAt, '來源檢查時間', 'timestamp', false), sourceStatus: choice(advisory.sourceStatus, ['ready', 'empty', 'stale', 'missing', 'error', 'disabled'], '公告來源狀態') };
  });
  if (root.referenceRouteId !== null && !string(root.referenceRouteId, '參考路線', 128).trim()) return fail('參考路線');
  return {
    schemaVersion: 1, id: planId, title: string(root.title, '計畫名稱'), routeName: string(root.routeName, '路線名稱'), referenceRouteId: root.referenceRouteId as string | null,
    startDate: date(root.startDate, '出發日期'), members: number(root.members, '人數', true), leader: string(root.leader, '領隊'), leaderPhone: string(root.leaderPhone, '領隊聯絡', 100), keeper: string(root.keeper, '留守人'), keeperPhone: string(root.keeperPhone, '留守聯絡', 100),
    checkInPlan: string(root.checkInPlan, '回報安排', 10_000), overdueAt: date(root.overdueAt, '逾時處置時間', 'local'), communication: string(root.communication, '通訊安排', 10_000), gear: string(root.gear, '裝備', 10_000), notes: string(root.notes, '備註', 10_000), reviewNotes: string(root.reviewNotes, '人工查核', 10_000),
    days, advisories, createdAt: date(root.createdAt, '建立時間', 'timestamp', false), updatedAt: date(root.updatedAt, '更新時間', 'timestamp', false),
  };
}
