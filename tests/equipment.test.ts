import { describe, expect, it, vi } from 'vitest';
import { aedRowToEquipment, fetchAedSnapshot, getEquipment, parseAedCsv, parseAedRows, parseCoordinate, parseSourceDate } from '../src/data/equipment';
import { equipmentStore } from '../src/data/equipmentStore';

const fetchedAt = '2026-10-14T04:58:19.034Z';
const csv = '\ufeff場所ID,場所名稱,AEDID,AED放置地點,地點LAT,地點LNG,AED地點描述,開放使用時間備註\r\n29,雪霸國家公園武陵遊憩區,3839,雪山登山口服務站,24.385784,121.298752,"站內一樓,櫃台旁\n有指標",星期一不開放\r\n';

describe('官方 AED CSV', () => {
  it('preserves BOM, quoted commas/newlines, source IDs and restrictions', () => {
    const [item] = parseAedCsv(csv, { fetchedAt });
    expect(item.id).toBe('mohw-aed-3839');
    expect(item.placement).toContain('站內一樓,櫃台旁\n有指標');
    expect(item.access).toContain('星期一不開放');
    expect(item.regions).toEqual(['xueshan']);
    expect(item.checkedAt).toBeNull();
    expect(item.publishedAt).toBeNull();
    expect(item.fetchedAt).toBe(fetchedAt);
    expect(item.manager).toBeNull();
  });

  it.each(['', ' ', '-99', 'NaN', '24.3abc', '0', '999'])('keeps invalid latitude %j unknown', (value) => {
    expect(parseCoordinate(value, 'lat')).toBeNull();
  });

  it('preserves the official distant-island coordinates present in the nationwide registry', () => {
    expect(parseCoordinate('20.698717', 'lat')).toBe(20.698717);
    expect(parseCoordinate('116.732183', 'lng')).toBe(116.732183);
    expect(parseCoordinate('10.375766', 'lat')).toBe(10.375766);
    expect(parseCoordinate('114.364248', 'lng')).toBe(114.364248);
  });

  it('removes both map coordinates when one is missing and does not rewrite disputed source positions', () => {
    const [row] = parseAedRows(csv);
    expect(aedRowToEquipment({ ...row, 地點LNG: '' }, { fetchedAt }).latitude).toBeNull();
    const disputed = aedRowToEquipment({ ...row, AEDID: '3837' }, { fetchedAt });
    expect(disputed.longitude).toBeNull();
    expect(disputed.coordinateNote).toContain('查核前不畫點');
  });

  it('rejects HTML, schema changes, malformed row widths and responses without valid IDs', () => {
    expect(() => parseAedRows('<html>維護中</html>')).toThrow();
    expect(() => parseAedRows(csv.replace(',3839,', ',,'))).toThrow();
    expect(() => parseAedRows(csv + 'broken,row\n')).toThrow();
  });

  it('keeps a valid source row with an unknown place name as unknown', () => {
    const [row] = parseAedRows(csv);
    const item = aedRowToEquipment({ ...row, 場所名稱: '' }, { fetchedAt });
    expect(item.place).toBe('場所名稱未提供');
  });

  it('does not classify similarly named facilities elsewhere as this mountain region', () => {
    expect(parseAedCsv(csv.replace('雪霸國家公園武陵遊憩區', '桃園市立武陵高級中等學校').replace('雪山登山口服務站', '校門口'), { fetchedAt })).toEqual([]);
  });

  it('does not equate a file fetch or modification date with device inspection', () => {
    const [item] = parseAedCsv(csv, { fetchedAt, publishedAt: 'invalid' });
    expect(item.publishedAt).toBeNull();
    expect(item.checkedAt).toBeNull();
    expect(parseSourceDate('2026-02-30')).toBeNull();
    expect(parseSourceDate('2026-02-30T01:00:00Z')).toBeNull();
    expect(parseSourceDate('2026-10-14T13:00:00+08:00')).toBe('2026-10-14T05:00:00.000Z');
    expect(parseSourceDate('2025-03-31')).toBe('2025-03-31');
    expect(() => parseAedCsv(csv, { fetchedAt: '2026-10-14' })).toThrow();
  });
});

describe('設備保存快照與種子', () => {
  it('defaults to all official nationwide AED rows, including offshore counties and out-of-region seeds', () => {
    const source = equipmentStore.read().snapshot;
    const response = getEquipment();
    expect(response.items.filter(item => item.type === 'AED')).toHaveLength(source.totalSourceRows);
    expect(response.items.length).toBeGreaterThan(10_000);
    expect(new Set(response.items.map(item => item.id)).size).toBe(response.items.length);
    for (const county of ['臺北市', '高雄市', '臺東縣', '金門縣', '連江縣']) expect(response.items.some(item => item.address?.includes(county))).toBe(true);
    expect(response.items.find(item => item.id === 'ysnp-guangao-first_aid')?.type).toBe('FIRST_AID');
    expect(response.items.find(item => item.id === 'ysnp-guangao-pac')?.type).toBe('PAC');
    expect(response.fetchedAt).toBe(source.fetchedAt);
  });

  it('keeps unknown coordinates and source dates unknown in the nationwide response', () => {
    const response = getEquipment();
    for (const id of ['mohw-aed-3837', 'spnp-pac-369-camp', 'ysnp-guangao-first_aid', 'ysnp-guangao-pac']) {
      const item = response.items.find(candidate => candidate.id === id);
      expect(item).toBeDefined();
      expect(item?.latitude).toBeNull();
      expect(item?.longitude).toBeNull();
      expect(item?.checkedAt).toBeNull();
    }
    const aed = response.items.find(item => item.type === 'AED');
    expect(aed?.publishedAt).toBeNull();
  });

  it('reuses converted nationwide items while recalculating the snapshot age', () => {
    const initial = getEquipment(undefined, new Date(equipmentStore.read().snapshot.fetchedAt));
    const later = getEquipment(undefined, new Date('2030-01-01T00:00:00Z'));
    expect(initial.items).toBe(later.items);
    expect(initial.status).toBe('ready');
    expect(later.status).toBe('stale');
  });

  it('retains the old region filter without silently filtering the default nationwide response', () => {
    const national = getEquipment();
    for (const region of ['xueshan', 'daba'] as const) {
      const response = getEquipment(region);
      expect(response.items).toEqual(national.items.filter(item => item.regions.includes(region)));
      expect(response.items.length).toBeGreaterThan(0);
      expect(response.items.length).toBeLessThan(national.items.length);
      expect(response.items.some(item => item.id.includes('guangao'))).toBe(false);
    }
  });

  it('marks old official snapshots stale while keeping data accessible', () => {
    const response = getEquipment('xueshan', new Date('2030-01-01T00:00:00Z'));
    expect(response.status).toBe('stale');
    expect(response.items.length).toBeGreaterThan(0);
    expect(response.message).toContain('48 小時');
  });

  it('keeps unverified temporary-camp coordinates unknown and out-of-region seeds out', () => {
    const response = getEquipment('xueshan', new Date(fetchedAt));
    const camp = response.items.find((item) => item.id === 'spnp-pac-369-camp');
    expect(camp?.latitude).toBeNull();
    expect(camp?.checkedAt).toBeNull();
    expect(camp?.checkNote).toContain('2026/4/13–4/17');
    expect(response.items.some((item) => item.id.includes('guangao'))).toBe(false);
    expect(response.status).toBe('ready');
  });
});

describe('全國官方下載', () => {
  it('preserves non-mountain AED records when refreshing the national snapshot', async () => {
    const header = '場所ID,場所名稱,AEDID,AED放置地點,地點LAT,地點LNG\n';
    const rows = Array.from({ length: 1001 }, (_, index) => `${index},${index === 0 ? '雪霸國家公園武陵遊憩區' : '臺北市測試場所'},${index},一樓,25.03,121.56`).join('\n');
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(header + rows, { headers: { 'last-modified': 'Mon, 19 Oct 2026 08:00:00 GMT' } }));
    const snapshot = await fetchAedSnapshot(fetcher, new Date('2026-10-19T08:01:00Z'));
    expect(snapshot.records).toHaveLength(1001);
    expect(snapshot.regionalRows).toBe(1);
    expect(snapshot.records.at(-1)?.['場所名稱']).toBe('臺北市測試場所');
    expect(snapshot.publishedAt).toBeNull();
    expect(snapshot.sourceModifiedAt).toBe('2026-10-19T08:00:00.000Z');
    expect(snapshot.fetchedAt).toBe('2026-10-19T08:01:00.000Z');
  });
});
