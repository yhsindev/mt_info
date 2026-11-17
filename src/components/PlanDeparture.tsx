import { ArrowRight, Copy, ExternalLink } from 'lucide-react';
import { useMemo } from 'react';
import type { ConditionsResponse } from '../shared/conditions';
import type { PlanDraft, PlanDay, PlanDayCalculation } from '../plan/types';
import { calculatePlan, formatPlanTime } from '../plan/model';
import { compareDepartureDays, departureDuration, departureIssues, departureTarget, type DepartureEdit } from '../plan/departure';
import { planCopy } from '../plan/copy';
import { PLAN_TEMPLATES } from '../plan/catalog';
import DepartureNotices from './DepartureNotices';
import './PlanDeparture.css';

interface Props {
  draft: PlanDraft; main: PlanDraft; backup: PlanDraft | null; active: 'main' | 'backup'; disabled: boolean;
  backupError: string | null; backupRaw: string | null; onCreateBackup: () => void; onClearBackup: () => void;
  onEdit: (request?: Omit<DepartureEdit,'revision'>) => void; onEditVariant: (variant:'main'|'backup') => void;
  conditions: ConditionsResponse | null; onUpdated: () => void; download: (raw:string,filename:string) => void;
}
function DaySummary({ day, calculation }: { day:PlanDay | null; calculation:PlanDayCalculation | undefined }) {
  if (!day || !calculation) return <p className="departure-note">此方案未安排這一天。</p>;
  return <><p className="departure-route-text">{day.label || '當日行程'}</p><p className="departure-meta">{day.legs.length} 個路段 · 起點：{day.legs[0]?.from || '待填'} · 終點：{day.legs.at(-1)?.to || '待填'}</p><dl className="departure-day-values"><div><dt>日期與起走</dt><dd>{calculation.date || '日期待填'} · {day.startTime || '時間未知'}</dd></div><div><dt>預計結束</dt><dd>{formatPlanTime(calculation.finish)}</dd></div><div><dt>移動與休息</dt><dd>{departureDuration(calculation.totalMinutes)}</dd></div><div><dt>主要／備用水源</dt><dd>{day.water.primary || '待填'}／{day.water.backup || '待填'}<small>{planCopy.waterStates[day.water.availability]} · {day.water.reportedAt || '回報日期未知'}</small></dd></div><div><dt>住宿／返回</dt><dd>{day.lodging.name || '待填'}<small>{planCopy.reservationStates[day.lodging.reservation]}</small></dd></div><div><dt>撤退安排</dt><dd>{day.retreat.route || '待填'}<small>{day.retreat.confirmed ? '已人工核對' : '尚未核對'} · 截止 {day.retreat.deadline || '未知'}</small></dd></div></dl><details className="departure-route-details"><summary>查看逐段安排 · {day.legs.length} 段</summary>{day.legs.length ? <ol>{day.legs.map(leg => <li key={leg.id}>{leg.from || '起點待填'} → {leg.to || '終點待填'}</li>)}</ol> : <p>路段待填。</p>}</details></>;
}
export default function PlanDeparture(props:Props) {
  const { draft,main,backup,active,disabled,backupError,backupRaw,onCreateBackup,onClearBackup,onEdit,onEditVariant,conditions,onUpdated,download } = props;
  const issues = departureIssues(draft), general = issues.filter(issue => !issue.dayId);
  const template = PLAN_TEMPLATES.find(item => item.routeName === draft.routeName);
  const mainCalculation = useMemo(() => calculatePlan(main),[main]);
  const backupCalculation = useMemo(() => backup ? calculatePlan(backup) : null,[backup]);
  return <fieldset className="plan-departure" disabled={disabled}>
    <section className="departure-overview"><p className="departure-kicker">{active === 'main' ? '主計畫' : '備案'} · 行前整理</p><h2>{draft.title || draft.routeName || '未命名計畫'}</h2><p>{draft.routeName || '路線待填'} · {draft.startDate || '出發日期待填'} · {draft.days.length} 天</p><p>逐項核對安排與來源，保留需要再確認的地方。</p><button className="plan-button" onClick={() => onEdit()}>繼續編輯{active === 'main' ? '主計畫' : '備案'}<ArrowRight size={17}/></button></section>
    {template?.planningReview && <div className="departure-note is-warning" role="note"><strong>這份路線安排需要重新審查</strong><p>{template.planningReview}</p>{template.accessNotice && <a className="departure-link" href={template.accessNotice.sourceUrl} target="_blank" rel="noopener noreferrer">查看範本收錄的公告<ExternalLink size={15}/></a>}</div>}
    <section className="departure-section" aria-labelledby="departure-check-title"><div className="departure-section-heading"><div><p className="departure-kicker">出發前確認</p><h2 id="departure-check-title">還有哪些安排需要核對？</h2></div><span className="departure-count">{issues.length} 項待填／核對</span></div><p>依目前填寫內容整理，水情、住宿與撤退仍需人工確認；欄位填妥不代表現況安全。</p>
      {!!general.length && <details className="departure-check-group"><summary>日期與基本安排 · {general.length} 項</summary><ul>{general.map(issue => <li key={issue.id}><span>{issue.message}</span><button className="departure-link" onClick={() => onEdit({target:departureTarget(issue)})}>前往填寫<ArrowRight size={15}/></button></li>)}</ul></details>}
      {draft.days.map((day,index) => { const items = issues.filter(issue => issue.dayId === day.id); return <details className="departure-check-group" key={day.id}><summary><span>第 {index+1} 天{day.label.replace(/^第\s*\d+\s*天[｜|・·\s:：-]*/u,'') ? ` · ${day.label.replace(/^第\s*\d+\s*天[｜|・·\s:：-]*/u,'')}` : ''}</span><span>{items.length ? `${items.length} 項待核對` : '已填欄位仍需核對現況'}</span></summary>{items.length ? <ul>{items.map(issue => <li key={issue.id}><span>{issue.message}</span><button className="departure-link" onClick={() => onEdit({dayId:day.id,target:departureTarget(issue)})}>前往修改<ArrowRight size={15}/></button></li>)}</ul> : <p>這一天沒有缺填提示，仍請確認公告、許可與當日狀況。</p>}</details>; })}
    </section>
    <section className="departure-section" aria-labelledby="departure-backup-title"><div className="departure-section-heading"><div><p className="departure-kicker">多留一個選擇</p><h2 id="departure-backup-title">主計畫與備案</h2></div>{!backupError && <button className="plan-button" onClick={onCreateBackup}><Copy size={17}/>{backup ? '重新複製主計畫' : '從主計畫建立備案'}</button>}</div><p>備案獨立編輯與保存，可調整天數、住宿與時間。重新開頁會先開主計畫；兩個方案都只保存在目前瀏覽器。</p>
      {backupError && <div className="departure-note is-warning" role="alert"><p>{backupError}</p><div className="plan-toolbar">{backupRaw !== null && <button className="plan-button" onClick={() => download(backupRaw,'mt-info-plan-alternative-original.json')}>下載原有備案</button>}{backupRaw !== null && <button className="plan-button" onClick={onClearBackup}>清除原有備案</button>}</div></div>}
      <div className="departure-comparison-head"><article><p className="departure-kicker">主計畫</p><h3>{main.title || '未命名計畫'}</h3><p>{main.routeName || '路線待填'}</p><p>{main.startDate || '日期待填'} · {main.days.length} 天 · {main.members === null ? '人數未知' : `${main.members} 人`}</p><button className="plan-button" onClick={() => onEditVariant('main')}>編輯主計畫</button></article>{backup ? <article><p className="departure-kicker">備案</p><h3>{backup.title || '未命名備案'}</h3><p>{backup.routeName || '路線待填'}</p><p>{backup.startDate || '日期待填'} · {backup.days.length} 天 · {backup.members === null ? '人數未知' : `${backup.members} 人`}</p><button className="plan-button" onClick={() => onEditVariant('backup')}>編輯備案</button></article> : <article><p className="departure-kicker">備案</p><h3>留一份不同的安排</h3><p>從主計畫複製，原有內容會保留。</p></article>}</div>
      {backup && <div className="departure-day-comparison">{compareDepartureDays(main,backup).map(row => <details key={row.index} className="departure-check-group"><summary><span>第 {row.index+1} 天</span><span>{row.changed ? '安排有差異' : main.startDate !== backup.startDate || main.members !== backup.members ? '每日內容相同，日期／人數不同' : '每日安排相同'}</span></summary><div className="departure-comparison-columns"><article><h3>主計畫</h3><DaySummary day={row.main} calculation={mainCalculation.days[row.index]}/></article><article><h3>備案</h3><DaySummary day={row.backup} calculation={backupCalculation?.days[row.index]}/></article></div></details>)}</div>}
    </section>
    <DepartureNotices routeId={draft.referenceRouteId} officialUrl={template?.links.status} conditions={conditions} onUpdated={onUpdated} download={download}/>
  </fieldset>;
}
