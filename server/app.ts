import express, { type ErrorRequestHandler } from 'express';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { getEquipment, getEquipmentRevision } from '../src/data/equipment.js';
import type { RegionId } from '../src/shared/types.js';
import { createWeatherService, type WeatherServiceOptions } from './weather.js';
import { getRainMaps, rainMapProductId } from './rainMaps.js';
import { createEquipmentSync, type EquipmentSyncStatus } from './equipmentSync.js';
import { createConditionsService } from './conditions.js';
import { getTrailLocation } from './trailGeometry.js';

const gzipAsync = promisify(gzip);
const equipmentPayloads = new Map<string, Promise<{ body: Buffer; compressed: Buffer; etag: string }>>();
function equipmentPayload(region?: RegionId) {
  const response = getEquipment(region);
  const key = `${getEquipmentRevision()}:${region ?? 'all'}:${response.status}:${response.fetchedAt}`;
  let payload = equipmentPayloads.get(key);
  if (!payload) {
    payload = (async () => {
      const body = Buffer.from(JSON.stringify(response));
      const compressed = await gzipAsync(body, { level: 6 });
      return { body, compressed, etag: `W/"${createHash('sha256').update(body).digest('hex')}"` };
    })();
    if (equipmentPayloads.size >= 6) equipmentPayloads.clear();
    equipmentPayloads.set(key, payload);
    payload.catch(() => { equipmentPayloads.delete(key); });
  }
  return payload;
}

export interface AppOptions extends WeatherServiceOptions {
  production?: boolean; rateLimit?: number; rateWindowMs?: number;
  equipmentSync?: { getStatus: () => EquipmentSyncStatus };
  conditionsService?: ReturnType<typeof createConditionsService>;
}
export function createApp(options: AppOptions = {}) {
  const app = express(); app.disable('x-powered-by'); app.set('trust proxy', false);
  const service = createWeatherService(options);
  const equipmentSync = options.equipmentSync ?? createEquipmentSync({ enabled: false });
  const conditionsService = options.conditionsService ?? createConditionsService();
  const limits = new Map<string, { start: number; count: number }>();
  app.use((_req,res,next) => { res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Referrer-Policy','strict-origin-when-cross-origin'); next(); });
  app.use('/api', (req,res,next) => {
    const now = Date.now(); const windowMs = options.rateWindowMs ?? 60_000; const ip = req.ip ?? 'local';
    if (limits.size >= 5_000) for (const [id, value] of limits) if (now - value.start >= windowMs) limits.delete(id);
    if (limits.size >= 5_000 && !limits.has(ip)) { res.setHeader('Retry-After',Math.ceil(windowMs/1000)); res.status(429).json({message:'服務忙碌，請稍候再試。'}); return; }
    const current = limits.get(ip); const bucket = current && now-current.start < windowMs ? current : { start: now, count: 0 }; bucket.count++; limits.set(ip,bucket);
    res.setHeader('Cache-Control','no-store');
    if (bucket.count > (options.rateLimit ?? 90)) { res.setHeader('Retry-After',Math.ceil((windowMs - (now-bucket.start))/1000)); res.status(429).json({ message:'查詢次數較多，請稍候再試。' }); return; }
    next();
  });
  const regionOf = (value: unknown): RegionId | null => value === undefined || value === 'xueshan' ? 'xueshan' : value === 'daba' ? 'daba' : null;
  app.get('/api/health', (_req,res) => res.json({ status:'ok', name:'mt_info', weatherConfigured:Boolean(options.apiKey?.trim()), ncdrWatchEnabled:false, ncdrMpasViewerEnabled:true, publicAlertsEnabled:true, mountainForecastEnabled:false }));
  app.get('/api/equipment/sync-status', (_req,res) => res.json(equipmentSync.getStatus()));
  app.get('/api/plan-route/:trailId', (req,res) => {
    if (Object.keys(req.query).length) { res.status(400).json({message:'路線圖只提供已核對的固定官方資料。'}); return; }
    // Only the exact IDs and names whose official geometry/coverage were reviewed.
    const names: Record<string, string> = { '027': '大霸尖山登山步道', '119': '北大武山步道' };
    const trailId = req.params.trailId;
    const name = Object.hasOwn(names, trailId) ? names[trailId]! : null;
    const location = name ? getTrailLocation(trailId, name) : undefined;
    if (!location) { res.status(404).json({message:'尚未收錄這條路線的可用地理軌跡。'}); return; }
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json({trailId, name, location});
  });
  app.get('/api/conditions', async (req,res) => {
    if (Object.keys(req.query).length) { res.status(400).json({message:'此介面提供固定官方來源；搜尋與篩選在裝置內進行。'}); return; }
    res.json(await conditionsService.get());
  });
  let manualRefreshAt = 0;
  let manualRefresh: ReturnType<typeof conditionsService.refresh> | null = null;
  app.post('/api/conditions/refresh', async (req,res) => {
    if (Object.keys(req.query).length || !req.is('application/json')) { res.status(400).json({message:'重新查核只接受本站固定來源的 JSON 請求。'}); return; }
    if (!manualRefresh && Date.now() - manualRefreshAt < 30_000) {
      res.setHeader('Retry-After', Math.ceil((30_000 - (Date.now() - manualRefreshAt)) / 1000));
      res.status(429).json({message:'剛完成公告查核，請稍候再試。'}); return;
    }
    if (!manualRefresh) {
      manualRefreshAt = Date.now();
      manualRefresh = conditionsService.refresh({force:true});
      void manualRefresh.finally(() => { manualRefresh = null; }).catch(() => {});
    }
    res.json(await manualRefresh);
  });
  app.get('/api/equipment', async (req,res) => {
    const region = req.query.region === undefined ? undefined : regionOf(req.query.region);
    if (region === null) { res.status(400).json({message:'不支援的山區。'}); return; }
    const payload = await equipmentPayload(region);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.setHeader('ETag', payload.etag);
    res.vary('Accept-Encoding');
    if (req.acceptsEncodings('gzip', 'identity') === 'gzip') {
      res.setHeader('Content-Encoding', 'gzip'); res.send(payload.compressed);
    } else res.send(payload.body);
  });
  app.get('/api/rain-maps', (req,res) => {
    const selected = rainMapProductId(req.query.product);
    if (selected === null) { res.status(400).json({message:'不支援的雨量圖產品。'}); return; }
    res.json(getRainMaps(selected));
  });
  app.get('/api/weather', async (req,res) => {
    const region = regionOf(req.query.region); const mode = req.query.mode ?? 'live'; const requestedProduct = req.query.product;
    if (!region || mode !== 'live' && mode !== 'demo' || requestedProduct !== undefined && requestedProduct !== 'observation' && requestedProduct !== 'qpf' && requestedProduct !== 'radar') { res.status(400).json({message:'不支援的山區、資料模式或產品。登山預報本階段未納入。'}); return; }
    res.json(await service.getWeather(region,mode,requestedProduct));
  });
  app.use('/api', (_req,res) => res.status(404).json({message:'沒有這個資料介面。'}));
  if (options.production) { const dist = path.resolve('dist'); app.use(express.static(dist)); app.get('/{*splat}', (_req,res) => res.sendFile(path.join(dist,'index.html'))); }
  const handleError: ErrorRequestHandler = (_error,_req,res,_next) => { res.status(500).json({message:'資料服務暫時無法使用，請稍後再試。'}); };
  app.use(handleError);
  return app;
}
