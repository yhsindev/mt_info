# 氣象介接與驗證紀錄

## 2026-10-21 目前狀態

依本階段範圍，登山三天預報已從正常／示範回應與介面移除，`product=forecast` 回傳 400；既有解析器與其測試只保留為歷史研究，不啟動下載。雨量站、QPESUMS 與 6／12 小時原圖保留。

路況與官方示警改由獨立 `GET /api/conditions` 提供，在同一工具頁閱讀。林業署正式 JSON 與 NCDR 免登入一般訂閱／CAP 已實際介接；公開 CAP 與仍未啟用的 NCDR WATCH 天氣產品是不同來源。來源、生命週期、持久快取、時效及幾何限制見 [路況與官方示警](CONDITIONS.md)。以下 10/14 的原始欄位實測保留為歷史紀錄。

## 2026-10-15 新增：全臺官方雨量彩色圖

`GET /api/rain-maps` 提供已核對之官方圖檔目錄，亦可選 `product=cwa-qpf-6h|cwa-qpf-12h|ncdr-mpas`。氣象署 6 小時累積有 8 段、12 小時累積有 4 段，皆涵蓋未來 48 小時。來源是[氣象署定量降水預報頁](https://www.cwa.gov.tw/V8/C/P/QPF.html)直接使用的公開固定 PNG 網址，無需將私人授權碼放入前端。目錄本身不下載全臺格點或全部預報圖；畫面只載入選取的一張。

`available` 僅表示已設定並核對官方圖檔目錄，不代表預報仍有效。各產品 `catalogCheckedAt` 是來源連結查核日期（CWA 為 2026-10-15，MPAS 為 2026-10-22），不隨每次 API 查詢改寫，不是預報發布或抓取時間。本次實測的 PNG 檔只有 IHDR／IDAT／IEND 區塊，沒有可驗證的發布／有效時間文字 metadata；HTTP Last-Modified 也與圖片上印的發布時間不同，不能互相替代。官方 `QPF_TIME.js` 只標示是否提供 3 小時產品，頁面的 `GetDataTime` 是快取參數。因此產品 `issuedAt` 與每張圖 `validFrom`／`validTo` 保持 null，`timeStatus=on-image` 提醒依原圖時間判讀。圖檔載入或離線錯誤由畫面直接呈現；沒有用舊圖或示範圖片默默替代。

本功能顯示完整官方預報圖與圖例，沒有把整張圖片貼齊經緯度、沒有從像素顏色反推精確毫米值，也沒有宣稱已有數值格點查詢。2.5 km 原始 CSV／透明圖 ZIP 取得方式與定位資訊仍需完成核對。2026-10-22 起 NCDR MPAS 使用 `official-page` 原頁瀏覽，空 frames 代表沒有將原站圖表轉成我方圖片目錄；雙週數值 API 仍待正式規格及使用範圍確認。參考站的前端呈現不會改變官方來源的取得限制。

氣象署 JSON 欄位查核日期：2026-10-14（臺灣時間）。沒有使用私人授權碼，NCDR WATCH 數值天氣仍未啟用，官方原頁瀏覽已另行提供。一般模式未設定 `CWA_API_KEY` 時回傳 `unconfigured`，不會以示範資料取代。只有 `mode=demo` 才回傳固定日期的本機合成資料；其來源明確標示「非官方發布」。

## 固定來源與伺服器介面

`GET /api/weather?region=xueshan|daba&mode=live|demo&product=observation|qpf|radar`。`product` 為選填；省略時傳回目前範圍的產品，不包含登山預報。前端進入氣象圖層後才請求目前選取的產品；伺服器只下載對應來源，選雨量觀測不會同時下載全臺 QPESUMS 格點。未啟用產品仍保留明確狀態，選 radar 不發出上游請求。demo 也僅傳對應示範產品與未啟用資訊。僅傳山區代碼，沒有傳使用者精確定位。`GET /api/health` 回傳服務與授權碼設定狀態，不回傳碼值。`GET /api/equipment` 提供具抓取日期的設備快照，設備時效由獨立 adapter 處理。

氣象署 adapter 使用[開發指南](https://opendata.cwa.gov.tw/devManual/description)的固定檔案下載路徑 `https://opendata.cwa.gov.tw/fileapi/v1/opendataapi/{dataset}`，伺服器加入 `Authorization` 與 `format=JSON`。未假設所有產品都支援 REST datastore。同一份全臺資料在伺服器共用快取，再只將所選山區資料傳給瀏覽器。

| 產品 | 實作狀態 | 快取／時效處理 |
| --- | --- | --- |
| [F-B0053-035 登山三天天氣](https://opendata.cwa.gov.tw/dataset/forecast/F-B0053-035) | 本階段排除，僅保留歷史解析研究 | 正常／示範均不回傳，不下載、不排程 |
| [O-A0002-001 雨量站](https://data.gov.tw/dataset/9177) | 已寫下載與 WGS84 測站解析 adapter；官方公開範例實測 | 2 分鐘快取；單站觀測逾 30 分鐘在描述標示逾時，區內無新鮮數值時整產品 stale |
| [F-B0046-001 QPESUMS 未來一小時](https://data.gov.tw/dataset/42619) | 已寫下載、格點維度與缺測驗證；空間與時間語意待核對，因此不輸出地點雨量 | 5 分鐘快取；產品時間逾 30 分鐘標示 stale；正常下載仍為 missing，明列待核對原因 |
| [O-B0045-001 過去一小時雷達估計](https://opendata.cwa.gov.tw/dataset/all/O-B0045-001) | disabled | 無連線，與觀測及未來預報分開 |
| [NCDR 天氣資料](https://watch.ncdr.nat.gov.tw/watch_api_open) | disabled | 資格、核准產品、Token、用途、解析度、有效時段和授權待確認；不因設定 CWA 授權碼而啟用 |
| [NCDR 官方示警](https://alerts.ncdr.nat.gov.tw/web/developer/alerts-rss) | 公開一般訂閱／CAP 已介接，獨立 `/api/conditions` | 每分鐘查核、5 分鐘查核逾期門檻；有效時間與 Update／Cancel 另由 CAP 管理，詳見專頁 |

所有上游請求有 8 秒逾時、15 MB 串流讀取上限、同時請求合併及 ETag／If-None-Match。只接受氣象署與其核對過的公開 S3 回應主機，每次重新導向先驗證目標再發送請求，瀏覽器無法指定任意代理網址。API 每 IP 每分鐘 90 次，超過回傳 429 與 Retry-After；此限制為本工具本機設定，不是氣象署配額。IP 限流表僅在記憶體內且數量有上限，沒有定位日誌。正式部署為多實例或反向代理時需另規劃共用快取、可信代理及邊緣限流。

上游失敗會提供可理解的 error；若已有最後成功資料，以 stale 回傳並保留其原抓取時間。回應需先通過產品識別、Actual 狀態與必要 schema 檢查才可替換快取。304 不改寫先前成功抓取時間。原始錯誤、上游網址和授權碼不回傳前端，也不寫入日誌。未取得任何成功資料時不製造雨量數值。

## 2026-10-14 原始欄位實測

透過政府資料開放平臺公開下載資源所列之測試下載連結，在 `/tmp` 取得官方 JSON 供 schema 驗證；這不是將公開測試碼設為產品授權碼，也沒有將該碼寫進程式或 `.env.example`。

1. **登山預報欄位已是 PascalCase。** 2026-10-14 抓得 `cwaopendata.Dataset.Locations.Location`，語言 `zh-TW`。溫度為 `DataTime` 的時間點，降雨機率則有獨立的 `StartTime`／`EndTime`。範例裡溫度逐小時、機率逐 3 小時；不能用舊文件的固定頻率套用每個因子。解析保留原始時區與時間，時間點以起訖相同表達，不自行延長有效時段。只選官方有列出的雪山、雪山東峰、雪山北峰或大霸尖山；不替 GPX 任意點插值。
2. **觀測資料有兩套座標。** 讀取 `GeoInfo.Coordinates` 中 `CoordinateName=WGS84`，不拿 TWD67 直接畫在地圖。使用 `RainfallElement.Past1hr.Precipitation` 及各站 `ObsTime.DateTime`，起點為觀測時間往前一小時。來源發布時間未知，保持 null，沒有把觀測時間或抓取時間當發布時間。區域選站採固定經緯度查詢框；不是集水區雨量或內插面。
3. **雨量特殊代碼不能混成數值。** 依[官方雨量標準文件](https://opendata.cwa.gov.tw/opendatadoc/Observation/O-A0002-001.pdf)，`-99` 缺值／異常、`X` 儀器故障、`T` 雨跡、`-98` 為連續 6 小時無降水。前面三種回傳 null 與文字；`-98` 也保留 null 及原始意義，避免換算成未知時段的 0。只有真實數值 `0` 才顯示零雨量。
4. **QPESUMS 的空間資訊存在待確認差異。** 官方檔案有 441 × 561 = 247401 個值、解析度 0.0125°、缺值 -99；metadata `StartPointLongitude=118`、`StartPointLatitude=20`，但 `contentDescription` 寫第一點 117.975、19.975，並寫 TWD67。不可未經核對就假設 WGS84 或任選起點。另外 `DateTime` 只有一個時間，未在此檔明確列出預報起訖。故目前可抓取、檢查與顯示產品時間，暫不取最近格點、不疊雨量色塊，也不自行將 DateTime 加一小時當有效時段。下一階段應先向官方規格確認座標、格點原點及 DateTime 語意，再加入轉換及比對測試。

## CAP 與驗證範圍

`server/cap.ts` 依 [OASIS CAP 1.2](https://docs.oasis-open.org/emergency/cap/v1.2/CAP-v1.2-os.html) 解析訊息：只有 Actual、Public、已生效且有明確未過期時間的正式訊息能進入生效清單；Test／Exercise 排除。Update、Cancel 依完整 sender／identifier／sent references 套用，保留發布者、完整說明、指示、區域與時間。2026-10-21 已新增公開同步、歷史取消關係持久保存、來源信任與固定端點驗證；目前接入範圍與新測試見 [路況與官方示警](CONDITIONS.md)。

`tests/weather.test.ts` 驗證因子原始起訖、缺少區間終點、未知發布時間、測站座標、缺測與過期、未來缺測值不延長舊資料時效、QPF 維度、明確 demo／未設定界線、錯誤不洩漏碼值、共用快取、異常更新保留舊快取、304、未核准重新導向、逾時、CAP Actual／Test／Exercise／Update／Cancel／過期及異常 XML。`tests/server.test.ts` 驗證 HTTP 模式、參數、非任意代理與限流。另以本輪取得的三份官方公開 JSON 直接執行解析：雪山 3 個預報點、360 個因子資料點、11 個區域雨量站；大霸 1 個預報點、120 個因子資料點、21 個區域雨量站；QPF 247401 格通過維度檢查。這些測試不能代替正式授權碼端到端驗證。

首次設定授權碼後，應確認帳號有權取得本階段的雨量站及 QPESUMS 產品、實際回應內容、逾時與 304 行為，再以官方網頁比對測站。勿將私密 `.env`、上游完整含碼網址或抓取日誌提交 Git。

本輪另嘗試用政府目錄列出的測試下載授權字串執行完整 Node adapter 網路驗證，但自動審核未接受其公開憑證身分，以可能向外洩露有效授權為由拒絕執行；未重試或繞過。故完整 Node 網路鏈路仍待由使用者自己的授權碼驗證，不能以公開 JSON 解析測試取代。
