import { describe, expect, it, vi } from 'vitest';
import { createWeatherService, demoWeather, freshness, parseMountainForecast, parseQpf, parseQpfGrid, parseRainObservations, rainValue } from '../server/weather.js';
import { activeCapMessages, parseCap } from '../server/cap.js';

const now = new Date('2026-10-14T06:30:00+08:00');
const mountain = { cwaopendata: { Sent: '2026-10-14T05:10:00+08:00', Dataset: { DatasetInfo: { IssueTime: '2026-10-14T05:00:00+08:00' }, Locations: { Location: [{ LocationName: '雪山', Latitude: '24.38', Longitude: '121.23', WeatherElement: [
  { ElementName: '溫度', Time: [{ DataTime: '2026-10-14T06:00:00+08:00', ElementValue: { Temperature: '8' } }] },
  { ElementName: '3小時降雨機率', Time: [{ StartTime: '2026-10-14T06:00:00+08:00', EndTime: '2026-10-14T09:00:00+08:00', ElementValue: { ProbabilityOfPrecipitation: '30' } }] },
  { ElementName: '天氣現象', Time: [{ StartTime: '2026-10-14T06:00:00+08:00', EndTime: '2026-10-14T09:00:00+08:00', ElementValue: { Weather: '多雲' } }] },
] }] } } } };
const observation = (value: string, time = '2026-10-14T06:20:00+08:00') => ({ cwaopendata: { dataset: { Station: [{ StationName: '測試站', StationId: 'TEST', ObsTime: { DateTime: time }, GeoInfo: { Coordinates: [{ CoordinateName: 'TWD67', StationLatitude: '24.39', StationLongitude: '121.22' }, { CoordinateName: 'WGS84', StationLatitude: '24.38', StationLongitude: '121.23' }] }, RainfallElement: { Past1hr: { Precipitation: value } } }] } } });
const qpf = { cwaopendata: { sent: '2026-10-14T06:15:00+08:00', dataset: { datasetInfo: { parameterSet: { GridDimensionX: '2', GridDimensionY: '2', GridResolution: '0.0125', StartPointLongitude: '118', StartPointLatitude: '20', DateTime: '2026-10-14T06:10:00+08:00' } }, contents: { contentDescription: 'synthetic TWD67 fixture', content: '0,1,-99,2.5' } } } };

describe('CWA factor parsing and data quality', () => {
  it('preserves instantaneous temperature versus independent rain probability intervals', () => {
    const result = parseMountainForecast(mountain, 'xueshan', now.toISOString(), now);
    expect(result.status).toBe('ready'); expect(result.items).toHaveLength(3);
    const temperature = result.items.find(x => x.metric === 'temperature')!;
    const probability = result.items.find(x => x.metric === 'probability')!;
    expect(temperature.startsAt).toBe(temperature.endsAt);
    expect(probability.endsAt).toBe('2026-10-14T09:00:00+08:00');
    expect(result.items.find(x => x.metric === 'condition')?.description).toBe('多雲');
    expect(parseMountainForecast(mountain, 'daba', now.toISOString(), now).status).toBe('missing');
  });
  it('does not invent numeric values for null, sentinels, rain traces or instrument faults', () => {
    for (const raw of [null, undefined, '', ' ', '-99', '-98', '-999', 'X', 'T', 'NaN', '0oops']) expect(rainValue(raw).value).toBeNull();
    expect(rainValue('0').value).toBe(0); expect(rainValue('2.5').value).toBe(2.5);
    expect(rainValue('T').description).toContain('雨跡');
    expect(rainValue('-98').description).toContain('連續 6 小時無降水');
  });
  it('uses the station WGS84 coordinate and observation time without fabricating release time', () => {
    const result = parseRainObservations(observation('0'), 'xueshan', now.toISOString(), now);
    expect(result.status).toBe('ready'); expect(result.issuedAt).toBeNull();
    expect(result.items[0].latitude).toBe(24.38); expect(result.items[0].value).toBe(0);
    expect(result.items[0].endsAt).toBe('2026-10-14T06:20:00+08:00');
    expect(Date.parse(result.items[0].endsAt)-Date.parse(result.items[0].startsAt)).toBe(3_600_000);
    expect(parseRainObservations(observation('-99'), 'xueshan', now.toISOString(), now).status).toBe('missing');
    expect(parseRainObservations(observation('4', '2026-10-14T04:00:00+08:00'), 'xueshan', now.toISOString(), now).status).toBe('stale');
  });
  it('rejects stale forecasts and unknown/future publication times', () => {
    expect(freshness('2026-10-14T05:00:00+08:00', '2026-10-14T06:00:00+08:00', 9 * 3_600_000, now)).toBe('stale');
    expect(freshness(null, '2026-10-14T09:00:00+08:00', 9 * 3_600_000, now)).toBe('missing');
    expect(freshness('2026-10-14T08:00:00+08:00', '2026-10-14T09:00:00+08:00', 9 * 3_600_000, now)).toBe('missing');
    expect(freshness('invalid', 'also invalid', 9 * 3_600_000, now)).toBe('missing');
  });
  it('does not convert incomplete factor intervals to valid point forecasts or substitute envelope time for publication time', () => {
    const incomplete = structuredClone(mountain);
    const probabilityTime = incomplete.cwaopendata.Dataset.Locations.Location[0].WeatherElement[1].Time[0] as Record<string,unknown>;
    delete probabilityTime.EndTime;
    expect(parseMountainForecast(incomplete,'xueshan',now.toISOString(),now).items.filter(x => x.metric === 'probability')).toEqual([]);
    delete (incomplete.cwaopendata.Dataset.DatasetInfo as Record<string,unknown>).IssueTime;
    const unpublished = parseMountainForecast(incomplete,'xueshan',now.toISOString(),now);
    expect(unpublished.issuedAt).toBeNull(); expect(unpublished.status).toBe('missing');
  });
  it('does not let future missing slots make expired usable values fresh', () => {
    const futureMissing = structuredClone(mountain);
    const elements = futureMissing.cwaopendata.Dataset.Locations.Location[0].WeatherElement;
    elements.splice(1);
    (elements[0].Time as unknown[]).push({ DataTime:'2026-10-15T06:00:00+08:00', ElementValue:{ Temperature:'-99' } });
    const result = parseMountainForecast(futureMissing,'xueshan',now.toISOString(),now);
    expect(result.validTo).toBe('2026-10-15T06:00:00+08:00'); expect(result.status).toBe('stale');
  });
  it('validates QPF dimensions and missing grid values without assuming WGS84 or validity intervals', () => {
    const grid = parseQpfGrid(qpf); expect(grid.values).toEqual([0,1,null,2.5]);
    const parsed = parseQpf(qpf, 'xueshan', now.toISOString(), now);
    expect(parsed.status).toBe('missing'); expect(parsed.items).toEqual([]); expect(parsed.validFrom).toBeNull(); expect(parsed.validTo).toBeNull();
    const broken = structuredClone(qpf); broken.cwaopendata.dataset.contents.content = '0,1';
    expect(() => parseQpfGrid(broken)).toThrow(/維度/);
  });
});

describe('live versus demo and upstream reliability', () => {
  it('does not include or download the deferred mountain forecast in normal or demo service responses', async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request) => new Response(JSON.stringify(observation('1.5'))));
    const service = createWeatherService({ apiKey: 'private', fetcher, now: () => now });
    const result = await service.getWeather('xueshan', 'live');
    expect(result.products.some(item => item.kind === 'forecast' || item.id === 'mountain')).toBe(false);
    expect(fetcher.mock.calls.every(call => !String(call[0]).includes('F-B0053-035'))).toBe(true);
    expect((await service.getWeather('xueshan', 'demo')).products.some(item => item.kind === 'forecast')).toBe(false);
  });
  it('downloads only the explicitly requested observation product and does not fetch QPF or forecasts', async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request) => new Response(JSON.stringify(observation('1.5'))));
    const service = createWeatherService({apiKey:'private',fetcher,now:() => now});
    const result = await service.getWeather('xueshan','live','observation');
    expect(fetcher).toHaveBeenCalledTimes(1); expect(String(fetcher.mock.calls[0][0])).toContain('/O-A0002-001?');
    expect(result.products.find(x => x.id === 'rain')?.status).toBe('ready');
    expect(result.products.some(x => x.id === 'qpf' || x.id === 'mountain')).toBe(false);
    const radar = await service.getWeather('xueshan','live','radar');
    expect(fetcher).toHaveBeenCalledTimes(1); expect(radar.products.find(x => x.id === 'radar')?.status).toBe('disabled');
    const demo = await service.getWeather('xueshan','demo','observation');
    expect(demo.products.filter(x => x.status === 'demo').map(x => x.kind)).toEqual(['observation']);
  });
  it('requires explicit demo mode and never falls back when the key is missing', async () => {
    const fetcher = vi.fn(); const service = createWeatherService({ fetcher, now: () => now });
    const live = await service.getWeather('xueshan', 'live');
    expect(live.products.slice(0,2).every(x => x.status === 'unconfigured' && x.items.length === 0)).toBe(true); expect(fetcher).not.toHaveBeenCalled();
    const demo = await service.getWeather('daba', 'demo'); expect(demo.mode).toBe('demo'); expect(demo.products[0].status).toBe('demo');
    expect(demo.products[0].source.name).toContain('非官方'); expect(demoWeather('xueshan').products[0].issuedAt).toContain('2026-10-14');
  });
  it('keeps raw upstream failure details and credentials out of returned data', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('https://upstream?Authorization=PRIVATE-KEY'));
    const response = await createWeatherService({ apiKey:'PRIVATE-KEY', fetcher, now: () => now }).getWeather('xueshan','live');
    expect(response.products.slice(0,2).every(x => x.status === 'error')).toBe(true); expect(JSON.stringify(response)).not.toContain('PRIVATE-KEY');
  });
  it('deduplicates concurrent downloads, caches shared data and serves explicitly stale cached values on failure', async () => {
    let clock = now;
    const fetcher = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(String(input).includes('F-B0053-035') ? mountain : String(input).includes('O-A0002-001') ? observation('1.5') : qpf), { headers: { etag:'test-v1' } }));
    const service = createWeatherService({ apiKey:'private', fetcher, now: () => clock });
    await Promise.all([service.getWeather('xueshan','live'), service.getWeather('daba','live')]); expect(fetcher).toHaveBeenCalledTimes(2);
    await service.getWeather('xueshan','live'); expect(fetcher).toHaveBeenCalledTimes(2);
    clock = new Date(now.getTime() + 20 * 60_000); fetcher.mockRejectedValue(new Error('offline'));
    const fallback = await service.getWeather('xueshan','live');
    expect(fallback.products[0].status).toBe('stale'); expect(fallback.products[0].fetchedAt).toBe(now.toISOString()); expect(fallback.products[0].items).toHaveLength(1);
    expect(fetcher.mock.calls.at(-1)?.[1]?.headers).toEqual({ 'If-None-Match':'test-v1' });
  });
  it('retains the last good payload when a later download has an incomplete schema', async () => {
    let clock = now; let broken = false;
    const fetcher = vi.fn(async (input: string | URL | Request) => new Response(JSON.stringify(broken ? {} : String(input).includes('F-B0053-035') ? mountain : String(input).includes('O-A0002-001') ? observation('1.5') : qpf)));
    const service = createWeatherService({apiKey:'private',fetcher,now:() => clock});
    await service.getWeather('xueshan','live'); clock = new Date(now.getTime() + 20 * 60_000); broken = true;
    const result = await service.getWeather('xueshan','live'); expect(result.products[0].status).toBe('stale'); expect(result.products[0].items).toHaveLength(1); expect(result.products[0].fetchedAt).toBe(now.toISOString());
  });
  it('honors ETag 304 without changing the original successful download time', async () => {
    let clock = now; let notModified = false;
    const fetcher = vi.fn(async (input: string | URL | Request) => notModified ? new Response(null,{status:304}) : new Response(JSON.stringify(String(input).includes('F-B0053-035') ? mountain : String(input).includes('O-A0002-001') ? observation('1.5') : qpf),{headers:{etag:'v1'}}));
    const service = createWeatherService({apiKey:'private',fetcher,now:() => clock}); await service.getWeather('xueshan','live');
    clock = new Date(now.getTime() + 20 * 60_000); notModified = true;
    const result = await service.getWeather('xueshan','live'); expect(result.products[0].status).toBe('ready'); expect(result.products[0].fetchedAt).toBe(now.toISOString());
  });
  it('checks redirect destinations before sending the next network request', async () => {
    const fetcher = vi.fn(async () => new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}}));
    const result = await createWeatherService({apiKey:'private',fetcher,now:() => now}).getWeather('xueshan','live');
    expect(fetcher).toHaveBeenCalledTimes(2); expect(result.products.slice(0,2).every(x => x.status === 'error')).toBe(true);
  });
  it('bounds unresponsive upstream requests with abort and exposes a normal error status', async () => {
    const fetcher = vi.fn((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve,reject) => init?.signal?.addEventListener('abort',() => reject(new Error('aborted private')))));
    const result = await createWeatherService({apiKey:'private',fetcher,now:() => now,timeoutMs:10}).getWeather('xueshan','live');
    expect(result.products.slice(0,2).every(x => x.status === 'error')).toBe(true); expect(JSON.stringify(result)).not.toContain('aborted private');
  });
});

const cap = (id: string, sent: string, overrides: Record<string,string> = {}) => `<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2"><identifier>${id}</identifier><sender>official@example.tw</sender><sent>${sent}</sent><status>${overrides.status ?? 'Actual'}</status><msgType>${overrides.msgType ?? 'Alert'}</msgType><scope>Public</scope><references>${overrides.references ?? ''}</references><info><senderName>官方單位</senderName><headline>${overrides.headline ?? '完整標題'}</headline><description>完整官方訊息</description><instruction>官方指示</instruction><effective>${overrides.effective ?? '2026-10-14T05:00:00+08:00'}</effective><expires>${overrides.expires ?? '2026-10-14T12:00:00+08:00'}</expires><area><areaDesc>雪霸地區</areaDesc></area></info></alert>`;
describe('disabled NCDR CAP lifecycle utility', () => {
  const sent = '2026-10-14T05:00:00+08:00';
  it('preserves publisher, full text and areas while excluding Test, Exercise and expired messages', () => {
    const messages = [parseCap(cap('a',sent)), parseCap(cap('test',sent,{status:'Test'})), parseCap(cap('exercise',sent,{status:'Exercise'})), parseCap(cap('expired',sent,{expires:'2026-10-14T06:00:00+08:00'}))];
    const active = activeCapMessages(messages,now); expect(active).toHaveLength(1); expect(active[0].info[0]).toMatchObject({ senderName:'官方單位', description:'完整官方訊息', areas:['雪霸地區'] });
  });
  it('processes updates and cancellations by full CAP reference, irrespective of input order', () => {
    const original = parseCap(cap('a',sent));
    const updated = parseCap(cap('b','2026-10-14T05:20:00+08:00',{msgType:'Update',references:`official@example.tw,a,${sent}`}));
    expect(activeCapMessages([updated,original],now).map(x => x.identifier)).toEqual(['b']);
    const cancelled = parseCap(cap('c','2026-10-14T05:30:00+08:00',{msgType:'Cancel',references:'official@example.tw,b,2026-10-14T05:20:00+08:00'}));
    expect(activeCapMessages([cancelled,original,updated],now)).toEqual([]);
    const testCancel = parseCap(cap('tc','2026-10-14T05:30:00+08:00',{status:'Test',msgType:'Cancel',references:`official@example.tw,a,${sent}`}));
    expect(activeCapMessages([original,testCancel],now)).toHaveLength(1);
  });
  it('does not activate future-effective messages and rejects malformed XML or external entities', () => {
    expect(activeCapMessages([parseCap(cap('future',sent,{effective:'2026-10-14T09:00:00+08:00'}))],now)).toEqual([]);
    expect(() => parseCap('<alert>')).toThrow(); expect(() => parseCap('<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]><alert/>')).toThrow();
    expect(() => parseCap(cap('bad-effective',sent,{effective:'invalid'}))).toThrow(/生效時間/);
    expect(() => parseCap(cap('bad-update',sent,{msgType:'Update'}))).toThrow(/reference/);
    expect(() => parseCap(cap('bad-cancel',sent,{msgType:'Cancel',references:'invalid'}))).toThrow(/reference/);
  });
});
