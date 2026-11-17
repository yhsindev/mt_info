import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowDown, BellRing, ChevronDown, CircleHelp, ExternalLink, Info, LoaderCircle, RefreshCw, Search, TriangleAlert, WifiOff, X } from 'lucide-react';
import { buildConditionsDashboard, type DashboardFilter, type DashboardRegion } from '../conditions-dashboard';
import { conditionsDashboardCopy as copy } from '../conditions-dashboard-copy';
import { getTrailClosureTiming, taipeiCalendarDate } from '../conditions-timing';
import { ageConditions } from '../shared/conditions-freshness';
import type { ConditionsResponse, ConditionsSource, ConditionsStatus, OfficialAlert, TrailCondition, TrailConditionKind } from '../shared/conditions';
import type { SourceInfo } from '../shared/types';
import { useClock } from '../hooks';
import { formatTime } from '../utils';
import './ConditionsDashboard.css';

export interface ConditionsDashboardProps {
  data: ConditionsResponse | null;
  loading: boolean;
  error: boolean;
  retry: () => void;
  query: string;
  onQuery: (value: string) => void;
  selectedId: string | null;
  selectionRevision: number;
  onSelect: (id: string) => void;
  online: boolean;
}

const REGION_CARDS: DashboardRegion[] = ['north', 'central', 'south', 'east'];
const TRAIL_KINDS: TrailConditionKind[] = ['closed', 'partial', 'caution', 'unknown'];
type DisplayStatus = ConditionsStatus | 'loading';
const EMPTY_ALERTS: OfficialAlert[] = [];

/** Repaint at CAP boundaries or Taiwan midnight, without inventing a closure's exact time. */
function useConditionsClock(items: readonly OfficialAlert[]) {
  const heartbeat = useClock();
  const [boundary, setBoundary] = useState(0);
  const now = useMemo(() => Date.now(), [heartbeat, boundary]);
  useEffect(() => {
    const today = taipeiCalendarDate(now);
    let next = today ? Date.parse(`${today}T00:00:00+08:00`) + 86_400_000 : Infinity;
    for (const item of items) for (const value of [item.effectiveAt, item.expiresAt]) {
      const timestamp = Date.parse(value);
      if (timestamp > now && timestamp < next) next = timestamp;
    }
    if (!Number.isFinite(next) || next - now > 60_000) return;
    const timer = setTimeout(() => setBoundary(value => value + 1), Math.max(1, next - now + 10));
    return () => clearTimeout(timer);
  }, [items, now]);
  return now;
}

function sourceStatus<T>(feed: ConditionsSource<T> | undefined, loading: boolean, failed: boolean): DisplayStatus {
  if (!feed) return loading ? 'loading' : failed ? 'error' : 'missing';
  if (loading && (feed.status === 'missing' || feed.status === 'error') && !feed.items.length) return 'loading';
  return feed.status;
}
function countText(value: number | null | undefined): string { return value === null || value === undefined ? '—' : value.toLocaleString(); }
function safeSourceUrl(value: string): string | null {
  try { const parsed = new URL(value); return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null; }
  catch { return null; }
}

export default function ConditionsDashboard({ data, loading, error, retry, query, onQuery, selectedId, selectionRevision, online }: ConditionsDashboardProps) {
  const now = useConditionsClock(data?.alerts.items || EMPTY_ALERTS);
  const aged = useMemo(() => ageConditions(data, now, error || !online), [data, now, error, online]);
  const [kind, setKind] = useState<DashboardFilter>('all');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [focusedId, setFocusedId] = useState<string | null>(selectedId);
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  const root = useRef<HTMLElement>(null);
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const regionRefs = useRef(new Map<string, HTMLElement>());
  const handledSelection = useRef<string | null>(null);
  const id = useId();
  const overview = useMemo(() => buildConditionsDashboard(aged, { now }), [aged, now]);
  const view = useMemo(() => buildConditionsDashboard(aged, { query, type: kind, now }), [aged, query, kind, now]);
  // Trail status filters never suppress the separate official warning section.
  const alertView = useMemo(() => buildConditionsDashboard(aged, { query, type: 'alerts', now }), [aged, query, now]);
  const alerts = useMemo(() => alertView.groups.flatMap(group => group.alerts).sort((a, b) => (Date.parse(b.issuedAt) || 0) - (Date.parse(a.issuedAt) || 0)), [alertView]);
  const currentIds = useMemo(() => new Set(overview.groups.flatMap(group => [...group.trails, ...group.alerts].map(item => item.id))), [overview]);
  const hasSnapshot = overview.available.trails || overview.available.alerts;
  const filtered = !!query.trim() || kind !== 'all';
  const trailStatus = sourceStatus(aged?.trails, loading, error);
  const alertStatus = sourceStatus(aged?.alerts, loading, error);

  const scrollToElement = (element: HTMLElement | undefined) => {
    if (!element || !root.current) return;
    const top = element.getBoundingClientRect().top - root.current.getBoundingClientRect().top + root.current.scrollTop - 18;
    root.current.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
  };
  useEffect(() => {
    if (!selectedId) return;
    const token = `${selectionRevision}\u0000${selectedId}`;
    if (handledSelection.current === token || !currentIds.has(selectedId)) return;
    handledSelection.current = token;
    setKind('all');
    setExpanded(previous => new Set(previous).add(selectedId));
    setFocusedId(selectedId);
    setScrollTarget(selectedId);
    if (query.trim()) onQuery('');
  }, [selectedId, selectionRevision, currentIds, query, onQuery]);
  useEffect(() => {
    if (!scrollTarget) return;
    const frame = requestAnimationFrame(() => {
      const element = rowRefs.current.get(scrollTarget);
      if (element) { scrollToElement(element); setScrollTarget(null); }
    });
    return () => cancelAnimationFrame(frame);
  }, [scrollTarget, view, alerts]);
  const toggle = (itemId: string) => {
    setExpanded(previous => { const next = new Set(previous); if (next.has(itemId)) next.delete(itemId); else next.add(itemId); return next; });
    setFocusedId(itemId);
  };
  const bindRow = (itemId: string, element: HTMLElement | null) => { if (element) rowRefs.current.set(itemId, element); else rowRefs.current.delete(itemId); };
  const bindRegion = (region: string, element: HTMLElement | null) => { if (element) regionRefs.current.set(region, element); else regionRefs.current.delete(region); };

  return <main id="tool-main" tabIndex={-1} className="conditions-dashboard" ref={root} aria-labelledby={`${id}-title`}>
    <div className="cd-container">
      <header className="cd-heading">
        <div><p className="cd-eyebrow">{copy.coverage}</p><h1 id={`${id}-title`}>{copy.title}</h1></div>
        <button className="cd-refresh" type="button" onClick={retry} disabled={loading || !online}>{loading ? <LoaderCircle className="spin" size={17} aria-hidden="true"/> : <RefreshCw size={17} aria-hidden="true"/>}{copy.refresh}</button>
      </header>
      <div className="cd-check-times"><span>{copy.trailChecked} <b>{formatTime(aged?.trails.checkedAt)}</b></span><span>{copy.alertChecked} <b>{formatTime(aged?.alerts.checkedAt)}</b></span></div>
      {!online && <Notice icon="offline" text={hasSnapshot ? copy.offline : copy.offlineWithoutData}/>}
      {error && <Notice warning title={copy.fetchFailed} text={hasSnapshot ? copy.failureWithData : copy.failureWithoutData}/>}
      {loading && <Notice icon="loading" text={hasSnapshot ? copy.refreshing : copy.loading}/>}
      {!error && <FeedNotice feed={aged?.trails} kind="trails" loading={loading}/>}
      <section className="cd-statistics" aria-label={copy.statistics}>
        {TRAIL_KINDS.map(state => <div key={state} className={`cd-stat cd-stat-${state}`}><span>{copy.trailStates[state]}</span><strong>{countText(overview.totalCounts[state])}</strong></div>)}
      </section>
      <p className="cd-count-note">{copy.countNote}</p>
      <div className="cd-filters" role="search">
        <label className="cd-search"><Search size={18} aria-hidden="true"/><input type="search" value={query} onChange={event => onQuery(event.target.value)} placeholder={copy.searchPlaceholder} aria-label={copy.search}/>{query && <button type="button" onClick={() => onQuery('')} aria-label={copy.clearSearch}><X size={18} aria-hidden="true"/></button>}</label>
        <div className="cd-filter-chips" role="group" aria-label={copy.filterLabel}>
          <button type="button" aria-pressed={kind === 'all'} onClick={() => setKind('all')}>{copy.all}</button>
          {TRAIL_KINDS.map(state => <button type="button" key={state} aria-pressed={kind === state} onClick={() => setKind(state)}>{copy.trailStates[state]}</button>)}
        </div>
        {filtered && <div className="cd-filter-result" role="status"><span>{copy.results} · {copy.resultCount(view.counts.trails)}</span><button type="button" onClick={() => { setKind('all'); onQuery(''); }}>{copy.clearFilters}<X size={14} aria-hidden="true"/></button></div>}
      </div>
      <nav className="cd-regions" aria-label={copy.regionalNavigation}>
        {REGION_CARDS.map(region => {
          const group = overview.groups.find(value => value.id === region);
          return <button className="cd-region-card" type="button" key={region} onClick={() => scrollToElement(regionRefs.current.get(region))}>
            <span className="cd-region-title">{copy.regions[region].title}<ArrowDown size={18} aria-hidden="true"/></span>
            <strong>{countText(group?.counts.trails)}<small>{copy.noticeUnit}</small></strong>
            <span className="cd-region-counties">{copy.regions[region].counties}</span>
          </button>;
        })}
      </nav>
      <nav className="cd-secondary-nav" aria-label={copy.regionalNavigation}>
        {(['cross', 'other'] as const).map(region => <button type="button" key={region} onClick={() => scrollToElement(regionRefs.current.get(region))}>{copy.regions[region].short}<b>{countText(overview.groups.find(group => group.id === region)?.counts.trails)}</b><ArrowDown size={14} aria-hidden="true"/></button>)}
        <button type="button" onClick={() => scrollToElement(regionRefs.current.get('alerts'))}>{copy.alerts}<b>{countText(overview.totalCounts.alerts)}</b><ArrowDown size={14} aria-hidden="true"/></button>
      </nav>
      <p className="cd-region-note">{copy.crossNote}</p>
      {selectedId && aged && !currentIds.has(selectedId) && <Notice text={copy.selectedMissing}/>}
      <div className="cd-trail-sections">
        {view.groups.map(group => {
          const total = overview.groups.find(value => value.id === group.id)?.counts.trails ?? null;
          return <section className="cd-region-section" data-region={group.id} key={group.id} ref={element => bindRegion(group.id, element)} aria-labelledby={`${id}-${group.id}`}>
            <header className="cd-section-heading"><h2 id={`${id}-${group.id}`}>{copy.regions[group.id].title}</h2><span>{copy.regionCount(group.trails.length, total, filtered)}</span></header>
            {group.trails.length > 0 ? <>
              <div className="cd-column-labels" aria-hidden="true"><span>{copy.published}</span><span>{copy.condition}</span><span>{copy.trailName}</span><span>{copy.county}</span><span/></div>
              <div className="cd-notice-list">{group.trails.map(item => <TrailRow key={item.id} item={item} now={now} fetchedAt={aged?.trails.fetchedAt || null} checkedAt={aged?.trails.checkedAt || null} open={expanded.has(item.id)} selected={focusedId === item.id} onToggle={() => toggle(item.id)} bind={element => bindRow(item.id, element)}/>)}</div>
            </> : <p className="cd-empty" role="status">{!overview.available.trails ? loading ? copy.loading : copy.unavailableRegion : filtered && total ? copy.emptyFilteredRegion : copy.emptyRegion}</p>}
          </section>;
        })}
      </div>
      <section className="cd-alert-section" data-region="alerts" ref={element => bindRegion('alerts', element)} aria-labelledby={`${id}-alerts`}>
        <header className="cd-section-heading"><h2 id={`${id}-alerts`}>{copy.alerts}</h2><span>{copy.alertCount(alerts.length, overview.totalCounts.alerts, !!query.trim())}</span></header>
        <p className="cd-section-note">{copy.alertsNote}</p>
        {!error && <FeedNotice feed={aged?.alerts} kind="alerts" loading={loading}/>}
        {alerts.length ? <div className="cd-notice-list">{alerts.map(item => <AlertRow key={item.id} item={item} fetchedAt={aged?.alerts.fetchedAt || null} checkedAt={aged?.alerts.checkedAt || null} open={expanded.has(item.id)} selected={focusedId === item.id} onToggle={() => toggle(item.id)} bind={element => bindRow(item.id, element)}/>)}</div> : <div className="cd-empty" role="status"><p>{!overview.available.alerts ? loading ? copy.loading : copy.missingAlerts : query.trim() ? copy.noAlertMatches : copy.emptyAlerts}</p><small>{copy.noAlertSafety}</small></div>}
        <p className="cd-section-note">{copy.alertScope}</p>
      </section>
      <details className="cd-source-details">
        <summary><span>{copy.sources}</span><span className="cd-source-state-summary"><StatusText label={copy.title} status={trailStatus}/><StatusText label={copy.alerts} status={alertStatus}/></span><ChevronDown size={18} aria-hidden="true"/></summary>
        <div className="cd-source-content"><div className="cd-source-grid"><SourceSummary title={copy.trailSource} feed={aged?.trails} status={trailStatus}/><SourceSummary title={copy.alertSource} feed={aged?.alerts} status={alertStatus}/></div>
          <p>{copy.scopeNote}</p><p>{copy.grouping}</p>
          {overview.available.trails && aged && <p>{copy.catalog(aged.trails.catalogCount)}</p>}
          {!!aged?.trails.unmatchedCount && <p>{copy.unmatched(aged.trails.unmatchedCount)}</p>}
          {!!aged?.alerts.unknownTimeCount && <p>{copy.unknownTime(aged.alerts.unknownTimeCount)}</p>}
          <p className="cd-generated">{copy.generated}：{formatTime(aged?.generatedAt)}</p>
        </div>
      </details>
    </div>
  </main>;
}

function Notice({ title, text, warning = false, icon }: { title?: string; text: string; warning?: boolean; icon?: 'offline' | 'loading' }) {
  const Icon = icon === 'offline' ? WifiOff : icon === 'loading' ? LoaderCircle : warning ? TriangleAlert : Info;
  return <div className={`cd-notice${warning ? ' cd-notice-warning' : ''}`} role={warning ? 'alert' : 'status'}><Icon size={18} className={icon === 'loading' ? 'spin' : ''} aria-hidden="true"/><div>{title && <strong>{title}</strong>}<p>{text}</p></div></div>;
}
function FeedNotice<T>({ feed, kind, loading }: { feed?: ConditionsSource<T>; kind: 'trails' | 'alerts'; loading: boolean }) {
  if (!feed) return loading ? null : <Notice warning text={kind === 'trails' ? copy.missingTrails : copy.missingAlerts}/>;
  if (feed.status === 'stale') return <Notice warning text={kind === 'trails' ? copy.staleTrails : copy.staleAlerts}/>;
  if (feed.status === 'error' || feed.status === 'missing') return loading ? null : <Notice warning text={kind === 'trails' ? copy.missingTrails : copy.missingAlerts}/>;
  if (feed.status === 'disabled') return <Notice text={copy.disabled}/>;
  return null;
}
function StatusText({ label, status }: { label: string; status: DisplayStatus }) { return <span className={`cd-source-state cd-state-${status}`}>{label} · {copy.sourceStates[status]}</span>; }
function SourceLink({ source }: { source: SourceInfo }) {
  const url = safeSourceUrl(source.url);
  return url ? <a className="cd-source-link" href={url} target="_blank" rel="noopener noreferrer">{source.name || copy.officialSource}<ExternalLink size={15} aria-hidden="true"/></a> : <span className="cd-source-link">{source.name || copy.officialSource}</span>;
}
function SourceSummary<T>({ title, feed, status }: { title: string; feed?: ConditionsSource<T>; status: DisplayStatus }) {
  return <section className="cd-source-block"><h3>{title}</h3><StatusText label={title} status={status}/>{feed ? <><SourceLink source={feed.source}/><dl className="cd-detail-grid"><TimeField label={copy.fetched} value={feed.fetchedAt}/><TimeField label={copy.checked} value={feed.checkedAt}/><DetailField label={copy.sourceCoverage} value={feed.coverage}/></dl>{feed.message && <p>{feed.message}</p>}{feed.error && <p className="cd-source-error">{feed.error}</p>}</> : <p>{copy.sourceStates[status]}</p>}</section>;
}
function DetailField({ label, value }: { label: string; value: string | null | undefined }) { return <div><dt>{label}</dt><dd>{value || copy.unknown}</dd></div>; }
function TimeField({ label, value }: { label: string; value: string | null | undefined }) { return <DetailField label={label} value={formatTime(value)}/>; }
function TrailBadge({ kind, scheduled }: { kind: TrailConditionKind; scheduled: boolean }) { return <span className={`cd-trail-badge cd-kind-${kind}${scheduled ? ' cd-kind-scheduled' : ''}`}>{kind === 'unknown' && <CircleHelp size={16} aria-hidden="true"/>}{scheduled ? kind === 'partial' ? copy.scheduledRestriction : copy.scheduledClosure : copy.trailStates[kind]}</span>; }
function TrailRow({ item, now, fetchedAt, checkedAt, open, selected, onToggle, bind }: { item: TrailCondition; now: number; fetchedAt: string | null; checkedAt: string | null; open: boolean; selected: boolean; onToggle: () => void; bind: (element: HTMLElement | null) => void }) {
  const detailId = useId();
  const timing = getTrailClosureTiming(item.closureDate, now);
  const isClosure = item.condition === 'closed' || item.condition === 'partial';
  const scheduled = isClosure && timing.state === 'scheduled';
  const showEffectiveDate = isClosure && (scheduled || timing.state === 'today');
  return <article className={`cd-trail-row${open ? ' is-open' : ''}${selected ? ' is-selected' : ''}`} data-condition-id={item.id} ref={bind}>
    <button className="cd-row-toggle" type="button" aria-expanded={open} aria-controls={detailId} onClick={onToggle}>
      <span className="cd-row-date"><span className="cd-date-label">{copy.published}</span>{item.issuedAt ? formatTime(item.issuedAt) : copy.dateUnknown}</span>
      <span className="cd-row-status"><TrailBadge kind={item.condition} scheduled={scheduled}/>{scheduled && <span className="cd-source-condition">{copy.sourceCondition}：{copy.trailStates[item.condition]}</span>}</span>
      <span className="cd-row-main"><strong>{item.name}</strong><span>{item.headline || item.rawCondition || copy.noTitle}</span>{showEffectiveDate && <span className="cd-effective-date">{copy.closureEffectiveDate}：<time dateTime={timing.effectiveDate!}>{timing.effectiveDate}</time>{timing.state === 'today' && <span>（{copy.closureToday}）</span>}</span>}</span>
      <span className="cd-row-county">{item.region || copy.unknown}</span>
      <ChevronDown className="cd-row-chevron" size={18} aria-hidden="true"/>
    </button>
    {open && <div className="cd-expanded" id={detailId}>
      <dl className="cd-detail-grid"><DetailField label={copy.trailId} value={item.trailId}/><DetailField label={copy.manager} value={item.manager}/><DetailField label={copy.county} value={item.region}/><DetailField label={copy.rawCondition} value={item.rawCondition}/><DetailField label={copy.section} value={item.section}/><TimeField label={copy.closureDate} value={item.closureDate}/><TimeField label={copy.expectedOpening} value={item.expectedOpeningDate}/><TimeField label={copy.published} value={item.issuedAt}/><TimeField label={copy.updated} value={item.updatedAt}/><TimeField label={copy.fetchedTrail} value={fetchedAt}/><TimeField label={copy.checked} value={checkedAt}/></dl>
      {isClosure && timing.effectiveDate && <p className="cd-opening-note">{copy.dateOnlyNote}</p>}
      {item.expectedOpeningDate && <p className="cd-opening-note">{copy.openingNote}</p>}
      <h3>{copy.original}</h3><p className="cd-original">{item.description || copy.noOriginal}</p><SourceLink source={item.source}/>
      <button className="cd-collapse" type="button" onClick={onToggle} aria-expanded={open} aria-controls={detailId}>{copy.collapse}<ChevronDown size={16} aria-hidden="true"/></button>
    </div>}
  </article>;
}
function AlertRow({ item, fetchedAt, checkedAt, open, selected, onToggle, bind }: { item: OfficialAlert; fetchedAt: string | null; checkedAt: string | null; open: boolean; selected: boolean; onToggle: () => void; bind: (element: HTMLElement | null) => void }) {
  const detailId = useId();
  return <article className={`cd-alert-row${open ? ' is-open' : ''}${selected ? ' is-selected' : ''}`} data-condition-id={item.id} ref={bind}>
    <button className="cd-alert-toggle" type="button" aria-expanded={open} aria-controls={detailId} onClick={onToggle}><BellRing size={18} aria-hidden="true"/><span className="cd-row-main"><strong>{item.headline || item.event || copy.alertBadge}</strong><span>{item.publisher || copy.unknown} · {formatTime(item.issuedAt)}</span></span><ChevronDown className="cd-row-chevron" size={18} aria-hidden="true"/></button>
    <div className="cd-alert-overview"><p><span>{copy.area}</span>{item.areas.length ? item.areas.join('、') : copy.unknown}</p><p><span>{copy.effective} — {copy.expires}</span>{formatTime(item.effectiveAt)} — {formatTime(item.expiresAt)}</p></div>
    {open && <div className="cd-expanded" id={detailId}>
      <dl className="cd-detail-grid"><DetailField label={copy.publisher} value={item.publisher}/><DetailField label={copy.sender} value={item.sender}/><DetailField label={copy.event} value={item.event}/><DetailField label={copy.severity} value={item.severity}/><TimeField label={copy.published} value={item.issuedAt}/><TimeField label={copy.effective} value={item.effectiveAt}/><TimeField label={copy.expires} value={item.expiresAt}/><TimeField label={copy.fetchedAlert} value={fetchedAt}/><TimeField label={copy.checked} value={checkedAt}/></dl>
      {(!Number.isFinite(Date.parse(item.effectiveAt)) || !Number.isFinite(Date.parse(item.expiresAt))) && <p className="cd-opening-note">{copy.periodUnknown}</p>}
      <h3>{copy.original}</h3><p className="cd-original">{item.description || copy.noOriginal}</p><h3>{copy.instruction}</h3><p className="cd-original">{item.instruction || copy.instructionUnknown}</p><SourceLink source={item.source}/>
      <button className="cd-collapse" type="button" onClick={onToggle} aria-expanded={open} aria-controls={detailId}>{copy.collapse}<ChevronDown size={16} aria-hidden="true"/></button>
    </div>}
  </article>;
}
