import { getCard } from './catalog';
import { emptyCollection, type CardCollection, type CollectedCard } from './model';

export const CARDS_STORAGE_KEY = 'mt-info-cards-v1';
export const MAX_COLLECTION_BYTES = 32 * 1024;
const unavailable = '無法保存到本機；圖鑑仍留在目前頁面，請下載 JSON 備份。';
const corrupt = '本機圖鑑無法完整讀取，原始內容仍保留；請先下載備份，再選擇是否還原。';
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const bytes = (text: string) => new TextEncoder().encode(text).byteLength;

function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 19) === value.slice(0, 19);
}

export function parseCollection(text: string): CardCollection {
  if (typeof text !== 'string') throw new Error('圖鑑必須為 JSON 文字。');
  if (bytes(text) > MAX_COLLECTION_BYTES) throw new Error('圖鑑超過 32 KiB，未匯入。');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('圖鑑不是完整的 JSON。'); }
  if (!isObject(value) || value.schemaVersion !== 1 || !Array.isArray(value.cards) || value.cards.length > 8) throw new Error('不支援的圖鑑格式或版本。');
  const seen = new Set<string>();
  const cards: CollectedCard[] = value.cards.map(item => {
    if (!isObject(item) || typeof item.cardId !== 'string' || !getCard(item.cardId)
      || item.artworkVersion !== 1 || !Number.isSafeInteger(item.count) || (item.count as number) < 1
      || !isTimestamp(item.firstObtainedAt) || !isTimestamp(item.lastObtainedAt)
      || Date.parse(item.lastObtainedAt) < Date.parse(item.firstObtainedAt)) throw new Error('卡片編號、版本、日期或取得次數無法讀取。');
    if (seen.has(item.cardId)) throw new Error('圖鑑有重複的卡片編號，未自動合併。');
    seen.add(item.cardId);
    return { cardId: getCard(item.cardId)!.id, artworkVersion: 1, firstObtainedAt: item.firstObtainedAt, lastObtainedAt: item.lastObtainedAt, count: item.count as number };
  });
  // Only collection fields survive import; answers and unrelated properties are not saved.
  return { schemaVersion: 1, cards };
}

function browserStorage(): Storage {
  if (typeof window === 'undefined') throw new Error('storage unavailable');
  return window.localStorage;
}

export function readCollection(storage?: Storage): { collection: CardCollection; error: string | null; raw: string | null } {
  let raw: string | null = null;
  try { raw = (storage ?? browserStorage()).getItem(CARDS_STORAGE_KEY); }
  catch { return { collection: emptyCollection(), error: unavailable, raw }; }
  if (raw === null) return { collection: emptyCollection(), error: null, raw };
  try { return { collection: parseCollection(raw), error: null, raw }; }
  catch { return { collection: emptyCollection(), error: corrupt, raw }; }
}

function writeCollection(collection: CardCollection, replace: boolean, storage?: Storage): { error: string | null } {
  let body: string;
  try { body = JSON.stringify(parseCollection(JSON.stringify(collection))); }
  catch (error) { return { error: error instanceof Error ? error.message : '圖鑑格式無法保存。' }; }
  try {
    const target = storage ?? browserStorage();
    if (!replace) {
      const previous = readCollection(target);
      if (previous.error) return { error: previous.raw === null ? previous.error : corrupt };
    }
    // Web Storage setItem is atomic on failure; never remove the previous value first.
    target.setItem(CARDS_STORAGE_KEY, body);
    return { error: null };
  } catch { return { error: unavailable }; }
}

export function saveCollection(collection: CardCollection, storage?: Storage): { error: string | null } {
  return writeCollection(collection, false, storage);
}

// The caller must obtain explicit replacement confirmation before calling this.
export function replaceCollection(collection: CardCollection, storage?: Storage): { error: string | null } {
  return writeCollection(collection, true, storage);
}
