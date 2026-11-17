import type { ConditionsResponse, TrailCondition } from './shared/conditions';
import { filterOfficialAlerts, filterTrailConditions } from './conditions-view';
import { filterConditionsInView, trailGeometry, type ViewBounds } from './conditions-spatial';

export function hasTrailLocation(item: TrailCondition): boolean {
  return trailGeometry(item) !== null;
}
export interface ConditionsViewSummary {
  inView: boolean;
  mapReady: boolean;
  routeCount: number;
  locatedTrailCount: number;
  locatedAlertCount: number;
  unlocatedTrailCount: number;
  unlocatedAlertCount: number;
  outsideSelection: boolean;
}
/** Search and viewport share one result set. Unknown locations remain readable. */
export function buildConditionsView(data: ConditionsResponse | null, query: string, now: number, bounds: ViewBounds | null, followMap: boolean, selectedId: string | null) {
  const trails = filterTrailConditions(data?.trails.items || [], query);
  const alerts = filterOfficialAlerts(data?.alerts.items || [], query, now);
  const scoped = filterConditionsInView(trails, alerts, bounds, followMap);
  const located = scoped.trails.filter(hasTrailLocation);
  const summary: ConditionsViewSummary = {
    inView: followMap && bounds !== null, mapReady: bounds !== null,
    routeCount: new Set(located.map(item => item.trailId)).size,
    locatedTrailCount: located.length,
    locatedAlertCount: scoped.alerts.filter(item => item.polygons.length > 0).length,
    unlocatedTrailCount: scoped.unlocatedTrails.length, unlocatedAlertCount: scoped.unlocatedAlerts.length,
    outsideSelection: false,
  };
  // Preserve an explicitly selected card while the camera settles or moves elsewhere.
  const selectedTrail = trails.find(item => item.id === selectedId);
  const selectedAlert = alerts.find(item => item.id === selectedId);
  if (selectedTrail && !scoped.trails.some(item => item.id === selectedId)) { scoped.trails = [selectedTrail, ...scoped.trails]; summary.outsideSelection = true; }
  if (selectedAlert && !scoped.alerts.some(item => item.id === selectedId)) { scoped.alerts = [selectedAlert, ...scoped.alerts]; summary.outsideSelection = true; }
  return { summary, data: data ? { ...data, trails: { ...data.trails, items: scoped.trails }, alerts: { ...data.alerts, items: scoped.alerts } } : null };
}
