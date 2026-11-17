import { describe, expect, it } from 'vitest';
import { inspectGpxXml, MAX_GPX_BYTES } from '../scripts/inspect-gpx';

const sample = `<?xml version="1.0"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="24" lon="121"><name>九九山莊</name></wpt>
  <wpt lat="24" lon="121"><name>WPT001</name></wpt>
  <wpt lat="24" lon="121"><name>10K牌</name></wpt>
  <wpt lat="24" lon="121"><name>九九山莊</name></wpt>
  <wpt lat="24" lon="121"/>
  <trk><trkseg><trkpt lat="24" lon="121"/><trkpt lat="24.1" lon="121.1"/></trkseg>
  <trkseg><trkpt lat="24.2" lon="121.2"/></trkseg></trk>
</gpx>`;

describe('local GPX inspection', () => {
  it('counts structure and keeps only distinct meaningful waypoint names, without coordinates', () => {
    const report = inspectGpxXml(sample);
    expect(report.fileInspection).toEqual({ xmlValid: true, tracks: 1, segments: 2, trackPoints: 3, waypoints: 5 });
    expect(report.namedWaypoints).toEqual(['九九山莊', '10K牌']);
    expect(report.namedWaypointCount).toBe(2);
    expect(report.unnamedWaypoints).toBe(1);
    expect(report.filteredWaypointNames).toBe(1);
    expect(JSON.stringify(report)).not.toContain('121.1');
  });

  it('reports absent named waypoints and malformed XML separately', () => {
    const noWaypoints = inspectGpxXml('<gpx><trk><trkseg><trkpt lat="24" lon="121"/></trkseg></trk></gpx>');
    expect(noWaypoints.fileInspection.waypoints).toBe(0);
    expect(noWaypoints.missingHints).toContain('沒有 GPX waypoint；主要路點仍需另找來源逐一核對。');
    const malformed = inspectGpxXml('<gpx><trk></gpx>');
    expect(malformed.fileInspection.xmlValid).toBe(false);
    expect(malformed.fileInspection.trackPoints).toBeNull();
    expect(inspectGpxXml('<foo/>').gpxRootValid).toBe(false);
  });

  it('rejects entity declarations and oversized text before parsing', () => {
    expect(inspectGpxXml('<!DOCTYPE gpx [<!ENTITY x SYSTEM "file:///private">]><gpx/>').fileInspection.xmlValid).toBe(false);
    expect(() => inspectGpxXml('x'.repeat(MAX_GPX_BYTES + 1))).toThrow(/過大|上限/);
  });
});
