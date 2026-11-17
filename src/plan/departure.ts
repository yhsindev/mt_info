import { calculatePlan } from './model';
import type { PlanDraft, PlanIssue, PlanTotal } from './types';

export type DepartureTarget = 'basics' | 'itinerary' | 'water' | 'lodging' | 'retreat' | 'notes';
export interface DepartureEdit { dayId?: string; target: DepartureTarget; revision: number }
export function departureTarget(issue: PlanIssue): DepartureTarget {
  if (issue.id === 'plan-days') return 'itinerary';
  if (issue.id.includes('-water-')) return 'water';
  if (issue.id.includes('-lodging')) return 'lodging';
  if (issue.id.includes('-retreat')) return 'retreat';
  if (issue.dayId) return 'itinerary';
  return issue.id === 'plan-communication' ? 'notes' : 'basics';
}
export function departureIssues(draft: PlanDraft) {
  return calculatePlan(draft).issues.filter(issue => issue.id !== 'plan-gear' && !issue.id.startsWith('advisory-'));
}
export function departureDuration(total: PlanTotal) {
  if (!total.complete && total.known === 0) return `未知 · ${total.missing} 項待填`;
  const hours = Math.floor(total.known / 60), minutes = total.known % 60;
  return `${total.complete ? '' : '已填 '}${hours} 小時 ${minutes} 分${total.complete ? '' : ` · ${total.missing} 項未知`}`;
}
export function compareDepartureDays(main: PlanDraft, backup: PlanDraft) {
  const content = (day: PlanDraft['days'][number]) => JSON.stringify({ ...day, id: '', legs: day.legs.map(leg => ({ ...leg, id: '' })) });
  return Array.from({ length: Math.max(main.days.length, backup.days.length) }, (_, index) => ({
    index, main: main.days[index] ?? null, backup: backup.days[index] ?? null,
    changed: !main.days[index] || !backup.days[index] || content(main.days[index]) !== content(backup.days[index]),
  }));
}
