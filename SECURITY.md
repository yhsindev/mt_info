# 安全與隱私回報

目前為開發版本，修正以最新開發分支為主。

請勿把實際API金鑰、登入Cookie、私人GPX、隊伍名單、電話或完整計畫貼進公開Issue或PR。若儲存庫已啟用私人漏洞回報，請使用GitHub的「Report a vulnerability」；未提供私人入口時，先提出不含漏洞細節與個資的聯絡請求，由維護者安排回報方式。

重現範例請使用虛構資料，說明受影響版本、操作步驟、預期與實際結果。正常問題回報也請先遮蔽畫面與檔案中的個資。

計畫與匯入GPX由瀏覽器本機處理；伺服器使用的官方API金鑰僅放在環境變數。公開程式庫不包含使用者的本機草稿、執行期資料快取或秘密設定。網站程式開源並不會自動把瀏覽器的草稿上傳。

## 已知相依套件狀態（2026-11-18）

公開準備時更新了 `body-parser` 2.4.0、`qs` 6.17.1與`fast-xml-parser` 5.12.1，修補當次已知且有相容修補版的公告。來源：[body-parser公告](https://github.com/advisories/GHSA-27r3-jxmh-p828)、[qs公告](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw)、[XML解析公告](https://github.com/advisories/GHSA-474x-hrwr-fgx4)。

開發／建置工具鏈仍使用`picomatch` 4.0.7。[GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)目前未列出修補版；npm也會把依賴它的fdir、tinyglobby、Vite與Vitest列入同一組傳遞風險。沒有以強制降版或關閉檢查來消除報告。應僅在可信任的開發環境使用工具鏈，避免讓不受信任輸入進入glob比對，並在維護者發布修補後重新檢查。

套件清單、測試與建置成功不等於完成全部安全驗收。`npm audit --omit=dev`只反映依賴分類；目前後端啟動仍會使用開發依賴中的`tsx`，不能把分類報告解讀為整個執行環境未含開發工具。本專案目前未公開部署正式服務。
