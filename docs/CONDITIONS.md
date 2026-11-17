# 路況與官方示警

介面更新：2026-10-22。步道路況改為單頁可捲動公告看板，不展示地圖。黑色大標題、全國狀態摘要及分區捷徑協助閱讀；同頁下方另列官方警示。此工具展示官方文字與來源，不自行推算步道安全性，也不提供登山預報。

## 分區與統計

分區只使用步道來源的明確縣市，不依管理單位、座標或步道名稱猜測：北部為基隆、臺北、新北、桃園、新竹與宜蘭；中部為苗栗、臺中、彰化、南投與雲林；南部為嘉義、臺南、高雄與屏東；東部為花蓮、臺東。來源涉及多區歸「跨區」，離島或無法確認則保留「其他／待分類」。這是本站閱讀分類，並非官方預警區域。

同筆公告只歸一組，全國總數不因跨縣市重複。統計表示公告筆數，不表示災點數或全臺路線狀態；一條步道可以有多則公告。搜尋／類型篩選的結果數與全來源摘要分開。官方 CAP 不混成步道閉鎖數，適用範圍仍顯示原文。

來源未就緒時顯示「—」與來源狀態，不能顯示成查詢成功的零筆。先前成功的資料在更新失敗或超時後繼續可讀，明示舊資料並保留原始時間。通知形式目前是本頁公告整理，沒有瀏覽器推播或背景提醒。

四條已核實的南澳、大霸、唐麻丹、馬崙官方參考路線仍存於 `TrailCondition.location`，目前看板不顯示。它們與實際災點座標不同；入口 X/Y 的 CRS 也未因加入路線而視為已確認。完整版本與來源見 [TRAIL_GEOMETRY.md](TRAIL_GEOMETRY.md)。

## 版面參考

參考 [山海圳](https://recreation.forest.gov.tw/Topic/MSTW)的大標題、分段與可展開內容，以及[台灣激流實驗室水情頁](https://wwacatw.vercel.app/water-level/)的摘要、分區與公告層級；元件與樣式自行實作，沒有複製程式、圖片或安全門檻。沒有為版面增加歷史警報資料庫，已知過期 CAP 仍退出當前訊息。

## 已介接來源

| 來源 | 固定正式端點 | 官方更新頻率 | 我方查詢／過期門檻 |
| --- | --- | --- | --- |
| 林業署步道目錄 | `https://recreation.forest.gov.tw/mis/api/BasicInfo/Trail` | 不定時 | 與路況每 15 分鐘一起驗證；成功查核超過 1 小時標示過期 |
| 林業署異常路況 | `https://recreation.forest.gov.tw/mis/api/OpenStatus/Trail` | 不定時 | 同上 |
| NCDR 公開一般訂閱 | `https://alerts.ncdr.nat.gov.tw/webapi/RssAtomFeed.ashx` | 官方說明每分鐘更新索引 | 每分鐘；成功查核超過 5 分鐘標示過期。這是我方快取期限，不是官方訊息有效期限 |
| CAP 本文 | 上述 Atom 的正式 `https://alerts.ncdr.nat.gov.tw/Capstorage/...cap` | 隨發布機關 | 同一 URL、entry id、updated 未變時不重抓；新本文每 1.5 秒至多開始一個請求、最多 4 個同時下載 |

林業署[開放資料頁](https://recreation.forest.gov.tw/Service/OpenData)明示適用政府資料開放平臺資料使用規範；只提供林業署管理範圍，路況 feed 只列有狀況步道。因此 0 筆只表示這次 feed 未列異常，不能推論全臺開放或安全。資料使用仍保留來源與官方步道頁連結。

NCDR [正式介接頁](https://alerts.ncdr.nat.gov.tw/web/developer/alerts-rss)與[公開權限／索引說明](https://alerts.ncdr.nat.gov.tw/web/StaticFile/CAPATOMfeedRules.pdf)區分免登入一般訂閱、中央部會公開資訊及須會員開通的其他範圍。一般訂閱索引是「最新一則發布時間往回七天」，並非目前時間往回七天，可能保留已失效訊息，也不保證涵蓋索引以外的持續事件。

2026 年正式端點已改到 `/webapi/`，不再使用舊根目錄路徑，參見[官方轉換公告](https://alerts.ncdr.nat.gov.tw/web/home/news/1000027)。`/webapi/RssAtomFeeds.ashx` 是另一個公開生效中索引；本機實測連續查詢兩種 feed 會收到 HTTP 429，因此實作只讀一般訂閱索引，再自行依完整 CAP 處理生命週期。沒有使用私人金鑰、測試站、會員專屬端點或未文件化的查詢 API。未把公開可讀解釋成所有原發布機關內容均可任意再授權，來源顯名與原文連結皆保留。

## 回應與時間

`GET /api/conditions` 回傳 [公開型別](../src/shared/conditions.ts)；不接受網址、位置或會員參數。`trails` 與 `alerts` 分別有 `status`、`source`、`coverage`、`items`、`fetchedAt`、`checkedAt`、`error`，一邊失敗不清空另一邊。

- `ready`：已成功取得來源，且有符合條件的資料；不代表環境安全。
- `empty`：已成功解析來源，但沒有符合顯示條件的項目。空結果文案保留範圍限制。
- `missing`：背景首次查詢尚未完成。
- `error`：尚無完整成功快照，來源取得或驗證失敗。
- `stale`：保留上次成功資料，但查核超時、來源失敗或本機持久快取寫入失敗。
- `disabled`：型別保留供後續來源使用；目前這兩個公開來源均已啟用。

`fetchedAt` 是最近一次成功匯入新快照的我方時間；來源本文未變或回 HTTP 304 時維持舊值。`checkedAt` 是最近一次完整成功驗證此來源的我方時間；失敗不推進。兩者都不是官方發布時間。`generatedAt` 是本次回應產生時間。來源失敗時，`error` 保留可理解的訊息，沒有以空陣列冒充查詢成功。

步道以 `TRAILID` 對目錄；`ANN_DATE` 保留為日期字串，不補成假造的時分秒。`closedate`、`opendate` 分別為來源提供的封閉／預定開放日期，日期經過不會自動改寫成開放。未知的更新時間維持 `null`，無對應目錄的路況仍保留並計入 `unmatchedCount`。

目前官方入口僅 `TR_ENTRANCE.x/y` 投影座標，欄位文件未明確交代 CRS。因此尚未進行猜測性的 TWD67/TWD97 轉換，所有步道 `latitude/longitude` 先留 `null`，文字清單可正常查詢。後續取得官方座標系統說明才能畫點。

## CAP 生命週期

Atom 只用來取得正式 CAP 連結、id、updated 與 status；不把 feed 內本地化的日期文字猜成時區。完整 CAP 才是官方 `sent`、`effective`、`expires`、發布者、適用區域、完整訊息與指示的來源。

只接納 `status=Actual`、`scope=Public` 與 `msgType=Alert/Update/Cancel`；Test、Exercise、私有及未知 scope 不會混入正式產品。Atom 已標為非 Actual 的項目可略過下載。依完整 `(sender, identifier, sent)` reference 處理更新與取消，取消紀錄／被取代 reference 會持久保留，不因下次索引少了舊檔或程序重啟而復活。

顯示條件另要求明確且有效的 `effective` 與 `expires`、已生效、尚未到期，且結束晚於開始。缺時間只計入 `unknownTimeCount`，不繪製成有效警示。每次讀快照都依現在時間再排除到期訊息，來源斷線仍會到期。未提供明確解除時間時，不從 Cancel 的 `sent` 捏造另一欄時間；取消項目退出有效清單，歷程保留於伺服器快取。

CAP polygon 由 `緯度,經度` 轉成 GeoJSON 的 `[經度,緯度]`；不從行政區名稱、圓形或面積推算範圍。非法座標或超限幾何不畫。單一 polygon 上限 10,000 頂點、每個 info 上限 32 polygons／合計 20,000 頂點；超限整段省略，不截斷成錯誤邊界。沒有 polygon 時仍保留完整適用地區文字。內容以純文字顯示，沒有執行來源 HTML。

座標逐欄要求非空十進位字串，不把空白、hex、NaN 或 Infinity 轉成數值；少於三個不同頂點、共線或零面積範圍也省略幾何，原訊息與文字區域繼續保留。來源新鮮度使用前後端共用的 `CONDITIONS_FRESHNESS_MS`；瀏覽器在離線／長時間開頁後也會依 checkedAt 與時鐘降為 stale，不改寫來源時間或刪掉最後資料。

## 共用匯入、快取與失敗處理

`createConditionsService()` 建構時不連線、不啟動 timer；`get(): Promise<ConditionsResponse>` 冷啟動讀磁碟後最多等待 1.5 秒即回真實 loading 狀態，背景工作繼續。前端 missing 期間可短暫輪詢自家 API；暖讀只回共用快照，不依每位訪客向官方重抓。`refresh({force?})` 去除重複同時工作，`startPolling()` 由單一伺服器程序啟動，`stop()` 清理 timer。

預設保存於 Git 忽略的 `.cache/conditions/state.json`，先驗證、寫入同目錄暫存檔再 rename；無效 JSON/XML 不覆寫 last-good 內容。保存原始步道資料、必要 CAP 本文、已處理 entry、取消 tombstone、成功時間及退避狀態。過期 CAP 本文可刪除，但 reference tombstone 保留。程序重啟會再次驗證快取。正式部署需要持久儲存目錄；多程序部署需另做共用排程／鎖定，不能讓各個 worker 重複輪詢。

失敗採 30 秒起的指數退避，最高 10 分鐘；HTTP `Retry-After` 若要求更久則遵守更久。上游 429 會立即阻止同批排隊請求繼續送出。成功查核前不清除錯誤或更新成功時間。單一來源每次下載最多 8 MB、單份 CAP 最多 2 MB、每個索引最多 500 entry、CAP 歷程本文合計 16 MB、快取檔最多 24 MB，並限制歷程及 tombstone 筆數。超限報錯而不是靜默截斷取消紀錄。

所有請求固定 HTTPS 官方網域與公開路徑，不接受任意 URL，也不跟隨重新導向；只有 NCDR 正式 `/Capstorage/` 的 `.cap` 可隨索引下載，拒絕 credentials、query、fragment、非標準 port、測試網域和編碼路徑跳脫。請求有 12 秒 timeout、HTTP conditional revalidation；錯誤不輸出請求 headers 或底層網路內文。`force` 僅供服務端管理／測試，不是公開 HTTP 參數。

## 驗證與限制

`npx vitest run tests/conditions.test.ts tests/weather.test.ts` 覆蓋解析、未知座標／日期、真空結果與失敗、Test/Exercise/Private 排除、過期與缺時間、Update/Cancel 跨重啟與部分失敗不復活、last-good、304、Retry-After、重複讀取、冷啟 timeout、URL／redirect／payload 限制及 CAP 幾何。

2026-10-21 17:13:46 +08 本機透過 Node 系統 CA 保持 TLS 驗證，林業署真實回應已核實：118 個步道、42 則異常路況、0 則無法對目錄。NCDR 一般訂閱索引及 27 份完整 CAP 全部 HTTP 200，篩選出 2 則生效中的中央氣象署陸上強風特報（橙色／黃色），0 則缺有效時間，這批來源未提供 polygon。這是當時實際結果；動態筆數不能視為固定常數。失敗會如實顯示，不退回示範資料。
