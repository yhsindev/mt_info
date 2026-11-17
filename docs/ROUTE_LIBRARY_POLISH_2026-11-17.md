GATE: OPEN 24 (rounds used up)

# 計畫通路線庫介面精修 · 2026-11-17

完成本機精修與兩輪視覺調整；未提交、未部署。原有未提交修改保留，taste-skill 的 1,631 個原始檔 SHA-256 完全相同。

## 改善與取捨

| 項目 | 修改前 | 本輪結果 |
| --- | --- | --- |
| 搜尋與篩選 | 檢視、搜尋與多組框線權重相近，結果數離清單較遠 | 標題改「路線庫」；檢視獨立，搜尋有可見標籤，分類與山脈分組，結果數與清除操作移到清單前 |
| 手機密度 | 空白／匯入入口 68px；多處重複文字 | 入口維持至少 48px；手機減少外框與重複分類標籤，保留自然換行 |
| 路線卡片 | 概覽不顯示查核時間，分級文字冗長 | 類別與參考數字分層；概覽顯示原查核時間，不改稱更新或現地觀測 |
| 來源 | 資源來源在收合時隱藏；山友軌跡標題限制兩行 | 摘要直接顯示完整來源；取消兩行裁切；連結文字與圖示分開，長文字可換行 |
| 窄版欄位 | 固定標籤欄擠壓來源與限制 | 窄卡片採標籤在上、值在下；維持正文 16px |
| 停用狀態 | 按鈕整體 opacity .55，使文字變淡，仍有前進箭頭 | 明確停用文字、中性表面與足夠對比，移除前進箭頭；五條分日待核路線仍停用 |
| 動態與焦點 | 搜尋有內外雙重焦點線 | 保留單一整組 3px 藍色焦點外框；僅操作回饋，reduced-motion 不位移 |

種類為 software 的真實工具介面；延續 #254b3f 森林綠、#fbfaf6 暖白、現有 Noto Sans TC／系統繁中字體與 Georgia 字標。文案以路線、來源、查核與限制為主，不新增即時或安全判斷。依使用者明確要求保留品牌與快速查詢，不加入行銷 hero、滿屏分節、照片、shader、loop 或 dealt moments；未新增字體、套件到專案或 kit 資產。無假設價格、地址、聯絡表單、假名、圖片替身或待補 canonical。

## 已驗證

- `npm test -- --reporter=dot`：33 個測試檔、375 項通過。
- `npm run build`：TypeScript 檢查、Vite 正式編譯、山行卡離線檔案清單成功。MapLibre 分塊約 1,076kB，仍有大於 900kB 的建置警告；本輪未調整地圖打包。
- 正式編譯本機預覽上執行 `tests/ui/plan-catalog-qa.cjs`：17 組檢查通過，無 page errors。包含搜尋／台臺與別名、分類×山脈矩陣、資源去重、模式保留篩選、空結果重設、取代確認／取消、套用、逐日編輯、未知水情、未核准住宿、本機保存與重新載入、JSON 匯出再匯入、Word 內容、參考時間與本隊調整的計算、改名後關聯解除。
- 正式編譯本機預覽上執行 `tests/ui/plan-catalog-polish-qa.cjs`：320、360、390、768、820、1024、1440 共七種寬度，21 組畫面狀態、56 個具名檢查，0 failures、0 page errors。檢查 16px 正文／輸入、14px 來源日期標籤、48px 控制、4.5:1 正常文字對比、無橫向溢出、無文字裁切、停用狀態、鍵盤與 reduced-motion。
- 實際長文：嘉明湖・向陽山・三叉山；730林道25K工寮周邊宿營紀錄；健行筆記・法蘭怎麼玩 How Frank Play（2022 年心得）；大小劍 57 字軌跡標題。逐字比對原始文字並檢查字元布局；來源發布、現地觀測、查核時間、季節與限制逐欄比對原始資料。
- 對比／截圖經目視閱讀：桌面與手機搜尋區、長來源、日期與未知、長軌跡標題；其他尺寸由自動檢查補足。
- SHA-256 對比：既有資料、座標與 GPX 清冊、模型、計算、保存、匯入／匯出邏輯、後端、品牌與共用 tokens 均未更動。專案 package.json 與 lockfile 未變動。

UI 測試所需 Playwright 僅置於 `/tmp/mt-info-ui-tools`，未更動專案依賴。執行方式：

```sh
NODE_PATH=/tmp/mt-info-ui-tools/node_modules MT_INFO_QA_URL=http://127.0.0.1:4173 node tests/ui/plan-catalog-polish-qa.cjs
NODE_PATH=/tmp/mt-info-ui-tools/node_modules MT_INFO_QA_URL=http://127.0.0.1:4173 MT_INFO_CATALOG_QA_OUT=artifacts/catalog-polish-2026-11-17/ui-catalog node tests/ui/plan-catalog-qa.cjs
```

## taste-skill 的通用檢查

通用 full consistency 在五種寬度列出 96 個 FAIL／28 WARN（含跨尺寸重複）；最後 gate 去重並套用兩個具體豁免後，為 24 個 open FAIL／10 WARN。未把 gate 宣稱為 PASS。以下保留每一項，未修改 checker、隱藏內容或替換受測頁。

獨立 `assets/layout/check.mjs` 在第一個尺寸回報 `Cannot read properties of undefined (reading 'map')`，接著 `TypeError: r.sections is not iterable`，因此該工具的五尺寸檢查**未完成**，未修改 kit 或重跑此錯誤；七尺寸排版由專案專項 QA 另行檢查。完整日誌見 artifacts。

### 兩個豁免

- `focus-ring`，`.plan-catalog .pc-search > input:focus-visible`：搜尋組由 `.pc-search:focus-within` 畫出可見的 3px 藍色外框；移除輸入框內層外框避免雙線。七尺寸的實際鍵盤與 computed style 驗證支援此判定。
- `focus-visible`，`div.pc-discovery:nth-of-type(1) > div.pc-search-field:nth-of-type(1) > div.pc-search > input "搜尋路線、山脈或資源"`：搜尋組由 `.pc-search:focus-within` 畫出可見的 3px 藍色外框；移除輸入框內層外框避免雙線。七尺寸的實際鍵盤與 computed style 驗證支援此判定。

### 24 個未通過項目

多數要求將真實查詢介面改成行銷版面，與這次保留工具架構的要求衝突；保留可捲動清單、每條路線的套用控制、按需展開與足量來源說明。`heading-scale` 指現有頁標與路線庫標題大小接近；`focus-ring` 指既有 MapLibre 全域樣式，均未跨出路線庫範圍調整。以下是原始檢查結果，並非全部視為已解決。

| # | 檢查 | 對象 | 原始發現 |
| --- | --- | --- | --- |
| 1 | `hero-fill` | main.plan-page > div.plan-shell > div.plan-body > details.plan-section.plan-catalog-start "空白計畫與匯入" | the next section shows on the first screen: it starts at 148px on a 900px screen (the hero ends at 136px) |
| 2 | `flush` | main.plan-page > div.plan-shell > header.plan-header > button.plan-button "返回工具" | its button sits 0px above the rule on top of details.plan-section.plan-catalog-start |
| 3 | `text-only` | main.plan-page > div.plan-shell > div.plan-body > section.plan-catalog "路線庫" | the closing section is only text: no picture, icon, mock or effect in it |
| 4 | `heading-scale` | section.plan-catalog > header.pc-heading > div.pc-heading-copy > h2 "路線庫" | an h2 at 26px, as large as the h1 (26px) or larger |
| 5 | `off-grid` | section.plan-catalog > div.pc-discovery > div.pc-search-field > div.pc-search | left edge at 45px, 21px off the page margin at 24px (5 elements, like p.pc-result-count); 1 more in this section off the grid too (label.pc-field-label at 45px) |
| 6 | `off-grid` | div.plan-shell > div.plan-body > details.plan-section.plan-catalog-start > summary "空白計畫與匯入" | left edge at 41px, 17px off the page margin at 24px (5 elements, like h2) |
| 7 | `focus-ring` | .maplibregl-canvas:focus | ".maplibregl-canvas:focus" in main-B_9BS2jS.css removes the focus outline and sets nothing in its place |
| 8 | `moment-none` | (the page) | a software page (--type) deals no moment: every kind carries one, two on a long page (moments.md) |
| 9 | `hero-screen` | div#root > div.app-shell > main.plan-page > div.plan-shell "登山計畫1選擇路線2編輯計畫3儲存／匯出返回工具空白計畫與匯入空白計畫匯入 GP" | the hero ends at 7462px on a 900px screen, 6562px below the fold: it ends at the fold, 1px either way (SR-1) |
| 10 | `section-height` | div#root > div.app-shell > main.plan-page > div.plan-shell "登山計畫1選擇路線2編輯計畫3儲存／匯出返回工具空白計畫與匯入空白計畫匯入 GP" | the section starts at 76px, 76px below the screen grid (0 x 900px): sections start on whole screens (SR-2) |
| 11 | `one-section` | div#root > div.app-shell > main.plan-page > div.plan-shell "登山計畫1選擇路線2編輯計畫3儲存／匯出返回工具空白計畫與匯入空白計畫匯入 GP" | a <div> sits directly in <main>: every part of <main> is a <section> (SR-4) |
| 12 | `one-heading` | section.plan-catalog > header.pc-heading > div.pc-heading-copy > h2 "路線庫" | the hero holds an h2 (1): its heading is the h1, and an h2 opens the next section (SR-5) |
| 13 | `container-edges` | div#root > div.app-shell > header.app-header "mt_info急救雨量集水區路況計畫通山行卡來源更多" | the nav's content runs 24px from the left and 24px from the right (read from its outermost blocks: no .wrap): the margin is 64-120px at 1440px (one container, equal margins, 2px either way) (SR-6) |
| 14 | `container-edges` | div#root > div.app-shell > main.plan-page > div.plan-shell "登山計畫1選擇路線2編輯計畫3儲存／匯出返回工具空白計畫與匯入空白計畫匯入 GP" | the content of section 1 runs 24px from the left and 24px from the right (read from its outermost blocks: no .wrap): the margin is 64-120px at 1440px (one container, equal margins, 2px either way) (SR-6) |
| 15 | `container-edges` | div#root "mt_info急救雨量集水區路況計畫通山行卡來源更多登山計畫1選擇路線2編輯計畫" | a <div> at the top of the page, outside header.nav, main, footer.closing and nav.actionbar (SR-6) |
| 16 | `container-edges` | div.pc-discovery > div.pc-filters > div.pc-category-filter > span.pc-field-label "分類" | 1 text block starts on a left line at x 975, 951px from the container's left: text starts on the container's left, or on one split line (x 614, 732, 850) (SR-6) |
| 17 | `container-edges` | section.plan-catalog > div.pc-discovery > div.pc-search-field > label.pc-field-label "搜尋路線與資源" | 1 text block starts on a left line at x 45, 21px from the container's left: text starts on the container's left, or on one split line (x 614, 732, 850) (SR-6) |
| 18 | `row-lines` | div.plan-shell > div.plan-body > section.plan-catalog > div.pc-route-grid "百岳雪山山脈新竹縣・苗栗縣大霸尖山保留既有官方分段路程三日草稿；止於霸基，不含攀" | a row of 2 items: its last item ends at 945px, the container's right line at 1416px; its items are 552/1005px tall, not one height (2px either way) (SR-7) |
| 19 | `row-lines` | div.plan-body > section.plan-catalog > div.pc-route-grid > article.pc-template-card:nth-of-type(1) "百岳雪山山脈新竹縣・苗栗縣大霸尖山保留既有官方分段路程三日草稿；止於霸基，不含攀" | a row item is cut by a frame round it: 451 x 378px of its 451 x 952px shows (SR-7) |
| 20 | `row-lines` | div.plan-body > section.plan-catalog > div.pc-route-grid > article.pc-template-card:nth-of-type(2) "百岳雪山山脈臺中市雪山主東峰以七卡及三六九臨時營地分三日規劃。舊三六九山莊停止申" | a row item is cut by a frame round it: 451 x 378px of its 451 x 736px shows (SR-7) |
| 21 | `row-lines` | div.plan-body > section.plan-catalog > div.pc-route-grid > article.pc-template-card:nth-of-type(3) "百岳玉山山脈南投縣・嘉義縣玉山主峰參考官方主峰線兩日節點。住宿、入園及主峰路況仍" | a row item is cut by a frame round it: 451 x 378px of its 451 x 526px shows (SR-7) |
| 22 | `split-pair` | div.plan-shell > div.plan-body > section.plan-catalog > div.pc-discovery "搜尋路線與資源分類全部路線百岳中級山山脈全部山脈雪山山脈玉山山脈中央山脈阿里山山" | the split's columns are off the page's one pair of lines: its right column starts at x 975, on none of the split lines 614 (k=5), 732 (k=6), 850 (k=7) (SR-8) |
| 23 | `flush` | div.plan-shell > header.plan-header > nav.plan-view-nav > button:nth-of-type(1) "選擇路線" | its button sits 0px above the lower edge of header.plan-header, where the ground changes to details.plan-section.plan-catalog-start |
| 24 | `container` | page | no .wrap |

### 保留的 WARN

- `assets`：本輪使用隔離的前端正式預覽，未啟動 API 代理；路況公告不是本輪 UI 資料來源，未驗證線上官方公告同步。
- `flush`：保留快速工具列與 48px 摘要，不為行銷留白增加首屏高度。
- `button-styles`：分類選取與主要操作共用森林綠；篩選與操作的語意保留。
- `copy-headline`：繁體中文工具頁沿用「登山計畫」，不採英文詞數或商品標題規範。
- `stranded-action`：返回工具維持既有頁首位置。
- `copy-length`：23 條路線及全部來源、未知與限制均保留，屬真實產品 UI。
- `action-count`：每條路線需要各自套用，維持真實清單操作。
- `skip-link`：既有全域導覽的改善方向，尚未跨出本輪路線庫範圍。
- `share-meta`：本機介面精修未新增正式網域或分享素材。
- `copy-stat-strip`：copy-lint 的唯一 WARN；數字來自原始參考天數、資源記錄與分段收錄狀態，不是行銷數據；依使用者要求保留。

## 效能量測與下一輪方向

`perf.mjs` 在 1440／390 各量測三次：共 8 FAIL、4 WARN，沒有宣稱效能 gate 通過。每種寬度的 FAIL 均是 CSS 約 308KiB、33 個 Noto Sans TC 字體分塊約 1,801KiB（檔案數與總量各一項）、以及隔離前端預覽的 `api/conditions` 失敗；WARN 是總傳輸約 2,300KiB 與 JS parsed 約 570KiB。既有字體載入與共用 CSS／地圖資產打包未納入本次精修。

同一台 CPU Chrome 的中位數：桌面 FCP 220ms／LCP 580ms／blocking 25ms；手機視窗 FCP 204ms／LCP 564ms／blocking 14ms；兩尺寸 CLS 均 0，WebGL context 0。這是本機相對量測，不是行動網路或真機效能保證。

下一輪可先研究 CJK 字體的載入需求、共用與地圖 CSS 的按需載入，再整理全域頁首的標題比例、略過導覽與 MapLibre 焦點樣式。本輪已完成路線庫與手機密度兩輪，沒有為通用行銷 gate 增加首屏展示或刪除來源。

## 證據與比較

- 可開啟的前後比較（本機紀錄：`artifacts/catalog-polish-2026-11-17/comparison.html`）
- 桌面修改前（本機紀錄：`artifacts/catalog-polish-2026-11-17/before-desktop.png`）／桌面修改後（本機紀錄：`artifacts/catalog-polish-2026-11-17/after-desktop.png`）
- 手機修改前（本機紀錄：`artifacts/catalog-polish-2026-11-17/before-mobile.png`）／手機修改後（本機紀錄：`artifacts/catalog-polish-2026-11-17/after-mobile.png`）
- 專項 UI 檢查（本機紀錄：`artifacts/catalog-polish-2026-11-17/ui-polish/result.json`）／完整操作流程（本機紀錄：`artifacts/catalog-polish-2026-11-17/ui-catalog/result.json`）
- 效能原始記錄（本機紀錄：`artifacts/catalog-polish-2026-11-17/taste-perf.log`）／layout 工具錯誤（本機紀錄：`artifacts/catalog-polish-2026-11-17/taste-layout.log`）
- 檔案保留核對（本機紀錄：`artifacts/catalog-polish-2026-11-17/preservation.json`）／最後 gate 日誌（本機紀錄：`artifacts/catalog-polish-2026-11-17/taste-gate-final.log`）

以上為 macOS Chrome 的隔離儲存與視窗尺寸檢查，未以 iOS／Android 真機驗收。來源 URL 未抓取或下載第三方 GPX，官方申請、即時水情與床位未新增串接。路線庫的本機瀏覽、套用、計算與匯出流程已實際測試；未宣稱線上資料同步或安全狀態通過。
