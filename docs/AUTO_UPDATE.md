# 自動更新與最後成功資料

本輪 AED 自動更新已在本機實作並驗證；正式部署、託管排程及儲存空間另行選定。登山三天預報本階段排除。路況／官方示警的來源、覆蓋範圍與狀態另見 [路況與官方示警](CONDITIONS.md)。

## AED 更新流程

API 啟動後執行 `createEquipmentSync(...).start()`，不等待官方下載完成才開放查詢。最近一次成功抓取超過預設 24 小時，即在背景檢查衛福部固定公開端點 `https://tw-aed.mohw.gov.tw/openData?t=csv`；若仍新鮮，等到下一個檢查時間。一般設備 API 請求只讀本機 manifest／資料，不下載官方 CSV。

成功條件包括 CSV 表頭、欄寬、有效且去重後的設備 ID、至少 1,000 筆全國紀錄、非空相容山區結果及持久化檔案回讀驗證。未知座標不影響名錄收錄；AED3837 的已知座標疑義保留。全國數量若跌至門檻以下、服務回傳 HTML、格式異常、HTTP 錯誤或超過 45 秒，拒絕啟用並保留最近成功版。這些檢查不代表已逐台現地確認，1,000 筆門檻也無法保證官方名錄完全無遺漏。

持久儲存方式：

```text
.cache/equipment/
  current.json                    # 原子切換的版本 manifest
  sync-status.json                # 最近檢查、錯誤退避與下次檢查
  .sync.lock                      # CLI／API 共用下載鎖，執行時存在
  versions/<revision>/
    national.json                 # 精簡全國原始資料
    regional.json                 # 同一下載的相容山區原始資料
```

先完成同一版本的兩份檔案、回讀驗證，最後以同一檔案系統內的 `rename` 切換 `current.json`。讀取中的請求持有單一版本，回應資料與時間保持一致；下一次查詢偵測新 revision，再清除已轉換的設備陣列。HTTP JSON／gzip 快取亦使用 revision 及時效狀態區分並限制大小。因此 `npm run sync:data` 與 API 在同一台機器、使用同一專案資料目錄時，無須重啟 API 即可換版。

保留目前版及前一版；其他版本於下次成功啟用後清理。新程序優先讀 runtime manifest；目前版本損壞且 manifest 有前版時，回讀前版。manifest 無效時，已有程序繼續使用其已驗證版本，新程序退回版本庫 `data/aed-national.json`。版本庫的全國與區域快照是初始備援，CLI 不再各自覆寫它們。

同一程序的重複更新共用同一 Promise；不同程序透過排他建立 `.sync.lock` 避免同時下載。鎖定包含程序識別與 10 分鐘租期；已結束的程序或逾期鎖可被後續檢查清理。這是本機共用檔案系統方案，不提供多台伺服器的分散式鎖定。

## 失敗與時間語意

失敗後 5、10、20、40 分鐘逐次退避，最高為設定的檢查週期（預設 24 小時）。檢查結果及下次檢查持久保存；重啟通常沿用退避時間。若資料目錄無法寫入，只能保留該程序的記憶體退避，無法承諾跨重啟保存。其他程序持有鎖時，本程序延後檢查；不把鎖定誤報為官方來源失敗。

`GET /api/equipment/sync-status` 提供小型同步狀態：

- `state`：`idle`、`refreshing`、`ready`、`error`、`disabled`。
- `revision`、`fetchedAt`：目前可提供的已驗證版本及其抓取時間。
- `publishedAt`：官方發布時間；CSV 未提供可核對的發布時間，保持 `null`。HTTP `Last-Modified` 另存來源檔案 metadata，不代替發布或巡檢時間。
- `checkedAt`：最近一次成功下載並驗證來源的時間。**此欄位位於同步狀態，並非設備現地巡檢時間。**
- `lastAttemptAt`、`lastSuccessAt`、`nextCheckAt`、`consecutiveFailures`：嘗試、成功、後續排程及失敗次數。
- `message`：一般失敗文案，不公開私有路徑、內部錯誤堆疊或完整上游回應。

設備卡自己的 `checkedAt`、`publishedAt` 與官方公告種子維持原語意。AED 名錄更新不會更新 PAC／急救箱巡檢時間或推定現在可用。資料年齡超過 48 小時時，設備回應仍標為 `stale` 並提供最後資料；同步的 `ready` 表示最近檢查成功，不代表設備現在可用。

## 設定與操作

`.env.example` 僅列變數名稱；省略或留白使用預設值：

| 名稱 | 預設 | 意義 |
|---|---|---|
| `AED_AUTO_SYNC` | `true` | 設 `false` 關閉 API 程序背景同步；手動 CLI 仍可使用 |
| `AED_SYNC_INTERVAL_HOURS` | `24` | 檢查週期，允許 1–168 小時；亦為退避上限 |

```sh
npm run sync:data
# 若本機 Node 缺少完整官方憑證鏈，改用系統信任庫：
node --use-system-ca --import tsx scripts/sync-data.ts
NODE_USE_SYSTEM_CA=1 npm run dev
```

保持 HTTPS 憑證驗證，不使用 `NODE_TLS_REJECT_UNAUTHORIZED=0`。API 必須持續執行，背景排程才會運作；關機後不會自行喚醒，也沒有建立 Codex automation 或系統 cron。正式服務需讓 `.cache/equipment` 可寫且跨程序重啟保留；無持久磁碟的平台會回到隨程式附帶的舊快照。跨主機 CLI 不會自動更新另一主機。

## 本輪驗證

2026-10-21 17:01:16（UTC+8）實際以官方 HTTPS CSV 完成原子啟用，來源檔名 `AED20261021.csv`、15,878 筆 AED，另含既有 7 筆 PAC 與 1 筆急救箱，API 合計 15,886 筆；5 筆座標未知／疑義維持不畫點。新 Node 程序可讀取 runtime 版本；發布日期及設備巡檢日期未補造。

測試包含單次回應的版本一致性、全國／相容山區同版、壞資料不切 manifest、目前版損壞回前版、manifest 無效回備援、熱換版清轉換快取、程序重啟讀持久版本、啟動新鮮資料不重抓、每日排程、失敗保舊及持久退避、重複 refresh 去重與共用鎖，以及停用／停止排程。測試以假 fetch 與時鐘進行，不反覆呼叫官方來源。
