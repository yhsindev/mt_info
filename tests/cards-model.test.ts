import { afterEach, describe, expect, it, vi } from 'vitest';
import { CARD_CATALOG, QUIZ_QUESTIONS, ROLES, getCard, type RoleId } from '../src/cards/catalog';
import { drawCard, emptyCollection, recordCard, scoreQuiz } from '../src/cards/model';

const answersFor = (roles: RoleId[]) => Object.fromEntries(QUIZ_QUESTIONS.map((question, index) => [question.id, question.choices.find(choice => choice.role === roles[index])!.id]));
afterEach(() => vi.unstubAllGlobals());

describe('山行偏好與隨機卡片', () => {
  it('has six four-choice questions and eight distinct versioned cards', () => {
    expect(QUIZ_QUESTIONS).toHaveLength(6);
    expect(new Set(QUIZ_QUESTIONS.map(question => question.id)).size).toBe(6);
    for (const question of QUIZ_QUESTIONS) {
      expect(question.choices).toHaveLength(4);
      expect(new Set(question.choices.map(choice => choice.id)).size).toBe(4);
      expect(new Set(question.choices.map(choice => choice.role))).toEqual(new Set(ROLES.map(role => role.id)));
    }
    expect(CARD_CATALOG).toHaveLength(8);
    expect(new Set(CARD_CATALOG.map(card => card.id)).size).toBe(8);
    expect(new Set(CARD_CATALOG.map(card => card.number)).size).toBe(8);
    for (const card of CARD_CATALOG) expect(getCard(card.id)).toMatchObject({ artworkVersion: 1, accent: expect.stringMatching(/^#[0-9a-f]{6}$/i), paper: expect.stringMatching(/^#[0-9a-f]{6}$/i) });
    expect(getCard('unknown-card')).toBeUndefined();
  });

  it.each(ROLES)('scores consistent preferences as $id without randomness', role => {
    const answers = answersFor(Array(6).fill(role.id));
    expect(scoreQuiz(answers)).toEqual(role);
    expect(scoreQuiz(answers)).toEqual(role);
  });

  it('resolves ties by documented role order, independent of object insertion order; edited answers recalculate', () => {
    const answers = answersFor(['explorer', 'observer', 'explorer', 'observer', 'explorer', 'observer']);
    expect(scoreQuiz(answers)?.id).toBe('observer');
    expect(scoreQuiz(Object.fromEntries(Object.entries(answers).reverse()))?.id).toBe('observer');
    answers[QUIZ_QUESTIONS[5].id] = QUIZ_QUESTIONS[5].choices.find(choice => choice.role === 'explorer')!.id;
    expect(scoreQuiz(answers)?.id).toBe('explorer');
    expect(scoreQuiz(answersFor(['recorder', 'camper', 'recorder', 'camper', 'recorder', 'camper']))?.id).toBe('recorder');
  });

  it('returns no result for missing, invalid, inherited or stale-version answers', () => {
    expect(scoreQuiz({})).toBeNull();
    const answers = answersFor(Array(6).fill('observer'));
    const missing = { ...answers }; delete missing[QUIZ_QUESTIONS[0].id];
    expect(scoreQuiz(missing)).toBeNull();
    expect(scoreQuiz({ ...answers, [QUIZ_QUESTIONS[1].id]: 'not-a-choice' })).toBeNull();
    expect(scoreQuiz({ ...answers, oldQuestion: 'look' })).toBeNull();
    expect(scoreQuiz(Object.create(answers))).toBeNull();
  });

  it('maps every possible random byte equally, including both endpoints', () => {
    const counts = new Map(CARD_CATALOG.map(card => [card.id, 0]));
    for (let byte = 0; byte < 256; byte++) {
      const card = drawCard(() => byte);
      counts.set(card.id, counts.get(card.id)! + 1);
    }
    expect([...counts.values()]).toEqual(Array(8).fill(32));
    expect(drawCard(() => 0).id).toBe('ridge');
    expect(drawCard(() => 255).id).toBe('dawn');
    for (const invalid of [-1, 256, .5, NaN, Infinity]) expect(() => drawCard(() => invalid)).toThrow(RangeError);
  });

  it('uses cryptographic bytes by default and does not invent a fallback when unavailable', () => {
    const getRandomValues = vi.fn((values: Uint8Array) => { values[0] = 7; return values; });
    vi.stubGlobal('crypto', { getRandomValues });
    expect(drawCard().id).toBe('dawn'); expect(getRandomValues).toHaveBeenCalledOnce();
    vi.stubGlobal('crypto', undefined);
    expect(() => drawCard()).toThrow('無法產生隨機卡片');
  });
});

describe('山行卡收藏紀錄', () => {
  it('deduplicates a repeat while keeping acquisition times and all input objects unchanged', () => {
    const initial = emptyCollection();
    const first = recordCard(initial, 'ridge', '2026-10-26T01:00:00.000Z');
    expect(initial).toEqual({ schemaVersion: 1, cards: [] });
    const withForest = recordCard(first, 'forest', '2026-10-26T02:00:00.000Z');
    const snapshot = JSON.stringify(withForest);
    const repeated = recordCard(withForest, 'ridge', '2026-10-26T03:00:00.000Z');
    expect(repeated.cards).toHaveLength(2);
    expect(repeated.cards[0]).toEqual({ cardId: 'ridge', artworkVersion: 1, firstObtainedAt: '2026-10-26T01:00:00.000Z', lastObtainedAt: '2026-10-26T03:00:00.000Z', count: 2 });
    expect(repeated.cards[1]).toEqual(withForest.cards[1]);
    expect(repeated.cards[1]).not.toBe(withForest.cards[1]);
    expect(JSON.stringify(withForest)).toBe(snapshot); expect(first.cards[0].count).toBe(1);
  });

  it('does not move last acquisition backwards after a device clock change', () => {
    const first = recordCard(emptyCollection(), 'lake', '2026-10-26T03:00:00.000Z');
    const repeated = recordCard(first, 'lake', '2026-10-25T03:00:00.000Z');
    expect(repeated.cards[0]).toMatchObject({ count: 2, firstObtainedAt: first.cards[0].firstObtainedAt, lastObtainedAt: first.cards[0].lastObtainedAt });
    const full = { ...first, cards: [{ ...first.cards[0], count: Number.MAX_SAFE_INTEGER }] };
    expect(() => recordCard(full, 'lake')).toThrow('取得次數');
    expect(() => recordCard(first, 'lake', 'not-a-date')).toThrow();
  });
});
