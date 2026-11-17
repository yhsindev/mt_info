import type { ConditionsSource, TrailCondition } from '../shared/conditions';
import { ageConditions } from '../shared/conditions-freshness';
import { createBlankPlan, parsePlanDraft } from './model';

export const NOTICE_CHECKS_KEY = 'mt-info-plan-notice-checks-v1';
export type NoticeRecord = Pick<TrailCondition, 'id' | 'trailId' | 'name' | 'manager' | 'condition' | 'rawCondition' | 'headline' | 'description' | 'section' | 'issuedAt' | 'updatedAt' | 'closureDate' | 'expectedOpeningDate'> & { sourceUrl: string };
export interface NoticeCheck { routeId: string; checkedAt: string; capturedAt: string; items: NoticeRecord[] }
export type NoticeChecks = Record<string, NoticeCheck>;
const keys = ['id','trailId','name','manager','condition','rawCondition','headline','description','section','issuedAt','updatedAt','closureDate','expectedOpeningDate','sourceUrl'].sort().join();
const isTimestamp = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
const byteSize = (value: string) => new TextEncoder().encode(value).byteLength;
const errorText = '公告比對紀錄無法讀取或保存，原始內容保持。可下載備份後清除；目前草稿不受影響。';

function parseChecks(value: unknown): NoticeChecks {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
  const root = value as Record<string, unknown>;
  if (Object.keys(root).sort().join() !== 'checks,schemaVersion' || root.schemaVersion !== 1 || !root.checks || typeof root.checks !== 'object' || Array.isArray(root.checks)) throw new Error();
  const entries = Object.entries(root.checks);
  if (entries.length > 50) throw new Error();
  const result: NoticeChecks = {};
  for (const [id, raw] of entries) {
    const check = raw as NoticeCheck;
    if (!/^\d{3}$/.test(id) || !check || Object.keys(check).sort().join() !== 'capturedAt,checkedAt,items,routeId' || check.routeId !== id || !isTimestamp(check.checkedAt) || !isTimestamp(check.capturedAt) || !Array.isArray(check.items) || check.items.length > 200) throw new Error();
    for (const item of check.items) {
      if (!item || Object.keys(item).sort().join() !== keys || item.trailId !== id || !['closed','partial','caution','unknown'].includes(item.condition)) throw new Error();
      for (const field of ['name','manager','rawCondition','headline','sourceUrl'] as const) if (typeof item[field] !== 'string' || item[field].length > 2000) throw new Error();
      if (item.section !== null && (typeof item.section !== 'string' || item.section.length > 2000)) throw new Error();
    }
    // Reuse the v1 date, URL, text-size and duplicate-ID checks used by plan imports.
    const base = { ...createBlankPlan(), days: [] };
    const advisories = check.items.map(item => ({ id:item.id, title:item.headline, description:item.description, publisher:item.manager, sourceUrl:item.sourceUrl, issuedAt:item.issuedAt, closureDate:item.closureDate, expectedOpeningDate:item.expectedOpeningDate, capturedAt:check.capturedAt, sourceCheckedAt:check.checkedAt, sourceStatus:'ready' }));
    parsePlanDraft({ ...base, advisories });
    parsePlanDraft({ ...base, advisories:advisories.map((item, index) => ({ ...item, issuedAt:check.items[index].updatedAt })) });
    result[id] = check;
  }
  return result;
}
export function readNoticeChecks(storage?: Storage): { checks: NoticeChecks; raw: string | null; error: string | null } {
  let raw: string | null = null;
  try {
    raw = (storage ?? window.localStorage).getItem(NOTICE_CHECKS_KEY);
    if (raw === null) return { checks:{}, raw, error:null };
    if (byteSize(raw) > 512 * 1024) throw new Error();
    return { checks:parseChecks(JSON.parse(raw)), raw, error:null };
  } catch { return { checks:{}, raw, error:errorText }; }
}
export function createNoticeCheck(feed: ConditionsSource<TrailCondition>, routeId: string, now = Date.now()): NoticeCheck | null {
  if (!/^\d{3}$/.test(routeId) || !isTimestamp(feed.checkedAt) || !['ready','empty'].includes(feed.status)) return null;
  // A stale, future-dated or failed snapshot must never become a new comparison baseline.
  const wrapper = { generatedAt:new Date(now).toISOString(), trails:{ ...feed, catalogCount:0, unmatchedCount:0 }, alerts:{ ...feed, items:[], unknownTimeCount:0 } };
  if (!['ready','empty'].includes(ageConditions(wrapper, now)!.trails.status)) return null;
  return { routeId, checkedAt:feed.checkedAt, capturedAt:new Date(now).toISOString(), items:noticeRecords(feed.items,routeId) };
}
export function noticeRecords(items: TrailCondition[], routeId: string): NoticeRecord[] {
  return items.filter(item => item.trailId === routeId).map(item => {
    const { id,trailId,name,manager,condition,rawCondition,headline,description,section,issuedAt,updatedAt,closureDate,expectedOpeningDate } = item;
    return { id,trailId,name,manager,condition,rawCondition,headline,description,section,issuedAt,updatedAt,closureDate,expectedOpeningDate,sourceUrl:item.source.url };
  });
}
export function writeNoticeCheck(check: NoticeCheck, storage?: Storage): { error: string | null; checks?: NoticeChecks } {
  try {
    const target = storage ?? window.localStorage, old = readNoticeChecks(target);
    if (old.error) return { error:old.error };
    const checks = { ...old.checks, [check.routeId]:check }, body = JSON.stringify({ schemaVersion:1, checks });
    if (byteSize(body) > 512 * 1024) throw new Error();
    parseChecks(JSON.parse(body));
    target.setItem(NOTICE_CHECKS_KEY, body);
    return { error:null, checks };
  } catch { return { error:errorText }; }
}
export function compareNoticeChecks(before: NoticeCheck, after: NoticeCheck) {
  if (before.routeId !== after.routeId) throw new Error('不同步道的公告不能互相比對。');
  const previous = new Map(before.items.map(item => [item.id,item])), current = new Map(after.items.map(item => [item.id,item]));
  return {
    added:after.items.filter(item => !previous.has(item.id)),
    changed:after.items.filter(item => previous.has(item.id) && (Object.keys(item) as (keyof NoticeRecord)[]).some(key => previous.get(item.id)![key] !== item[key])).map(item => ({ before:previous.get(item.id)!, after:item })),
    absent:before.items.filter(item => !current.has(item.id)),
  };
}
