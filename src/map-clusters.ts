import type { FeatureCollection, Point } from 'geojson';
import type { GeoJSONSourceSpecification } from 'maplibre-gl';
import type { Equipment, EquipmentType } from './shared/types';

export const EQUIPMENT_TYPES: EquipmentType[] = ['AED', 'PAC', 'FIRST_AID'];
export const TAIWAN_BOUNDS: [[number, number], [number, number]] = [[119.15, 21.65], [122.15, 25.55]];
export const TAIWAN_WITH_ISLANDS_BOUNDS: [[number, number], [number, number]] = [[118, 21.7], [122.1, 26.45]];
export const CLUSTER_LIST_LIMIT = 60;
export const EQUIPMENT_COLORS: Record<EquipmentType, string> = { AED: '#c45b37', PAC: '#39816a', FIRST_AID: '#3b78a1' };
export interface EquipmentPointProperties { id: string; type: EquipmentType; name: string }
export type EquipmentPoints = FeatureCollection<Point, EquipmentPointProperties>;
export function equipmentSourceId(type: EquipmentType) { return `equipment-${type}`; }
export function equipmentLayerIds(type: EquipmentType) { return ['cluster', 'cluster-icon', 'cluster-count', 'point', 'point-icon'].map(part => `equipment-${type}-${part}`); }

/** One linear pass partitions nationwide points; clustering runs in MapLibre's worker, not the DOM. */
export function equipmentFeatureCollections(items: Equipment[]): Record<EquipmentType, EquipmentPoints> {
  const collections: Record<EquipmentType, EquipmentPoints> = { AED: { type: 'FeatureCollection', features: [] }, PAC: { type: 'FeatureCollection', features: [] }, FIRST_AID: { type: 'FeatureCollection', features: [] } };
  for (const item of items) {
    const { longitude, latitude } = item;
    if (longitude === null || latitude === null || !Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(longitude) > 180 || Math.abs(latitude) > 90 || !collections[item.type]) continue;
    collections[item.type].features.push({ type: 'Feature', id: item.id, geometry: { type: 'Point', coordinates: [longitude, latitude] }, properties: { id: item.id, type: item.type, name: item.name } });
  }
  return collections;
}

/** Separate sources prevent thousands of AED records from hiding rare PAC or first-aid locations. */
export function equipmentClusterSource(data: EquipmentPoints): GeoJSONSourceSpecification {
  return { type: 'geojson', data, cluster: true, clusterRadius: 46, clusterMaxZoom: 15, maxzoom: 18,
    clusterProperties: {
      AED: ['+', ['case', ['==', ['get', 'type'], 'AED'], 1, 0]],
      PAC: ['+', ['case', ['==', ['get', 'type'], 'PAC'], 1, 0]],
      FIRST_AID: ['+', ['case', ['==', ['get', 'type'], 'FIRST_AID'], 1, 0]],
    },
  };
}
