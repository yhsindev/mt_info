import type { DataMode, DataStatus, RegionId, SourceInfo, WeatherItem, WeatherKind, WeatherProduct, WeatherResponse } from '../src/shared/types.js';

type Obj = Record<string, unknown>;
const object = (value: unknown): Obj => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Obj : {};
const list = (value: unknown): unknown[] => value == null ? [] : Array.isArray(value) ? value : [value];
const field = (obj: unknown, ...names: string[]): unknown => { const record = object(obj); for (const name of names) if (record[name] !== undefined) return record[name]; return undefined; };
const text = (value: unknown): string => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
export const timestamp = (value: unknown): string | null => { const s = text(value); return /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(s) && Number.isFinite(Date.parse(s)) ? s : null; };
const numeric = (value: unknown): number | null => { const s = text(value).trim(); return s !== '' && Number.isFinite(Number(s)) ? Number(s) : null; };
const iso = (time: number) => new Date(time).toISOString();
const rootOf = (data: unknown) => field(data, 'cwaopendata') ?? data;
const datasetOf = (data: unknown) => field(rootOf(data), 'Dataset', 'dataset', 'records') ?? field(data, 'records');

export const weatherSources: Record<string, SourceInfo> = {
  mountain: { name: '交通部中央氣象署', url: 'https://opendata.cwa.gov.tw/dataset/forecast/F-B0053-035', dataset: 'F-B0053-035', license: '政府資料開放授權條款第 1 版；氣象署平臺規範' },
  rain: { name: '交通部中央氣象署', url: 'https://data.gov.tw/dataset/9177', dataset: 'O-A0002-001', license: '政府資料開放授權條款第 1 版' },
  qpf: { name: '交通部中央氣象署', url: 'https://data.gov.tw/dataset/42619', dataset: 'F-B0046-001', license: '政府資料開放授權條款第 1 版' },
  radar: { name: '交通部中央氣象署', url: 'https://opendata.cwa.gov.tw/dataset/all/O-B0045-001', dataset: 'O-B0045-001' },
  ncdr: { name: '國家災害防救科技中心', url: 'https://watch.ncdr.nat.gov.tw/watch_api_open' },
  alerts: { name: 'NCDR 民生示警公開資料平台', url: 'https://alerts.ncdr.nat.gov.tw/web/developer/alerts-api' },
};

function product(id: string, title: string, kind: WeatherKind, source: SourceInfo, status: DataStatus, message: string): WeatherProduct {
  return { id, title, kind, source, status, message, issuedAt: null, validFrom: null, validTo: null, fetchedAt: null, items: [] };
}
function timeBounds(items: WeatherItem[]) {
  const starts = items.map(x => x.startsAt).sort((a,b) => Date.parse(a)-Date.parse(b));
  const ends = items.map(x => x.endsAt).sort((a,b) => Date.parse(a)-Date.parse(b));
  return { validFrom: starts[0] ?? null, validTo: ends.at(-1) ?? null };
}
export function freshness(issuedAt: string | null, validTo: string | null, maximumAgeMs: number, now = new Date()): DataStatus {
  const issued = timestamp(issuedAt); const valid = timestamp(validTo);
  if (!issued || !valid) return 'missing';
  if (Date.parse(issued) > now.getTime() + 5 * 60_000) return 'missing';
  return Date.parse(valid) < now.getTime() || now.getTime() - Date.parse(issued) > maximumAgeMs ? 'stale' : 'ready';
}

/** Original timestamps stay with each factor; point forecasts have startsAt === endsAt. */
export function parseMountainForecast(data: unknown, region: RegionId, fetchedAt: string, now = new Date()): WeatherProduct {
  const result = product('mountain', '登山三天官方預報', 'forecast', weatherSources.mountain, 'missing', '這個山區沒有可解析的官方預報點。');
  const dataset = datasetOf(data);
  const info = field(dataset, 'DatasetInfo', 'datasetInfo');
  result.issuedAt = timestamp(field(info, 'IssueTime', 'issueTime'));
  result.fetchedAt = fetchedAt;
  const locations = list(field(dataset, 'Locations', 'locations')).flatMap(group => list(field(group, 'Location', 'location')));
  if (!locations.length) locations.push(...list(field(dataset, 'Location', 'location')));
  const names = region === 'daba' ? ['大霸尖山', '大霸'] : ['雪山', '雪山主峰', '雪山東峰', '雪山北峰'];
  for (const rawLocation of locations) {
    const name = text(field(rawLocation, 'LocationName', 'locationName'));
    if (!names.includes(name)) continue;
    const latitude = numeric(field(rawLocation, 'Latitude', 'lat'));
    const longitude = numeric(field(rawLocation, 'Longitude', 'lon'));
    for (const rawElement of list(field(rawLocation, 'WeatherElement', 'weatherElement'))) {
      const factor = text(field(rawElement, 'ElementName', 'elementName'));
      const metric = /^(溫度|T)$/.test(factor) ? 'temperature' : /降雨機率|^PoP/.test(factor) ? 'probability' : /^(天氣現象|Wx)$/.test(factor) ? 'condition' : null;
      if (!metric) continue;
      for (const [index, rawTime] of list(field(rawElement, 'Time', 'time')).entries()) {
        const rawStart = field(rawTime, 'StartTime', 'startTime'); const rawEnd = field(rawTime, 'EndTime', 'endTime');
        const interval = rawStart !== undefined || rawEnd !== undefined;
        const pointAt = timestamp(field(rawTime, 'DataTime', 'dataTime'));
        const startsAt = interval ? timestamp(rawStart) : pointAt;
        const endsAt = interval ? timestamp(rawEnd) : pointAt;
        if (!startsAt || !endsAt || Date.parse(endsAt) < Date.parse(startsAt)) continue;
        const valueRecord = list(field(rawTime, 'ElementValue', 'elementValue', 'parameter'))[0];
        const rawValue = metric === 'temperature' ? field(valueRecord, 'Temperature', 'value', 'parameterName') : metric === 'probability' ? field(valueRecord, 'ProbabilityOfPrecipitation', 'value', 'parameterName') : field(valueRecord, 'Weather', 'value', 'parameterName');
        let value = metric === 'condition' ? null : numeric(rawValue);
        if (value !== null && (value <= -90 || metric === 'probability' && (value < 0 || value > 100))) value = null;
        const condition = text(rawValue).trim();
        result.items.push({ id: `${name}-${metric}-${index}`, name, ...(latitude !== null && longitude !== null ? { latitude, longitude } : {}), metric, value, unit: metric === 'temperature' ? '°C' : metric === 'probability' ? '%' : '', startsAt, endsAt, description: metric === 'condition' ? !condition || /^(?:-99|-999|NA|N\/A|-)$/i.test(condition) ? '缺測' : condition : value === null ? `${factor}缺測` : factor });
      }
    }
  }
  Object.assign(result, timeBounds(result.items));
  const usable = result.items.filter(x => x.value !== null || x.metric === 'condition' && x.description !== '缺測');
  result.status = usable.length ? freshness(result.issuedAt, timeBounds(usable).validTo, 9 * 60 * 60_000, now) : 'missing';
  result.message = result.status === 'ready' ? '官方登山預報點；各因子依原始時間顯示。降雨機率不等於雨量。' : result.status === 'stale' ? '預報已過期或超過更新等待門檻，請查看官方最新資訊。' : '沒有可用的官方預報值或發布時間；不補成零。';
  return result;
}

export function rainValue(raw: unknown): { value: number | null; description?: string } {
  const s = text(raw).trim();
  if (s === 'T') return { value: null, description: '雨跡（T），非數值零' };
  if (s === '-98') return { value: null, description: '官方代碼 -98：連續 6 小時無降水；不換算成本時段數值' };
  const value = numeric(raw);
  return value !== null && value >= 0 ? { value } : { value: null, description: s === 'X' ? '儀器故障（X）' : '缺測或資料異常' };
}

export function parseRainObservations(data: unknown, region: RegionId, fetchedAt: string, now = new Date()): WeatherProduct {
  const result = product('rain', '雨量站・過去一小時', 'observation', weatherSources.rain, 'missing', '附近沒有可用雨量站觀測。');
  result.fetchedAt = fetchedAt;
  // A fixed regional query window, not a catchment or an interpolation radius.
  const bbox = region === 'daba' ? [121.05, 24.40, 121.40, 24.65] : [121.05, 24.25, 121.40, 24.48];
  for (const rawStation of list(field(datasetOf(data), 'Station', 'station'))) {
    const coordinates = list(field(field(rawStation, 'GeoInfo'), 'Coordinates')).find(c => field(c, 'CoordinateName') === 'WGS84');
    const latitude = numeric(field(coordinates, 'StationLatitude'));
    const longitude = numeric(field(coordinates, 'StationLongitude'));
    if (latitude === null || longitude === null || longitude < bbox[0] || longitude > bbox[2] || latitude < bbox[1] || latitude > bbox[3]) continue;
    const endsAt = timestamp(field(field(rawStation, 'ObsTime'), 'DateTime'));
    if (!endsAt) continue;
    const value = rainValue(field(field(field(rawStation, 'RainfallElement'), 'Past1hr'), 'Precipitation'));
    const stale = now.getTime() - Date.parse(endsAt) > 30 * 60_000 || Date.parse(endsAt) > now.getTime() + 5 * 60_000;
    result.items.push({ id: text(field(rawStation, 'StationId')), name: text(field(rawStation, 'StationName')), latitude, longitude, metric: 'rain', ...value, unit: 'mm', startsAt: iso(Date.parse(endsAt) - 60 * 60_000), endsAt, description: [value.description, stale ? '觀測逾時／時間異常' : null].filter(Boolean).join('；') || '測站過去一小時累積雨量' });
  }
  Object.assign(result, timeBounds(result.items));
  // Observation publication time is unknown: do not mislabel observation time or envelope sent as release time.
  result.issuedAt = null;
  const usable = result.items.filter(x => x.value !== null);
  result.status = !usable.length ? 'missing' : usable.some(x => now.getTime() - Date.parse(x.endsAt) <= 30 * 60_000 && Date.parse(x.endsAt) <= now.getTime() + 5 * 60_000) ? 'ready' : 'stale';
  result.message = result.status === 'ready' ? '測站觀測；各站觀測時間不同，不能代表整個集水區。' : result.status === 'stale' ? '目前僅有逾時觀測，請勿當作即時雨量。' : '此區無數值觀測或目前缺測；缺測不是零雨量。';
  return result;
}

export interface QpfGrid { issuedAt: string | null; publishedAt: string | null; nx: number; ny: number; resolution: number; longitude: number; latitude: number; values: (number | null)[]; description: string }
export function parseQpfGrid(data: unknown): QpfGrid {
  const dataset = datasetOf(data);
  const info = field(dataset, 'datasetInfo', 'DatasetInfo');
  const parameters = field(info, 'parameterSet', 'ParameterSet');
  const nx = numeric(field(parameters, 'GridDimensionX'));
  const ny = numeric(field(parameters, 'GridDimensionY'));
  const resolution = numeric(field(parameters, 'GridResolution'));
  const longitude = numeric(field(parameters, 'StartPointLongitude'));
  const latitude = numeric(field(parameters, 'StartPointLatitude'));
  const contents = field(dataset, 'contents', 'Contents');
  const content = text(field(contents, 'content', 'Content'));
  if (!nx || !ny || !resolution || nx < 1 || ny < 1 || resolution <= 0 || longitude === null || latitude === null || !Number.isSafeInteger(nx) || !Number.isSafeInteger(ny) || nx * ny > 1_000_000 || !content) throw new Error('無法辨識官方格點規格');
  const rawValues = content.trim().split(',');
  if (rawValues.length !== nx * ny) throw new Error('官方格點數量與維度不一致');
  const values = rawValues.map(raw => { const value = numeric(raw); return value !== null && value >= 0 ? value : null; });
  return { issuedAt: timestamp(field(parameters, 'DateTime')), publishedAt: timestamp(field(rootOf(data), 'sent', 'Sent')), nx, ny, resolution, longitude, latitude, values, description: text(field(contents, 'contentDescription', 'ContentDescription')) };
}

export function parseQpf(data: unknown, _region: RegionId, fetchedAt: string, now = new Date()): WeatherProduct {
  const grid = parseQpfGrid(data);
  const result = product('qpf', 'QPESUMS・未來一小時雨量', 'qpf', weatherSources.qpf, 'missing', '已取得官方產品；格點座標與有效時間定義仍待核對，暫不提供地點雨量。');
  result.fetchedAt = fetchedAt;
  result.issuedAt = grid.publishedAt;
  // DateTime is retained as the product timestamp. It is not silently interpreted as a forecast start/end.
  result.message += ` 官方產品時間：${grid.issuedAt ?? '未知'}；${grid.nx} × ${grid.ny}，解析度 ${grid.resolution}°。`;
  if (grid.issuedAt && now.getTime() - Date.parse(grid.issuedAt) > 30 * 60_000) { result.status = 'stale'; result.message += ' 產品時間已逾 30 分鐘。'; }
  return result;
}

export function disabledProducts(): WeatherProduct[] {
  return [product('radar', '雷達・過去一小時估計', 'radar', weatherSources.radar, 'disabled', '第一版尚未啟用；雷達估計與測站觀測、未來預報分開。')];
}

export function demoWeather(region: RegionId, now = new Date()): WeatherResponse {
  const base = Date.parse('2026-10-14T06:00:00+08:00');
  const name = region === 'daba' ? '大霸示範點' : '雪山示範點';
  const latitude = region === 'daba' ? 24.465 : 24.383;
  const longitude = region === 'daba' ? 121.254 : 121.231;
  const source = { name: '本機測試資料（非官方發布）', url: '/sources' };
  const mountain = product('mountain', '登山預報操作示範', 'forecast', source, 'demo', '示範資料，非即時、非官方預報；僅供操作測試。');
  mountain.issuedAt = '2026-10-14T05:00:00+08:00'; mountain.fetchedAt = '2026-10-14T05:10:00+08:00';
  for (let i = 0; i < 8; i++) {
    const startsAt = iso(base + i * 3 * 60 * 60_000); const endsAt = iso(base + (i + 1) * 3 * 60 * 60_000);
    mountain.items.push({ id: `demo-pop-${i}`, name, latitude, longitude, metric: 'probability', value: [20,30,60,70,40,30,20,10][i], unit: '%', startsAt, endsAt, description: '示範降雨機率' }, { id: `demo-temp-${i}`, name, latitude, longitude, metric: 'temperature', value: [8,10,12,9,6,5,7,9][i], unit: '°C', startsAt, endsAt: startsAt, description: '示範溫度時間點' });
  }
  Object.assign(mountain, timeBounds(mountain.items));
  const rain = product('rain', '雨量站觀測示範', 'observation', source, 'demo', '示範資料，非即時。包含缺測情境；缺測不補零。');
  rain.fetchedAt = '2026-10-14T06:10:00+08:00';
  rain.items = [{ id: 'demo-rain-1', name: `${name}雨量站`, latitude: latitude + 0.025, longitude: longitude + 0.04, value: 3.5, metric: 'rain', unit: 'mm', startsAt: '2026-10-14T05:00:00+08:00', endsAt: '2026-10-14T06:00:00+08:00' }, { id: 'demo-rain-2', name: '示範缺測站', latitude: latitude - 0.02, longitude: longitude + 0.07, value: null, metric: 'rain', unit: 'mm', startsAt: '2026-10-14T05:00:00+08:00', endsAt: '2026-10-14T06:00:00+08:00', description: '缺測' }];
  Object.assign(rain, timeBounds(rain.items));
  const qpf = product('qpf', '未來一小時雨量操作示範', 'qpf', source, 'demo', '示範資料，非即時；不是實際 QPESUMS 輸出。');
  qpf.issuedAt = '2026-10-14T06:00:00+08:00'; qpf.fetchedAt = '2026-10-14T06:05:00+08:00';
  qpf.items = [{ id: 'demo-qpf', name, latitude, longitude, metric: 'rain', value: 4, unit: 'mm', startsAt: '2026-10-14T06:00:00+08:00', endsAt: '2026-10-14T07:00:00+08:00', description: '示範一小時累積雨量' }];
  Object.assign(qpf, timeBounds(qpf.items));
  return { mode: 'demo', region, fetchedAt: now.toISOString(), products: [mountain, rain, qpf, ...disabledProducts()] };
}

type Fetcher = typeof fetch;
interface CacheEntry { body: unknown; fetchedAt: string; checkedAt: number; etag?: string }
export interface WeatherServiceOptions { apiKey?: string; fetcher?: Fetcher; now?: () => Date; timeoutMs?: number }
export type RequestedWeatherProduct = 'observation' | 'qpf' | 'radar';
const upstreamHosts = new Set(['opendata.cwa.gov.tw', 'cwaopendata.s3.ap-northeast-1.amazonaws.com']);
function allowedUpstream(url: URL) { return url.protocol === 'https:' && upstreamHosts.has(url.hostname) && !url.username && !url.password && (!url.port || url.port === '443'); }
async function readJson(response: Response): Promise<unknown> {
  const limit = 15_000_000;
  if (Number(response.headers.get('content-length')) > limit || !response.body) throw new Error('官方資料超過大小上限或內容為空');
  const reader = response.body.getReader(); const decoder = new TextDecoder(); const chunks: string[] = []; let bytes = 0;
  try {
    while (true) { const {done,value} = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > limit) { await reader.cancel(); throw new Error('官方資料超過大小上限'); } chunks.push(decoder.decode(value,{stream:true})); }
    chunks.push(decoder.decode()); return JSON.parse(chunks.join(''));
  } finally { reader.releaseLock(); }
}
function validateBody(id: string, body: unknown) {
  const root = rootOf(body); const dataset = datasetOf(body);
  const status = field(root, 'Status', 'status'); const returnedId = text(field(root, 'Dataid', 'dataid'));
  if (status !== undefined && status !== 'Actual' || returnedId && returnedId.replace(/^F-/, '') !== id.replace(/^F-/, '')) throw new Error('官方產品識別或狀態不符');
  if (id === 'F-B0046-001') { parseQpfGrid(body); return; }
  if (id === 'O-A0002-001' && field(dataset, 'Station', 'station') === undefined || id === 'F-B0053-035' && field(dataset, 'Locations', 'locations', 'Location', 'location') === undefined) throw new Error('官方產品內容不完整');
}
/** Fixed official hosts only. Browser input can never supply a URL or an authorization value. */
export function createWeatherService(options: WeatherServiceOptions = {}) {
  const fetcher = options.fetcher ?? fetch; const clock = options.now ?? (() => new Date());
  const cache = new Map<string, CacheEntry>(); const pending = new Map<string, Promise<CacheEntry>>();
  async function upstream(id: string, ttl: number): Promise<CacheEntry> {
    const previous = cache.get(id); const time = clock().getTime();
    if (previous && time - previous.checkedAt < ttl) return previous;
    const running = pending.get(id); if (running) return running;
    const request = (async () => {
      const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 8_000);
      try {
        const url = new URL(`https://opendata.cwa.gov.tw/fileapi/v1/opendataapi/${id}`);
        url.searchParams.set('Authorization', options.apiKey ?? ''); url.searchParams.set('format', 'JSON');
        let target = url; let response: Response | undefined;
        for (let redirects = 0; redirects <= 3; redirects++) {
          if (!allowedUpstream(target)) throw new Error('官方資料重新導向來源未核准');
          response = await fetcher(target, { signal: controller.signal, headers: previous?.etag ? { 'If-None-Match': previous.etag } : {}, redirect: 'manual' });
          if (![301,302,303,307,308].includes(response.status)) break;
          const location = response.headers.get('location'); if (!location || redirects === 3) throw new Error('官方資料重新導向異常');
          await response.body?.cancel(); target = new URL(location, target);
        }
        if (!response || response.url && !allowedUpstream(new URL(response.url))) throw new Error('官方資料回應來源未核准');
        if (response.status === 304 && previous) { const entry = { ...previous, checkedAt: time }; cache.set(id, entry); return entry; }
        if (!response.ok) throw new Error('官方資料服務暫時無法使用');
        const body = await readJson(response);
        if (field(body, 'success') === 'false' || field(body, 'success') === false) throw new Error('官方資料授權或格式檢查失敗');
        validateBody(id,body);
        const entry = { body, fetchedAt: clock().toISOString(), checkedAt: time, etag: response.headers.get('etag') ?? undefined }; cache.set(id, entry); return entry;
      } finally { clearTimeout(timeout); }
    })();
    pending.set(id, request); try { return await request; } finally { pending.delete(id); }
  }
  const definitions = [
    { id: 'O-A0002-001', key: 'rain', title: '雨量站・過去一小時', kind: 'observation' as const, ttl: 2 * 60_000, parse: parseRainObservations },
    { id: 'F-B0046-001', key: 'qpf', title: 'QPESUMS・未來一小時雨量', kind: 'qpf' as const, ttl: 5 * 60_000, parse: parseQpf },
  ];
  return {
    async getWeather(region: RegionId, mode: DataMode, requestedProduct?: RequestedWeatherProduct): Promise<WeatherResponse> {
      const now = clock();
      if (mode === 'demo') { const demo = demoWeather(region, now); return { ...demo, products: demo.products.filter(p => p.kind !== 'forecast' && (!requestedProduct || p.kind === requestedProduct || p.status === 'disabled')) }; }
      const products = await Promise.all(definitions.filter(d => !requestedProduct || d.kind === requestedProduct).map(async d => {
        if (!options.apiKey?.trim()) return product(d.key, d.title, d.kind, weatherSources[d.key], 'unconfigured', '尚未設定資料來源。請在伺服器設定氣象署授權碼；未使用示範資料替代。');
        try { const entry = await upstream(d.id, d.ttl); return d.parse(entry.body, region, entry.fetchedAt, clock()); }
        catch {
          const old = cache.get(d.id);
          if (old) { try { const parsed = d.parse(old.body, region, old.fetchedAt, clock()); parsed.status = 'stale'; parsed.message = '官方服務更新失敗；顯示最後成功取得的資料，請核對時間。'; return parsed; } catch { /* Never send upstream error details or credentials to clients. */ } }
          return product(d.key, d.title, d.kind, weatherSources[d.key], 'error', '官方資料取得或解析失敗，稍後再試。沒有以零值或示範資料代替。');
        }
      }));
      return { mode: 'live', region, fetchedAt: clock().toISOString(), products: [...products, ...disabledProducts()] };
    },
  };
}
