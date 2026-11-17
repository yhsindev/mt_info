# 山行卡與 Three.js 可行性草案

研究日期：2026-10-26。這是使用者提出新互動頁後的設計建議，尚未實作、加入導覽、安裝 Three.js 或改為已核定待辦。

## 建議的產品範圍

新增一個暫稱「山行卡」的獨立功能頁。測驗、抽卡、圖鑑及書籤是同一段體驗，不再分成四個頁面。保持現有森林綠、暖白、Georgia 字標，採幾何山形或版畫式圖像，讓遊戲仍像 mt_info 的延伸。

建議流程：

1. 入口提供「開始測驗」及次要的「直接抽卡」，既有收藏者可直接開圖鑑。
2. 約 6 題山行情境題，一次一題、可返回，題目聚焦同行節奏、觀察、紀錄及營地分工；答案不涉及真實風險判定。
3. 依作答顯示 4 種山行偏好之一，例如觀察、探索、紀錄、營地；名稱與文字仍需編寫。這是娛樂性的偏好描述，不是經驗、體能或專業能力評等。
4. 結果頁再抽取一張山景卡，首批建議 8 張：稜線、雲海、森林、溪谷、營地、星空、湖泊、晨光。測驗結果由作答決定；圖像卡均等隨機，兩者分開說明，避免讓人誤以為隨機卡是測驗評分。
5. 同頁可翻面、加入圖鑑、再抽、下載圖片及製作書籤。圖鑑用「已收藏／總數」及卡面縮圖；重複抽中保留原收藏，可顯示取得次數。

「得到卡片」不標成實際登頂或走完路線。將來若要做登山足跡，另外以使用者明確紀錄區分。卡片不回寫計畫配速、不解鎖進階路線，也不把抽卡結果用作當日出發建議。

## 入口與頁面

桌機可在計畫通附近放一個較輕的「山行卡」連結，視覺上與主要資料工具區隔。手機不直接在目前五個工具入口後擠第六顆按鈕，優先放在字標列右側的次要入口，來源收在同一個小型「更多」選單或頁內來源入口。實作前以 360px 寬實際確認標籤與點擊範圍，避免只是把擁擠搬到右上角。

遊戲本身一個功能頁即可：桌機左題目右卡片，手機依次顯示；收藏以同頁檢視切換／區塊呈現，避免套用計畫通的長表單。返回工具時保留原本計畫草稿及離開守門。收藏與計畫草稿使用不同資料鍵。

目前專案只有單一 React 入口，靠 query 切換工具，沒有路由套件。初版可用 Vite 的獨立 `cards.html` 入口，同網域即可共用品牌與收藏，不必先新增路由或伺服器。若確定要 `/cards` 形式，再依部署平台決定路由與 rewrite。這是選擇建議，並未修改現有入口。

## Three.js 的用途與取捨

| 互動 | 建議第一版 | 使用 Three.js 的價值 |
| --- | --- | --- |
| 題目、結果文字、圖鑑 | React／HTML | 保持可讀、鍵盤可操作 |
| 翻牌、滑動卡片、輕微傾斜 | CSS transform＋SVG | 只有平面翻轉時不必加 3D 引擎 |
| 可旋轉的立體山景卡、紙張厚度、隨視角變化的光澤 | 之後的獨立 Three.js 展示元件 | 有真實景深與光照才較能發揮價值 |
| 書籤／分享圖 | SVG、Canvas 2D、列印 CSS | 匯出文字清楚，不依賴當下 WebGL 截圖 |
| 核心地圖工具 | 保持既有 MapLibre | 已有地圖渲染，不為本次遊戲再疊一個長駐 3D 場景 |

結論：適合新增互動頁，但第一階段先驗證卡面、題目與收藏是否有吸引力。Three.js 放在一張卡的揭曉／旋轉展示，可選擇開啟；不是整站的前提。

技術依據與實作條件：

- 目前 `package.json` 沒有 Three.js／React Three Fiber。計畫編輯器已使用 lazy import；遊戲應獨立載入，未開遊戲時不下載卡面或 Three.js，也不輪詢氣象、設備及路況。
- Three.js 現行 WebGLRenderer 需要 WebGL 2；初始化失敗、context lost 或動效關閉時，直接顯示同一張 SVG／圖片，測驗、收藏、匯出都仍可操作。[官方 WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer)
- 只在揭曉、拖動或尺寸變更時渲染，結束動畫及背景分頁停止繪製；限制 drawing buffer 的像素總量。這是按需渲染的設計方向，不能據此宣稱已通過手機效能測試。[按需渲染](https://threejs.org/manual/pages/rendering-on-demand.html)、[響應式與解析度](https://threejs.org/manual/pages/responsive.html)
- 關閉展示時釋放 geometry、material、texture、renderer 與事件監聽；SPA 內切頁不會自動替應用清掉所有 GPU 資源。[資源釋放](https://threejs.org/manual/pages/how-to-dispose-of-objects.html)
- 支援 `prefers-reduced-motion` 及直接「顯示結果」；所有操作另有 HTML 按鈕，不要求拖動 3D 物件才能進行。[MDN 動效偏好](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion)

## 圖鑑保存與輸出

第一版可沿用無帳號方式，僅在目前裝置保存卡片 ID、卡面版本、首次取得時間及次數；不存原始作答、不寫入隊伍或定位資料。需提供收藏 JSON 備份／還原，儲存失敗時仍允許下載卡片，不能顯示已保存。localStorage 有來源隔離及私密模式／設定限制；正式網址換域後也不會自動帶入舊來源的收藏。[MDN localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)

卡片內容建議欄位：`id`、`seriesId`、`number`、`title`、`description`、`artwork`、`artworkVersion`、`credit`、`license`。測驗另存題目／選項 ID、評分版本及結果文案；正式素材使用自製或取得授權的圖像與字型，不直接使用山友照片或地圖截圖作卡面。

書籤建議先以 50×150mm 為成品尺寸：

- PNG 約 591×1772px，作數位分享；列印時仍須指定實體尺寸，不能靠 PNG 的 dpi metadata 保證尺寸。
- SVG 保留文字與向量圖像；字型嵌入／轉外框前需核對授權。
- A4 列印版加裁切線，先支援單面；雙面對位、出血與印刷廠規格另驗。瀏覽器可列印／另存 PDF，但這不等於已產生專業印刷 PDF。
- 畫面與匯出共用同一卡片內容模型，另做平面排版；目前 `PlanRouteView.tsx` 已有 SVG→Canvas→PNG 及下載流程可參考，不把登山路點圖模型硬套成卡片。
- 使用同來源或授權允許且 CORS 正確的素材，避免 Canvas 被污染而不能匯出。[MDN toBlob](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob)、[列印 CSS](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Media_queries/Printing)

## 建議實作次序與驗收

先完成 1 張卡面與書籤的視覺樣張，再做 6 題、4 結果、8 卡及本機圖鑑的完整流程。等收藏／匯出可用，才針對同一張卡試做 Three.js 版本比較。這樣可以先判斷內容與畫面是否成立，再決定 3D 的成本是否值得。

驗收需覆蓋：360／390px 無水平溢出；本文至少 16px、主要操作 48px；鍵盤作答／返回；結果重算；重複卡去重；重載與損壞／禁止儲存；JSON 備份；PNG 真正下載且尺寸正確；A4 列印裁切；開關頁面不載入工具資料；無 WebGL、減少動效及背景分頁仍能完成流程。加入 Three.js 後再以 iOS／Android 真機測卡頓、記憶體及耗電，尚未設定未經量測的效能保證。

本輪完成研究與現有計畫頁回歸，尚未製作遊戲卡面、題目或互動程式。
