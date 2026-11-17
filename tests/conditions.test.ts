import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONDITIONS_URLS, createConditionsService, isAllowedCapUrl, parseAlertFeed, parseTrailConditions } from '../server/conditions.js';
import { parseCap } from '../server/cap.js';

const START = '2026-10-21T08:00:00+08:00';
const NOW = '2026-10-21T09:00:00+08:00';
const END = '2026-10-22T12:00:00+08:00';
const basic = [{ TRAILID: '027', TR_CNAME: '大霸尖山登山步道', TR_POSITION: '新竹縣尖石鄉', TR_ADMIN: '新竹分署', TR_ENTRANCE: [{ x: 270000, y: 2700000 }], URL: 'https://recreation.forest.gov.tw/Trail/RT?tr_id=027' }];
const statuses = [{ TRAILID: '027', TR_CNAME: '大霸尖山登山步道', TR_TYP: '注意', TITLE: '水源不足公告', CONTENT: '完整原始路況<br>請自行攜帶飲水', ANN_DATE: '20261021', opendate: null, closedate: null, TR_SUB: '全線', DEP_NAME: '新竹分署' }];
const url = (id: string) => `https://alerts.ncdr.nat.gov.tw/Capstorage/CWA/2026/${id}.cap`;
const cap = (id: string, fields: Record<string, string> = {}) => `<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2"><identifier>${id}</identifier><sender>weather@cwa.gov.tw</sender><sent>${fields.sent ?? START}</sent><status>${fields.status ?? 'Actual'}</status><msgType>${fields.msgType ?? 'Alert'}</msgType><scope>${fields.scope ?? 'Public'}</scope><references>${fields.references ?? ''}</references><info><language>zh-TW</language><senderName>中央氣象署</senderName><event>強風</event><severity>Severe</severity><headline>官方強風特報</headline><description><![CDATA[完整官方訊息<br>第二行]]></description><instruction>完整官方指示</instruction>${fields.effective === '' ? '' : `<effective>${fields.effective ?? START}</effective>`}${fields.expires === '' ? '' : `<expires>${fields.expires ?? END}</expires>`}<area><areaDesc>雪霸地區</areaDesc>${fields.polygon ? `<polygon>${fields.polygon}</polygon>` : ''}</area></info></alert>`;
function feed(ids: string[], entries: Record<string, string> = {}) {
  return `<feed xmlns="http://www.w3.org/2005/Atom"><id>https://alerts.ncdr.nat.gov.tw/RSS.aspx</id><title>NCDR_CAP-即時防災資訊</title>${ids.map(id => `<entry><id>${id}</id><updated>${entries[`${id}:updated`] ?? START}</updated><link rel="alternate" href="${entries[id] ?? url(id)}"/></entry>`).join('')}</feed>`;
}
function fixture() {
  let trailRows: unknown = statuses;
  let allIds: string[] = ['a']; let activeIds: string[] = ['a'];
  const caps = new Map([['a', cap('a')]]);
  const errors = new Map<string, number>();
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const target = String(input);
    if (errors.has(target)) return new Response('upstream failure', { status: errors.get(target) });
    if (target === CONDITIONS_URLS.trails) return Response.json(basic);
    if (target === CONDITIONS_URLS.trailStatus) return Response.json(trailRows);
    if (target === CONDITIONS_URLS.allAlerts) return new Response(feed(allIds));
    if (target === CONDITIONS_URLS.activeAlerts) return new Response(feed(activeIds));
    const id = /\/([^/]+)\.cap$/.exec(target)?.[1];
    if (id && caps.has(id)) return new Response(caps.get(id));
    throw new Error('Unexpected network request');
  });
  return { fetcher, errors, caps, setTrailRows: (rows: unknown) => { trailRows = rows; }, setIds: (all: string[], active = all) => { allIds = all; activeIds = active; } };
}
const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

describe('official trail source interpretation', () => {
  it('joins by TRAILID, preserves original dates/text and never guesses projected coordinates', () => {
    const result = parseTrailConditions(basic, statuses);
    expect(result.catalogCount).toBe(1); expect(result.unmatchedCount).toBe(0);
    expect(result.items[0]).toMatchObject({ name: basic[0].TR_CNAME, condition: 'caution', rawCondition: '注意', description: '完整原始路況\n請自行攜帶飲水', issuedAt: '2026-10-21', updatedAt: null, latitude: null, longitude: null, expectedOpeningDate: null });
    expect(result.items[0].coordinateNote).toContain('尚未核實');
  });
  it('keeps an unmatched closure, an invalid date unknown, and a passed reopening date as an estimate', () => {
    const result = parseTrailConditions(basic, [{ ...statuses[0], TRAILID: '999', TR_TYP: '暫停開放', ANN_DATE: '20261390', opendate: '20261001' }]);
    expect(result.unmatchedCount).toBe(1);
    expect(result.items[0]).toMatchObject({ condition: 'closed', issuedAt: null, expectedOpeningDate: '2026-10-01', latitude: null });
    expect(() => parseTrailConditions([], statuses)).toThrow();
    expect(() => parseTrailConditions(basic, {})).toThrow();
    expect(parseTrailConditions(basic, []).items).toEqual([]);
  });
});

describe('bounded official CAP transport and geometry', () => {
  it('accepts only production storage paths, rejecting arbitrary hosts, encoded traversal and credentials', () => {
    expect(isAllowedCapUrl(url('a'))).toBe(true);
    for (const target of ['http://alerts.ncdr.nat.gov.tw/Capstorage/a.cap', 'https://127.0.0.1/a.cap', 'https://alerts.ncdr.nat.gov.tw.evil.test/Capstorage/a.cap', 'https://user:secret@alerts.ncdr.nat.gov.tw/Capstorage/a.cap', `${url('a')}?key=x`, 'https://alerts.ncdr.nat.gov.tw/Capstorage/%2fsecret.cap', 'https://test.ncdr.nat.gov.tw/Capstorage/a.cap']) expect(isAllowedCapUrl(target)).toBe(false);
    expect(() => parseAlertFeed(feed(['a'], { a: 'http://localhost/a.cap' }))).toThrow(/未核實/);
    expect(() => parseAlertFeed('<!DOCTYPE feed [<!ENTITY x SYSTEM "file:///etc/passwd">]><feed/>')).toThrow();
    expect(parseAlertFeed(feed([]))).toEqual([]);
    expect(() => parseAlertFeed('<html/>')).toThrow();
  });
  it('reverses CAP coordinate order, closes rings and omits malformed or oversized geometry whole', () => {
    const parsed = parseCap(cap('geo', { polygon: '24,121 24,122 25,121' }));
    expect(parsed.info[0].polygons).toEqual([{ type: 'Polygon', coordinates: [[[121, 24], [122, 24], [121, 25], [121, 24]]] }]);
    expect(parseCap(cap('bad', { polygon: '999,121 24,122 25,121' })).info[0].polygons).toEqual([]);
    expect(parseCap(cap('too-big', { polygon: Array(10_001).fill('24,121').join(' ') })).info[0].polygons).toEqual([]);
  });
  it.each([
    '24,121 24,122 ,121', '24,121 24,122 25,',
    '24,121 24,122 NaN,121', '24,121 24,122 25,Infinity',
    '24,121 24,122 25,0x79', '24,121 24,122 25,1e2',
    '24,121 24,122 25,121extra', '24,121 24,122 25,121,1',
    '24,121 24,121 24,121', '24,121 25,122 24,121',
    '24,121 25,122 26,123', '24.1,121.1 24.2,121.2 24.3,121.3',
    '24,121 25,122 24,122 25,121 24,121',
  ])('omits invalid or collapsed polygon %j while preserving the official message and text area', polygon => {
    const message = parseCap(cap('invalid-geometry', { polygon }));
    expect(message.info[0].polygons).toEqual([]);
    expect(message.info[0]).toMatchObject({
      areas: ['雪霸地區'], headline: '官方強風特報', description: '完整官方訊息<br>第二行',
      instruction: '完整官方指示', effective: START, expires: END,
    });
    expect(message).toMatchObject({ identifier: 'invalid-geometry', status: 'Actual', msgType: 'Alert' });
  });
  it('accepts actual decimal zero, signed values and either polygon winding without treating zero as missing', () => {
    expect(parseCap(cap('zero', { polygon: '0,0 0,1 1,0' })).info[0].polygons?.[0].coordinates[0]).toEqual([[0, 0], [1, 0], [0, 1], [0, 0]]);
    const clockwise = parseCap(cap('clockwise', { polygon: '+24.5,+121.5 25.5,121.5 24.5,122.5 +24.5,+121.5' }));
    expect(clockwise.info[0].polygons).toHaveLength(1);
    expect(clockwise.info[0].polygons?.[0].coordinates[0]).toHaveLength(4);
  });
  it('keeps an active official alert in the API when its geometry cannot be trusted', async () => {
    const f = fixture(); f.caps.set('a', cap('a', { polygon: '24,121 24,122 ,121' }));
    const service = createConditionsService({ ncdrMinIntervalMs: 0, fetcher: f.fetcher, now: () => new Date(NOW), cacheDir: false });
    const result = await service.get();
    expect(result.alerts.status).toBe('ready');
    expect(result.alerts.items).toHaveLength(1);
    expect(result.alerts.items[0]).toMatchObject({ identifier: 'a', polygons: [], areas: ['雪霸地區'], description: '完整官方訊息\n第二行', effectiveAt: START, expiresAt: END });
  });
});

describe('shared conditions ingestion', () => {
  it('deduplicates cold requests, preserves full official text and keeps warm reads off upstream', async () => {
    const f = fixture(); const service = createConditionsService({ ncdrMinIntervalMs: 0, fetcher: f.fetcher, now: () => new Date(NOW), cacheDir: false });
    const [a, b] = await Promise.all([service.get(), service.get()]);
    expect(a).toEqual(b); expect(a.trails.status).toBe('ready'); expect(a.alerts.status).toBe('ready');
    expect(a.alerts.items[0]).toMatchObject({ publisher: '中央氣象署', description: '完整官方訊息\n第二行', instruction: '完整官方指示', areas: ['雪霸地區'], issuedAt: START, effectiveAt: START, expiresAt: END });
    expect(f.fetcher).toHaveBeenCalledTimes(4);
    await service.get(); await service.refresh(); expect(f.fetcher).toHaveBeenCalledTimes(4);
    expect(f.fetcher.mock.calls.every(call => String(call[0]).startsWith('https://'))).toBe(true);
  });
  it('distinguishes a valid empty feed from failure and does not infer safe trails', async () => {
    const f = fixture(); f.setIds([]); f.setTrailRows([]);
    const service = createConditionsService({ ncdrMinIntervalMs: 0, fetcher: f.fetcher, now: () => new Date(NOW), cacheDir: false });
    const empty = await service.get(); expect(empty.trails.status).toBe('empty'); expect(empty.alerts.status).toBe('empty');
    expect(empty.trails.message).toContain('不代表正常');
    const bad = fixture(); bad.errors.set(CONDITIONS_URLS.trailStatus, 503); bad.errors.set(CONDITIONS_URLS.allAlerts, 503);
    const failed = await createConditionsService({ ncdrMinIntervalMs: 0, fetcher: bad.fetcher, now: () => new Date(NOW), cacheDir: false }).get();
    expect(failed.trails.status).toBe('error'); expect(failed.alerts.status).toBe('error'); expect(failed.trails.fetchedAt).toBeNull(); expect(failed.alerts.items).toEqual([]);
  });
  it('excludes Test, Exercise, non-Public, future, expired and unknown-interval messages', async () => {
    const f = fixture();
    const variants = { test: { status: 'Test' }, exercise: { status: 'Exercise' }, private: { scope: 'Private' }, scope: { scope: '' }, future: { effective: '2026-10-22T08:00:00+08:00' }, expired: { expires: '2026-10-21T08:30:00+08:00' }, unknown: { effective: '' }, unknownEnd: { expires: '' } };
    for (const [id, fields] of Object.entries(variants)) f.caps.set(id, cap(id, fields));
    f.setIds(['a', ...Object.keys(variants)]);
    const service = createConditionsService({ ncdrMinIntervalMs: 0, fetcher: f.fetcher, now: () => new Date(NOW), cacheDir: false });
    const result = await service.get();
    expect(result.alerts.status).toBe('ready'); expect(result.alerts.items.map(item => item.identifier)).toEqual(['a']); expect(result.alerts.unknownTimeCount).toBe(2);
  });
  it('ages retained data and expires alerts while keeping read-only requests off upstream', async () => {
    let clock = new Date(NOW); const f = fixture();
    const service = createConditionsService({ ncdrMinIntervalMs: 0, fetcher: f.fetcher, now: () => clock, cacheDir: false });
    const initial = await service.get(); const calls = f.fetcher.mock.calls.length;
    clock = new Date('2026-10-22T13:00:00+08:00'); const aged = await service.get();
    expect(aged.trails.status).toBe('stale'); expect(aged.alerts.status).toBe('stale'); expect(aged.alerts.items).toEqual([]); expect(aged.trails.fetchedAt).toBe(initial.trails.fetchedAt); expect(f.fetcher).toHaveBeenCalledTimes(calls);
  });
  it('keeps each CAP info id stable when an earlier info interval expires', async () => {
    let clock = new Date(NOW); const f = fixture();
    const early = cap('a', { expires: '2026-10-21T09:01:00+08:00' });
    const secondInfo = cap('other').match(/<info>[\s\S]*<\/info>/)![0].replace('官方強風特報', '第二則區域特報');
    f.caps.set('a', early.replace('</alert>', `${secondInfo}</alert>`));
    const service = createConditionsService({ ncdrMinIntervalMs: 0, fetcher: f.fetcher, now: () => clock, cacheDir: false });
    const first = await service.get(); expect(first.alerts.items).toHaveLength(2);
    clock = new Date(clock.getTime() + 120_000);
    const later = await service.get(); expect(later.alerts.items).toHaveLength(1); expect(later.alerts.items[0].id).toBe(first.alerts.items[1].id);
  });
  it('persists last-good snapshots, source failures and retry backoff without replacing them with zero results', async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), 'mt-conditions-')); temporary.push(cacheDir);
    let clock = new Date(NOW); const f = fixture();
    const service = createConditionsService({ ncdrMinIntervalMs: 0, fetcher: f.fetcher, now: () => clock, cacheDir });
    const first = await service.get();
    f.errors.set(CONDITIONS_URLS.trailStatus, 503); f.errors.set(CONDITIONS_URLS.allAlerts, 503);
    clock = new Date(clock.getTime() + 16 * 60_000);
    const failed = await service.refresh();
    expect(failed.trails.status).toBe('stale'); expect(failed.alerts.status).toBe('stale'); expect(failed.trails.items).toEqual(first.trails.items); expect(failed.trails.checkedAt).toBe(first.trails.checkedAt);
    const calls = f.fetcher.mock.calls.length; await service.refresh(); expect(f.fetcher).toHaveBeenCalledTimes(calls);
    const restored = createConditionsService({ ncdrMinIntervalMs: 0, fetcher: f.fetcher, now: () => clock, cacheDir });
    expect((await restored.get()).trails.status).toBe('stale'); await restored.refresh(); expect(f.fetcher).toHaveBeenCalledTimes(calls);
    const disk = JSON.parse(await readFile(join(cacheDir, 'state.json'), 'utf8'));
    expect(disk.trails.hasData).toBe(true); expect(disk.trails.basic).toHaveLength(1);
  });
  it('retains Update/Cancel tombstones across missing feed entries and process restarts', async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), 'mt-conditions-')); temporary.push(cacheDir);
    const f = fixture(); const service = createConditionsService({ ncdrMinIntervalMs: 0, fetcher: f.fetcher, now: () => new Date(NOW), cacheDir });
    await service.get();
    f.caps.set('b', cap('b', { sent: '2026-10-21T08:10:00+08:00', msgType: 'Update', references: `weather@cwa.gov.tw,a,${START}` })); f.setIds(['b']);
    expect((await service.refresh({ force: true })).alerts.items.map(item => item.identifier)).toEqual(['b']);
    f.caps.set('c', cap('c', { sent: '2026-10-21T08:20:00+08:00', msgType: 'Cancel', references: 'weather@cwa.gov.tw,b,2026-10-21T08:10:00+08:00' })); f.setIds(['c']);
    expect((await service.refresh({ force: true })).alerts.items).toEqual([]);
    f.setIds(['a', 'b']);
    const restored = createConditionsService({ ncdrMinIntervalMs: 0, fetcher: f.fetcher, now: () => new Date(NOW), cacheDir });
    expect((await restored.refresh({ force: true })).alerts.items).toEqual([]);
    expect((await restored.get()).alerts.status).toBe('empty');
  });
  it('keeps cancellation knowledge even if another CAP in the same poll fails', async () => {
    const f = fixture(); const service = createConditionsService({ ncdrMinIntervalMs: 0, fetcher: f.fetcher, now: () => new Date(NOW), cacheDir: false }); await service.get();
    f.caps.set('c', cap('c', { msgType: 'Cancel', references: `weather@cwa.gov.tw,a,${START}` })); f.setIds(['c', 'broken']); f.errors.set(url('broken'), 503);
    const partial = await service.refresh({ force: true }); expect(partial.alerts.status).toBe('stale'); expect(partial.alerts.items).toEqual([]);
    f.setIds(['a']); expect((await service.refresh({ force: true })).alerts.items).toEqual([]);
  });
  it('uses conditional revalidation and changes checkedAt without changing unchanged snapshot fetchedAt', async () => {
    let clock = new Date(NOW); const f = fixture(); let subsequent = false;
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (subsequent && !String(input).endsWith('.cap')) { expect(new Headers(init?.headers).get('if-none-match')).toBe('"v1"'); return new Response(null, { status: 304 }); }
      const response = await f.fetcher(input); response.headers.set('etag', '"v1"'); return response;
    });
    const service = createConditionsService({ ncdrMinIntervalMs: 0, fetcher, now: () => clock, cacheDir: false }); const a = await service.get();
    subsequent = true; clock = new Date(clock.getTime() + 16 * 60_000); const b = await service.refresh();
    expect(b.trails.checkedAt).not.toBe(a.trails.checkedAt); expect(b.trails.fetchedAt).toBe(a.trails.fetchedAt); expect(b.alerts.fetchedAt).toBe(a.alerts.fetchedAt); expect(b.alerts.status).toBe('ready');
  });
  it('remembers handled expired CAP entries and avoids downloading their unchanged bodies every minute', async () => {
    const f = fixture(); f.setIds(['expired']); f.caps.set('expired', cap('expired', { expires: '2026-10-21T08:30:00+08:00' }));
    const service = createConditionsService({ ncdrMinIntervalMs: 0, fetcher: f.fetcher, now: () => new Date(NOW), cacheDir: false });
    expect((await service.get()).alerts.status).toBe('empty');
    expect(f.fetcher.mock.calls.filter(call => String(call[0]).endsWith('.cap'))).toHaveLength(1);
    await service.refresh({ force: true });
    expect(f.fetcher.mock.calls.filter(call => String(call[0]).endsWith('.cap'))).toHaveLength(1);
  });
  it('honors Retry-After across polls and process restarts without requesting blocked sources', async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), 'mt-conditions-')); temporary.push(cacheDir);
    let clock = new Date(NOW); let limited = true; const f = fixture();
    const fetcher = vi.fn(async (input: string | URL | Request) => String(input) === CONDITIONS_URLS.allAlerts && limited ? new Response('rate limited', { status: 429, headers: { 'retry-after': '120' } }) : f.fetcher(input));
    const service = createConditionsService({ ncdrMinIntervalMs: 0, fetcher, now: () => clock, cacheDir });
    expect((await service.get()).alerts.status).toBe('error');
    const calls = fetcher.mock.calls.length; limited = false; clock = new Date(clock.getTime() + 60_000);
    const restored = createConditionsService({ ncdrMinIntervalMs: 0, fetcher, now: () => clock, cacheDir });
    await restored.get(); await restored.refresh(); expect(fetcher).toHaveBeenCalledTimes(calls);
    clock = new Date(clock.getTime() + 61_000);
    expect((await restored.refresh()).alerts.status).toBe('ready');
  });
  it('does not follow redirects and bounds oversize or unresponsive upstreams without leaking internals', async () => {
    const redirect = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } }));
    const redirected = await createConditionsService({ ncdrMinIntervalMs: 0, fetcher: redirect, now: () => new Date(NOW), cacheDir: false }).get();
    expect(redirect).toHaveBeenCalledTimes(3); expect(redirected.alerts.status).toBe('error'); expect(JSON.stringify(redirected)).not.toContain('127.0.0.1');
    const large = vi.fn(async () => new Response('[]', { headers: { 'content-length': '9000000' } }));
    expect((await createConditionsService({ ncdrMinIntervalMs: 0, fetcher: large, cacheDir: false }).get()).trails.error).toContain('大小限制');
    const hang = vi.fn((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('secret failure')))));
    const timed = await createConditionsService({ ncdrMinIntervalMs: 0, fetcher: hang, cacheDir: false, timeoutMs: 10 }).get();
    expect(timed.trails.status).toBe('error'); expect(timed.trails.error).toContain('逾時'); expect(JSON.stringify(timed)).not.toContain('secret');
  });
  it('returns a loading snapshot within its cold budget and completes the one shared background refresh', async () => {
    const f = fixture();
    const slow = vi.fn(async (input: string | URL | Request) => { await new Promise(resolve => setTimeout(resolve, 30)); return f.fetcher(input); });
    const service = createConditionsService({ ncdrMinIntervalMs: 0, fetcher: slow, cacheDir: false, now: () => new Date(NOW), coldWaitMs: 5 });
    expect((await service.get()).trails.status).toBe('missing');
    expect((await service.refresh()).trails.status).toBe('ready'); expect(slow).toHaveBeenCalledTimes(4);
  });
});
