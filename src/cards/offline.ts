export type CardsOfflineStatus = 'development' | 'unsupported' | 'installing' | 'ready' | 'failed';

export function registerCardsOffline(onStatus: (status: CardsOfflineStatus) => void): () => void {
  if (!import.meta.env.PROD) { onStatus('development'); return () => {}; }
  if (!('serviceWorker' in navigator)) { onStatus('unsupported'); return () => {}; }

  let disposed = false;
  let registration: ServiceWorkerRegistration | null = null;
  let trackedWorker: ServiceWorker | null = null;
  const report = (status: CardsOfflineStatus) => { if (!disposed) onStatus(status); };
  const onStateChange = () => {
    if (trackedWorker?.state === 'activated') report('ready');
    else if (trackedWorker?.state === 'redundant' && !registration?.active) report('failed');
  };
  const track = (worker: ServiceWorker | null) => {
    trackedWorker?.removeEventListener('statechange', onStateChange);
    trackedWorker = worker;
    worker?.addEventListener('statechange', onStateChange);
    onStateChange();
  };
  const onUpdateFound = () => track(registration?.installing ?? null);
  const onControllerChange = () => {
    if (navigator.serviceWorker.controller?.scriptURL.endsWith('/cards-sw.js')) report('ready');
  };

  report('installing');
  navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
  void navigator.serviceWorker.register('/cards-sw.js', { scope: '/cards.html', updateViaCache: 'none' }).then(value => {
    if (disposed) return;
    registration = value;
    value.addEventListener('updatefound', onUpdateFound);
    if (value.active) report('ready');
    else track(value.installing ?? value.waiting);
    void navigator.serviceWorker.ready.then(ready => {
      if (ready.scope === value.scope && ready.active) report('ready');
    });
  }).catch(() => report('failed'));

  return () => {
    disposed = true;
    navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    registration?.removeEventListener('updatefound', onUpdateFound);
    trackedWorker?.removeEventListener('statechange', onStateChange);
  };
}
