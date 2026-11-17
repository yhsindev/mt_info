import { parsePlanDraft } from './model';
import type { PlanDraft } from './types';

export const PLAN_BACKUP_KEY = 'mt-info-plan-alternative-v1';
const maximum = 512 * 1024;
const bytes = (text: string) => new TextEncoder().encode(text).byteLength;
export interface PlanBackup { parentId: string; draft: PlanDraft }
export function readPlanBackup(storage?: Storage): { backup: PlanBackup | null; error: string | null; raw: string | null } {
  let raw: string | null = null;
  try {
    raw = (storage ?? window.localStorage).getItem(PLAN_BACKUP_KEY);
    if (raw === null) return { backup: null, error: null, raw };
    if (bytes(raw) > maximum) throw new Error();
    const value = JSON.parse(raw);
    if (!value || value.schemaVersion !== 1 || Object.keys(value).sort().join() !== 'draft,parentId,schemaVersion' || typeof value.parentId !== 'string' || !value.parentId.trim() || value.parentId.length > 128) throw new Error();
    const draft = parsePlanDraft(value.draft);
    if (draft.id === value.parentId) throw new Error();
    return { backup: { parentId: value.parentId, draft }, error: null, raw };
  } catch { return { backup: null, raw, error: '備案無法讀取，原始內容保持；請下載備份後再清除重建。' }; }
}
export function writePlanBackup(parentId: string, draft: PlanDraft, storage?: Storage): { savedAt: string | null; error: string | null } {
  try {
    const target = storage ?? window.localStorage;
    const existing = readPlanBackup(target);
    if (existing.error) return { savedAt: null, error: existing.error };
    if (existing.backup && existing.backup.parentId !== parentId) return { savedAt: null, error: '本機另有其他主計畫的備案，請先下載備份並清除，再建立這次的備案。' };
    if (!parentId.trim() || parentId.length > 128 || draft.id === parentId) throw new Error();
    const savedAt = new Date().toISOString();
    const body = JSON.stringify({ schemaVersion: 1, parentId, draft: { ...parsePlanDraft(draft), updatedAt: savedAt } });
    if (bytes(body) > maximum) return { savedAt: null, error: '備案超過 512 KB，未寫入本機；請先下載 JSON。' };
    target.setItem(PLAN_BACKUP_KEY, body);
    return { savedAt, error: null };
  } catch { return { savedAt: null, error: '備案未能保存，主計畫保持；請下載目前 JSON 備份並檢查本機儲存空間。' }; }
}

export function createPlanBackup(main: PlanDraft): PlanDraft {
  const draft = parsePlanDraft(main), now = new Date().toISOString();
  return { ...draft, id: `plan-${globalThis.crypto.randomUUID()}`, title: `${draft.title.slice(0, 232)}・備案`, createdAt: now, updatedAt: now };
}
