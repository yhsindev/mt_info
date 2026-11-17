import type { SourceInfo } from './types';
export type RainMapProductId = 'cwa-qpf-6h' | 'cwa-qpf-12h' | 'ncdr-mpas';
export const NCDR_MPAS_PAGE_URL = 'https://watch.ncdr.nat.gov.tw/watch_mpas2weeks';
export interface RainMapFrame {
  id: string;
  leadHours: number;
  label: string;
  imageUrl: string;
  validFrom: string | null;
  validTo: string | null;
}
export interface RainMapProduct {
  id: RainMapProductId;
  title: string;
  status: 'available' | 'disabled';
  source: SourceInfo;
  display: 'official-chart' | 'official-page';
  pageUrl: string | null;
  experimental: boolean;
  catalogCheckedAt: string;
  accumulationHours: number | null;
  horizonHours: number | null;
  issuedAt: string | null;
  timeStatus: 'on-image' | 'on-page';
  frames: RainMapFrame[];
  message: string;
}
export interface RainMapCatalog {
  catalogCheckedAt: string;
  products: RainMapProduct[];
}
