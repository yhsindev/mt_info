import type { LineString, MultiLineString, Point } from 'geojson';
import type { SourceInfo } from './types';

/** Location of the trail or its entrance, never a derived incident location. */
export interface TrailLocation {
  kind: 'route' | 'entrance';
  geometry: LineString | MultiLineString | Point;
  source: SourceInfo;
  checkedAt: string;
  geometryDate: string | null;
  note: string;
}
