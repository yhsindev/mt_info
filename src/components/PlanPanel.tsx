import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Download, ExternalLink, FileUp, LoaderCircle, Save, Trash2 } from 'lucide-react';
import type { ConditionsResponse } from '../shared/conditions';
import { ageConditions } from '../shared/conditions-freshness';
import { useClock } from '../hooks';
import { formatTime } from '../utils';
import { calculatePlan, createBlankPlan, createPlanDay, parsePlanDraft } from '../plan/model';
import { PLAN_STORAGE_KEY, readPlanStorage, writePlanStorage } from '../plan/storage';
import { createPlanFromTemplate, PLAN_TEMPLATES } from '../plan/catalog';
import PlanCatalog from './PlanCatalog';
import PlanWorkspace from './PlanWorkspace';
import PlanDeparture from './PlanDeparture';
import { createPlanBackup, PLAN_BACKUP_KEY, readPlanBackup, writePlanBackup } from '../plan/backup-storage';
import type { DepartureEdit } from '../plan/departure';
import type { LocalRoute } from '../local-route';
import { exportFilename } from '../plan/filename';
import { planCopy as copy } from '../plan/copy';
import type { PlanAdvisory, PlanDay, PlanDayCalculation, PlanDraft, PlanTotal } from '../plan/types';
import '../plan/plan.css';

export interface PlanPanelProps {
  onClose: () => void;
  onRegisterNavigation?: (guard: ((proceed: () => void) => void) | null) => void;
  localRouteName: string | null;
  localRoute: LocalRoute | null;
  onImportGpx: () => void;
  onViewRoute: (referenceRouteId: string | null) => void;
  conditions: ConditionsResponse | null;
  conditionsLoading: boolean;
  conditionsError: string | null;
  onRetryConditions: () => void;
}
interface Confirmation { title: string; message: string; label: string; action: () => void }
interface Notice { text: string; error: boolean }
const MAX_IMPORT_BYTES = 512 * 1024;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function totalValue(total: PlanTotal, unit: string) {
  if (!total.complete && total.known === 0) return <><span>{copy.unknown}</span><small>{total.missing} {copy.missing}</small></>;
  return <><span>{total.known.toLocaleString('zh-TW', { maximumFractionDigits: 2 })} {unit}</span>{!total.complete && <small>{copy.known} · {total.missing} {copy.missing}</small>}</>;
}
function Field({ label, value, onChange, type = 'text', multiline = false, wide = false, placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; multiline?: boolean; wide?: boolean; placeholder?: string }) {
  return <label className={`plan-field${wide ? ' wide' : ''}`}><span>{label}</span>{multiline ? <textarea value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} rows={3}/> : <input type={type} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder}/>}</label>;
}
function NumberField({ label, value, onChange, integer = false, min = 0 }: { label: string; value: number | null; onChange: (value: number | null) => void; integer?: boolean; min?: number }) {
  return <label className="plan-field"><span>{label}</span><input type="number" inputMode={integer ? 'numeric' : 'decimal'} min={min} max={1_000_000} step={integer ? 1 : 'any'} value={value ?? ''} placeholder={copy.unknown} onChange={event => { const number = event.target.valueAsNumber; onChange(event.target.value === '' || !Number.isFinite(number) || number < min || number > 1_000_000 || integer && !Number.isInteger(number) ? null : number); }}/></label>;
}
function SelectField<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Record<T, string>; onChange: (value: T) => void }) {
  return <label className="plan-field"><span>{label}</span><select value={value} onChange={event => onChange(event.target.value as T)}>{(Object.keys(options) as T[]).map(key => <option key={key} value={key}>{options[key]}</option>)}</select></label>;
}
function Section({ title, children, open = false, target }: { title: string; children: ReactNode; open?: boolean; target?: string }) {
  return <details className="plan-section" data-departure-target={target} open={open}><summary>{title}</summary><div className="plan-section-body">{children}</div></details>;
}
function Subsection({ title, children, open = false, target }: { title: string; children: ReactNode; open?: boolean; target?: string }) {
  return <details className="plan-subsection" data-departure-target={target} open={open}><summary>{title}</summary><div className="plan-subsection-body">{children}</div></details>;
}
function Source({ url }: { url: string }) {
  if (!/^https?:\/\//i.test(url)) return null;
  return <a className="plan-source" href={url} target="_blank" rel="noopener noreferrer">查看來源<ExternalLink size={14}/></a>;
}

export default function PlanPanel({ onClose, onRegisterNavigation, localRouteName, localRoute, onImportGpx, conditions, conditionsLoading, conditionsError, onRetryConditions }: PlanPanelProps) {
  const [initial] = useState(() => readPlanStorage());
  const [draft, setDraft] = useState<PlanDraft>(() => initial.draft || createBlankPlan());
  const [backupState,setBackupState] = useState(readPlanBackup);
  const [activeVariant,setActiveVariant] = useState<'main'|'backup'>('main');
  const variantRef = useRef(activeVariant), mainRef = useRef(draft);
  variantRef.current = activeVariant;
  if (activeVariant === 'main') mainRef.current = draft;
  const [departureEdit,setDepartureEdit] = useState<DepartureEdit | undefined>();
  const [blocked, setBlocked] = useState(!!initial.error);
  const [saveState, setSaveState] = useState({ savedAt: initial.draft?.updatedAt || null, error: initial.error, saving: false });
  const [notice, setNotice] = useState<Notice | null>(null), [pending, setPending] = useState<Confirmation | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'catalog' | 'editor' | 'departure'>(() => initial.draft ? 'editor' : 'catalog');
  const [exportJump, setExportJump] = useState(0);
  const exportRequested = useRef(false);
  const page = useRef<HTMLElement>(null), cancel = useRef<HTMLButtonElement>(null), importInput = useRef<HTMLInputElement>(null);
  const draftRef = useRef(draft), blockedRef = useRef(blocked);
  const dirty = useRef(false), hasDraft = useRef(!!initial.draft);
  draftRef.current = draft; blockedRef.current = blocked;
  const now = useClock();
  const currentConditions = useMemo(() => ageConditions(conditions, now, !!conditionsError), [conditions, now, conditionsError]);
  const routeItems = currentConditions?.trails.items.filter(item => !!draft.referenceRouteId && item.trailId === draft.referenceRouteId) || [];
  const isDaba = draft.referenceRouteId === '027';
  const currentTemplate = PLAN_TEMPLATES.find(template => template.routeName === draft.routeName);
  const calculation = useMemo(() => calculatePlan(draft), [draft]);

  const persistNow = useCallback(() => {
    if (!hasDraft.current) return true;
    if (blockedRef.current) return false;
    const saved = variantRef.current === 'backup' ? writePlanBackup(mainRef.current.id,draftRef.current) : writePlanStorage(draftRef.current);
    if (!saved.error) dirty.current = false;
    setSaveState({ ...saved, saving: false });
    return !saved.error;
  }, []);
  useEffect(() => {
    page.current?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
    return () => {
      if (hasDraft.current && !blockedRef.current) {
        if (variantRef.current === 'backup') writePlanBackup(mainRef.current.id,draftRef.current);
        else writePlanStorage(draftRef.current);
      }
    };
  }, []);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasDraft.current || !dirty.current) return;
      if (!blockedRef.current) {
        const result = variantRef.current === 'backup' ? writePlanBackup(mainRef.current.id,draftRef.current) : writePlanStorage(draftRef.current);
        if (!result.error) { dirty.current = false; return; }
      }
      event.preventDefault(); event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);
  useEffect(() => {
    if (blocked || !hasDraft.current) return;
    setSaveState(state => ({ ...state, saving: true }));
    const timer = setTimeout(persistNow, 350);
    return () => clearTimeout(timer);
  }, [draft, blocked, persistNow]);
  useEffect(() => { if (pending) cancel.current?.focus(); }, [pending]);
  useEffect(() => { page.current?.scrollTo({ top: 0 }); }, [view]);
  useEffect(() => {
    if (view !== 'editor' || !exportRequested.current) return;
    const frame = requestAnimationFrame(() => {
      if (!exportRequested.current) return;
      const target = page.current?.querySelector<HTMLElement>('#plan-export-section');
      if (!target) return;
      exportRequested.current = false;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
    return () => cancelAnimationFrame(frame);
  }, [view, exportJump]);

  const updateDraft = (change: (current: PlanDraft) => PlanDraft) => { hasDraft.current = true; dirty.current = true; setDraft(current => ({ ...change(current), updatedAt: new Date().toISOString() })); };
  const patch = <K extends keyof PlanDraft>(key: K, value: PlanDraft[K]) => updateDraft(current => ({ ...current, [key]: value }));
  const patchDay = (id: string, changes: Partial<PlanDay>) => updateDraft(current => ({ ...current, days: current.days.map(day => day.id === id ? { ...day, ...changes } : day) }));
  const confirm = (title: string, message: string, action: () => void, label: string = copy.confirmDelete) => setPending({ title, message, action, label });
  const requestLeave = useCallback((proceed: () => void) => {
    if (blockedRef.current && !dirty.current || !blockedRef.current && persistNow()) { proceed(); return; }
    setPending({ title: copy.leaveUnsavedTitle, message: copy.leaveUnsavedMessage, action: proceed, label: copy.closeAnyway });
  }, [persistNow]);
  useEffect(() => { onRegisterNavigation?.(requestLeave); return () => onRegisterNavigation?.(null); }, [onRegisterNavigation, requestLeave]);
  const requestClose = () => requestLeave(onClose);
  const jumpToExport = () => {
    exportRequested.current = true;
    setView('editor');
    setExportJump(value => value + 1);
  };
  const showView = (next: 'catalog' | 'editor' | 'departure') => {
    exportRequested.current = false;
    if (next !== 'editor') setDepartureEdit(undefined);
    setView(next);
    page.current?.scrollTo({ top: 0, behavior: 'instant' });
  };
  const main = activeVariant === 'main' ? draft : mainRef.current;
  const backup = activeVariant === 'backup' ? draft : backupState.backup?.parentId === main.id ? backupState.backup.draft : null;
  const backupError = backupState.error || (backupState.backup && backupState.backup.parentId !== main.id ? '本機保存的是其他主計畫的備案，請先下載保留，再清除並建立這次的備案。' : null);
  const switchVariant = (next:'main'|'backup') => {
    if (next === variantRef.current) { showView('editor'); return; }
    if (!persistNow()) { setNotice({text:'尚未保存目前方案，請先下載 JSON 備份，再切換。',error:true}); return; }
    if (next === 'backup' && !backup) return;
    if (variantRef.current === 'backup') setBackupState(state => ({...state,backup:{parentId:mainRef.current.id,draft:draftRef.current}}));
    else mainRef.current = draftRef.current;
    const target = next === 'main' ? mainRef.current : backup!;
    variantRef.current = next; setActiveVariant(next); draftRef.current = target; setDraft(target);
    setSaveState({savedAt:target.updatedAt,error:null,saving:false}); setNotice(null); setDepartureEdit(undefined); showView('editor');
  };
  const createBackup = () => {
    const create = () => {
      if (!hasDraft.current) { hasDraft.current = true; dirty.current = true; }
      if (!persistNow()) { setNotice({text:copy.saveBeforeLeaving,error:true}); return; }
      try {
        const next = createPlanBackup(mainRef.current), result = writePlanBackup(mainRef.current.id,next);
        if (result.error) { setNotice({text:result.error,error:true}); return; }
        if (variantRef.current === 'backup') { draftRef.current = next; setDraft(next); }
        setBackupState(readPlanBackup()); setNotice({text:'已建立獨立備案。主計畫保持，可在下方比較或編輯備案。',error:false});
      } catch { setNotice({text:'目前主計畫格式尚無法建立備案，請先確認欄位或下載 JSON。',error:true}); }
    };
    if (backup) confirm('重新建立備案？','這會以主計畫取代目前備案。主計畫保持；需要保留備案時請先下載 JSON。',create,'確認取代備案');
    else create();
  };
  const clearBackup = () => confirm('清除原有備案？','請先下載原有備案。清除後無法還原，主計畫保持。',() => {
    try { window.localStorage.removeItem(PLAN_BACKUP_KEY); setBackupState(readPlanBackup()); }
    catch { setNotice({text:'無法清除備案，原始內容保持。',error:true}); }
  });
  const editFromDeparture = (request?: Omit<DepartureEdit,'revision'>) => {
    exportRequested.current = false;
    setDepartureEdit(request ? {...request,revision:Date.now()} : undefined); setView('editor');
  };
  useEffect(() => {
    if (view === 'departure') page.current?.querySelector<HTMLElement>('h1')?.focus({preventScroll:true});
    if (view !== 'editor' || !departureEdit || departureEdit.dayId) return;
    const frame = requestAnimationFrame(() => {
      const target = page.current?.querySelector<HTMLDetailsElement>(`[data-departure-target="${departureEdit.target}"]`);
      if (!target) return;
      if (target instanceof HTMLDetailsElement) target.open = true;
      target.querySelector<HTMLElement>('input,textarea,select,button')?.focus({preventScroll:true}); target.scrollIntoView({block:'start',behavior:'instant'});
    });
    return () => cancelAnimationFrame(frame);
  },[view,departureEdit]);
  const replaceDraft = (next: PlanDraft) => {
    if (blockedRef.current) {
      try { window.localStorage.removeItem(PLAN_STORAGE_KEY); }
      catch { setNotice({ text: copy.storageRemoveFailed, error: true }); return; }
    }
    blockedRef.current = false; setBlocked(false);
    hasDraft.current = true; dirty.current = true; draftRef.current = next; setDraft(next); setNotice(null); setView('editor');
    persistNow();
  };
  const requestReplacement = (next: PlanDraft) => confirm(copy.replaceTitle, copy.replaceMessage, () => replaceDraft(next), copy.confirm);
  const startFromGpx = () => {
    if (!localRouteName) return;
    const next = createBlankPlan(); next.title = localRouteName; next.routeName = localRouteName;
    requestReplacement(next);
  };
  const beforeMapAction = (action: () => void) => {
    if (!persistNow()) { setNotice({ text: copy.saveBeforeLeaving, error: true }); return; }
    action();
  };
  const importJson = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error(copy.importTooLarge);
      const text = await file.text();
      if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) throw new Error(copy.importTooLarge);
      const next = parsePlanDraft(JSON.parse(text));
      requestReplacement(next);
    } catch (error) { setNotice({ text: `${copy.importFailed} ${errorMessage(error)}`, error: true }); }
  };
  const exportPlan = async (kind: string) => {
    if (!kind || busy) return;
    let printWindow: Window | null = null;
    if (kind === 'print') {
      printWindow = window.open('', '_blank');
      if (!printWindow) { setNotice({ text: copy.popupFailed, error: true }); return; }
      printWindow.opener = null;
    }
    setBusy(true); setNotice(null);
    try {
      const current = kind === 'json' ? draftRef.current : parsePlanDraft(draftRef.current);
      if (kind === 'json') {
        downloadBlob(new Blob([JSON.stringify(current, null, 2)], { type: 'application/json;charset=utf-8' }), exportFilename(current, 'json'));
      } else {
        const exporter = await import('../plan/export');
        if (kind === 'word') downloadBlob(await exporter.exportPlanDocx(current), exporter.exportFilename(current, 'docx'));
        if (kind === 'print' && printWindow) {
          printWindow.document.open(); printWindow.document.write(exporter.createPlanPrintHtml(current)); printWindow.document.close();
          const target = printWindow;
          await target.document.fonts.ready;
          target.focus(); target.print();
        }
      }
    } catch (error) { printWindow?.close(); setNotice({ text: `${copy.exportFailed} ${errorMessage(error)}`, error: true }); }
    finally { setBusy(false); }
  };
  const attachAdvisories = () => {
    const capturedAt = new Date().toISOString(), feed = currentConditions?.trails;
    if (!feed) return;
    const snapshots: PlanAdvisory[] = routeItems.map(item => ({ id: item.id, title: item.headline ? `${item.name}｜${item.headline}` : item.name, description: item.description || item.headline, publisher: item.manager || item.source.name, sourceUrl: item.source.url, issuedAt: item.issuedAt, closureDate: item.closureDate, expectedOpeningDate: item.expectedOpeningDate, capturedAt, sourceCheckedAt: feed.checkedAt, sourceStatus: feed.status }));
    updateDraft(current => ({ ...current, advisories: [...current.advisories.filter(item => !snapshots.some(snapshot => snapshot.id === item.id)), ...snapshots] }));
    setNotice({ text: copy.attached, error: false });
  };
  const exportSelect = (label: string) => <select className="plan-export-select" aria-label={label} value="" disabled={busy || !!pending} onChange={event => void exportPlan(event.target.value)}><option value="">{copy.export}</option><option value="json">{copy.json}</option><option value="word">{copy.word}</option><option value="print">{copy.print}</option></select>;
  const saveLabel = saveState.saving ? copy.saving : saveState.error ? copy.storageFailed : saveState.savedAt ? `${copy.saved} · ${formatTime(saveState.savedAt)}` : copy.notSaved;


  return <main id="tool-main" tabIndex={-1} ref={page} className={`plan-page${view === 'editor' ? ' plan-editing' : ''}`} aria-labelledby="plan-title" onKeyDown={event => { if (event.key === 'Escape' && pending) { event.preventDefault(); setPending(null); } }}>
    <div className="plan-shell">
      <header className="plan-header"><div className="plan-heading"><h1 id="plan-title" tabIndex={-1}>{view === 'departure' ? '出發吧！' : copy.title}</h1></div>
      <nav className="plan-view-nav" aria-label={copy.viewNav}>
        <button type="button" disabled={!!pending || busy} aria-label={copy.browseTemplates} aria-pressed={view === 'catalog'} onClick={() => showView('catalog')}><span className="plan-step-number" aria-hidden="true">1</span><span>{copy.browseTemplates}</span></button>
        <button type="button" disabled={!!pending || busy} aria-label={copy.editDraft} aria-pressed={view === 'editor'} onClick={() => showView('editor')}><span className="plan-step-number" aria-hidden="true">2</span><span>{copy.editDraft}</span></button>
        <button type="button" className="plan-export-jump" disabled={!!pending || busy} aria-label={copy.saveExportJump} aria-controls={view === 'editor' ? 'plan-export-section' : undefined} onClick={jumpToExport}><span className="plan-step-number" aria-hidden="true">3</span><span>{copy.saveExportJump}</span></button>
      </nav><button type="button" className="plan-button" onClick={requestClose}>{copy.backToTool}</button></header>
      <div className="plan-body">
        {blocked && <div className="plan-notice is-warning" role="alert"><strong>{copy.storageBlocked}</strong><p className="plan-error-text">{initial.error}</p>{initial.raw !== null && <button className="plan-button" onClick={() => downloadBlob(new Blob([initial.raw || ''], { type: 'application/json;charset=utf-8' }), copy.backupName)}><Download size={16}/>{copy.backup}</button>}</div>}
        {saveState.error && !blocked && <div className="plan-notice is-warning" role="alert"><strong>{copy.storageFailed}</strong><p className="plan-error-text">{saveState.error}</p></div>}
        {notice && <div className={`plan-notice${notice.error ? ' is-warning' : ''}`} role={notice.error ? 'alert' : 'status'}>{notice.text}</div>}
        {busy && <p className="plan-save-state" role="status"><LoaderCircle size={15} className="spin"/>{copy.working}</p>}
        {pending && <section className="plan-confirm" role="alertdialog" aria-modal="false" aria-labelledby="plan-confirm-title" aria-describedby="plan-confirm-message"><h2 id="plan-confirm-title">{pending.title}</h2><p id="plan-confirm-message">{pending.message}</p><div className="plan-toolbar"><button type="button" className="plan-button" ref={cancel} onClick={() => setPending(null)}>{copy.cancel}</button><button type="button" className="plan-button is-primary" onClick={() => { const action = pending.action; setPending(null); action(); }}>{pending.label}</button></div></section>}
        {view === 'catalog' && activeVariant === 'backup' && <p className="departure-note">目前正在為備案選擇路線，套用時會取代備案；主計畫保持。</p>}
        {view === 'catalog' && <><details className="plan-section plan-catalog-start"><summary>{copy.blankAndImport}</summary><div className="plan-section-body"><div className="plan-toolbar plan-catalog-actions"><button className="plan-button" disabled={!!pending || busy} onClick={() => requestReplacement(createBlankPlan())}>{copy.blank}</button><button className="plan-button" disabled={!!pending || busy} onClick={() => beforeMapAction(onImportGpx)}><FileUp size={16}/>{copy.importGpx}</button><button className="plan-button" disabled={!!pending || busy} onClick={() => importInput.current?.click()}>{copy.importJson}</button>{localRouteName && <button className="plan-button" disabled={!!pending || busy} onClick={startFromGpx}>{copy.useGpx}</button>}</div></div></details><PlanCatalog currentRouteName={draft.routeName} disabled={!!pending || busy} onUseTemplate={id => requestReplacement(createPlanFromTemplate(id))}/></>}
        {view === 'editor' && <fieldset className="plan-editor" disabled={!!pending || busy}>
          <div className="plan-variant-toolbar"><span className="departure-kicker">目前編輯：{activeVariant === 'main' ? '主計畫' : '備案'}</span>{backup && <button type="button" className="plan-button" onClick={() => switchVariant(activeVariant === 'main' ? 'backup' : 'main')}>切換至{activeVariant === 'main' ? '備案' : '主計畫'}</button>}<button type="button" className="plan-button is-primary plan-departure-entry" onClick={() => showView('departure')}>出發吧！</button></div>
          <div className="workspace-plan-heading"><div className="workspace-title-block"><h2 title={draft.routeName}>{draft.title || draft.routeName || '未命名計畫'}</h2><div className="workspace-plan-summary"><span>{draft.days.length} 天</span><span>{copy.totalDistance}<strong>{totalValue(calculation.distanceKm, copy.km)}</strong></span><span>已規劃<strong>{totalValue(calculation.totalMinutes, copy.minutesUnit)}</strong></span></div></div><Field label={copy.startDate} value={draft.startDate} onChange={value => patch('startDate', value)} type="date"/></div>
          {currentTemplate?.planningReview && <div className="plan-feasibility-review" role="note" data-testid="plan-feasibility-review"><AlertTriangle size={18} aria-hidden="true"/><div><strong>{currentTemplate.planningReady === false ? '這份範本的分日已暫停套用' : '這份範本需要重新審查'}</strong><p>既有草稿可編輯；請重新核對分日、宿營與時間。</p><details><summary>查看審查原因與公告</summary><p>{currentTemplate.planningReview}</p>{currentTemplate.accessNotice && <p>{currentTemplate.accessNotice.text} <a href={currentTemplate.accessNotice.sourceUrl} target="_blank" rel="noopener noreferrer">查看官方公告<ExternalLink size={13} aria-hidden="true"/></a></p>}</details></div></div>}
          <PlanWorkspace key={draft.id} enterAtItinerary={!departureEdit && !exportRequested.current && !currentTemplate?.planningReview} focusRequest={departureEdit} draft={draft} calculation={calculation} localRoute={draft.referenceRouteId === null && localRoute?.name === draft.routeName ? localRoute : null} onChangeDay={patchDay} onAddDay={() => {
            const next = createPlanDay(draft.days.length + 1);
            updateDraft(current => ({ ...current, days: [...current.days, next] })); return next.id;
          }} onRemoveDay={id => confirm(copy.removeDayTitle, copy.removeDayMessage, () => updateDraft(current => ({ ...current, days: current.days.filter(day => day.id !== id) })))} onRemoveLeg={(dayId, legId) => confirm(copy.removeLegTitle, copy.removeLegMessage, () => updateDraft(current => ({ ...current, days: current.days.map(day => day.id === dayId ? { ...day, legs: day.legs.filter(leg => leg.id !== legId) } : day) })))} renderResources={(day, index) => <DayPlanningDetails day={day} calculation={calculation.days[index]} onChange={changes => patchDay(day.id, changes)}/>}/>
          <div className="workspace-secondary">
          <Section title={copy.basics} target="basics"><div className="plan-grid"><Field label={copy.planTitle} value={draft.title} onChange={value => patch('title', value)} wide/><Field label={copy.routeName} value={draft.routeName} onChange={value => updateDraft(current => ({ ...current, routeName: value, referenceRouteId: value === current.routeName ? current.referenceRouteId : null }))} wide/><NumberField label={copy.members} value={draft.members} onChange={value => patch('members', value)} integer/><Field label={copy.leader} value={draft.leader} onChange={value => patch('leader', value)}/><Field label={copy.leaderPhone} value={draft.leaderPhone} onChange={value => patch('leaderPhone', value)} type="tel"/><Field label={copy.keeper} value={draft.keeper} onChange={value => patch('keeper', value)}/><Field label={copy.keeperPhone} value={draft.keeperPhone} onChange={value => patch('keeperPhone', value)} type="tel"/><Field label={copy.checkInPlan} value={draft.checkInPlan} onChange={value => patch('checkInPlan', value)} multiline wide/><Field label={copy.overdueAt} value={draft.overdueAt} onChange={value => patch('overdueAt', value)} type="datetime-local" wide/></div></Section>
          {currentTemplate && <Section title="路線來源與申請"><div className="plan-official-links"><a href={currentTemplate.links.status} target="_blank" rel="noopener noreferrer">{copy.routeStatus}<ExternalLink size={14}/></a>{currentTemplate.links.beds && <a href={currentTemplate.links.beds} target="_blank" rel="noopener noreferrer">{copy.bedsCheck}<ExternalLink size={14}/></a>}{currentTemplate.links.application && <a href={currentTemplate.links.application} target="_blank" rel="noopener noreferrer">{copy.applyCheck}<ExternalLink size={14}/></a>}<small>{copy.officialCheckNote}</small></div>{currentTemplate.sourceUrls.map(url => <Source key={url} url={url}/>)}</Section>}
          <Section title={copy.teamNotes} target="notes"><div className="plan-grid"><Field label={copy.gear} value={draft.gear} onChange={value => patch('gear', value)} multiline wide/><Field label={copy.communication} value={draft.communication} onChange={value => patch('communication', value)} multiline wide/><Field label={copy.notes} value={draft.notes} onChange={value => patch('notes', value)} multiline wide/><Field label={copy.reviewNotes} value={draft.reviewNotes} onChange={value => patch('reviewNotes', value)} multiline wide/></div></Section>
          {draft.referenceRouteId && <Section title={isDaba ? copy.currentAdvisory : copy.routeAdvisory}><p className="plan-help">{copy.snapshotNote}</p>{conditionsLoading && <p role="status">{copy.advisoryLoading}</p>}{conditionsError && <p className="plan-reference-note">{copy.advisoryFailed}</p>}{currentConditions && <p className="plan-help plan-meta">{copy.states[currentConditions.trails.status]} · {copy.checked}：{formatTime(currentConditions.trails.checkedAt)}</p>}{routeItems.length ? routeItems.map(item => <article key={item.id} className="plan-advisory"><h3>{item.headline || item.name}</h3><p className="plan-help plan-meta">{item.name} · {copy.published}：{formatTime(item.issuedAt)}</p><p>{item.description || item.headline}</p><Source url={item.source.url}/></article>) : !conditionsLoading && <p>{copy.advisoryMissing}</p>}<div className="plan-toolbar"><button type="button" className="plan-button" disabled={conditionsLoading} onClick={onRetryConditions}>{copy.retry}</button><button type="button" className="plan-button" disabled={conditionsLoading || !routeItems.length} onClick={attachAdvisories}>{copy.attach}</button></div></Section>}
          <Section title={`${copy.snapshot} · ${draft.advisories.length}`}><p className="plan-help">{copy.snapshotNote}</p>{!draft.advisories.length && <p>{copy.noSnapshot}</p>}{draft.advisories.map(item => <article className="plan-advisory" key={item.id}><h3>{item.title}</h3><p className="plan-meta">{item.publisher}</p><p>{item.description}</p><dl className="plan-advisory-times"><div><dt>{copy.published}</dt><dd>{formatTime(item.issuedAt)}</dd></div><div><dt>{copy.checked}</dt><dd>{formatTime(item.sourceCheckedAt)}</dd></div><div><dt>{copy.captured}</dt><dd>{formatTime(item.capturedAt)}</dd></div><div><dt>{copy.sourceState}</dt><dd>{copy.states[item.sourceStatus]}</dd></div><div><dt>{copy.closureDate}</dt><dd>{formatTime(item.closureDate)}</dd></div><div><dt>{copy.expectedOpening}</dt><dd>{formatTime(item.expectedOpeningDate)}</dd></div></dl><Source url={item.sourceUrl}/><button className="plan-button" onClick={() => patch('advisories', draft.advisories.filter(snapshot => snapshot.id !== item.id))}>{copy.removeSnapshot}</button></article>)}</Section>
          <Section title={`${copy.review} · ${calculation.issues.length}`}><p className="plan-help">{copy.reviewNote}</p>{calculation.issues.length ? <ul className="plan-issue-list">{calculation.issues.map((issue, index) => <li key={`${issue.id}-${index}`}>{issue.dayId ? `第 ${draft.days.findIndex(day => day.id === issue.dayId) + 1} 天：` : ''}{issue.message}</li>)}</ul> : <p>{copy.noIssues}</p>}</Section>
          <section id="plan-export-section" className="plan-export-section" tabIndex={-1} aria-labelledby="plan-export-title">
            <h2 id="plan-export-title">{copy.exportSection}</h2>
            <p className="plan-help">{copy.localOnly}</p>
            <div className="plan-toolbar"><button type="button" className="plan-button" onClick={() => importInput.current?.click()}><FileUp size={16}/>{copy.importJson}</button>{exportSelect(`${copy.export}（內容區）`)}</div>
          </section>
          </div>
          <div className="plan-toolbar plan-danger-toolbar"><button type="button" className="plan-button is-danger" onClick={() => confirm(copy.clearTitle, copy.clearMessage, () => {
            try { window.localStorage.removeItem(variantRef.current === 'backup' ? PLAN_BACKUP_KEY : PLAN_STORAGE_KEY); }
            catch { setNotice({ text: copy.storageRemoveFailed, error: true }); return; }
            replaceDraft(createBlankPlan());
          }, copy.confirmDelete)}><Trash2 size={16}/>{copy.clear}</button></div>
        </fieldset>}
        {view === 'departure' && <PlanDeparture draft={draft} main={main} backup={backup} active={activeVariant} disabled={!!pending || busy} backupError={backupError} backupRaw={backupState.raw} onCreateBackup={createBackup} onClearBackup={clearBackup} onEdit={editFromDeparture} onEditVariant={switchVariant} conditions={currentConditions} onUpdated={onRetryConditions} download={(raw,name) => downloadBlob(new Blob([raw],{type:'application/json;charset=utf-8'}),name)}/>}
        <input ref={importInput} type="file" accept="application/json,.json" className="plan-input-file" aria-label={copy.importJson} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void importJson(file); }}/>
      </div>
      {view === 'editor' && <footer className="plan-footer"><span className={`plan-save-state${saveState.error ? ' is-error' : ''}`} role="status">{saveState.error ? <AlertTriangle size={15}/> : <Save size={15}/>}<span className="plan-save-full">{saveLabel}</span><span className="plan-save-short">{saveState.saving ? copy.saving : saveState.error ? copy.storageFailed : saveState.savedAt ? copy.saved : copy.notSaved}</span></span>{exportSelect(`${copy.export}（固定工具列）`)}</footer>}
    </div>
  </main>;
}

function DayPlanningDetails({ day, calculation, onChange }: { day: PlanDay; calculation: PlanDayCalculation | undefined; onChange: (changes: Partial<PlanDay>) => void }) {
  return <div className="plan-day-resources">
    <Field label={copy.dayLabel} value={day.label} onChange={label => onChange({ label })}/>
    <Subsection title={copy.water} target="water"><div className="plan-grid"><Field label={copy.waterPrimary} value={day.water.primary} onChange={primary => onChange({ water: { ...day.water, primary } })} wide/><Field label={copy.waterBackup} value={day.water.backup} onChange={backup => onChange({ water: { ...day.water, backup } })} wide/><SelectField label={copy.availability} value={day.water.availability} options={copy.waterStates} onChange={availability => onChange({ water: { ...day.water, availability } })}/><Field label={copy.reportedAt} value={day.water.reportedAt} onChange={reportedAt => onChange({ water: { ...day.water, reportedAt } })} placeholder={copy.dateHint} type="date"/><Field label={copy.source} value={day.water.sourceUrl} onChange={sourceUrl => onChange({ water: { ...day.water, sourceUrl } })} type="url" wide/><NumberField label={copy.perPerson} value={day.water.perPersonL} onChange={perPersonL => onChange({ water: { ...day.water, perPersonL } })}/><NumberField label={copy.cooking} value={day.water.cookingL} onChange={cookingL => onChange({ water: { ...day.water, cookingL } })}/><NumberField label={copy.reserve} value={day.water.reserveL} onChange={reserveL => onChange({ water: { ...day.water, reserveL } })}/><NumberField label={copy.detour} value={day.water.detourMinutes} onChange={detourMinutes => onChange({ water: { ...day.water, detourMinutes } })} integer/><Field label={copy.waterNote} value={day.water.note} onChange={note => onChange({ water: { ...day.water, note } })} multiline wide/></div><p className="plan-help">{copy.waterFormula}</p><p className="plan-help">{copy.totalWater}：{calculation?.waterLitres === null || calculation?.waterLitres === undefined ? copy.unknown : `${calculation.waterLitres.toLocaleString()} ${copy.litres}`}</p><p className="plan-reference-note">{copy.detourNote}</p></Subsection>
    <Subsection title={copy.lodging} target="lodging"><div className="plan-grid"><Field label={copy.lodgingName} value={day.lodging.name} onChange={name => onChange({ lodging: { ...day.lodging, name } })}/><SelectField label={copy.reservation} value={day.lodging.reservation} options={copy.reservationStates} onChange={reservation => onChange({ lodging: { ...day.lodging, reservation } })}/><Field label={copy.lodgingBackup} value={day.lodging.backup} onChange={backup => onChange({ lodging: { ...day.lodging, backup } })} wide/><Field label={copy.approval} value={day.lodging.approvalReference} onChange={approvalReference => onChange({ lodging: { ...day.lodging, approvalReference } })} wide/><Field label={copy.source} value={day.lodging.sourceUrl} onChange={sourceUrl => onChange({ lodging: { ...day.lodging, sourceUrl } })} type="url" wide/></div><p className="plan-help">{copy.lodgingNote}</p></Subsection>
    <Subsection title={copy.retreat} target="retreat"><div className="plan-grid"><Field label={copy.decisionPoint} value={day.retreat.decisionPoint} onChange={decisionPoint => onChange({ retreat: { ...day.retreat, decisionPoint } })}/><Field label={copy.deadline} value={day.retreat.deadline} onChange={deadline => onChange({ retreat: { ...day.retreat, deadline } })} type="time"/><Field label={copy.trigger} value={day.retreat.trigger} onChange={trigger => onChange({ retreat: { ...day.retreat, trigger } })} multiline wide/><Field label={copy.retreatRoute} value={day.retreat.route} onChange={route => onChange({ retreat: { ...day.retreat, route } })} multiline wide/><Field label={copy.source} value={day.retreat.sourceUrl} onChange={sourceUrl => onChange({ retreat: { ...day.retreat, sourceUrl } })} type="url" wide/></div><label className="plan-checkbox"><input type="checkbox" checked={day.retreat.confirmed} onChange={event => onChange({ retreat: { ...day.retreat, confirmed: event.target.checked } })}/>{copy.retreatConfirmed}</label><p className="plan-help">{copy.retreatNote}</p></Subsection>
    <Subsection title={copy.dayNotes}><div className="plan-grid"><Field label={copy.menu} value={day.menu} onChange={menu => onChange({ menu })} multiline wide/><Field label={copy.dayNotes} value={day.notes} onChange={notes => onChange({ notes })} multiline wide/></div></Subsection>
  </div>;
}
