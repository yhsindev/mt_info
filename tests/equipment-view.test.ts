import { describe, expect, it } from 'vitest';
import { equipmentPage, filterEquipment, orderEquipment } from '../src/equipment-view';
import type { Equipment } from '../src/shared/types';

const items = [
  { id: 'north', type: 'AED', name: '一樓大廳', place: '北部場館', address: '臺北市中正區', placement: null },
  { id: 'south', type: 'AED', name: '服務臺', place: '南部場館', address: '高雄市左營區', placement: null },
  { id: 'hut', type: 'PAC', name: '山屋', place: '山屋', address: null, placement: null },
  { id: 'kit', type: 'FIRST_AID', name: '急救箱', place: '山屋', address: null, placement: null },
] as Equipment[];

describe('national equipment browsing', () => {
  it('searches across former regions and accepts 台／臺 and multiple keywords', () => {
    expect(filterEquipment(items, 'ALL', '台北 大廳').map(item => item.id)).toEqual(['north']);
    expect(filterEquipment(items, 'ALL', '高雄').map(item => item.id)).toEqual(['south']);
    expect(filterEquipment(items, 'PAC', '高雄')).toEqual([]);
  });
  it('keeps equipment types discoverable without inventing missing metadata', () => {
    expect(orderEquipment(items).map(item => item.id)).toEqual(['hut', 'kit', 'north', 'south']);
    expect(filterEquipment(items, 'FIRST_AID', '急救箱').map(item => item.id)).toEqual(['kit']);
    expect(items[2].address).toBeNull();
  });
  it('bounds cards while retaining a selected point outside the initial page', () => {
    const large = Array.from({ length: 16_000 }, (_, n) => ({ ...items[0], id: String(n) }));
    const page = equipmentPage(large, 40, '15999');
    expect(page).toHaveLength(40);
    expect(page[0].id).toBe('15999');
    expect(new Set(page.map(item => item.id)).size).toBe(40);
    expect(large).toHaveLength(16_000);
  });
});
