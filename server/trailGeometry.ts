import { inflateRawSync } from 'node:zlib';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { LineString, MultiLineString, Position } from 'geojson';
import type { TrailLocation } from '../src/shared/trail-location.js';
import seed from '../data/trail-geometries.json';

export interface TrailGeometryRecord {
  trailId: string;
  name: string;
  fetchedAt: string;
  sourceFileCreatedAt: string | null;
  downloadUrl: string;
  sha256: string;
  verification: { officialTrailUrl: string; geometryName: string; embeddedTrailId: string | null; method: string };
  location: TrailLocation;
}
export interface TrailGeometrySeed { schemaVersion: 1; items: TrailGeometryRecord[] }
export const TRAIL_GEOMETRY_NOTE = '官方步道參考路線；表示這條步道有公告，並非災點或全線封閉範圍。受影響位置請查看公告原文。';
const MAX_KML_BYTES = 8_000_000;
const MAX_POINTS = 20_000;
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): string => typeof value === 'string' ? value : '';
const normalizeName = (value: string) => value.normalize('NFKC').replace(/\s+/g, '');
const isTime = (value: unknown) => typeof value === 'string' && /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
export const normalizeTrailId = (value: string) => /^\d{1,3}$/.test(value) ? value.padStart(3, '0') : null;
function validPoint(value: unknown): value is Position {
  return Array.isArray(value) && value.length === 2 && value.every(n => typeof n === 'number' && Number.isFinite(n)) && value[0] >= 118 && value[0] <= 123 && value[1] >= 20 && value[1] <= 27;
}
function validLine(value: unknown): value is Position[] {
  return Array.isArray(value) && value.length >= 2 && value.length <= MAX_POINTS && value.every(validPoint) && value.some(point => point[0] !== value[0][0] || point[1] !== value[0][1]);
}
function validGeometry(value: unknown, kind: unknown): boolean {
  const geometry = object(value);
  if (kind === 'entrance') return geometry.type === 'Point' && validPoint(geometry.coordinates);
  if (kind !== 'route') return false;
  if (geometry.type === 'LineString') return validLine(geometry.coordinates);
  if (geometry.type === 'MultiLineString') return Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0 && geometry.coordinates.length <= 16 && geometry.coordinates.every(validLine) && geometry.coordinates.reduce((count, line) => count + line.length, 0) <= MAX_POINTS;
  return false;
}
/** Reviewed 119 covers the old entrance, summit and hut branch, not the new approach. */
function validateBeidawuCoverage(geometry: LineString | MultiLineString): void {
  const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
  const points = lines.flat();
  const ends = lines.flatMap(line => [line[0]!, line[line.length - 1]!]);
  // Official forestry communication-point coordinates; tolerance only verifies this
  // source identity/extent and does not claim surveyed positional accuracy.
  const anchors = [[120.71450, 22.62450], [120.76130, 22.62706], [120.74209, 22.61526]];
  if (points.some(([lon, lat]) => lon! < 120.71 || lon! > 120.77 || lat! < 22.60 || lat! > 22.64)
    || anchors.some(([lon, lat]) => !ends.some(point => Math.hypot(point[0]! - lon!, point[1]! - lat!) < 0.0005))) {
    throw new Error('北大武來源範圍或舊登山口／山頂／檜谷端點已變動，須重新查核覆蓋');
  }
}
export function validateTrailGeometrySeed(value: unknown): TrailGeometrySeed {
  const raw = object(value);
  if (raw.schemaVersion !== 1 || !Array.isArray(raw.items) || raw.items.length > 200) throw new Error('步道幾何清冊格式錯誤');
  const ids = new Set<string>();
  for (const value of raw.items) {
    const row = object(value); const id = text(row.trailId); const location = object(row.location); const source = object(location.source); const check = object(row.verification);
    if (normalizeTrailId(id) !== id || ids.has(id) || !text(row.name) || !isTime(row.fetchedAt) || !isTime(location.checkedAt) || !text(location.note) || location.geometryDate !== null && !/^\d{4}-\d\d-\d\d$/.test(text(location.geometryDate))) throw new Error('步道幾何識別或時間錯誤');
    if (!validGeometry(location.geometry, location.kind) || !text(source.name) || !text(source.license) || !/^https:\/\/data\.gov\.tw\/dataset\/\d+$/.test(text(source.url)) || !/^https:\/\/data\.moa\.gov\.tw\//.test(text(row.downloadUrl)) || !/^[a-f0-9]{64}$/.test(text(row.sha256))) throw new Error('步道幾何、來源或雜湊錯誤');
    if (id === '119') {
      if (location.kind !== 'route') throw new Error('北大武來源必須保留已核對的路線幾何');
      validateBeidawuCoverage(location.geometry as LineString | MultiLineString);
    }
    if (check.officialTrailUrl !== `https://recreation.forest.gov.tw/Trail/RT?tr_id=${id}` || normalizeName(text(check.geometryName)) !== normalizeName(text(row.name)) || check.embeddedTrailId !== null && normalizeTrailId(text(check.embeddedTrailId)) !== id || !text(check.method)) throw new Error('步道幾何核對資訊矛盾');
    ids.add(id);
  }
  return raw as unknown as TrailGeometrySeed;
}

const geometries = new Map(validateTrailGeometrySeed(seed).items.map(row => [row.trailId, row]));
/** An exact ID and name match is required; an unknown or renamed trail remains unlocated. */
export function getTrailLocation(trailId: string, name: string): TrailLocation | undefined {
  const id = normalizeTrailId(trailId); const row = id ? geometries.get(id) : undefined;
  return row && normalizeName(row.name) === normalizeName(name) ? structuredClone(row.location) : undefined;
}

function findAll(value: unknown, wanted: string): unknown[] {
  if (Array.isArray(value)) return value.flatMap(item => findAll(item, wanted));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => key === wanted ? Array.isArray(child) ? child : [child] : findAll(child, wanted));
}
/** Only actual line geometry is imported; Points, descriptions and linked XSL are never rendered. */
export function parseTrailKml(xml: string, expected: { trailId: string; name: string }): { geometry: LineString | MultiLineString; geometryName: string; embeddedTrailId: string | null } {
  if (Buffer.byteLength(xml) > MAX_KML_BYTES || /<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error('步道 KML 無效或超過容量');
  const parsed = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false }).parse(xml);
  if (!object(parsed).kml) throw new Error('步道來源不是 KML');
  const placemarks = findAll(parsed, 'Placemark').map(object).filter(mark => findAll(mark, 'LineString').length > 0);
  if (!placemarks.length || placemarks.length > 16) throw new Error('步道 KML 沒有可用的路線');
  const lines: Position[][] = []; let embeddedTrailId: string | null = null; let points = 0;
  for (const mark of placemarks) {
    if (normalizeName(text(mark.name)) !== normalizeName(expected.name)) throw new Error('步道 KML 名稱與官方目錄不符');
    // ArcGIS KMZ often stores its fields as a table inside description rather than ExtendedData.
    const description = text(mark.description);
    const fieldIds = [...description.matchAll(/<td\b[^>]*>\s*TRAILID\s*<\/td>\s*<td\b[^>]*>\s*(\d+)\s*<\/td>/gi)].map(match => match[1]);
    const dataIds = findAll(mark, 'Data').map(object).filter(data => data['@_name'] === 'TRAILID').map(data => text(data.value));
    const simpleIds = findAll(mark, 'SimpleData').map(object).filter(data => data['@_name'] === 'TRAILID').map(data => text(data['#text']));
    const urlIds = [...description.matchAll(/https:\/\/recreation\.forest\.gov\.tw\/Trail\/RT\?tr_id=(\d{1,3})(?!\d)/g)].map(match => match[1]);
    for (const id of [...fieldIds, ...dataIds, ...simpleIds, ...urlIds]) {
      if (normalizeTrailId(id) !== expected.trailId) throw new Error('步道 KML 的 TRAILID 或官方網址與目錄不符');
      embeddedTrailId = normalizeTrailId(id);
    }
    for (const value of findAll(mark, 'LineString')) {
      const coordinateText = text(object(value).coordinates).trim();
      const coordinates = coordinateText.split(/\s+/).map(pair => {
        const parts = pair.split(',');
        if (parts.length < 2 || !parts[0] || !parts[1]) throw new Error('步道 KML 座標缺漏');
        return [Number(parts[0]), Number(parts[1])];
      });
      if (!validLine(coordinates)) throw new Error('步道 KML 座標無效或超過上限');
      points += coordinates.length; if (points > MAX_POINTS) throw new Error('步道 KML 總頂點超過上限');
      lines.push(coordinates);
    }
  }
  return { geometry: lines.length === 1 ? { type: 'LineString', coordinates: lines[0] } : { type: 'MultiLineString', coordinates: lines }, geometryName: text(placemarks[0].name), embeddedTrailId };
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
/** Read one bounded doc.kml directly from ZIP; no archive paths or scripts are extracted. */
export function extractKmzKml(zip: Buffer): string {
  if (zip.length < 22 || zip.length > 8_000_000) throw new Error('步道 KMZ 大小無效');
  let end = -1;
  for (let at = zip.length - 22; at >= Math.max(0, zip.length - 65_557); at--) if (zip.readUInt32LE(at) === 0x06054b50) { end = at; break; }
  if (end < 0 || zip.readUInt16LE(end + 4) !== 0 || zip.readUInt16LE(end + 6) !== 0) throw new Error('步道 KMZ 不是完整單卷 ZIP');
  const entries = zip.readUInt16LE(end + 10); const directorySize = zip.readUInt32LE(end + 12); let at = zip.readUInt32LE(end + 16);
  if (!entries || entries > 100 || at + directorySize > end) throw new Error('步道 KMZ 目錄無效');
  let found: Buffer | null = null;
  for (let index = 0; index < entries; index++) {
    if (at + 46 > end || zip.readUInt32LE(at) !== 0x02014b50) throw new Error('步道 KMZ 目錄損壞');
    const flags = zip.readUInt16LE(at + 8); const method = zip.readUInt16LE(at + 10); const checksum = zip.readUInt32LE(at + 16);
    const compressed = zip.readUInt32LE(at + 20); const expanded = zip.readUInt32LE(at + 24);
    const nameLength = zip.readUInt16LE(at + 28); const extraLength = zip.readUInt16LE(at + 30); const commentLength = zip.readUInt16LE(at + 32); const local = zip.readUInt32LE(at + 42);
    const next = at + 46 + nameLength + extraLength + commentLength;
    if (next > end) throw new Error('步道 KMZ 檔名損壞');
    const name = zip.subarray(at + 46, at + 46 + nameLength).toString('utf8'); at = next;
    if (!name.endsWith('.kml')) continue;
    if (found || name !== 'doc.kml' || flags & 1 || ![0, 8].includes(method) || expanded > MAX_KML_BYTES || compressed > MAX_KML_BYTES || local + 30 > zip.length || zip.readUInt32LE(local) !== 0x04034b50) throw new Error('步道 KMZ 本文或壓縮方式不支援');
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    if (start + compressed > zip.length) throw new Error('步道 KMZ 本文不完整');
    const body = zip.subarray(start, start + compressed);
    const decoded = method === 0 ? body : inflateRawSync(body, { maxOutputLength: MAX_KML_BYTES });
    if (decoded.length !== expanded || crc32(decoded) !== checksum) throw new Error('步道 KMZ 本文校驗失敗');
    found = decoded;
  }
  if (!found) throw new Error('步道 KMZ 缺少 doc.kml');
  return found.toString('utf8');
}
