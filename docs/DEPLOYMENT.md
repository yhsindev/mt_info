# 初版預覽與部署評估

核對日期：2026-10-22。這份文件是目前程式與官方平台文件的審查結果；尚未建立雲端服務、發布網站、連接帳戶或選定付費方案。

## 建議的第一步

先做有 HTTPS 的測試版，讓 iPhone Safari 與 Android Chrome 實際操作，再決定公開初版。現有架構以「單一常駐 Node Web Service，同時提供 Vite 編譯結果與 `/api`」改動最少。Render 是可行候選；正式資料更新若要延續現有本機快取設計，需要可持久化磁碟的服務。

Vercel 可以承載 Express，但不能把本專案當成純 Vite 靜態網站直接匯入，就視為資料更新也完成。Express 的支援與現有背景更新、檔案保存能否維持，是兩個問題。[Vercel Express 文件](https://vercel.com/docs/frameworks/backend/express)

## 目前程式依賴

| 功能 | 目前更新方式 | 保存位置／限制 |
| --- | --- | --- |
| 全臺 AED | 啟動後檢查資料年齡；預設每 24 小時下載、驗證、原子切換；失敗退避並保留成功版本 | 專案根目錄 `.cache/equipment`，另有隨程式發布的備份 |
| 步道路況 | 啟動與常駐輪詢，每 15 分鐘查核 | `.cache/conditions/state.json` |
| 正式 CAP 示警 | 常駐輪詢，每 1 分鐘查核；保留更新、取消與排除紀錄 | 與路況共用持久檔案；不能只保留當次訊息清單 |
| CWA 雨量站／QPESUMS API | 訪客查詢時更新，產品共用 2／5 分鐘記憶體快取 | 程序重啟後重新下載；缺授權碼保持未設定 |
| CWA 6／12 小時雨量圖 | 瀏覽器載入選定的官方圖檔 | 未解析機器時間，依原圖標示 |
| NCDR MPAS | 瀏覽官方原頁 | 不是 NCDR 數值資料 API 介接 |
| 登山計畫草稿 | 使用者裝置內 `localStorage` | 沒有雲端同步；網域、協定、連接埠改變後是另一個儲存空間 |

目前 API 限流與氣象請求去重也是單一程序內的 Map；未完成分散式實例間協調。公開部署初期宜維持單一 Node 程序。

## 本機正式模式

需要符合 `package.json` 的 Node 版本。部署時明確固定 24.x 的已驗證版本，避免目前 `engines` 中的開放上界隨平台升級跨主版本。Render 支援 `NODE_VERSION`、`.node-version` 或 `engines`；不要依服務建立日期猜預設版本。[Render Node 版本設定](https://render.com/docs/node-version)

```sh
npm ci --include=dev
npm run build
npm start
```

`npm start` 已設定 `NODE_ENV=production`，由 Express 同時提供 `dist/` 與 API；預設網址 `http://127.0.0.1:8787`。目前啟動依賴 devDependency 中的 `tsx`，所以不能在啟動前把 devDependencies 全部移除；之後可另做純 JavaScript 後端編譯。以上是啟動指令，不代表已執行雲端部署。

環境變數由 `.env.example` 起始，金鑰填入平台秘密變數，不放進 Git、公開設定、瀏覽器或日誌：

- `CWA_API_KEY`：雨量站／QPESUMS 數值產品需要；缺少時保留未設定狀態。
- `NCDR_API_TOKEN`：現階段未啟用 WATCH 數值 API，填入此變數不會自動取得資料或申請資格。
- `PORT`：由託管平台提供；程式已有有效數字檢查。
- `AED_AUTO_SYNC`：預設啟用；`false` 關閉常駐 AED 更新。
- `AED_SYNC_INTERVAL_HOURS`：預設 24；現有允許值 1–168。

## Render 最少可行方式

選 **Web Service**，不是 Static Site。平台欄位可使用：Build Command `npm ci --include=dev && npm run build`、Start Command `npm start`、Health Check `/api/health`，並固定 Node 版本。Render 將提供 HTTPS 與 `onrender.com` 網址。[Render Web Services](https://render.com/docs/web-services)

部署前仍須完成以下程式設定，現在尚未改動：

1. `server/index.ts` 目前只監聽 `127.0.0.1`。雲端正式模式需監聽 `0.0.0.0` 與平台 `PORT`；本機開發仍維持 loopback。Render 明確要求此公開監聽位址。[連接埠規範](https://render.com/docs/web-services#port-binding)
2. 現有快取路徑不能用環境變數移到其他磁碟。若使用標準 Node 專案根目錄，可將持久磁碟掛在 `/opt/render/project/src/.cache`，同時覆蓋 equipment 與 conditions；必須確認服務的實際根目錄。只掛 `.cache/equipment` 會漏掉 CAP 取消歷程。不要掛整個原始碼目錄。
3. 磁碟只在執行階段可用，不能在 Build Command 跑 `sync:data` 來更新該磁碟。現有啟動同步會在服務開始後更新。磁碟版本應保留，重啟後驗證讀取與過期提示。[持久磁碟與限制](https://render.com/docs/disks)
4. `server/app.ts` 現在 `trust proxy=false`。需依平台實際代理鏈設定可信代理與限流策略，驗證兩個不同用戶端不會共用 90 次／分鐘額度，也不能直接信任任意外部傳入的 IP header。[Express 代理設定](https://expressjs.com/en/guide/behind-proxies/)

Render 免費 Web Service 閒置 15 分鐘會休眠，喚醒會有延遲；重啟、重部署、休眠會丟失本機變更，且不能加持久磁碟。因此可供版型與手機操作預覽，但不符合現有全天更新與最後成功快取的運作假設。不要因前端可打開就宣稱背景資料持續更新。[免費服務限制](https://render.com/docs/free)

持久磁碟目前需要適用的付費服務，也會限制服務為單一實例，重新部署有短暫中斷。實際費用、額度與預算應在建立服務前依平台當時頁面確認；這裡不承諾免費正式營運。[磁碟限制](https://render.com/docs/disks)

## 若選 Vercel

Vercel 現行 Express adapter 支援預設匯出或 port listener，但本專案的 `server/index.ts` 不在該文件列出的自動入口位置。應先新增獨立可識別入口；也要把 Vite 靜態產物與 API 路由配置清楚。Express adapter 會忽略 `express.static()`，不能照搬現有 `dist` 服務方式就假設資產會可用。[Express 入口與靜態資產](https://vercel.com/docs/frameworks/backend/express)

仍需另做以下遷移：

1. **共享保存**：AED 版本、最後成功路況、CAP 更新／取消歷程改存 object storage／資料庫等外部儲存；函式部署檔案系統唯讀，`/tmp` 只是暫存，不能當持久資料庫。[Functions runtime](https://vercel.com/docs/functions/runtimes)
2. **背景更新**：移除「啟動一次後計時器會永遠執行」假設；以受驗證的排程工作與共享鎖更新。Vercel Functions 隨流量擴縮至零；`waitUntil` 只能延長單次請求工作，仍受函式期限限制。[Functions](https://vercel.com/docs/functions)、[背景工作期限](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package)
3. **排程頻率**：Hobby cron 目前每天一次且不保證分鐘精準度，無法直接保留每分鐘 CAP 輪詢；要選擇符合頻率的排程、改成可驗證的按需更新設計，或保留獨立資料服務。只增加每日 cron 不能當作即時示警完成。[Cron 限制](https://vercel.com/docs/cron-jobs/usage-and-pricing)
4. **全臺回應大小**：2026-10-22 在本機將 `getEquipment()` 序列化，JSON 為 14,413,690 bytes、gzip 為 1,539,243 bytes，會隨資料變更。Functions 文件列 request／response 最大 4.5 MB。現有 API 支援 identity 回應，不宜只靠常見瀏覽器的 gzip 行為推斷平台一定接受；應將版本檔放 CDN／object storage、設計分頁／區域載入，並實測兩種編碼。[Functions payload 限制](https://vercel.com/docs/functions/limitations)
5. **請求協調**：記憶體快取、來源節流、限流與鎖改成跨實例有效，避免每個冷啟動重複抓官方資料；保留原本失敗、過期與未設定狀態。

另一條路是 Vercel 只提供前端，`/api` 轉送常駐 Node 後端；這能保留後端輪詢，但要管理兩個服務及路由。第一輪測試版採單一 Node 服務更直接，這是根據現有程式的工程判斷，不是平台能力的普遍排序。

## 手機測試版驗收

發布測試版有價值：真機的字級、鍵盤、瀏覽器工具列、捲動與觸控感受無法只靠桌機縮視窗定案。先以少量受邀測試者跑完整流程：

- 進入全臺急救地圖，展開與收起清單、切篩選、選設備、閱讀來源；直立與橫向確認地圖操作區仍足夠。
- 雨量 6／12 小時圖、MPAS 原頁、集水區圖磚能在該網域載入；官方故障與弱網路狀態保留。
- 路況搜尋、區域切換、未生效封閉日期與正式警示顯示正常；重啟後保留成功快取，取消訊息不復活。
- 計畫草稿編輯、重新整理、JSON 匯入／匯出、Word 下載與離頁提示；切換正式網址前先匯出 JSON，因草稿依 origin 分開。[localStorage 儲存範圍](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)
- 定位允許／拒絕各測一次。定位需要安全環境及使用者授權，HTTPS 測試網址更適合；用手機開 `127.0.0.1` 會指向手機自身。[Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API)
- 由正式 `/api/health`、`/api/equipment/sync-status` 與資料卡核對伺服器狀態；health 的 `ok` 只表示程序可回應，不能代表所有上游資料新鮮。

這輪只完成部署審查文件。尚未建立 Vercel／Render 設定、改動公開監聽、處理可信代理、購買磁碟或實際發布；平台選定後才做相應設定與端到端驗收。
