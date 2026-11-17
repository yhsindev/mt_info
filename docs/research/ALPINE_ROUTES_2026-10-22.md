# 百岳多日路線補充查核（2026-10-22）

這份文件支援計畫通路線庫資料整理；不是路況保證、取水實測或許可核發紀錄。查核日期是臺灣時間 2026-10-22；沒有逐項發布時間或現勘時間者，`sourcePublishedAt`／`observedAt` 維持 `null`。除官方已有獨立分段資料的舊範本外，新增框架的距離、行走分鐘、休息分鐘、水量皆維持 `null`。分日方式可能是本產品依官方節點整理，不能標成官方推薦的相同天數。

## 本次可採用的五條框架

| 建議 id | 路線 | 山脈 | 區域 | 參考天數 | 依據性質 |
| --- | --- | --- | --- | --- | --- |
| `wuling-four` | 武陵四秀 | 雪山山脈 | 臺中市・新竹縣 | 3 | 官方已有三日順序 |
| `qilai-main-north` | 奇萊主北 | 中央山脈 | 南投縣・花蓮縣 | 3 | 官方已有三日順序，新屋須另查 |
| `kuhanoxin-guanshan` | 庫哈諾辛山・關山 | 中央山脈 | 高雄市 | 2 | 官方已有二日順序 |
| `xueshan-cuichi` | 雪山主東・翠池 | 雪山山脈 | 臺中市・苗栗縣 | 4 | 官方節點，本產品分日框架 |
| `yushan-main-west` | 玉山主西峰 | 玉山山脈 | 南投縣・嘉義縣 | 3 | 官方支線，本產品分日框架 |

山脈是位置索引，與難度、單日／多日、是否百岳各自分開。上表的天數只描述這份草稿，不能推論其他走法應如何分類。

## 最新公告與來源差異

- 雪霸[全面禁止入園公告](https://www.spnp.gov.tw/ch/specialreport/latest-news/3873)正文載明自 **115 年 10 月 21 日 23 時 30 分起**禁止生態保護區與其他管制區入園，既有許可失效，恢復另行公告。這是 10/22 讀到的公告快照，不可將四秀、雪山或翠池範本存在解讀成現在可走。
- 一站式的[開放查詢](https://hike.taiwan.gov.tw/open.aspx)以條件、表單與圖示呈現可申請及本日開放，單純讀取文字沒有足夠證據判定每條路線現況。範本連到原站，不能自行填「開放」。
- 奇萊新山屋的[開放使用公告](https://www.taroko.gov.tw/ch/titlelist/news/4488)已談新屋申請與指定宿營，但[太魯閣山屋概況](https://hike.taiwan.gov.tw/bed_4.aspx)的奇萊水源敘述仍出現下切溪谷。新屋[官方專文](https://www.taiwan.nps.gov.tw/home/zh-tw/topic/33867)提到雨／雪水收集設施。這些資料的年代與設施代次須區分，不能把舊稜線小屋的床數、下切分鐘或穩定水描述直接套在新屋。
- 庫哈諾辛的山屋頁要求自登山口攜水，注意事項又記有山屋儲水塔；應保留兩者，不能把設施存在改成供水確認。

## 1. 武陵四秀

官方[武陵四秀介紹](https://www.spnp.gov.tw/ch/mountaininfo/wuling-four-beauties-route)、[國家公園專文](https://www.taiwan.nps.gov.tw/home/zh-tw/topic/18664.html)及[一站式路線介紹](https://hike.taiwan.gov.tw/information_1.aspx)均可交叉閱讀。官方把這組山峰置於雪山山脈東北延伸稜脊。

可編輯順序：

1. 武陵山莊／武陵吊橋 → 池有山登山口 → 三叉營地 → 新達山屋（宿）。
2. 新達山屋 → 品田山往返 → 池有山岔路及池有山往返 → 三叉營地 → 桃山山屋（宿）。
3. 桃山山屋 → 桃山 → 喀拉業山 → 桃山山屋 → 桃山登山口 → 武陵山莊。

官方表的池有支線語句較不流暢，產品只取可明確核對的節點與往返關係，不複製原句、不移植原分鐘。品田前 V 型谷列入[雪霸危險路段提醒](https://www.spnp.gov.tw/ch/specialreport/latest-news/3856)；不要以「入門」概括。

資源可重用現有 `xinda-hut`／`xinda-water`、`taoshan-hut`／`taoshan-water`，並可列營地作替代資料。依[雪霸宿營地概況](https://hike.taiwan.gov.tw/bed_1.aspx)，兩處均記有雨水收集，乾期不穩。營地需要各晚核准，不能當成山屋沒床時的自動備案。現有水量、水質與床位未知。

入口：[入園申請](https://hike.taiwan.gov.tw/apply_1.aspx)、[雪霸宿營地](https://hike.taiwan.gov.tw/bed_1.aspx)、[路線開放](https://hike.taiwan.gov.tw/open.aspx)。

健行筆記可提供延伸閱讀：[武陵四秀登山步道](https://hiking.biji.co/index.php?act=detail&id=540&q=trail)。其介紹有雨水箱與乾期限制；不採頁面山友留言的水情當即時確認，不下載 GPX 或圖片。

## 2. 奇萊主北

[太魯閣官方路線問答](https://www.taroko.gov.tw/ch/listicle/faq/350)與[一站式介紹](https://hike.taiwan.gov.tw/information_1.aspx)有相同三日節點。奇萊山區屬中央山脈；可顯示南投／花蓮跨縣市。

1. 奇萊登山口 → 黑水塘山屋 → 成功山屋 → 奇萊山屋（宿）。
2. 奇萊山屋 → 奇萊北峰 → 奇萊山屋 → 奇萊主峰 → 奇萊山屋（宿）。
3. 奇萊山屋 → 成功山屋 → 黑水塘山屋 → 奇萊登山口。

這是官方原有三日框架；新屋開放並不降低登山口至稜線的陡升與高山適應負擔。[新屋公告](https://www.taroko.gov.tw/ch/titlelist/news/4488)要求依核准路線與宿營地，不能任意改住；先前[申請說明](https://www.taroko.gov.tw/ch/titlelist/news/4431)帶有試營運過渡安排，應讓最新公告優先，不將過渡安排長期寫入操作流程。

新增資源：黑水塘山屋、成功山屋、成功溪溝水源紀錄、新奇萊山屋、奇萊山屋集水設施紀錄。設施來源：[官方山屋概況](https://hike.taiwan.gov.tw/bed_4.aspx)；新屋設施：[與自然和諧共生](https://www.taiwan.nps.gov.tw/home/zh-tw/topic/33867)。舊[登山設施問答](https://www.taroko.gov.tw/ch/listicle/faq/351)不能用來聲稱新奇萊山屋只容 8 人或取水需固定 30 分鐘。所有水源 `currentAvailability: unknown`；儲水設備容量不是剩餘量，過濾設施也不是飲用水檢驗。

入口：[入園申請](https://hike.taiwan.gov.tw/apply_1.aspx)、[太魯閣山屋查詢](https://hike.taiwan.gov.tw/bed_4.aspx)、[路線開放](https://hike.taiwan.gov.tw/open.aspx)。

健行筆記：[奇萊主山、奇萊北峰步道](https://hiking.biji.co/index.php?act=detail&id=542&q=trail)。只作地形與沿途節點的延伸閱讀，舊文章中的稜線小屋名稱與新屋要分開。

## 3. 庫哈諾辛山・關山

[玉山官方路線](https://www.ysnp.gov.tw/Trail/382f4797-1eb1-4746-a122-4e13a9e0c7e4)及[一站式介紹](https://hike.taiwan.gov.tw/information_1.aspx)有兩日住宿走法。位置索引為中央山脈南段／高雄市；不可因管理處是玉山國家公園就歸成玉山山脈。

1. 進涇橋登山口 → 庫哈諾辛山屋 → 庫哈諾辛山 → 庫哈諾辛山屋（宿）。
2. 庫哈諾辛山屋 → 關山 → 庫哈諾辛山屋 → 進涇橋登山口。

可加入山屋、營地與雨水集設施紀錄。官方[山屋深連結](https://www.ysnp.gov.tw/Trail/382f4797-1eb1-4746-a122-4e13a9e0c7e4?ID=b7e29b9e-a9f3-4bff-b6c3-b8e2de6b63cd&Tab=3)要求攜水，並記有集水設施；[注意事項](https://www.ysnp.gov.tw/Trail/382f4797-1eb1-4746-a122-4e13a9e0c7e4?Tab=5)記沿線無水與山屋儲水塔。保守呈現「需自備水，山屋儲水量待核實」。不要採 2023 或 2024 缺水／充足快照為 2026 水情。

官方注意事項另有入園、入山與南橫道路管制內容；道路規定可能更新，不在範本固化星期與時段。日後應另核公路局最新交通公告。申請：[一站式](https://hike.taiwan.gov.tw/apply_1.aspx)，床位：[玉山宿營地](https://hike.taiwan.gov.tw/bed_6.aspx)，現況：[路線開放](https://hike.taiwan.gov.tw/open.aspx)。

本次沒有找到足以比官方二日框架更清楚、且不是單攻或高階探勘支線的健筆路線介紹，不為湊連結放入單攻文章。

## 4. 雪山主東・翠池

新增的是延伸翠池的版本，不取代雪山主東原範本。[官方翠池介紹](https://www.spnp.gov.tw/ch/titlelist/geological-resources/165)說明主峰西側碎石坡下的翠池位置；[官方風險提醒](https://www.spnp.gov.tw/ch/specialreport/latest-news/3856)點名主峰至翠池碎石坡。宿營配置可依[雪霸概況](https://hike.taiwan.gov.tw/bed_1.aspx)查得七卡、三六九臨時營地及翠池山屋。原三六九山莊停申請，不能套舊遊記中的山屋住宿。

本產品可選的四日草稿：

1. 雪山登山口 → 七卡山莊（宿）。
2. 七卡山莊 → 雪山東峰 → 三六九臨時營地（宿）。
3. 三六九臨時營地 → 雪山主峰 → 翠池山屋（宿）。
4. 翠池山屋 → 雪山主峰 → 三六九臨時營地 → 七卡山莊 → 雪山登山口。

這個分日方式是整理框架，最後一天仍有相當路程，不宣稱寬鬆、適合新手或保證完成；登頂與下撤順序須配合核准路線、天候及隊況。重用七卡、三六九、翠池的既有山屋／營地／水源紀錄，新增數字資料維持未知。翠池水源紀錄不代表可直接飲用；冬季供水限制需保留。

申請與床位同雪霸入口；區域位置為雪山山脈，臺中／苗栗山區。舊圖中不同的翠池海拔數值不必在本輪硬選一個。

## 5. 玉山主西峰

[玉山官方步道分級表](https://www.ysnp.gov.tw/StaticPage/Trails)把主峰／西峰列為同一群峰系統的支線；[玉山群峰介紹](https://www.ysnp.gov.tw/Trail/7fa5c242-df1a-4a8e-bcab-32dc55b1f7b6)可確認排雲基地與西峰節點。[官方導覽圖](https://www.ysnp.gov.tw/ckfinder/userfiles/files/%E7%8E%89%E5%B1%B1%E7%BE%A4%E4%B8%BB%E5%B3%B0.pdf)可補路線連接關係。它是玉山山脈，不能以國家公園群峰概念混入中央山脈。

本產品三日草稿（不是把官方二日行程改稱官方三日）：

1. 塔塔加登山口 → 排雲山莊（宿）。
2. 排雲山莊 → 玉山主峰 → 排雲山莊（宿）。
3. 排雲山莊 → 玉山西峰 → 排雲山莊 → 塔塔加登山口。

兩晚排雲必須分別取得核准；不能用未核准連住當預設已訂。西峰往返後回排雲再下山，避免把西峰支線錯畫成直接接下山的穿越路。只重用排雲山莊與排雲供水紀錄，不額外創造西峰水源或營地。[排雲官方設施](https://www.ysnp.gov.tw/Trail/7fa5c242-df1a-4a8e-bcab-32dc55b1f7b6?ID=ac18e8d4-0868-4487-96ca-f4497439d3f8&Tab=3)載有冬季缺水／結冰限制，附近沒有指定露營區，不能將附近空地當替代宿營。

申請：[一站式](https://hike.taiwan.gov.tw/apply_1.aspx)，床位：[玉山宿營地](https://hike.taiwan.gov.tw/bed_6.aspx)，現況：[路線開放](https://hike.taiwan.gov.tw/open.aspx)。

健筆可連[玉山西峰步道](https://hiking.biji.co/index.php?act=detail&id=1046&q=trail)；不要用[前五峰介紹](https://hiking.biji.co/index.php?act=detail&id=591&q=trail)的總里程或 3 日時間當作只有主西峰的數據。前五峰有東／北／前峰支線，範圍不同。

## 暫緩直接補成範本

- **雪山西稜**：一站式[逆向七日介紹](https://hike.taiwan.gov.tw/en/information_1.aspx?c_id=542)不能直接倒用為本站東進西出六日；需另核 230 林道、步程、指定營地與兩端接駁。不可為了 2–5 日篩選硬壓縮；[健筆路線介紹](https://hiking.biji.co/index.php?act=detail&id=641&q=trail)的 2026/7 山友水情仍只是該趟記錄。原本誤連玉山主峰 `c_id=149`，2026-10-27 已修正來源。
- **I／O／Y 聖稜線**：官方原順序有素密達與品田等困難地形，並涉及舊三六九住宿文字；要做獨立技術需求及宿營更新整理，不把既有山屋清單湊成低門檻走法。
- **八大秀**：有官方[分級](https://www.ysnp.gov.tw/StaticPage/Trails)及新[觀高山屋消息](https://www.ysnp.gov.tw/Announcement/C001000?ID=b1f3f8b3-8c3e-47c5-ba42-335118a6b529&PageIndex=1&PageType=1)，但舊紀錄對觀高／八通關高繞與白洋金礦取水描述差異大；需要逐段核實後再補四／五日框架。不可把「觀高工作站停用」寫成新觀高山屋也不存在，反向也不可因新山屋落成推定全線開放。
- **合歡北西**：北西往返單日與紮營過夜是不同走法，不能只因使用者偏好多日就加入未核准高山草原營地；本輪不納入。

## 來源使用方式

這次只獨立改寫路線名稱、位置、節點及設施事實，保留原文連結與讀取日期。未複製健行筆記文章、圖片、GPX 或地圖；公開瀏覽不等於取得這些作品的再發布授權。官方資料的再利用仍依各站開放宣告及個別附件條件，申請網站查詢不代表已取得個人資料或訂位資料整批再發布權。
