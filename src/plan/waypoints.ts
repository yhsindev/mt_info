import type { PlanWaypointSource } from '../shared/plan-waypoints';
import type { PlanDay } from './types';

export interface PlanWaypoint {
  id: string;
  number: number;
  name: string;
  coordinate: [number, number] | null;
  source: PlanWaypointSource | null;
  visits: { dayIndex: number; legId: string; side: 'from' | 'to' }[];
}

function sourceNames(source: PlanWaypointSource) {
  return new Set([source.name, ...source.aliases].map(name => name.trim()).filter(Boolean));
}

function validCoordinate(source: PlanWaypointSource) {
  return Number.isFinite(source.longitude) && source.longitude >= -180 && source.longitude <= 180
    && Number.isFinite(source.latitude) && source.latitude >= -90 && source.latitude <= 90;
}

/** Names are matched explicitly; ambiguous or invalid source records remain unlocated. */
function sourceLookup(sources: readonly PlanWaypointSource[]) {
  const idCount = new Map<string, number>();
  for (const source of sources) idCount.set(source.id, (idCount.get(source.id) || 0) + 1);
  const lookup = new Map<string, PlanWaypointSource | null>();
  for (const source of sources) {
    const valid = !!source.id.trim() && !!source.name.trim() && idCount.get(source.id) === 1 && validCoordinate(source);
    for (const name of sourceNames(source)) {
      lookup.set(name, lookup.has(name) || !valid ? null : source);
    }
  }
  return lookup;
}

/** Number the whole itinerary once, including text-only points and repeat visits. */
export function buildPlanWaypoints(days: readonly PlanDay[], referenceRouteId: string | null, sources: readonly PlanWaypointSource[]): PlanWaypoint[] {
  const lookup = sourceLookup(referenceRouteId === '027' ? sources : []);
  const points: PlanWaypoint[] = [], byIdentity = new Map<string, PlanWaypoint>();
  days.forEach((day, dayIndex) => {
    day.legs.forEach((leg, legIndex) => {
      for (const side of ['from', 'to'] as const) {
        const name = leg[side].trim(), source = lookup.get(name) || null;
        const identity = source ? `source:${source.id}` : name ? `name:${name}` : `empty:${dayIndex}:${legIndex}:${side}`;
        let point = byIdentity.get(identity);
        if (!point) {
          const number = points.length + 1;
          point = { id: `waypoint-${number}`, number, name, coordinate: source ? [source.longitude, source.latitude] : null, source, visits: [] };
          byIdentity.set(identity, point); points.push(point);
        }
        point.visits.push({ dayIndex, legId: leg.id, side });
      }
    });
  });
  return points;
}

export function waypointForVisit(points: readonly PlanWaypoint[], legId: string, side: 'from' | 'to'): PlanWaypoint | undefined {
  return points.find(point => point.visits.some(visit => visit.legId === legId && visit.side === side));
}
