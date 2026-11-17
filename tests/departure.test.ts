import { describe, expect, it, vi } from 'vitest';
import { createBlankPlan, createPlanDay } from '../src/plan/model';
import { PLAN_STORAGE_KEY, writePlanStorage } from '../src/plan/storage';
import { createPlanBackup, PLAN_BACKUP_KEY, readPlanBackup, writePlanBackup } from '../src/plan/backup-storage';
import { compareDepartureDays, departureDuration, departureIssues, departureTarget } from '../src/plan/departure';
import { compareNoticeChecks, createNoticeCheck, NOTICE_CHECKS_KEY, readNoticeChecks, writeNoticeCheck } from '../src/plan/notice-checks';
import type { ConditionsSource, TrailCondition } from '../src/shared/conditions';

class MemoryStorage implements Storage {
  values = new Map<string,string>(); get length() { return this.values.size; }
  getItem(key:string) { return this.values.get(key) ?? null; } setItem(key:string,value:string) { this.values.set(key,value); }
  removeItem(key:string) { this.values.delete(key); } clear() { this.values.clear(); } key(index:number) { return [...this.values.keys()][index] ?? null; }
}
const now = Date.parse('2026-11-17T06:00:00Z');
const item:TrailCondition = { id:'a',trailId:'027',name:'大霸尖山步道',region:'新竹',manager:'管理單位',condition:'closed',rawCondition:'封閉',headline:'受控公告',description:'請核對原文',section:'部分路段',issuedAt:'2026-11-16',updatedAt:null,closureDate:'2026-11-17',expectedOpeningDate:null,latitude:null,longitude:null,coordinateNote:'未知',source:{name:'林業署',url:'https://recreation.forest.gov.tw/Trail/RT?tr_id=027'} };
const feed = (items=[item]):ConditionsSource<TrailCondition> => ({status:items.length?'ready':'empty',source:item.source,coverage:'已收錄範圍',fetchedAt:new Date(now).toISOString(),checkedAt:new Date(now).toISOString(),error:null,message:'測試',items});
describe('independent main and alternative plans',() => {
  it('deep-clones a draft with a distinct plan ID, retains unknowns and saves without touching the main key',() => {
    const storage = new MemoryStorage(), main = createBlankPlan(); writePlanStorage(main,storage);
    const original = storage.getItem(PLAN_STORAGE_KEY), alternative = createPlanBackup(main);
    expect(alternative.id).not.toBe(main.id); expect(alternative.days).toEqual(main.days);
    alternative.days[0].startTime='07:00'; alternative.days[0].legs[0].minutes=30;
    expect(main.days[0].startTime).toBe(''); expect(main.days[0].legs[0].minutes).toBeNull();
    expect(writePlanBackup(main.id,alternative,storage).error).toBeNull();
    expect(readPlanBackup(storage).backup).toMatchObject({parentId:main.id,draft:{id:alternative.id}});
    expect(storage.getItem(PLAN_STORAGE_KEY)).toBe(original);
  });
  it('preserves corrupt, foreign and quota-limited backups without replacing the main or previous alternative',() => {
    const storage=new MemoryStorage(),main=createBlankPlan(),backup=createPlanBackup(main);storage.setItem(PLAN_BACKUP_KEY,'{broken');
    expect(writePlanBackup(main.id,backup,storage).error).toBeTruthy(); expect(storage.getItem(PLAN_BACKUP_KEY)).toBe('{broken');
    storage.removeItem(PLAN_BACKUP_KEY);writePlanBackup(main.id,backup,storage);const raw=storage.getItem(PLAN_BACKUP_KEY);
    expect(writePlanBackup('another-main',backup,storage).error).toBeTruthy();expect(storage.getItem(PLAN_BACKUP_KEY)).toBe(raw);
    vi.spyOn(storage,'setItem').mockImplementation(()=>{throw new Error('quota')});backup.days[0].startTime='08:00';
    expect(writePlanBackup(main.id,backup,storage).savedAt).toBeNull();expect(storage.getItem(PLAN_BACKUP_KEY)).toBe(raw);
  });
  it('compares changed and extra days without mutating either plan or filling unknown durations',() => {
    const main=createBlankPlan(),backup=createPlanBackup(main);
    expect(compareDepartureDays(main,backup)[0].changed).toBe(false);
    backup.days[0].water.backup='自攜備用水';backup.days.push(createPlanDay(2));
    const rows=compareDepartureDays(main,backup);expect(rows.map(row=>row.changed)).toEqual([true,true]);expect(rows[1].main).toBeNull();
    expect(departureDuration({known:0,missing:1,complete:false,value:null})).toContain('未知');
    const issues=departureIssues(main);expect(issues.some(issue=>issue.id==='plan-gear')).toBe(false);
    expect(departureTarget(issues.find(issue=>issue.id.endsWith('-water-source'))!)).toBe('water');
  });
});
describe('dated, route-specific notice comparisons',() => {
  it('separates content changes, added entries and absent entries without treating absence as reopening',() => {
    const before=createNoticeCheck(feed(), '027',now)!;
    const after=createNoticeCheck(feed([{...item,description:'新內容'},{...item,id:'b',headline:'另一則'}]),'027',now+60_000)!;
    const diff=compareNoticeChecks(before,after);expect(diff.changed).toHaveLength(1);expect(diff.changed[0].before.description).toBe('請核對原文');expect(diff.added[0].id).toBe('b');
    const empty=createNoticeCheck(feed([]),'027',now)!;expect(compareNoticeChecks(before,empty).absent[0].condition).toBe('closed');
    const rekeyed=createNoticeCheck(feed([{...item,id:'content-hash-changed',description:'新內容'}]),'027',now)!;
    expect(compareNoticeChecks(before,rekeyed)).toMatchObject({changed:[],added:[{id:'content-hash-changed'}],absent:[{id:'a'}]});
    expect(()=>compareNoticeChecks(before,{...empty,routeId:'119'})).toThrow();
  });
  it('keeps the baseline dated and excludes other routes, stale data, missing validation times and failed sources',() => {
    const check=createNoticeCheck(feed([item,{...item,id:'other',trailId:'119'}]),'027',now)!;expect(check.items).toHaveLength(1);
    const storage=new MemoryStorage();expect(writeNoticeCheck(check,storage).error).toBeNull();expect(readNoticeChecks(storage).checks['027']).toEqual(check);
    for(const status of ['stale','error','missing','disabled'] as const)expect(createNoticeCheck({...feed(),status},'027',now)).toBeNull();
    expect(createNoticeCheck({...feed(),checkedAt:null},'027',now)).toBeNull();expect(createNoticeCheck(feed(),'027',now+3_600_001)).toBeNull();
    expect(createNoticeCheck({...feed(),checkedAt:new Date(now+600_000).toISOString()},'027',now)).toBeNull();
  });
  it('retains invalid or full storage and rejects malformed dates, URLs and duplicate IDs',() => {
    const storage=new MemoryStorage(),check=createNoticeCheck(feed(),'027',now)!;
    storage.setItem(NOTICE_CHECKS_KEY,'{broken');expect(writeNoticeCheck(check,storage).error).toBeTruthy();expect(storage.getItem(NOTICE_CHECKS_KEY)).toBe('{broken');
    storage.removeItem(NOTICE_CHECKS_KEY);writeNoticeCheck(check,storage);const original=storage.getItem(NOTICE_CHECKS_KEY);
    for(const invalid of [{...check,items:[{...check.items[0],issuedAt:'2026-99-40'}]},{...check,items:[{...check.items[0],sourceUrl:'javascript:alert(1)'}]},{...check,items:[...check.items,...check.items]}])expect(writeNoticeCheck(invalid,storage).error).toBeTruthy();
    expect(storage.getItem(NOTICE_CHECKS_KEY)).toBe(original);
    vi.spyOn(storage,'setItem').mockImplementation(()=>{throw new Error('quota')});expect(writeNoticeCheck(check,storage).error).toBeTruthy();expect(storage.getItem(NOTICE_CHECKS_KEY)).toBe(original);
  });
});
