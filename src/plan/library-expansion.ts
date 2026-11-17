import type { ResourceSeed, TemplateSeed, PlanTemplateDay } from './catalog';

/** Public pages were read on Oct 22; integration is not a new field observation. */
export const LIBRARY_RESEARCH_CHECKED_AT = '2026-10-22T14:06:21Z';
const APPLY = 'https://hike.taiwan.gov.tw/apply_1.aspx';
const OPEN = 'https://hike.taiwan.gov.tw/open.aspx';
const SHEIPA = 'https://hike.taiwan.gov.tw/bed_1.aspx';
const TAROKO = 'https://hike.taiwan.gov.tw/bed_4.aspx';
const JADE = 'https://hike.taiwan.gov.tw/bed_6.aspx';
const BIJI = (id: number) => `https://hiking.biji.co/index.php?act=detail&id=${id}&q=trail`;
const SONG = 'https://hiking.biji.co/index.php?act=info&id=2680&q=news';
const JIALUO = 'https://hiking.biji.co/index.php?act=info&id=2602&q=news';
const SHUIYANG = 'https://hiking.biji.co/index.php?act=info&q=review&review_id=22865';
const QILAI_NEW = 'https://www.taiwan.nps.gov.tw/home/zh-tw/topic/33867';
const QILAI_NOTICE = 'https://www.taroko.gov.tw/ch/titlelist/news/4488';
const KUHA = 'https://www.ysnp.gov.tw/Trail/382f4797-1eb1-4746-a122-4e13a9e0c7e4';
const KUHA_HUT = `${KUHA}?ID=b7e29b9e-a9f3-4bff-b6c3-b8e2de6b63cd&Tab=3`;
const KUHA_NOTES = `${KUHA}?Tab=5`;
const day = (label: string, stops: string[], resourceIds: string[], lodgingResourceId: string | null = null): PlanTemplateDay => ({ label, stops, resourceIds, lodgingResourceId });

export const SHEIPA_ACCESS_SNAPSHOT = {
  text: '10/27 查閱雪霸 10/26 公告：自 10/27 起恢復開放雪山西稜等路線入園；颱風後仍須留意新崩塌並查最新申請與步道狀態。這是公告快照，非即時通行保證。',
  sourceUrl: 'https://hike.taiwan.gov.tw/news_0_1.aspx?id=5017',
  checkedAt: '2026-10-27T01:22:58Z',
};

export const EXPANDED_TEMPLATES: readonly TemplateSeed[] = [
  {
    id: 'wuling-four', name: '武陵四秀', routeName: '武陵－新達－品田與池有－桃山－喀拉業往返', category: '百岳', mountainRange: '雪山山脈', region: '臺中市・新竹縣', grade: '高山多日・品田陡峭路段', referenceRouteId: null,
    checkedAt: LIBRARY_RESEARCH_CHECKED_AT,
    summary: '以新達、桃山兩處宿營串接四座山峰。品田前有陡峭地形；山屋、營地及每晚許可各自查核，不能直接互代。',
    sourceUrls: ['https://www.taiwan.nps.gov.tw/home/zh-tw/topic/18664.html', 'https://www.spnp.gov.tw/ch/mountaininfo/wuling-four-beauties-route', SHEIPA, BIJI(540)],
    links: { application: APPLY, beds: SHEIPA, status: OPEN },
    days: [
      day('第 1 天｜武陵至新達', ['武陵山莊', '武陵吊橋', '池有山登山口', '三叉營地', '新達山屋'], ['xinda-hut', 'xinda-water', 'xinda-camp'], 'xinda-hut'),
      day('第 2 天｜品田、池有至桃山', ['新達山屋', '品田山', '新達山屋', '池有山岔路', '池有山', '池有山岔路', '三叉營地', '桃山山屋'], ['xinda-hut', 'xinda-water', 'taoshan-hut', 'taoshan-water', 'taoshan-camp'], 'taoshan-hut'),
      day('第 3 天｜桃山、喀拉業下山', ['桃山山屋', '桃山', '喀拉業山', '桃山', '桃山山屋', '桃山登山口', '武陵山莊'], ['taoshan-hut', 'taoshan-water']),
    ],
  },
  {
    id: 'qilai-main-north', name: '奇萊主北', routeName: '奇萊登山口－新奇萊山屋－奇萊北峰與主峰往返', category: '百岳', mountainRange: '中央山脈', region: '南投縣・花蓮縣', grade: '高山多日・陡坡稜線', referenceRouteId: null,
    checkedAt: LIBRARY_RESEARCH_CHECKED_AT,
    summary: '依官方三日節點整理，兩晚奇萊山屋須分別核准。新屋與舊稜線小屋資料分開，集水設施不能當作當天供水確認。',
    planningReview: '太魯閣國家公園新奇萊山屋公告指出，登山口至新屋約 6–7 小時、累計升降約 1,500 公尺，一日直達有高山症與體力透支風險。此範本第一日正是直達新屋，請依隊伍能力與核准宿營地重排，不把三日框架視為所有隊伍通用。',
    sourceUrls: ['https://www.taroko.gov.tw/ch/listicle/faq/350', QILAI_NOTICE, QILAI_NEW, BIJI(542)],
    links: { application: APPLY, beds: TAROKO, status: OPEN },
    days: [
      day('第 1 天｜登山口至奇萊山屋', ['奇萊登山口', '黑水塘山屋', '成功山屋', '新奇萊山屋'], ['heishuitang-hut', 'chenggong-hut', 'chenggong-water', 'qilai-new-hut', 'qilai-new-water'], 'qilai-new-hut'),
      day('第 2 天｜奇萊北峰與主峰', ['新奇萊山屋', '奇萊北峰', '新奇萊山屋', '奇萊主峰', '新奇萊山屋'], ['qilai-new-hut', 'qilai-new-water'], 'qilai-new-hut'),
      day('第 3 天｜返回登山口', ['新奇萊山屋', '成功山屋', '黑水塘山屋', '奇萊登山口'], ['qilai-new-water', 'chenggong-hut', 'chenggong-water', 'heishuitang-hut']),
    ],
  },
  {
    id: 'kuhanoxin-guanshan', name: '庫哈諾辛山・關山', routeName: '進涇橋－庫哈諾辛山屋－庫哈諾辛山與關山往返', category: '百岳', mountainRange: '中央山脈', region: '高雄市', grade: '高山多日・南橫接近', referenceRouteId: null,
    checkedAt: LIBRARY_RESEARCH_CHECKED_AT,
    summary: '以庫哈諾辛山屋為兩日基地。官方要求自登山口備水；山屋儲水量、入園及南橫交通管制需另查。',
    sourceUrls: [KUHA, KUHA_HUT, KUHA_NOTES], links: { application: APPLY, beds: JADE, status: OPEN },
    days: [
      day('第 1 天｜庫哈諾辛山往返', ['進涇橋登山口', '庫哈諾辛山屋', '庫哈諾辛山', '庫哈諾辛山屋'], ['kuhanoxin-hut', 'kuhanoxin-camp', 'kuhanoxin-water'], 'kuhanoxin-hut'),
      day('第 2 天｜關山往返下山', ['庫哈諾辛山屋', '關山', '庫哈諾辛山屋', '進涇橋登山口'], ['kuhanoxin-hut', 'kuhanoxin-water']),
    ],
  },
  {
    id: 'xueshan-cuichi', name: '雪山主東・翠池', routeName: '雪山登山口－七卡－臨時營地－主峰－翠池往返', category: '百岳', mountainRange: '雪山山脈', region: '臺中市・苗栗縣', grade: '高山多日・碎石坡', referenceRouteId: null,
    checkedAt: LIBRARY_RESEARCH_CHECKED_AT,
    summary: '在主東峰路線延伸翠池，依官方節點分成四日草稿。主峰往翠池有碎石坡，第四天仍有長路程；三處宿營各自核准。',
    sourceUrls: ['https://www.spnp.gov.tw/ch/titlelist/geological-resources/165', 'https://www.spnp.gov.tw/ch/specialreport/latest-news/3856', SHEIPA],
    links: { application: APPLY, beds: SHEIPA, status: OPEN },
    days: [
      day('第 1 天｜登山口至七卡', ['雪山登山口', '七卡山莊'], ['qika-hut', 'qika-water'], 'qika-hut'),
      day('第 2 天｜東峰至臨時營地', ['七卡山莊', '雪山東峰', '三六九臨時營地'], ['qika-water', '369-camp', '369-water'], '369-camp'),
      day('第 3 天｜主峰至翠池', ['三六九臨時營地', '雪山主峰', '翠池山屋'], ['369-water', 'cuichi-hut', 'cuichi-water', 'cuichi-camp'], 'cuichi-hut'),
      day('第 4 天｜經主峰返回登山口', ['翠池山屋', '雪山主峰', '三六九臨時營地', '七卡山莊', '雪山登山口'], ['cuichi-water', '369-water', 'qika-water']),
    ],
  },
  {
    id: 'yushan-main-west', name: '玉山主西峰', routeName: '塔塔加－排雲－玉山主峰與西峰往返', category: '百岳', mountainRange: '玉山山脈', region: '南投縣・嘉義縣', grade: '高山多日・支線往返', referenceRouteId: null,
    checkedAt: LIBRARY_RESEARCH_CHECKED_AT,
    summary: '以官方主峰、西峰支線整理三日框架，兩晚排雲須各自核准。西峰往返後回排雲再下山，不套用前五峰的總里程。',
    sourceUrls: ['https://www.ysnp.gov.tw/StaticPage/Trails', 'https://www.ysnp.gov.tw/Trail/7fa5c242-df1a-4a8e-bcab-32dc55b1f7b6', BIJI(1046)],
    links: { application: APPLY, beds: JADE, status: OPEN },
    days: [
      day('第 1 天｜塔塔加至排雲', ['塔塔加登山口', '排雲山莊'], ['paiyun-hut', 'paiyun-water'], 'paiyun-hut'),
      day('第 2 天｜主峰往返排雲', ['排雲山莊', '玉山主峰', '排雲山莊'], ['paiyun-hut', 'paiyun-water'], 'paiyun-hut'),
      day('第 3 天｜西峰往返下山', ['排雲山莊', '玉山西峰', '排雲山莊', '塔塔加登山口'], ['paiyun-hut', 'paiyun-water']),
    ],
  },
  {
    id: 'songluo-lake', name: '松蘿湖', routeName: '松蘿湖登山口－水龍頭營地－松蘿湖往返', category: '中級山', mountainRange: '雪山山脈', region: '宜蘭縣・新北市', grade: '兩日重裝・泥濘樹根', referenceRouteId: null,
    checkedAt: LIBRARY_RESEARCH_CHECKED_AT,
    summary: '湖畔過夜的兩日山徑框架，不是松羅國家步道短程路線。湖畔宿營為文獻位置，入山與現地容許範圍需另核。',
    sourceUrls: [BIJI(427), SONG, 'https://yilan.forest.gov.tw/0000355'], links: { application: APPLY, beds: null, status: 'https://yilan.forest.gov.tw/0000355' },
    days: [
      day('第 1 天｜登山口至松蘿湖', ['松蘿湖登山口', '水龍頭營地', '十字越嶺鞍部', '松蘿湖畔'], ['songluo-water', 'songluo-camp'], 'songluo-camp'),
      day('第 2 天｜返回登山口', ['松蘿湖畔', '十字越嶺鞍部', '水龍頭營地', '松蘿湖登山口'], ['songluo-camp', 'songluo-water']),
    ],
  },
  {
    id: 'jialuo-lake', name: '加羅湖', routeName: '四季林道－加納富溪－巨木登山口－加羅湖往返', category: '中級山', mountainRange: '中央山脈', region: '宜蘭縣', grade: '兩日重裝・林道與箭竹', referenceRouteId: null,
    checkedAt: LIBRARY_RESEARCH_CHECKED_AT,
    summary: '由四季林道進出的兩日框架。步行起點與道路管制可能改變，不從舊文章反推里程；宿營與溪水現況未知。',
    sourceUrls: [BIJI(411), JIALUO], links: { application: APPLY, beds: null, status: 'https://yilan.forest.gov.tw/' },
    days: [
      day('第 1 天｜四季林道至加羅湖', ['四季林道步行起點（待核）', '四季護管所', '加納富溪', '巨木登山口', '偉蛋池', '加羅湖'], ['jialuo-water', 'jialuo-camp'], 'jialuo-camp'),
      day('第 2 天｜返回四季林道', ['加羅湖', '偉蛋池', '巨木登山口', '加納富溪', '四季護管所', '四季林道步行起點（待核）'], ['jialuo-camp', 'jialuo-water']),
    ],
  },
  {
    id: 'shuiyang-forest', name: '水漾森林・鹿屈山', routeName: '仁亭－鹿屈山前峰與主峰－水漾森林往返', category: '中級山', mountainRange: '阿里山山脈', region: '南投縣・嘉義縣', grade: '兩日重裝・陡下回升', referenceRouteId: null,
    checkedAt: LIBRARY_RESEARCH_CHECKED_AT,
    summary: '採鹿屈山線進出，沒有混用林道線的步程。湖畔與上游取水為歷史記載，入園、通行和宿營同意須分別查核。',
    sourceUrls: [BIJI(674), SHUIYANG], links: { application: null, beds: null, status: 'https://chiayi.forest.gov.tw/' },
    days: [
      day('第 1 天｜鹿屈山線至水漾森林', ['仁亭登山口', '林道交會', '鹿屈山前峰', '鹿屈山', '土地公廟', '管護所', '水漾森林'], ['shuiyang-water', 'shuiyang-camp'], 'shuiyang-camp'),
      day('第 2 天｜沿鹿屈山線返回', ['水漾森林', '管護所', '土地公廟', '鹿屈山', '鹿屈山前峰', '林道交會', '仁亭登山口'], ['shuiyang-camp', 'shuiyang-water']),
    ],
  },
];

const expandedResourceSeeds: readonly ResourceSeed[] = [
  { id: 'heishuitang-hut', name: '黑水塘山屋', type: 'hut', region: '奇萊山區', sourceName: '國家公園署・太魯閣宿營地概況', sourceUrls: [TAROKO], season: '高山天候與設施狀態行前查核', limitations: '沿線山屋記錄，不代表當天可入住；不能以途經或避難用途代替住宿核准。' },
  { id: 'chenggong-hut', name: '成功山屋', type: 'hut', region: '奇萊山區', sourceName: '國家公園署・太魯閣宿營地概況', sourceUrls: [TAROKO], season: '高山天候與設施狀態行前查核', limitations: '官方宿營設施記錄；床位、使用條件及路況另查，不沿用舊文章的容納人數。' },
  { id: 'chenggong-water', name: '成功山屋溪溝水源記錄', type: 'water', region: '奇萊山區', sourceName: '國家公園署・太魯閣宿營地概況', sourceUrls: [TAROKO], season: '溪溝流況與季節影響未查核', limitations: '概況記載溪溝取水，沒有當次現勘日期；可取量、水質、取水路徑與當日流況未知。' },
  { id: 'qilai-new-hut', name: '新奇萊山屋', type: 'hut', region: '奇萊山區', sourceName: '太魯閣國家公園・奇萊新山屋公告', sourceUrls: [QILAI_NOTICE, QILAI_NEW], season: '高山天候與申請規則行前查核', limitations: '新屋須依核准床位與宿營地使用；不沿用舊稜線小屋床數、試營運安排或取水分鐘。' },
  { id: 'qilai-new-water', name: '新奇萊山屋雨雪集水設施記錄', type: 'water', region: '奇萊山區', sourceName: '國家公園署・新奇萊山屋設施專文', sourceUrls: [QILAI_NEW, TAROKO], season: '雨雪收集與乾期存量未查核', limitations: '新屋專文記載雨雪集水；概況頁仍有舊下切溪谷描述，兩者不直接合併。集水、過濾設施不等於當日供應量或飲用水檢驗。' },
  { id: 'kuhanoxin-hut', name: '庫哈諾辛山屋', type: 'hut', region: '高雄市', sourceName: '玉山國家公園・庫哈諾辛山屋', sourceUrls: [KUHA_HUT], season: '南橫與高山天候管制另查', limitations: '官方指定住宿設施，需核准；官方要求自登山口攜水，不能因有山屋就預期可補水。' },
  { id: 'kuhanoxin-camp', name: '庫哈諾辛營地', type: 'camp', region: '高雄市', sourceName: '玉山國家公園・庫哈諾辛宿營地', sourceUrls: [KUHA_HUT], season: '南橫與高山天候管制另查', limitations: '官方列有營地，營位與山屋須分別核准；不自行擴張至周圍空地。' },
  { id: 'kuhanoxin-water', name: '庫哈諾辛山屋儲水設施記錄', type: 'water', region: '高雄市', sourceName: '玉山國家公園・山屋與注意事項', sourceUrls: [KUHA_HUT, KUHA_NOTES], season: '雨水儲存與現有水量未查核', limitations: '官方同時列儲水設施與自登山口攜水要求；保留兩者，不能將設施存在改成供水確認或可取量。' },
  { id: 'songluo-water', name: '松蘿湖水龍頭營地取水記錄', type: 'water', region: '松蘿湖山區', sourceName: '健行筆記編輯部・松蘿湖兩日介紹', sourceUrls: [SONG, BIJI(427)], sourcePublishedAt: '2025-05-29', season: '降雨、乾期及取水設施現況未查核', limitations: '公開介紹的取水位置記錄；沒有現地觀測日期，可取量及水質未知，不以湖水代替已確認的飲水來源。' },
  { id: 'songluo-camp', name: '松蘿湖畔宿營紀錄', type: 'camp', region: '松蘿湖山區', sourceName: '健行筆記編輯部・松蘿湖兩日介紹', sourceUrls: [SONG, 'https://yilan.forest.gov.tw/0000355'], sourcePublishedAt: '2025-05-29', season: '湖位、泥濘與可用腹地隨降雨改變', limitations: '文獻宿營位置，非已確認的管理機關劃設營地或核准營位；入山、容許宿營範圍與環境限制需另外確認。' },
  { id: 'jialuo-water', name: '加羅湖加納富溪取水記錄', type: 'water', region: '宜蘭縣', sourceName: '健行筆記編輯部・加羅湖兩日介紹', sourceUrls: [JIALUO, BIJI(411)], sourcePublishedAt: '2020-04-10', season: '溪流流況、霧雨與乾期未查核', limitations: '2020 年介紹記載的取水處；沒有現地觀測日期，不保證當日流量、水質或可達，不將湖水視為已確認飲水。' },
  { id: 'jialuo-camp', name: '加羅湖畔宿營紀錄', type: 'camp', region: '宜蘭縣', sourceName: '健行筆記編輯部・加羅湖兩日介紹', sourceUrls: [JIALUO, BIJI(411)], sourcePublishedAt: '2020-04-10', season: '湖畔泥濘、霧雨與腹地需現地查核', limitations: '公開介紹中的宿營區域，非已核准營地或可預訂床位。許可、林道進出位置、現地環境容許範圍另查。' },
  { id: 'shuiyang-water', name: '水漾森林上游取水紀錄', type: 'water', region: '水漾森林山區', sourceName: '健行筆記・法蘭怎麼玩 How Frank Play（2022 年心得）', sourceUrls: [SHUIYANG], sourcePublishedAt: '2022-06-04', season: '降雨、溪流與上游取水路徑未查核', limitations: '2022 年作者心得記載上游取水；未提供現地日期，水量、水質與今日可達性未知。不提供未核實座標，也不採湖水作可直接飲用保證。' },
  { id: 'shuiyang-camp', name: '水漾森林湖畔宿營紀錄', type: 'camp', region: '南投縣・嘉義縣', sourceName: '健行筆記・水漾森林鹿屈山路線介紹', sourceUrls: [BIJI(674)], season: '雨後泥濘、陡坡及湖畔環境限制另查', limitations: '文獻宿營位置，非已核准營位；付費入園、入山與宿營同意不是同一事項，須向所在地管理單位查核。' },
];
export const EXPANDED_RESOURCES: readonly ResourceSeed[] = expandedResourceSeeds.map(resource => ({ ...resource, checkedAt: LIBRARY_RESEARCH_CHECKED_AT }));
