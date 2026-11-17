# 參與開發

使用Node.js 24與npm，先執行 `npm ci`，依 `.env.example` 建立僅留在本機的 `.env`。不需要金鑰也能檢查介面；授權產品在未設定時保持未設定，不以示範值冒充正式資料。

```sh
AED_AUTO_SYNC=false npm run dev
npm test
npm run build
npm run check:public
```

`AED_AUTO_SYNC=false` 適合介面開發時停用設備背景換版；公告排程仍依正常後端啟動流程執行。測試使用受控來源或附帶的固定備援資料。預設CI執行單元測試、公開檔案檢查與正式建置；`tests/ui/`的瀏覽器腳本另需自行安裝Playwright及Chrome，輸出留在忽略追蹤的 `artifacts/`。

改資料時保留來源、方向、原始日期、授權與限制；未知值維持未知，不根據名稱、顏色或時間補造座標與現況。提PR時簡述問題、改動與實際執行的測試。

請勿提交 `.env`、執行期快取、私人GPX、隊伍計畫／聯絡資料、許可證或個人環境截圖。正式資料範例使用虛構內容，原始來源與第三方顯名不得以去敏為由刪除。加入新資料或素材前請更新 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 及來源清冊。

本機檢查紀錄與截圖可能在文件中以 `artifacts/` 路徑提及；它們預設不隨公開程式庫發布，應由相同腳本重新產生。不要把歷史本機測試紀錄當成當前CI通過的證據。
