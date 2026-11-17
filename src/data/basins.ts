/** Verified against official API catalog and tile 10/440/856 on 2026-10-14. */
export const basinSource = {
  name: '農業部農村發展及水土保持署 全臺子集水區範圍圖',
  url: 'https://data.ardswc.gov.tw/Data/OpenData/Api',
  tiles: 'https://gis.ardswc.gov.tw/api/ardswc/vectortiles/shp/subbasin/{z}/{y}/{x}.pbf',
  sourceLayer: 'default',
  year: '110 年度（2021）',
  license: '政府資料開放授權條款第 1 版',
  licenseUrl: 'https://data.ardswc.gov.tw/DataSpecification/LicenseClause',
  idField: 'ws_id', nameField: 'ws_name', basinField: 'basin_name',
  catalogCount: 839,
  notes: '官方顯示用向量圖磚；幾何經切片／簡化，不作精密水文計算。area 單位未核實，branch 是管理分局，不能推作下游流向。',
} as const;
