# 有公告步道的官方參考路線

2026-10-21 第一階段只匯入四條已核實路線，當時用於路況地圖。2026-10-22 路況介面改為公告看板，已移除該地圖；幾何資料、來源與驗證保留，以下為資料能力與歷史顯示界線。幾何表示步道位置，**並非災點、受災線段或全線封閉範圍**；是否封閉、影響哪一支線，仍以路況公告原文為準。沒有對任意公告文字進行自動地理編碼。

2026-10-27 新增第 5 條：`119` 北大武山步道的官方開放幾何。它只涵蓋**舊登山口至山頂及檜谷山莊支線**，不含新登山口接近路段。這次只增加資料層的精確 ID／名稱 lookup，未擴大計畫通公開 API 的路線白名單，也未將圖資取得當成路線開放確認。

## 來源與本次核對

| ID／官方名稱 | 政府資料集 | 正式 MOA 目錄 | 來源檔建立日 | 匯入幾何 |
| --- | --- | --- | --- | --- |
| 002 南澳古道 | [26979](https://data.gov.tw/dataset/26979) | [DataId=421](https://data.moa.gov.tw/api/FileToJson.ashx?DataId=421&DataTable=OpenDataList) | 2025-05-09 | LineString，168 頂點 |
| 027 大霸尖山登山步道 | [27000](https://data.gov.tw/dataset/27000) | [DataId=438](https://data.moa.gov.tw/api/FileToJson.ashx?DataId=438&DataTable=OpenDataList) | 2020-07-24 | LineString，131 頂點 |
| 054 唐麻丹山步道 | [27342](https://data.gov.tw/dataset/27342) | [DataId=455](https://data.moa.gov.tw/api/FileToJson.ashx?DataId=455&DataTable=OpenDataList) | 2020-07-24 | MultiLineString，合計 791 頂點 |
| 057 馬崙山步道 | [27345](https://data.gov.tw/dataset/27345) | [DataId=458](https://data.moa.gov.tw/api/FileToJson.ashx?DataId=458&DataTable=OpenDataList) | 2020-10-16 | LineString，197 頂點 |
| 119 北大武山步道 | [31123](https://data.gov.tw/dataset/31123) | [DataId=490](https://data.moa.gov.tw/api/FileToJson.ashx?DataId=490&DataTable=OpenDataList) | 2020-07-24 | MultiLineString，3 段／1,231 頂點 |

上述政府資料集標示政府資料開放授權條款第 1 版、每四年更新。這是來源的名目更新週期，不代表步道路線、現場通行狀況或幾何精度每四年均有現地查核。完整 KMZ 下載 URL、SHA-256、來源檔建立日、實際下載與核對時間保存於 `data/trail-geometries.json`，沒有保存來源文章、照片、XSL 或可執行 HTML。

最初四筆實際下載時間為 2026-10-21 14:13:05–14:13:06 UTC，核對時間隨後，兩欄分開保存。北大武另外保存本次 2026-10-27 的下載與核對時間，沒有重寫其他四筆的舊匯入日期。`geometryDate` 五筆皆為 **null**：來源檔 `CreateDate`、政府目錄修訂時間與幾何實際測製日期不同，不能替代。幾何沒有加上「2026 年最新路線」標籤。

2026-10-25 為計畫通重下載核對大霸 `027`：仍只有 131 個線點、沒有命名 Point，範圍為馬達拉溪附近至大小霸山區，**不含觀霧至馬達拉溪約 19 公里林道**。計畫通不再稱其為完整全線；另收錄的 5 個路點有獨立官方／OSM 來源，未從這份線資料內插。OSM 登山口與舊 KMZ 端點約百公尺差異保留，未強接，詳 [大霸路點查核](research/DABA_WAYPOINTS_2026-10-25.md)。這次重核不改寫原幾何匯入日期，也未取得測製日。

四條皆於匯入時在正式 [OpenStatus/Trail](https://recreation.forest.gov.tw/mis/api/OpenStatus/Trail) 有公告。核對以正式 [BasicInfo/Trail](https://recreation.forest.gov.tw/mis/api/BasicInfo/Trail) 的 `TRAILID`、`TR_CNAME`、官方步道頁 URL，再對照 KML 路線名稱；檔內存在 `TRAILID` 或官方頁 URL 時也須一致。南澳、大霸、唐麻丹檔內可核實 ID；馬崙檔內未提供 ID，以已核實政府資料集、來源檔名 `057_馬崙山步道`、官方目錄及 KML 路線名稱交叉核對。

資料品質反例：[能高西段資料集 38461](https://data.gov.tw/dataset/38461)曾以 `065` 命名，但實際 2026 年 KMZ 描述表為 `TRAILID=64`、URL `tr_id=064`。本輪沒有匯入這筆，也沒有把 65 自動配成 64。對接不能只依檔名前綴，名稱／網址衝突會使匯入失敗並保留原成功清冊。

### 北大武的範圍查核

來源為農業部／林業及自然保育署公開的[資料集 31123](https://data.gov.tw/dataset/31123)，明示採[政府資料開放授權第 1 版](https://data.gov.tw/license)。匯入的 GeoJSON 保留提供機關、來源目錄、授權、下載 URL 及 SHA-256；只轉製線座標、省略高度，未保存描述 HTML 或圖像。正式目錄的 `FileUrl` 指向 `https://data.moa.gov.tw/OpenData/GetOpenDataFile.aspx?id=490&FileType=DataMore&RID=2089`，回傳 16,516 bytes 的 KMZ；實際內容不是原生 GPX，不應改稱山友實走軌跡。

2026-10-27 同一官方來源分別讀取兩次，SHA-256 一致；檔名、KML 名稱、嵌入 `TRAILID=119` 和[官方步道目錄](https://recreation.forest.gov.tw/mis/api/BasicInfo/Trail)相符。三段線保留原始分段：舊登山口至檜谷岔路、岔路至山頂、岔路至檜谷山莊。所有座標範圍約為經度 120.714585–120.761421、緯度 22.612421–22.627051。

端點交叉核對使用官方[115 年 2 月可通訊點標示資訊](https://www.forest.gov.tw/UserFiles/001/Images/web/communication_11502.pdf)：舊登山口 120.71450／22.62450、檜谷山莊 120.74209／22.61526、山頂 120.76130／22.62706。這是來源識別與範圍核對，不是宣稱這份線資料具有特定測量精度。新登山口 120.70222／22.61505 位於線資料西界外；**不得把新、舊登山口之間補成直線，也不能將範本的整趟距離套在這份幾何上**。

資料檢查另保留北大武的區域範圍與這三個端點檢查。後續官方資料若改為涵蓋新登山口，匯入會停止要求重新查核，避免仍沿用「舊登山口」說明接受已變動的幾何。檔案建立日是 2020-07-24，實際測製日期仍未知；目前供水、山屋床位及道路／步道通行須各自查核。

## 型別與顯示界線

`TrailCondition.location?: TrailLocation` 與舊 `latitude/longitude` 分開。後者仍為 null：現有官方入口 X/Y 尚未取得明確 CRS 文件，也不能把步道入口改寫成災點。

`TrailLocation` 包含 `kind: route | entrance`、GeoJSON geometry、來源、`checkedAt`、`geometryDate`、說明。本輪只有 `kind=route`，沒有入口替代種子。KML 已是明確經緯度座標，以 `[longitude, latitude]` 匯入；只省略高度，不猜測投影、不移動路徑、沒有按公告里程切線或新增點位。顯示名稱統一說明「官方步道參考路線；表示這條步道有公告，並非災點或全線封閉範圍」。

伺服器 lookup 同時比對 ID 和名稱；沒種子、名稱不符、未能對官方目錄的公告保持沒有 `location`，文字清單仍可用。五筆是有限示範覆蓋的**真實官方資料**，不是合成示範，也不是完整全臺步道網。沒有路線或地圖上的空白不能解讀為沒有公告或沒有災害。

公告 ID 由 `TRAILID` 與公告內容／日期／支線／狀態的穩定雜湊組成，避免官方回應換序讓選取跳到別條公告；官方公告內容實際變動時會得到新 ID。來源時效沿用 `src/shared/conditions-freshness.ts` 的共用門檻，服務選項仍可覆寫。文字來源成功查核不會推進這份靜態幾何的 `checkedAt`。

## 重新匯入

```sh
node --use-system-ca --import tsx scripts/import-trail-geometries.ts
# 只更新已核實的北大武來源，保留其他路線及其既有匯入日期
node --use-system-ca --import tsx scripts/import-trail-geometries.ts --trail=119
```

腳本使用固定五條官方來源清冊；可用 `--trail=三碼步道ID` 只更新已核實的一條，其他旗標或清冊外 ID 均拒絕。先驗證官方步道目錄及路況，再查正式檔案索引、下載 KMZ、核對 ID／名稱／URL、解出一個 `doc.kml`。下載使用 TLS 驗證、15 秒 timeout、8 MB 容量限制；只接受核實的官方 URL，檔案下載重新導向最多兩次且限相同 MOA 正式檔案路徑，不接受任意代理、其他主機或私人金鑰。每條有上限的路線頂點驗證，不輸出被截斷的幾何。

KMZ 直接在記憶體讀取有界 `doc.kml`，檢查 ZIP 目錄、容量及 CRC；不將 ZIP 路徑解壓到磁碟，不執行描述中的 HTML／JavaScript 或 XSL。DOCTYPE／ENTITY、無效經緯度、名稱或 ID 矛盾均拒絕。所選來源全部成功、與舊筆合併並回驗後，才以同目錄暫存檔 rename 原子替換種子；任一來源失敗時保留原檔。這不是另一個背景輪詢程序，也不隨訪客請求下載路線。

本機初次匯入遇官方 HTTP 500，保留原狀後一次有界重試成功。往後執行若失敗，應閱讀錯誤與保留舊種子，不得補造路線或刪成空成功。

## 驗證與後續

`npx vitest run tests/trail-geometry.test.ts tests/conditions.test.ts tests/weather.test.ts` 檢查真實種子與版本欄位、精確 ID／名稱配對、65／64 衝突、未知位置、穩定公告 ID、WGS84 座標、MultiLineString、非法／過量幾何、KMZ CRC 與解壓路徑限制。

2026-10-27 北大武增補實跑 `npx vitest run tests/trail-geometry.test.ts tests/conditions.test.ts`：2 檔／42 項通過，包含 3 段／1,231 點真實資料、新登山口不在覆蓋內、範圍改動拒絕與路況 lookup；`npx tsc --noEmit` 通過。這個增補沒有修改計畫通 UI 或第三方 GPX 候選清單。

後續才逐批擴充清冊與國家公園管理範圍；明確受災里程必須核對支線、里程起點、方向與路線版本後，才能增加「公告涉及區段」。歷史紀錄、當前公告與潛勢圖層應分開顯示，不能由這份參考路線推論精確災點或安全通行。
