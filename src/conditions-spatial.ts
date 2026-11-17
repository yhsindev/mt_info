import type { LineString, MultiLineString, Point, Polygon, Position } from 'geojson';
import type { OfficialAlert, TrailCondition } from './shared/conditions';

export interface ViewBounds { west: number; south: number; east: number; north: number }
type SupportedGeometry = Point | LineString | MultiLineString | Polygon;
const EPSILON = 1e-10;

function validBounds(bounds: ViewBounds | null): bounds is ViewBounds {
  return !!bounds && [bounds.west, bounds.south, bounds.east, bounds.north].every(Number.isFinite)
    && bounds.west >= -180 && bounds.east <= 180 && bounds.south >= -90 && bounds.north <= 90
    && bounds.west <= bounds.east && bounds.south <= bounds.north;
}
function validPosition(value: unknown): value is Position {
  return Array.isArray(value) && value.length >= 2
    && typeof value[0] === 'number' && typeof value[1] === 'number'
    && Number.isFinite(value[0]) && Number.isFinite(value[1])
    && value[0] >= -180 && value[0] <= 180 && value[1] >= -90 && value[1] <= 90;
}
function validLine(value: unknown): value is Position[] {
  return Array.isArray(value) && value.length >= 2 && value.every(validPosition);
}
function validRing(value: unknown): value is Position[] {
  if (!validLine(value) || value.length < 4) return false;
  const first = value[0], last = value[value.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) return false;
  // Translate before the shoelace sum so small rings near 120° do not lose precision.
  let twiceArea = 0;
  for (let index = 1; index < value.length; index++) {
    const a = value[index - 1], b = value[index];
    twiceArea += (a[0] - first[0]) * (b[1] - first[1]) - (b[0] - first[0]) * (a[1] - first[1]);
  }
  return Number.isFinite(twiceArea) && twiceArea !== 0;
}
function validGeometry(value: unknown): value is SupportedGeometry {
  if (!value || typeof value !== 'object') return false;
  const geometry = value as { type?: unknown; coordinates?: unknown };
  if (geometry.type === 'Point') return validPosition(geometry.coordinates);
  if (geometry.type === 'LineString') return validLine(geometry.coordinates);
  if (geometry.type === 'MultiLineString') return Array.isArray(geometry.coordinates)
    && geometry.coordinates.length > 0 && geometry.coordinates.every(validLine);
  if (geometry.type === 'Polygon') return Array.isArray(geometry.coordinates)
    && geometry.coordinates.length > 0 && geometry.coordinates.every(validRing);
  return false;
}
function pointInBounds(point: Position, bounds: ViewBounds): boolean {
  return point[0] >= bounds.west - EPSILON && point[0] <= bounds.east + EPSILON
    && point[1] >= bounds.south - EPSILON && point[1] <= bounds.north + EPSILON;
}

/** Parametric segment clipping; overlapping bounding boxes alone are insufficient. */
function segmentIntersectsBounds(a: Position, b: Position, bounds: ViewBounds): boolean {
  let start = 0, end = 1;
  const axes = [[a[0], b[0] - a[0], bounds.west, bounds.east], [a[1], b[1] - a[1], bounds.south, bounds.north]];
  for (const [origin, delta, minimum, maximum] of axes) {
    if (delta === 0) {
      if (origin < minimum - EPSILON || origin > maximum + EPSILON) return false;
      continue;
    }
    const t1 = (minimum - origin) / delta, t2 = (maximum - origin) / delta;
    start = Math.max(start, Math.min(t1, t2));
    end = Math.min(end, Math.max(t1, t2));
    if (start > end + EPSILON) return false;
  }
  return true;
}
function lineIntersectsBounds(line: Position[], bounds: ViewBounds): boolean {
  for (let index = 1; index < line.length; index++) {
    if (segmentIntersectsBounds(line[index - 1], line[index], bounds)) return true;
  }
  return false;
}
function pointOnSegment(point: Position, a: Position, b: Position): boolean {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const cross = (point[0] - a[0]) * dy - (point[1] - a[1]) * dx;
  return Math.abs(cross) <= EPSILON * Math.max(1, Math.abs(dx) + Math.abs(dy))
    && point[0] >= Math.min(a[0], b[0]) - EPSILON && point[0] <= Math.max(a[0], b[0]) + EPSILON
    && point[1] >= Math.min(a[1], b[1]) - EPSILON && point[1] <= Math.max(a[1], b[1]) + EPSILON;
}
function pointInRing(point: Position, ring: Position[]): 'inside' | 'outside' | 'boundary' {
  let inside = false;
  for (let index = 1; index < ring.length; index++) {
    const a = ring[index - 1], b = ring[index];
    if (pointOnSegment(point, a, b)) return 'boundary';
    if ((a[1] > point[1]) !== (b[1] > point[1])
      && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside ? 'inside' : 'outside';
}
function pointInPolygon(point: Position, rings: Position[][]): boolean {
  const outer = pointInRing(point, rings[0]);
  if (outer === 'outside') return false;
  if (outer === 'boundary') return true;
  for (const hole of rings.slice(1)) {
    const result = pointInRing(point, hole);
    if (result === 'boundary') return true;
    if (result === 'inside') return false;
  }
  return true;
}
function intersectsValidGeometry(geometry: SupportedGeometry, bounds: ViewBounds): boolean {
  if (geometry.type === 'Point') return pointInBounds(geometry.coordinates, bounds);
  if (geometry.type === 'LineString') return lineIntersectsBounds(geometry.coordinates, bounds);
  if (geometry.type === 'MultiLineString') return geometry.coordinates.some(line => lineIntersectsBounds(line, bounds));
  // Polygon boundaries (including hole boundaries) count as intersections.
  if (geometry.coordinates.some(ring => lineIntersectsBounds(ring, bounds))) return true;
  return [[bounds.west, bounds.south], [bounds.east, bounds.south], [bounds.east, bounds.north], [bounds.west, bounds.north]]
    .some(corner => pointInPolygon(corner, geometry.coordinates));
}

/** Closed-boundary intersection in longitude/latitude, for non-antimeridian views. */
export function geometryIntersectsBounds(geometry: SupportedGeometry, bounds: ViewBounds): boolean {
  return validBounds(bounds) && validGeometry(geometry) && intersectsValidGeometry(geometry, bounds);
}

export function trailGeometry(item: TrailCondition): Point | LineString | MultiLineString | null {
  if (item.location !== undefined) {
    const geometry: unknown = item.location?.geometry;
    return validGeometry(geometry) && geometry.type !== 'Polygon' ? geometry : null;
  }
  const coordinates = [item.longitude, item.latitude];
  return validPosition(coordinates) ? { type: 'Point', coordinates } : null;
}

/** Spatial filtering never discards records whose official position is unknown. */
export function filterConditionsInView(trails: TrailCondition[], alerts: OfficialAlert[], bounds: ViewBounds | null, enabled: boolean): {
  trails: TrailCondition[]; alerts: OfficialAlert[]; unlocatedTrails: TrailCondition[]; unlocatedAlerts: OfficialAlert[];
} {
  const trailEntries = trails.map(item => ({ item, geometry: trailGeometry(item) }));
  const alertEntries = alerts.map(item => ({ item, geometries: Array.isArray(item.polygons) ? item.polygons.filter(polygon => validGeometry(polygon) && polygon.type === 'Polygon') : [] }));
  const unlocatedTrails = trailEntries.filter(entry => !entry.geometry).map(entry => entry.item);
  const unlocatedAlerts = alertEntries.filter(entry => !entry.geometries.length).map(entry => entry.item);
  if (!enabled || !validBounds(bounds)) return { trails, alerts, unlocatedTrails, unlocatedAlerts };
  return {
    trails: trailEntries.filter(entry => !entry.geometry || intersectsValidGeometry(entry.geometry, bounds)).map(entry => entry.item),
    alerts: alertEntries.filter(entry => !entry.geometries.length || entry.geometries.some(geometry => intersectsValidGeometry(geometry, bounds))).map(entry => entry.item),
    unlocatedTrails, unlocatedAlerts,
  };
}
