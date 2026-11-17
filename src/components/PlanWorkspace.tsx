import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ChevronDown, ExternalLink, Map, Plus, Trash2, X } from 'lucide-react';
import type { LocalRoute } from '../local-route';
import { createPlanLeg, formatPlanTime } from '../plan/model';
import { originalLegReference } from '../plan/workspace';
import { buildPlanWaypoints, waypointForVisit } from '../plan/waypoints';
import waypointSeed from '../../data/plan-waypoints-daba.json';
import type { PlanCalculation, PlanDay, PlanDraft, PlanLeg, PlanTotal } from '../plan/types';
import type { DepartureEdit } from '../plan/departure';
import { planCopy as copy } from '../plan/copy';
import MapBoundary from './MapBoundary';
import './PlanWorkspace.css';
const PlanRouteView = lazy(() => import('./PlanRouteView'));

interface Props {
  draft: PlanDraft;
  calculation: PlanCalculation;
  localRoute: LocalRoute | null;
  enterAtItinerary: boolean;
  focusRequest?: DepartureEdit;
  onChangeDay: (id: string, change: Partial<PlanDay>) => void;
  onAddDay: () => string;
  onRemoveDay: (id: string) => void;
  onRemoveLeg: (dayId: string, legId: string) => void;
  renderResources: (day: PlanDay, index: number) => ReactNode;
}
const labelText = (label: string) => label.replace(/^第\s*\d+\s*天[｜|・·\s:：-]*/u, '');
const durationText = (total: PlanTotal) => {
  if (!total.complete && total.known === 0) return '待填';
  const hours = Math.floor(total.known / 60), minutes = total.known % 60;
  return `${total.complete ? '' : '已填 '}${hours ? `${hours} 小時` : ''}${minutes || !hours ? ` ${minutes} 分` : ''}${total.complete ? '' : ` · ${total.missing} 段待填`}`;
};
function NumericInput({ label, value, onChange, integer = false }: { label: string; value: number | null; onChange: (value: number | null) => void; integer?: boolean }) {
  return <label className="plan-field"><span>{label}</span><input type="number" min={0} max={1_000_000} step={integer ? 1 : 'any'} inputMode={integer ? 'numeric' : 'decimal'} value={value ?? ''} placeholder="待填" onChange={event => {
    const number = event.target.valueAsNumber;
    onChange(event.target.value === '' || !Number.isFinite(number) || number < 0 || number > 1_000_000 || integer && !Number.isInteger(number) ? null : number);
  }}/></label>;
}

export default function PlanWorkspace({ draft, calculation, localRoute, enterAtItinerary, focusRequest, onChangeDay, onAddDay, onRemoveDay, onRemoveLeg, renderResources }: Props) {
  const [activeId, setActiveId] = useState(focusRequest?.dayId || draft.days[0]?.id || '');
  const [selection, setSelection] = useState<Record<string, string | null>>({});
  const [mobileView, setMobileView] = useState<'itinerary' | 'route'>('itinerary');
  const workspace = useRef<HTMLElement>(null);
  const initialPosition = useRef(enterAtItinerary);
  const timeline = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!initialPosition.current || !window.matchMedia('(max-width: 760px)').matches) return;
    // Enter at the daily workflow on phones; route settings remain just above it.
    const frame = requestAnimationFrame(() => workspace.current?.scrollIntoView({ block: 'start', behavior: 'instant' }));
    return () => cancelAnimationFrame(frame);
  }, []);
  const dayIndex = Math.max(0, draft.days.findIndex(day => day.id === activeId));
  const day = draft.days[dayIndex], calculated = calculation.days[dayIndex];
  useEffect(() => {
    if (!focusRequest?.dayId || focusRequest.dayId !== day?.id) return;
    const frame = requestAnimationFrame(() => {
      const target = focusRequest.target === 'itinerary' ? timeline.current : timeline.current?.querySelector<HTMLDetailsElement>(`[data-departure-target="${focusRequest.target}"]`);
      if (!target) return;
      let parent: HTMLElement | null = target;
      while (parent && parent !== timeline.current) { if (parent instanceof HTMLDetailsElement) parent.open = true; parent = parent.parentElement; }
      const input = target.querySelector<HTMLElement>('input,textarea,select');
      input?.focus({preventScroll:true}); target.scrollIntoView({block:'start',behavior:'instant'});
    });
    return () => cancelAnimationFrame(frame);
  },[focusRequest,day?.id]);
  const waypoints = useMemo(() => buildPlanWaypoints(draft.days, draft.referenceRouteId, waypointSeed.waypoints), [draft.days, draft.referenceRouteId]);
  const selectedLegId = day?.legs.some(leg => leg.id === selection[day.id]) ? selection[day.id] : null;
  const selectLeg = (id: string) => {
    if (!day) return;
    setSelection(current => ({ ...current, [day.id]: id }));
    if (window.matchMedia('(min-width: 1001px)').matches) requestAnimationFrame(() => {
      const row = Array.from(timeline.current?.querySelectorAll<HTMLElement>('[data-leg-id]') || []).find(item => item.dataset.legId === id);
      row?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    });
  };
  const patchLeg = (legId: string, change: Partial<PlanLeg>) => {
    if (day) onChangeDay(day.id, { legs: day.legs.map(leg => leg.id === legId ? { ...leg, ...change } : leg) });
  };

  return <section ref={workspace} className="plan-workspace-root" data-departure-target="itinerary" aria-label="行程工作區">
    <div className="plan-day-navigation"><nav className="plan-day-tabs" aria-label="行程日期">{draft.days.map((item, index) => <button key={item.id} type="button" title={labelText(item.label) || '未命名'} aria-pressed={index === dayIndex} onClick={() => setActiveId(item.id)}><span>第 {index + 1} 天</span></button>)}</nav><button type="button" className="plan-button workspace-add-day" disabled={draft.days.length >= 30} onClick={() => setActiveId(onAddDay())}><Plus size={17}/>{copy.addDay}</button></div>
    <nav className="plan-mobile-views" aria-label="行程檢視"><button type="button" aria-pressed={mobileView === 'itinerary'} onClick={() => setMobileView('itinerary')}>行程</button><button type="button" aria-pressed={mobileView === 'route'} onClick={() => setMobileView('route')}><Map size={16}/>地圖</button></nav>
    <div className={`plan-workspace-grid mobile-${mobileView}`}>
      <section ref={timeline} className="plan-itinerary-pane" aria-labelledby="workspace-day-title">
        {day ? <>
          <header className="workspace-day-header"><div><p className="workspace-day-number">第 {dayIndex + 1} 天{calculated?.date ? ` · ${calculated.date}` : ''}</p><h2 id="workspace-day-title">{labelText(day.label) || '當日行程'}</h2></div><button type="button" className="plan-remove" aria-label={`${copy.removeDay} ${dayIndex + 1}`} onClick={() => onRemoveDay(day.id)}><Trash2 size={16}/></button></header>
          <div className="workspace-start"><label className="plan-field"><span>{copy.startTime}</span><input type="time" value={day.startTime} onChange={event => onChangeDay(day.id, { startTime: event.target.value })}/></label><div className="workspace-finish"><span>當日結束</span><strong>{formatPlanTime(calculated?.finish || null)}</strong></div></div>
          <p className="workspace-time-summary">移動 {calculated ? durationText(calculated.travelMinutes) : '待填'}{calculated && (calculated.restMinutes.known > 0 || !calculated.restMinutes.complete) && <> · 休息 {durationText(calculated.restMinutes)}</>}</p>
          {day.legs.some(leg => leg.restMinutes === null) && <div className="workspace-rest-pending"><span>{day.legs.filter(leg => leg.restMinutes === null).length} 段休息未設定</span><button type="button" onClick={() => onChangeDay(day.id, {legs:day.legs.map(leg => leg.restMinutes === null ? {...leg, restMinutes:0} : leg)})}>設為不安排休息</button></div>}
          <ol className="plan-timeline">{day.legs.map((leg, index) => {
            const timing = calculated?.legs[index], selected = leg.id === selectedLegId, reference = originalLegReference(draft, leg);
            const gap = index > 0 && day.legs[index - 1].to.trim() !== leg.from.trim();
            const fromPoint = waypointForVisit(waypoints, leg.id, 'from'), toPoint = waypointForVisit(waypoints, leg.id, 'to');
            const showArrival = selected || index === day.legs.length - 1 || leg.to.trim() !== day.legs[index + 1].from.trim();
            return <li key={leg.id} data-leg-id={leg.id} className={`plan-timeline-leg${selected ? ' is-selected' : ''}${gap ? ' has-gap' : ''}`}>
              {gap && <p className="workspace-gap">前段終點與本段起點不同，接續路程待確認。</p>}
              <button type="button" className="timeline-route-button" aria-pressed={selected} onClick={() => selected ? setSelection(current => ({...current, [day.id]:null})) : selectLeg(leg.id)} aria-controls={selected ? `leg-editor-${leg.id}` : undefined} aria-label={`編輯路段 ${index + 1}：${leg.from || '起點待填'}至${leg.to || '終點待填'}`}><span className="timeline-time">{formatPlanTime(timing?.depart || null)}</span><span className="timeline-waypoint-number" aria-label={`路點 ${fromPoint?.number}`}>{fromPoint?.number}</span><span className="timeline-place">{leg.from || '起點待填'}</span></button>
              <div className="timeline-segment-body">
                <div className="timeline-segment-summary"><span>{leg.minutes === null ? '移動時間待填' : `移動 ${leg.minutes} 分`}</span>{leg.distanceKm !== null && <span>{leg.distanceKm} km</span>}{leg.restMinutes !== 0 && <span className="timeline-rest-tag">{leg.restMinutes === null ? '休息待填' : `抵達後休息 ${leg.restMinutes} 分`}</span>}</div>
                {selected && <div className="timeline-selected-editor" id={`leg-editor-${leg.id}`}>
                  <div className="timeline-editor-heading"><strong>路段 {index + 1} · {leg.to || '終點待填'}</strong><button type="button" aria-label="收合路段編輯" onClick={() => setSelection(current => ({...current, [day.id]:null}))}><X size={16}/></button></div>
                  <div className="timeline-quick-fields"><NumericInput label="本隊移動（分）" value={leg.minutes} integer onChange={minutes => patchLeg(leg.id, { minutes })}/>{leg.restMinutes === 0 ? <button type="button" className="timeline-add-rest" onClick={() => patchLeg(leg.id, {restMinutes:null})}><Plus size={15}/>加入休息</button> : <div className="timeline-rest-field"><NumericInput label="抵達後休息（分）" value={leg.restMinutes} integer onChange={restMinutes => patchLeg(leg.id, { restMinutes })}/><button type="button" aria-label="移除休息" onClick={() => patchLeg(leg.id, {restMinutes:0})}><X size={15}/></button></div>}</div>
                  {reference ? <p className="timeline-reference"><a href={reference.sourceUrl} target="_blank" rel="noopener noreferrer">{reference.sourceName || '林業署'}參考 {reference.minutes} 分<ExternalLink size={13}/></a>{leg.minutes !== reference.minutes && <span>本隊已調整</span>}</p> : <p className="timeline-reference">{leg.sourceUrl ? <a href={leg.sourceUrl} target="_blank" rel="noopener noreferrer">路段來源<ExternalLink size={13}/></a> : '參考時間尚未收錄'}</p>}
                  <details className="timeline-extra"><summary>路點、距離與來源<ChevronDown size={16}/></summary><div className="timeline-name-fields"><label className="plan-field"><span>{copy.from}</span><input value={leg.from} onChange={event => patchLeg(leg.id, { from: event.target.value })}/></label><label className="plan-field"><span>{copy.to}</span><input value={leg.to} onChange={event => patchLeg(leg.id, { to: event.target.value })}/></label></div><div className="plan-grid"><NumericInput label={copy.distance} value={leg.distanceKm} onChange={distanceKm => patchLeg(leg.id, { distanceKm })}/><label className="plan-field"><span>{copy.load}</span><select value={leg.load} onChange={event => patchLeg(leg.id, { load: event.target.value as PlanLeg['load'] })}><option value="full">{copy.full}</option><option value="light">{copy.light}</option></select></label><NumericInput label={copy.ascent} value={leg.ascentM} onChange={ascentM => patchLeg(leg.id, { ascentM })}/><NumericInput label={copy.descent} value={leg.descentM} onChange={descentM => patchLeg(leg.id, { descentM })}/><label className="plan-field wide"><span>{copy.source}</span><input type="url" value={leg.sourceUrl} onChange={event => patchLeg(leg.id, { sourceUrl: event.target.value })}/></label></div>{reference && <p className="workspace-source-date">參考來源查閱：{reference.checkedAt.slice(0, 10)} · 不是當日路況或本隊配速。</p>}<button type="button" className="plan-remove" onClick={() => onRemoveLeg(day.id, leg.id)}><Trash2 size={15}/>{copy.removeLeg} {index + 1}</button></details>
                </div>}
                {showArrival && <p className="timeline-arrival"><ArrowDown size={15}/><span className="timeline-waypoint-number" aria-label={`路點 ${toPoint?.number}`}>{toPoint?.number}</span><strong>{leg.to || '終點待填'}</strong><span className="timeline-arrival-time">抵達 {formatPlanTime(timing?.arrive || null)}</span></p>}
              </div>
            </li>;
          })}</ol>
          {!day.legs.length && <p className="workspace-empty">尚無路段，新增第一段開始安排。</p>}
          <button type="button" className="plan-button workspace-add-leg" disabled={day.legs.length >= 40} onClick={() => {
            const leg = createPlanLeg(); leg.from = day.legs.at(-1)?.to || '';
            onChangeDay(day.id, { legs: [...day.legs, leg] }); setSelection(current => ({ ...current, [day.id]: leg.id }));
          }}><Plus size={17}/>{copy.addLeg}</button>
          <p className="workspace-unknown-note">點選路段修改時間，需要時再加入休息。</p>
          <section className="workspace-resources" aria-label="當日取水與過夜"><h3>取水與過夜</h3><dl><div><dt>主水源</dt><dd>{day.water.primary || '待補'}<small>{copy.waterStates[day.water.availability]}{day.water.reportedAt ? ` · ${day.water.reportedAt}` : ' · 回報日期未填'}</small></dd></div><div><dt>過夜／返回</dt><dd>{day.lodging.name || '待補'}<small>{copy.reservationStates[day.lodging.reservation]}</small></dd></div><div><dt>撤退決策</dt><dd>{day.retreat.decisionPoint || '待補'}<small>{day.retreat.confirmed ? '已人工核對' : '尚未核對'}{day.retreat.deadline ? ` · ${day.retreat.deadline}` : ''}</small></dd></div></dl><details className="workspace-day-details" key={day.id}><summary>水源、住宿與撤退安排<ChevronDown size={17}/></summary>{renderResources(day, dayIndex)}</details></section>
        </> : <div className="workspace-empty"><h2 id="workspace-day-title">新增每日行程</h2><p>這份草稿尚無日期安排。</p><button type="button" className="plan-button" onClick={() => setActiveId(onAddDay())}><Plus size={17}/>{copy.addDay}</button></div>}
      </section>
      <aside className="plan-route-pane" aria-label="路線對照"><MapBoundary><Suspense fallback={<div className="map-loading" role="status"><p>正在載入路線對照，行程可先編輯。</p></div>}><PlanRouteView draftId={draft.id} title={draft.title} routeName={draft.routeName} referenceRouteId={draft.referenceRouteId} day={day || null} dayIndex={dayIndex} selectedLegId={selectedLegId} onSelectLeg={selectLeg} localRoute={localRoute} waypoints={waypoints}/></Suspense></MapBoundary></aside>
    </div>
  </section>;
}
