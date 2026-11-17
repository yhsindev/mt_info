# 第三方資料與素材

本專案原創程式碼採根目錄的 [MIT License](LICENSE)。MIT 不取代下列資料、外部服務、套件與引用內容原本的條款；資料發布、查閱或巡檢時間也不因此改變。

| 內容 | 來源與適用說明 |
| --- | --- |
| `data/aed-national.json`、`data/aed-regional.json` 中的官方名錄 | 衛生福利部醫事司 AED 位置資訊，資料集12063，依政府資料開放授權條款第1版；來源網址、下載日期與雜湊保留於檔案及來源清冊。官方場所聯絡欄不是專案維護者或隊伍的私人聯絡資料，不能當作即時救援或設備可用保證。 |
| `data/trail-geometries.json` 中的官方線資料 | 林業及自然保育署／農業部已核實的開放資料，個別來源、授權、下載日期與覆蓋限制見 [TRAIL_GEOMETRY.md](docs/TRAIL_GEOMETRY.md)。 |
| `data/plan-waypoints-daba.json` | 兩筆OSM來源依ODbL-1.0並保留 © OpenStreetMap contributors 顯名；其餘官方位置依各筆 `license`、`licenseUrl` 與 `sourceUrl`，不能將整份彙整檔標成單一政府或MIT授權。 |
| 路線、分段、水源／宿營事實摘要 | 保留原文網址、發布者／作者、日期及未知狀態。官方、健行筆記編輯介紹、作者心得與出版社索引各自顯名；不包含遊記全文、照片、第三方地圖或可重發的山友GPX。必要事實摘要與索引不表示取得原作的再授權。 |
| 雨量圖、MPAS、路況及CAP | 執行時由已記錄的官方來源取得或開啟原頁；公開程式庫不收錄官方圖片快取、CAP執行期快取或登入內容。原發布單位與服務條款持續適用。 |
| OSM線上底圖與政府圖磚 | 執行時依視野載入，保留原顯名；本程式庫沒有離線圖磚包。OSM資料授權與公共圖磚使用政策分開適用。 |
| 字型與npm套件 | Noto Sans TC由外部字型服務載入；Georgia等字型使用系統字型。沒有隨程式庫散布商用字型檔。套件授權以各套件附帶的LICENSE為準，版本見 `package-lock.json`，不將相依套件改標MIT。 |
| 專案SVG與山行卡 | 專案內原創圖形與程式產生的卡面；沒有收錄他站照片或歌曲音檔、歌詞、曲譜。山歌索引只連回來源。 |

完整來源與時間說明：[DATA_SOURCES.md](docs/DATA_SOURCES.md)、[PLAN_CATALOG.md](docs/PLAN_CATALOG.md)、[路線研究資料](data/route-library/README.md)。

資料若需更正或移除，請在Issue中提供檔案位置與來源連結；不要附上私人電話、隊伍名單、許可證、金鑰或未公開軌跡。
