import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AedDownload, CompactAedSnapshot } from './equipment';

export const DEFAULT_EQUIPMENT_RUNTIME_DIR = fileURLToPath(new URL('../../.cache/equipment/', import.meta.url));
const DEFAULT_FALLBACK_FILE = fileURLToPath(new URL('../../data/aed-national.json', import.meta.url));
export interface EquipmentStoreOptions { runtimeDir?: string; fallbackFile?: string }
export interface EquipmentManifest { schemaVersion: 1; revision: string; previousRevision?: string; fetchedAt: string; sha256: string }
export interface ActiveEquipmentSnapshot { revision: string; snapshot: CompactAedSnapshot; storage: 'runtime' | 'bundled' }
const revisionPattern = /^\d{17}-[a-f0-9]{12}-[a-f0-9]{8}$/;
export const validEquipmentRevision = (value: unknown): value is string => typeof value === 'string' && revisionPattern.test(value);

/** Validate persisted data before exposing a new revision. Coordinates may remain unknown. */
export function validateCompactAedSnapshot(value: unknown): asserts value is CompactAedSnapshot {
  if (!value || typeof value !== 'object') throw new Error('AED 保存資料格式異常。');
  const snapshot = value as CompactAedSnapshot;
  const required = ['場所ID', '場所名稱', 'AEDID', 'AED放置地點', '地點LAT', '地點LNG'];
  if (!Array.isArray(snapshot.columns) || !snapshot.columns.every(column => typeof column === 'string')
    || new Set(snapshot.columns).size !== snapshot.columns.length || !required.every(column => snapshot.columns.includes(column))
    || !Array.isArray(snapshot.rows) || snapshot.rows.length < 1000 || snapshot.rows.length !== snapshot.totalSourceRows
    || !Number.isSafeInteger(snapshot.regionalRows) || snapshot.regionalRows < 1 || snapshot.regionalRows > snapshot.rows.length
    || !/^\d{4}-\d{2}-\d{2}T/.test(snapshot.fetchedAt) || !Number.isFinite(Date.parse(snapshot.fetchedAt))
    || !/^[a-f0-9]{64}$/.test(snapshot.sha256)) throw new Error('AED 保存資料格式異常。');
  const ids = new Set<string>();
  const idIndex = snapshot.columns.indexOf('AEDID');
  for (const row of snapshot.rows) {
    if (!Array.isArray(row) || row.length !== snapshot.columns.length || !row.every(value => typeof value === 'string')
      || !row[idIndex].trim() || ids.has(row[idIndex])) throw new Error('AED 保存設備識別碼或欄位異常。');
    ids.add(row[idIndex]);
  }
}

export function validateRegionalAedSnapshot(value: unknown, national: CompactAedSnapshot): asserts value is AedDownload {
  if (!value || typeof value !== 'object') throw new Error('AED 區域保存資料格式異常。');
  const regional = value as AedDownload;
  if (regional.fetchedAt !== national.fetchedAt || regional.sha256 !== national.sha256
    || regional.totalSourceRows !== national.totalSourceRows || regional.regionalRows !== national.regionalRows
    || !Array.isArray(regional.records) || regional.records.length !== national.regionalRows) throw new Error('AED 全國與區域保存版本不一致。');
  const idIndex = national.columns.indexOf('AEDID');
  const ids = new Set(national.rows.map(row => row[idIndex]));
  const regionalIds = new Set<string>();
  for (const row of regional.records) {
    if (!row || typeof row !== 'object' || typeof row.AEDID !== 'string' || !ids.has(row.AEDID) || regionalIds.has(row.AEDID)) throw new Error('AED 區域保存設備識別碼異常。');
    regionalIds.add(row.AEDID);
  }
}

export function parseEquipmentManifest(text: string): EquipmentManifest {
  const manifest = JSON.parse(text) as EquipmentManifest;
  if (manifest?.schemaVersion !== 1 || !validEquipmentRevision(manifest.revision)
    || manifest.previousRevision !== undefined && !validEquipmentRevision(manifest.previousRevision)
    || !Number.isFinite(Date.parse(manifest.fetchedAt)) || !/^[a-f0-9]{64}$/.test(manifest.sha256)) throw new Error('AED 版本清單格式異常。');
  return manifest;
}

/** Tiny manifest is re-read on access; national rows are parsed only when the revision changes. */
export function createEquipmentStore(options: EquipmentStoreOptions = {}) {
  const runtimeDir = options.runtimeDir ?? DEFAULT_EQUIPMENT_RUNTIME_DIR;
  const fallbackFile = options.fallbackFile ?? DEFAULT_FALLBACK_FILE;
  let current: ActiveEquipmentSnapshot | undefined;
  let lastManifest: string | undefined;
  function bundled(): ActiveEquipmentSnapshot {
    const snapshot: unknown = JSON.parse(readFileSync(fallbackFile, 'utf8'));
    validateCompactAedSnapshot(snapshot);
    return { revision: `bundled-${snapshot.sha256}`, snapshot, storage: 'bundled' };
  }
  function readVersion(revision: string): ActiveEquipmentSnapshot {
    const snapshot: unknown = JSON.parse(readFileSync(path.join(runtimeDir, 'versions', revision, 'national.json'), 'utf8'));
    validateCompactAedSnapshot(snapshot);
    const regional: unknown = JSON.parse(readFileSync(path.join(runtimeDir, 'versions', revision, 'regional.json'), 'utf8'));
    validateRegionalAedSnapshot(regional, snapshot);
    return { revision, snapshot, storage: 'runtime' };
  }
  function read(): ActiveEquipmentSnapshot {
    try {
      const raw = readFileSync(path.join(runtimeDir, 'current.json'), 'utf8');
      if (current && raw === lastManifest) return current;
      const manifest = parseEquipmentManifest(raw);
      let candidate: ActiveEquipmentSnapshot;
      try {
        candidate = readVersion(manifest.revision);
        if (candidate.snapshot.fetchedAt !== manifest.fetchedAt || candidate.snapshot.sha256 !== manifest.sha256) throw new Error('AED 版本資料不一致。');
      } catch {
        if (!manifest.previousRevision) throw new Error('AED 新版資料無法讀取。');
        candidate = readVersion(manifest.previousRevision);
      }
      current = candidate;
      lastManifest = raw;
    } catch {
      // A failed download/write or corrupt manifest never takes last-good rows away.
      current ??= bundled();
    }
    return current;
  }
  return { read, runtimeDir };
}

export const equipmentStore = createEquipmentStore();
