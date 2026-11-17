import { useEffect, useId, useMemo, useState } from 'react';
import { BellRing, ChevronDown, CircleHelp, Clock3, ExternalLink, Info, LoaderCircle, MapPin, RefreshCw, Route, ShieldAlert, TriangleAlert, Map as MapIcon, X } from 'lucide-react';
import { conditionsCopy as copy } from '../conditions-copy';
import { conditionPage, filterOfficialAlerts, filterTrailConditions } from '../conditions-view';
import { useClock } from '../hooks';
import { formatTime } from '../utils';
import type { ConditionsResponse, ConditionsSource, ConditionsStatus, OfficialAlert, TrailCondition } from '../shared/conditions';
import type { SourceInfo } from '../shared/types';
import { hasTrailLocation, type ConditionsViewSummary } from '../conditions-explorer';
import './ConditionsPanel.css';

export interface ConditionsPanelProps {
  data: ConditionsResponse | null;
  loading: boolean;
  error: boolean;
  retry: () => void;
  query: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  selectionRevision: number;
  followMap: boolean;
  onFollowMap: (value: boolean) => void;
  viewSummary: ConditionsViewSummary;
  hitChoices: { id: string; title: string }[];
  onClearSelection: () => void;
}

const PAGE_SIZE = 40;
type DisplayStatus = ConditionsStatus | 'loading';
function readable<T>(feed: ConditionsSource<T> | null | undefined): boolean {
  return !!feed && (feed.items.length > 0 || feed.status === 'ready' || feed.status === 'empty' || feed.status === 'stale');
}
function sourceStatus<T>(feed: ConditionsSource<T> | null | undefined, loading: boolean, error: boolean): DisplayStatus {
  if (loading) return 'loading';
  if (!feed) return error ? 'error' : 'missing';
  if (error && readable(feed)) return 'stale';
  return feed.status;
}
function knownPoint(item: TrailCondition): boolean {
  return item.latitude !== null && item.longitude !== null && Number.isFinite(item.latitude) && Number.isFinite(item.longitude);
}
function preview(value: string): string { return value.length > 170 ? `${Array.from(value).slice(0, 170).join('')}…` : value; }

export default function ConditionsPanel({ data, loading, error, retry, query, selectedId, onSelect, selectionRevision, followMap, onFollowMap, viewSummary, hitChoices, onClearSelection }: ConditionsPanelProps) {
  const [trailLimit, setTrailLimit] = useState(PAGE_SIZE), [alertLimit, setAlertLimit] = useState(PAGE_SIZE);
  const [unlocatedLimit, setUnlocatedLimit] = useState(PAGE_SIZE), [showUnlocated, setShowUnlocated] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const now = useClock();
  const headingId = useId();
  const trails = useMemo(() => filterTrailConditions(data?.trails.items || [], query), [data?.trails.items, query]);
  const alerts = useMemo(() => filterOfficialAlerts(data?.alerts.items || [], query, now), [data?.alerts.items, query, now]);
  const locatedTrails = useMemo(() => trails.filter(hasTrailLocation), [trails]);
  const unlocatedTrails = useMemo(() => trails.filter(item => !hasTrailLocation(item)), [trails]);
  const trailPage = useMemo(() => conditionPage(locatedTrails, trailLimit, selectedId), [locatedTrails, trailLimit, selectedId]);
  const unlocatedPage = useMemo(() => conditionPage(unlocatedTrails, unlocatedLimit, selectedId), [unlocatedTrails, unlocatedLimit, selectedId]);
  const alertPage = useMemo(() => conditionPage(alerts, alertLimit, selectedId), [alerts, alertLimit, selectedId]);
  useEffect(() => { setTrailLimit(PAGE_SIZE); setAlertLimit(PAGE_SIZE); setUnlocatedLimit(PAGE_SIZE); if (query.trim()) setShowUnlocated(true); }, [query]);
  useEffect(() => { if (selectedId) { setExpandedId(selectedId); if (unlocatedTrails.some(item => item.id === selectedId)) setShowUnlocated(true); } }, [selectedId, selectionRevision]);
  const toggle = (id: string) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id); onSelect(id);
  };
  return <div className="conditions-panel" aria-label={copy.title}>
    <div className="conditions-viewbar" aria-label={copy.viewScope}><button type="button" aria-pressed={followMap} onClick={() => onFollowMap(true)}><MapIcon size={15}/>{copy.followMap}</button><button type="button" aria-pressed={!followMap} onClick={() => onFollowMap(false)}>{copy.allConditions}</button></div>
    <p className="conditions-view-count" role="status">{readable(data?.trails) || readable(data?.alerts) ? <>{viewSummary.inView ? copy.viewport : followMap ? copy.mapPending : copy.allScope} · {viewSummary.routeCount} {copy.routeCount} · {viewSummary.locatedTrailCount + viewSummary.locatedAlertCount} {copy.locatedCount}{viewSummary.unlocatedTrailCount + viewSummary.unlocatedAlertCount > 0 && <small>{copy.unlocatedKept} {viewSummary.unlocatedTrailCount + viewSummary.unlocatedAlertCount} {copy.records}</small>}</> : loading ? copy.loading : copy.unavailableCount}</p>
    {viewSummary.outsideSelection && <div className="conditions-selection-note"><span>{copy.outsideSelection}</span><button type="button" onClick={onClearSelection} aria-label={copy.clearSelection}><X size={15}/></button></div>}
    {hitChoices.length > 1 && <div className="conditions-hit-choices" role="group" aria-label={copy.chooseHit}><strong>{copy.chooseHit}</strong>{hitChoices.map(item => <button type="button" key={item.id} onClick={() => onSelect(item.id)}>{item.title}<ChevronDown size={15}/></button>)}</div>}
    <details className="conditions-source-summary">
      <summary><strong className="sr-only">{copy.sources}</strong><span className={`conditions-state state-${sourceStatus(data?.trails, loading, error)}`}>{copy.trails} · {copy.states[sourceStatus(data?.trails, loading, error)]}</span><span className={`conditions-state state-${sourceStatus(data?.alerts, loading, error)}`}>{copy.alerts} · {copy.states[sourceStatus(data?.alerts, loading, error)]}</span><ChevronDown size={14}/></summary>
      <div className="conditions-summary-heading"><strong>{copy.sources}</strong><button type="button" className="conditions-refresh" onClick={retry} disabled={loading} aria-label={copy.retry} title={copy.retry}>{loading ? <LoaderCircle size={17} className="spin"/> : <RefreshCw size={17}/>}</button></div>
      <SourceSummary label={copy.trails} feed={data?.trails} loading={loading} error={error}/>
      <SourceSummary label={copy.alerts} feed={data?.alerts} loading={loading} error={error}/>
      {data && <p className="conditions-generated"><Clock3 size={13}/>{copy.generated}：{formatTime(data.generatedAt)}</p>}
    </details>
    {error && <div className="conditions-notice is-warning" role="alert"><TriangleAlert size={18}/><span><strong>{copy.failed}</strong>{data ? copy.failedWithData : copy.failedWithoutData}</span></div>}
    {loading && data && <div className="conditions-notice" role="status"><LoaderCircle size={17} className="spin"/><span>{copy.refreshing}</span></div>}
    <div className="conditions-jump" aria-label={copy.jump}><button type="button" onClick={() => document.getElementById(`${headingId}-trails-section`)?.scrollIntoView({ block: 'start' })}><Route size={16}/>{copy.trails}<b>{readable(data?.trails) ? trails.length : '—'}</b></button><button type="button" onClick={() => document.getElementById(`${headingId}-alerts`)?.scrollIntoView({ block: 'start' })}><BellRing size={16}/>{copy.alerts}<b>{readable(data?.alerts) ? alerts.length : '—'}</b></button></div>
    <section id={`${headingId}-trails-section`} className="conditions-section" aria-labelledby={`${headingId}-trails`}>
      <header className="conditions-section-heading"><Route size={21}/><div><h2 id={`${headingId}-trails`}>{copy.trails}</h2><p>{readable(data?.trails) ? `${trails.length.toLocaleString()} ${copy.trailCount}` : copy.unavailableCount}</p></div></header>
      {trailPage.length ? <div className="conditions-card-list">{trailPage.map(item => <TrailCard key={item.id} item={item} fetchedAt={data?.trails.fetchedAt || null} open={expandedId === item.id} selected={selectedId === item.id} onToggle={() => toggle(item.id)} onFocus={() => onSelect(item.id)}/>)}</div> : trails.length ? <p className="conditions-text-hint">{copy.noLocatedTrails}</p> : <EmptyFeed feed={data?.trails} loading={loading} query={query} kind="trails" inView={viewSummary.inView}/>}
      {locatedTrails.length > trailPage.length && <Pagination shown={trailPage.length} total={locatedTrails.length} label={copy.moreTrails} onMore={() => setTrailLimit(limit => limit + PAGE_SIZE)}/>}
      {unlocatedTrails.length > 0 && <div className="conditions-unlocated"><button type="button" aria-expanded={showUnlocated} aria-controls={`${headingId}-unlocated`} onClick={() => setShowUnlocated(value => !value)}><MapPin size={15}/>{copy.unlocated} {unlocatedTrails.length} {copy.records}<ChevronDown size={16}/></button><div id={`${headingId}-unlocated`} hidden={!showUnlocated}><p>{copy.unlocatedHelp}</p><div className="conditions-card-list">{unlocatedPage.map(item => <TrailCard key={item.id} item={item} fetchedAt={data?.trails.fetchedAt || null} open={expandedId === item.id} selected={selectedId === item.id} onToggle={() => toggle(item.id)} onFocus={() => onSelect(item.id)}/>)}</div>{unlocatedTrails.length > unlocatedPage.length && <Pagination shown={unlocatedPage.length} total={unlocatedTrails.length} label={copy.moreTrails} onMore={() => setUnlocatedLimit(value => value + PAGE_SIZE)}/>}</div></div>}
      <p className="conditions-footnote"><MapPin size={14}/>{copy.coordinateLimit}</p>
    </section>
    <section className="conditions-section" aria-labelledby={`${headingId}-alerts`}>
      <header className="conditions-section-heading"><BellRing size={21}/><div><h2 id={`${headingId}-alerts`}>{copy.alerts}</h2><p>{readable(data?.alerts) ? `${alerts.length.toLocaleString()} ${copy.alertCount}` : copy.unavailableCount}</p></div></header>
      {alertPage.length ? <div className="conditions-card-list">{alertPage.map(item => <AlertCard key={item.id} item={item} open={expandedId === item.id} selected={selectedId === item.id} onToggle={() => toggle(item.id)}/>)}</div> : <EmptyFeed feed={data?.alerts} loading={loading} query={query} kind="alerts" inView={viewSummary.inView}/>}
      {alerts.length > alertPage.length && <Pagination shown={alertPage.length} total={alerts.length} label={copy.moreAlerts} onMore={() => setAlertLimit(limit => limit + PAGE_SIZE)}/>}
      <p className="conditions-footnote"><Info size={14}/>{copy.alertLimit}</p>
    </section>
    <p className="conditions-limit">{copy.limit}</p>
  </div>;
}

function SourceSummary<T>({ label, feed, loading, error }: { label: string; feed?: ConditionsSource<T>; loading: boolean; error: boolean }) {
  const status = sourceStatus(feed, loading, error);
  return <div className={`conditions-source status-${status}`}>
    <div className="conditions-source-heading"><strong>{label}</strong><span className={`conditions-state state-${status}`}>{copy.states[status]}</span></div>
    {feed ? <><SourceLink source={feed.source}/><dl className="conditions-source-times"><div><dt>{copy.fetched}</dt><dd>{formatTime(feed.fetchedAt)}</dd></div><div><dt>{copy.checked}</dt><dd>{formatTime(feed.checkedAt)}</dd></div></dl><SourceNote feed={feed}/></> : <p>{loading ? copy.loading : copy.missingFeed}</p>}
  </div>;
}
function SourceNote<T>({ feed }: { feed?: ConditionsSource<T> }) {
  if (!feed) return null;
  return <div className="conditions-source-note"><p><strong>{copy.coverage}</strong>{feed.coverage || copy.unknown}</p>{feed.message && <p>{feed.message}</p>}</div>;
}
function SourceLink({ source }: { source: SourceInfo }) {
  return <a className="conditions-source-link" href={source.url} target="_blank" rel="noopener noreferrer">{source.name || copy.source}<ExternalLink size={14}/></a>;
}
function EmptyFeed<T>({ feed, loading, query, kind, inView = false }: { feed?: ConditionsSource<T>; loading: boolean; query: string; inView?: boolean; kind: 'trails' | 'alerts' }) {
  const ready = readable(feed);
  const message = loading && !feed ? copy.loading : !ready ? copy.missingFeed : query.trim() ? kind === 'trails' ? copy.noTrailMatches : copy.noAlertMatches : inView ? copy.noViewportMatches : kind === 'trails' ? copy.emptyTrails : copy.emptyAlerts;
  return <div className="conditions-empty" role="status">{loading && !feed ? <LoaderCircle size={21} className="spin"/> : <CircleHelp size={21}/>}<p>{message}</p><small>{kind === 'trails' ? copy.noTrailSafety : copy.noAlertSafety}</small></div>;
}
function Pagination({ shown, total, label, onMore }: { shown: number; total: number; label: string; onMore: () => void }) {
  return <div className="conditions-pagination"><p>{copy.showing} {shown} / {total.toLocaleString()}</p><button type="button" onClick={onMore}>{label}<ChevronDown size={16}/></button></div>;
}
function DetailRow({ label, value }: { label: string; value: string | null | undefined }) { return <div><dt>{label}</dt><dd>{value || copy.unknown}</dd></div>; }
function TimeRow({ label, value }: { label: string; value: string | null | undefined }) { return <DetailRow label={label} value={formatTime(value)}/>; }

function TrailCard({ item, fetchedAt, open, selected, onToggle, onFocus }: { item: TrailCondition; fetchedAt: string | null; open: boolean; selected: boolean; onToggle: () => void; onFocus: () => void }) {
  const detailId = useId();
  const Icon = item.condition === 'closed' ? ShieldAlert : item.condition === 'unknown' ? CircleHelp : TriangleAlert;
  return <article className={`condition-card trail-condition condition-${item.condition}${selected ? ' is-selected' : ''}`} data-condition-id={item.id}>
    <button type="button" className="condition-card-toggle" aria-expanded={open} aria-controls={detailId} onClick={onToggle}>
      <span className={`conditions-kind kind-${item.condition}`}><Icon size={15}/>{copy.trailStates[item.condition]}</span>
      <span className="condition-card-heading"><strong>{item.name}</strong><span>{item.region || copy.unknown}</span></span><ChevronDown size={18} className={open ? 'is-open' : ''}/>
    </button>
    <div className="condition-card-body"><p className="condition-headline">{item.headline || item.rawCondition || copy.trailStates[item.condition]}</p><div className="condition-location"><MapPin size={13}/><span>{item.location?.kind === 'route' ? copy.referenceRoute : item.location?.kind === 'entrance' ? copy.referenceEntrance : knownPoint(item) ? copy.officialCoordinates : copy.unknownCoordinates}</span>{hasTrailLocation(item) && <button type="button" className="condition-focus" onClick={onFocus}>{copy.viewLocation}</button>}</div>
      {!open && item.description && item.description !== item.headline && <p className="condition-preview">{preview(item.description)}</p>}
      <dl className="condition-times"><TimeRow label={copy.published} value={item.issuedAt}/>{open && <TimeRow label={copy.updated} value={item.updatedAt}/>}<TimeRow label={copy.fetched} value={fetchedAt}/></dl>
      {open && <div id={detailId} className="condition-expanded"><dl className="condition-details"><DetailRow label={copy.region} value={item.region}/><DetailRow label={copy.manager} value={item.manager}/><DetailRow label={copy.condition} value={item.rawCondition}/><DetailRow label={copy.section} value={item.section}/><TimeRow label={copy.closureDate} value={item.closureDate}/><TimeRow label={copy.expectedOpening} value={item.expectedOpeningDate}/></dl>{item.expectedOpeningDate && <p className="conditions-card-note">{copy.expectedOpeningNote}</p>}<h3>{copy.original}</h3><p className="condition-original">{item.description || copy.noOriginal}</p>{item.location && <div className="conditions-geometry-source"><strong>{copy.locationSource}</strong><SourceLink source={item.location.source}/><p>{item.location.note}</p><dl className="condition-details"><TimeRow label={copy.geometryChecked} value={item.location.checkedAt}/><TimeRow label={copy.geometryDate} value={item.location.geometryDate}/></dl></div>}{item.coordinateNote && <p className="conditions-card-note">{item.coordinateNote}</p>}<SourceLink source={item.source}/></div>}
      <button type="button" className="conditions-expand" onClick={onToggle} aria-expanded={open} aria-controls={detailId}>{open ? copy.collapse : copy.expand}<ChevronDown size={15} className={open ? 'is-open' : ''}/></button>
    </div>
  </article>;
}
function AlertCard({ item, open, selected, onToggle }: { item: OfficialAlert; open: boolean; selected: boolean; onToggle: () => void }) {
  const detailId = useId();
  return <article className={`condition-card official-alert${selected ? ' is-selected' : ''}`} data-condition-id={item.id}>
    <button type="button" className="condition-card-toggle" aria-expanded={open} aria-controls={detailId} onClick={onToggle}><span className="conditions-kind kind-alert"><BellRing size={16}/></span><span className="condition-card-heading"><strong>{item.headline || item.event || copy.alerts}</strong><span>{item.publisher || copy.unknown}</span></span><ChevronDown size={18} className={open ? 'is-open' : ''}/></button>
    <div className="condition-card-body"><p className="condition-area"><strong>{copy.area}</strong>{item.areas.length ? item.areas.join('、') : copy.unknown}</p><p className="condition-location"><MapPin size={13}/>{item.polygons.length ? copy.officialArea : copy.textArea}</p>
      {!open && item.description && <p className="condition-preview">{preview(item.description)}</p>}
      <dl className="condition-times"><TimeRow label={copy.sent} value={item.issuedAt}/><TimeRow label={copy.effective} value={item.effectiveAt}/><TimeRow label={copy.expires} value={item.expiresAt}/></dl>
      {(!Number.isFinite(Date.parse(item.effectiveAt)) || !Number.isFinite(Date.parse(item.expiresAt))) && <p className="conditions-card-note">{copy.periodUnknown}</p>}
      {open && <div id={detailId} className="condition-expanded"><dl className="condition-details"><DetailRow label={copy.publisher} value={item.publisher}/><DetailRow label={copy.event} value={item.event}/><DetailRow label={copy.severity} value={item.severity}/></dl><h3>{copy.original}</h3><p className="condition-original">{item.description || copy.noOriginal}</p>{item.instruction && <><h3>{copy.instruction}</h3><p className="condition-original">{item.instruction}</p></>}<SourceLink source={item.source}/></div>}
      <button type="button" className="conditions-expand" onClick={onToggle} aria-expanded={open} aria-controls={detailId}>{open ? copy.collapse : copy.expand}<ChevronDown size={15} className={open ? 'is-open' : ''}/></button>
    </div>
  </article>;
}
