import { describe, expect, it } from 'vitest';
import { getRainMaps, rainMapProductId, RAIN_MAP_CATALOG_CHECKED_AT } from '../server/rainMaps.js';

describe('official rain chart catalog', () => {
  it('keeps 6-hour accumulations distinct from a 48-hour forecast horizon', () => {
    const product = getRainMaps('cwa-qpf-6h').products[0];
    expect(product.accumulationHours).toBe(6); expect(product.horizonHours).toBe(48); expect(product.frames).toHaveLength(8);
    expect(product.frames.map(frame => [frame.leadHours - product.accumulationHours!,frame.leadHours])).toEqual([[0,6],[6,12],[12,18],[18,24],[24,30],[30,36],[36,42],[42,48]]);
    expect(product.frames[0].imageUrl).toBe('https://www.cwa.gov.tw/Data/fcst_img/QPF_ChFcstPrecip_6_06.png');
  });
  it('offers four official 12-hour chart periods with no invented absolute time', () => {
    const response = getRainMaps('cwa-qpf-12h'); const product = response.products[0];
    expect(product.frames).toHaveLength(4); expect(product.frames.at(-1)?.imageUrl).toMatch(/_12_48\.png$/);
    expect(product.issuedAt).toBeNull(); expect(product.timeStatus).toBe('on-image');
    for (const frame of product.frames) { expect(frame.validFrom).toBeNull(); expect(frame.validTo).toBeNull(); }
    expect(response.catalogCheckedAt).toBe(RAIN_MAP_CATALOG_CHECKED_AT); expect(response.catalogCheckedAt).toBe('2026-10-22'); expect(product.catalogCheckedAt).toBe('2026-10-15');
  });
  it('keeps CWA charts distinct from the experimental NCDR original-page viewer', () => {
    const products = getRainMaps().products;
    expect(products.filter(product => product.id.startsWith('cwa')).every(product => product.display === 'official-chart' && product.pageUrl === null && !product.experimental)).toBe(true);
    for (const product of products) for (const frame of product.frames) {
      const url = new URL(frame.imageUrl); expect(url.origin).toBe('https://www.cwa.gov.tw'); expect(url.search).toBe(''); expect(url.username).toBe('');
    }
    const ncdr = products.find(product => product.id === 'ncdr-mpas')!;
    expect(ncdr.status).toBe('available'); expect(ncdr.display).toBe('official-page'); expect(ncdr.experimental).toBe(true);
    expect(ncdr.pageUrl).toBe('https://watch.ncdr.nat.gov.tw/watch_mpas2weeks'); expect(ncdr.source.url).toBe(ncdr.pageUrl);
    expect(ncdr.frames).toEqual([]); expect(ncdr.accumulationHours).toBeNull(); expect(ncdr.horizonHours).toBeNull(); expect(ncdr.issuedAt).toBeNull();
    expect(ncdr.timeStatus).toBe('on-page'); expect(ncdr.catalogCheckedAt).toBe('2026-10-22');
    expect(ncdr.message).toContain('實驗性');
  });
  it('accepts only fixed known product ids, not URLs or duplicate query values', () => {
    expect(rainMapProductId(undefined)).toBeUndefined(); expect(rainMapProductId('cwa-qpf-6h')).toBe('cwa-qpf-6h');
    for (const invalid of ['https://other.test/image.png','other',['cwa-qpf-6h','cwa-qpf-12h'],null]) expect(rainMapProductId(invalid)).toBeNull();
  });
});
