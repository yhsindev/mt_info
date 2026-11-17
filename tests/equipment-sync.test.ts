import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compactAedSnapshot, fetchAedSnapshot, getEquipment, getEquipmentRevision } from '../src/data/equipment';
import { createEquipmentStore, equipmentStore } from '../src/data/equipmentStore';
import { createEquipmentSync, equipmentSyncOptionsFromEnv, persistEquipmentVersion } from '../server/equipmentSync';

const firstTime = '2026-10-20T00:00:00.000Z';
const secondTime = '2026-10-21T00:00:00.000Z';
const header = '場所ID,場所名稱,AEDID,AED放置地點,地點LAT,地點LNG\n';
function officialShapeCsv(name = '舊場所') {
  return header + Array.from({ length: 1001 }, (_, index) => `${index},${index === 0 ? '雪霸國家公園武陵遊憩區' : name},${index},一樓,24.3,121.3`).join('\n');
}
const response = (name?: string) => new Response(officialShapeCsv(name), { headers: { 'content-disposition': 'attachment; filename="AED20261021.csv"' } });
let workDir: string;
let runtimeDir: string;
let fallbackFile: string;

beforeEach(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), 'mt-equipment-sync-'));
  runtimeDir = path.join(workDir, 'runtime');
  fallbackFile = path.join(workDir, 'fallback.json');
  const snapshot = await fetchAedSnapshot(vi.fn<typeof fetch>().mockResolvedValue(response()), new Date(firstTime));
  await writeFile(fallbackFile, JSON.stringify(compactAedSnapshot(snapshot)));
});
afterEach(async () => {
  vi.restoreAllMocks(); vi.useRealTimers();
  await rm(workDir, { recursive: true, force: true });
});

describe('原子 AED 版本與熱讀取', () => {
  it('uses one snapshot for response metadata and items even when another process switches the manifest', async () => {
    const oldSnapshot = await fetchAedSnapshot(vi.fn<typeof fetch>().mockResolvedValue(response('第一版')), new Date(firstTime));
    const newSnapshot = await fetchAedSnapshot(vi.fn<typeof fetch>().mockResolvedValue(response('第二版')), new Date(secondTime));
    const oldActive = { revision: 'response-old', storage: 'runtime' as const, snapshot: compactAedSnapshot(oldSnapshot) };
    const newActive = { revision: 'response-new', storage: 'runtime' as const, snapshot: compactAedSnapshot(newSnapshot) };
    const read = vi.spyOn(equipmentStore, 'read').mockReturnValueOnce(oldActive).mockReturnValue(newActive);
    const first = getEquipment();
    expect(read).toHaveBeenCalledTimes(1);
    expect(first.fetchedAt).toBe(firstTime);
    expect(first.items.find(item => item.id === 'mohw-aed-1')?.place).toBe('第一版');
    const next = getEquipment();
    expect(next.fetchedAt).toBe(secondTime);
    expect(next.items.find(item => item.id === 'mohw-aed-1')?.place).toBe('第二版');
  });

  it('activates matching nationwide/regional files, survives restart, and invalidates converted item caches', async () => {
    const store = createEquipmentStore({ runtimeDir, fallbackFile });
    vi.spyOn(equipmentStore, 'read').mockImplementation(store.read);
    const previous = getEquipment();
    const oldRevision = getEquipmentRevision();
    const snapshot = await fetchAedSnapshot(vi.fn<typeof fetch>().mockResolvedValue(response('新場所')), new Date(secondTime));
    const manifest = await persistEquipmentVersion(snapshot, runtimeDir);
    const latest = getEquipment();
    expect(getEquipmentRevision()).toBe(manifest.revision);
    expect(getEquipmentRevision()).not.toBe(oldRevision);
    expect(latest.items).not.toBe(previous.items);
    expect(latest.items.find(item => item.id === 'mohw-aed-1')?.place).toBe('新場所');
    expect(getEquipment().items).toBe(latest.items);
    expect(getEquipment('xueshan').items.every(item => item.regions.includes('xueshan'))).toBe(true);
    expect(latest.items.find(item => item.id === 'mohw-aed-1')?.checkedAt).toBeNull();
    const regional = JSON.parse(await readFile(path.join(runtimeDir, 'versions', manifest.revision, 'regional.json'), 'utf8'));
    expect(regional.fetchedAt).toBe(snapshot.fetchedAt);
    expect(regional.sha256).toBe(snapshot.sha256);
    const restarted = createEquipmentStore({ runtimeDir, fallbackFile });
    expect(restarted.read().revision).toBe(manifest.revision);
    expect(restarted.read().snapshot.fetchedAt).toBe(secondTime);
  });

  it('leaves the active manifest unchanged after validation fails', async () => {
    const snapshot = await fetchAedSnapshot(vi.fn<typeof fetch>().mockResolvedValue(response()), new Date(firstTime));
    await persistEquipmentVersion(snapshot, runtimeDir);
    const manifestBefore = await readFile(path.join(runtimeDir, 'current.json'), 'utf8');
    await expect(persistEquipmentVersion({ ...snapshot, records: [] }, runtimeDir)).rejects.toThrow();
    expect(await readFile(path.join(runtimeDir, 'current.json'), 'utf8')).toBe(manifestBefore);
  });

  it.each(['national.json', 'regional.json'])('uses the prior runtime version when %s is bad, and bundled data for an invalid manifest on restart', async (filename) => {
    const snapshot = await fetchAedSnapshot(vi.fn<typeof fetch>().mockResolvedValue(response()), new Date(firstTime));
    const first = await persistEquipmentVersion(snapshot, runtimeDir);
    const second = await persistEquipmentVersion({ ...snapshot, fetchedAt: secondTime }, runtimeDir);
    await writeFile(path.join(runtimeDir, 'versions', second.revision, filename), '<html>broken</html>');
    expect(createEquipmentStore({ runtimeDir, fallbackFile }).read().revision).toBe(first.revision);
    const live = createEquipmentStore({ runtimeDir, fallbackFile });
    expect(live.read().revision).toBe(first.revision);
    await writeFile(path.join(runtimeDir, 'current.json'), JSON.stringify({ schemaVersion: 1, revision: '../../private', fetchedAt: secondTime, sha256: snapshot.sha256 }));
    expect(live.read().revision).toBe(first.revision);
    expect(createEquipmentStore({ runtimeDir, fallbackFile }).read().storage).toBe('bundled');
  });
});

describe('背景排程、失敗退避與共用鎖', () => {
  it('recovers stale fallback data immediately after damaged runtime files, preserving the truly valid prior version', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(firstTime));
    const first = createEquipmentSync({ runtimeDir, fallbackFile, fetcher: vi.fn<typeof fetch>().mockResolvedValue(response('可用前版')) });
    const firstRevision = (await first.refresh()).revision;
    vi.setSystemTime(new Date(secondTime));
    const second = createEquipmentSync({ runtimeDir, fallbackFile, fetcher: vi.fn<typeof fetch>().mockResolvedValue(response('損壞新版')) });
    const secondRevision = (await second.refresh()).revision;
    await writeFile(path.join(runtimeDir, 'versions', secondRevision, 'regional.json'), 'broken');
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response('修復版'));
    const recovered = createEquipmentSync({ runtimeDir, fallbackFile, fetcher });
    await recovered.start();
    await vi.advanceTimersByTimeAsync(0);
    await recovered.refresh(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const manifest = JSON.parse(await readFile(path.join(runtimeDir, 'current.json'), 'utf8'));
    expect(manifest.previousRevision).toBe(firstRevision);
    expect(manifest.previousRevision).not.toBe(secondRevision);
    recovered.stop();
  });

  it('starts overdue downloads in the background, checks daily, and stops scheduled work', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(secondTime));
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response('更新場所'));
    const sync = createEquipmentSync({ runtimeDir, fallbackFile, fetcher });
    await sync.start();
    await vi.advanceTimersByTimeAsync(0);
    await sync.refresh(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(sync.getStatus().state).toBe('ready');
    expect(sync.getStatus().checkedAt).toBe(secondTime);
    expect(sync.getStatus().publishedAt).toBeNull();
    const restartedFetcher = vi.fn<typeof fetch>().mockResolvedValue(response());
    const restarted = createEquipmentSync({ runtimeDir, fallbackFile, fetcher: restartedFetcher });
    await restarted.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(restartedFetcher).not.toHaveBeenCalled();
    expect(restarted.getStatus().fetchedAt).toBe(secondTime);
    restarted.stop();
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000 - 1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await sync.refresh(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
    sync.stop();
    await vi.advanceTimersByTimeAsync(48 * 60 * 60 * 1000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('preserves last-good data and source timestamps on failed downloads; retry backoff survives restart', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(secondTime));
    const good = createEquipmentSync({ runtimeDir, fallbackFile, fetcher: vi.fn<typeof fetch>().mockResolvedValue(response()) });
    expect((await good.refresh()).outcome).toBe('updated');
    const original = await readFile(path.join(runtimeDir, 'current.json'), 'utf8');
    vi.setSystemTime(Date.now() + 24 * 60 * 60 * 1000);
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('PRIVATE path and upstream error should not appear'));
    const failing = createEquipmentSync({ runtimeDir, fallbackFile, fetcher });
    await failing.start();
    await vi.advanceTimersByTimeAsync(0);
    await failing.refresh(false);
    expect(await readFile(path.join(runtimeDir, 'current.json'), 'utf8')).toBe(original);
    const failed = failing.getStatus();
    expect(failed.state).toBe('error');
    expect(failed.checkedAt).toBe(secondTime);
    expect(failed.fetchedAt).toBe(secondTime);
    expect(failed.message).not.toContain('PRIVATE');
    expect(failed.consecutiveFailures).toBe(1);
    expect(Date.parse(failed.nextCheckAt!) - Date.now()).toBe(5 * 60 * 1000);
    failing.stop();
    const restarted = createEquipmentSync({ runtimeDir, fallbackFile, fetcher });
    await restarted.start();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 - 1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await restarted.refresh(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(restarted.getStatus().consecutiveFailures).toBe(2);
    expect(Date.parse(restarted.getStatus().nextCheckAt!) - Date.now()).toBe(10 * 60 * 1000);
    restarted.stop();
  });

  it('deduplicates overlapping refreshes and prevents a second process from downloading under the same lock', async () => {
    let resolve!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise<Response>(done => { resolve = done; }));
    const first = createEquipmentSync({ runtimeDir, fallbackFile, fetcher });
    const secondFetcher = vi.fn<typeof fetch>().mockResolvedValue(response());
    const second = createEquipmentSync({ runtimeDir, fallbackFile, fetcher: secondFetcher });
    const initial = first.refresh();
    expect(first.refresh()).toBe(initial);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect((await second.refresh()).outcome).toBe('busy');
    expect(secondFetcher).not.toHaveBeenCalled();
    resolve(response());
    expect((await initial).outcome).toBe('updated');
  });

  it('does not download on startup when fresh or disabled, while explicit CLI refresh is still possible', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(firstTime));
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response());
    const fresh = createEquipmentSync({ runtimeDir, fallbackFile, fetcher });
    await fresh.start();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(fetcher).not.toHaveBeenCalled(); fresh.stop();
    const disabled = createEquipmentSync({ runtimeDir, fallbackFile, fetcher, enabled: false });
    await disabled.start();
    await vi.advanceTimersByTimeAsync(48 * 60 * 60 * 1000);
    expect(fetcher).not.toHaveBeenCalled();
    expect(disabled.getStatus().state).toBe('disabled');
    expect((await disabled.refresh()).outcome).toBe('updated');
  });

  it('uses conservative environment defaults and rejects invalid check periods', () => {
    expect(equipmentSyncOptionsFromEnv({})).toEqual({ enabled: true, checkIntervalMs: 24 * 60 * 60 * 1000 });
    expect(equipmentSyncOptionsFromEnv({ AED_AUTO_SYNC: 'false', AED_SYNC_INTERVAL_HOURS: '12' }).enabled).toBe(false);
    expect(() => equipmentSyncOptionsFromEnv({ AED_SYNC_INTERVAL_HOURS: '0' })).toThrow();
    expect(() => equipmentSyncOptionsFromEnv({ AED_AUTO_SYNC: 'anything' })).toThrow();
  });
});
