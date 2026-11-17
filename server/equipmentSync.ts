import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { compactAedSnapshot, fetchAedSnapshot, regionalAedSnapshot, type AedDownload } from '../src/data/equipment';
import { createEquipmentStore, DEFAULT_EQUIPMENT_RUNTIME_DIR, validEquipmentRevision, validateCompactAedSnapshot, validateRegionalAedSnapshot, type EquipmentManifest } from '../src/data/equipmentStore';

export const EQUIPMENT_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const EQUIPMENT_RETRY_BASE_MS = 5 * 60 * 1000;
const LOCK_LEASE_MS = 10 * 60 * 1000;
const STATUS_MESSAGE = 'AED 官方資料更新失敗，保留最近一次驗證成功的資料，稍後重試。';
interface StoredSyncStatus {
  schemaVersion: 1; checkedAt: string | null; lastAttemptAt: string | null;
  lastSuccessAt: string | null; nextCheckAt: string | null; consecutiveFailures: number;
  sourceStatus: 'ready' | 'error';
}
export interface EquipmentSyncStatus {
  state: 'idle' | 'refreshing' | 'ready' | 'error' | 'disabled';
  revision: string; fetchedAt: string; publishedAt: string | null;
  /** Source download validation time; never an equipment inspection time. */
  checkedAt: string | null; lastAttemptAt: string | null; lastSuccessAt: string | null;
  nextCheckAt: string | null; consecutiveFailures: number; message: string | null;
}
export interface EquipmentSyncOptions {
  runtimeDir?: string; fallbackFile?: string; enabled?: boolean;
  checkIntervalMs?: number; retryBaseMs?: number; now?: () => number;
  fetcher?: typeof fetch;
}
export interface EquipmentSyncResult { outcome: 'updated' | 'busy' | 'skipped' | 'failed'; revision: string }

function positiveNumber(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  if (value === undefined || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) throw new Error('AED 同步週期設定無效。');
  return number;
}

/** Environment is server-only. Undefined values retain the safe daily defaults. */
export function equipmentSyncOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): EquipmentSyncOptions {
  if (env.AED_AUTO_SYNC !== undefined && !['', 'true', 'false'].includes(env.AED_AUTO_SYNC)) throw new Error('AED_AUTO_SYNC 需為 true 或 false。');
  return {
    enabled: env.AED_AUTO_SYNC !== 'false',
    checkIntervalMs: positiveNumber(env.AED_SYNC_INTERVAL_HOURS, 24, 1, 168) * 60 * 60 * 1000,
  };
}

async function atomicJson(target: string, value: unknown) {
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, target);
  } finally { await rm(temporary, { force: true }); }
}

/** Both validated outputs become visible together through one manifest rename. */
export async function persistEquipmentVersion(snapshot: AedDownload, runtimeDir = DEFAULT_EQUIPMENT_RUNTIME_DIR): Promise<EquipmentManifest> {
  const national = compactAedSnapshot(snapshot);
  validateCompactAedSnapshot(national);
  const regional = regionalAedSnapshot(snapshot);
  if (!regional.records.length || regional.records.length !== snapshot.regionalRows) throw new Error('AED 區域版本資料不一致。');
  const revision = `${snapshot.fetchedAt.replace(/\D/g, '')}-${snapshot.sha256.slice(0, 12)}-${randomUUID().slice(0, 8)}`;
  if (!validEquipmentRevision(revision)) throw new Error('AED 版本時間格式無效。');
  const versionDir = path.join(runtimeDir, 'versions', revision);
  await mkdir(versionDir, { recursive: true });
  let previousRevision: string | undefined;
  try {
    const active = createEquipmentStore({ runtimeDir }).read();
    if (active.storage === 'runtime') previousRevision = active.revision;
  } catch { /* First successful sync, or no readable previous runtime version. */ }
  const manifest: EquipmentManifest = { schemaVersion: 1, revision, previousRevision, fetchedAt: snapshot.fetchedAt, sha256: snapshot.sha256 };
  try {
    await Promise.all([
      writeFile(path.join(versionDir, 'national.json'), `${JSON.stringify(national)}\n`, { encoding: 'utf8', mode: 0o600 }),
      writeFile(path.join(versionDir, 'regional.json'), `${JSON.stringify(regional)}\n`, { encoding: 'utf8', mode: 0o600 }),
    ]);
    // Read back finished files before the manifest points to this immutable version.
    validateCompactAedSnapshot(JSON.parse(await readFile(path.join(versionDir, 'national.json'), 'utf8')));
    validateRegionalAedSnapshot(JSON.parse(await readFile(path.join(versionDir, 'regional.json'), 'utf8')), national);
    await atomicJson(path.join(runtimeDir, 'current.json'), manifest);
  } catch (error) {
    await rm(versionDir, { recursive: true, force: true });
    throw error;
  }
  // Keep the active and immediately previous last-good version; failed cleanup
  // cannot turn a successful activation into a reported failure.
  try {
    for (const entry of await readdir(path.join(runtimeDir, 'versions'), { withFileTypes: true })) {
      if (entry.isDirectory() && validEquipmentRevision(entry.name) && entry.name !== revision && entry.name !== previousRevision) {
        await rm(path.join(runtimeDir, 'versions', entry.name), { recursive: true, force: true });
      }
    }
  } catch { /* Retry retention cleanup on the next successful refresh. */ }
  return manifest;
}

async function readStatus(runtimeDir: string): Promise<StoredSyncStatus | null> {
  try {
    const status = JSON.parse(await readFile(path.join(runtimeDir, 'sync-status.json'), 'utf8')) as StoredSyncStatus;
    const dates = [status.checkedAt, status.lastAttemptAt, status.lastSuccessAt, status.nextCheckAt];
    if (status.schemaVersion !== 1 || !dates.every(value => value === null || typeof value === 'string' && Number.isFinite(Date.parse(value)))
      || !Number.isSafeInteger(status.consecutiveFailures) || status.consecutiveFailures < 0
      || !['ready', 'error'].includes(status.sourceStatus)) return null;
    return status;
  } catch { return null; }
}

async function acquireLock(runtimeDir: string, now: number): Promise<(() => Promise<void>) | null> {
  await mkdir(runtimeDir, { recursive: true });
  const lockFile = path.join(runtimeDir, '.sync.lock');
  const token = randomUUID();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(lockFile, 'wx', 0o600);
      try { await handle.writeFile(JSON.stringify({ pid: process.pid, token, expiresAt: now + LOCK_LEASE_MS })); }
      finally { await handle.close(); }
      return async () => {
        try {
          const current = JSON.parse(await readFile(lockFile, 'utf8')) as { token?: string };
          if (current.token === token) await rm(lockFile, { force: true });
        } catch { /* The lease was already cleared. */ }
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      try {
        const lock = JSON.parse(await readFile(lockFile, 'utf8')) as { pid?: number; expiresAt?: number };
        let processAlive = true;
        if (Number.isSafeInteger(lock.pid) && lock.pid! > 0) {
          try { process.kill(lock.pid!, 0); } catch (error) { processAlive = (error as NodeJS.ErrnoException).code !== 'ESRCH'; }
        }
        if (processAlive && typeof lock.expiresAt === 'number' && lock.expiresAt > now) return null;
        await rm(lockFile, { force: true });
      } catch {
        // Do not unlink a possibly half-written lock owned by another process.
        try { if (now - (await stat(lockFile)).mtimeMs >= LOCK_LEASE_MS) { await rm(lockFile, { force: true }); continue; } } catch { /* Retry next time. */ }
        return null;
      }
    }
  }
  return null;
}

export function createEquipmentSync(options: EquipmentSyncOptions = {}) {
  const runtimeDir = options.runtimeDir ?? DEFAULT_EQUIPMENT_RUNTIME_DIR;
  const store = createEquipmentStore({ runtimeDir, fallbackFile: options.fallbackFile });
  const now = options.now ?? Date.now;
  const interval = options.checkIntervalMs ?? EQUIPMENT_CHECK_INTERVAL_MS;
  const retryBase = options.retryBaseMs ?? EQUIPMENT_RETRY_BASE_MS;
  if (!(interval > 0) || !(retryBase > 0)) throw new Error('AED 同步週期設定無效。');
  const enabled = options.enabled !== false;
  let stored: StoredSyncStatus | null = null;
  let inFlight: Promise<EquipmentSyncResult> | undefined;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let nextWakeAt: number | undefined;
  let initialization: Promise<void> | undefined;
  let currentAttemptAt: string | null = null;
  async function initialize() { stored = await readStatus(runtimeDir); }
  function ensureInitialized() { return initialization ??= initialize(); }
  function dueAt(): number {
    const active = store.read();
    // After CLI success the manifest is authoritative even if this process still
    // holds older retry metadata in memory or the status write was interrupted.
    const lastFetch = Date.parse(active.snapshot.fetchedAt);
    const lastAttempt = stored?.lastAttemptAt ? Date.parse(stored.lastAttemptAt) : -Infinity;
    // If startup fell back because runtime files were damaged, an old success
    // status must not postpone recovery of the actually served stale snapshot.
    if (stored?.sourceStatus === 'ready' && stored.lastSuccessAt !== active.snapshot.fetchedAt) return lastFetch + interval;
    if (lastFetch > lastAttempt) return lastFetch + interval;
    return stored?.nextCheckAt ? Date.parse(stored.nextCheckAt) : lastFetch + interval;
  }
  function getStatus(): EquipmentSyncStatus {
    const active = store.read();
    const newest = stored && Math.max(Date.parse(stored.lastAttemptAt ?? '') || -Infinity, Date.parse(stored.lastSuccessAt ?? '') || -Infinity) >= Date.parse(active.snapshot.fetchedAt);
    const status = newest ? stored : null;
    return {
      state: !enabled ? 'disabled' : inFlight ? 'refreshing' : status?.sourceStatus ?? (active.storage === 'runtime' ? 'ready' : 'idle'),
      revision: active.revision, fetchedAt: active.snapshot.fetchedAt, publishedAt: active.snapshot.publishedAt,
      checkedAt: status?.checkedAt ?? (active.storage === 'runtime' ? active.snapshot.fetchedAt : null),
      lastAttemptAt: currentAttemptAt ?? status?.lastAttemptAt ?? null, lastSuccessAt: status?.lastSuccessAt ?? (active.storage === 'runtime' ? active.snapshot.fetchedAt : null),
      nextCheckAt: enabled ? new Date(nextWakeAt ?? dueAt()).toISOString() : null,
      consecutiveFailures: status?.consecutiveFailures ?? 0, message: status?.sourceStatus === 'error' ? STATUS_MESSAGE : null,
    };
  }
  function schedule(delay: number) {
    if (!running) return;
    if (timer) clearTimeout(timer);
    nextWakeAt = now() + Math.max(0, delay);
    timer = setTimeout(() => { timer = undefined; nextWakeAt = undefined; void refresh(false); }, Math.max(0, delay));
    timer.unref?.();
  }
  async function perform(force: boolean): Promise<EquipmentSyncResult> {
    await ensureInitialized();
    stored = await readStatus(runtimeDir) ?? stored;
    if (!force && now() < dueAt()) {
      schedule(dueAt() - now());
      return { outcome: 'skipped', revision: store.read().revision };
    }
    const release = await acquireLock(runtimeDir, now());
    if (!release) {
      schedule(Math.min(retryBase, interval));
      return { outcome: 'busy', revision: store.read().revision };
    }
    try {
      // A second process may have finished between our first due check and lock.
      stored = await readStatus(runtimeDir) ?? stored;
      if (!force && now() < dueAt()) return { outcome: 'skipped', revision: store.read().revision };
      const attemptAt = new Date(now()).toISOString();
      currentAttemptAt = attemptAt;
      const previous = stored;
      try {
        const snapshot = await fetchAedSnapshot(options.fetcher ?? fetch);
        snapshot.fetchedAt = new Date(now()).toISOString();
        const manifest = await persistEquipmentVersion(snapshot, runtimeDir);
        stored = {
          schemaVersion: 1, checkedAt: snapshot.fetchedAt, lastAttemptAt: attemptAt,
          lastSuccessAt: snapshot.fetchedAt, nextCheckAt: new Date(now() + interval).toISOString(),
          consecutiveFailures: 0, sourceStatus: 'ready',
        };
        // A status persistence failure must not undo or mislabel an activated version.
        try { await atomicJson(path.join(runtimeDir, 'sync-status.json'), stored); } catch { /* Manifest still records successful activation. */ }
        return { outcome: 'updated', revision: manifest.revision };
      } catch {
        const failures = (previous?.consecutiveFailures ?? 0) + 1;
        const delay = Math.min(interval, retryBase * 2 ** Math.min(failures - 1, 20));
        stored = {
          schemaVersion: 1, checkedAt: previous?.checkedAt ?? null, lastAttemptAt: attemptAt,
          lastSuccessAt: previous?.lastSuccessAt ?? null, nextCheckAt: new Date(now() + delay).toISOString(),
          consecutiveFailures: failures, sourceStatus: 'error',
        };
        try { await atomicJson(path.join(runtimeDir, 'sync-status.json'), stored); } catch { /* Keep the in-memory retry state. */ }
        return { outcome: 'failed', revision: store.read().revision };
      }
    } finally {
      await release();
      schedule(dueAt() - now());
    }
  }
  function refresh(force = true): Promise<EquipmentSyncResult> {
    if (inFlight) return inFlight;
    // All failures are represented by safe status metadata, never upstream text.
    inFlight = perform(force).catch(async () => {
      const attemptAt = currentAttemptAt ?? new Date(now()).toISOString();
      const failures = (stored?.consecutiveFailures ?? 0) + 1;
      const delay = Math.min(interval, retryBase * 2 ** Math.min(failures - 1, 20));
      stored = {
        schemaVersion: 1, checkedAt: stored?.checkedAt ?? null, lastAttemptAt: attemptAt,
        lastSuccessAt: stored?.lastSuccessAt ?? null, nextCheckAt: new Date(now() + delay).toISOString(),
        consecutiveFailures: failures, sourceStatus: 'error',
      };
      try { await atomicJson(path.join(runtimeDir, 'sync-status.json'), stored); } catch { /* The runtime directory may be unwritable. */ }
      schedule(delay);
      return { outcome: 'failed' as const, revision: store.read().revision };
    }).finally(() => { inFlight = undefined; currentAttemptAt = null; });
    return inFlight;
  }
  function start() {
    if (running || !enabled) return;
    running = true;
    return ensureInitialized().then(() => { if (running) schedule(dueAt() - now()); });
  }
  function stop() { running = false; if (timer) clearTimeout(timer); timer = undefined; nextWakeAt = undefined; }
  return { start, stop, refresh, getStatus };
}
