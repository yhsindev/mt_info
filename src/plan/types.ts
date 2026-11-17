import type { ConditionsStatus } from '../shared/conditions';

export interface PlanLeg {
  id: string; from: string; to: string;
  minutes: number | null; restMinutes: number | null;
  distanceKm: number | null; ascentM: number | null; descentM: number | null;
  load: 'full' | 'light'; sourceUrl: string;
}
export interface PlanWater {
  primary: string; backup: string; note: string;
  availability: 'unknown' | 'reported' | 'confirmed' | 'dry'; reportedAt: string; sourceUrl: string;
  perPersonL: number | null; cookingL: number | null; reserveL: number | null; detourMinutes: number | null;
}
export interface PlanLodging {
  name: string; backup: string; reservation: 'unknown' | 'planned' | 'applied' | 'approved'; approvalReference: string; sourceUrl: string;
}
export interface PlanRetreat {
  decisionPoint: string; deadline: string; trigger: string; route: string; confirmed: boolean; sourceUrl: string;
}
export interface PlanDay {
  id: string; label: string; startTime: string; legs: PlanLeg[];
  water: PlanWater; lodging: PlanLodging; retreat: PlanRetreat; menu: string; notes: string;
}
export interface PlanAdvisory {
  id: string; title: string; description: string; publisher: string; sourceUrl: string;
  issuedAt: string | null; closureDate: string | null; expectedOpeningDate: string | null;
  capturedAt: string; sourceCheckedAt: string | null; sourceStatus: ConditionsStatus;
}
export interface PlanDraft {
  schemaVersion: 1; id: string; title: string; routeName: string; referenceRouteId: string | null;
  startDate: string; members: number | null;
  leader: string; leaderPhone: string; keeper: string; keeperPhone: string;
  checkInPlan: string; overdueAt: string; communication: string; gear: string; notes: string; reviewNotes: string;
  days: PlanDay[]; advisories: PlanAdvisory[]; createdAt: string; updatedAt: string;
}
export interface PlanTotal { known: number; missing: number; complete: boolean; value: number | null }
export interface PlanTime { time: string; dayOffset: number }
export interface PlanLegTiming { id: string; depart: PlanTime | null; arrive: PlanTime | null; afterRest: PlanTime | null }
export interface PlanDayCalculation {
  id: string; date: string | null; legs: PlanLegTiming[]; finish: PlanTime | null;
  distanceKm: PlanTotal; ascentM: PlanTotal; descentM: PlanTotal;
  travelMinutes: PlanTotal; restMinutes: PlanTotal; totalMinutes: PlanTotal; waterLitres: number | null;
}
export interface PlanIssue { id: string; level: 'missing' | 'review'; message: string; dayId?: string }
export interface PlanCalculation {
  days: PlanDayCalculation[]; endDate: string | null; distanceKm: PlanTotal; ascentM: PlanTotal; descentM: PlanTotal; totalMinutes: PlanTotal; waterLitres: PlanTotal; issues: PlanIssue[];
}
