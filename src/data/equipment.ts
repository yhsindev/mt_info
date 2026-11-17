import { parse } from 'csv-parse/sync';
import { createHash } from 'node:crypto';
import seedSnapshot from '../../data/equipment-seeds.json';
import type { Equipment, EquipmentResponse, RegionId } from '../shared/types';
import { equipmentStore } from './equipmentStore';

export const AED_URL = 'https://tw-aed.mohw.gov.tw/openData?t=csv';
export const AED_DATASET_URL = 'https://data.gov.tw/dataset/12063';
export const AED_SNAPSHOT_MAX_AGE_MS = 48 * 60 * 60 * 1000;
export type AedRow = Record<string, string>;
export interface AedMetadata { fetchedAt: string; publishedAt?: string | null }
export interface AedDownload {
  sourceUrl: string; datasetUrl: string; sourceFilename: string | null;
  sourceModifiedAt: string | null; publishedAt: null; fetchedAt: string;
  sha256: string; totalSourceRows: number; regionalRows: number; records: AedRow[];
}
export interface CompactAedSnapshot extends Omit<AedDownload, 'records'> { columns: string[]; rows: string[][] }
export const AED_NATIONAL_COLUMNS = [
  '場所ID', '場所名稱', '場所縣市', '場所區域', '場所地址', 'AEDID', 'AED放置地點', 'AED地點描述', '地點LAT', '地點LNG',
  '周一至周五起', '周一至周五迄', '周六起', '周六迄', '周日起', '周日迄', '開放使用時間備註', '開放時間緊急連絡電話',
];
const AED_SOURCE = { name: '衛生福利部醫事司 AED 位置資訊', url: AED_DATASET_URL, dataset: '12063', license: '政府資料開放授權條款第 1 版' };

const requiredHeaders = ['場所ID', '場所名稱', 'AEDID', 'AED放置地點', '地點LAT', '地點LNG'];
const text = (value: string | undefined): string | null => value?.trim() || null;

/** Missing coordinates are unknown, including the empty string (Number('') is 0). */
export function parseCoordinate(value: string | undefined, axis: 'lat' | 'lng'): number | null {
  if (!value?.trim() || !/^-?\d+(\.\d+)?$/.test(value.trim())) return null;
  const number = Number(value);
  // The national registry also includes Dongsha and Nansha facilities. A former
  // mountain-only bounding box incorrectly hid their valid official coordinates.
  const [minimum, maximum] = axis === 'lat' ? [5, 27] : [110, 123];
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null;
}

export function parseSourceDate(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return null;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const calendarDay = new Date(Date.UTC(year, month - 1, day));
  if (calendarDay.getUTCFullYear() !== year || calendarDay.getUTCMonth() !== month - 1 || calendarDay.getUTCDate() !== day) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  // Preserve date-only precision. Do not invent a midnight publication time.
  return value.length === 10 ? value : parsed.toISOString();
}

export function parseAedRows(csv: string): AedRow[] {
  let headers: string[] = [];
  const rows = parse(csv, {
    bom: true, skip_empty_lines: true, relax_column_count: false,
    columns: (columns: string[]) => { headers = columns; return columns; },
  }) as AedRow[];
  if (!requiredHeaders.every((header) => headers.includes(header))) throw new Error('AED CSV 欄位不符官方格式，保留舊快取。');
  // A malformed or empty response must not replace a valid equipment snapshot.
  const unique = new Map<string, AedRow>();
  for (const row of rows) if (text(row.AEDID)) unique.set(row.AEDID, row);
  if (!unique.size) throw new Error('AED CSV 缺少有效設備識別碼，保留舊快取。');
  return [...unique.values()];
}

export function regionsForAed(row: AedRow): RegionId[] {
  // Region membership follows named approach facilities, not nearest-point guesses.
  const name = `${row['場所名稱']} ${row['AED放置地點']}`;
  if (/雪霸國家公園武陵遊憩區|武陵農場|雪山登山口/.test(name)
    || row['場所名稱'] === '儷野大飯店股份有限公司' && /武陵路/.test(row['場所地址'] ?? '')) return ['xueshan'];
  if (/觀霧|雪霸休閒農場/.test(name)) return ['daba'];
  return [];
}

export function aedRowToEquipment(row: AedRow, metadata: AedMetadata): Equipment {
  const fetchedAt = parseSourceDate(metadata.fetchedAt);
  if (!fetchedAt || metadata.fetchedAt.length === 10) throw new Error('抓取時間需為完整 ISO 時間。');
  let latitude = parseCoordinate(row['地點LAT'], 'lat');
  let longitude = parseCoordinate(row['地點LNG'], 'lng');
  // The official camping-center row is far from its named facility. Retain it in
  // the list with unknown coordinates instead of silently guessing a correction.
  const suspect = row.AEDID === '3837';
  if (suspect || latitude === null || longitude === null) { latitude = null; longitude = null; }
  const schedule = [
    ['平日', row['周一至周五起'], row['周一至周五迄']],
    ['週六', row['周六起'], row['周六迄']],
    ['週日', row['周日起'], row['周日迄']],
  ].map(([label, start, end]) => start && end ? `${label} ${start}–${end}` : `${label}時段未提供`);
  if (text(row['開放使用時間備註'])) schedule.push(`來源備註：${row['開放使用時間備註'].trim()}`);
  if (text(row['開放時間緊急連絡電話'])) schedule.push(`來源聯絡欄：${row['開放時間緊急連絡電話'].trim()}`);
  return {
    id: `mohw-aed-${row.AEDID}`, type: 'AED',
    name: text(row['AED放置地點']) ?? text(row['場所名稱']) ?? '場所名稱未提供', place: text(row['場所名稱']) ?? '場所名稱未提供',
    address: text(row['場所地址']),
    latitude, longitude,
    placement: [text(row['AED放置地點']), text(row['AED地點描述'])].filter(Boolean).join('；') || null,
    access: schedule.join('；'),
    // The public CSV names a place, but does not identify its equipment manager.
    manager: null,
    source: AED_SOURCE,
    publishedAt: parseSourceDate(metadata.publishedAt), fetchedAt, checkedAt: null,
    checkNote: '官方名錄有登錄；未提供設備實際巡檢日期、電池或耗材狀態，目前是否可用未知。',
    coordinateNote: suspect
      ? `原始座標 ${row['地點LAT']}, ${row['地點LNG']} 與所載武陵露營管理中心有明顯疑義，查核前不畫點。`
      : latitude === null ? '來源座標缺漏或超出合理地理範圍，查核前不畫點。' : '依官方 CSV 登錄座標；尚未現地核對。',
    regions: regionsForAed(row),
  };
}

export function parseAedCsv(csv: string, metadata: AedMetadata): Equipment[] {
  return parseAedRows(csv).filter((row) => regionsForAed(row).length > 0).map((row) => aedRowToEquipment(row, metadata));
}

export async function fetchAedSnapshot(fetcher: typeof fetch = fetch, now?: Date): Promise<AedDownload> {
  // Fixed official endpoint; callers cannot supply arbitrary proxy targets.
  const response = await fetcher(AED_URL, { signal: AbortSignal.timeout(45_000), headers: { Accept: 'text/csv' } });
  if (!response.ok) throw new Error(`衛福部資料服務回應 ${response.status}，保留舊快取。`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const body = new TextDecoder('utf-8').decode(bytes);
  const sourceRows = parseAedRows(body);
  if (sourceRows.length < 1000) throw new Error('AED 全國資料筆數異常，保留舊快取。');
  const regionalRows = sourceRows.filter((row) => regionsForAed(row).length > 0).length;
  if (!regionalRows) throw new Error('AED 區域資料異常為空，保留舊快取。');
  const modified = response.headers.get('last-modified');
  const sourceModifiedAt = modified && Number.isFinite(Date.parse(modified)) ? new Date(modified).toISOString() : null;
  return {
    sourceUrl: AED_URL, datasetUrl: AED_DATASET_URL,
    sourceFilename: response.headers.get('content-disposition')?.match(/filename="?([^";]+)/i)?.[1] ?? null,
    sourceModifiedAt, publishedAt: null, fetchedAt: (now ?? new Date()).toISOString(),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    totalSourceRows: sourceRows.length, regionalRows, records: sourceRows,
  };
}

/** Compact source rows preserve the adapter's inputs without repeating every CSV header 16k times. */
export function compactAedSnapshot(snapshot: AedDownload): CompactAedSnapshot {
  const { records, ...metadata } = snapshot;
  return { ...metadata, columns: AED_NATIONAL_COLUMNS, rows: records.map(row => AED_NATIONAL_COLUMNS.map(column => row[column] ?? '')) };
}

export function regionalAedSnapshot(snapshot: AedDownload): AedDownload {
  const records = snapshot.records.filter(row => regionsForAed(row).length > 0);
  return { ...snapshot, regionalRows: records.length, records };
}

let cachedRevision: string | undefined;
const itemCache = new Map<'all' | RegionId, Equipment[]>();
function sourceSnapshot(): CompactAedSnapshot {
  const active = equipmentStore.read();
  if (cachedRevision !== active.revision) {
    itemCache.clear();
    cachedRevision = active.revision;
  }
  return active.snapshot;
}

/** Changes after CLI/background sync without restarting the API process. */
export function getEquipmentRevision(): string { return equipmentStore.read().revision; }

export function getEquipmentSnapshotInfo() {
  const active = equipmentStore.read();
  const { fetchedAt, publishedAt, sourceModifiedAt, sourceFilename, totalSourceRows } = active.snapshot;
  return { revision: active.revision, storage: active.storage, fetchedAt, publishedAt, sourceModifiedAt, sourceFilename, totalSourceRows };
}

function equipmentItems(snapshot: CompactAedSnapshot, region?: RegionId): Equipment[] {
  const key = region ?? 'all';
  const existing = itemCache.get(key);
  if (existing) return existing;
  if (region) {
    const items = equipmentItems(snapshot).filter(item => item.regions.includes(region));
    itemCache.set(key, items);
    return items;
  }
  const aeds = snapshot.rows.map(values => aedRowToEquipment(Object.fromEntries(snapshot.columns.map((column, index) => [column, values[index]])), snapshot));
  const items = [...seedSnapshot.items as Equipment[], ...aeds];
  itemCache.set(key, items);
  return items;
}

/** A dated nationwide real-source snapshot; optional legacy mountain filters remain supported. */
export function getEquipment(region?: RegionId, now = new Date()): EquipmentResponse {
  const snapshot = sourceSnapshot();
  const items = equipmentItems(snapshot, region);
  const stale = now.getTime() - Date.parse(snapshot.fetchedAt) > AED_SNAPSHOT_MAX_AGE_MS;
  return {
    items, status: stale ? 'stale' : 'ready', fetchedAt: snapshot.fetchedAt,
    message: `${stale ? 'AED 保存資料已超過 48 小時；' : ''}${region ? '目前為相容的山區篩選；' : '全臺 AED 官方登錄快照，另含少量 PAC／急救箱官方公告種子；'}歷史登錄或巡檢不代表目前可用。座標未知或有疑義的設備保留於清單，不畫地圖點。${region ? '本選區尚無來源足夠的急救箱點位。' : 'PAC／急救箱並非全臺完整名錄。'}`,
  };
}
