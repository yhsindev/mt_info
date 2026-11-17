import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = path.join(root, 'dist');
const manifest = JSON.parse(await readFile(path.join(dist, '.vite', 'manifest.json'), 'utf8'));
const entry = manifest['cards.html'];
if (!entry?.isEntry) throw new Error('Cannot find the cards.html entry in the Vite manifest.');

const files = new Set(['cards.html', 'brand/mt-info-favicon.svg', 'brand/mt-info-symbol-reverse.svg']);
const visited = new Set();
function addChunk(key) {
  if (visited.has(key)) return;
  const chunk = manifest[key];
  if (!chunk) throw new Error(`Missing Vite manifest chunk: ${key}`);
  visited.add(key);
  if (chunk.file) files.add(chunk.file);
  for (const file of [...(chunk.css ?? []), ...(chunk.assets ?? [])]) files.add(file);
  for (const imported of [...(chunk.imports ?? []), ...(chunk.dynamicImports ?? [])]) addChunk(imported);
}
addChunk('cards.html');

const hash = createHash('sha256');
const paths = [];
for (const file of [...files].sort()) {
  if (file.startsWith('/') || file.split('/').includes('..') || file.includes('\\')) throw new Error(`Unsafe cache path: ${file}`);
  const body = await readFile(path.join(dist, file));
  hash.update(file).update(body);
  paths.push(`/${file}`);
}

const cacheName = `mt-info-cards-${hash.digest('hex').slice(0, 12)}`;
const worker = `/* Built from the cards.html Vite entry. Only the card page is controlled. */
const CACHE_NAME = ${JSON.stringify(cacheName)};
const CACHE_PREFIX = 'mt-info-cards-';
const FILES = ${JSON.stringify(paths)};
const PATHS = new Set(FILES);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME)
    .then(cache => cache.addAll(FILES))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(names => Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const pathname = url.pathname;
  if (!PATHS.has(pathname)) return;
  event.respondWith(caches.open(CACHE_NAME).then(async cache => {
    const cached = await cache.match(pathname);
    return cached || fetch(event.request);
  }));
});
`;
await writeFile(path.join(dist, 'cards-sw.js'), worker);
console.log(`Card offline cache: ${paths.length} files (${cacheName})`);
