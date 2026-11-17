import { createHash, randomUUID } from 'node:crypto';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { extractKmzKml, normalizeTrailId, parseTrailKml, TRAIL_GEOMETRY_NOTE, validateTrailGeometrySeed, type TrailGeometryRecord } from '../server/trailGeometry.js';

// Manually verified official registry. Additions require source/license/ID review first.
const SOURCES = [
  { trailId: '002', name: '南澳古道', dataset: '26979', dataId: '421' },
  { trailId: '027', name: '大霸尖山登山步道', dataset: '27000', dataId: '438' },
  { trailId: '054', name: '唐麻丹山步道', dataset: '27342', dataId: '455' },
  { trailId: '057', name: '馬崙山步道', dataset: '27345', dataId: '458' },
  { trailId: '119', name: '北大武山步道', dataset: '31123', dataId: '490' },
] as const;
const MAX_BYTES = 8_000_000;
const CATALOG = 'https://recreation.forest.gov.tw/mis/api/BasicInfo/Trail';
const STATUS = 'https://recreation.forest.gov.tw/mis/api/OpenStatus/Trail';
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === 'string' ? value : '';
const nameKey = (value: string) => value.normalize('NFKC').replace(/\s+/g, '');
function allowedFile(url: URL, dataId: string): boolean {
  if (url.origin !== 'https://data.moa.gov.tw' || url.username || url.password || url.hash || /%(?:2e|2f|5c)/i.test(url.pathname)) return false;
  if (url.pathname === '/OpenData/GetOpenDataFile.aspx') return url.searchParams.size === 3 && url.searchParams.get('id') === dataId && url.searchParams.get('FileType') === 'DataMore' && /^\d+$/.test(url.searchParams.get('RID') ?? '');
  return !url.search && new RegExp(`^/Upload/OD_${dataId}/\\d+/[^/]+\\.kmz$`, 'i').test(url.pathname.replace(/^\/+/, '/'));
}
async function download(input: string, allowed: (url: URL) => boolean): Promise<Buffer> {
  let url = new URL(input);
  for (let redirects = 0; redirects <= 2; redirects++) {
    if (!allowed(url)) throw new Error('官方下載連結超出已核實來源');
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(url, { redirect: 'manual', signal: controller.signal, headers: { Accept: 'application/json, application/vnd.google-earth.kmz, application/octet-stream;q=0.9' } });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location'); await response.body?.cancel();
        if (!location) throw new Error('官方下載重新導向缺少位置');
        url = new URL(location, url); continue;
      }
      if (!response.ok || !response.body) throw new Error(`官方下載回應 HTTP ${response.status} (${url.hostname}${url.pathname})`);
      if (Number(response.headers.get('content-length')) > MAX_BYTES) { await response.body.cancel(); throw new Error('官方下載超過容量'); }
      const chunks: Uint8Array[] = []; let bytes = 0; const reader = response.body.getReader();
      for (;;) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > MAX_BYTES) { await reader.cancel(); throw new Error('官方下載超過容量'); } chunks.push(chunk.value); }
      return Buffer.concat(chunks);
    } finally { clearTimeout(timer); }
  }
  throw new Error('官方下載重新導向次數過多');
}

async function main() {
  const args = process.argv.slice(2);
  const onlyId = args.length === 1 && /^--trail=\d{3}$/.test(args[0]!) ? args[0]!.slice(8) : null;
  if (args.length && (!onlyId || !SOURCES.some(source => source.trailId === onlyId))) throw new Error('只接受已核實的 --trail=三碼步道ID');
  const destination = resolve('data/trail-geometries.json');
  const previous = onlyId ? validateTrailGeometrySeed(JSON.parse(await readFile(destination, 'utf8'))) : null;
  const [basic, statuses] = await Promise.all([CATALOG, STATUS].map(async url => JSON.parse((await download(url, candidate => candidate.href === url)).toString('utf8'))));
  if (!Array.isArray(basic) || !basic.length || !Array.isArray(statuses)) throw new Error('官方步道對照清單無效');
  const catalog = new Map(basic.map((value: unknown) => { const row = object(value); return [text(row.TRAILID), row]; }));
  const advisoryIds = new Set(statuses.map((value: unknown) => text(object(value).TRAILID)));
  const items: TrailGeometryRecord[] = [];
  for (const source of SOURCES.filter(source => !onlyId || source.trailId === onlyId)) {
    const officialTrailUrl = `https://recreation.forest.gov.tw/Trail/RT?tr_id=${source.trailId}`;
    const trail = catalog.get(source.trailId);
    if (!trail || nameKey(text(trail.TR_CNAME)) !== nameKey(source.name) || text(trail.URL) !== officialTrailUrl) throw new Error(`${source.trailId} 官方步道 ID、名稱或網址已變動，停止更新`);
    const catalogUrl = `https://data.moa.gov.tw/api/FileToJson.ashx?DataId=${source.dataId}&DataTable=OpenDataList`;
    const entries: unknown = JSON.parse((await download(catalogUrl, candidate => candidate.href === catalogUrl)).toString('utf8'));
    if (!Array.isArray(entries) || entries.length !== 1) throw new Error(`${source.trailId} 官方幾何目錄不是已核實的單一檔案`);
    const entry = object(entries[0]); const fileName = text(entry.FileName); const downloadUrl = text(entry.FileUrl);
    const prefix = /^(\d{1,3})[_-]/.exec(fileName)?.[1];
    if (prefix && normalizeTrailId(prefix) !== source.trailId) throw new Error(`${source.trailId} 來源檔名 ID 矛盾`);
    const body = await download(downloadUrl, candidate => allowedFile(candidate, source.dataId));
    const fetchedAt = new Date().toISOString();
    const parsed = parseTrailKml(extractKmzKml(body), source);
    const checkedAt = new Date().toISOString();
    items.push({
      trailId: source.trailId, name: source.name, fetchedAt,
      sourceFileCreatedAt: /^\d{4}-\d\d-\d\d$/.test(text(entry.CreateDate)) ? text(entry.CreateDate) : null,
      downloadUrl, sha256: createHash('sha256').update(body).digest('hex'),
      verification: { officialTrailUrl, geometryName: parsed.geometryName, embeddedTrailId: parsed.embeddedTrailId, method: `${parsed.embeddedTrailId ? '檔內 TRAILID／網址、' : '檔內未提供 ID；已核對官方資料集及來源檔名、'}官方步道目錄 ID／網址／名稱及 KML 路線名稱一致。匯入時${advisoryIds.has(source.trailId) ? '有' : '無'}路況公告；不代表路線現況已巡檢。` },
      location: { kind: 'route', geometry: parsed.geometry, source: { name: '農業部林業及自然保育署', url: `https://data.gov.tw/dataset/${source.dataset}`, dataset: `自然步道軌跡圖 ${source.trailId}；MOA DataId=${source.dataId}`, license: '政府資料開放授權條款第 1 版' }, checkedAt, geometryDate: null, note: source.trailId === '119' ? `${TRAIL_GEOMETRY_NOTE} 北大武僅涵蓋舊登山口至山頂及檜谷山莊支線，不含新登山口至舊登山口接近路段。來源檔建立日 ${/^\d{4}-\d\d-\d\d$/.test(text(entry.CreateDate)) ? text(entry.CreateDate) : '未知'}，不是測製或現勘日期。` : TRAIL_GEOMETRY_NOTE },
    });
  }
  const updatedIds = new Set(items.map(row => row.trailId));
  const output = validateTrailGeometrySeed({ schemaVersion: 1, items: [...(previous?.items.filter(row => !updatedIds.has(row.trailId)) ?? []), ...items].sort((a, b) => a.trailId.localeCompare(b.trailId)) });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, `${JSON.stringify(output, null, 2)}\n`, 'utf8'); await rename(temporary, destination); }
  finally { await unlink(temporary).catch(() => {}); }
  console.log(JSON.stringify({ imported: items.map(row => ({ trailId: row.trailId, name: row.name, geometry: row.location.geometry.type, sourceFileCreatedAt: row.sourceFileCreatedAt, geometryDate: row.location.geometryDate })), output: destination }, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : '官方步道幾何匯入失敗，保留原檔'); process.exitCode = 1; });
