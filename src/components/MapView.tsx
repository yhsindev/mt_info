import { useEffect, useMemo, useRef, useState } from 'react';
import { BriefcaseMedical, Crosshair, HeartPulse, Layers, MapPin, RefreshCw, Mountain, LoaderCircle, Zap, ChevronDown } from 'lucide-react';
import type { GeoJSONSource, Map as MapType, MapGeoJSONFeature, Marker as MarkerType } from 'maplibre-gl';
import type { BasinSelection, Equipment, EquipmentType, LayerId, RegionId, WeatherProduct } from '../shared/types';
import type { ConditionsResponse } from '../shared/conditions';
import type { FeatureCollection, Point, Polygon, LineString, MultiLineString } from 'geojson';
import { trailGeometry, type ViewBounds } from '../conditions-spatial';
import { filterOfficialAlerts, filterTrailConditions } from '../conditions-view';
import { conditionsCopy } from '../conditions-copy';
import { useClock } from '../hooks';
import { routeGeoJSON, type LocalRoute } from '../local-route';
import { routeCopy } from '../route-copy';
import { regions, text, ui } from '../config';
import 'maplibre-gl/dist/maplibre-gl.css';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { CLUSTER_LIST_LIMIT, EQUIPMENT_COLORS, EQUIPMENT_TYPES, TAIWAN_BOUNDS, TAIWAN_WITH_ISLANDS_BOUNDS, equipmentClusterSource, equipmentFeatureCollections, equipmentLayerIds, equipmentSourceId } from '../map-clusters';
import { basinSource } from '../data/basins';
import './MapView.css';
interface Props {
  region: RegionId; layer: LayerId; equipment: Equipment[]; selectedId: string | null;
  onSelect: (id: string) => void; onCluster: (ids: string[]) => void; onBasin: (basin: BasinSelection | null) => void;
  location: [number, number] | null; sheetExpanded: boolean; products: WeatherProduct[];
  conditions: ConditionsResponse | null; conditionQuery: string; selectedConditionId: string | null; onConditionSelect: (id: string) => void;
  conditionSelectionRevision: number; onConditionHits: (ids: string[]) => void; onConditionsViewport: (bounds: ViewBounds | null) => void;
  route: LocalRoute | null; routeFocus: number;
}
type ScreenPoint = { x: number; y: number };
const iconId = (type: EquipmentType) => `equipment-icon-${type}`;

/** Local Canvas sprites avoid an external glyph service, network icons and thousands of DOM nodes. */
function equipmentIcon(type: EquipmentType) {
  const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
  const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas unavailable');
  context.strokeStyle = '#fff'; context.fillStyle = '#fff'; context.lineWidth = 4; context.lineCap = 'round'; context.lineJoin = 'round';
  if (type === 'AED') {
    context.beginPath(); context.moveTo(37,7); context.lineTo(16,35); context.lineTo(29,35); context.lineTo(25,57); context.lineTo(48,27); context.lineTo(35,27); context.closePath(); context.fill();
  } else if (type === 'PAC') {
    context.beginPath(); context.roundRect(13,11,38,43,10); context.stroke();
    context.beginPath(); context.moveTo(25,6); context.lineTo(39,6); context.moveTo(8,34); context.lineTo(21,34); context.lineTo(27,23); context.lineTo(34,43); context.lineTo(40,31); context.lineTo(56,31); context.stroke();
  } else {
    context.beginPath(); context.roundRect(8,19,48,36,6); context.stroke(); context.beginPath(); context.roundRect(23,9,18,10,3); context.stroke();
    context.fillRect(28,26,8,22); context.fillRect(21,33,22,8);
  }
  return context.getImageData(0,0,64,64);
}
function countBadge(label: string) {
  const canvas = document.createElement('canvas'); canvas.width = 112; canvas.height = 112;
  const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas unavailable');
  context.scale(2,2); context.fillStyle = '#fff'; context.font = `700 ${label.length > 4 ? 16 : 18}px sans-serif`;
  context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(label,28,29);
  return context.getImageData(0,0,112,112);
}
function viewPadding(m: MapType, expanded: boolean, layer: LayerId) {
  const mobile = window.matchMedia('(max-width: 760px)').matches;
  const mapRect = m.getContainer().getBoundingClientRect();
  const panel = m.getContainer().closest('.workspace')?.querySelector<HTMLElement>('.information-panel');
  const panelTop = panel?.getBoundingClientRect().top;
  const covered = panelTop === undefined ? expanded ? mapRect.height * .69 : 260 : Math.max(0, mapRect.bottom - Math.max(mapRect.top, panelTop));
  return { top: mobile ? layer === 'conditions' ? 76 : 90 : 82, right: mobile ? 54 : 44, left: mobile ? 18 : 30, bottom: mobile ? Math.min(Math.round(covered + 12), Math.max(0, mapRect.height - 155)) : 84 };
}
function fitTaiwan(m: MapType, duration = 550, includeIslands = false) { m.fitBounds(includeIslands ? TAIWAN_WITH_ISLANDS_BOUNDS : TAIWAN_BOUNDS,{duration,maxZoom:8}); }
function featurePoint(feature: MapGeoJSONFeature): [number,number] | null { return feature.geometry.type === 'Point' ? feature.geometry.coordinates as [number,number] : null; }

export default function MapView({ region, layer, equipment, selectedId, onSelect, onCluster, onBasin, location, products, sheetExpanded, conditions, conditionQuery, selectedConditionId, onConditionSelect, conditionSelectionRevision, onConditionHits, onConditionsViewport, route, routeFocus }: Props) {
  const container = useRef<HTMLDivElement>(null), map = useRef<MapType | null>(null);
  const library = useRef<typeof import('maplibre-gl') | null>(null), markers = useRef<MarkerType[]>([]), selectedMarker = useRef<MarkerType | null>(null);
  const callbacks = useRef({onSelect,onCluster,onBasin,onConditionSelect,onConditionHits,onConditionsViewport}); callbacks.current = {onSelect,onCluster,onBasin,onConditionSelect,onConditionHits,onConditionsViewport};
  const layerRef = useRef(layer); layerRef.current = layer;
  const viewRef = useRef<{layer: LayerId; region: RegionId} | null>(null);
  const selectionCamera = useRef(selectedId), locationCamera = useRef(location);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [tileError, setTileError] = useState(false), [attempt, setAttempt] = useState(0);
  const [includeIslands, setIncludeIslands] = useState(false);
  const [basinState, setBasinState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const basinFailed = useRef(false);
  const collections = useMemo(() => equipmentFeatureCollections(equipment),[equipment]);
  const equipmentIndex = useMemo(() => new Map(equipment.map(item => [item.id,item])),[equipment]);
  const now = useClock();
  const visibleTrails = useMemo(() => filterTrailConditions(conditions?.trails.items || [], conditionQuery), [conditions?.trails.items, conditionQuery]);
  const visibleAlerts = useMemo(() => filterOfficialAlerts(conditions?.alerts.items || [], conditionQuery, now), [conditions?.alerts.items, conditionQuery, now]);
  const conditionPoints = useMemo<FeatureCollection<Point>>(() => ({ type: 'FeatureCollection', features: visibleTrails.flatMap(item => {
    const geometry = trailGeometry(item), point = geometry?.type === 'Point' ? geometry : null;
    return point ? [{ type: 'Feature' as const, geometry: point, properties: { id: item.id, condition: item.condition } }] : [];
  }) }), [visibleTrails]);
  const conditionRoutes = useMemo<FeatureCollection<LineString | MultiLineString>>(() => ({ type: 'FeatureCollection', features: visibleTrails.flatMap(item => {
    const geometry = trailGeometry(item);
    return geometry && geometry.type !== 'Point' ? [{ type: 'Feature' as const, geometry, properties: { id: item.id, condition: item.condition } }] : [];
  }) }), [visibleTrails]);
  const conditionAreas = useMemo<FeatureCollection<Polygon>>(() => ({ type: 'FeatureCollection', features: visibleAlerts.flatMap(item => item.polygons.map(polygon => ({ type: 'Feature' as const, geometry: polygon, properties: { id: item.id } }))) }), [visibleAlerts]);
  const routeShape = useMemo(() => routeGeoJSON(route), [route]);
  useEffect(() => {
    let disposed = false;
    setStatus('loading'); setTileError(false); basinFailed.current = false; setBasinState('idle'); viewRef.current = null;
    import('maplibre-gl').then(lib => {
      if (disposed || !container.current) return;
      library.current = lib; lib.setWorkerUrl(mapWorkerUrl);
      const m = new lib.Map({ container: container.current, center: [120.6,24], zoom:6, minZoom:5, maxZoom:18,
        dragRotate: false, pitchWithRotate: false, touchPitch: false, maxPitch: 0,
        style: {version:8,sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'}},layers:[{id:'osm',type:'raster',source:'osm',paint:{'raster-saturation':-0.6,'raster-opacity':0.88}}]},
        attributionControl:{compact:true},canvasContextAttributes:{antialias:true},
      });
      map.current = m;
      // The viewport filter uses a north-up geographic rectangle. Keep pinch
      // zoom and keyboard panning, while preventing rotated or tilted views.
      m.touchZoomRotate.disableRotation(); m.keyboard.disableRotation();
      m.addControl(new lib.NavigationControl({showCompass:false}),'top-right'); m.addControl(new lib.ScaleControl({unit:'metric'}),'bottom-left');
      // MapLibre 6 awaits this resolver before assembling a tile's image atlas.
      // The later styleimagemissing event cannot satisfy the current image request.
      m.setMissingStyleImageResolver(id => {
        const match = /^equipment-count-([0-9.]+[km]?)$/i.exec(id);
        if (match && !m.hasImage(id)) m.addImage(id,countBadge(match[1]),{pixelRatio:2});
      });
      m.on('load', () => {
        if (disposed) return;
        try { for (const type of EQUIPMENT_TYPES) m.addImage(iconId(type),equipmentIcon(type),{pixelRatio:2}); setStatus('ready'); }
        catch { setStatus('error'); }
      });
      m.on('error', event => { if (!disposed) { setTileError(true); if (String(event.error?.message).includes('subbasin')) {basinFailed.current = true; setBasinState('error');} } });
      m.on('sourcedata', event => { if (event.sourceId === 'subbasin' && event.isSourceLoaded && !disposed && !basinFailed.current) setBasinState('ready'); });
      const equipmentFeatures = (point: ScreenPoint, radius = 22) => {
        const layers = EQUIPMENT_TYPES.flatMap(type => [`equipment-${type}-point`,`equipment-${type}-cluster`]).filter(id => m.getLayer(id));
        if (!layers.length) return [];
        const features = m.queryRenderedFeatures([[point.x-radius,point.y-radius],[point.x+radius,point.y+radius]],{layers});
        const unique = new Map<string,MapGeoJSONFeature>();
        for (const feature of features) unique.set(`${feature.source}:${feature.properties.cluster_id ?? feature.properties.id}`,feature);
        return [...unique.values()].sort((a,b) => {
          const score = (feature: MapGeoJSONFeature) => { const coordinates = featurePoint(feature); if (!coordinates) return Infinity; const p = m.project(coordinates); return Math.hypot(p.x-point.x,p.y-point.y) + (feature.source === equipmentSourceId('AED') ? 12 : 0); };
          return score(a)-score(b);
        });
      };
      const selectAt = async (point: ScreenPoint) => {
        const features = equipmentFeatures(point); const feature = features[0]; if (!feature) return;
        const coordinates = featurePoint(feature); if (!coordinates) return;
        if (feature.properties.cluster_id !== undefined) {
          const source = m.getSource(feature.source) as GeoJSONSource | undefined; if (!source) return;
          const clusterId = Number(feature.properties.cluster_id), count = Number(feature.properties.point_count);
          try {
            const expansion = await source.getClusterExpansionZoom(clusterId);
            if (disposed || layerRef.current !== 'equipment') return;
            m.easeTo({center:coordinates,zoom:Math.min(Math.max(expansion,m.getZoom()+0.8),18),duration:450});
            if (count <= CLUSTER_LIST_LIMIT) {
              const leaves = await source.getClusterLeaves(clusterId,count,0);
              const ids = leaves.map(leaf => String(leaf.properties?.id ?? '')).filter(Boolean);
              if (!disposed && layerRef.current === 'equipment' && ids.length === count) callbacks.current.onCluster(ids);
            }
          } catch { /* The source may have changed while the user changed filters; the next tap can retry. */ }
          return;
        }
        const projected = m.project(coordinates);
        const coLocated = features.filter(other => other.properties.cluster_id === undefined && featurePoint(other)).filter(other => { const p = m.project(featurePoint(other)!); return Math.hypot(p.x-projected.x,p.y-projected.y) < 7; });
        if (coLocated.length > 1) callbacks.current.onCluster(coLocated.slice(0,CLUSTER_LIST_LIMIT).map(other => String(other.properties.id)));
        else callbacks.current.onSelect(String(feature.properties.id));
      };
      const selectConditionsAt = (point: ScreenPoint) => {
        const layers = ['conditions-trail-points', 'conditions-route-line', 'conditions-alert-fill'].filter(id => m.getLayer(id));
        if (!layers.length) return;
        const features = m.queryRenderedFeatures([[point.x - 16, point.y - 16], [point.x + 16, point.y + 16]], { layers });
        const ids = [...new Set(features.map(item => item.properties?.id).filter((id): id is string => typeof id === 'string'))];
        if (ids.length === 1) callbacks.current.onConditionSelect(ids[0]);
        else if (ids.length > 1) callbacks.current.onConditionHits(ids);
      };
      m.on('click', event => {
        if (layerRef.current === 'equipment') { void selectAt(event.point); return; }
        if (layerRef.current === 'conditions') {
          selectConditionsAt(event.point);
          return;
        }
        if (layerRef.current !== 'basins' || !m.getLayer('basin-fill')) return;
        const feature = m.queryRenderedFeatures(event.point,{layers:['basin-fill']})[0]; if (!feature?.properties) return;
        const p = feature.properties, id = String(p.ws_id ?? p.gid ?? '');
        for (const layerId of ['basin-selected','basin-selected-outline']) m.setFilter(layerId,['==',['to-string',['get','ws_id']],id]);
        callbacks.current.onBasin({id,name:String(p.ws_name || text.unknown),basin:String(p.basin_name || text.unknown),year:ui.basin.year});
      });
      m.on('mousemove', event => {
        const conditionLayers = ['conditions-trail-points', 'conditions-route-line', 'conditions-alert-fill'].filter(id => m.getLayer(id));
        const selectable = layerRef.current === 'equipment' ? equipmentFeatures(event.point,4).length > 0 : layerRef.current === 'conditions' ? conditionLayers.length > 0 && m.queryRenderedFeatures(event.point, { layers: conditionLayers }).length > 0 : layerRef.current === 'basins' && m.getLayer('basin-fill') ? m.queryRenderedFeatures(event.point,{layers:['basin-fill']}).length > 0 : false;
        m.getCanvas().style.cursor = selectable ? 'pointer' : '';
      });
      m.getCanvas().setAttribute('aria-label',text.mapLabel);
      m.getCanvas().addEventListener('keydown',event => {
        if (event.key !== 'Enter') return;
        if (layerRef.current === 'equipment') { event.preventDefault(); void selectAt(m.project(m.getCenter())); }
        if (layerRef.current === 'conditions') { event.preventDefault(); selectConditionsAt(m.project(m.getCenter())); }
      });
    }).catch(() => { if (!disposed) setStatus('error'); });
    return () => { disposed = true; markers.current.forEach(marker => marker.remove()); markers.current = []; selectedMarker.current?.remove(); selectedMarker.current = null; map.current?.remove(); map.current = null; };
  },[attempt]);
  useEffect(() => {
    if (status !== 'ready' || !map.current) return;
    const update = () => { const m = map.current; if (m) {const padding = viewPadding(m,sheetExpanded,layer); m.setPadding({...padding, top: route ? Math.max(padding.top, window.matchMedia('(max-width:760px)').matches ? 150 : 110) : padding.top}); m.resize();} };
    update(); window.addEventListener('resize',update);
    const panel = map.current.getContainer().closest('.workspace')?.querySelector('.information-panel');
    const observer = new ResizeObserver(update); if (panel) observer.observe(panel);
    return () => { window.removeEventListener('resize',update); observer.disconnect(); };
  },[sheetExpanded,status,layer,route]);
  useEffect(() => {
    const m = map.current;
    if (status !== 'ready' || !m || layer !== 'conditions') { callbacks.current.onConditionsViewport(null); return; }
    const publish = () => {
      const rawPadding = m.getPadding(), padding = { left: rawPadding.left ?? 0, right: rawPadding.right ?? 0, top: rawPadding.top ?? 0, bottom: rawPadding.bottom ?? 0 };
      const width = m.getContainer().clientWidth, height = m.getContainer().clientHeight;
      const northwest = m.unproject([padding.left, padding.top]);
      const southeast = m.unproject([Math.max(padding.left + 1, width - padding.right), Math.max(padding.top + 1, height - padding.bottom)]);
      callbacks.current.onConditionsViewport({ west: northwest.lng, north: northwest.lat, east: southeast.lng, south: southeast.lat });
    };
    publish(); m.on('moveend', publish); m.on('resize', publish);
    return () => { m.off('moveend', publish); m.off('resize', publish); };
  }, [status, layer, sheetExpanded, route]);
  useEffect(() => {
    const m = map.current; if (status !== 'ready' || !m) return;
    const previous = viewRef.current;
    if (layer === 'weather' && (!previous || previous.layer !== layer || previous.region !== region)) {
      const r = regions.find(item => item.id === region)!; m.flyTo({center:r.center,zoom:r.zoom,duration:600});
    } else if (!previous || previous.layer !== layer) {setIncludeIslands(false); fitTaiwan(m);}
    viewRef.current = {layer,region};
  },[region,layer,status]);
  useEffect(() => {
    const m = map.current; if (status !== 'ready' || !m) return;
    for (const type of EQUIPMENT_TYPES) {
      const sourceId = equipmentSourceId(type); const [cluster,clusterIcon,clusterCount,point,pointIcon] = equipmentLayerIds(type);
      const existing = m.getSource(sourceId) as GeoJSONSource | undefined;
      if (existing) existing.setData(collections[type]);
      else {
        m.addSource(sourceId,equipmentClusterSource(collections[type]));
        m.addLayer({id:cluster,type:'circle',source:sourceId,filter:['has','point_count'],paint:{'circle-color':EQUIPMENT_COLORS[type],'circle-radius':['step',['get','point_count'],21,100,25,1000,29],'circle-stroke-color':'#fff','circle-stroke-width':2,'circle-opacity':0.96}});
        m.addLayer({id:clusterIcon,type:'symbol',source:sourceId,filter:['has','point_count'],layout:{visibility:'none','icon-image':iconId(type)}});
        m.addLayer({id:clusterCount,type:'symbol',source:sourceId,filter:['has','point_count'],layout:{'icon-image':['concat','equipment-count-',['to-string',['get','point_count_abbreviated']]],'icon-offset':[0,0],'icon-allow-overlap':true,'icon-ignore-placement':true}});
        m.addLayer({id:point,type:'circle',source:sourceId,filter:['!',['has','point_count']],paint:{'circle-color':EQUIPMENT_COLORS[type],'circle-radius':14,'circle-stroke-color':'#fff','circle-stroke-width':2.5}});
        m.addLayer({id:pointIcon,type:'symbol',source:sourceId,filter:['!',['has','point_count']],layout:{'icon-image':iconId(type),'icon-size':0.65,'icon-allow-overlap':true,'icon-ignore-placement':true}});
      }
    }
  },[collections,status]);
  useEffect(() => {
    const m = map.current; if (status !== 'ready' || !m) return;
    for (const id of EQUIPMENT_TYPES.flatMap(equipmentLayerIds)) if (m.getLayer(id)) m.setLayoutProperty(id,'visibility',layer === 'equipment' && !id.endsWith('-cluster-icon') ? 'visible' : 'none');
    if (layer === 'basins' && !m.getSource('subbasin')) {
      setBasinState('loading'); m.addSource('subbasin',{type:'vector',tiles:[basinSource.tiles],minzoom:7,maxzoom:14,attribution:ui.map.basinTileName});
      m.addLayer({id:'basin-fill',type:'fill',source:'subbasin','source-layer':basinSource.sourceLayer,paint:{'fill-color':['interpolate',['linear'],['%',['to-number',['get','gid'],1],5],0,'#619781',2,'#afbd72',4,'#659dba'],'fill-opacity':0.25}});
      m.addLayer({id:'basin-line',type:'line',source:'subbasin','source-layer':basinSource.sourceLayer,paint:{'line-color':'#3c7567','line-width':1.7,'line-opacity':0.8}});
      m.addLayer({id:'basin-selected',type:'fill',source:'subbasin','source-layer':basinSource.sourceLayer,filter:['==',['to-string',['get','ws_id']],''],paint:{'fill-color':'#e7b657','fill-opacity':0.45}});
      m.addLayer({id:'basin-selected-outline',type:'line',source:'subbasin','source-layer':basinSource.sourceLayer,filter:['==',['to-string',['get','ws_id']],''],paint:{'line-color':'#254b3f','line-width':4,'line-opacity':1}});
    }
    for (const id of ['basin-fill','basin-line','basin-selected','basin-selected-outline']) if (m.getLayer(id)) m.setLayoutProperty(id,'visibility',layer === 'basins' ? 'visible' : 'none');
    m.getCanvas().style.cursor = '';
  },[layer,status,collections]);
  useEffect(() => {
    const m = map.current;
    if (status !== 'ready' || !m) return;
    if (!m.getSource('conditions-trails')) {
      m.addSource('conditions-trails', { type: 'geojson', data: conditionPoints });
      m.addSource('conditions-routes', { type: 'geojson', data: conditionRoutes });
      m.addSource('conditions-alerts', { type: 'geojson', data: conditionAreas });
      m.addLayer({ id: 'conditions-alert-fill', type: 'fill', source: 'conditions-alerts', paint: { 'fill-color': '#bf7138', 'fill-opacity': 0.15 } });
      m.addLayer({ id: 'conditions-alert-line', type: 'line', source: 'conditions-alerts', paint: { 'line-color': '#a35f32', 'line-width': 2, 'line-opacity': 0.8 } });
      m.addLayer({ id: 'conditions-route-casing', type: 'line', source: 'conditions-routes', paint: { 'line-color': '#fff', 'line-width': 8, 'line-opacity': 0.9 } });
      m.addLayer({ id: 'conditions-route-line', type: 'line', source: 'conditions-routes', paint: { 'line-color': '#5d627f', 'line-width': 4, 'line-dasharray': [2, 1] } });
      m.addLayer({ id: 'conditions-trail-points', type: 'circle', source: 'conditions-trails', paint: { 'circle-radius': 9, 'circle-color': ['match', ['get', 'condition'], 'closed', '#b84f39', 'partial', '#ba8a25', 'caution', '#4c7897', '#78857c'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
    } else {
      (m.getSource('conditions-trails') as GeoJSONSource).setData(conditionPoints);
      (m.getSource('conditions-routes') as GeoJSONSource).setData(conditionRoutes);
      (m.getSource('conditions-alerts') as GeoJSONSource).setData(conditionAreas);
    }
    for (const id of ['conditions-alert-fill', 'conditions-alert-line', 'conditions-route-casing', 'conditions-route-line', 'conditions-trail-points']) m.setLayoutProperty(id, 'visibility', layer === 'conditions' ? 'visible' : 'none');
    m.setPaintProperty('conditions-route-line', 'line-width', ['case', ['==', ['get', 'id'], selectedConditionId || ''], 6, 4]);
    m.setPaintProperty('conditions-alert-line', 'line-width', ['case', ['==', ['get', 'id'], selectedConditionId || ''], 4, 2]);
    m.setPaintProperty('conditions-trail-points', 'circle-radius', ['case', ['==', ['get', 'id'], selectedConditionId || ''], 13, 9]);
  }, [conditionPoints, conditionRoutes, conditionAreas, selectedConditionId, layer, status]);
  useEffect(() => {
    const m = map.current;
    if (!m || status !== 'ready' || layer !== 'conditions' || !selectedConditionId) return;
    const point = conditionPoints.features.find(item => item.properties?.id === selectedConditionId);
    if (point) { m.easeTo({ center: point.geometry.coordinates as [number, number], zoom: Math.max(m.getZoom(), 11), duration: 450 }); return; }
    const areas = conditionAreas.features.filter(item => item.properties?.id === selectedConditionId);
    const lines = conditionRoutes.features.filter(item => item.properties?.id === selectedConditionId);
    const coordinates = [...areas.flatMap(item => item.geometry.coordinates.flat()), ...lines.flatMap(item => item.geometry.type === 'LineString' ? item.geometry.coordinates : item.geometry.coordinates.flat())];
    if (coordinates.length) {
      const bounds = coordinates.reduce((box, p) => ({ west: Math.min(box.west, p[0]), south: Math.min(box.south, p[1]), east: Math.max(box.east, p[0]), north: Math.max(box.north, p[1]) }), { west: Infinity, south: Infinity, east: -Infinity, north: -Infinity });
      m.fitBounds([[bounds.west, bounds.south], [bounds.east, bounds.north]], { maxZoom: 13, duration: 450 });
    }
  }, [selectedConditionId, conditionSelectionRevision, status, layer]);
  useEffect(() => {
    const m = map.current;
    if (status !== 'ready' || !m) return;
    if (!m.getSource('local-gpx-route')) {
      m.addSource('local-gpx-route', { type: 'geojson', data: routeShape });
      const before = equipmentLayerIds('AED')[0];
      m.addLayer({ id: 'local-gpx-casing', type: 'line', source: 'local-gpx-route', paint: { 'line-color': '#fff', 'line-width': 7, 'line-opacity': 0.9 } }, m.getLayer(before) ? before : undefined);
      m.addLayer({ id: 'local-gpx-line', type: 'line', source: 'local-gpx-route', paint: { 'line-color': '#335e94', 'line-width': 3.5, 'line-opacity': 0.95 } }, m.getLayer(before) ? before : undefined);
    } else (m.getSource('local-gpx-route') as GeoJSONSource).setData(routeShape);
  }, [routeShape, status]);
  useEffect(() => {
    if (route && status === 'ready') map.current?.fitBounds(route.bounds, { duration: 500, maxZoom: 14 });
  }, [route, routeFocus, status]);
  useEffect(() => {
    const m = map.current, lib = library.current; if (!m || !lib || status !== 'ready') return;
    markers.current.forEach(marker => marker.remove()); markers.current = [];
    if (layer === 'weather') {
      const points = new Map<string,{name:string;lng:number;lat:number;value:number|null;unit:string;demo:boolean;title:string;stale:boolean}>();
      for (const product of products) for (const item of product.items) {
        if (item.latitude === undefined || item.longitude === undefined || item.metric !== 'rain') continue;
        points.set(item.id,{name:item.name,lat:item.latitude,lng:item.longitude,value:item.value,unit:item.unit,demo:product.status === 'demo',title:product.kind === 'observation' ? text.observation : product.title,stale:product.status === 'stale' || item.status === 'stale'});
      }
      for (const point of points.values()) {
        const element = document.createElement('div'); element.className = 'rain-marker'; element.textContent = `${point.demo ? text.demoNotice + ' · ' : point.stale ? text.state.stale + ' · ' : ''}${point.name} ${point.value ?? ui.weather.missing}${point.value === null ? '' : point.unit}`; element.title = point.title;
        markers.current.push(new lib.Marker({element}).setLngLat([point.lng,point.lat]).addTo(m));
      }
    }
    if (location) { const element = document.createElement('div'); element.className = 'user-marker'; element.setAttribute('aria-label',ui.map.user); markers.current.push(new lib.Marker({element}).setLngLat(location).addTo(m)); }
    return () => { markers.current.forEach(marker => marker.remove()); markers.current = []; };
  },[layer,location,products,status]);
  useEffect(() => {
    selectedMarker.current?.remove(); selectedMarker.current = null;
    const selectionChanged = selectedId !== selectionCamera.current; selectionCamera.current = selectedId;
    const m = map.current, lib = library.current, item = selectedId ? equipmentIndex.get(selectedId) : undefined;
    if (!m || !lib || status !== 'ready' || layer !== 'equipment' || !item || item.latitude === null || item.longitude === null || !Number.isFinite(item.latitude) || !Number.isFinite(item.longitude)) return;
    const element = document.createElement('button'); element.type = 'button'; element.className = `equipment-selected-marker type-${item.type}`; element.style.backgroundColor = EQUIPMENT_COLORS[item.type]; element.setAttribute('aria-label',`${item.name} · ${text[item.type]}`);
    const image = document.createElement('canvas'); image.width = 64; image.height = 64; image.getContext('2d')?.putImageData(equipmentIcon(item.type),0,0); image.setAttribute('aria-hidden','true');
    const label = document.createElement('span'); label.className = 'equipment-selected-label'; label.textContent = item.name; element.append(image,label); element.addEventListener('click',() => callbacks.current.onSelect(item.id));
    selectedMarker.current = new lib.Marker({element}).setLngLat([item.longitude,item.latitude]).addTo(m);
    if (selectionChanged) m.easeTo({center:[item.longitude,item.latitude],zoom:Math.max(m.getZoom(),13),duration:450});
    return () => {selectedMarker.current?.remove(); selectedMarker.current = null;};
  },[selectedId,equipmentIndex,layer,status]);
  useEffect(() => {
    if (!location) {locationCamera.current = null; return;}
    if (status === 'ready' && location !== locationCamera.current) {locationCamera.current = location; map.current?.flyTo({center:location,zoom:13,duration:600});}
  },[location,status]);
  const selectedRegion = regions.find(item => item.id === region)!;
  return <section className={`map-area layer-${layer}`} aria-label={text.mapLabel}>
    <div ref={container} className="map-canvas" />
    <div className="map-region"><Mountain size={17}/><span>{layer === 'weather' ? selectedRegion.subtitle : layer === 'equipment' ? ui.map.overviewEquipment : layer === 'conditions' ? text.conditions : ui.map.overviewBasins}</span>{layer !== 'weather' && <button className="map-islands-toggle" aria-label={includeIslands ? ui.map.mainIslandLabel : ui.map.includeIslandsLabel} onClick={() => {const next = !includeIslands; setIncludeIslands(next); if (map.current) fitTaiwan(map.current,550,next);}}>{includeIslands ? ui.map.mainIsland : ui.map.includeIslands}</button>}</div>
    {route && <button className="map-route-label" title={routeCopy.focus} onClick={() => map.current?.fitBounds(route.bounds, { duration: 450, maxZoom: 14 })}><span/>{route.name}</button>}
    <button className="map-reset" title={text.reset} aria-label={text.reset} onClick={() => {setIncludeIslands(false); if (map.current) fitTaiwan(map.current);}}><Crosshair size={20}/></button>
    {status === 'loading' && <div className="map-state"><LoaderCircle className="spin"/><span>{text.mapLoading}</span></div>}
    {status === 'error' && <div className="map-state"><MapPin/><strong>{text.mapFailure}</strong><span>{text.mapFailureDetail}</span><button className="small-button" onClick={() => setAttempt(value => value+1)}><RefreshCw size={14}/>{text.retry}</button></div>}
    {tileError && status !== 'error' && <div className="map-warning" role="status"><span>{text.mapSlow}</span><button aria-label={text.retry} onClick={() => setAttempt(value => value+1)}><RefreshCw size={14}/></button></div>}
    {layer === 'conditions' ? <details className="map-legend conditions-map-legend"><summary><span className="condition-route-key"/>{conditionsCopy.referenceRoute}<ChevronDown size={14}/></summary><div><span className="condition-area-key"/>{conditionsCopy.officialArea}<p>{conditionsCopy.geometryLimit}</p></div></details> : layer === 'equipment' ? <details className="map-legend equipment-legend" aria-label={ui.map.equipmentLegend}><summary className="equipment-legend-summary"><Layers size={17}/>{ui.map.equipmentLegend}<ChevronDown size={16}/></summary><div className="equipment-legend-body"><div><span className="equipment-legend-item type-AED"><Zap size={17}/><b>{text.AED}</b></span><span className="equipment-legend-item type-PAC"><HeartPulse size={17}/><b>{text.PAC}</b></span><span className="equipment-legend-item type-FIRST_AID"><BriefcaseMedical size={17}/><b>{text.FIRST_AID}</b></span></div><p className="equipment-legend-note">{ui.map.clusterCountMeaning}</p></div></details> : <div className="map-legend"><span className={`legend-dot ${layer === 'basins' ? 'basin' : ''}`}/><span>{layer === 'basins' ? text.basinLegend : text.weather}</span>{layer === 'basins' && <span className="legend-status">{basinState === 'loading' ? ui.map.loading : basinState === 'error' ? ui.map.failed : ui.map.year}</span>}</div>}
    {layer !== 'equipment' && layer !== 'conditions' && <div className="map-hint"><Layers size={14}/>{layer === 'basins' ? text.mapBasinsHint : text.noFakeZero}</div>}
  </section>;
}
