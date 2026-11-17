/** A sourced point location; registration does not establish current trail access. */
export interface PlanWaypointSource {
  id: string;
  name: string;
  aliases: string[];
  longitude: number;
  latitude: number;
  sourceUrl: string;
  sourceName: string;
  checkedAt: string;
  coordinateBasis: string;
  limitations: string;
  license?: string;
  licenseUrl?: string;
}
