import {useEffect, useMemo, useRef, useState, type ChangeEvent} from 'react';
import {Download, FileUp, RotateCcw, X} from 'lucide-react';
import type {Map as MapType, Marker} from 'maplibre-gl';
import type {PlanWaypoint} from '../plan/waypoints';
import type {TrailLocation} from '../shared/trail-location';
import type {PlanDay} from '../plan/types';
import {createPlanDiagramSvg, planDiagramSize, type PlanDiagramInput} from '../plan/diagram';
import {parseLocalGpx, routeGeoJSON, type LocalRoute} from '../local-route';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import './PlanRouteView.css';

interface Props {
  draftId: string; title: string; routeName: string; referenceRouteId: string | null;
  day: PlanDay | null; dayIndex: number; selectedLegId: string | null;
  onSelectLeg: (id: string) => void; localRoute?: LocalRoute | null; waypoints: readonly PlanWaypoint[];
}
interface OfficialRoute {draftId: string; trailId: string; name: string; location: TrailLocation}
const TAIWAN_BOUNDS: LocalRoute['bounds'] = [[119.8, 21.7], [122.2, 25.4]];
const OFFICIAL_ROUTES: Record<string, {name: string; coverage: string}> = {
  '027': {name: '大霸尖山登山步道', coverage: '不含觀霧至馬達拉溪約 19 公里林道'},
  '119': {name: '北大武山步道', coverage: '不含新登山口至舊登山口接近路段'},
};
function localGeometry(location: TrailLocation, name: string): LocalRoute | null {
  if (location.kind !== 'route' || location.geometry.type === 'Point') return null;
  const segments = (location.geometry.type === 'LineString' ? [location.geometry.coordinates] : location.geometry.coordinates) as [number, number][][];
  const bounds: LocalRoute['bounds'] = [[Infinity, Infinity], [-Infinity, -Infinity]];
  let pointCount = 0;
  for (const line of segments) for (const [lng, lat] of line) {
    pointCount++; bounds[0][0] = Math.min(bounds[0][0], lng); bounds[0][1] = Math.min(bounds[0][1], lat);
    bounds[1][0] = Math.max(bounds[1][0], lng); bounds[1][1] = Math.max(bounds[1][1], lat);
  }
  return pointCount > 1 ? {name, segments, pointCount, bounds} : null;
}
function date(value: string | null) {
  if (!value) return '未知';
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Intl.DateTimeFormat('zh-TW', {timeZone:'Asia/Taipei', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date(value));
}
function filename(routeName: string, dayIndex: number, extension: string) {
  return `mt_info_${routeName.replace(/[\\/:*?"<>|\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '').slice(0, 60) || '路點圖'}_D${dayIndex + 1}.${extension}`;
}
function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export default function PlanRouteView({draftId, title, routeName, referenceRouteId, day, dayIndex, selectedLegId, onSelectLeg, localRoute = null, waypoints}: Props) {
  const [official, setOfficial] = useState<OfficialRoute | null>(null), [officialState, setOfficialState] = useState<'loading' | 'ready' | 'error' | 'missing'>('missing');
  const [imported, setImported] = useState<{draftId: string; route: LocalRoute} | null>(null);
  const [pointInfo, setPointInfo] = useState<string | null>(null);
  const library = useRef<typeof import('maplibre-gl') | null>(null), markers = useRef<Marker[]>([]);
  const [message, setMessage] = useState(''), [exporting, setExporting] = useState(false);
  const [mapState, setMapState] = useState<'loading' | 'ready' | 'error'>('loading'), [tileError, setTileError] = useState(false);
  const container = useRef<HTMLDivElement>(null), map = useRef<MapType | null>(null), file = useRef<HTMLInputElement>(null);
  const currentDraft = useRef(draftId); currentDraft.current = draftId;
  const officialForDraft = official?.draftId === draftId && official.trailId === referenceRouteId ? official : null;
  const referenceRoute = referenceRouteId && Object.hasOwn(OFFICIAL_ROUTES, referenceRouteId) ? OFFICIAL_ROUTES[referenceRouteId] : undefined;
  const importedForDraft = imported?.draftId === draftId ? imported.route : null;
  const ownRoute = importedForDraft || localRoute;
  const geometry = useMemo(() => ownRoute || (officialForDraft ? localGeometry(officialForDraft.location, officialForDraft.name) : null), [ownRoute, officialForDraft]);
  const diagramInput = useMemo<PlanDiagramInput | null>(() => day ? ({title, routeName, day, dayIndex, generatedAt:new Date().toISOString()}) : null, [title, routeName, day, dayIndex]);

  const dayPoints = waypoints.filter(point => point.visits.some(visit => visit.dayIndex === dayIndex));
  // Imported tracks are not silently associated with the reference itinerary's point locations.
  const located = ownRoute ? [] : dayPoints.filter(point => point.coordinate !== null);
  const pointKey = located.map(point => `${point.id}:${point.coordinate?.join(',')}`).join(';');
  const bounds = useMemo<LocalRoute['bounds'] | null>(() => {
    const coordinates = [...(geometry ? geometry.segments.flat() : []), ...located.flatMap(point => point.coordinate ? [point.coordinate] : [])];
    if (!coordinates.length) return null;
    const result: LocalRoute['bounds'] = [[Infinity, Infinity], [-Infinity, -Infinity]];
    for (const [lng, lat] of coordinates) {result[0][0] = Math.min(result[0][0], lng); result[0][1] = Math.min(result[0][1], lat); result[1][0] = Math.max(result[1][0], lng); result[1][1] = Math.max(result[1][1], lat);}
    return result;
  }, [geometry, pointKey]);
  const displayBounds = bounds ?? TAIWAN_BOUNDS;
  const focusedPoint = dayPoints.find(point => point.source?.id === pointInfo);
  const showPoint = (point: PlanWaypoint) => {
    const visit = point.visits.find(visit => visit.dayIndex === dayIndex && visit.side === 'from') || point.visits.find(visit => visit.dayIndex === dayIndex);
    if (visit) onSelectLeg(visit.legId);
    setPointInfo(point.source?.id || null);
    if (!ownRoute && point.coordinate) map.current?.easeTo({center:point.coordinate, zoom:Math.max(map.current.getZoom(), 13), duration:250});
  };

  useEffect(() => {
    setImported(null); setMessage('');
    // A route file is intentionally held only for this draft's current browser session.
  }, [draftId]);
  useEffect(() => {
    setOfficial(null);
    if (!referenceRoute) { setOfficialState('missing'); return; }
    const controller = new AbortController(); let disposed = false;
    setOfficialState('loading');
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    fetch(`/api/plan-route/${referenceRouteId}`, {signal:controller.signal}).then(async response => {
      if (!response.ok) throw new Error('路線圖載入失敗');
      const result = await response.json() as Omit<OfficialRoute, 'draftId'>;
      if (result.trailId !== referenceRouteId || result.name !== referenceRoute.name || !result.location || !localGeometry(result.location, result.name)) throw new Error('路線圖資料不完整');
      if (!disposed) { setOfficial({...result, draftId}); setOfficialState('ready'); }
    }).catch(() => { if (!disposed) setOfficialState('error'); }).finally(() => window.clearTimeout(timeout));
    return () => {disposed = true; controller.abort(); window.clearTimeout(timeout);};
  }, [draftId, referenceRouteId]);

  useEffect(() => {
    if (!container.current) return;
    let disposed = false, initializing = false, wasVisible = false;
    let instance: MapType | null = null, timeout: number | undefined;
    let previousWidth = 0, previousHeight = 0;
    setMapState('loading'); setTileError(false);
    const fit = () => {
      if (!instance || !container.current?.clientWidth || !container.current.clientHeight) return;
      instance.fitBounds(displayBounds, {padding:Math.min(64, container.current.clientWidth * .12, container.current.clientHeight * .12), maxZoom:15, duration:0});
    };
    const resizeOrCreate = () => {
      const element = container.current;
      if (disposed || !element) return;
      const width = element.clientWidth, height = element.clientHeight;
      if (!width || !height) {wasVisible = false; return;}
      const changed = !wasVisible || width !== previousWidth || height !== previousHeight;
      wasVisible = true; previousWidth = width; previousHeight = height;
      if (instance) {instance.resize(); if (changed) fit(); return;}
      if (initializing) return;
      initializing = true;
      import('maplibre-gl').then(lib => {
        initializing = false;
        if (disposed || !container.current?.clientWidth || !container.current.clientHeight) return;
        library.current = lib; lib.setWorkerUrl(mapWorkerUrl);
        timeout = window.setTimeout(() => {if (!disposed) setMapState('error');}, 15_000);
        const m = new lib.Map({container:container.current, center:displayBounds[0], zoom:10,
          dragRotate:false, pitchWithRotate:false, touchPitch:false, maxPitch:0,
          style:{version:8, sources:{osm:{type:'raster', tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize:256, attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'}}, layers:[{id:'osm', type:'raster', source:'osm', paint:{'raster-saturation':-0.6, 'raster-opacity':0.88}}]},
          attributionControl:{compact:true}, canvasContextAttributes:{antialias:true},
        });
        instance = m; map.current = m; m.touchZoomRotate.disableRotation(); m.keyboard.disableRotation(); m.scrollZoom.disable();
        m.addControl(new lib.NavigationControl({showCompass:false}), 'top-right');
        m.addControl(new lib.ScaleControl({unit:'metric'}), 'bottom-left');
        m.on('load', () => {
          if (disposed) return;
          window.clearTimeout(timeout);
          m.addSource('plan-route', {type:'geojson', data:geometry ? routeGeoJSON(geometry) : {type:'FeatureCollection', features:[]}});
          m.addLayer({id:'plan-route-casing', type:'line', source:'plan-route', paint:{'line-color':'#fffefb', 'line-width':8}, layout:{'line-join':'round', 'line-cap':'round'}});
          m.addLayer({id:'plan-route-line', type:'line', source:'plan-route', paint:{'line-color':'#285b43', 'line-width':4}, layout:{'line-join':'round', 'line-cap':'round'}});
          fit(); setMapState('ready');
        });
        m.on('error', () => {if (!disposed) setTileError(true);});
      }).catch(() => {if (!disposed) setMapState('error');});
    };
    const resize = new ResizeObserver(resizeOrCreate); resize.observe(container.current); resizeOrCreate();
    return () => {disposed = true; window.clearTimeout(timeout); resize.disconnect(); markers.current.forEach(marker => marker.remove()); markers.current = []; instance?.remove(); if (map.current === instance) map.current = null;};
  }, [geometry, bounds]);

  useEffect(() => {
    markers.current.forEach(marker => marker.remove()); markers.current = [];
    if (mapState !== 'ready' || !map.current || !library.current) return;
    for (const point of located) {
      if (!point.coordinate) continue;
      const element = document.createElement('button'); element.type = 'button'; element.className = 'plan-map-marker';
      element.textContent = String(point.number); element.dataset.waypointNumber = String(point.number);
      element.setAttribute('aria-label', `路點 ${point.number} ${point.name}`); element.title = point.name;
      element.setAttribute('aria-pressed', String(point.visits.some(visit => visit.dayIndex === dayIndex && visit.legId === selectedLegId)));
      element.onclick = event => {event.stopPropagation(); showPoint(point);};
      markers.current.push(new library.current.Marker({element}).setLngLat(point.coordinate).addTo(map.current));
    }
    return () => {markers.current.forEach(marker => marker.remove()); markers.current = [];};
  }, [mapState, pointKey, selectedLegId, dayIndex, ownRoute]);

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0], forDraft = draftId; event.target.value = '';
    if (!chosen) return;
    if (chosen.size > 2_000_000) {setMessage('GPX 檔案超過 2 MB，請縮減後再匯入。'); return;}
    try {
      const route = parseLocalGpx(await chosen.text(), chosen.name);
      if (currentDraft.current !== forDraft) return;
      setImported({draftId:forDraft, route}); setMessage('已載入本機 GPX；僅本次編輯暫存，離開編輯或重新整理後需再匯入。');
    } catch (error) {if (currentDraft.current === forDraft) setMessage(error instanceof Error ? error.message : 'GPX 無法讀取。');}
  }
  async function exportDiagram(transparent: boolean) {
    if (!diagramInput || exporting) return;
    setExporting(true); setMessage('');
    const source = createPlanDiagramSvg({...diagramInput, generatedAt:new Date().toISOString()}, {transparent});
    try {
      if (!transparent) {save(new Blob([source], {type:'image/svg+xml;charset=utf-8'}), filename(routeName, dayIndex, 'svg')); return;}
      const url = URL.createObjectURL(new Blob([source], {type:'image/svg+xml;charset=utf-8'}));
      try {
        const image = new Image();
        await new Promise<void>((resolve, reject) => {image.onload = () => resolve(); image.onerror = () => reject(new Error('無法產生 PNG，請改下載 SVG。')); image.src = url;});
        const {width, height} = planDiagramSize(diagramInput), canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const context = canvas.getContext('2d'); if (!context) throw new Error('此瀏覽器無法產生 PNG，請改下載 SVG。');
        context.drawImage(image, 0, 0);
        const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('無法產生 PNG，請改下載 SVG。')), 'image/png'));
        save(png, filename(routeName, dayIndex, 'png'));
      } finally {URL.revokeObjectURL(url);}
    } catch (error) {setMessage(error instanceof Error ? error.message : '圖面匯出失敗，請再試一次。');}
    finally {setExporting(false);}
  }
  const missing = referenceRoute && officialState === 'loading' ? '正在載入官方路線。'
    : referenceRoute && officialState === 'error' ? '官方路線暫時無法載入；行程仍可查看。'
    : '尚未收錄這條路線的地理軌跡；可匯入 GPX 對照。';
  return <aside className="plan-route-view" aria-label="路線地圖">
    <div className="plan-route-map-wrap">
      <div className="plan-route-map" ref={container} aria-label={`${geometry?.name || routeName}路線與路點地圖`}/>
      <button type="button" className="plan-route-import" onClick={() => file.current?.click()}><FileUp size={17}/>匯入 GPX</button>
      <input ref={file} type="file" accept=".gpx,application/gpx+xml" onChange={importFile} hidden/>
      {mapState !== 'ready' && <div className="plan-route-map-state" role="status">{mapState === 'loading' ? '地圖載入中…' : '地圖無法載入；行程仍可查看。'}</div>}
      {mapState === 'ready' && tileError && <div className="plan-route-tile-warning" role="status">部分底圖未載入；路線與路點仍可對照。</div>}
      {mapState === 'ready' && !geometry && <div className="plan-route-missing" role="status">{missing}</div>}
      <button type="button" className="plan-route-fit" onClick={() => container.current && map.current?.fitBounds(displayBounds, {padding:Math.min(64, container.current.clientWidth * .12, container.current.clientHeight * .12), maxZoom:15, duration:250})} aria-label={bounds ? '顯示路線與當日路點' : '回到臺灣全圖'}><RotateCcw size={18}/></button>
    </div>
    {focusedPoint?.source && <div className="plan-point-source"><div className="plan-point-source-heading"><strong>{focusedPoint.number} · {focusedPoint.name}</strong><button type="button" aria-label="關閉路點資訊" onClick={() => setPointInfo(null)}><X size={18}/></button></div><span>{focusedPoint.source.coordinateBasis}</span><a href={focusedPoint.source.sourceUrl} target="_blank" rel="noopener noreferrer">{focusedPoint.source.sourceName}・位置來源</a><span>來源查閱：{date(focusedPoint.source.checkedAt)}</span><span>{focusedPoint.source.limitations}</span>{focusedPoint.source.license && <a href={focusedPoint.source.licenseUrl} target="_blank" rel="noopener noreferrer">{focusedPoint.source.license}</a>}</div>}
    <p className="plan-route-note">{ownRoute ? '本機軌跡尚未對應行程路點。' : `當日 ${located.length}／${dayPoints.length} 個路點已定位${located.length < dayPoints.length ? '；未定位點不放上地圖。' : '。'}`}{officialForDraft && !ownRoute && <span className="plan-coverage-note">參考線{referenceRoute?.coverage}。</span>}</p>
    <details className="plan-route-source"><summary>路點索引與來源</summary>
      <div className="plan-map-point-key" aria-label="當日路點編號">{dayPoints.map(point => <button type="button" key={point.id} onClick={() => showPoint(point)}><b>{point.number}</b><span>{point.name || '名稱待填'}{(!point.coordinate || ownRoute) && <small>未定位</small>}</span></button>)}</div>
      {ownRoute ? <span>本機 GPX：{ownRoute.name}<br/>{importedForDraft ? '僅本次編輯暫存；離開編輯或重新整理後需再匯入。' : '僅此分頁暫存；重新整理後需再匯入。'}不隨計畫 JSON 保存；未上傳。</span>
        : officialForDraft && <><a href={officialForDraft.location.source.url} target="_blank" rel="noopener noreferrer">{officialForDraft.location.source.name}・步道參考線段</a><span>資料年份／日期：{date(officialForDraft.location.geometryDate)}　查閱：{date(officialForDraft.location.checkedAt)}</span><span>{officialForDraft.location.source.license}</span><span>{referenceRoute?.coverage}；點間空白不補畫連線。軌跡不表示目前開放或已巡檢。</span></>}
    </details>
    <footer className="plan-route-export">
      <span>匯出本日行程示意</span>
      <button type="button" disabled={!day?.legs.length || exporting} onClick={() => void exportDiagram(false)}><Download size={16}/>白底 SVG</button>
      <button type="button" disabled={!day?.legs.length || exporting} onClick={() => void exportDiagram(true)}><Download size={16}/>透明 PNG</button>
    </footer>
    {message && <p className="plan-route-state" role="status">{message}</p>}
  </aside>;
}
