import { createDabaPlan, DABA_REFERENCE_CHECKED_AT, DABA_REFERENCE_URL } from './reference';
import type { PlanDraft, PlanLeg } from './types';
import { PLAN_TEMPLATES, templateSegmentReference } from './catalog';

const referenceLegs = new Map(createDabaPlan(DABA_REFERENCE_CHECKED_AT).days.flatMap(day => day.legs).map(leg => [leg.id, leg]));

/** A source reference is shown only while the original route, segment and attribution still match. */
export function originalLegReference(draft: PlanDraft, leg: PlanLeg): { minutes: number; sourceUrl: string; checkedAt: string; sourceName?: string } | null {
  if (draft.referenceRouteId === '027' && leg.sourceUrl === DABA_REFERENCE_URL) {
    const reference = referenceLegs.get(leg.id);
    if (!reference || reference.from !== leg.from || reference.to !== leg.to || reference.minutes === null) return null;
    return { minutes: reference.minutes, sourceUrl: DABA_REFERENCE_URL, checkedAt: DABA_REFERENCE_CHECKED_AT };
  }
  const template = PLAN_TEMPLATES.find(template => template.id !== 'daba' && template.routeName === draft.routeName && template.referenceRouteId === draft.referenceRouteId);
  if (!template) return null;
  const reference = templateSegmentReference(template, leg.from, leg.to);
  if (!reference || reference.minutes === null || reference.sourceUrl !== leg.sourceUrl) return null;
  return {minutes:reference.minutes, sourceUrl:reference.sourceUrl, checkedAt:reference.checkedAt, sourceName:reference.sourceName};
}
