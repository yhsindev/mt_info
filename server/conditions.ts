import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { ConditionsResponse, ConditionsSource, OfficialAlert, TrailCondition } from '../src/shared/conditions.js';
import type { SourceInfo } from '../src/shared/types.js';
import { CONDITIONS_FRESHNESS_MS } from '../src/shared/conditions-freshness.js';
import { activeCapMessages, parseCap, type CapMessage } from './cap.js';
import { getTrailLocation } from './trailGeometry.js';

export const CONDITIONS_URLS = {
  trails: 'https://recreation.forest.gov.tw/mis/api/BasicInfo/Trail',
  trailStatus: 'https://recreation.forest.gov.tw/mis/api/OpenStatus/Trail',
  allAlerts: 'https://alerts.ncdr.nat.gov.tw/webapi/RssAtomFeed.ashx',
  activeAlerts: 'https://alerts.ncdr.nat.gov.tw/webapi/RssAtomFeeds.ashx',
} as const;
const TRAIL_SOURCE: SourceInfo = { name: '農業部林業及自然保育署', url: 'https://recreation.forest.gov.tw/Service/OpenData', dataset: '自然步道基本資料／步道路況資訊', license: '政府資料開放平臺資料使用規範（依來源頁）' };
const ALERT_SOURCE: SourceInfo = { name: 'NCDR 災害示警公開資料平台／原發布機關', url: 'https://alerts.ncdr.nat.gov.tw/web/developer/alerts-rss', dataset: '一般訂閱公開 CAP', license: '依 NCDR 及原發布機關使用規範；保留來源' };
const TRAIL_COVERAGE = '僅林業及自然保育署管理步道；路況來源只列有狀況步道。未列入不代表開放、正常或安全。';
const ALERT_COVERAGE = 'NCDR 中央部會免金鑰公開一般訂閱 feed；索引為最新發布時間往回七天，依 CAP 篩選正式生效訊息。不含會員專屬、未公開或索引以外資料，不代表所有災害均已涵蓋。';
const CAP_BYTES = 2_000_000;
const MAX_BYTES = 8_000_000;
const MAX_STATE_BYTES = 24_000_000;
const MAX_HISTORY_BYTES = 16_000_000;
const MAX_CAP_RECORDS = 2_000;
const MAX_TOMBSTONES = 20_000;
const iso = (date: Date) => date.toISOString();
const string = (value: unknown) => typeof value === 'string' ? value : '';
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const array = <T>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
const identity = (m: Pick<CapMessage, 'sender' | 'identifier' | 'sent'>) => `${m.sender},${m.identifier},${m.sent}`;
const validIso = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
const plain = (value: unknown) => string(value).replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/?[a-z][^>]*>/gi, '').replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/g, "'").replace(/&amp;/gi, '&').trim();
function dateOnly(value: unknown): string | null {
  const s = string(value); const parts = /^(\d{4})(\d\d)(\d\d)$/.exec(s);
  if (!parts) return null;
  const date = `${parts[1]}-${parts[2]}-${parts[3]}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
}

/** Only the published production CAP storage is fetched, with no redirects. */
export function isAllowedCapUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'alerts.ncdr.nat.gov.tw' && !url.port && !url.username && !url.password && !url.search && !url.hash && /^\/Capstorage\/[A-Za-z0-9_./%-]+\.cap$/i.test(url.pathname) && !/%(?:2e|2f|5c)/i.test(url.pathname);
  } catch { return false; }
}

export function parseTrailConditions(basic: unknown, status: unknown): { items: TrailCondition[]; catalogCount: number; unmatchedCount: number } {
  if (!Array.isArray(basic) || !basic.length || basic.length > 10_000 || !Array.isArray(status) || status.length > 10_000) throw new Error('步道資料結構不符官方清單');
  const catalog = new Map<string, Record<string, unknown>>();
  for (const item of basic) {
    const row = record(item); const id = string(row.TRAILID);
    if (!id || !string(row.TR_CNAME) || catalog.has(id)) throw new Error('步道目錄缺少或重複識別欄位');
    catalog.set(id, row);
  }
  let unmatchedCount = 0;
  const items = status.map((item): TrailCondition => {
    const row = record(item); const id = string(row.TRAILID); const rawCondition = plain(row.TR_TYP);
    if (!id || !rawCondition || !string(row.TR_CNAME)) throw new Error('路況資料缺少必要欄位');
    const basicRow = catalog.get(id);
    if (!basicRow) unmatchedCount++;
    const rawUrl = string(basicRow?.URL);
    const name = plain(basicRow?.TR_CNAME) || plain(row.TR_CNAME);
    const announcement = [id, rawCondition, plain(row.TITLE), plain(row.CONTENT), string(row.ANN_DATE), plain(row.TR_SUB), string(row.closedate), string(row.opendate)];
    const announcementId = createHash('sha256').update(JSON.stringify(announcement)).digest('hex').slice(0, 20);
    // Reference routes are separate from incident coordinates. Unknown or mismatched trails stay unlocated.
    const location = basicRow ? getTrailLocation(id, name) : undefined;
    let url = TRAIL_SOURCE.url;
    try { const parsed = new URL(rawUrl); if (parsed.protocol === 'https:' && parsed.hostname === 'recreation.forest.gov.tw' && !parsed.username && !parsed.password) url = parsed.href; } catch { /* Keep official catalog link. */ }
    return {
      id: `trail:${id}:${announcementId}`, trailId: id, name, region: plain(basicRow?.TR_POSITION), manager: plain(row.DEP_NAME) || plain(basicRow?.TR_ADMIN),
      condition: rawCondition === '暫停開放' || rawCondition === '封閉' ? 'closed' : rawCondition === '部分封閉' ? 'partial' : rawCondition === '注意' ? 'caution' : 'unknown', rawCondition,
      headline: plain(row.TITLE), description: plain(row.CONTENT), section: plain(row.TR_SUB) || null,
      issuedAt: dateOnly(row.ANN_DATE), updatedAt: null, closureDate: dateOnly(row.closedate), expectedOpeningDate: dateOnly(row.opendate),
      latitude: null, longitude: null, coordinateNote: basicRow ? '官方入口資料為投影 X/Y；座標系統尚未核實，暫不繪製點位。' : '此路況尚未對應至官方步道目錄，座標未知。',
      ...(location ? { location } : {}),
      source: { ...TRAIL_SOURCE, url },
    };
  });
  return { items, catalogCount: catalog.size, unmatchedCount };
}

export interface FeedEntry { url: string; id: string; updated: string; status?: string }
export function parseAlertFeed(xml: string): FeedEntry[] {
  if (xml.length > MAX_BYTES || /<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error('示警訂閱資料不是有效 XML');
  const feed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', removeNSPrefix: true, parseTagValue: false }).parse(xml).feed;
  if (!feed || !string(feed.title) || !string(feed.id)) throw new Error('示警訂閱資料缺少 feed 識別');
  const entries = array<Record<string, unknown>>(feed.entry);
  if (entries.length > 500) throw new Error('示警訂閱筆數超過處理限制');
  return entries.map(item => {
    const row = record(item);
    const links = array<Record<string, unknown>>(row.link as Record<string, unknown> | Record<string, unknown>[] | undefined);
    const link = links.find(link => link['@_rel'] === 'alternate') ?? links.find(link => string(link['@_href']).endsWith('.cap'));
    const url = string(link?.['@_href']); const id = string(row.id); const updated = string(row.updated);
    if (!isAllowedCapUrl(url) || !id || !validIso(updated)) throw new Error('示警訂閱包含未核實連結或識別欄位');
    return { url, id, updated, status: string(row.status) || undefined };
  });
}

interface Health { fetchedAt: string | null; checkedAt: string | null; error: string | null; failures: number; nextAttempt: number; hasData: boolean }
interface TrailState extends Health { basic: unknown[]; statuses: unknown[] }
interface StoredCap { url: string; entryId: string; updated: string; xml: string; message: CapMessage }
interface AlertState extends Health { records: StoredCap[]; superseded: string[]; seen: FeedEntry[] }
const health = (): Health => ({ fetchedAt: null, checkedAt: null, error: null, failures: 0, nextAttempt: 0, hasData: false });
interface CachedDocument { text: string; etag: string | null; modified: string | null; fetchedAt: string }
export interface ConditionsOptions {
  fetcher?: typeof fetch;
  now?: () => Date;
  /** false disables disk persistence, primarily for isolated tests. */
  cacheDir?: string | false;
  timeoutMs?: number;
  trailPollMs?: number;
  alertPollMs?: number;
  trailStaleMs?: number;
  alertStaleMs?: number;
  retryBaseMs?: number;
  /** Cold HTTP reads return a truthful loading snapshot after this budget; refresh continues. */
  coldWaitMs?: number;
  /** Minimum time between NCDR request starts; public feed applies upstream rate limiting. */
  ncdrMinIntervalMs?: number;
}
export interface ConditionsService {
  get(): Promise<ConditionsResponse>;
  refresh(options?: { force?: boolean }): Promise<ConditionsResponse>;
  startPolling(): void;
  stop(): void;
}

export function createConditionsService(options: ConditionsOptions = {}): ConditionsService {
  const fetcher = options.fetcher ?? fetch; const now = options.now ?? (() => new Date());
  const cacheDir = options.cacheDir === false ? null : resolve(options.cacheDir ?? '.cache/conditions');
  const statePath = cacheDir ? join(cacheDir, 'state.json') : null;
  const timeoutMs = options.timeoutMs ?? 12_000;
  const trailPollMs = options.trailPollMs ?? 15 * 60_000;
  const alertPollMs = options.alertPollMs ?? 60_000;
  const trailStaleMs = options.trailStaleMs ?? CONDITIONS_FRESHNESS_MS.trails;
  const alertStaleMs = options.alertStaleMs ?? CONDITIONS_FRESHNESS_MS.alerts;
  const documents = new Map<string, CachedDocument>();
  let trails: TrailState = { ...health(), basic: [], statuses: [] };
  let alerts: AlertState = { ...health(), records: [], superseded: [], seen: [] };
  let loaded: Promise<void> | null = null; let inFlight: Promise<ConditionsResponse> | null = null;
  let timer: ReturnType<typeof setInterval> | null = null; let attempted = false;

  async function load(): Promise<void> {
    if (!statePath) return;
    try {
      if ((await stat(statePath)).size > MAX_STATE_BYTES) throw new Error('快取超過大小限制');
      const saved = JSON.parse(await readFile(statePath, 'utf8'));
      if (saved.version !== 1) throw new Error('不支援的快取版本');
      const restoreHealth = (raw: Record<string, unknown>): Health => ({
        fetchedAt: validIso(raw.fetchedAt) ? raw.fetchedAt : null, checkedAt: validIso(raw.checkedAt) ? raw.checkedAt : null,
        error: typeof raw.error === 'string' ? raw.error : null, failures: Number.isInteger(raw.failures) && Number(raw.failures) >= 0 ? Math.min(Number(raw.failures), 20) : 0,
        nextAttempt: Number.isFinite(raw.nextAttempt) ? Number(raw.nextAttempt) : 0, hasData: raw.hasData === true,
      });
      const t = record(saved.trails); const a = record(saved.alerts);
      trails = { ...trails, ...restoreHealth(t), hasData: false };
      if (t.hasData === true) {
        parseTrailConditions(t.basic, t.statuses);
        const restored = restoreHealth(t); if (!restored.fetchedAt || !restored.checkedAt) throw new Error('步道快取缺少取得時間');
        trails = { ...restored, basic: t.basic as unknown[], statuses: t.statuses as unknown[] };
      }
      if (Array.isArray(a.records) && Array.isArray(a.superseded) && a.records.length <= MAX_CAP_RECORDS && a.superseded.length <= MAX_TOMBSTONES) {
        const records = a.records.map((v: unknown): StoredCap => {
          const r = record(v); if (!isAllowedCapUrl(string(r.url)) || !validIso(r.updated) || !string(r.entryId)) throw new Error('示警快取連結無效');
          return { url: string(r.url), xml: string(r.xml), entryId: string(r.entryId), updated: string(r.updated), message: parseCap(string(r.xml)) };
        });
        if (a.superseded.some((v: unknown) => typeof v !== 'string' || v.length > 2_000)) throw new Error('示警快取 reference 無效');
        const restored = restoreHealth(a); if (restored.hasData && (!restored.fetchedAt || !restored.checkedAt)) throw new Error('示警快取缺少取得時間');
        const seen = Array.isArray(a.seen) && a.seen.length <= 1_000 ? a.seen.filter((v: unknown) => { const r = record(v); return isAllowedCapUrl(string(r.url)) && !!string(r.id) && validIso(r.updated); }) as FeedEntry[] : [];
        alerts = { ...restored, records, superseded: a.superseded as string[], seen };
      }
    } catch (error) {
      if (record(error).code !== 'ENOENT') { trails.error = '本機來源快取無法完整讀取，將重新查詢官方來源。'; alerts.error = trails.error; }
    }
  }
  const ensureLoaded = () => loaded ??= load();

  async function save(): Promise<void> {
    if (!cacheDir || !statePath) return;
    const body = JSON.stringify({ version: 1, trails, alerts: { ...alerts, records: alerts.records.map(({ message: _message, ...rest }) => rest) } });
    if (Buffer.byteLength(body) > MAX_STATE_BYTES) throw new Error('快取超過大小限制');
    await mkdir(cacheDir, { recursive: true });
    const temporary = join(cacheDir, `state.${randomUUID()}.tmp`);
    await writeFile(temporary, body, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, statePath);
  }

  let ncdrGate = Promise.resolve(); let nextNcdrStart = 0; let ncdrBlockedUntil = 0;
  async function throttleNcdr(url: string): Promise<void> {
    if (new URL(url).hostname !== 'alerts.ncdr.nat.gov.tw') return;
    const turn = ncdrGate.then(async () => {
      if (now().getTime() < ncdrBlockedUntil) throw new SourceError('官方示警來源暫時限流，稍後重新查核', ncdrBlockedUntil);
      const wait = nextNcdrStart - Date.now();
      if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
      if (now().getTime() < ncdrBlockedUntil) throw new SourceError('官方示警來源暫時限流，稍後重新查核', ncdrBlockedUntil);
      nextNcdrStart = Date.now() + (options.ncdrMinIntervalMs ?? 1_500);
    });
    ncdrGate = turn.catch(() => {}); await turn;
  }
  class SourceError extends Error { constructor(message: string, readonly retryAt = 0) { super(message); } }
  async function fetchDocument(url: string, maxBytes = MAX_BYTES): Promise<{ text: string; changed: boolean; fetchedAt: string }> {
    if (!Object.values(CONDITIONS_URLS).includes(url as never) && !isAllowedCapUrl(url)) throw new Error('未核實的官方來源網址');
    await throttleNcdr(url);
    const previous = documents.get(url); const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = { Accept: url.endsWith('.cap') || url.includes('RssAtom') ? 'application/xml, text/xml' : 'application/json' };
      if (previous?.etag) headers['If-None-Match'] = previous.etag;
      if (previous?.modified) headers['If-Modified-Since'] = previous.modified;
      const response = await fetcher(url, { signal: controller.signal, headers, redirect: 'manual' });
      if (response.status === 304 && previous) return { text: previous.text, changed: false, fetchedAt: previous.fetchedAt };
      if (!response.ok) {
        const retryAfter = response.headers.get('retry-after');
        const retryAt = retryAfter ? /^\d+$/.test(retryAfter) ? now().getTime() + Number(retryAfter) * 1_000 : Date.parse(retryAfter) : response.status === 429 ? now().getTime() + 30_000 : 0;
        if (new URL(url).hostname === 'alerts.ncdr.nat.gov.tw' && Number.isFinite(retryAt) && retryAt > now().getTime()) ncdrBlockedUntil = Math.max(ncdrBlockedUntil, retryAt);
        await response.body?.cancel();
        throw new SourceError(response.status >= 300 && response.status < 400 ? '官方來源要求未核實的重新導向' : `官方來源回應 HTTP ${response.status}`, Number.isFinite(retryAt) ? retryAt : 0);
      }
      if (Number(response.headers.get('content-length')) > maxBytes) { await response.body?.cancel(); throw new Error('官方資料超過大小限制'); }
      if (!response.body) throw new Error('官方資料缺少本文');
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let bytes = 0; let text = '';
      for (;;) {
        const chunk = await reader.read(); if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > maxBytes) { await reader.cancel(); throw new Error('官方資料超過大小限制'); }
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
      const fetchedAt = iso(now());
      documents.set(url, { text, fetchedAt, etag: response.headers.get('etag'), modified: response.headers.get('last-modified') });
      // Only fixed feed documents and currently discovered CAPs are held; expired CAP bodies live in the validated state.
      if (documents.size > 600) for (const key of documents.keys()) { if (isAllowedCapUrl(key)) { documents.delete(key); if (documents.size <= 500) break; } }
      let cachedBytes = [...documents.values()].reduce((total, document) => total + Buffer.byteLength(document.text), 0);
      if (cachedBytes > MAX_STATE_BYTES) for (const [key, document] of documents) {
        if (key !== url) { documents.delete(key); cachedBytes -= Buffer.byteLength(document.text); if (cachedBytes <= MAX_STATE_BYTES) break; }
      }
      return { text, changed: !previous || previous.text !== text, fetchedAt };
    } catch (error) {
      if (controller.signal.aborted) throw new Error('官方來源連線逾時');
      // Never expose fetch error internals, redirect targets, or request headers.
      if (error instanceof Error && /^(官方|未核實)/.test(error.message)) throw error;
      throw new Error('官方來源連線或資料讀取失敗');
    } finally { clearTimeout(timeout); }
  }
  function failure<T extends Health>(state: T, error: unknown, blockedUntil = 0): T {
    const failures = state.failures + 1;
    return { ...state, error: error instanceof Error ? error.message : '官方來源無法取得', failures, nextAttempt: Math.max(blockedUntil, error instanceof SourceError ? error.retryAt : 0, now().getTime() + Math.min(10 * 60_000, (options.retryBaseMs ?? 30_000) * 2 ** Math.min(failures - 1, 10))) };
  }
  const due = (state: Health, interval: number, force: boolean) => now().getTime() >= state.nextAttempt && (force || !state.checkedAt || now().getTime() - Date.parse(state.checkedAt) >= interval || !!state.error);
  async function refreshTrails(): Promise<void> {
    try {
      const [basic, status] = await Promise.all([fetchDocument(CONDITIONS_URLS.trails), fetchDocument(CONDITIONS_URLS.trailStatus)]);
      const b = JSON.parse(basic.text); const s = JSON.parse(status.text); parseTrailConditions(b, s);
      trails = { ...health(), hasData: true, basic: b, statuses: s, fetchedAt: basic.changed || status.changed || !trails.fetchedAt ? iso(now()) : trails.fetchedAt, checkedAt: iso(now()) };
    } catch (error) { trails = failure(trails, error instanceof SyntaxError ? new Error('官方步道 JSON 格式無效') : error); }
  }
  async function refreshAlerts(): Promise<void> {
    // Work in a new map; retain valid lifecycle messages even when a later CAP download fails.
    const records = new Map(alerts.records.map(item => [identity(item.message), item]));
    try {
      // The general subscription includes lifecycle messages. A second feed query can trigger
      // upstream 429, so one shared poll reads this documented public index only.
      const all = await fetchDocument(CONDITIONS_URLS.allAlerts);
      const entries = new Map(parseAlertFeed(all.text).map(entry => [entry.url, entry]));
      if (entries.size > 500) throw new Error('示警訂閱合計筆數超過處理限制');
      const existing = new Map(alerts.records.map(item => [item.url, item]));
      const seen = new Map(alerts.seen.map(item => [item.url, item]));
      const queue = [...entries.values()]; let cursor = 0; let firstError: unknown = null; let changed = !alerts.hasData;
      let historyBytes = [...records.values()].reduce((total, item) => total + Buffer.byteLength(item.xml), 0);
      await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
        for (;;) {
          if (firstError) return;
          const index = cursor++; if (index >= queue.length) return;
          const entry = queue[index]; const old = existing.get(entry.url);
          if (entry.status && entry.status !== 'Actual') { seen.set(entry.url, entry); continue; }
          const oldSeen = seen.get(entry.url);
          if (oldSeen?.id === entry.id && oldSeen.updated === entry.updated) continue;
          if (old?.entryId === entry.id && old.updated === entry.updated) continue;
          try {
            const downloaded = await fetchDocument(entry.url, CAP_BYTES); const message = parseCap(downloaded.text);
            seen.set(entry.url, entry);
            // Test, Exercise, private and unknown scopes never enter the public lifecycle.
            if (message.status !== 'Actual' || message.scope !== 'Public') continue;
            if (!['Alert', 'Update', 'Cancel'].includes(message.msgType)) continue;
            const priorBytes = Buffer.byteLength(records.get(identity(message))?.xml ?? '');
            const bytes = Buffer.byteLength(downloaded.text);
            if (historyBytes - priorBytes + bytes > MAX_HISTORY_BYTES) { seen.delete(entry.url); throw new Error('示警歷程超過本文容量限制，保留上次有效資料'); }
            records.set(identity(message), { ...entry, entryId: entry.id, xml: downloaded.text, message }); changed = true;
            historyBytes += bytes - priorBytes;
          } catch (error) { firstError ??= error; }
        }
      }));
      const superseded = new Set(alerts.superseded); const current = now().getTime();
      for (const item of records.values()) if (Date.parse(item.message.sent) <= current && ['Update', 'Cancel'].includes(item.message.msgType)) for (const reference of item.message.references) superseded.add(reference);
      // Tombstones survive feed window changes and disk restarts. Expired bodies may be discarded safely.
      for (const [key, item] of records) {
        const message = item.message;
        if (superseded.has(key) || (Date.parse(message.sent) <= current && (message.msgType === 'Cancel' || (message.info.length > 0 && message.info.every(info => info.expires !== null && Date.parse(info.expires) <= current))))) records.delete(key);
      }
      if (records.size > MAX_CAP_RECORDS || superseded.size > MAX_TOMBSTONES) throw new Error('示警歷程超過保存限制，需管理員檢查；不捨棄取消紀錄');
      alerts = { ...alerts, records: [...records.values()], superseded: [...superseded], seen: [...seen.values()].filter(item => entries.has(item.url)) };
      if (firstError) throw firstError;
      alerts = { ...alerts, ...health(), hasData: true, fetchedAt: changed || !alerts.fetchedAt ? iso(now()) : alerts.fetchedAt, checkedAt: iso(now()) };
    } catch (error) { alerts = failure(alerts, error, ncdrBlockedUntil); }
  }

  function sourceState<T>(state: Health, items: T[], staleMs: number, source: SourceInfo, coverage: string): ConditionsSource<T> {
    const stale = state.checkedAt !== null && now().getTime() - Date.parse(state.checkedAt) > staleMs;
    const status = !state.hasData ? state.error ? 'error' : 'missing' : state.error || stale ? 'stale' : items.length ? 'ready' : 'empty';
    const message = status === 'missing' ? '尚未完成官方來源查詢。' : status === 'error' ? '官方來源取得失敗，尚無可用快取。' : status === 'stale' ? '官方來源暫時無法更新或超過我方查核期限，顯示上次成功取得資料。' : items.length ? '已取得官方公開資料；請依原發布單位訊息判讀。' : source === TRAIL_SOURCE ? '本次來源未列出異常路況；未列入不代表正常、開放或安全。' : '本次來源中沒有符合正式、生效且時間完整條件的示警。';
    return { status, source, coverage, fetchedAt: state.fetchedAt, checkedAt: state.checkedAt, error: state.error, message, items };
  }
  function snapshot(): ConditionsResponse {
    const current = now();
    const trailData = trails.hasData ? parseTrailConditions(trails.basic, trails.statuses) : { items: [], catalogCount: 0, unmatchedCount: 0 };
    const superseded = new Set(alerts.superseded);
    const candidates = alerts.records.filter(item => !superseded.has(identity(item.message)));
    const urls = new Map(candidates.map(item => [identity(item.message), item.url]));
    const originalInfo = new Map(candidates.map(item => [identity(item.message), item.message.info]));
    const live = activeCapMessages(candidates.map(item => item.message), current);
    const unknownTimeCount = candidates.filter(item => item.message.status === 'Actual' && item.message.scope === 'Public' && item.message.msgType !== 'Cancel' && Date.parse(item.message.sent) <= current.getTime()).reduce((count, item) => count + item.message.info.filter(info => !info.effective || !info.expires).length, 0);
    const items = live.flatMap(message => message.info.flatMap((info, index): OfficialAlert[] => {
      // Unlike CAP's optional effective default, this product requires the original explicit interval.
      if (!info.effective || !info.expires || Date.parse(info.expires) <= Date.parse(info.effective)) return [];
      const originalIndex = originalInfo.get(identity(message))?.indexOf(info) ?? index;
      return [{ id: `cap:${identity(message)}:${originalIndex}`, identifier: message.identifier, publisher: plain(info.senderName) || message.sender, sender: message.sender, headline: plain(info.headline), description: plain(info.description), instruction: plain(info.instruction), event: plain(info.event), severity: plain(info.severity), areas: info.areas.map(plain), issuedAt: message.sent, effectiveAt: info.effective, expiresAt: info.expires, polygons: info.polygons ?? [], source: { ...ALERT_SOURCE, name: plain(info.senderName) || ALERT_SOURCE.name, url: urls.get(identity(message)) ?? ALERT_SOURCE.url } }];
    })).sort((a, b) => Date.parse(b.issuedAt) - Date.parse(a.issuedAt));
    return { generatedAt: iso(current), trails: { ...sourceState(trails, trailData.items, trailStaleMs, TRAIL_SOURCE, TRAIL_COVERAGE), catalogCount: trailData.catalogCount, unmatchedCount: trailData.unmatchedCount }, alerts: { ...sourceState(alerts, items, alertStaleMs, ALERT_SOURCE, ALERT_COVERAGE), unknownTimeCount } };
  }
  async function refresh(refreshOptions: { force?: boolean } = {}): Promise<ConditionsResponse> {
    await ensureLoaded();
    if (inFlight) return inFlight;
    attempted = true;
    inFlight = (async () => {
      const work: Promise<void>[] = [];
      if (due(trails, trailPollMs, !!refreshOptions.force)) work.push(refreshTrails());
      if (due(alerts, alertPollMs, !!refreshOptions.force)) work.push(refreshAlerts());
      if (work.length) {
        await Promise.all(work);
        try { await save(); } catch { /* Keep last-good memory; persistence failure is visible without changing source validation time. */ trails.error ??= '本機快取寫入失敗；重啟後可能需要重新下載。'; alerts.error ??= '本機快取寫入失敗；重啟後可能需要重新下載。'; }
      }
      return snapshot();
    })();
    try { return await inFlight; } finally { inFlight = null; }
  }
  return {
    async get() {
      await ensureLoaded();
      if ((!attempted || inFlight) && !trails.hasData && !alerts.hasData) {
        const pending = refresh();
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try { return await Promise.race([pending, new Promise<ConditionsResponse>(resolve => { timeout = setTimeout(() => resolve(snapshot()), options.coldWaitMs ?? 1_500); })]); }
        finally { if (timeout) clearTimeout(timeout); }
      }
      // A request only reads the shared snapshot. Background polling owns updates.
      return snapshot();
    },
    refresh,
    startPolling() { if (timer) return; void refresh(); timer = setInterval(() => { void refresh(); }, Math.max(1_000, Math.min(trailPollMs, alertPollMs))); timer.unref(); },
    stop() { if (timer) clearInterval(timer); timer = null; },
  };
}
