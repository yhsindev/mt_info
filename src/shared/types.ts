export type RegionId = 'xueshan' | 'daba';
export type DataMode = 'live' | 'demo';
export type DataStatus = 'ready' | 'demo' | 'stale' | 'missing' | 'error' | 'unconfigured' | 'disabled';
export type LayerId = 'equipment' | 'weather' | 'conditions' | 'basins';
export type EquipmentType = 'AED' | 'PAC' | 'FIRST_AID';
export interface SourceInfo { name: string; url: string; dataset?: string; license?: string }
export interface Equipment {
  id: string; type: EquipmentType; name: string; place: string;
  address?: string | null;
  latitude: number | null; longitude: number | null;
  placement: string | null; access: string | null; manager: string | null;
  source: SourceInfo; publishedAt: string | null; fetchedAt: string | null;
  checkedAt: string | null; checkNote: string; coordinateNote?: string;
  regions: RegionId[];
}
export interface EquipmentResponse { items: Equipment[]; status: DataStatus; fetchedAt: string | null; message?: string }
export type WeatherKind = 'forecast' | 'observation' | 'qpf' | 'radar' | 'alerts';
export interface WeatherItem {
  id: string; name: string; latitude?: number; longitude?: number;
  value: number | null; unit: string;
  status?: 'ready' | 'stale' | 'missing';
  metric: 'temperature' | 'probability' | 'rain' | 'condition';
  startsAt: string; endsAt: string; description?: string;
}
export interface WeatherProduct {
  id: string; title: string; kind: WeatherKind; status: DataStatus;
  source: SourceInfo; issuedAt: string | null; validFrom: string | null;
  validTo: string | null; fetchedAt: string | null;
  items: WeatherItem[]; message: string;
}
export interface WeatherResponse { mode: DataMode; region: RegionId; fetchedAt: string; products: WeatherProduct[] }
export interface BasinSelection { id: string; name: string; basin: string; year: string; area?: string }
