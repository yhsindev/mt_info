import { parsePlanDraft } from './model';
import type { PlanDraft } from './types';

export const PLAN_STORAGE_KEY = 'mt-info-plan-v1';
const MAX_BYTES = 512 * 1024;
const size = (value: string) => new TextEncoder().encode(value).byteLength;
const unavailable = '無法使用本機儲存空間；目前編輯內容仍留在記憶體，請下載草稿備份。';
function browserStorage(): Storage {
  if (typeof window === 'undefined') throw new Error('storage unavailable');
  return window.localStorage;
}

export function readPlanStorage(storage?: Storage): { draft: PlanDraft | null; error: string | null; raw: string | null } {
  let raw: string | null = null;
  try { raw = (storage ?? browserStorage()).getItem(PLAN_STORAGE_KEY); }
  catch { return { draft: null, error: unavailable, raw }; }
  if (raw === null) return { draft: null, error: null, raw: null };
  try {
    if (size(raw) > MAX_BYTES) throw new Error('草稿超過 512 KB。');
    return { draft: parsePlanDraft(JSON.parse(raw)), error: null, raw };
  } catch {
    return { draft: null, error: '保存的草稿無法完整讀取，原始內容仍保留；請先下載備份，再選擇是否重建。', raw };
  }
}

export function writePlanStorage(draft: PlanDraft, storage?: Storage): { savedAt: string | null; error: string | null } {
  let body: string;
  const savedAt = new Date().toISOString();
  try {
    const valid = parsePlanDraft(draft);
    body = JSON.stringify({ ...valid, updatedAt: savedAt });
    if (size(body) > MAX_BYTES) return { savedAt: null, error: '草稿超過 512 KB，未寫入本機；請下載備份或減少內容。' };
  } catch {
    return { savedAt: null, error: '草稿格式尚無法保存；目前編輯內容未清除，請確認欄位或下載備份。' };
  }
  try {
    const target = storage ?? browserStorage();
    const existing = readPlanStorage(target);
    if (existing.error) return { savedAt: null, error: existing.raw === null ? existing.error : '本機已有無法讀取的草稿，未覆寫原始內容；請先下載備份，或明確重建後再保存。' };
    target.setItem(PLAN_STORAGE_KEY, body);
    return { savedAt, error: null };
  } catch { return { savedAt: null, error: unavailable }; }
}
