import type { Polygon } from 'geojson';
import type { SourceInfo } from './types';
import type { TrailLocation } from './trail-location';

export type ConditionsStatus = 'ready' | 'empty' | 'stale' | 'missing' | 'error' | 'disabled';
export interface ConditionsSource<T> {
  status: ConditionsStatus;
  source: SourceInfo;
  coverage: string;
  fetchedAt: string | null;
  checkedAt: string | null;
  error: string | null;
  message: string;
  items: T[];
}
export type TrailConditionKind = 'closed' | 'partial' | 'caution' | 'unknown';
export interface TrailCondition {
  id: string;
  trailId: string;
  name: string;
  region: string;
  manager: string;
  condition: TrailConditionKind;
  rawCondition: string;
  headline: string;
  description: string;
  section: string | null;
  issuedAt: string | null;
  updatedAt: string | null;
  closureDate: string | null;
  expectedOpeningDate: string | null;
  latitude: number | null;
  longitude: number | null;
  coordinateNote: string;
  location?: TrailLocation;
  source: SourceInfo;
}
export interface OfficialAlert {
  id: string;
  identifier: string;
  publisher: string;
  sender: string;
  headline: string;
  description: string;
  instruction: string;
  event: string;
  severity: string;
  areas: string[];
  issuedAt: string;
  effectiveAt: string;
  expiresAt: string;
  polygons: Polygon[];
  source: SourceInfo;
}
export interface ConditionsResponse {
  generatedAt: string;
  trails: ConditionsSource<TrailCondition> & { catalogCount: number; unmatchedCount: number };
  alerts: ConditionsSource<OfficialAlert> & { unknownTimeCount: number };
}
