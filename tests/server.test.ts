import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../server/app.js';

describe('server input and API status boundaries', () => {
  it('serves nationwide equipment by default, negotiates cached gzip, and retains the old mountain filter', async () => {
    const app = createApp();
    const compressed = await request(app).get('/api/equipment').set('Accept-Encoding', 'gzip').expect(200);
    expect(compressed.headers['content-encoding']).toBe('gzip');
    expect(compressed.headers.vary).toContain('Accept-Encoding');
    expect(compressed.body.items.length).toBeGreaterThan(10_000);
    expect(compressed.body.items.some((item: {id:string}) => item.id === 'ysnp-guangao-first_aid')).toBe(true);
    const identity = await request(app).get('/api/equipment').set('Accept-Encoding', 'identity').expect(200);
    expect(identity.headers['content-encoding']).toBeUndefined();
    expect(compressed.body).toEqual(identity.body);
    expect(Number(compressed.headers['content-length'])).toBeLessThan(Number(identity.headers['content-length']) / 3);
    expect(compressed.headers.etag).toBe(identity.headers.etag);
    await request(app).get('/api/equipment').set('If-None-Match', identity.headers.etag).expect(304);
    const legacy = await request(app).get('/api/equipment?region=xueshan').set('Accept-Encoding', 'gzip;q=0, identity;q=1').expect(200);
    expect(legacy.headers['content-encoding']).toBeUndefined();
    expect(legacy.body.items.length).toBeLessThan(compressed.body.items.length);
    expect(legacy.body.items.every((item: {regions:string[]}) => item.regions.includes('xueshan'))).toBe(true);
    await request(app).get('/api/equipment?region=xueshan&region=daba').expect(400);
  });
  it('serves official public rain-chart URLs without a private key and rejects arbitrary products', async () => {
    const app = createApp();
    const catalog = await request(app).get('/api/rain-maps').expect(200);
    expect(catalog.body.products).toHaveLength(3); expect(catalog.body.products[0].frames).toHaveLength(8);
    const selected = await request(app).get('/api/rain-maps?product=cwa-qpf-12h').expect(200);
    expect(selected.body.products).toHaveLength(1); expect(selected.body.products[0].frames).toHaveLength(4);
    const mpas = await request(app).get('/api/rain-maps?product=ncdr-mpas').expect(200);
    expect(mpas.body.products[0]).toMatchObject({ status: 'available', display: 'official-page', experimental: true, frames: [], pageUrl: 'https://watch.ncdr.nat.gov.tw/watch_mpas2weeks', issuedAt: null, timeStatus: 'on-page' });
    const health = await request(app).get('/api/health').expect(200);
    expect(health.body).toMatchObject({ ncdrWatchEnabled: false, ncdrMpasViewerEnabled: true });
    await request(app).get('/api/rain-maps?product=http://localhost').expect(400);
    await request(app).get('/api/rain-maps?product=cwa-qpf-6h&product=cwa-qpf-12h').expect(400);
  });
  it('returns unconfigured live weather by default and an explicit demo on request', async () => {
    const app = createApp();
    const health = await request(app).get('/api/health').expect(200); expect(health.body.weatherConfigured).toBe(false);
    const live = await request(app).get('/api/weather?region=xueshan').expect(200); expect(live.body.mode).toBe('live'); expect(live.body.products[0].status).toBe('unconfigured');
    const demo = await request(app).get('/api/weather?region=daba&mode=demo').expect(200); expect(demo.body.products[0].status).toBe('demo');
  });
  it('rejects arbitrary regions, modes and array query inputs', async () => {
    const app = createApp();
    for (const query of ['region=other','region=xueshan&mode=other','region=xueshan&region=daba','product=other','product=observation&product=qpf']) await request(app).get(`/api/weather?${query}`).expect(400);
    await request(app).get('/api/equipment?region=other').expect(400);
    await request(app).get('/api/weather?product=forecast').expect(400);
    await request(app).get('/api/conditions?url=http://localhost').expect(400);
    await request(app).get('/api/conditions?force=true').expect(400);
    await request(app).get('/api/proxy?url=http://localhost').expect(404);
  });
  it('allows selecting a single product while retaining truthful disabled service metadata', async () => {
    const app = createApp();
    const result = await request(app).get('/api/weather?region=xueshan&mode=live&product=observation').expect(200);
    expect(result.body.products.filter((p: {status:string}) => p.status === 'unconfigured').map((p: {id:string}) => p.id)).toEqual(['rain']);
    expect(result.body.products.find((p: {id:string}) => p.id === 'radar').status).toBe('disabled');
  });
  it('applies a bounded per-client API rate limit', async () => {
    const app = createApp({ rateLimit:2 });
    await request(app).get('/api/health').expect(200); await request(app).get('/api/health').expect(200);
    const limited = await request(app).get('/api/health').expect(429); expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });
});
