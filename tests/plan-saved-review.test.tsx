import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import PlanPanel from '../src/components/PlanPanel';
import { createBlankPlan } from '../src/plan/model';
import { PLAN_TEMPLATES } from '../src/plan/catalog';
import { PLAN_STORAGE_KEY } from '../src/plan/storage';

afterEach(() => vi.unstubAllGlobals());

function renderSavedRoute(routeName: string) {
  const draft = createBlankPlan('2026-10-26T12:00:00Z');
  draft.routeName = routeName;
  draft.title = `${routeName} 舊草稿`;
  const raw = JSON.stringify(draft);
  const storage = { getItem: (key: string) => key === PLAN_STORAGE_KEY ? raw : null };
  vi.stubGlobal('window', { localStorage: storage });
  const markup = renderToStaticMarkup(<PlanPanel onClose={() => undefined} localRouteName={null} localRoute={null} onImportGpx={() => undefined} onViewRoute={() => undefined} conditions={null} conditionsLoading={false} conditionsError={null} onRetryConditions={() => undefined}/>);
  return { markup, raw, storage };
}

describe('existing route drafts after a template feasibility review', () => {
  it.each(['xueshan-west-ridge', 'badaxiu-four-days', 'daxiaojian', 'pingfeng-two-days', 'zhijiayang-xueshan', 'beidawu', 'baigu'])('shows a visible review for saved %s while keeping the draft editable and unchanged', id => {
    const template = PLAN_TEMPLATES.find(route => route.id === id)!;
    const { markup, raw, storage } = renderSavedRoute(template.routeName);
    expect(markup).toContain('data-testid="plan-feasibility-review"');
    expect(markup).toContain(template.planningReview);
    expect(markup).toContain('class="plan-editor"');
    expect(markup).toContain(template.routeName);
    expect(storage.getItem(PLAN_STORAGE_KEY)).toBe(raw);
  });

  it('does not show the feasibility review on an unrelated draft', () => {
    const template = PLAN_TEMPLATES.find(route => route.id === 'yushan')!;
    const { markup } = renderSavedRoute(template.routeName);
    expect(markup).not.toContain('data-testid="plan-feasibility-review"');
  });
});
