import { lstat, readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

export const MAX_GPX_BYTES = 16 * 1024 * 1024;
const MAX_TRACK_POINTS = 100_000;
const MAX_LISTED_WAYPOINTS = 200;

type XmlNode = Record<string, unknown>;

export interface GpxInspectionReport {
  fileInspection: {
    xmlValid: boolean;
    tracks: number | null;
    segments: number | null;
    trackPoints: number | null;
    waypoints: number | null;
  };
  gpxRootValid: boolean;
  namedWaypoints: string[];
  namedWaypointCount: number;
  unnamedWaypoints: number;
  filteredWaypointNames: number;
  omittedWaypointNames: number;
  missingHints: string[];
}

const asNode = (value: unknown): XmlNode | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as XmlNode : null;

const toNodes = (value: unknown): XmlNode[] =>
  (Array.isArray(value) ? value : value === undefined ? [] : [value])
    .map(asNode)
    .filter((node): node is XmlNode => node !== null);

function cleanWaypointName(value: unknown): string {
  return typeof value === 'string'
    ? value.normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim()
    : '';
}

function isGeneratedWaypointName(name: string): boolean {
  return /^\d{1,8}$/.test(name)
    || /^(?:wpt|waypoint|pt|point|tp|trackpoint|mark|marker|路點|航點|標記|點位)[\s._#-]*\d{0,8}$/i.test(name);
}

function emptyReport(xmlValid: boolean): GpxInspectionReport {
  return {
    fileInspection: { xmlValid, tracks: null, segments: null, trackPoints: null, waypoints: null },
    gpxRootValid: false,
    namedWaypoints: [],
    namedWaypointCount: 0,
    unnamedWaypoints: 0,
    filteredWaypointNames: 0,
    omittedWaypointNames: 0,
    missingHints: [xmlValid ? 'XML 有效，但根節點不是 GPX。' : 'XML 無效，無法統計軌跡與路點。'],
  };
}

/** Inspect metadata only. Coordinates are never included in the returned report. */
export function inspectGpxXml(xml: string): GpxInspectionReport {
  if (Buffer.byteLength(xml, 'utf8') > MAX_GPX_BYTES) throw new Error('GPX 超過 16 MiB 檢查上限。');
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) {
    const report = emptyReport(false);
    report.missingHints = ['檔案含 DTD 或 entity 宣告，已拒絕解析。'];
    return report;
  }
  try {
    if (XMLValidator.validate(xml) !== true) return emptyReport(false);
  } catch {
    return emptyReport(false);
  }

  let root: XmlNode | null;
  try {
    const parsed = new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true,
      parseTagValue: false,
      parseAttributeValue: false,
    }).parse(xml) as XmlNode;
    root = asNode(parsed?.gpx);
  } catch {
    return emptyReport(false);
  }
  if (!root) return emptyReport(true);

  const tracks = toNodes(root.trk);
  const waypoints = toNodes(root.wpt);
  let segments = 0;
  let trackPoints = 0;
  for (const track of tracks) {
    for (const segment of toNodes(track.trkseg)) {
      segments++;
      trackPoints += toNodes(segment.trkpt).length;
      if (trackPoints > MAX_TRACK_POINTS) throw new Error('GPX 超過 100,000 個軌跡點檢查上限。');
    }
  }

  const namedWaypoints: string[] = [];
  const seen = new Set<string>();
  let unnamedWaypoints = 0;
  let filteredWaypointNames = 0;
  let omittedWaypointNames = 0;
  for (const waypoint of waypoints) {
    const name = cleanWaypointName(waypoint.name);
    if (!name) { unnamedWaypoints++; continue; }
    if (isGeneratedWaypointName(name)) { filteredWaypointNames++; continue; }
    if (seen.has(name)) continue;
    seen.add(name);
    if (namedWaypoints.length < MAX_LISTED_WAYPOINTS) namedWaypoints.push(name.slice(0, 120));
    else omittedWaypointNames++;
  }

  const missingHints: string[] = [];
  if (tracks.length === 0) missingHints.push('沒有 track；無法由此檔取得路線軌跡。');
  else if (segments === 0 || trackPoints === 0) missingHints.push('track 沒有可統計的 segment／trackpoint。');
  if (waypoints.length === 0) missingHints.push('沒有 GPX waypoint；主要路點仍需另找來源逐一核對。');
  else if (seen.size === 0) missingHints.push('沒有可辨識的命名 waypoint；主要路點仍需另找來源逐一核對。');
  if (unnamedWaypoints > 0 || filteredWaypointNames > 0) missingHints.push('部分 waypoint 未命名或名稱似自動編號，已排除於清單。');
  if (omittedWaypointNames > 0) missingHints.push('命名 waypoint 清單僅顯示前 200 個。');

  return {
    fileInspection: { xmlValid: true, tracks: tracks.length, segments, trackPoints, waypoints: waypoints.length },
    gpxRootValid: true,
    namedWaypoints,
    namedWaypointCount: seen.size,
    unnamedWaypoints,
    filteredWaypointNames,
    omittedWaypointNames,
    missingHints,
  };
}

export async function inspectGpxFile(path: string): Promise<GpxInspectionReport> {
  if (!path.toLowerCase().endsWith('.gpx')) throw new Error('請指定 .gpx 檔案。');
  const info = await lstat(path);
  if (!info.isFile()) throw new Error('請指定一般 GPX 檔案。');
  if (info.size > MAX_GPX_BYTES) throw new Error('GPX 超過 16 MiB 檢查上限。');
  const bytes = await readFile(path);
  if (bytes.length > MAX_GPX_BYTES) throw new Error('GPX 超過 16 MiB 檢查上限。');
  return inspectGpxXml(bytes.toString('utf8'));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    process.stderr.write('用法：npm run inspect:gpx -- /path/to/route.gpx\n');
    process.exitCode = 2;
    return;
  }
  try {
    const report = await inspectGpxFile(args[0]);
    process.stdout.write(`${JSON.stringify({ fileName: basename(args[0]), ...report }, null, 2)}\n`);
    if (!report.fileInspection.xmlValid || !report.gpxRootValid) process.exitCode = 1;
  } catch (error) {
    const message = error instanceof Error && /^(請指定|GPX 超過)/.test(error.message)
      ? error.message : '檔案無法讀取或解析。';
    process.stderr.write(`GPX 檢查失敗：${message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main();
