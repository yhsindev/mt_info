import type { PlanDay, PlanDraft, PlanLeg } from './types';
import { createBlankPlan } from './model';

export const DABA_REFERENCE_URL = 'https://recreation.forest.gov.tw/Trail/RT?tr_id=027';
/** Fixed source verification time; creating a new draft does not recheck the website. */
export const DABA_REFERENCE_CHECKED_AT = '2026-10-21T14:40:28Z';
const HUT_URL = 'https://99online.forest.gov.tw/';

function leg(day: number, index: number, from: string, to: string, distanceKm: number, minutes: number): PlanLeg {
  return { id: `daba-d${day}-leg${index}`, from, to, distanceKm, minutes, restMinutes: null, ascentM: null, descentM: null, load: day === 2 ? 'light' : 'full', sourceUrl: DABA_REFERENCE_URL };
}
function day(number: number, label: string, legs: PlanLeg[], notes: string): PlanDay {
  return {
    id: `daba-day${number}`, label, startTime: '', legs,
    water: { primary: '', backup: '', note: `${number < 3 ? '九九山莊官方介紹明載不供應熱水；未由此推定冷水取用方式或供應量。' : ''}尚未查核行程當日水情、取水與處理條件；水量欄位須由使用者依隊伍需求填寫，並非水源可靠度或建議飲水量。`, availability: 'unknown', reportedAt: '', sourceUrl: number < 3 ? 'https://99online.forest.gov.tw/basic/?mode=detail&node=28' : DABA_REFERENCE_URL, perPersonL: null, cookingL: null, reserveL: null, detourMinutes: null },
    lodging: { name: number < 3 ? '九九山莊' : '', backup: '', reservation: 'unknown', approvalReference: '', sourceUrl: number < 3 ? HUT_URL : '' },
    retreat: { decisionPoint: '', deadline: '', trigger: '', route: '', confirmed: false, sourceUrl: DABA_REFERENCE_URL },
    menu: '', notes,
  };
}

/** Official route numbers are editable references, never a team pace or completed plan. */
export function createDabaPlan(now = new Date().toISOString()): PlanDraft {
  const blank = createBlankPlan(now);
  return {
    schemaVersion: 1, id: blank.id, title: '大霸尖山三日行程草稿（官方路程參考）', routeName: '觀霧－九九山莊－大霸尖山霸基往返', referenceRouteId: '027',
    startDate: '', members: null, leader: '', leaderPhone: '', keeper: '', keeperPhone: '', checkInPlan: '', overdueAt: '', communication: '', gear: '',
    notes: `路程參考來源：林業及自然保育署大霸尖山步道頁，查核 ${DABA_REFERENCE_CHECKED_AT}；來源頁未提供這份路程的發布／測製日期。各段分鐘與距離沿用官方參考，不代表個人或隊伍配速。D1、D3全裝與D2輕裝為可修改的範本設定，非官方裝備要求。未附入任何私人資料、即時水情或床位核准。`,
    reviewNotes: '官方每日標示時間與分段分鐘加總有差異，詳每日備註；不以假造休息補足差額。每段休息先留未知，請依隊伍需求安排。另須查核水情、入園與住宿核准、路況、撤退條件及聯絡安排。',
    days: [
      day(1, '第 1 天｜觀霧至九九山莊', [
        leg(1, 1, '觀霧山莊', '馬達拉溪登山口', 19, 360),
        leg(1, 2, '馬達拉溪登山口', '九九山莊', 4, 210),
      ], '來源日標為23公里、約10.5小時；分段為19公里／360分鐘與4公里／210分鐘，合計570分鐘（9小時30分），與日標不一致。未推定差額為休息；休息均待填。'),
      day(2, '第 2 天｜九九山莊至大霸霸基往返', [
        leg(2, 1, '九九山莊', '白橋（加利山岔路口）', 1.3, 50),
        leg(2, 2, '白橋（加利山岔路口）', '3050高地（加利山岔路口）', 0.7, 40),
        leg(2, 3, '3050高地（加利山岔路口）', '伊澤山捷徑岔', 2.3, 65),
        leg(2, 4, '伊澤山捷徑岔', '伊澤山登山口', 0.5, 25),
        leg(2, 5, '伊澤山登山口', '中霸山屋', 0.8, 25),
        leg(2, 6, '中霸山屋', '中霸坪', 0.7, 40),
        leg(2, 7, '中霸坪', '大霸尖山霸基（折返點）', 1, 30),
        leg(2, 8, '大霸尖山霸基（折返點）', '中霸坪', 1, 30),
        leg(2, 9, '中霸坪', '中霸山屋', 0.7, 40),
        leg(2, 10, '中霸山屋', '伊澤山登山口', 0.8, 35),
        leg(2, 11, '伊澤山登山口', '伊澤山捷徑岔', 0.5, 20),
        leg(2, 12, '伊澤山捷徑岔', '3050高地（加利山岔路口）', 2.3, 40),
        leg(2, 13, '3050高地（加利山岔路口）', '九九山莊', 2, 50),
      ], '來源日標為14.6公里、含休息約14小時；分段距離合計14.6公里，分鐘合計490分鐘（8小時10分）。來源未拆分休息與個別配速，兩種時數皆保留供查核，休息待填，不把差額當已安排休息。當日水情與中霸山屋供水仍須行前查核。'),
      day(3, '第 3 天｜九九山莊返回觀霧', [
        leg(3, 1, '九九山莊', '馬達拉溪登山口', 4, 130),
        leg(3, 2, '馬達拉溪登山口', '觀霧山莊', 19, 360),
      ], '來源日標為23公里、約9.5小時；分段為4公里／130分鐘與19公里／360分鐘，合計490分鐘（8小時10分），與日標不一致。未推定差額為休息；下山接駁、報平安及超時處理待填，住宿欄空白不代表已安排備援。'),
    ],
    advisories: [], createdAt: blank.createdAt, updatedAt: blank.updatedAt,
  };
}
