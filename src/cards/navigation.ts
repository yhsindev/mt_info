/** Only restore known tool state, never an arbitrary navigation target. */
export function readReturnPath(search: string): string {
  const value = new URLSearchParams(search).get('return');
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  try {
    const url = new URL(value, 'https://mt-info.local');
    if (url.origin !== 'https://mt-info.local' || url.pathname !== '/') return '/';
    const params = new URLSearchParams();
    const layer = url.searchParams.get('layer'), rain = url.searchParams.get('rain');
    if (layer && ['equipment', 'weather', 'basins', 'conditions'].includes(layer)) params.set('layer', layer);
    if (url.searchParams.get('plan') === '1') params.set('plan', '1');
    if (rain && ['cwa-qpf-12h', 'ncdr-mpas'].includes(rain)) params.set('rain', rain);
    return params.size ? `/?${params}` : '/';
  } catch { return '/'; }
}
