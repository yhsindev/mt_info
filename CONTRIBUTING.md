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

PR依[預設範本](.github/PULL_REQUEST_TEMPLATE.md)整理「問題、改動、驗證、限制」。讓未參與討論的人能理解觸發條件與修改後的行為；只記錄實際執行的驗證，資料或介面變動另列來源、時間或適用範圍。

README作為專案入口，參考 [Standard Readme](https://github.com/RichardLitt/standard-readme/blob/main/spec.md) 與 [GitHub README指南](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes)，優先交代用途、功能、啟動、設定、驗證與限制。詳細操作、技術參考及歷史紀錄放入`docs/`，並由[文件索引](docs/README.md)連結；來源與未知狀態的必要說明仍保留於首頁。

## Commit message

後續提交採Linux kernel風格，依據[Submitting patches](https://www.kernel.org/doc/html/latest/process/submitting-patches.html)及[tip tree handbook](https://www.kernel.org/doc/html/latest/process/maintainer-tip.html)。本專案採用以下訊息撰寫規則；GitHub提交身分使用既有的noreply email。

```text
area: Imperative summary

Explain the problem, its user-visible impact, and why the change is needed.

Describe the solution and relevant trade-offs. Record actual validation
when it helps a reviewer assess the change.
```

- 以功能區域作前綴，例如`plan:`、`weather:`、`conditions:`、`map:`、`cards:`、`data:`、`docs:`、`ci:`或`build:`；必要時使用`plan/storage:`等子區域。
- 標題使用英文祈使句，摘要動詞首字大寫，結尾不加句號；包含前綴以75字元為上限，盡量在70字元內表達清楚。
- 標題與本文之間空一行。本文先說問題、觸發條件與影響，再說改法及理由；讓沒有看過對話的人也能理解。英文本文以約75欄換行，網址與需要機器解析的標記可保持完整。
- 每筆提交處理一個邏輯變更；避免只有`Update files`、`Fix bug`等無法辨認目的的標題。驗證只記錄實際執行結果，效能改善需附適用條件與數據。
- 已確認引入問題的提交才加`Fixes:`，使用至少12位commit ID及原標題；相關Issue或討論可加`Closes:`／`Link:`並使用公開的完整網址。
- `Signed-off-by:`涉及提交者的聲明，僅在提交者確認後加入；`Reviewed-by:`／`Tested-by:`僅收錄實際提供且仍適用的標記。不要為了格式完整而補造簽署、審查或測試身分。

依現有備案功能撰寫的格式示例：

```text
plan: Keep alternative drafts separate from the main plan

Users need to compare another itinerary without losing the main plan.

Store the alternative under a separate browser storage key. Save the
current draft before switching, and keep unsaved edits visible if storage
fails.
```

請勿提交 `.env`、執行期快取、私人GPX、隊伍計畫／聯絡資料、許可證或個人環境截圖。正式資料範例使用虛構內容，原始來源與第三方顯名不得以去敏為由刪除。加入新資料或素材前請更新 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 及來源清冊。

本機檢查紀錄與截圖可能在文件中以 `artifacts/` 路徑提及；它們預設不隨公開程式庫發布，應由相同腳本重新產生。不要把歷史本機測試紀錄當成當前CI通過的證據。
