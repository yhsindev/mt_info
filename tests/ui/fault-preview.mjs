/** Test-only local preview. Never use this server for public deployment. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';

const mode = process.argv.find((arg) => arg.startsWith('--mode='))?.split('=')[1] ?? 'slow';
const port = Number(process.argv.find((arg) => arg.startsWith('--port='))?.split('=')[1] ?? 5180);
if (!['slow', 'timeout', 'unavailable', 'cache-failure', 'map-unavailable'].includes(mode) || !Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('Usage: node tests/ui/fault-preview.mjs --mode=slow|timeout|unavailable|cache-failure|map-unavailable --port=5180');
}
const root = resolve('dist');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
let equipmentSucceeded = false;

createServer(async (request, response) => {
  // No request forwarding to arbitrary hosts: only the local application API.
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  response.setHeader('Cache-Control', 'no-store');
  if (url.pathname.startsWith('/api/')) {
    if (mode === 'slow') await delay(2500);
    if (mode === 'timeout') await delay(18000);
    if (mode === 'unavailable' || mode === 'cache-failure' && equipmentSucceeded && url.pathname === '/api/equipment') {
      response.writeHead(503, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'QA: local API deliberately unavailable' }));
      return;
    }
    try {
      const upstream = await fetch(`http://127.0.0.1:8787${url.pathname}${url.search}`, { signal: AbortSignal.timeout(15000) });
      if (upstream.ok && url.pathname === '/api/equipment') equipmentSucceeded = true;
      response.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' });
      response.end(Buffer.from(await upstream.arrayBuffer()));
    } catch {
      response.writeHead(502, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'QA: local upstream unavailable' }));
    }
    return;
  }
  if (mode === 'map-unavailable') {
    // Block external tiles without changing the application or system network.
    response.setHeader('Content-Security-Policy', "connect-src 'self'; img-src 'self' data: blob:");
  }
  let filename = resolve(root, `.${decodeURIComponent(url.pathname)}`);
  if (filename !== root && !filename.startsWith(`${root}${sep}`)) {
    response.writeHead(403); response.end(); return;
  }
  if (!extname(filename)) filename = resolve(root, 'index.html');
  try {
    const contents = await readFile(filename);
    response.writeHead(200, { 'Content-Type': mime[extname(filename)] ?? 'application/octet-stream' });
    response.end(contents);
  } catch {
    response.writeHead(404); response.end('Run npm run build before this preview.');
  }
}).listen(port, '127.0.0.1', () => {
  console.info(`QA preview: http://127.0.0.1:${port} (${mode}); local test only`);
});
