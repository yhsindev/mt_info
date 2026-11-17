import type { SourceInfo } from '../src/shared/types.js';
import type { RainMapCatalog, RainMapFrame, RainMapProduct, RainMapProductId } from '../src/shared/rain-maps.js';
import { NCDR_MPAS_PAGE_URL } from '../src/shared/rain-maps.js';

export const RAIN_MAP_CATALOG_CHECKED_AT = '2026-10-22';

const cwaSource: SourceInfo = {
  name: '交通部中央氣象署',
  url: 'https://www.cwa.gov.tw/V8/C/P/QPF.html',
  dataset: '官網定量降水預報圖（6／12 小時累積）',
};

/**
 * These fixed public chart paths are present in CWA's QPF page itself.
 * No browser input is ever interpolated into a source host or an arbitrary path.
 * The catalog has no forecast timestamp: PNGs have only image chunks, and the
 * source page's DataTime is a browser cache-buster, not a publication time.
 */
function cwaProduct(accumulationHours: 6 | 12): RainMapProduct {
  const frames: RainMapFrame[] = [];
  for (let end = accumulationHours; end <= 48; end += accumulationHours) {
    const imageUrl = `https://www.cwa.gov.tw/Data/fcst_img/QPF_ChFcstPrecip_${accumulationHours}_${String(end).padStart(2,'0')}.png`;
    frames.push({
      id: `cwa-${accumulationHours}h-${end}`,
      label: `+${end} h`,
      imageUrl,
      leadHours: end,
      validFrom: null,
      validTo: null,
    });
  }
  return {
    id: accumulationHours === 6 ? 'cwa-qpf-6h' : 'cwa-qpf-12h',
    title: `氣象署・${accumulationHours} 小時累積雨量`,
    status: 'available',
    source: cwaSource,
    display: 'official-chart',
    pageUrl: null,
    experimental: false,
    catalogCheckedAt: '2026-10-15',
    accumulationHours,
    horizonHours: 48,
    issuedAt: null,
    timeStatus: 'on-image',
    frames,
    message: '官方預報圖瀏覽已啟用；發布、有效時間與雨量級距請看原圖。未取得可驗證的機器時間，無法自動判斷圖檔是否過期。圖檔載入失敗時請重試或開啟官方來源。',
  };
}

/** Catalog construction performs no full-Taiwan download; browsers load one selected official chart. */
export function getRainMaps(selected?: RainMapProductId): RainMapCatalog {
  const ncdr: RainMapProduct = {
    id: 'ncdr-mpas',
    title: 'NCDR・MPAS 兩週降雨',
    status: 'available',
    source: { name: '國家災害防救科技中心 WATCH', url: NCDR_MPAS_PAGE_URL, dataset: 'MPAS 雙週降雨官方實驗展示', license: '原頁瀏覽；圖文使用依 WATCH 說明' },
    display: 'official-page',
    pageUrl: NCDR_MPAS_PAGE_URL,
    experimental: true,
    catalogCheckedAt: RAIN_MAP_CATALOG_CHECKED_AT,
    accumulationHours: null,
    horizonHours: null,
    issuedAt: null,
    timeStatus: 'on-page',
    frames: [],
    message: '在此瀏覽 NCDR 官方雙週頁。MPAS 全球模式採 60–15 km 可變網格，為實驗性產品；模擬時間與各日雨量依原頁標示。不解析、轉存圖表或推算山區點值。',
  };
  const products = [cwaProduct(6), cwaProduct(12), ncdr];
  return {
    catalogCheckedAt: RAIN_MAP_CATALOG_CHECKED_AT,
    products: selected ? products.filter(product => product.id === selected) : products,
  };
}

export function rainMapProductId(value: unknown): RainMapProductId | undefined | null {
  return value === undefined ? undefined : value === 'cwa-qpf-6h' || value === 'cwa-qpf-12h' || value === 'ncdr-mpas' ? value : null;
}
