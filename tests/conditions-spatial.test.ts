import { describe, expect, it } from 'vitest';
import type { LineString, MultiLineString, Point, Polygon } from 'geojson';
import { filterConditionsInView, geometryIntersectsBounds, type ViewBounds } from '../src/conditions-spatial';
import type { OfficialAlert, TrailCondition } from '../src/shared/conditions';
import type { TrailLocation } from '../src/shared/trail-location';

const view: ViewBounds = { west: 0, south: 0, east: 1, north: 1 };
const rectangle = (west: number, south: number, east: number, north: number): Polygon => ({
  type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
});
const source = { name: '官方資料測試來源', url: 'https://example.test/official' };
function location(geometry: TrailLocation['geometry'], kind: TrailLocation['kind'] = 'route'): TrailLocation {
  return { kind, geometry, source, checkedAt: '2026-10-21T10:00:00Z', geometryDate: null, note: '步道參考幾何，非災點' };
}
function trail(id: string, overrides: Partial<TrailCondition> = {}): TrailCondition {
  return { id, trailId: id, name: id, region: '官方地區', manager: '官方單位', condition: 'closed', rawCondition: '封閉', headline: '官方公告', description: '官方原文', section: null, issuedAt: null, updatedAt: null, closureDate: null, expectedOpeningDate: null, latitude: null, longitude: null, coordinateNote: '未知', source, ...overrides };
}
function alert(id: string, polygons: Polygon[] = []): OfficialAlert {
  return { id, identifier: id, publisher: '官方單位', sender: 'official', headline: '官方警示', description: '官方原文', instruction: '', event: '官方事件', severity: 'Unknown', areas: ['官方地區'], issuedAt: '2026-10-21T10:00:00+08:00', effectiveAt: '2026-10-21T10:00:00+08:00', expiresAt: '2026-10-22T10:00:00+08:00', polygons, source };
}

describe('closed viewport intersection', () => {
  it('includes point boundaries without coercing missing or projected coordinates to geographic points', () => {
    expect(geometryIntersectsBounds({ type: 'Point', coordinates: [0, 0] }, view)).toBe(true);
    expect(geometryIntersectsBounds({ type: 'Point', coordinates: [1, 1] }, view)).toBe(true);
    expect(geometryIntersectsBounds({ type: 'Point', coordinates: [1.01, 0.5] }, view)).toBe(false);
    const malformed = { type: 'Point', coordinates: [null, 0.5] } as unknown as Point;
    expect(geometryIntersectsBounds(malformed, view)).toBe(false);
    expect(geometryIntersectsBounds({ type: 'Point', coordinates: [300000, 2770000] }, view)).toBe(false);
    expect(geometryIntersectsBounds({ type: 'Point', coordinates: [NaN, 0.5] }, view)).toBe(false);
  });

  it('finds a line crossing the viewport even when both endpoints lie outside', () => {
    expect(geometryIntersectsBounds({ type: 'LineString', coordinates: [[-1, 0.5], [2, 0.5]] }, view)).toBe(true);
    expect(geometryIntersectsBounds({ type: 'LineString', coordinates: [[0, 2], [2, 0]] }, view)).toBe(true);
    expect(geometryIntersectsBounds({ type: 'LineString', coordinates: [[0.5, 0.5], [0.5, 0.5]] }, view)).toBe(true);
  });

  it('rejects a bounding-box false positive near a diagonal line', () => {
    const line: LineString = { type: 'LineString', coordinates: [[0.8, 1.4], [1.4, 0.8]] };
    expect(geometryIntersectsBounds(line, view)).toBe(false);
    expect(geometryIntersectsBounds({ ...line, coordinates: [...line.coordinates].reverse() }, view)).toBe(false);
  });

  it('keeps separate multi-line parts separate instead of bridging their endpoints', () => {
    const geometry: MultiLineString = { type: 'MultiLineString', coordinates: [[[-2, 0.5], [-1, 0.5]], [[2, 0.5], [3, 0.5]]] };
    expect(geometryIntersectsBounds(geometry, view)).toBe(false);
    expect(geometryIntersectsBounds({ ...geometry, coordinates: [...geometry.coordinates, [[-1, 0.2], [2, 0.2]]] }, view)).toBe(true);
  });

  it('handles a polygon containing the view, a polygon inside it, and an edge crossing it', () => {
    expect(geometryIntersectsBounds(rectangle(-2, -2, 2, 2), view)).toBe(true);
    expect(geometryIntersectsBounds(rectangle(0.2, 0.2, 0.8, 0.8), view)).toBe(true);
    expect(geometryIntersectsBounds(rectangle(-2, 0.4, 2, 0.6), view)).toBe(true);
  });

  it('does not include a concave polygon just because its bounding box overlaps', () => {
    const polygon: Polygon = { type: 'Polygon', coordinates: [[[0, 0], [4, 0], [4, 1], [1, 1], [1, 4], [0, 4], [0, 0]]] };
    expect(geometryIntersectsBounds(polygon, { west: 2, south: 2, east: 3, north: 3 })).toBe(false);
    expect(geometryIntersectsBounds(polygon, { west: 0.2, south: 2, east: 0.8, north: 3 })).toBe(true);
  });

  it('excludes a view wholly inside a polygon hole and includes filled areas or hole boundaries', () => {
    const polygon = rectangle(0, 0, 10, 10);
    polygon.coordinates.push(rectangle(3, 3, 7, 7).coordinates[0].reverse());
    expect(geometryIntersectsBounds(polygon, { west: 4, south: 4, east: 6, north: 6 })).toBe(false);
    expect(geometryIntersectsBounds(polygon, { west: 2, south: 4, east: 4, north: 6 })).toBe(true);
    expect(geometryIntersectsBounds(polygon, { west: 3, south: 4, east: 3, north: 6 })).toBe(true);
    expect(geometryIntersectsBounds(polygon, { west: -1, south: -1, east: 11, north: 11 })).toBe(true);
  });

  it('rejects malformed geometries and bounds instead of accepting their boxes', () => {
    expect(geometryIntersectsBounds({ type: 'LineString', coordinates: [[0.5, 0.5]] }, view)).toBe(false);
    expect(geometryIntersectsBounds({ type: 'MultiLineString', coordinates: [] }, view)).toBe(false);
    expect(geometryIntersectsBounds({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] }, view)).toBe(false);
    expect(geometryIntersectsBounds({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [2, 0], [0, 0]]] }, view)).toBe(false);
    expect(geometryIntersectsBounds({ type: 'Point', coordinates: [0.5, 0.5] }, { ...view, west: NaN })).toBe(false);
    expect(geometryIntersectsBounds({ type: 'Point', coordinates: [0.5, 0.5] }, { ...view, west: 2 })).toBe(false);
  });
});

describe('conditions viewport filtering', () => {
  it('retains unknown positions, filters located records, and preserves record identity and order', () => {
    const trails = [
      trail('unknown'),
      trail('outside', { location: location({ type: 'LineString', coordinates: [[2, 2], [3, 3]] }) }),
      trail('crossing', { location: location({ type: 'LineString', coordinates: [[-1, 0.5], [2, 0.5]] }) }),
      trail('entrance', { location: location({ type: 'Point', coordinates: [0.4, 0.4] }, 'entrance') }),
    ];
    const alerts = [alert('unknown'), alert('outside', [rectangle(2, 2, 3, 3)]), alert('overlap', [rectangle(0.8, 0.8, 2, 2)])];
    const result = filterConditionsInView(trails, alerts, view, true);
    expect(result.trails.map(item => item.id)).toEqual(['unknown', 'crossing', 'entrance']);
    expect(result.alerts.map(item => item.id)).toEqual(['unknown', 'overlap']);
    expect(result.unlocatedTrails).toEqual([trails[0]]);
    expect(result.unlocatedAlerts).toEqual([alerts[0]]);
    expect(result.trails[1]).toBe(trails[2]);
    expect(trails).toHaveLength(4);
    expect(alerts).toHaveLength(3);
  });

  it('uses any intersecting CAP polygon and respects holes for the same record', () => {
    const withHole = rectangle(-2, -2, 2, 2);
    withHole.coordinates.push(rectangle(-0.5, -0.5, 1.5, 1.5).coordinates[0]);
    const alerts = [alert('hole-only', [withHole]), alert('second-area-visible', [withHole, rectangle(0.2, 0.2, 0.3, 0.3)])];
    expect(filterConditionsInView([], alerts, view, true).alerts.map(item => item.id)).toEqual(['second-area-visible']);
  });

  it('prefers the official route or entrance geometry to legacy coordinates', () => {
    const trails = [
      trail('route-outside', { latitude: 0.5, longitude: 0.5, location: location({ type: 'LineString', coordinates: [[2, 2], [3, 3]] }) }),
      trail('route-crossing', { latitude: 5, longitude: 5, location: location({ type: 'MultiLineString', coordinates: [[[-1, 0.5], [2, 0.5]]] }) }),
      trail('legacy-inside', { latitude: 0.5, longitude: 0.5 }),
      trail('legacy-outside', { latitude: 5, longitude: 5 }),
    ];
    const result = filterConditionsInView(trails, [], view, true);
    expect(result.trails.map(item => item.id)).toEqual(['route-crossing', 'legacy-inside']);
    expect(result.unlocatedTrails).toEqual([]);
  });

  it('keeps malformed locations visible as unlocated and never falls back to a different legacy position', () => {
    const badPoint = { type: 'Point', coordinates: [null, 0.5] } as unknown as Point;
    const badPolygon = { type: 'Polygon', coordinates: [[[NaN, 0], [1, 0], [1, 1], [NaN, 0]]] } as Polygon;
    const trails = [trail('bad-location', { latitude: 5, longitude: 5, location: location(badPoint, 'entrance') }), trail('missing-longitude', { latitude: 0.5, longitude: null })];
    const alerts = [alert('bad-polygon', [badPolygon])];
    const result = filterConditionsInView(trails, alerts, view, true);
    expect(result.trails).toEqual(trails);
    expect(result.alerts).toEqual(alerts);
    expect(result.unlocatedTrails).toEqual(trails);
    expect(result.unlocatedAlerts).toEqual(alerts);
  });

  it('shows all records when disabled, before a viewport exists, or when bounds are invalid', () => {
    const trails = [trail('outside', { location: location({ type: 'Point', coordinates: [5, 5] }, 'entrance') }), trail('unknown')];
    const alerts = [alert('outside', [rectangle(5, 5, 6, 6)]), alert('unknown')];
    for (const [bounds, enabled] of [[view, false], [null, true], [{ ...view, east: -1 }, true]] as const) {
      const result = filterConditionsInView(trails, alerts, bounds, enabled);
      expect(result.trails).toBe(trails);
      expect(result.alerts).toBe(alerts);
      expect(result.unlocatedTrails.map(item => item.id)).toEqual(['unknown']);
      expect(result.unlocatedAlerts.map(item => item.id)).toEqual(['unknown']);
    }
  });
});
