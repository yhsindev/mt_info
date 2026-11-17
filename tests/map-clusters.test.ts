import { describe, expect, it } from 'vitest';
import { CLUSTER_LIST_LIMIT, EQUIPMENT_TYPES, equipmentClusterSource, equipmentFeatureCollections, equipmentLayerIds, equipmentSourceId, TAIWAN_BOUNDS, TAIWAN_WITH_ISLANDS_BOUNDS } from '../src/map-clusters';
import type { Equipment, EquipmentType } from '../src/shared/types';
const point = (id: string, type: EquipmentType, longitude: number | null = 121, latitude: number | null = 24) => ({ id, type, name: id, longitude, latitude } as Equipment);
describe('nationwide native equipment clustering', () => {
  it('preserves co-located devices and separates rare equipment types from AED', () => {
    const collections = equipmentFeatureCollections([point('aed1','AED'),point('aed2','AED'),point('pac','PAC'),point('box','FIRST_AID')]);
    expect(collections.AED.features.map(f => f.properties.id)).toEqual(['aed1','aed2']);
    expect(collections.PAC.features.map(f => f.properties.id)).toEqual(['pac']); expect(collections.FIRST_AID.features.map(f => f.properties.id)).toEqual(['box']);
    expect(collections.AED.features[0].geometry.coordinates).toEqual([121,24]);
  });
  it('never plots unknown, non-finite or invalid coordinates', () => {
    const collections = equipmentFeatureCollections([point('missing','AED',null),point('missing-lat','PAC',121,null),point('nan','AED',NaN),point('infinite','PAC',121,Infinity),point('bad-longitude','AED',181),point('bad-latitude','FIRST_AID',121,91),point('valid','FIRST_AID',119.5,23.5)]);
    expect(Object.values(collections).flatMap(c => c.features).map(f => f.id)).toEqual(['valid']);
  });
  it('passes all nationwide points to worker-based clustering without collapsing or truncating records', () => {
    const records = Array.from({length:16_000},(_,index) => point(`aed-${index}`,'AED',120 + index % 100 * 0.01,22 + Math.floor(index / 100) * 0.02)); records.push(point('rare-pac','PAC'),point('rare-box','FIRST_AID'));
    const collections = equipmentFeatureCollections(records); expect(collections.AED.features).toHaveLength(16_000); expect(collections.PAC.features).toHaveLength(1); expect(collections.FIRST_AID.features).toHaveLength(1);
    const source = equipmentClusterSource(collections.AED); expect(source.cluster).toBe(true); expect(source.clusterMaxZoom).toBe(15); expect(Object.keys(source.clusterProperties ?? {})).toEqual(EQUIPMENT_TYPES); expect(source.data).toBe(collections.AED); expect(CLUSTER_LIST_LIMIT).toBeLessThan(100);
  });
  it('gives sources and layers distinct ids and includes Taiwan’s offshore islands in overview bounds', () => {
    expect(new Set(EQUIPMENT_TYPES.map(equipmentSourceId)).size).toBe(3); expect(new Set(EQUIPMENT_TYPES.flatMap(equipmentLayerIds)).size).toBe(15);
    expect(TAIWAN_BOUNDS).toEqual([[119.15,21.65],[122.15,25.55]]);
    const [[west,south],[east,north]] = TAIWAN_WITH_ISLANDS_BOUNDS;
    for (const [lng,lat] of [[118.32,24.44],[119.57,23.57],[119.94,26.16],[120.75,21.94],[121.61,25.13]]) expect(lng >= west && lng <= east && lat >= south && lat <= north).toBe(true);
  });
});
