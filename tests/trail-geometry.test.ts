import { describe, expect, it } from 'vitest';
import seed from '../data/trail-geometries.json';
import { extractKmzKml, getTrailLocation, parseTrailKml, TRAIL_GEOMETRY_NOTE, validateTrailGeometrySeed } from '../server/trailGeometry.js';
import { parseTrailConditions } from '../server/conditions.js';

const expected = { trailId: '027', name: '大霸尖山登山步道' };
const kml = (body: string, name = expected.name, description = '') => `<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>${name}</name><description><![CDATA[${description}]]></description>${body}</Placemark></Document></kml>`;
const line = '<LineString><coordinates>121,24,100 121.01,24.01,200</coordinates></LineString>';
// A small real deflate ZIP container, generated once with Python's standard zipfile.
const KMZ = 'UEsDBBQAAAAIABCyVV3r+Z07ngAAAMoAAAAHAAAAZG9jLmttbLPJzs1RqMjNySu2VcooKSmw0tcvLy/Xyy9IzUvPLNbLSy3RB6rQN9IzUrKzcclPLs1NzSuxswnISUxOzU0syrazyUvMTbV7umT5yzk7nm6Y9nTjxuczdwPJZ2uXvmycbKMPlrbxycxLDS4pysxLt7NJzs8vSsnMSyxJLbYzNDLUMTJRAFJ6BiAWkLTRR1Zgo4+sVR/JXn2Ea0BOtAMAUEsBAhQDFAAAAAgAELJVXev5nTueAAAAygAAAAcAAAAAAAAAAAAAAIABAAAAAGRvYy5rbWxQSwUGAAAAAAEAAQA1AAAAwwAAAAAA';

describe('verified official trail geometry seeds', () => {
  it('contains five independently checked official routes with explicit source/version limits', () => {
    const parsed = validateTrailGeometrySeed(seed);
    expect(parsed.items.map(row => row.trailId)).toEqual(['002', '027', '054', '057', '119']);
    expect(parsed.items.map(row => row.sourceFileCreatedAt)).toEqual(['2025-05-09', '2020-07-24', '2020-07-24', '2020-10-16', '2020-07-24']);
    for (const row of parsed.items) {
      expect(row.location.kind).toBe('route'); expect(row.location.geometryDate).toBeNull();
      expect(row.location.note.startsWith(TRAIL_GEOMETRY_NOTE)).toBe(true); expect(row.location.note).toContain('並非災點');
      expect(Date.parse(row.location.checkedAt)).toBeGreaterThanOrEqual(Date.parse(row.fetchedAt));
      expect(row.verification.officialTrailUrl).toContain(`tr_id=${row.trailId}`);
      expect(row.location.source.license).toContain('第 1 版');
    }
    expect(getTrailLocation('054', '唐麻丹山步道')?.geometry.type).toBe('MultiLineString');
  });
  it('keeps Beidawu old entrance/summit/hut branches and explicitly excludes the new approach', () => {
    const parsed = validateTrailGeometrySeed(seed);
    const row = parsed.items.find(item => item.trailId === '119')!;
    expect(row.location.source.url).toBe('https://data.gov.tw/dataset/31123');
    expect(row.location.note).toContain('不含新登山口至舊登山口');
    expect(row.location.note).toContain('2020-07-24');
    expect(row.location.geometryDate).toBeNull();
    const geometry = getTrailLocation('119', '北大武山步道')!.geometry;
    expect(geometry.type).toBe('MultiLineString');
    if (geometry.type !== 'MultiLineString') throw new Error('北大武應保留原始多線段');
    expect(geometry.coordinates).toHaveLength(3);
    expect(geometry.coordinates.flat()).toHaveLength(1231);
    const westernmost = Math.min(...geometry.coordinates.flat().map(point => point[0]!));
    expect(westernmost).toBeGreaterThan(120.71); // New entrance official longitude is 120.70222.
    const wrong = structuredClone(parsed);
    const wrongRow = wrong.items.find(item => item.trailId === '119')!;
    if (wrongRow.location.geometry.type !== 'MultiLineString') throw new Error('北大武應保留原始多線段');
    wrongRow.location.geometry.coordinates[0]![0] = [120.70222, 22.61505];
    expect(() => validateTrailGeometrySeed(wrong)).toThrow(/範圍|端點/);
  });
  it('requires matching official ID and name, and does not turn an ID conflict into a location', () => {
    expect(getTrailLocation('027', expected.name)?.kind).toBe('route');
    expect(getTrailLocation('027', '同一代碼但來源名稱已變')).toBeUndefined();
    expect(getTrailLocation('065', '能高越嶺道：西段')).toBeUndefined();
    expect(getTrailLocation('999', expected.name)).toBeUndefined();
    const bad = structuredClone(seed); bad.items[0].verification.embeddedTrailId = '065';
    expect(() => validateTrailGeometrySeed(bad)).toThrow(/矛盾/);
  });
  it('returns independent objects so a caller cannot corrupt the shared verified route', () => {
    const first = getTrailLocation('027', expected.name)!;
    if (first.geometry.type === 'LineString') first.geometry.coordinates[0][0] = 0;
    const next = getTrailLocation('027', expected.name)!;
    if (next.geometry.type === 'LineString') expect(next.geometry.coordinates[0][0]).not.toBe(0);
  });
});

describe('route parsing and constrained KMZ handling', () => {
  it('preserves official longitude/latitude line coordinates without deriving incident points', () => {
    expect(parseTrailKml(kml(line), expected)).toMatchObject({ geometry: { type: 'LineString', coordinates: [[121, 24], [121.01, 24.01]] }, embeddedTrailId: null });
    expect(parseTrailKml(kml(`<MultiGeometry>${line}${line}</MultiGeometry>`), expected).geometry.type).toBe('MultiLineString');
    expect(() => parseTrailKml(kml('<Point><coordinates>121,24</coordinates></Point>'), expected)).toThrow(/沒有可用/);
  });
  it('rejects the observed filename-065 vs embedded-064 conflict, incorrect names, and conflicting URLs', () => {
    const description = '<table><tr><td>TRAILID</td><td>64</td></tr><tr><td>URL</td><td>https://recreation.forest.gov.tw/Trail/RT?tr_id=064</td></tr></table>';
    expect(() => parseTrailKml(kml(line, '能高越嶺道：西段', description), { trailId: '065', name: '能高越嶺道：西段' })).toThrow(/TRAILID/);
    expect(() => parseTrailKml(kml(line, '其他步道'), expected)).toThrow(/名稱/);
    expect(() => parseTrailKml(kml(line, expected.name, '<a href="https://recreation.forest.gov.tw/Trail/RT?tr_id=066">來源</a>'), expected)).toThrow(/網址/);
    expect(parseTrailKml(kml(line, expected.name, '<table><tr><td>TRAILID</td><td>27</td></tr></table>'), expected).embeddedTrailId).toBe('027');
  });
  it('rejects missing, projected, swapped, non-finite and oversized coordinates without drawing partial geometry', () => {
    for (const coordinates of ['121,24', '121,24 121,', '269566,2708554 269567,2708555', '24,121 24.01,121.01', '121,24 NaN,24.01', Array(20_001).fill('121,24').join(' ')]) {
      expect(() => parseTrailKml(kml(`<LineString><coordinates>${coordinates}</coordinates></LineString>`), expected)).toThrow();
    }
    expect(() => parseTrailKml('<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]><kml/>', expected)).toThrow();
  });
  it('reads a bounded doc.kml directly, checks CRC and refuses archive paths or HTML downloads', () => {
    const bytes = Buffer.from(KMZ, 'base64');
    expect(parseTrailKml(extractKmzKml(bytes), expected).geometry.type).toBe('LineString');
    const corrupt = Buffer.from(bytes); const central = corrupt.indexOf(Buffer.from('504b0102', 'hex')); corrupt.writeUInt32LE(0, central + 16);
    expect(() => extractKmzKml(corrupt)).toThrow(/校驗/);
    const path = Buffer.from(bytes.toString('binary').replaceAll('doc.kml', '../.kml'), 'binary');
    expect(() => extractKmzKml(path)).toThrow(/不支援/);
    const expanded = Buffer.from(bytes); expanded.writeUInt32LE(9_000_000, central + 24);
    expect(() => extractKmzKml(expanded)).toThrow(/不支援/);
    expect(() => extractKmzKml(Buffer.from('<html>not a KMZ</html>'))).toThrow();
  });
});

describe('conditions integration', () => {
  const basic = seed.items.map(row => ({ TRAILID: row.trailId, TR_CNAME: row.name, URL: row.verification.officialTrailUrl, TR_ENTRANCE: [{ x: 269566, y: 2708554 }] }));
  const notices = seed.items.map(row => ({ TRAILID: row.trailId, TR_CNAME: row.name, TR_TYP: '部分封閉', TITLE: '官方公告', CONTENT: '受影響區段請依原文', ANN_DATE: '20261021', TR_SUB: '其他' }));
  it('adds the verified reference route while keeping incident coordinates unknown', () => {
    const result = parseTrailConditions(basic, notices);
    expect(result.items).toHaveLength(seed.items.length);
    for (const item of result.items) { expect(item.location?.kind).toBe('route'); expect(item.latitude).toBeNull(); expect(item.longitude).toBeNull(); expect(item.rawCondition).toBe('部分封閉'); }
    const unknown = parseTrailConditions([{ TRAILID: '999', TR_CNAME: '未核實步道' }], [{ ...notices[0], TRAILID: '999', TR_CNAME: '未核實步道' }]).items[0];
    expect(unknown.location).toBeUndefined(); expect(unknown.latitude).toBeNull();
  });
  it('keeps announcement IDs stable across source reorder and distinct when the official notice changes', () => {
    const first = parseTrailConditions(basic, notices).items;
    const reordered = parseTrailConditions(basic, [...notices].reverse()).items;
    expect(new Map(first.map(item => [item.trailId, item.id]))).toEqual(new Map(reordered.map(item => [item.trailId, item.id])));
    const changed = parseTrailConditions(basic, [{ ...notices[0], CONTENT: '新的官方區段說明' }]).items[0];
    expect(changed.id).not.toBe(first[0].id);
  });
});
