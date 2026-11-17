GATE: OFF (no build active)

# 跨工具字級與載入整理 · 2026-11-17

本輪已完成本站字級、載入邊界與鍵盤入口的本機調整。既有未提交修改保留；沒有提交、部署或修改 taste-skill 原始檔。原始資料、日期、座標、GPX、計算、草稿儲存與匯出程式保持。

## 為什麼雨量頁特別小

既有 `interface.css` 多數閱讀規則使用 `:not(.rain-map-workspace)`，雨量本站介面因此沿用舊的 7–12px；NCDR MPAS 外層仍有 12–13px 說明和 44px 控制。這與來源圖本身的字級是兩件事。本輪調整本站 UI，官方圖檔與跨來源 iframe 中的文字、時間、色階及原始大小／概覽算法保持。

同樣用途跨頁對齊，並保留不同閱讀角色：

| 角色 | 桌面 | 手機 |
| --- | --- | --- |
| 頁面主標（含計畫通） | 36px | 30px |
| 區塊標題 | 26px | 24px |
| 卡片標題 | 20px | 19px |
| 正文、完整說明、輸入 | 16px 起 | 16px 起 |
| 來源、日期、標籤 | 14px 起 | 14px 起 |
| 主要控制 | 高度至少48px | 高度至少48px |

雨量來源與限制完整換行；播放、縮放改在圖面區域內定位，文字放大時仍可操作，手機維持圖面在前、詳細控制在後。時間放大按鈕在圖面載入前保留尺寸並停用，來源仍採原始圖檔。MPAS 選取按鈕在 hover 時保留可讀對比。氣象觀測／短時頁面的說明、日期、選單與操作同步使用共用比例；地圖載入說明改為16px。

## 字體與資產量測

沿用 Noto Sans TC、原有字重及 Georgia 字標。依 [Google Fonts CSS2 官方文件](https://developers.google.com/fonts/docs/css2#axis_ranges) 的可變字重範圍語法，以 `400..750` 取代八個分別列出的字重，並將 CSS import 改為頁首 stylesheet／preconnect；兩個入口共用相同請求。沒有以使用者輸入組合字體查詢。

以 Chrome User-Agent 實際取得的 Google Fonts 回應：

| 項目 | 修改前 | 修改後 |
| --- | --- | --- |
| 字體 CSS 宣告 | 864 組 | 108 組 |
| 字體 CSS 原始大小 | 999,264 bytes | 125,340 bytes |
| 相同 gzip 計算 | 278,439 bytes | 34,687 bytes |
| 字型檔 URL 集合 | 108 個唯一 URL | 相同 108 個 URL |

主地圖與行程對照圖用模組層級 `lazy`／`Suspense` 按需載入；雨量、路況與路線庫不預載 MapLibre CSS，進入地圖工具才載入。建立中保留文字資料和明確載入回饋。

同一路線庫正式編譯頁的 skill 效能測量（1440／390，各三次）：CSS 傳輸約從前輪的 308–309KiB 降至約61KiB，CSS 預算改為 PASS；JS parsed 約570KiB降至533KiB。兩尺寸 CLS 均為0。**字型檔仍為33個分塊、約1.8MiB**，字型數量與容量預算仍 FAIL；沒有把字體 CSS 的減量當成字型檔也縮小。

本輪 perf 為4 FAIL／4 WARN：FAIL 是兩尺寸各自的字型分塊數與容量，WARN 是總傳輸和 JS parsed；圖片、WebGL、長任務、blocking、FCP、LCP、CLS、未掛載模組與失敗請求檢查均通過。這是本機 CPU Chrome 相對量測，不是手機或行動網路效能保證。最後的資訊標籤顏色校正與地圖錯誤邊界未改變字體請求、按需載入邊界或正常布局；容量數字以近似值報告。

建置仍有 MapLibre 約1,076kB分塊大於900kB的警告，未調高預算或隱藏警告。

## 鍵盤與原有行為

主工具與山行卡新增真正的「略過導覽」連結，移焦到各頁 main；保留計畫通開啟時原有的工作區標題移焦。地圖畫布有3px鍵盤焦點，與選取狀態分開。沒有改變草稿資料、來源狀態、計算規則、API或匯出處理。另加入僅涵蓋地圖的錯誤邊界，延後載入的地圖檔案失敗時，保留急救文字清單及計畫編輯器，不讓整頁被錯誤取代。

MPAS 受控測試原本在點重載後立即讀取仍存在的舊「已開啟」狀態，可能在真正重新請求前就判定重試次數。本輪改為等待該次官方 URL 的實際 response，再檢查狀態和請求數；保留原有重試2次、來源限制和離線斷言，沒有降低驗收。計畫通主標測試依原設計規範更新為36／30px。

GPX 回歸測試另遇到圖面標題已更新、MapLibre 的 GeoJSON source 尚未初始化的時序差異。本輪先等待匯入檔的4個原始點實際進入 source，再執行相同的4點斷言；草稿不變、不推測路點座標與重新載入清除的檢查保持。補跑的路點及完整路線庫流程均通過。

## 驗證結果

- `npm test -- --reporter=dot`：33檔、375項通過。
- `npm run build`：TypeScript、Vite與山行卡離線清單成功，MapLibre分塊警告保留。
- `tests/ui/interface-scale-qa.cjs`：320／360／390／768／820／1024／1440共七寬度、21組畫面，0 page errors。正文16、來源標籤14、主要控制48、無橫溢與文字裁切、圖面高度和手機閱讀順序通過；播放／暫停、時間軸鍵盤、放大原圖時間、縮放還原、6／12小時切換、MPAS顯示大小切換不重載、選取hover對比、跨工具及山行卡略過導覽、按需載入地圖CSS與地圖焦點均通過。
- `tests/ui/plan-catalog-qa.cjs`：搜尋篩選矩陣、套用／取消、未知狀態、編輯、保存／重新載入、JSON往返、Word和時間計算通過，0 page errors。
- `tests/ui/plan-catalog-polish-qa.cjs`：前輪七寬度、長山名／來源、各類日期／未知／限制、五條暫停套用、文字對比、鍵盤與減少動態再次通過。
- `tests/ui/plan-waypoints-qa.cjs`：實際本機路點與參考線、桌面與手機地圖、切換日程與視窗尺寸、路點索引、圖檔匯出、本機GPX與圖資失敗備援通過，0 page errors。底圖為受控一像素圖磚，未宣稱導航準確度驗收。
- `tests/ui/map-loading-fault-qa.cjs`：刻意阻擋主地圖與計畫地圖的JS檔，確認地圖失敗後急救搜尋仍可操作、行程可編輯並保存，0 page errors。
- `tests/ui/cards-qa.cjs ui`／`exports`：測驗、收藏、手機版面、配額／損毀資料保留、離開確認、PNG／SVG／書籤與A4列印回歸通過，0 page errors。
- `tests/ui/mpas-qa.cjs --controlled`：503、延遲與恢復、初始離線、明確重試和中性狀態通過；console中的兩次503是明確測試夾具，非實際官方狀態。
- 新增／修改TSX已依React best-practices檢視：lazy宣告位於模組層、fallback保留工作資訊、原有狀態／effect／儲存介面與掛載生命週期保持；以實際流程和地圖幾何回歸驗證。
- `git diff --check`、測試腳本syntax檢查通過。資料與後端檔案、package檔案保持；taste-skill的1,631個檔案SHA-256相同。

UI雨量圖與MPAS原頁內容為明確受控素材，以隔離樣式／操作變化；沒有把測試圖當作官方預報，沒有重新驗證官方發布時間、水情或即時有效性。正式工具仍以原有URL讀官方圖與原頁。以上是macOS Chrome的視窗矩陣，未做iOS／Android真機驗收。地圖供應商原生地名字形與官方圖片／原頁文字不納入本站字級斷言。

## taste-skill 通用 gate 與未通過項

本輪 gate 在最後資訊標籤顏色校正前列出 `GATE: OPEN 20 (rounds used up)`；保留原始結果，不宣稱PASS。資訊標籤的舊淺綠文字其後已改共用可讀色，正式建置與七寬度專項UI再驗證通過。最後再呼叫 gate 時回傳 `GATE: OFF (no build active)`，依 skill 規則未重開／重跑。以下20項是該次通用檢查的歷史結果，並非宣稱最後版本仍有相同數目的缺陷。

本輪沒有新增／套用豁免。原有路線庫搜尋整組焦點的兩個豁免在雨量頁沒有匹配，因此被工具忽略。沒有修改kit或隱藏受測內容。主要差異是查詢工具保留可捲動面板、每個時段的操作、圖面及按需展開，沒有套用行銷hero、滿屏分節或裝飾moment。其他標籤／標題／對比發現也如實列出，並非完整全站可及性PASS。

| # | 檢查 | 對象 | 發現 |
| --- | --- | --- | --- |
| 1 | `hero-fill` | main#tool-main > section.rain-map-canvas "氣象署・6 小時累積雨量 +6 h 圖面已載入 原圖時間放大 +6 h 1 / " | the next section shows on the first screen: it starts at 76px on a 900px screen (the hero ends at 900px) |
| 2 | `cta` | main#tool-main > section.information-panel.collapsed | the hero has no button (the nav's does not count) |
| 3 | `heading-scale` | div.rain-controls > div.section-heading > div > h2 "全臺預測雨量" | an h2 at 26px, as large as the h1 (26px) or larger |
| 4 | `text-contrast` | div.panel-content > div.rain-controls > div.rain-product-heading > span.status-badge "氣象署原始圖面" | a caption, label or muted line in #829273 on #f5f7f1 reads 3.08:1 (needs 4.5:1) |
| 5 | `field-label` | section.information-panel.collapsed:nth-of-type(1) > div.panel-intro:nth-of-type(2) > label.search-field > input | a input[type=text] without a label you can see: its <label> is hidden |
| 6 | `moment-none` | (the page) | a software page (--type) deals no moment: every kind carries one, two on a long page (moments.md) |
| 7 | `hero-screen` | main#tool-main > section.rain-map-canvas "氣象署・6 小時累積雨量+6 h圖面已載入每 6 小時每 12 小時MPAS 雙" | 824px of the next section shows on the first screen (from 76px on a 900px screen): nothing below the hero shows at load (SR-1) |
| 8 | `hero-screen` | main#tool-main > section.information-panel.collapsed > footer.panel-footer > button "資料說明" | "資料說明" ends at 884px, below the hero's content line at 876px (the 900px screen less 24px) (SR-1) |
| 9 | `section-height` | main#tool-main > section.rain-map-canvas "氣象署・6 小時累積雨量+6 h圖面已載入每 6 小時每 12 小時MPAS 雙" | the section is 824px tall (0.9 screens), 76px short of one screen (900px): every section after the hero is one screen or two, 2px either way (SR-2) |
| 10 | `one-section` | main#tool-main > section.rain-map-canvas "氣象署・6 小時累積雨量+6 h圖面已載入每 6 小時每 12 小時MPAS 雙" | the screen at scroll 0px (stride 0) shows 824px of section 2 and the content of 2 sections, over 24px each beside section 1: a screen shows one section (another may peek 8px, 24px WARN) (SR-4) |
| 11 | `one-section` | section.information-panel.collapsed > div.panel-content > div.rain-controls > label.rain-range "預報段落1 / 8" | a band: a box 86% of the section wide on a ground of its own that holds only text: the section's own ground is the band (SR-4) |
| 12 | `one-heading` | div.rain-controls > div.section-heading > div > h2 "全臺預測雨量" | the hero holds an h2 (1): its heading is the h1, and an h2 opens the next section (SR-5) |
| 13 | `container-edges` | main#tool-main > section.rain-map-canvas "氣象署・6 小時累積雨量+6 h圖面已載入每 6 小時每 12 小時MPAS 雙" | the content of section 2 runs 360px from the left and 0px from the right (read from its outermost blocks: no .wrap): 360 and 0px are not one margin; the margin is 64-120px at 1440px (one container, equal margins, 2px either way) (SR-6) |
| 14 | `container-edges` | div#root > div.app-shell > header.app-header "mt_info急救雨量集水區路況計畫通山行卡來源更多" | the nav's content runs 24px from the left and 24px from the right (read from its outermost blocks: no .wrap): the page's container starts at 360px; the margin is 64-120px at 1440px (one container, equal margins, 2px either way) (SR-6) |
| 15 | `container-edges` | div#root "略過導覽，前往工具內容mt_info急救雨量集水區路況計畫通山行卡來源更多全臺雨" | a <div> at the top of the page, outside header.nav, main, footer.closing and nav.actionbar (SR-6) |
| 16 | `container-edges` | main#tool-main > section.information-panel.collapsed "全臺雨量圖全臺雨量圖雨量站與短時資料全臺預測雨量每 6 小時每 12 小時MPA" | the section needs exactly one in-flow child .wrap (it has 3 in-flow children, 0 .wrap) (and 1 more like it: "氣象署・6 小時累積雨量+6 h圖面已載入每 6") (SR-6) |
| 17 | `container-edges` | div#root > div.app-shell > header.app-header > a.brand "mt_info" | "mt_info" runs 24-196px, outside the container lines of the nav at 360-1440px: full width is for background layers and grounds only (SR-6) |
| 18 | `container-edges` | div.rain-controls > div.section-heading > div > h2 "全臺預測雨量" | "全臺預測雨量" runs 24-183px, outside the container lines of section 1 at 360-1440px: full width is for background layers and grounds only (and 65 more like it: "氣象署・6 小時累積雨量", "累積雨量 · mm", "01+6 h") (SR-6) |
| 19 | `hero-fill` | main#tool-main > section.rain-map-canvas "氣象署・6 小時累積雨量 +6 h 圖面已載入 每 6 小時 每 12 小時 M" | the next section shows on the first screen: it starts at 112px on a 844px screen (the hero ends at 2123px) |
| 20 | `container` | page | no .wrap |

保留WARN：

- `copy-headline`：工具名稱／繁體中文不採行銷英文詞數規範。
- `copy-actions`：每個時段與圖面需要獨立控制。
- `off-grid`：工具面板內採內距與控制分組。
- `section-gaps`：保留快速查詢密度。
- `skip-link`：實際DOM順序、Tab及移焦main已通過專項驗證；通用工具要求其特定header/wrap結構。
- `share-meta`：本機版本未新增正式分享素材與網域。
- `heading-scale`：保留產品／工作區的閱讀角色；頁面大標已統一36／30。
- `copy-numbered`：copy-lint WARN來自官方時段清單的01–08編號，屬實際選擇順序，保留。

## 比較與證據

- 前後比較（本機紀錄：`artifacts/interface-round2-2026-11-17/comparison.html`）
- 字體請求比對（本機紀錄：`artifacts/interface-round2-2026-11-17/font-request-comparison.json`）
- 七寬度UI結果（本機紀錄：`artifacts/interface-round2-2026-11-17/ui/result.json`）
- 路線庫回歸（本機紀錄：`artifacts/interface-round2-2026-11-17/catalog/result.json`）／路點與地圖回歸（本機紀錄：`artifacts/interface-round2-2026-11-17/waypoints/result.json`）
- 地圖檔載入失敗驗證（本機紀錄：`artifacts/interface-round2-2026-11-17/map-fault/result.json`）
- 效能量測（本機紀錄：`artifacts/interface-round2-2026-11-17/perf-final.log`）
- gate OPEN原始記錄（本機紀錄：`artifacts/interface-round2-2026-11-17/taste-gate.log`）／最後gate OFF（本機紀錄：`artifacts/interface-round2-2026-11-17/taste-gate-final.log`）
- 檔案保留核對（本機紀錄：`artifacts/interface-round2-2026-11-17/preservation.json`）

後續仍可研究繁中字型實際容量與共用樣式整理；此輪沒有更換字體、縮小文字或降低既有測試要求來取得數字。
