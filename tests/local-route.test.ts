import { describe, expect, it } from 'vitest';
import { parseLocalGpx, routeGeoJSON, routeProximity } from '../src/local-route';
const gpx = '<gpx><trk><name>本機測試路線</name><trkseg><trkpt lat="24" lon="121"/><trkpt lat="24.1" lon="121"/></trkseg><trkseg><trkpt lat="25" lon="122"/><trkpt lat="25.1" lon="122"/></trkseg></trk></gpx>';
describe('private local GPX', () => {
  it('preserves separate track segments and official user coordinates without inventing connecting trails', () => {
    const route = parseLocalGpx(gpx);
    expect(route.name).toBe('本機測試路線'); expect(route.pointCount).toBe(4);
    expect(routeGeoJSON(route).features).toHaveLength(2);
    expect(route.bounds).toEqual([[121, 24], [122, 25.1]]);
    expect(routeGeoJSON(null).features).toEqual([]);
  });
  it('queries distance to line segments rather than endpoints and excludes unknown coordinates and track gaps', () => {
    const near = routeProximity(parseLocalGpx(gpx));
    expect(near(121, 24.05)).toBe(true);
    expect(near(121.02, 24.05)).toBe(true);
    expect(near(121.1, 24.05)).toBe(false);
    expect(near(121.5, 24.5)).toBe(false);
    expect(near(null, 24)).toBe(false); expect(near(NaN, 24)).toBe(false);
  });
  it('accepts namespace-prefixed routes and rejects entities, malformed files, invalid coordinates and waypoint-only input', () => {
    expect(parseLocalGpx('<g:gpx xmlns:g="urn:gpx"><g:rte><g:rtept lat="24" lon="121"/><g:rtept lat="24.1" lon="121.1"/></g:rte></g:gpx>', 'test.gpx').name).toBe('test');
    for (const xml of ['<gpx>', '<!DOCTYPE gpx [<!ENTITY x SYSTEM "file:///private">]><gpx/>', '<gpx><wpt lat="24" lon="121"/></gpx>', gpx.replace('lat="24"', 'lat=""'), gpx.replace('lon="121"', 'lon="181"')]) expect(() => parseLocalGpx(xml)).toThrow();
    expect(() => parseLocalGpx('x'.repeat(2_000_001))).toThrow(/過大/);
  });
});
