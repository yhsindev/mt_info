import { useCallback, useEffect, useRef, useState } from 'react';
import { loadEquipment, saveEquipment } from './equipment-cache';
export function useRemote<T>(url: string, cacheKey?: string, refreshMs = 0, enabled = true) {
  const [data, setData] = useState<T | null>(null), [error, setError] = useState(false), [loading, setLoading] = useState(true);
  const [savedAt, setSavedAt] = useState<string | null>(null), [revision, setRevision] = useState(0);
  const previousUrl = useRef(''), hasData = useRef(false);
  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 16000);
    let active = true;
    const sameSource = previousUrl.current === url; previousUrl.current = url;
    if (!sameSource) { hasData.current = false; setData(null); setError(false); setSavedAt(null); }
    setLoading(!hasData.current);
    fetch(url, { signal: controller.signal, cache: 'no-cache' }).then(async response => {
      if (!response.ok) throw new Error('upstream');
      return response.json() as Promise<T>;
    }).then(value => {
      if (!active) return;
      hasData.current = true; setData(value); setError(false); setSavedAt(null);
      if (cacheKey) void saveEquipment(cacheKey, value).catch(() => { /* optional storage must not hide live data */ });
    }).catch(async () => {
      if (!active) return;
      setError(true);
      if (cacheKey) try {
        const cached = await loadEquipment<T>(cacheKey);
        if (active && cached) { hasData.current = true; setData(cached.value); setSavedAt(cached.savedAt); }
      } catch { /* a corrupt cache is never interpreted as empty data */ }
    }).finally(() => { clearTimeout(timer); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [url, cacheKey, revision, enabled]);
  useEffect(() => {
    if (!refreshMs || !enabled) return;
    const refresh = () => { if (navigator.onLine && document.visibilityState === 'visible') setRevision(v => v + 1); };
    const timer = setInterval(refresh, refreshMs);
    document.addEventListener('visibilitychange', refresh); window.addEventListener('online', refresh);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('online', refresh); };
  }, [refreshMs, enabled]);
  const retry = useCallback(() => setRevision(v => v + 1), []);
  const sameSource = previousUrl.current === url;
  return { data: sameSource ? data : null, error: sameSource && error, loading: enabled && !sameSource || loading, savedAt: sameSource ? savedAt : null, retry };
}
export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => { const update = () => setOnline(navigator.onLine); window.addEventListener('online', update); window.addEventListener('offline', update); return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); }; }, []);
  return online;
}

export function useClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = setInterval(update, 60_000);
    document.addEventListener('visibilitychange', update);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, []);
  return now;
}
