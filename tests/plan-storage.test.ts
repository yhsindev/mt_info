import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBlankPlan } from '../src/plan/model';
import { PLAN_STORAGE_KEY, readPlanStorage, writePlanStorage } from '../src/plan/storage';

class MemoryStorage implements Storage {
  values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}
afterEach(() => vi.useRealTimers());

describe('登山計畫本機草稿', () => {
  it('returns an absent draft without inventing one; saves and validates a v1 draft without changing memory', () => {
    const storage = new MemoryStorage(); expect(readPlanStorage(storage)).toEqual({ draft: null, error: null, raw: null });
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-22T03:00:00Z'));
    const plan = createBlankPlan('2026-10-22T02:00:00.000Z');
    const result = writePlanStorage(plan, storage);
    expect(result).toEqual({ savedAt: '2026-10-22T03:00:00.000Z', error: null });
    expect(plan.updatedAt).toBe('2026-10-22T02:00:00.000Z');
    const restored = readPlanStorage(storage);
    expect(restored.error).toBeNull(); expect(restored.draft?.updatedAt).toBe(result.savedAt); expect(restored.raw).toBe(storage.getItem(PLAN_STORAGE_KEY));
    expect(restored.draft?.members).toBeNull(); expect(restored.draft?.days[0].legs[0].minutes).toBeNull();
  });
  it.each(['{broken-json', '{"schemaVersion":99}', 'null', 'x'.repeat(512 * 1024 + 1)])('keeps corrupt or unsupported raw drafts intact and refuses automatic overwrite (%#)', raw => {
    const storage = new MemoryStorage(); storage.setItem(PLAN_STORAGE_KEY, raw);
    expect(readPlanStorage(storage)).toMatchObject({ draft: null, raw, error: expect.any(String) });
    expect(writePlanStorage(createBlankPlan(), storage)).toMatchObject({ savedAt: null, error: expect.any(String) });
    expect(storage.getItem(PLAN_STORAGE_KEY)).toBe(raw);
    storage.removeItem(PLAN_STORAGE_KEY);
    expect(writePlanStorage(createBlankPlan(), storage).error).toBeNull();
  });
  it('reports quota and read failures without deleting prior data or mutating the live draft', () => {
    const storage = new MemoryStorage(), plan = createBlankPlan(); const before = JSON.stringify(plan);
    storage.setItem(PLAN_STORAGE_KEY, before);
    vi.spyOn(storage, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
    const result = writePlanStorage(plan, storage);
    expect(result.savedAt).toBeNull(); expect(result.error).toBeTruthy(); expect(JSON.stringify(plan)).toBe(before); expect(storage.getItem(PLAN_STORAGE_KEY)).toBe(before);
    vi.spyOn(storage, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    expect(readPlanStorage(storage)).toMatchObject({ draft: null, error: expect.any(String), raw: null });
    expect(writePlanStorage(plan, storage).savedAt).toBeNull();
  });
  it('does not claim a successful save when browser storage is unavailable or a draft is invalid', () => {
    expect(readPlanStorage()).toMatchObject({ draft: null, error: expect.any(String), raw: null });
    expect(writePlanStorage(createBlankPlan())).toMatchObject({ savedAt: null, error: expect.any(String) });
    const storage = new MemoryStorage(), invalid = createBlankPlan(); invalid.members = Infinity;
    expect(writePlanStorage(invalid, storage).error).toBeTruthy(); expect(storage.length).toBe(0);
  });
  it('bounds UTF-8 bytes rather than character count without overwriting an existing valid draft', () => {
    const storage = new MemoryStorage(), plan = createBlankPlan();
    expect(writePlanStorage(plan, storage).error).toBeNull(); const original = storage.getItem(PLAN_STORAGE_KEY);
    plan.days = Array.from({ length: 20 }, (_, index) => ({ ...plan.days[0], id: `day-${index}`, legs: [], notes: '山'.repeat(10_000) }));
    expect(writePlanStorage(plan, storage)).toMatchObject({ savedAt: null, error: expect.stringContaining('512 KB') });
    expect(storage.getItem(PLAN_STORAGE_KEY)).toBe(original);
  });
});
