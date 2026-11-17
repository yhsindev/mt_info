import type { PlanTemplateDay, ResourceSeed, TemplateSeed } from './catalog';

/** Source reading time; never a statement of field conditions or route access. */
export const SHEIPA_NEXT_CHECKED_AT = '2026-10-26T12:24:53Z';
const SHEIPA = 'https://hike.taiwan.gov.tw/bed_1.aspx';
const APPLY = 'https://hike.taiwan.gov.tw/apply_1.aspx';
const OPEN = 'https://hike.taiwan.gov.tw/open.aspx';
const BIJI = (id: number) => `https://hiking.biji.co/index.php?act=detail&id=${id}&q=trail`;
const BAIGU_REPORT = 'https://hiking.biji.co/index.php?act=info&q=review&review_id=32224';
const NPS_ROUTE_GRADES = 'https://www.nps.gov.tw/uploads/files/4a092a833101f71aa6d85befa9144191.pdf';
const day = (label: string, stops: string[], resourceIds: string[], lodgingResourceId: string | null = null): PlanTemplateDay => ({ label, stops, resourceIds, lodgingResourceId });
const reference = (routeId: number, from: string, to: string, minutes: number, distanceKm: number) => ({
  from, to, minutes, distanceKm, sourceUrl: BIJI(routeId), sourceName: '健行筆記編輯', checkedAt: SHEIPA_NEXT_CHECKED_AT,
});

export const NEXT_SHEIPA_TEMPLATES: readonly TemplateSeed[] = [
  {
    id: 'xueshan-west-ridge', name: '雪山西稜', routeName: '雪山登山口－翠池－火石－大雪－中雪－小雪山', category: '百岳',
    mountainRange: '雪山山脈', region: '臺中市・苗栗縣', grade: '高山長程縱走・林道崩塌路段', referenceRouteId: null,
    checkedAt: SHEIPA_NEXT_CHECKED_AT,
    summary: '東進西出的六日主要節點研究版本，保留火石、大雪與中雪往返。分日尚未通過審查；舊三六九僅作路經參考，230 林道高繞、宿營許可與兩端接駁待核。2026 年四日 GPX 只供方向比對。',
    planningReady: false,
    planningReview: '暫停一鍵套用：原編輯六日版本第 2 天約 10 小時、第 4 天約 12 小時 20 分移動，均未含休息；六日分類不保證此分日可供一般隊伍使用。須重排每日終點，核對合法宿營點、路況及隊伍配速。上河 G05 目前只連原站圖幅，本站尚未採錄其分段分鐘。',
    sourceUrls: [NPS_ROUTE_GRADES, BIJI(641), SHEIPA], links: { application: APPLY, beds: SHEIPA, status: OPEN },
    days: [
      day('第 1 天｜雪山登山口至七卡', ['雪山登山口', '七卡山莊'], ['qika-hut', 'qika-water'], 'qika-hut'),
      day('第 2 天｜經雪山主峰至翠池', ['七卡山莊', '雪山東峰', '三六九舊山莊路段（待核）', '雪山主峰', '翠池山屋'], ['qika-water', 'cuichi-hut', 'cuichi-water'], 'cuichi-hut'),
      day('第 3 天｜火石往返至大南西鞍', ['翠池山屋', '博可爾草原', '火石山登山口營地', '火石山', '火石山登山口營地', '大南山西鞍營地'], ['cuichi-water', 'huoshi-camp', 'huoshi-water', 'danan-west-camp', 'danan-west-water'], 'danan-west-camp'),
      day('第 4 天｜經頭鷹、奇峻與大雪至中雪登山口', ['大南山西鞍營地', '頭鷹山', '奇峻山', '大雪山登山口', '大雪山', '大雪山登山口', '匹匹達東鞍營地', '林道28K工寮', '中雪山登山口'], ['danan-west-water', 'xuexi-26k-camp', 'xuexi-26k-water'], 'xuexi-26k-camp'),
      day('第 5 天｜中雪往返至11K', ['中雪山登山口', '中雪山', '中雪山登山口', '合流山登山口', '11K雙流水營地'], ['xuexi-26k-water', 'xuexi-11k-camp'], 'xuexi-11k-camp'),
      day('第 6 天｜230林道出小雪山', ['11K雙流水營地', '9K坍方路段（高繞待核）', '小雪山遊客中心'], ['xuexi-11k-camp']),
    ],
  },
  {
    id: 'daxiaojian', name: '大小劍・佳陽', routeName: '松茂－油婆蘭基地－佳陽與小劍－大劍往返', category: '百岳',
    mountainRange: '雪山山脈', region: '臺中市', grade: '高山多日・長程支線與缺水稜線', referenceRouteId: null,
    checkedAt: SHEIPA_NEXT_CHECKED_AT,
    summary: '松茂進出的四日研究版本，預排三晚油婆蘭；來源摘要寫四日、表列三日，本工具另將大劍往返與下山分日。首日參考移動時間已達 11 小時 50 分，分日與宿營需重核。',
    planningReady: false,
    planningReview: '暫停一鍵套用：第 1 天已收錄的編輯來源分段合計 710 分（11 小時 50 分），未含休息，後三天多數路段時間未知；四日切法也不是來源表列的逐日安排。須核對各日宿營、許可、隊伍配速及回程節點後再提供計畫範本。',
    sourceUrls: [NPS_ROUTE_GRADES, BIJI(689), SHEIPA], links: { application: APPLY, beds: SHEIPA, status: OPEN },
    days: [
      day('第 1 天｜松茂至油婆蘭', ['松茂林道入口', '仁壽橋', '仁壽檢查哨', '松茂水文站', '樂山橋', '防火巷登山口', '推論山', '油婆蘭山', '油婆蘭營地'], ['youpolan-camp', 'youpolan-hut', 'youpolan-water'], 'youpolan-camp'),
      day('第 2 天｜佳陽與小劍往返', ['油婆蘭營地', '油婆蘭山', '布伕奇寒山', '老伍營地', '佳陽山', '小劍山', '佳陽山', '老伍營地', '布伕奇寒山', '油婆蘭山', '油婆蘭營地'], ['youpolan-camp', 'youpolan-water'], 'youpolan-camp'),
      day('第 3 天｜大劍往返', ['油婆蘭營地', '鞍部水源岔路', '大劍山', '鞍部水源岔路', '油婆蘭營地'], ['youpolan-camp', 'youpolan-water'], 'youpolan-camp'),
      day('第 4 天｜返回松茂', ['油婆蘭營地', '油婆蘭山', '推論山', '防火巷登山口', '樂山橋', '松茂水文站', '仁壽檢查哨', '仁壽橋', '松茂林道入口'], ['youpolan-water']),
    ],
    referenceSegments: [
      reference(689, '松茂林道入口', '仁壽橋', 30, 1.5),
      reference(689, '仁壽橋', '仁壽檢查哨', 5, .1),
      reference(689, '仁壽檢查哨', '松茂水文站', 70, 3.4),
      reference(689, '松茂水文站', '樂山橋', 15, 1.1),
      reference(689, '樂山橋', '防火巷登山口', 30, 2.4),
      reference(689, '防火巷登山口', '推論山', 420, 5.5),
      reference(689, '推論山', '油婆蘭山', 135, 2),
      reference(689, '油婆蘭山', '油婆蘭營地', 5, .1),
    ],
  },
  {
    id: 'zhijiayang-xueshan', name: '志佳陽上雪山', routeName: '司界蘭溪吊橋－志佳陽－雪山主峰－武陵', category: '百岳',
    mountainRange: '雪山山脈', region: '臺中市', grade: '高山多日穿越・陡升與舊山徑', referenceRouteId: null,
    checkedAt: '2026-10-27T01:32:05Z',
    summary: '環山進、雪山登山口出的三日框架，區分志佳陽基點峰與最高峰。原介紹使用舊三六九山莊，本工具第二夜改列臨時營地待核准，相關分鐘不沿用；原始 GPX、路況與接駁仍待補。',
    planningReady: false,
    planningReview: '暫停一鍵套用：來源三日版第 1 天從司界蘭溪吊橋到雪山山莊舊址約 10 小時 20 分移動，尚未含休息；舊址水源與宿營條件、第二晚三六九臨時營地許可也須逐日核對。先研究較長分日，不能把三日總分類當成目前切法已通過。',
    sourceUrls: [BIJI(1689), SHEIPA], links: { application: APPLY, beds: SHEIPA, status: OPEN },
    days: [
      day('第 1 天｜志佳陽至雪山山莊舊址', ['司界蘭溪吊橋', '3.1K營地', '賽良久營地', '瓢簞山屋', '志佳陽基點峰', '志佳陽最高峰', '雪山山莊舊址'], ['piaodan-hut', 'old-xueshan-camp', 'old-xueshan-water'], 'old-xueshan-camp'),
      day('第 2 天｜經雪山主峰至臨時營地', ['雪山山莊舊址', '雪山主峰', '雪山圈谷', '三六九臨時營地'], ['old-xueshan-water', '369-camp', '369-water'], '369-camp'),
      day('第 3 天｜經雪東返回武陵', ['三六九臨時營地', '雪山東峰', '七卡山莊', '雪山登山口'], ['369-water', 'qika-water']),
    ],
    referenceSegments: [
      reference(1689, '雪山山莊舊址', '雪山主峰', 210, 1.7),
      reference(1689, '雪山主峰', '雪山圈谷', 40, 1.1),
    ],
  },
  {
    id: 'baigu', name: '白姑大山', routeName: '紅香登山口－司晏池宿營－白姑大山往返', category: '百岳',
    mountainRange: '雪山山脈', region: '南投縣・臺中市', grade: '百岳三日・倒木岩稜與石瀑', referenceRouteId: null,
    checkedAt: '2026-10-27T01:32:05Z',
    summary: '紅香進出的三日框架，司晏池住兩晚；把來源兩日版長達 11 小時的攻頂加下山拆開。保留東南峰、吉他營地與草青池主要節點。司晏池僅有宿營紀錄，許可與現況待核；水況來源含 2024 年歷史紀錄，非當季水情。',
    planningReview: '舊版兩日草稿第 2 天約 11 小時移動且未含休息；新版改成三日，第二日白姑往返司晏池、第三日下山。既有兩日草稿須手動改分日；司晏池兩晚的宿營容許範圍和現況仍需另查。',
    sourceUrls: [BIJI(653), BAIGU_REPORT], links: { application: null, beds: null, status: 'https://nantou.forest.gov.tw/' },
    days: [
      day('第 1 天｜登山口至司晏池', ['白姑大山登山口', '三錐山', '司晏池'], ['siyan-camp', 'baigu-ditch-water', 'baigu-tank-water'], 'siyan-camp'),
      day('第 2 天｜白姑往返司晏池', ['司晏池', '白姑大山東南峰', '吉他營地', '草青池', '白姑大山', '吉他營地', '司晏池'], ['siyan-camp', 'baigu-caoqing-water', 'baigu-ditch-water', 'baigu-tank-water'], 'siyan-camp'),
      day('第 3 天｜返回紅香登山口', ['司晏池', '三錐山', '白姑大山登山口'], ['siyan-camp', 'baigu-ditch-water', 'baigu-tank-water']),
    ],
    referenceSegments: [
      reference(653, '白姑大山登山口', '三錐山', 170, 2.5),
      reference(653, '三錐山', '司晏池', 130, 2.1),
    ],
  },
];

const official = (id: string, name: string, type: 'water' | 'camp', limitations: string): ResourceSeed => ({
  id, name, type, region: '雪山山脈', sourceName: '國家公園署・雪霸宿營地概況', sourceUrls: [SHEIPA], checkedAt: SHEIPA_NEXT_CHECKED_AT,
  season: '高山天候、枯水期及設施現況須查核', limitations,
});
export const NEXT_SHEIPA_RESOURCES: readonly ResourceSeed[] = [
  official('huoshi-camp', '火石山下營地', 'camp', '官方列有宿營設施；與路線介紹「火石山登山口營地」的精確位置對應待 GPX 查核，不因此將營地座標視為取水點。須依核准宿營地使用。'),
  official('huoshi-water', '火石山下溪澗水源記錄', 'water', '官方概況記溪澗來源；未取得本季現地日期、流量、水質或取水支線座標。'),
  official('danan-west-camp', '大南山西鞍營地', 'camp', '官方列為宿營設施；當日可達、營地狀況及每晚核准另查。'),
  official('danan-west-water', '大南山西鞍溪澗水源記錄', 'water', '官方概況記溪澗來源；營地名稱不代表水就在營位旁，可取量、水質及取水支線未核實。'),
  official('xuexi-26k-camp', '230林道26K營地', 'camp', '官方列有營地；與路線介紹「中雪山登山口」宿營範圍的精確對應待核，須另確認林道進出及宿營許可。'),
  official('xuexi-26k-water', '230林道26K沿途溪澗記錄', 'water', '官方概況記沿途溪澗；不是已定位取水點或當天供水證明。'),
  { id: 'xuexi-11k-camp', name: '11K雙流水宿營紀錄', type: 'camp', region: '230林道', sourceName: '健行筆記・雪山西稜線', sourceUrls: [BIJI(641)], checkedAt: SHEIPA_NEXT_CHECKED_AT, season: '林道崩塌、高繞與溪流狀況另查', limitations: '路線介紹中的歷史宿營名稱，尚未核得同名官方指定營地與許可；不因名稱有流水便推定能取水。' },
  official('youpolan-water', '油婆蘭池水源記錄', 'water', '官方記池水及水質限制；池的存在不表示當天有水、可直接飲用或足以供應隊伍。鞍部下切取水另作支線查核。'),
  official('old-xueshan-water', '雪山山莊舊址溪谷取水記錄', 'water', '官方記需下切溪谷尋水；不是營地旁已定位水源，不將來源繞行時間默默計入主線，水量與水質仍未知。'),
  { id: 'siyan-camp', name: '司晏池宿營紀錄', type: 'camp', region: '白姑大山', sourceName: '健行筆記・Jaken 木易行旅（2024 年紀錄）', sourceUrls: [BAIGU_REPORT, BIJI(653)], checkedAt: SHEIPA_NEXT_CHECKED_AT, sourcePublishedAt: '2024-05-27', observedAt: '2024-05-18', season: '池位、泥濘與宿營環境需另查', limitations: '作者當日過夜紀錄，並非本工具確認的官方營地或宿營許可；現行容許範圍、道路與營位狀況尚未核實。' },
  { id: 'baigu-ditch-water', name: '白姑沼澤營地旁溪溝取水紀錄', type: 'water', region: '白姑大山', sourceName: '健行筆記・Jaken 木易行旅（2024 年紀錄）', sourceUrls: [BAIGU_REPORT], checkedAt: SHEIPA_NEXT_CHECKED_AT, sourcePublishedAt: '2024-05-27', observedAt: '2024-05-18', season: '來源為當次雨後取水，枯水期及本季流況未知', limitations: '2024-05-18 作者記在溪溝取水，沒有取水點座標；不採作者水質評語作檢驗結論。下切支線與取水休息須由隊伍另排。' },
  { id: 'baigu-tank-water', name: '八仙山林場遺址水槽紀錄', type: 'water', region: '白姑大山', sourceName: '健行筆記・Jaken 木易行旅（2024 年紀錄）', sourceUrls: [BAIGU_REPORT], checkedAt: SHEIPA_NEXT_CHECKED_AT, sourcePublishedAt: '2024-05-27', observedAt: '2024-05-18', season: '歷史儲水紀錄，乾期、設施與水質現況未知', limitations: '作者當日記有水槽及存水，不代表現在可取或可飲用；未提供可靠容量與精確位置。' },
  { id: 'baigu-caoqing-water', name: '白姑草青池水源記錄', type: 'water', region: '白姑大山', sourceName: '健行筆記・白姑大山路線介紹', sourceUrls: [BIJI(653)], checkedAt: SHEIPA_NEXT_CHECKED_AT, season: '池水量不穩定，雨量與乾期影響未核實', limitations: '編輯介紹的池水記錄，無現地日期，不等同本季供水或飲用水檢驗；應另規劃備水。' },
];
