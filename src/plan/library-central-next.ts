import type {PlanTemplateDay, ResourceSeed, TemplateSeed} from './catalog';

/** Source reading time; neither a field inspection nor an opening confirmation. */
export const CENTRAL_NEXT_CHECKED_AT = '2026-10-26T12:30:36Z';
const APPLY = 'https://hike.taiwan.gov.tw/apply_1.aspx';
const OPEN = 'https://hike.taiwan.gov.tw/open.aspx';
const TAROKO_BEDS = 'https://hike.taiwan.gov.tw/bed_4.aspx';
const JADE_BEDS = 'https://hike.taiwan.gov.tw/bed_6.aspx';
const PINGFENG = 'https://hiking.biji.co/index.php?act=detail&id=656&q=trail';
const SHUANLING = 'https://hiking.biji.co/index.php?act=detail&id=532&q=trail';
const BIYANG = 'https://hiking.biji.co/index.php?act=detail&id=655&q=trail';
const BIYANG_OFFICIAL = 'https://www.taroko.gov.tw/ch/trailsAttractions/trail-list/54';
const BADAXIU = 'https://hiking.biji.co/index.php?act=detail&id=623&q=trail';
const YUSHAN_TRAIL_STATUS = 'https://www.ysnp.gov.tw/Trail/Status';
const CENTRAL_HUT = 'https://www.ysnp.gov.tw/Trail/1783c684-3f87-4862-bf4e-e876e639d405?ID=f531c3d2-9d4f-4049-a2e7-e60442a7946e&Tab=3';
const GUANGAO_HUT = 'https://www.ysnp.gov.tw/Trail/1783c684-3f87-4862-bf4e-e876e639d405?ID=72609e70-f333-43d2-a332-f7b27912f004&Tab=3';
const BAIYANG_HUT = 'https://www.ysnp.gov.tw/Trail/8dbb3955-47fc-4311-8077-3518d1ad89b7?ID=7246d925-0a6b-4ad1-ac5d-ad1bb4fad5ce&Tab=3';
const SHUANLING_WATER_REPORT = 'https://hiking.biji.co/index.php?act=info&q=review&review_id=29628';
const PINGFENG_CLOSURE = 'https://www.taroko.gov.tw/jp/titlelist/announcements/4516';
const day = (label: string, stops: string[], resourceIds: string[], lodgingResourceId: string | null = null): PlanTemplateDay => ({label, stops, resourceIds, lodgingResourceId});
const reference = (sourceUrl: string, from: string, to: string, minutes: number, distanceKm: number) => ({
  from, to, minutes, distanceKm, sourceUrl, sourceName: '健行筆記編輯', checkedAt: CENTRAL_NEXT_CHECKED_AT,
});

export const NEXT_CENTRAL_TEMPLATES: readonly TemplateSeed[] = [
  {
    id: 'pingfeng-two-days', name: '屏風山', routeName: '台8線111.2K新入口－屏風山屋－屏風山往返',
    category: '百岳', mountainRange: '中央山脈', region: '花蓮縣秀林鄉', grade: '兩日重裝・過溪與陡峭攀爬',
    referenceRouteId: null, checkedAt: '2026-10-27T01:36:16Z',
    summary: '採111.2K新入口與屏風山屋版本，保留巨木區、峭壁及回程過溪節點。編輯參考未註明負重／休息口徑，回程合併段不拆算分鐘；不接舊合歡金礦線。',
    planningReady: false,
    planningReview: '暫停一鍵套用：來源兩日版第 2 天分段合計 770 分（12 小時 50 分）移動，尚未計休息；且太魯閣公告屏風山屋及周邊區域禁止進入至 2026-11-30，屏風山路線列為受影響，可能延長。須先核對後續開放公告及合法宿營，再重排分日。',
    sourceUrls: [PINGFENG, TAROKO_BEDS], links: {application: APPLY, beds: TAROKO_BEDS, status: OPEN},
    accessNotice: {text: '2026-10-27 查閱太魯閣官方日文公告：2026-09-21 至 11-30 屏風山屋及周邊區域暫停使用、禁止進入，屏風山路線受影響；原核准入園許可失效，開放可能另行延後。此為公告快照，出發前須查後續公告。', sourceUrl: PINGFENG_CLOSURE, checkedAt: '2026-10-27T01:36:16Z'},
    days: [
      day('第 1 天｜新入口至屏風山屋', ['台8線111.2K屏風山新登山口', '塔次基里溪支流', '鐵線吊橋營地', '屏風山屋（松針營地）'], ['pingfeng-hut', 'pingfeng-water', 'pingfeng-tieqiao-camp'], 'pingfeng-hut'),
      day('第 2 天｜屏風山往返下山', ['屏風山屋（松針營地）', '巨木區', '垂直峭壁', '屏風山', '垂直峭壁', '巨木區', '屏風山屋（松針營地）', '鐵線吊橋營地', '塔次基里溪支流', '台8線111.2K屏風山新登山口'], ['pingfeng-hut', 'pingfeng-water', 'pingfeng-tieqiao-camp']),
    ],
    referenceSegments: [
      reference(PINGFENG, '台8線111.2K屏風山新登山口', '塔次基里溪支流', 120, 2.7),
      reference(PINGFENG, '塔次基里溪支流', '鐵線吊橋營地', 80, 1.7),
      reference(PINGFENG, '鐵線吊橋營地', '屏風山屋（松針營地）', 60, .987),
      reference(PINGFENG, '屏風山屋（松針營地）', '巨木區', 40, .855),
      reference(PINGFENG, '巨木區', '垂直峭壁', 180, 2.26),
      reference(PINGFENG, '垂直峭壁', '屏風山', 50, .56),
      reference(PINGFENG, '塔次基里溪支流', '台8線111.2K屏風山新登山口', 120, 2.7),
    ],
  },
  {
    id: 'shuanling-three-days', name: '閂山・鈴鳴山', routeName: '730林道11.7K－閂山－25K工寮－鈴鳴山往返',
    category: '百岳', mountainRange: '中央山脈', region: '臺中市・花蓮縣', grade: '三日重裝・林道崩塌與箭竹',
    referenceRouteId: null, checkedAt: CENTRAL_NEXT_CHECKED_AT,
    summary: '採先閂山、再鈴鳴山的三日往返版本，不連走北二段。分鐘與距離是健筆編輯參考，負重／休息口徑未註明；11.7K以前接駁、26K崩塌及宿營許可另查。',
    sourceUrls: [SHUANLING, SHUANLING_WATER_REPORT], links: {application: APPLY, beds: TAROKO_BEDS, status: OPEN},
    days: [
      day('第 1 天｜閂山至25K工寮', ['730林道11.7K柵欄', '17.5K耳無溪岔路', '23.2K閂山登山口', '閂山', '23.2K閂山登山口', '730林道25K工寮'], ['shuanling-25k-camp'], 'shuanling-25k-camp'),
      day('第 2 天｜鈴鳴山往返', ['730林道25K工寮', '27.5K鈴鳴山登山口', '鈴鳴山', '27.5K鈴鳴山登山口', '730林道25K工寮'], ['shuanling-25k-camp', 'shuanling-27k-water'], 'shuanling-25k-camp'),
      day('第 3 天｜返回730林道入口', ['730林道25K工寮', '23.2K閂山登山口', '17.5K耳無溪岔路', '730林道11.7K柵欄'], ['shuanling-25k-camp']),
    ],
    referenceSegments: [
      reference(SHUANLING, '730林道11.7K柵欄', '17.5K耳無溪岔路', 100, 5.8),
      reference(SHUANLING, '17.5K耳無溪岔路', '23.2K閂山登山口', 120, 5.7),
      reference(SHUANLING, '23.2K閂山登山口', '閂山', 100, 2.8),
      reference(SHUANLING, '閂山', '23.2K閂山登山口', 60, 2.8),
      reference(SHUANLING, '23.2K閂山登山口', '730林道25K工寮', 45, 1.8),
      reference(SHUANLING, '730林道25K工寮', '27.5K鈴鳴山登山口', 75, 2.5),
      reference(SHUANLING, '27.5K鈴鳴山登山口', '鈴鳴山', 130, 2),
      reference(SHUANLING, '鈴鳴山', '27.5K鈴鳴山登山口', 100, 2),
      reference(SHUANLING, '27.5K鈴鳴山登山口', '730林道25K工寮', 75, 2.5),
      reference(SHUANLING, '730林道25K工寮', '23.2K閂山登山口', 35, 1.8),
      reference(SHUANLING, '23.2K閂山登山口', '17.5K耳無溪岔路', 100, 5.7),
      reference(SHUANLING, '17.5K耳無溪岔路', '730林道11.7K柵欄', 90, 5.8),
    ],
  },
  {
    id: 'biyang-traverse', name: '畢羊縱走', routeName: '大禹嶺公廁新入口－畢祿山－鋸齒連峰－羊頭山－慈恩',
    category: '百岳', mountainRange: '中央山脈', region: '南投縣・花蓮縣', grade: '兩日重裝縱走・裸露攀爬',
    referenceRouteId: null, checkedAt: CENTRAL_NEXT_CHECKED_AT,
    summary: '新入口接820林道0.3K，首晚保留稜線宿營紀錄，不自動改宿鋸東小屋。新入口至工寮分鐘未知；其餘選錄健筆同方向參考，負重／休息口徑未註明。',
    sourceUrls: [BIYANG_OFFICIAL, BIYANG], links: {application: APPLY, beds: TAROKO_BEDS, status: OPEN},
    days: [
      day('第 1 天｜新入口經畢祿山至稜線', ['大禹嶺公廁旁新入口', '820林道0.3K交會', '820林道工寮', '畢祿山登山口', '畢祿稜線三叉路口', '畢祿山', '畢祿稜線三叉路口', '畢祿稜線營地'], ['biyang-last-water', 'biyang-ridge-camp'], 'biyang-ridge-camp'),
      day('第 2 天｜鋸齒連峰經羊頭山下慈恩', ['畢祿稜線營地', '鋸山', '羊頭三叉路口', '羊頭山', '羊頭三叉路口', '小鞍部', '慈恩羊頭山登山口'], ['biyang-ridge-camp']),
    ],
    referenceSegments: [
      reference(BIYANG, '820林道工寮', '畢祿山登山口', 20, .4),
      reference(BIYANG, '畢祿山登山口', '畢祿稜線三叉路口', 110, 1.6),
      reference(BIYANG, '畢祿稜線三叉路口', '畢祿山', 5, .1),
      reference(BIYANG, '畢祿山', '畢祿稜線三叉路口', 5, .1),
      reference(BIYANG, '畢祿稜線三叉路口', '畢祿稜線營地', 10, .2),
      reference(BIYANG, '畢祿稜線營地', '鋸山', 80, .8),
      reference(BIYANG, '鋸山', '羊頭三叉路口', 180, 3),
      reference(BIYANG, '羊頭三叉路口', '羊頭山', 50, 1.1),
      reference(BIYANG, '羊頭山', '羊頭三叉路口', 40, 1.1),
      reference(BIYANG, '羊頭三叉路口', '小鞍部', 80, 1.5),
      reference(BIYANG, '小鞍部', '慈恩羊頭山登山口', 80, 1.5),
    ],
  },
  {
    id: 'badaxiu-four-days', name: '八大秀', routeName: '東埔－中央金礦－秀姑巒山與大水窟山－八通關山往返',
    category: '百岳', mountainRange: '中央山脈', region: '南投縣・花蓮縣', grade: '四日重裝・長路程與高繞',
    referenceRouteId: null, checkedAt: CENTRAL_NEXT_CHECKED_AT,
    summary: '東埔進出、樂樂一晚與中央金礦兩晚的四日研究版本。三座百岳均列入，但分日過密，白洋與大水窟之間的方向、距時及住宿仍需逐段核對。',
    planningReady: false,
    planningReview: '暫停一鍵套用：來源四日分法的第 2、3、4 天移動分別約 10 小時 40 分、12 小時 30 分、12 小時 35 分，均未含休息；其中「大水窟山→白洋金礦 0.4 公里／110 分」與地圖關係待核。2026 年候選 GPX 僅 1 個命名路點，不能確認三峰與宿營版本。須先重排日界並核對通行、山屋與上河 G17 原圖。',
    accessNotice: {text: '10/27 查閱玉山國家公園路況頁（頁尾更新 10/25）：南二段及八通關越嶺步道系統列封閉；此為查閱快照，須以官方最新公告及核准入園狀態為準。', sourceUrl: YUSHAN_TRAIL_STATUS, checkedAt: '2026-10-27T01:22:58Z'},
    sourceUrls: [YUSHAN_TRAIL_STATUS, BADAXIU, CENTRAL_HUT, GUANGAO_HUT, JADE_BEDS], links: {application: APPLY, beds: JADE_BEDS, status: YUSHAN_TRAIL_STATUS},
    days: [
      day('第 1 天｜東埔至樂樂山屋', ['東埔登山口', '樂樂山屋'], ['lele-hut'], 'lele-hut'),
      day('第 2 天｜經觀高與八通關至中央金礦', ['樂樂山屋', '觀高坪', '八通關草原', '八通關山登山口', '中央金礦山屋'], ['lele-hut', 'guangao-hut', 'central-mine-hut', 'central-mine-water'], 'central-mine-hut'),
      day('第 3 天｜秀姑巒山與大水窟山（分日待核）', ['中央金礦山屋', '白洋金礦山屋', '秀姑坪', '秀姑巒山', '秀姑坪', '大水窟山', '秀姑坪', '白洋金礦山屋', '中央金礦山屋'], ['central-mine-hut', 'central-mine-water', 'baiyang-mine-hut'], 'central-mine-hut'),
      day('第 4 天｜八通關山往返下東埔', ['中央金礦山屋', '八通關山登山口', '八通關山', '八通關山登山口', '八通關草原', '觀高坪', '樂樂山屋', '東埔登山口'], ['central-mine-hut', 'central-mine-water', 'guangao-hut', 'lele-hut']),
    ],
  },
];

export const NEXT_CENTRAL_RESOURCES: readonly ResourceSeed[] = [
  {id: 'pingfeng-hut', name: '屏風山屋（松針營地）', type: 'hut', region: '花蓮縣', sourceName: '國家公園署・太魯閣宿營地與健行筆記路線', sourceUrls: [TAROKO_BEDS, PINGFENG], checkedAt: CENTRAL_NEXT_CHECKED_AT, season: '高山與過溪條件另查', limitations: '官方列為屏風避難山屋，住宿依核准；設施名錄不代表當日可入住。2026年周邊防治作業有暫停使用公告，行前須查後續。'},
  {id: 'pingfeng-water', name: '屏風山屋集水設施記錄', type: 'water', region: '花蓮縣', sourceName: '國家公園署・太魯閣宿營地概況', sourceUrls: [TAROKO_BEDS], checkedAt: CENTRAL_NEXT_CHECKED_AT, season: '冬季與乾期水源可能不穩', limitations: '官方列集水桶，未有現地觀測日期；存量、水質及當日可取量未知，不與附近溪水視為同一取水位置。'},
  {id: 'pingfeng-tieqiao-camp', name: '鐵線吊橋營地宿營紀錄', type: 'camp', region: '花蓮縣', sourceName: '健行筆記・屏風山登山山徑', sourceUrls: [PINGFENG], checkedAt: CENTRAL_NEXT_CHECKED_AT, season: '溪水、橋況與雨季條件另查', limitations: '文獻記載的沿線宿營腹地；未確認現行核准營位、露營許可或舊帳數，這個版本仍以屏風山屋為首晚安排。'},
  {id: 'shuanling-25k-camp', name: '730林道25K工寮周邊宿營紀錄', type: 'camp', region: '臺中市', sourceName: '健行筆記・閂山鈴鳴山步道', sourceUrls: [SHUANLING], checkedAt: CENTRAL_NEXT_CHECKED_AT, season: '林道崩塌、箭竹與屋體現況另查', limitations: '編輯行程的歷史宿營位置，工寮屋體與露營許可未核實；不標為可預訂山屋或已核准營位。'},
  {id: 'shuanling-27k-water', name: '730林道27K取水歷史紀錄', type: 'water', region: '臺中市', sourceName: '健行筆記・Joyce Chang（2023年北二段心得）', sourceUrls: [SHUANLING_WATER_REPORT], checkedAt: CENTRAL_NEXT_CHECKED_AT, sourcePublishedAt: '2023-09-21', observedAt: null, season: '僅代表2023年9月該次行程', limitations: '旅程區間為2023-09-14至09-17，原文未逐筆註明取水日，現地日期保留未知。27K是同林道的歷史補充，不等同25K工寮供水，也不把27K與27.5K登山口視為同點；現況、水質及精確座標未知。'},
  {id: 'biyang-last-water', name: '820林道盡頭取水區記錄', type: 'water', region: '南投縣', sourceName: '太魯閣國家公園・畢祿羊頭縱走', sourceUrls: [BIYANG_OFFICIAL, BIYANG], checkedAt: CENTRAL_NEXT_CHECKED_AT, season: '上稜後補水與季節流況另查', limitations: '官方介紹有上稜前溪澗取水記載；具體位置、現地日期、水質與當日水量未知，沒有將文獻用水量當隊伍需求。'},
  {id: 'biyang-ridge-camp', name: '畢祿稜線宿營紀錄', type: 'camp', region: '南投縣・花蓮縣', sourceName: '健行筆記・畢羊縱走及太魯閣路線介紹', sourceUrls: [BIYANG, BIYANG_OFFICIAL], checkedAt: CENTRAL_NEXT_CHECKED_AT, season: '裸露稜線、風勢與許可另查', limitations: '兩日文獻的稜線宿營點；不是鋸東避難小屋，沒有核實現行露營許可、腹地或避風性。'},
  {id: 'lele-hut', name: '樂樂山屋', type: 'hut', region: '南投縣', sourceName: '國家公園署・玉山宿營地查詢', sourceUrls: [JADE_BEDS, BADAXIU], checkedAt: CENTRAL_NEXT_CHECKED_AT, season: '八通關古道與雨後高繞條件另查', limitations: '官方列冊的住宿設施；入園及該晚床位須核准，不由名錄推定當日可入住或供水。'},
  {id: 'central-mine-hut', name: '中央金礦山屋', type: 'hut', region: '南投縣', sourceName: '玉山國家公園・中央金礦山屋', sourceUrls: [CENTRAL_HUT, JADE_BEDS], checkedAt: CENTRAL_NEXT_CHECKED_AT, season: '高山天候與宿營核准另查', limitations: '官方設施及宿營索引；多晚需逐晚核准，不以設施頁的開放欄替代全線通行狀態。'},
  {id: 'central-mine-water', name: '中央金礦供水設施記錄', type: 'water', region: '南投縣', sourceName: '玉山國家公園・中央金礦山屋', sourceUrls: [CENTRAL_HUT], checkedAt: CENTRAL_NEXT_CHECKED_AT, season: '雨水儲存與溪流季節條件另查', limitations: '官方列雨水集水設施及中央金溪；未有現地觀測日期，不代表當日水量、水質或已確認取水位置。'},
  {id: 'guangao-hut', name: '觀高山屋', type: 'hut', region: '南投縣', sourceName: '玉山國家公園・觀高山屋', sourceUrls: [GUANGAO_HUT, JADE_BEDS], checkedAt: CENTRAL_NEXT_CHECKED_AT, season: '高繞路線與山屋規則另查', limitations: '新觀高山屋與舊觀高登山服務站分開；附近沒有指定露營區。本版本僅索引沿線設施，不自動將觀高坪改為宿營地。'},
  {id: 'baiyang-mine-hut', name: '白洋金礦山屋', type: 'hut', region: '南投縣', sourceName: '玉山國家公園・白洋金礦山屋', sourceUrls: [BAIYANG_HUT, JADE_BEDS], checkedAt: CENTRAL_NEXT_CHECKED_AT, season: '山屋地基、交通與高山天候另查', limitations: '沿線設施索引；官方頁另有山屋前緣土石流失提醒，使用前核對現況與核准。本版本途經白洋金礦，不預設在此過夜。'},
];
