# 文件索引

首次使用請從[專案首頁的快速啟動](../README.md#快速啟動)開始。文件依操作、技術參考與背景分組，參考 [Diátaxis](https://diataxis.fr/) 的使用者需求分類；歷史驗證紀錄保留各自的日期與適用範圍。

## 操作指南

| 文件 | 適用任務 |
| --- | --- |
| [計畫通](PLAN_GENERATOR.md) | 建立與編輯逐日行程、保存、匯入及匯出 |
| [出發吧！](DEPARTURE.md) | 核對待辦、建立備案、比較與保存公告查核 |
| [路線庫](PLAN_CATALOG.md) | 理解範本、資源、來源與暫停套用的原因 |
| [路線資料工作簿](ROUTE_LIBRARY_WORKBOOK.md) | 以四表範本整理路線、路點、分段與來源 |
| [本機 GPX](LOCAL_ROUTES.md) | 匯入自己的軌跡作為地圖對照 |
| [山行卡](FIELD_CARDS.md) | 測驗、收藏、備份與輸出卡片 |
| [部署評估](DEPLOYMENT.md) | 準備正式環境、持久快取與排程 |

## 技術參考

| 文件 | 內容 |
| --- | --- |
| [資料來源清冊](DATA_SOURCES.md) | 來源、各類時間、涵蓋範圍與授權 |
| [氣象介接](WEATHER.md) | 產品權限、已實作與尚未啟用的範圍 |
| [官方雨量圖](RAIN_MAP_SOURCES.md) | 6／12 小時圖面、時間標示與 MPAS 原頁 |
| [路況與示警](CONDITIONS.md) | 公告生命週期、CAP、快取與來源狀態 |
| [自動更新](AUTO_UPDATE.md) | AED 名錄換版、排程、鎖定與失敗恢復 |
| [步道參考圖資](TRAIL_GEOMETRY.md) | 官方幾何來源、覆蓋缺口與匯入方式 |
| [設計系統](DESIGN_SYSTEM.md) | 字級、色彩、控制高度與介面規則 |

## 背景與研究

- [功能細節與實作背景](FEATURES.md)：公開初版的完整功能說明與實作脈絡。
- [品牌設計](BRAND_STUDY.md)：原創符號、採用版本與比較過程。
- [路線研究資料](../data/route-library/README.md)：批次來源索引與再利用界線。
- [分日合理性審查](research/ROUTE_FEASIBILITY_2026-10-27.md)：範本修改與暫停套用的依據。
- [大霸路點查核](research/DABA_WAYPOINTS_2026-10-25.md)：個別位置來源與官方參考線缺段。
- [後續待辦](NEXT_STEPS.md)與[審查路線圖](REVIEW_AND_ROADMAP_2026-10-21.md)：待補資料與後續方向。

## 維護與驗證

- [參與開發](../CONTRIBUTING.md)：開發與提交方式。
- [安全與敏感問題](../SECURITY.md)：回報流程及已知套件風險。
- [第三方聲明](../THIRD_PARTY_NOTICES.md)：程式授權以外的資料與素材條款。
- [歷史驗證](VERIFICATION.md)：過往測試的條件、結果與限制；目前 CI 以 [GitHub Actions](https://github.com/yhsindev/mt_info/actions/workflows/ci.yml) 為準。

文件提及的 `artifacts/` 是本機驗證輸出位置，公開程式庫不附這些檔案。請依對應腳本重新產生，並保留測試日期與資料來源。
