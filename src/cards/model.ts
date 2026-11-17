import { CARD_CATALOG, QUIZ_QUESTIONS, ROLES, getCard, type CardDefinition, type CardId, type RoleDefinition } from './catalog';

export type { CardId, CardDefinition, RoleId, RoleDefinition } from './catalog';
export interface CollectedCard {
  cardId: CardId;
  artworkVersion: 1;
  firstObtainedAt: string;
  lastObtainedAt: string;
  count: number;
}
export interface CardCollection { schemaVersion: 1; cards: CollectedCard[] }

export function emptyCollection(): CardCollection { return { schemaVersion: 1, cards: [] }; }

export function scoreQuiz(answers: Readonly<Record<string, string>>): RoleDefinition | null {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)
    || Object.keys(answers).length !== QUIZ_QUESTIONS.length
    || Object.keys(answers).some(id => !QUIZ_QUESTIONS.some(question => question.id === id))) return null;
  const scores = new Map(ROLES.map(role => [role.id, 0]));
  for (const question of QUIZ_QUESTIONS) {
    if (!Object.prototype.hasOwnProperty.call(answers, question.id)) return null;
    const choice = question.choices.find(item => item.id === answers[question.id]);
    if (!choice) return null;
    scores.set(choice.role, (scores.get(choice.role) || 0) + 1);
  }
  // Ties follow ROLES order, independent of object insertion or answer editing order.
  return ROLES.reduce((best, role) => (scores.get(role.id) || 0) > (scores.get(best.id) || 0) ? role : best);
}

function secureRandomByte(): number {
  if (!globalThis.crypto?.getRandomValues) throw new Error('目前無法產生隨機卡片，請稍後再試。');
  return globalThis.crypto.getRandomValues(new Uint8Array(1))[0];
}

export function drawCard(randomByte: () => number = secureRandomByte): CardDefinition {
  const byte = randomByte();
  if (!Number.isInteger(byte) || byte < 0 || byte > 255) throw new RangeError('隨機值必須為 0 至 255 的整數。');
  // Eight cards divide all 256 possible byte values evenly; no modulo bias.
  return CARD_CATALOG[byte % 8];
}

export function recordCard(collection: CardCollection, cardId: CardId, now = new Date().toISOString()): CardCollection {
  const card = getCard(cardId);
  if (!card) throw new Error('這張卡片不在目前圖鑑中。');
  const timestamp = new Date(now).toISOString();
  const existing = collection.cards.find(item => item.cardId === cardId);
  if (existing && (!Number.isSafeInteger(existing.count) || existing.count < 1 || existing.count === Number.MAX_SAFE_INTEGER)) throw new Error('卡片取得次數超出可保存範圍。');
  return {
    schemaVersion: 1,
    cards: existing ? collection.cards.map(item => item.cardId === cardId ? {
      ...item, count: item.count + 1,
      // Clock changes must not put the last acquisition before an earlier one.
      lastObtainedAt: Date.parse(timestamp) >= Date.parse(item.lastObtainedAt) ? timestamp : item.lastObtainedAt,
    } : { ...item }) : [...collection.cards.map(item => ({ ...item })), {
      cardId, artworkVersion: card.artworkVersion, firstObtainedAt: timestamp, lastObtainedAt: timestamp, count: 1,
    }],
  };
}
