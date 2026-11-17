import { describe, expect, it, vi } from 'vitest';
import { emptyCollection, recordCard } from '../src/cards/model';
import { CARDS_STORAGE_KEY, MAX_COLLECTION_BYTES, parseCollection, readCollection, replaceCollection, saveCollection } from '../src/cards/storage';

class MemoryStorage implements Storage {
  values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}
const example = () => recordCard(emptyCollection(), 'clouds', '2026-10-26T00:00:00.000Z');

describe('山行卡 JSON 驗證', () => {
  it('roundtrips an empty or acquired collection, without saving answers or extra fields', () => {
    expect(parseCollection(JSON.stringify(emptyCollection()))).toEqual(emptyCollection());
    const collection = example();
    expect(parseCollection(JSON.stringify(collection))).toEqual(collection);
    expect(parseCollection(JSON.stringify({ ...collection, answers: { question: 'private-answer' }, cards: [{ ...collection.cards[0], name: 'not-a-collection-field' }] }))).toEqual(collection);
  });

  it.each([
    ['unknown card', (value: ReturnType<typeof example>) => ({ ...value, cards: [{ ...value.cards[0], cardId: 'not-real' }] })],
    ['future collection version', (value: ReturnType<typeof example>) => ({ ...value, schemaVersion: 2 })],
    ['future artwork version', (value: ReturnType<typeof example>) => ({ ...value, cards: [{ ...value.cards[0], artworkVersion: 2 }] })],
    ['duplicate card', (value: ReturnType<typeof example>) => ({ ...value, cards: [value.cards[0], value.cards[0]] })],
    ['zero count', (value: ReturnType<typeof example>) => ({ ...value, cards: [{ ...value.cards[0], count: 0 }] })],
    ['fractional count', (value: ReturnType<typeof example>) => ({ ...value, cards: [{ ...value.cards[0], count: 1.5 }] })],
    ['unsafe count', (value: ReturnType<typeof example>) => ({ ...value, cards: [{ ...value.cards[0], count: Number.MAX_SAFE_INTEGER + 1 }] })],
    ['invalid calendar date', (value: ReturnType<typeof example>) => ({ ...value, cards: [{ ...value.cards[0], firstObtainedAt: '2026-02-31T00:00:00.000Z' }] })],
    ['last time before first', (value: ReturnType<typeof example>) => ({ ...value, cards: [{ ...value.cards[0], lastObtainedAt: '2026-10-25T00:00:00.000Z' }] })],
  ] as const)('rejects %s without silently repairing it', (_label, change) => {
    expect(() => parseCollection(JSON.stringify(change(example())))).toThrow();
  });

  it('rejects damaged, oversized, non-object or non-array JSON using UTF-8 byte limits', () => {
    for (const text of ['{broken', 'null', '[]', '{"schemaVersion":1,"cards":null}', '{"schemaVersion":1,"cards":{}}']) expect(() => parseCollection(text)).toThrow();
    const tooLarge = JSON.stringify({ ...example(), extra: '山'.repeat(Math.ceil(MAX_COLLECTION_BYTES / 3)) });
    expect(tooLarge.length).toBeLessThan(MAX_COLLECTION_BYTES);
    expect(() => parseCollection(tooLarge)).toThrow('32 KiB');
  });
});

describe('山行卡本機收藏', () => {
  it('uses an independent key and leaves the plan draft and input collection unchanged', () => {
    const storage = new MemoryStorage(), collection = example(), before = JSON.stringify(collection);
    expect(readCollection(storage)).toEqual({ collection: emptyCollection(), error: null, raw: null });
    storage.setItem('mt-info-plan-v1', 'unrelated-plan-draft');
    expect(CARDS_STORAGE_KEY).not.toBe('mt-info-plan-v1');
    expect(saveCollection(collection, storage)).toEqual({ error: null });
    expect(readCollection(storage)).toEqual({ collection, error: null, raw: before });
    expect(storage.getItem('mt-info-plan-v1')).toBe('unrelated-plan-draft');
    expect(JSON.stringify(collection)).toBe(before);
  });

  it.each(['{broken', '{"schemaVersion":2,"cards":[]}', 'x'.repeat(MAX_COLLECTION_BYTES + 1)])('preserves corrupt raw data and blocks ordinary saves until explicit replacement (%#)', raw => {
    const storage = new MemoryStorage(); storage.setItem(CARDS_STORAGE_KEY, raw);
    expect(readCollection(storage)).toEqual({ collection: emptyCollection(), error: expect.any(String), raw });
    expect(saveCollection(example(), storage).error).toBeTruthy();
    expect(storage.getItem(CARDS_STORAGE_KEY)).toBe(raw);
    expect(replaceCollection(example(), storage)).toEqual({ error: null });
    expect(readCollection(storage).collection).toEqual(example());
  });

  it('reports quota failures without clearing previous valid or corrupt contents', () => {
    const storage = new MemoryStorage(), collection = example();
    expect(saveCollection(collection, storage).error).toBeNull();
    const previous = storage.getItem(CARDS_STORAGE_KEY), remove = vi.spyOn(storage, 'removeItem');
    const set = vi.spyOn(storage, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
    expect(saveCollection(recordCard(collection, 'clouds'), storage).error).toBeTruthy();
    expect(replaceCollection(emptyCollection(), storage).error).toBeTruthy();
    expect(storage.getItem(CARDS_STORAGE_KEY)).toBe(previous); expect(remove).not.toHaveBeenCalled();
    set.mockRestore(); storage.setItem(CARDS_STORAGE_KEY, '{original-corrupt');
    vi.spyOn(storage, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
    expect(replaceCollection(collection, storage).error).toBeTruthy();
    expect(storage.getItem(CARDS_STORAGE_KEY)).toBe('{original-corrupt');
    expect(collection).toEqual(example());
  });

  it('reports denied reads and unavailable browser storage without claiming a save', () => {
    const storage = new MemoryStorage(), set = vi.spyOn(storage, 'setItem');
    vi.spyOn(storage, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    expect(readCollection(storage)).toEqual({ collection: emptyCollection(), error: expect.any(String), raw: null });
    expect(saveCollection(example(), storage).error).toBeTruthy(); expect(set).not.toHaveBeenCalled();
    expect(readCollection().error).toBeTruthy();
    expect(saveCollection(example()).error).toBeTruthy();
    expect(replaceCollection(example()).error).toBeTruthy();
  });

  it('validates replacement data before touching a previously saved collection', () => {
    const storage = new MemoryStorage(); saveCollection(example(), storage);
    const previous = storage.getItem(CARDS_STORAGE_KEY), set = vi.spyOn(storage, 'setItem');
    const invalid = { ...example(), cards: [example().cards[0], example().cards[0]] };
    expect(replaceCollection(invalid, storage).error).toBeTruthy();
    expect(saveCollection(invalid, storage).error).toBeTruthy();
    expect(set).not.toHaveBeenCalled(); expect(storage.getItem(CARDS_STORAGE_KEY)).toBe(previous);
  });
});
