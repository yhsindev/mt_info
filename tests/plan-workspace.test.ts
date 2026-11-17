import { describe, expect, it } from 'vitest';
import { createDabaPlan, DABA_REFERENCE_CHECKED_AT, DABA_REFERENCE_URL } from '../src/plan/reference';
import { originalLegReference } from '../src/plan/workspace';
import { createPlanFromTemplate } from '../src/plan/catalog';

describe('工作區來源參考與本隊時間', () => {
  it('keeps the original official minutes when the team changes its schedule', () => {
    const draft = createDabaPlan(), leg = draft.days[0].legs[0];
    leg.minutes = 480;
    expect(originalLegReference(draft, leg)).toEqual({ minutes: 360, sourceUrl: DABA_REFERENCE_URL, checkedAt: DABA_REFERENCE_CHECKED_AT });
    expect(leg.minutes).toBe(480);
  });

  it('does not attach Daba times to a renamed, unlinked or differently attributed segment', () => {
    const draft = createDabaPlan(), leg = draft.days[0].legs[0];
    expect(originalLegReference(draft, { ...leg, to: '自行調整的終點' })).toBeNull();
    expect(originalLegReference(draft, { ...leg, id: 'new-segment' })).toBeNull();
    expect(originalLegReference(draft, { ...leg, sourceUrl: 'https://example.test/other-source' })).toBeNull();
    expect(originalLegReference({ ...draft, referenceRouteId: null }, leg)).toBeNull();
    expect(originalLegReference({ ...draft, referenceRouteId: '139' }, leg)).toBeNull();
  });

  it('keeps an attributed guide reference when team minutes change and detaches it on route or endpoint changes', () => {
    const draft = createPlanFromTemplate('baigu'), leg = draft.days[0].legs[0];
    leg.minutes = 200;
    expect(originalLegReference(draft, leg)).toMatchObject({minutes:170, sourceName:'健行筆記編輯'});
    expect(originalLegReference(draft, {...leg, from:leg.to, to:leg.from})).toBeNull();
    expect(originalLegReference(draft, {...leg, sourceUrl:'https://example.test/other'})).toBeNull();
    expect(originalLegReference({...draft, routeName:'另外的路線'}, leg)).toBeNull();
    expect(leg.minutes).toBe(200);
  });
});
