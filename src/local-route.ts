import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { FeatureCollection, LineString } from 'geojson';
import { routeCopy } from './route-copy';

export interface LocalRoute {
  name: string;
  segments: [number, number][][];
  pointCount: number;
  bounds: [[number, number], [number, number]];
}
const array = <T>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
function coordinate(raw: unknown, axis: 'lat' | 'lon'): number {
  if (typeof raw !== 'string' || !raw.trim() || !/^[+-]?\d+(?:\.\d+)?$/.test(raw.trim())) throw new Error(routeCopy.coordinate);
  const value = Number(raw), bound = axis === 'lat' ? 90 : 180;
  if (!Number.isFinite(value) || Math.abs(value) > bound) throw new Error(routeCopy.coordinate);
  return value;
}
/** Parse user-supplied coordinates only; no external resources, location upload or gap bridging. */
export function parseLocalGpx(xml: string, filename = ''): LocalRoute {
  if (xml.length > 2_000_000) throw new Error(routeCopy.oversized);
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error(routeCopy.invalid);
  const root = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, parseAttributeValue: false }).parse(xml)?.gpx;
  if (!root || typeof root !== 'object') throw new Error(routeCopy.invalid);
  const segments: [number, number][][] = [];
  let pointCount = 0;
  const add = (points: unknown) => {
    const result = array<Record<string, unknown>>(points as Record<string, unknown> | Record<string, unknown>[] | undefined).map(point => {
      if (++pointCount > 50_000) throw new Error(routeCopy.oversized);
      return [coordinate(point?.['@_lon'], 'lon'), coordinate(point?.['@_lat'], 'lat')] as [number, number];
    });
    if (result.length > 1) segments.push(result);
  };
  for (const track of array<Record<string, unknown>>(root.trk)) for (const segment of array<Record<string, unknown>>(track.trkseg as Record<string, unknown> | Record<string, unknown>[] | undefined)) add(segment?.trkpt);
  for (const route of array<Record<string, unknown>>(root.rte)) add(route?.rtept);
  if (!segments.length) throw new Error(routeCopy.noTrack);
  const bounds: LocalRoute['bounds'] = [[Infinity, Infinity], [-Infinity, -Infinity]];
  for (const segment of segments) for (const [lng, lat] of segment) {
    bounds[0][0] = Math.min(bounds[0][0], lng); bounds[0][1] = Math.min(bounds[0][1], lat);
    bounds[1][0] = Math.max(bounds[1][0], lng); bounds[1][1] = Math.max(bounds[1][1], lat);
  }
  const named = array<Record<string, unknown>>(root.trk)[0]?.name ?? array<Record<string, unknown>>(root.rte)[0]?.name;
  const name = typeof named === 'string' && named.trim() ? named.trim().slice(0, 120) : filename.replace(/\.gpx$/i, '').slice(0, 120) || routeCopy.name;
  return { name, segments, pointCount, bounds };
}
export function routeGeoJSON(route: LocalRoute | null): FeatureCollection<LineString> {
  return { type: 'FeatureCollection', features: route ? route.segments.map(coordinates => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } })) : [] };
}
type XY = [number, number];
function squaredDistance(p: XY, a: XY, b: XY) {
  const dx = b[0] - a[0], dy = b[1] - a[1], length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)) : 0;
  return (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2;
}
/** Approximate local range lookup. A grid bounds repeated national-equipment filtering work. */
export function routeProximity(route: LocalRoute, radiusKm = 3) {
  if (!Number.isFinite(radiusKm) || radiusKm <= 0) throw new Error(routeCopy.invalid);
  const origin = route.bounds[0], meanLat = (route.bounds[0][1] + route.bounds[1][1]) / 2;
  const scaleX = 111.32 * Math.cos(meanLat * Math.PI / 180), scaleY = 111.32;
  const project = ([lng, lat]: XY): XY => [(lng - origin[0]) * scaleX, (lat - origin[1]) * scaleY];
  const pieces: [XY, XY][] = [], cells = new Map<string, number[]>();
  let bindings = 0;
  for (const segment of route.segments) {
    const projected = segment.map(project);
    for (let index = 1; index < projected.length; index++) {
      const a = projected[index - 1], b = projected[index], id = pieces.length;
      pieces.push([a, b]);
      const x0 = Math.floor((Math.min(a[0], b[0]) - radiusKm) / radiusKm), x1 = Math.floor((Math.max(a[0], b[0]) + radiusKm) / radiusKm);
      const y0 = Math.floor((Math.min(a[1], b[1]) - radiusKm) / radiusKm), y1 = Math.floor((Math.max(a[1], b[1]) + radiusKm) / radiusKm);
      const count = (x1 - x0 + 1) * (y1 - y0 + 1);
      if (!Number.isFinite(count) || (bindings += count) > 500_000) throw new Error(routeCopy.tooComplex);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const key = `${x},${y}`, existing = cells.get(key);
        if (existing) existing.push(id); else cells.set(key, [id]);
      }
    }
  }
  return (lng: number | null, lat: number | null) => {
    if (lng === null || lat === null || !Number.isFinite(lng) || !Number.isFinite(lat)) return false;
    const p = project([lng, lat]), candidates = cells.get(`${Math.floor(p[0] / radiusKm)},${Math.floor(p[1] / radiusKm)}`) || [];
    return candidates.some(id => squaredDistance(p, ...pieces[id]) <= radiusKm ** 2);
  };
}
