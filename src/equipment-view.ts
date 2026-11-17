import type { Equipment, EquipmentType } from './shared/types';

const normalize = (value: string) => value.trim().toLocaleLowerCase().replaceAll('台', '臺');
const order: Record<EquipmentType, number> = { PAC: 0, FIRST_AID: 1, AED: 2 };

/** Search the national catalogue, including address; missing fields stay unknown. */
export function filterEquipment(items: Equipment[], type: 'ALL' | EquipmentType, query: string): Equipment[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  return items.filter(item => {
    if (type !== 'ALL' && item.type !== type) return false;
    if (!words.length) return true;
    const haystack = normalize(`${item.name} ${item.place} ${item.address || ''} ${item.placement || ''} ${item.type} ${item.type === 'FIRST_AID' ? '急救箱' : item.type === 'PAC' ? '加壓袋' : '自動體外心臟電擊去顫器'}`);
    return words.every(word => haystack.includes(word));
  });
}

/** Keep the small, sourced mountain seed collection discoverable beside national AEDs. */
export function orderEquipment(items: Equipment[]): Equipment[] {
  return [...items].sort((a, b) => order[a.type] - order[b.type]);
}

/** Bound DOM work without dropping map points or hiding a point selected on the map. */
export function equipmentPage(items: Equipment[], limit: number, selectedId: string | null): Equipment[] {
  const page = items.slice(0, limit);
  if (selectedId && !page.some(item => item.id === selectedId)) {
    const selected = items.find(item => item.id === selectedId);
    if (selected) return [selected, ...page.slice(0, Math.max(limit - 1, 0))];
  }
  return page;
}
