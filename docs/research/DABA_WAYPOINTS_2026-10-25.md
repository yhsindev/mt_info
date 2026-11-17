# 大霸示範路線：地理路點查核

查核：2026-10-25；資料：[data/plan-waypoints-daba.json](../../data/plan-waypoints-daba.json)。本清冊記錄資料依據，產品顯示與編號規則見 [PLAN_GENERATOR.md](../PLAN_GENERATOR.md)。

## 可定位的五個重要路點

座標順序皆為經度、緯度，保留來源公布精度，不代表現地測量精度。

| 路點 | 經度 | 緯度 | 位置依據 |
| --- | --- | --- | --- |
| 觀霧山莊 | 121.1142067 | 24.5033841 | [OSM node 1506236957](https://www.openstreetmap.org/node/1506236957)，旅宿位置，排除同名公車站與登山服務站 |
| 馬達拉溪登山口 | 121.1925775 | 24.4840694 | [OSM node 9165014952](https://www.openstreetmap.org/node/9165014952)，明名 highway=trailhead 位置 |
| 九九山莊 | 121.208353 | 24.468835 | [國家公園署一站式景點介紹](https://hike.taiwan.gov.tw/information_node.aspx?id=68)直接列示經緯度 |
| 中霸山屋 | 121.251286 | 24.464724 | [國家公園署一站式景點介紹](https://hike.taiwan.gov.tw/information_node.aspx?id=304)直接列示經緯度 |
| 中霸坪 | 121.25805 | 24.463122 | [官方步道通訊點PDF](https://hike.taiwan.gov.tw/files/%E9%9B%AA%E9%9C%B8%E5%9C%8B%E5%AE%B6%E5%85%AC%E5%9C%92%E6%AD%A5%E9%81%93%E9%80%9A%E8%A8%8A%E9%BB%9E%E5%BD%99%E6%95%B4%E8%A1%A8.pdf)第3頁「29.5k中霸坪」WGS84欄 |

前三日範本的地名與順序以[林業署大霸尖山登山步道介紹](https://recreation.forest.gov.tw/Trail/RT?tr_id=027)核對。OSM兩點實際透過官方 `api.openstreetmap.org/api/0.6/map` 的觀霧與馬達拉小範圍下載查核，保留 element ID、版本與原始修改時間。OSM頁面未能透過web文字擷取器讀取，XML請求實際回傳200。

## 既有路線只覆蓋部分行程

重新下載並解析[林業署027 KMZ](https://data.moa.gov.tw/OpenData/GetOpenDataFile.aspx?id=438&FileType=DataMore&RID=2037)：一個 Placemark、一條131點 LineString，沒有命名 Point 路點。TRAILID=27、名稱為大霸尖山登山步道，與本機既有線段數量一致。

- 西端：121.1930468543653、24.48323046336119，位於馬達拉溪附近。
- 另一端：121.2522460093664、24.45564416398005，位於小霸尖山附近。
- **不包含觀霧至馬達拉溪約19公里的大鹿林道東線**，也不是三日往返的逐日軌跡。
- OSM馬達拉登山口與舊官方線端有約百公尺位置差，不能強制吸附，也不自動畫直線補接。

前端可用真實路點設定視野、顯示與時序對應的編號；原有官方路線須稱為參考線段。若尚無路點座標，仍保留時序編號與「未定位」文字，不能依公里數等比例內插。

## 暫未定位

白橋、3050高地、伊澤山捷徑岔、伊澤山登山口、大霸尖山霸基（折返點）。本輪未取得足以區分這些位置的明確公開座標。官方通訊PDF的大霸尖山三角點、OSM的大霸峰頂均**不可當作霸基折返點**；同理伊澤山峰頂不能代替登山口。

## 授權與時效

- 官方景點／官方PDF：適用[一站式網站資料開放宣告](https://hike.taiwan.gov.tw/OpenData.aspx)，須註明出處；本輪只摘錄地名與座標事實，未複製照片或整篇介紹。
- OSM兩點：© OpenStreetMap contributors，資料依 [ODbL](https://www.openstreetmap.org/copyright)提供。各點保留自己的來源及授權，不將整個彙整檔宣稱為單一政府授權；地圖顯示與資料再分發須保留OSM顯名及授權連結。
- 查閱時間與OSM編輯時間分開；官方座標測量日未知。這些點不表示道路或山屋現在開放、床位可用、供水或通訊正常。
