import { createBlankPlan, createPlanDay, createPlanLeg } from './model';
import { createDabaPlan, DABA_REFERENCE_URL } from './reference';
import type { PlanDraft } from './types';
import { EXPANDED_RESOURCES, EXPANDED_TEMPLATES, SHEIPA_ACCESS_SNAPSHOT } from './library-expansion';
import { NEXT_SHEIPA_RESOURCES, NEXT_SHEIPA_TEMPLATES } from './library-sheipa-next';
import { NEXT_CENTRAL_RESOURCES, NEXT_CENTRAL_TEMPLATES } from './library-central-next';

export type PlanCategory = '百岳' | '中級山';
export type MountainRange = '雪山山脈' | '中央山脈' | '玉山山脈' | '阿里山山脈' | '海岸山脈';
export type ResourceType = 'water' | 'hut' | 'camp';
export interface PlanResource {
  id: string; name: string; type: ResourceType; region: string;
  routeIds: readonly string[]; dayIndex: number | null;
  sourceName: string; sourceUrls: readonly string[]; checkedAt: string;
  sourcePublishedAt: string | null; observedAt: string | null;
  season: string; limitations: string; currentAvailability: 'unknown';
}
export interface PlanTemplateDay {
  label: string; stops: readonly string[]; resourceIds: readonly string[];
  lodgingResourceId: string | null;
}
export interface PlanSegmentReference {
  from: string; to: string; minutes: number | null; distanceKm: number | null;
  sourceUrl: string; sourceName: string; checkedAt: string;
}
export interface PlanTemplate {
  id: string; name: string; routeName: string; category: PlanCategory;
  grade: string; region: string; mountainRange: MountainRange; referenceDays: number; referenceRouteId: string | null;
  summary: string; sourceUrls: readonly string[]; checkedAt: string;
  planningReview?: string;
  planningReady?: boolean;
  accessNotice?: { text: string; sourceUrl: string; checkedAt: string };
  links: { application: string | null; beds: string | null; status: string };
  days: readonly PlanTemplateDay[]; resourceIds: readonly string[];
  referenceSegments?: readonly PlanSegmentReference[];
}

/** Reading an official introduction is not an observation of water or an opening check. */
export const PLAN_CATALOG_CHECKED_AT = '2026-10-22T08:31:36Z';
const SHEIPA = 'https://hike.taiwan.gov.tw/bed_1.aspx';
const APPLY = 'https://hike.taiwan.gov.tw/apply_1.aspx';
const OPEN = 'https://hike.taiwan.gov.tw/open.aspx';
const TIANCHI = 'https://tconline.forest.gov.tw/';
const TIANCHI_FAQ = 'https://tconline.forest.gov.tw/faq/index.php?parent_id=198';
const TIANCHI_TRIP = 'https://tconline.forest.gov.tw/fetrip/?parent_id=196';
const JADE_HUT = 'https://www.ysnp.gov.tw/Trail/7fa5c242-df1a-4a8e-bcab-32dc55b1f7b6?ID=ac18e8d4-0868-4487-96ca-f4497439d3f8&Tab=3';
const JML = 'https://jmlnt.forest.gov.tw/';
const JML_RULES = 'https://jmlnt.forest.gov.tw/travelInfo/index.php?parent_id=251';
const JML_FAQ = 'https://jmlnt.forest.gov.tw/travelInfo/index.php?parent_id=269';
const BEIDAWU = 'https://kgonline.forest.gov.tw/';
const BEIDAWU_RULES = 'https://kgonline.forest.gov.tw/caution/';
const BEIDAWU_DAYS = 'https://kgonline.forest.gov.tw/introduction/index.php?parent_id=183';
const BEIDAWU_FAQ = 'https://kgonline.forest.gov.tw/questions/';
const BEIDAWU_STAY = 'https://kgonline.forest.gov.tw/travelInfo/index.php?parent_id=238';
const NANHU_TRIP = 'https://www.taroko.gov.tw/ch/listicle/faq/350';
const NANHU_FACILITIES = 'https://www.taroko.gov.tw/ch/listicle/faq/351';
const XUESHAN_MAP = 'https://hike.taiwan.gov.tw/nationpark/manasystem/news/files/news/3d61e3b6-d8d2-4d7d-ac17-5ab4b0c736a2.pdf';
const trail = (id: string) => `https://recreation.forest.gov.tw/Trail/RT?tr_id=${id}`;
const day = (label: string, stops: string[], resourceIds: string[], lodgingResourceId: string | null = null): PlanTemplateDay => ({ label, stops, resourceIds, lodgingResourceId });

export type TemplateSeed = Omit<PlanTemplate, 'checkedAt' | 'referenceDays' | 'resourceIds'> & { checkedAt?: string };
const seeds: TemplateSeed[] = [
  {
    id: 'daba', name: '大霸尖山', routeName: '觀霧－九九山莊－大霸尖山霸基往返', category: '百岳', grade: '高山多日', region: '新竹縣・苗栗縣', mountainRange: '雪山山脈', referenceRouteId: '027',
    summary: '保留既有官方分段路程三日草稿；止於霸基，不含攀登霸頂。官方日標與分段分鐘不一致，原備註保留。',
    planningReview: '來源第 2 天日標約 14 小時（含休息），但本站選錄的往返霸基分段合計 490 分（8 小時 10 分）；兩種口徑與路線範圍不能直接互換。請依實際支線、休息與隊伍配速重新核算，勿把已填分段當作完整當日用時。',
    sourceUrls: [DABA_REFERENCE_URL, SHEIPA], links: { application: APPLY, beds: 'https://99online.forest.gov.tw/', status: OPEN },
    days: [
      day('第 1 天｜觀霧至九九山莊', ['觀霧山莊', '馬達拉溪登山口', '九九山莊'], ['madala-camp', '99-hut', '99-water'], '99-hut'),
      day('第 2 天｜大霸霸基往返', ['九九山莊', '白橋（加利山岔路口）', '3050高地（加利山岔路口）', '伊澤山捷徑岔', '伊澤山登山口', '中霸山屋', '中霸坪', '大霸尖山霸基（折返點）', '中霸坪', '中霸山屋', '伊澤山登山口', '伊澤山捷徑岔', '3050高地（加利山岔路口）', '九九山莊'], ['99-hut', '99-water', 'zhongba-hut', 'zhongba-water'], '99-hut'),
      day('第 3 天｜返回觀霧', ['九九山莊', '馬達拉溪登山口', '觀霧山莊'], ['99-hut', '99-water', 'madala-camp']),
    ],
  },
  {
    id: 'xueshan', name: '雪山主東峰', routeName: '武陵－七卡－三六九臨時營地－雪山主東峰往返', category: '百岳', grade: '高山多日', region: '臺中市', mountainRange: '雪山山脈', referenceRouteId: null,
    summary: '以七卡及三六九臨時營地分三日規劃。舊三六九山莊停止申請；依核准宿營地及雪季規定調整。',
    sourceUrls: [XUESHAN_MAP, SHEIPA], links: { application: APPLY, beds: SHEIPA, status: OPEN },
    days: [
      day('第 1 天｜雪山登山口至七卡', ['雪山登山口', '七卡山莊'], ['qika-hut', 'qika-camp', 'qika-water'], 'qika-hut'),
      day('第 2 天｜經雪山東峰至臨時營地', ['七卡山莊', '雪山東峰', '三六九臨時營地'], ['qika-water', '369-camp', '369-water'], '369-camp'),
      day('第 3 天｜雪山主峰往返下山', ['三六九臨時營地', '雪山主峰', '三六九臨時營地', '七卡山莊', '雪山登山口'], ['369-camp', '369-water', 'qika-water']),
    ],
  },
  {
    id: 'yushan', name: '玉山主峰', routeName: '塔塔加－排雲山莊－玉山主峰往返', category: '百岳', grade: '高山多日', region: '南投縣・嘉義縣', mountainRange: '玉山山脈', referenceRouteId: null,
    summary: '參考官方主峰線兩日節點。住宿、入園及主峰路況仍須行前查核，不含其他群峰。',
    sourceUrls: ['https://hike.taiwan.gov.tw/information_1.aspx?c_id=149', JADE_HUT], links: { application: APPLY, beds: 'https://hike.taiwan.gov.tw/bed_6.aspx', status: OPEN },
    days: [
      day('第 1 天｜塔塔加至排雲', ['塔塔加登山口', '孟祿亭', '前峰登山口', '白木林', '大峭壁', '排雲山莊'], ['paiyun-hut', 'paiyun-water'], 'paiyun-hut'),
      day('第 2 天｜玉山主峰往返', ['排雲山莊', '玉山主峰', '排雲山莊', '大峭壁', '白木林', '前峰登山口', '孟祿亭', '塔塔加登山口'], ['paiyun-hut', 'paiyun-water']),
    ],
  },
  {
    id: 'jiaming-lake', name: '嘉明湖・向陽山・三叉山', routeName: '向陽登山口－嘉明湖山屋－三叉山與嘉明湖往返', category: '百岳', grade: '高山多日', region: '臺東縣', mountainRange: '中央山脈', referenceRouteId: '139',
    summary: '依官方步道與宿營節點整理三日草稿；山峰支線可依體能刪改，湖泊不列作取水保證。',
    sourceUrls: [trail('139'), JML_RULES, JML_FAQ], links: { application: APPLY, beds: `${JML}room/index.php?room_type=0`, status: JML },
    days: [
      day('第 1 天｜向陽登山口至向陽山屋', ['向陽登山口', '向陽山屋'], ['xiangyang-hut', 'xiangyang-water'], 'xiangyang-hut'),
      day('第 2 天｜向陽山支線至嘉明湖山屋', ['向陽山屋', '向陽山岔路', '向陽山', '向陽山岔路', '嘉明湖山屋'], ['xiangyang-hut', 'xiangyang-water', 'jiaming-hut', 'jiaming-water', 'jiaming-camp'], 'jiaming-hut'),
      day('第 3 天｜三叉山與嘉明湖往返下山', ['嘉明湖山屋', '三叉山', '嘉明湖', '嘉明湖山屋', '向陽山屋', '向陽登山口'], ['jiaming-hut', 'jiaming-water', 'xiangyang-hut', 'xiangyang-water']),
    ],
  },
  {
    id: 'beidawu', name: '北大武山', routeName: '北大武新登山口－檜谷山莊－北大武山往返', category: '百岳', grade: '高山多日', region: '屏東縣', mountainRange: '中央山脈', referenceRouteId: '119',
    checkedAt: '2026-10-27T01:32:05Z',
    summary: '依檜谷官方三日建議，兩晚住檜谷：首日上山、次日攻頂往返、第三日下山。新舊登山口間路段不可漏計；兩晚床位或營位須各自抽中，營地局部停用及現況另查。',
    planningReview: '舊版兩日草稿把攻頂與全程下山排在同日；若用官方公布的單向步程粗估返程，第二天約 10.5–14 小時移動且未含休息，並非官方公布的完整日程時間。新版已拆成三日；既有兩日草稿請手動補第三日，兩晚檜谷住宿均須核准。',
    sourceUrls: [BEIDAWU_DAYS, BEIDAWU_FAQ, BEIDAWU_STAY, `${BEIDAWU}introduction/index.php?parent_id=247`, `${BEIDAWU}introduction/index.php?parent_id=51`, BEIDAWU_RULES],
    links: { application: APPLY, beds: `${BEIDAWU}room/index.php?mode=record`, status: BEIDAWU },
    days: [
      day('第 1 天｜新登山口至檜谷', ['北大武新登山口', '北大武舊登山口', '紅豆杉與杜英合抱景觀', '檜谷山莊'], ['kuaigu-hut', 'kuaigu-camp'], 'kuaigu-hut'),
      day('第 2 天｜北大武山攻頂往返', ['檜谷山莊', '紅檜巨木', '高砂義勇軍紀念碑與大武祠', '北大武山', '檜谷山莊'], ['kuaigu-hut', 'kuaigu-camp'], 'kuaigu-hut'),
      day('第 3 天｜檜谷返回新登山口', ['檜谷山莊', '紅豆杉與杜英合抱景觀', '北大武舊登山口', '北大武新登山口'], ['kuaigu-hut']),
    ],
  },
  {
    id: 'qilai-nanhua', name: '奇萊南華', routeName: '屯原－天池山莊－奇萊南峰與南華山往返', category: '百岳', grade: '高山多日', region: '南投縣・花蓮縣', mountainRange: '中央山脈', referenceRouteId: '064',
    summary: '將官方節點拆成三日可編輯框架，兩晚天池須各自核准；奇萊南峰入園另查。林業署064只對照能高西段接近路線，非奇萊南華全線。',
    sourceUrls: [TIANCHI_TRIP, TIANCHI_FAQ], links: { application: APPLY, beds: TIANCHI, status: TIANCHI },
    days: [
      day('第 1 天｜屯原至天池山莊', ['屯原登山口', '雲海保線所', '天池山莊'], ['tianchi-hut', 'tianchi-camp', 'tianchi-water'], 'tianchi-hut'),
      day('第 2 天｜奇萊南峰與南華山', ['天池山莊', '天池', '奇萊南峰', '天池', '南華山', '天池', '天池山莊'], ['tianchi-hut', 'tianchi-water'], 'tianchi-hut'),
      day('第 3 天｜返回屯原', ['天池山莊', '雲海保線所', '屯原登山口'], ['tianchi-hut', 'tianchi-water']),
    ],
  },
  {
    id: 'nanhu', name: '南湖大山', routeName: '南湖登山口－雲稜－南湖圈谷－南湖大山往返', category: '百岳', grade: '高山多日', region: '宜蘭縣・臺中市・花蓮縣', mountainRange: '中央山脈', referenceRouteId: null,
    summary: '採官方山屋與主峰節點拆成四日往返，不含中央尖；登山口、進出路線及震後開放公告須再查。',
    sourceUrls: [NANHU_TRIP, NANHU_FACILITIES], links: { application: APPLY, beds: 'https://hike.taiwan.gov.tw/bed_4.aspx', status: OPEN },
    days: [
      day('第 1 天｜南湖登山口至雲稜', ['南湖登山口（進出位置待核）', '多加屯山', '木杆鞍部', '雲稜山屋'], ['yunleng-hut', 'yunleng-water'], 'yunleng-hut'),
      day('第 2 天｜雲稜至南湖圈谷', ['雲稜山屋', '審馬陣山', '南湖北山岔路', '五岩峰', '南湖圈谷山屋'], ['yunleng-water', 'nanhu-hut', 'nanhu-water'], 'nanhu-hut'),
      day('第 3 天｜南湖大山往返至雲稜', ['南湖圈谷山屋', '南湖大山', '南湖圈谷山屋', '五岩峰', '雲稜山屋'], ['nanhu-hut', 'nanhu-water', 'yunleng-hut', 'yunleng-water'], 'yunleng-hut'),
      day('第 4 天｜返回登山口', ['雲稜山屋', '木杆鞍部', '多加屯山', '南湖登山口（進出位置待核）'], ['yunleng-hut', 'yunleng-water']),
    ],
  },
];

const sheipaSnapshotRoutes = new Set(['daba', 'xueshan', 'wuling-four', 'xueshan-cuichi', 'xueshan-west-ridge', 'daxiaojian', 'zhijiayang-xueshan']);
export const PLAN_TEMPLATES: readonly PlanTemplate[] = [...seeds, ...EXPANDED_TEMPLATES, ...NEXT_SHEIPA_TEMPLATES, ...NEXT_CENTRAL_TEMPLATES].map(seed => ({
  ...seed, checkedAt: seed.checkedAt ?? PLAN_CATALOG_CHECKED_AT, referenceDays: seed.days.length,
  ...(sheipaSnapshotRoutes.has(seed.id) ? { accessNotice: SHEIPA_ACCESS_SNAPSHOT } : {}),
  resourceIds: [...new Set(seed.days.flatMap(entry => entry.resourceIds))],
}));

export type ResourceSeed = Pick<PlanResource, 'id' | 'name' | 'type' | 'region' | 'season' | 'limitations' | 'sourceName' | 'sourceUrls'> & Partial<Pick<PlanResource, 'checkedAt' | 'sourcePublishedAt' | 'observedAt'>>;
function sheipa(id: string, name: string, type: ResourceType, limitations: string, season = '來源未限定季節；行前查核'): ResourceSeed {
  return { id, name, type, region: '雪霸山區', limitations, season, sourceName: '國家公園署・一站式雪霸宿營地概況', sourceUrls: [SHEIPA] };
}
const resourceSeeds: ResourceSeed[] = [
  sheipa('qika-hut', '七卡山莊', 'hut', '官方列為山屋；床位須依許可證使用，並自備過夜裝備。'),
  sheipa('qika-camp', '七卡營地', 'camp', '官方列為宿營地；僅依核准地點紮營。'),
  sheipa('369-camp', '三六九臨時營地', 'camp', '設有儲水桶，位置空曠；舊三六九山莊停止申請，兩者不能互代。'),
  sheipa('cuichi-hut', '翠池山屋', 'hut', '官方列有山屋及翠池取水條件；不代表當日可入住。', '冬季水源可能不穩定'),
  sheipa('cuichi-camp', '翠池營地', 'camp', '官方列為營地，須依核准宿營地使用並保護湖泊環境。', '冬季水源可能不穩定'),
  sheipa('taoshan-hut', '桃山山屋', 'hut', '有雨水儲存設備；需自備過夜裝備。', '枯水期供水不穩定'),
  sheipa('taoshan-camp', '桃山營地', 'camp', '有雨水儲存設備，僅依核准地點紮營。', '枯水期供水不穩定'),
  sheipa('xinda-hut', '新達山屋', 'hut', '官方記載雨水儲存設備，住宿須申請。', '枯水期供水不穩定'),
  sheipa('xinda-camp', '新達營地', 'camp', '官方列為營地，供水仰賴雨水儲存。', '枯水期供水不穩定'),
  sheipa('madala-camp', '馬達拉溪登山口宿營地', 'camp', '官方概況記載水源及廁所；不是當日水情、許可或水質檢驗。'),
  sheipa('99-hut', '九九山莊', 'hut', '改善工程可能影響容宿量；床位安排依管理員及核准文件。另官方山莊介紹記載不供應熱水。'),
  sheipa('zhongba-hut', '中霸山屋', 'hut', '雨水儲水條件不穩，無廁所；途經不代表已核准住宿。'),
  sheipa('piaodan-hut', '瓢簞山屋', 'hut', '官方概況未列穩定水源，須自行核實取水與負重規劃。'),
  sheipa('piaodan-camp', '瓢簞營地', 'camp', '未列穩定水源，須依許可紮營並自行核實備水。'),
  sheipa('old-xueshan-camp', '雪山山莊舊址營地', 'camp', '官方記載需下切溪谷取水；未將取水繞行時間自動加入行程。'),
  sheipa('youpolan-hut', '油婆蘭山屋', 'hut', '概況所載池水水質有限制；不作可直接飲用來源。'),
  sheipa('youpolan-camp', '油婆蘭營地', 'camp', '概況所載池水水質有限制；住宿許可及取水處理須另查。'),
  sheipa('perfect-valley-camp', '完美谷營地', 'camp', '官方概況列無水源；不能以營地存在推定可補水。'),
  sheipa('xuebei-hut', '雪北山屋', 'hut', '以雨水儲存為來源，住宿須依核准床位。', '枯水期供水不穩定'),
  sheipa('sumida-hut', '素密達山屋', 'hut', '以雨水儲存為來源，住宿須依核准床位。', '枯水期供水不穩定'),
  sheipa('banan-hut', '霸南山屋', 'hut', '以雨水儲存為來源，住宿須依核准床位。', '枯水期供水不穩定'),
  sheipa('qika-water', '七卡山莊／營地供水記錄', 'water', '官方概況記有供水；未查核現場供應、水質或可取量。'),
  sheipa('369-water', '三六九臨時營地儲水桶', 'water', '官方記載設有儲水桶；桶容量不等於現有水量，未作水質或補水承諾。'),
  sheipa('99-water', '九九山莊供水記錄', 'water', '概況記有水源；官方山莊介紹另記不供應熱水，不能互推冷熱水供應量。'),
  sheipa('zhongba-water', '中霸山屋雨水儲存記錄', 'water', '官方記載雨水儲存不穩定；不作必達補水點。'),
  sheipa('cuichi-water', '翠池水源記錄', 'water', '官方概況列池水來源，非飲用水檢驗；取水及環境限制須另查。', '冬季水源可能不穩定'),
  sheipa('taoshan-water', '桃山雨水儲存記錄', 'water', '官方記載雨水儲存；現有水量與處理條件未知。', '枯水期供水不穩定'),
  sheipa('xuebei-water', '雪北雨水儲存記錄', 'water', '官方記載雨水儲存；現有水量與處理條件未知。', '枯水期供水不穩定'),
  sheipa('xinda-water', '新達雨水儲存記錄', 'water', '官方記載雨水儲存；現有水量與處理條件未知。', '枯水期供水不穩定'),
  sheipa('banan-water', '霸南雨水儲存記錄', 'water', '官方記載雨水儲存；現有水量與處理條件未知。', '枯水期供水不穩定'),
  { id: 'tianchi-hut', name: '天池山莊', type: 'hut', region: '南投縣', season: '山區天候與臨時管制須查核', limitations: '官方山屋申請入口；須分別取得每晚核准，不代表尚有床位。', sourceName: '林業及自然保育署南投分署・天池山莊', sourceUrls: [TIANCHI, TIANCHI_FAQ] },
  { id: 'tianchi-camp', name: '天池山莊營地', type: 'camp', region: '南投縣', season: '山區天候與臨時管制須查核', limitations: '僅可在已劃設並核准的營位紮營，其餘空地不列宿營選項。', sourceName: '林業及自然保育署南投分署・天池山莊問答', sourceUrls: [TIANCHI_FAQ] },
  { id: 'tianchi-water', name: '天池山莊供水記錄', type: 'water', region: '南投縣', season: '季節條件未明；行前查核', limitations: '官方問答記載有水源並要求節水；水量、水質與當日供應未知。不是天池湖水可飲用的證明。', sourceName: '林業及自然保育署南投分署・天池山莊問答', sourceUrls: [TIANCHI_FAQ] },
  { id: 'paiyun-hut', name: '排雲山莊', type: 'hut', region: '嘉義縣', season: '冬季可能缺水或管線結冰', limitations: '須核准床位；周邊無指定露營區，不能自行改成營地。', sourceName: '玉山國家公園管理處・山屋及宿營地', sourceUrls: [JADE_HUT] },
  { id: 'paiyun-water', name: '排雲山莊供水記錄', type: 'water', region: '嘉義縣', season: '冬季可能缺水或管線結冰', limitations: '官方說明季節性供水限制；熱水時段與供應措施另查，未推定目前可取量。', sourceName: '玉山國家公園管理處・排雲山莊', sourceUrls: [JADE_HUT] },
  { id: 'xiangyang-hut', name: '向陽山屋', type: 'hut', region: '臺東縣', season: '季節條件未明；行前查核', limitations: '官方列為指定住宿點；山區水源有限，未核實山屋現況及供水方式。', sourceName: '林業及自然保育署臺東分署・嘉明湖申請須知', sourceUrls: [JML_RULES] },
  { id: 'jiaming-hut', name: '嘉明湖山屋', type: 'hut', region: '臺東縣', season: '季節條件未明；行前查核', limitations: '官方列為指定住宿點；需預先申請，湖水不列作可飲用補給。', sourceName: '林業及自然保育署臺東分署・嘉明湖申請須知', sourceUrls: [JML_RULES] },
  { id: 'jiaming-camp', name: '嘉明湖營地', type: 'camp', region: '臺東縣', season: '季節條件未明；行前查核', limitations: '官方指定營地，須申請；不表示可在嘉明湖湖畔任意紮營。', sourceName: '林業及自然保育署臺東分署・嘉明湖申請須知', sourceUrls: [JML_RULES] },
  { id: 'xiangyang-water', name: '向陽山屋山溪水源記錄', type: 'water', region: '臺東縣', season: '季節與山溪流況未查核', limitations: '官方問答記載取自山溪；頁面未附這項水情的現勘日期，因此不沿用其充足描述作目前供水保證。水質與可取量未知。', sourceName: '林業及自然保育署臺東分署・嘉明湖常見問答', sourceUrls: [JML_FAQ] },
  { id: 'jiaming-water', name: '嘉明湖山屋雨水儲存記錄', type: 'water', region: '臺東縣', season: '雨水來源有限；季節與存量未查核', limitations: '官方問答記載取自雨水且水源有限，要求節水並勿取水清潔身體；不以嘉明湖湖水代替此儲水來源。', sourceName: '林業及自然保育署臺東分署・嘉明湖常見問答', sourceUrls: [JML_FAQ] },
  { id: 'kuaigu-hut', name: '檜谷山莊', type: 'hut', region: '屏東縣', season: '山區水源有限；行前查核', limitations: '床位須核准並另查入山條件；住宿設施不等於當日供水確認。', sourceName: '林業及自然保育署屏東分署・檜谷山莊', sourceUrls: [BEIDAWU, BEIDAWU_RULES] },
  { id: 'kuaigu-camp', name: '檜谷山莊營地', type: 'camp', region: '屏東縣', season: '山區天候與危木管制須查核', limitations: '官方有部分營位因危木停用公告；僅能使用當日核准營位。', sourceName: '林業及自然保育署屏東分署・檜谷山莊', sourceUrls: [BEIDAWU, BEIDAWU_RULES] },
  { id: 'yunleng-hut', name: '雲稜山屋', type: 'hut', region: '南湖山區', season: '乾旱可能影響雨水儲存', limitations: '官方設施問答的歷史概況；震後設施、床位與開放狀態須另查。', sourceName: '太魯閣國家公園管理處・登山設施問答', sourceUrls: [NANHU_FACILITIES, 'https://hike.taiwan.gov.tw/bed_4.aspx'] },
  { id: 'yunleng-water', name: '雲稜山屋雨水儲存記錄', type: 'water', region: '南湖山區', season: '乾旱可能須另覓取水處', limitations: '官方歷史問答列雨水儲存及乾旱限制；未把舊山屋取水路線當作目前可通行。', sourceName: '太魯閣國家公園管理處・登山設施問答', sourceUrls: [NANHU_FACILITIES] },
  { id: 'nanhu-hut', name: '南湖圈谷山屋', type: 'hut', region: '南湖山區', season: '季節條件未明；行前查核', limitations: '官方問答稱南湖山屋；床位及設施現況須查最新申請與公告，未直接採用歷史容納數。', sourceName: '太魯閣國家公園管理處・登山設施問答', sourceUrls: [NANHU_FACILITIES, 'https://hike.taiwan.gov.tw/bed_4.aspx'] },
  { id: 'nanhu-water', name: '南湖山屋附近水源記錄', type: 'water', region: '南湖山區', season: '季節條件未明；行前查核', limitations: '官方歷史問答記有水源，未提供本次現勘日期；不作目前供水或飲用水質認證。', sourceName: '太魯閣國家公園管理處・登山設施問答', sourceUrls: [NANHU_FACILITIES] },
];

/** One record per named resource/type; shared routes refer to the same ID. */
export const PLAN_RESOURCES: readonly PlanResource[] = [...resourceSeeds, ...EXPANDED_RESOURCES, ...NEXT_SHEIPA_RESOURCES, ...NEXT_CENTRAL_RESOURCES].map(seed => {
  const routes = PLAN_TEMPLATES.filter(template => template.resourceIds.includes(seed.id));
  const indexes = routes.flatMap(template => template.days.flatMap((entry, index) => entry.resourceIds.includes(seed.id) ? [index + 1] : []));
  return {
    ...seed,
    sourceUrls: seed.id === '99-hut' || seed.id === '99-water' ? [...seed.sourceUrls, 'https://99online.forest.gov.tw/basic/?mode=detail&node=28'] : seed.sourceUrls,
    routeIds: routes.map(template => template.id), dayIndex: routes.length === 1 && indexes.length === 1 ? indexes[0]! : null,
    checkedAt: seed.checkedAt ?? PLAN_CATALOG_CHECKED_AT, sourcePublishedAt: seed.sourcePublishedAt ?? null, observedAt: seed.observedAt ?? null, currentAvailability: 'unknown',
  };
});

const normalize = (value: string) => value.normalize('NFKC').replaceAll('台', '臺').replaceAll('蘿', '羅').toLocaleLowerCase('zh-TW');
function matches(text: string, query: string): boolean {
  const haystack = normalize(text);
  return normalize(query).trim().split(/\s+/u).every(term => haystack.includes(term));
}
export function findPlanTemplates(query = '', category?: PlanCategory, mountainRange?: MountainRange): PlanTemplate[] {
  return PLAN_TEMPLATES.filter(template => (!category || template.category === category) && (!mountainRange || template.mountainRange === mountainRange) && matches([
    template.name, template.routeName, template.region, template.mountainRange, template.category, template.grade, template.summary, template.planningReview ?? '',
    ...PLAN_RESOURCES.filter(resource => template.resourceIds.includes(resource.id)).map(resource => resource.name),
  ].join(' '), query));
}
export function searchPlanResources(query = '', type?: ResourceType): PlanResource[] {
  return PLAN_RESOURCES.filter(resource => (!type || resource.type === type) && matches([
    resource.name, resource.region, resource.sourceName, resource.season, resource.limitations,
    ...PLAN_TEMPLATES.filter(template => resource.routeIds.includes(template.id)).map(template => `${template.name} ${template.routeName} ${template.mountainRange} ${template.category}`),
  ].join(' '), query));
}

/** Direction and endpoints must match; a reverse trip is a different reference. */
export function templateSegmentReference(template: PlanTemplate, from: string, to: string): PlanSegmentReference | null {
  return template.referenceSegments?.find(reference => reference.from === from && reference.to === to) ?? null;
}

const dabaReferenceLegs = createDabaPlan(PLAN_CATALOG_CHECKED_AT).days.flatMap(day => day.legs);
export function templateDataCoverage(template: PlanTemplate): { total: number; timed: number; track: 'partial' | 'missing' } {
  if (template.id === 'daba') return {total:dabaReferenceLegs.length, timed:dabaReferenceLegs.filter(leg => leg.minutes !== null).length, track:'partial'};
  const pairs = template.days.flatMap(day => day.stops.slice(1).map((to, index) => ({from:day.stops[index]!, to})));
  return {total:pairs.length, timed:pairs.filter(pair => templateSegmentReference(template, pair.from, pair.to)?.minutes != null).length, track:'missing'};
}

/** New user schedules start without planned rests; source figures and existing drafts retain unknowns. */
export function createPlanFromTemplate(id: string, now = new Date().toISOString()): PlanDraft {
  const template = PLAN_TEMPLATES.find(entry => entry.id === id);
  if (!template) throw new Error('找不到這個路線範本');
  if (template.planningReady === false) throw new Error('此路線分日待核，暫停套用範本');
  const draft = id === 'daba' ? createDabaPlan(now) : createBlankPlan(now);
  const originalDays = id === 'daba' ? draft.days : null;
  if (id !== 'daba') draft.title = `${template.name} ${template.referenceDays} 日行程草稿`;
  draft.routeName = template.routeName;
  draft.referenceRouteId = template.referenceRouteId;
  draft.notes = [id === 'daba' ? draft.notes : '', `山脈：${template.mountainRange}\n${template.summary}\n這是本工具整理的可編輯節點框架，天數與每日切分不是官方成行建議；未完成配速、入山入園、床位、供水及現場路況查核。資料來源查閱 ${template.checkedAt}，不是現地觀測時間；各筆來源日期與限制另見節點說明。\n${template.sourceUrls.join('\n')}`].filter(Boolean).join('\n');
  if (template.planningReview) draft.notes += `\n行程審查：${template.planningReview}`;
  if (template.accessNotice) draft.notes += `\n查核時的公告快照（非即時狀態）：${template.accessNotice.text}\n查閱 ${template.accessNotice.checkedAt}\n${template.accessNotice.sourceUrl}`;
  draft.reviewNotes = [id === 'daba' ? draft.reviewNotes.replace('每段休息先留未知，請依隊伍需求安排。', '') : '', template.planningReview ? `行程審查：${template.planningReview}` : '', '請補齊日期、人數、各段距離／行走時間、水量、備援與撤退決策。休息尚未安排，可按需加入。來源記有水源或住宿設施，不代表目前供水、可直接飲用、有床位或路線開放。'].filter(Boolean).join('\n');
  draft.days = template.days.map((entry, index) => {
    const result = originalDays?.[index] ?? createPlanDay(index + 1);
    if (!originalDays) result.label = entry.label;
    if (!originalDays) result.legs = entry.stops.slice(1).map((to, legIndex) => {
      const from = entry.stops[legIndex]!, reference = templateSegmentReference(template, from, to);
      return {...createPlanLeg(), from, to, minutes:reference?.minutes ?? null, distanceKm:reference?.distanceKm ?? null, sourceUrl:reference?.sourceUrl ?? template.sourceUrls[0]!};
    });
    if (originalDays) {
      // This is the new user's rest plan, not a claim about the official reference's rest duration.
      result.legs = result.legs.map(leg => ({ ...leg, restMinutes: 0 }));
      result.notes = result.notes.replace('休息均待填', '休息尚未安排，可按需加入').replace('休息待填', '休息可按需加入');
    }
    const resources = PLAN_RESOURCES.filter(resource => entry.resourceIds.includes(resource.id));
    const waters = resources.filter(resource => resource.type === 'water');
    result.water.primary = waters.map(resource => resource.name).join('、');
    result.water.sourceUrl = waters[0]?.sourceUrls[0] ?? '';
    const waterNotes = waters.length ? waters.map(resource => {
      const sourceTimes = !resource.sourcePublishedAt && !resource.observedAt ? '來源發布／現勘時間未知' : `來源發布 ${resource.sourcePublishedAt ?? '未知'}；現地觀測 ${resource.observedAt ?? '未知'}`;
      return `${resource.name}：${resource.limitations} 季節限制：${resource.season} 目前可用性未知；${sourceTimes}；資料查閱 ${resource.checkedAt}。\n${resource.sourceUrls.join('\n')}`;
    }).join('\n') : '此日尚無已核實的取水節點，請自行查核並規劃備水；空白不代表沒有水源。';
    result.water.note = [originalDays ? result.water.note : '', waterNotes].filter(Boolean).join('\n');
    const lodging = resources.find(resource => resource.id === entry.lodgingResourceId);
    if (lodging) result.lodging = { name: lodging.name, backup: '', reservation: 'planned', approvalReference: '', sourceUrl: lodging.sourceUrls[0]! };
    const references = result.legs.flatMap(leg => {
      const reference = templateSegmentReference(template, leg.from, leg.to);
      return reference ? [`${reference.from} → ${reference.to}：${reference.sourceName}；參考分鐘 ${reference.minutes ?? '未收錄'}，距離 ${reference.distanceKm ?? '未收錄'} km；查閱 ${reference.checkedAt}。\n${reference.sourceUrl}`] : [];
    });
    result.notes = [originalDays ? result.notes : '', resources.map(resource => `${resource.name}（${resource.type === 'water' ? '水源記錄' : resource.type === 'hut' ? '山屋' : '營地'}）：${resource.limitations}\n來源：${resource.sourceUrls.join('、')}`).join('\n'), ...references].filter(Boolean).join('\n');
    return result;
  });
  return draft;
}
