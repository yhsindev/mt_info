import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Map, BookOpen, Search, ChevronDown, Navigation, HeartPulse, CloudRain, Waves, ArrowUpRight, WifiOff, Info, X, RefreshCw, MapPin, ShieldCheck, Layers, LoaderCircle, ArrowRight, TriangleAlert, MoreHorizontal, Route as RouteIcon } from 'lucide-react';
import PlanBoundary from './components/PlanBoundary';
import MapBoundary from './components/MapBoundary';
import EquipmentCard, { EquipmentIcon } from './components/EquipmentCard';
import WeatherPanel from './components/WeatherPanel';
import RainMapPanel, { type RainMapControls } from './components/RainMapPanel';
import RainMapCanvas from './components/RainMapCanvas';
import ConditionsDashboard from './components/ConditionsDashboard';
import type { ConditionsResponse } from './shared/conditions';
import { conditionsCopy } from './conditions-copy';
import { ageConditions } from './shared/conditions-freshness';
import { rainMapCopy } from './rain-map-copy';
import type { RainMapCatalog, RainMapProductId } from './shared/rain-maps';
import { useClock, useOnline, useRemote } from './hooks';
import { brand, regions, text, ui, sourceLinks } from './config';
import { ageWeather } from './shared/weather-view';
import { equipmentPage, filterEquipment, orderEquipment } from './equipment-view';
import { formatTime } from './utils';
import { parseLocalGpx, routeProximity, type LocalRoute } from './local-route';
import { routeCopy } from './route-copy';
import type { BasinSelection, DataMode, EquipmentResponse, EquipmentType, LayerId, RegionId, WeatherKind, WeatherResponse } from './shared/types';
const layers = [{ id: 'equipment' as const, icon: HeartPulse, label: text.equipment }, { id: 'weather' as const, icon: CloudRain, label: text.weather }, { id: 'conditions' as const, icon: TriangleAlert, label: text.conditions }, { id: 'basins' as const, icon: Waves, label: text.basins }];
const equipmentTypes: ('ALL' | EquipmentType)[] = ['ALL', 'AED', 'PAC', 'FIRST_AID'];
const PlanPanel = lazy(() => import('./components/PlanPanel'));
const MapView = lazy(() => import('./components/MapView'));
export default function App() {
  const [region, setRegion] = useState<RegionId>('xueshan'), [layer, setLayer] = useState<LayerId>(() => { const selected = new URL(window.location.href).searchParams.get('layer'); return selected === 'weather' || selected === 'basins' || selected === 'conditions' ? selected : 'equipment'; });
  const [mode, setMode] = useState<DataMode>('live'), [filter, setFilter] = useState<'ALL' | EquipmentType>('ALL'), [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null), [basin, setBasin] = useState<BasinSelection | null>(null);
  const [location, setLocation] = useState<[number, number] | null>(null), [locating, setLocating] = useState(false), [locationMessage, setLocationMessage] = useState('');
  const [sources, setSources] = useState(false), [mobileList, setMobileList] = useState(() => new URL(window.location.href).searchParams.get('layer') === 'conditions');
  const [headerMoreOpen, setHeaderMoreOpen] = useState(false);
  const headerMore = useRef<HTMLDivElement>(null);
  const headerMoreButton = useRef<HTMLButtonElement>(null);
  const [plannerOpen, setPlannerOpen] = useState(() => new URL(window.location.href).searchParams.get('plan') === '1');
  const plannerLeave = useRef<((proceed: () => void) => void) | null>(null);
  const registerPlannerLeave = useCallback((guard: ((proceed: () => void) => void) | null) => { plannerLeave.current = guard; }, []);
  const [visibleLimit, setVisibleLimit] = useState(40);
  const [selectedCondition, setSelectedCondition] = useState<string | null>(null);
  const [conditionSelectionRevision, setConditionSelectionRevision] = useState(0);
  const [localRoute, setLocalRoute] = useState<{ route: LocalRoute; contains: ReturnType<typeof routeProximity> } | null>(null);
  const [alongRoute, setAlongRoute] = useState(true), [routeError, setRouteError] = useState(''), [routeFocus, setRouteFocus] = useState(0);
  const routeInput = useRef<HTMLInputElement>(null);
  const panelContent = useRef<HTMLDivElement>(null);
  const mapWorkspace = useRef<HTMLElement>(null);
  const [clusterIds, setClusterIds] = useState<string[] | null>(null);
  const [weatherKind, setWeatherKind] = useState<WeatherKind>('observation');
  const [weatherView, setWeatherView] = useState<'maps' | 'details'>('maps');
  const [rainProductId, setRainProductId] = useState<RainMapProductId>(() => { const value = new URL(window.location.href).searchParams.get('rain'); return value === 'ncdr-mpas' || value === 'cwa-qpf-12h' ? value : 'cwa-qpf-6h'; });
  const [rainIndex, setRainIndex] = useState(0), [rainPlaying, setRainPlaying] = useState(false);
  const [rainRevision, setRainRevision] = useState(0), [rainImageLoaded, setRainImageLoaded] = useState(false);
  const showRainMaps = !plannerOpen && layer === 'weather' && weatherView === 'maps';
  useEffect(() => {
    const workspace = mapWorkspace.current, panel = workspace?.querySelector<HTMLElement>('.information-panel');
    if (!workspace || !panel || showRainMaps) return;
    const update = () => {
      workspace.style.setProperty('--mobile-sheet-top', `${panel.offsetTop}px`);
      workspace.style.setProperty('--mobile-sheet-height', `${panel.offsetHeight}px`);
    };
    const observer = new ResizeObserver(update); observer.observe(panel); update();
    return () => observer.disconnect();
  }, [layer, plannerOpen, showRainMaps]);
  const onRainImageError = useCallback(() => setRainPlaying(false), []);
  useEffect(() => { const url = new URL(window.location.href); url.searchParams.set('layer', layer); window.history.replaceState(null, '', url); }, [layer]);
  useEffect(() => { const url = new URL(window.location.href); if (plannerOpen) url.searchParams.set('plan', '1'); else url.searchParams.delete('plan'); window.history.replaceState(null, '', url); }, [plannerOpen]);
  useEffect(() => { const url = new URL(window.location.href); if (rainProductId === 'cwa-qpf-6h') url.searchParams.delete('rain'); else url.searchParams.set('rain', rainProductId); window.history.replaceState(null, '', url); }, [rainProductId]);
  useEffect(() => { panelContent.current?.scrollTo({ top: 0 }); setClusterIds(null); }, [layer, region]);
  const sourceDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { document.title = `${brand.name} · ${brand.description}`; }, []);
  useEffect(() => {
    if (!sources) return;
    const previous = document.activeElement as HTMLElement | null;
    sourceDialog.current?.showModal();
    return () => { previous?.focus(); };
  }, [sources]);
  useEffect(() => {
    if (!headerMoreOpen) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !headerMore.current?.contains(event.target)) setHeaderMoreOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setHeaderMoreOpen(false);
      headerMoreButton.current?.focus();
    };
    const resize = () => { if (window.matchMedia('(min-width: 761px)').matches) setHeaderMoreOpen(false); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', resize);
    };
  }, [headerMoreOpen]);
  const equipment = useRemote<EquipmentResponse>('/api/equipment', 'mt-info-equipment-v3-national', 10 * 60_000, !plannerOpen && layer === 'equipment' || sources);
  const equipmentSync = useRemote<{state:string;fetchedAt:string;checkedAt:string|null;nextCheckAt:string|null;message:string|null}>('/api/equipment/sync-status', undefined, 2 * 60_000, !plannerOpen && layer === 'equipment' || sources);
  const conditions = useRemote<ConditionsResponse>('/api/conditions', undefined, 60_000, layer === 'conditions' || plannerOpen);
  useEffect(() => {
    if ((layer !== 'conditions' && !plannerOpen) || !conditions.data || conditions.data.trails.status !== 'missing' && conditions.data.alerts.status !== 'missing') return;
    const timer = setInterval(conditions.retry, 5000);
    return () => clearInterval(timer);
  }, [layer, plannerOpen, conditions.data?.trails.status, conditions.data?.alerts.status, conditions.retry]);
  useEffect(() => {
    if (equipmentSync.data && equipment.data && equipmentSync.data.fetchedAt !== equipment.data.fetchedAt) equipment.retry();
  }, [equipmentSync.data?.fetchedAt, equipment.data?.fetchedAt, equipment.retry]);
  const weather = useRemote<WeatherResponse>(`/api/weather?region=${region}&mode=${mode}&product=${weatherKind}`, undefined, 2 * 60_000, !plannerOpen && layer === 'weather' && weatherView === 'details');
  const rainMaps = useRemote<RainMapCatalog>('/api/rain-maps', undefined, 30 * 60_000, showRainMaps);
  const now = useClock();
  const agedConditions = useMemo(() => ageConditions(conditions.data, now, conditions.error), [conditions.data, now, conditions.error]);
  const weatherData = useMemo(() => ageWeather(weather.data, now, weather.error), [weather.data, now, weather.error]);
  const online = useOnline();
  const rainProduct = rainMaps.data?.products.find(p => p.id === rainProductId) || null;
  const rainFrames = rainProduct?.frames || [];
  const activeRainIndex = Math.min(rainIndex, Math.max(rainFrames.length - 1, 0));
  useEffect(() => {
    if (!rainPlaying || !rainImageLoaded || !showRainMaps || !online || rainFrames.length < 2) return;
    const timer = setTimeout(() => { setRainImageLoaded(false); setRainIndex(i => (i + 1) % rainFrames.length); }, 1800);
    return () => clearTimeout(timer);
  }, [rainPlaying, rainImageLoaded, showRainMaps, online, rainIndex, rainFrames.length]);
  useEffect(() => { if (!showRainMaps || !online) setRainPlaying(false); }, [showRainMaps, online]);
  const rainControls: RainMapControls = {
    product: rainProduct, productId: rainProductId, index: activeRainIndex, playing: rainPlaying, canPlay: rainImageLoaded && online && rainFrames.length > 1,
    onProduct: id => {
      const end = rainFrames[activeRainIndex]?.leadHours || 0;
      const next = rainMaps.data?.products.find(p => p.id === id);
      const nextIndex = next?.frames.findIndex(f => f.leadHours >= end) ?? 0;
      setRainProductId(id); setRainIndex(Math.max(nextIndex, 0)); setRainPlaying(false);
    },
    onIndex: i => { setRainIndex(Math.min(Math.max(i, 0), Math.max(rainFrames.length - 1, 0))); setRainPlaying(false); },
    onPlay: () => { if (rainPlaying) setRainPlaying(false); else if (rainFrames.length > 1 && online && rainImageLoaded) setRainPlaying(true); },
    onRefresh: () => { setRainRevision(r => r + 1); setRainPlaying(false); rainMaps.retry(); },
  };
  const allItems = useMemo(() => orderEquipment(equipment.data?.items || []), [equipment.data]);
  const baseFilteredItems = useMemo(() => filterEquipment(allItems, filter, query).filter(item => !localRoute || !alongRoute || localRoute.contains(item.longitude, item.latitude)), [allItems, filter, query, localRoute, alongRoute]);
  const filteredItems = useMemo(() => {
    if (!clusterIds) return baseFilteredItems;
    const ids = new Set(clusterIds);
    return baseFilteredItems.filter(item => ids.has(item.id));
  }, [clusterIds, baseFilteredItems]);
  const visibleItems = useMemo(() => equipmentPage(filteredItems, visibleLimit, selected), [filteredItems, visibleLimit, selected]);
  const typeCounts = useMemo(() => allItems.reduce((counts, item) => { counts[item.type]++; return counts; }, { AED: 0, PAC: 0, FIRST_AID: 0 }), [allItems]);
  const unknownCoordinates = useMemo(() => baseFilteredItems.filter(item => item.latitude === null || item.longitude === null).length, [baseFilteredItems]);
  const weatherProducts = useMemo(() => weatherData?.products.filter(p => p.kind === weatherKind && p.id !== 'ncdr') || [], [weatherData, weatherKind]);
  const equipmentMapNotice = equipment.loading ? text.pending
    : equipment.error ? equipment.data ? `${ui.equipment.retrySaved}${equipment.savedAt ? ` ${text.savedAt}：${formatTime(equipment.savedAt)}` : ''}` : text.loadError
    : equipment.savedAt ? `${text.saved} · ${formatTime(equipment.savedAt)}`
    : equipment.data?.status === 'stale' ? `${text.state.stale} · ${formatTime(equipment.data.fetchedAt)}`
    : equipment.data && baseFilteredItems.length === 0 ? text.noResults
    : baseFilteredItems.length > 0 && unknownCoordinates === baseFilteredItems.length ? `${unknownCoordinates} ${ui.overview.unknown}` : null;
  useEffect(() => { setVisibleLimit(40); }, [query, filter, clusterIds]);
  const onCluster = useCallback((ids: string[]) => { setClusterIds(ids); setSelected(null); setMobileList(true); panelContent.current?.scrollTo({ top: 0 }); }, []);
  const onSelect = useCallback((id: string) => {
    setSelected(id); setClusterIds(null); setMobileList(true);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const panel = panelContent.current;
      const card = panel?.querySelector<HTMLElement>('.equipment-card.is-selected');
      if (panel && card) panel.scrollTo({ top: panel.scrollTop + card.getBoundingClientRect().top - panel.getBoundingClientRect().top - 8, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }));
  }, []);
  const changeRegion = (value: RegionId) => { setRegion(value); setSelected(null); setQuery(''); setBasin(null); };
  const changeLayer = (value: LayerId) => { setLayer(value); setMobileList(value === 'conditions'); };
  const navigateTool = (value: LayerId) => {
    const proceed = () => { setSources(false); setPlannerOpen(false); changeLayer(value); };
    if (plannerOpen && plannerLeave.current) plannerLeave.current(proceed); else proceed();
  };
  const cardsReturn = new URLSearchParams({ layer });
  if (plannerOpen) cardsReturn.set('plan', '1');
  if (rainProductId !== 'cwa-qpf-6h') cardsReturn.set('rain', rainProductId);
  const cardsHref = `/cards.html?${new URLSearchParams({ return: `/?${cardsReturn}` })}`;
  const navigateCards = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const destination = event.currentTarget.href;
    if (headerMoreOpen) headerMoreButton.current?.focus();
    setHeaderMoreOpen(false);
    const proceed = () => window.location.assign(destination);
    if (plannerOpen && plannerLeave.current) plannerLeave.current(proceed); else proceed();
  };
  const onConditionSelect = useCallback((id: string) => {
    setSelectedCondition(id); setConditionSelectionRevision(value => value + 1);
  }, []);

  const importRoute = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error(routeCopy.oversized);
      const route = parseLocalGpx(await file.text(), file.name), contains = routeProximity(route);
      setLocalRoute({ route, contains }); setAlongRoute(true); setRouteError(''); setRouteFocus(value => value + 1);
      setQuery(''); setSelected(null); setClusterIds(null); setLayer('equipment'); setMobileList(true);
      setPlannerOpen(false);
    } catch (error) { setRouteError(error instanceof Error ? error.message : routeCopy.invalid); setMobileList(true); setPlannerOpen(false); }
    finally { if (routeInput.current) routeInput.current.value = ''; }
  };
  const locate = () => {
    if (!navigator.geolocation) { setLocationMessage(text.locationDenied); return; }
    setLocating(true); setLocationMessage('');
    navigator.geolocation.getCurrentPosition(p => { setLocation([p.coords.longitude, p.coords.latitude]); setLocating(false); setLocationMessage(text.located); }, () => { setLocating(false); setLocationMessage(text.locationDenied); }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 });
  };
  return <div className="app-shell">
    <a className="skip-link" href="#tool-main">略過導覽，前往工具內容</a>
    <header className="app-header">
      <a href="/" className="brand" aria-label={brand.description} onClick={event => { if (plannerOpen && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); navigateTool('equipment'); } }}><span className="brand-symbol" aria-hidden="true"><img src="/brand/mt-info-symbol-reverse.svg" alt="" width="32" height="32"/></span><span>{brand.name}</span></a>
      <nav className="header-nav" aria-label={ui.nav.label}>
        {(['equipment', 'weather', 'basins', 'conditions'] as const).map(id => { const item = layers.find(item => item.id === id)!; return <button key={id} className={!plannerOpen && layer === id ? 'active' : ''} aria-pressed={!plannerOpen && layer === id} onClick={() => navigateTool(id)}><item.icon size={17}/>{ui.nav[id]}</button>; })}
        <button className={plannerOpen ? 'active' : ''} aria-pressed={plannerOpen} onClick={() => { setSources(false); setPlannerOpen(true); }}><RouteIcon size={17}/>{ui.nav.plan}</button>
      </nav>
      <div className="header-right">
        <input ref={routeInput} type="file" accept=".gpx,application/gpx+xml" hidden onChange={e => void importRoute(e.target.files?.[0])}/>
        <div className="header-desktop-links">
          <a className="header-cards" href={cardsHref} onClick={navigateCards}><Layers size={17}/><span>山行卡</span></a>
          <button className="header-source" aria-label={text.sources} title={text.sources} onClick={() => setSources(true)}><BookOpen size={17}/><span>{ui.nav.sources}</span></button>
        </div>
        <div className="header-more" ref={headerMore} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setHeaderMoreOpen(false); }}>
          <button className="header-more-toggle" ref={headerMoreButton} aria-expanded={headerMoreOpen} aria-controls="header-more-links" onClick={() => setHeaderMoreOpen(open => !open)}><MoreHorizontal size={18}/><span>更多</span></button>
          {headerMoreOpen && <div className="header-more-links" id="header-more-links">
            <a href={cardsHref} onClick={navigateCards}><Layers size={17}/><span>山行卡</span></a>
            <button onClick={() => { headerMoreButton.current?.focus(); setHeaderMoreOpen(false); setSources(true); }}><BookOpen size={17}/><span>資料來源</span></button>
          </div>}
        </div>
      </div>
    </header>
    {!plannerOpen && (layer === 'conditions' ? <ConditionsDashboard data={agedConditions} loading={conditions.loading} error={conditions.error} retry={conditions.retry} query={query} onQuery={value => { setQuery(value); setSelectedCondition(null); }} selectedId={selectedCondition} selectionRevision={conditionSelectionRevision} onSelect={onConditionSelect} online={online}/> : <main id="tool-main" tabIndex={-1} ref={mapWorkspace} className={`workspace unified-workspace ${showRainMaps ? 'rain-map-workspace' : ''} ${layer === 'equipment' ? 'equipment-overview' : layer === 'basins' ? 'basin-workspace' : ''} ${localRoute ? 'has-local-route' : ''}`}>
      <section className={`information-panel ${mobileList ? 'expanded' : 'collapsed'}`} aria-label={ui.panelLabel}>
        <div className="mobile-handle"><button aria-label={mobileList ? ui.collapseList : ui.expandList} onClick={() => setMobileList(!mobileList)}><span/></button></div>
        <div className="panel-intro">
          <div className="region-row">
            {layer === 'weather' && weatherView === 'details' ? <label className="region-select"><span className="sr-only">{text.region}</span><select value={region} onChange={e => changeRegion(e.target.value as RegionId)}>{regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select><ChevronDown size={20}/></label> : <div className="overview-title"><h1>{layer === 'basins' ? ui.overview.basinTitle : layer === 'weather' ? rainMapCopy.maps : ui.overview.title}</h1>{layer === 'equipment' && <span className="overview-count" role="status">{equipment.loading ? ui.map.loading : equipment.data ? `${baseFilteredItems.length.toLocaleString()} ${query || filter !== 'ALL' || localRoute && alongRoute ? ui.overview.matches : ui.overview.count}` : ui.unavailableCount}</span>}</div>}
            <button className={`locate-button ${location ? 'located' : ''}`} aria-label={text.locate} title={text.locate} disabled={locating} onClick={locate}>{locating ? <LoaderCircle className="spin" size={18}/> : <Navigation size={18}/>}</button>
          </div>
          {layer !== 'basins' && <label className="search-field"><Search size={18}/><input value={query} onChange={e => { setQuery(e.target.value); setClusterIds(null); setSelected(null); if (layer !== 'equipment') setLayer('equipment'); }} onKeyDown={e => { if (e.key === 'Enter') setMobileList(true); }} placeholder={text.search} aria-label={text.search}/>{query && <button aria-label={text.clear} onClick={() => { setQuery(''); setClusterIds(null); }}><X size={15}/></button>}</label>}
        </div>
        {layer === 'equipment' && <div className="equipment-toolbar"><div className="filter-chips" aria-label={ui.filterLabel}>{equipmentTypes.map(type => <button key={type} disabled={!equipment.data} aria-pressed={filter === type} className={`${filter === type ? 'active' : ''} filter-${type}`} onClick={() => { setFilter(type); setSelected(null); setClusterIds(null); }}>{type === 'ALL' ? text.all : <><EquipmentIcon type={type} size={14}/>{text[type]}</>}<span>{equipment.data ? (type === 'ALL' ? allItems.length : typeCounts[type]).toLocaleString() : '—'}</span></button>)}</div></div>}
        {layer === 'weather' && weatherView === 'details' && <div className="mode-row"><span className={`mode-status ${mode === 'demo' ? 'demo' : ''}`}><span/>{mode === 'demo' ? text.demoNotice : ui.mode.official}</span><button onClick={() => { setMode(mode === 'live' ? 'demo' : 'live'); }}>{mode === 'live' ? text.demo : text.liveReturn}<ArrowRight size={12}/></button></div>}
        <div className="panel-content" ref={panelContent}>
          {routeError && <div className="notice warning" role="alert"><Info size={16}/><span>{routeError}</span><button aria-label={text.close} onClick={() => setRouteError('')}><X size={14}/></button></div>}
          {localRoute && <div className="local-route-panel"><div><RouteIcon size={17}/><strong>{localRoute.route.name}</strong><button aria-label={routeCopy.clear} onClick={() => { setLocalRoute(null); setSelected(null); setClusterIds(null); }}><X size={17}/></button></div><small>{localRoute.route.pointCount.toLocaleString()} {routeCopy.points} · {routeCopy.privacy}</small><div className="local-route-actions"><label><input type="checkbox" checked={alongRoute} onChange={e => { setAlongRoute(e.target.checked); setSelected(null); setClusterIds(null); }}/>{routeCopy.nearby}</label><button onClick={() => { setRouteFocus(value => value + 1); if (showRainMaps) setLayer('equipment'); }}>{routeCopy.focus}</button></div><p>{routeCopy.limit}</p></div>}
          {!online && <div className="notice warning" role="status"><WifiOff size={16}/><span><strong>{text.offline}</strong>{text.offlineDetail}</span></div>}
          {locationMessage && <div className="notice" role="status"><Navigation size={15}/><span>{locationMessage}</span><button aria-label={text.close} onClick={() => setLocationMessage('')}><X size={14}/></button></div>}
          {layer === 'equipment' && <>
            <div className="section-heading"><div><h2>{text.equipmentIntro}</h2><p>{equipment.loading ? text.pending : equipment.data ? `${filteredItems.length.toLocaleString()} ${text.results}` : ui.unavailableCount}</p></div></div>
            <p className="coverage-note">{ui.overview.coverage}</p>
            {equipmentSync.data && <div className={`equipment-sync-note ${equipmentSync.data.state === 'error' ? 'has-error' : ''}`} role="status"><RefreshCw size={14} className={equipmentSync.data.state === 'refreshing' ? 'spin' : ''}/><span>{ui.sync.label}：{formatTime(equipmentSync.data.fetchedAt)}<small>{equipmentSync.data.state === 'error' ? ui.sync.error : equipmentSync.data.state === 'refreshing' ? ui.sync.refreshing : equipmentSync.data.state === 'disabled' ? ui.sync.disabled : ui.sync.automatic}</small></span></div>}
            {equipment.loading && <Loading/>}
            {equipment.savedAt && <div className="notice warning"><ClockIcon/><span><strong>{text.saved}</strong>{text.savedAt}：{formatTime(equipment.savedAt)}</span></div>}
            {equipment.error && <ErrorNotice retry={equipment.retry} detail={equipment.data ? ui.equipment.retrySaved : ui.equipment.retryEmpty}/>}
            {equipment.data?.status === 'stale' && <div className="notice warning"><Info size={16}/><span><strong>{text.state.stale}</strong>{text.fetched}：{formatTime(equipment.data.fetchedAt)}</span></div>}
            {unknownCoordinates > 0 && <p className="coordinate-summary"><MapPin size={13}/>{unknownCoordinates} {ui.overview.unknown}</p>}
            <>{clusterIds && <div className="notice"><Layers size={15}/><span>{ui.map.group} · {clusterIds.length} {ui.map.cluster}<button className="text-button" onClick={() => setClusterIds(null)}>{ui.map.clearGroup}<X size={13}/></button></span></div>}</><div className="equipment-list">{visibleItems.map(item => <EquipmentCard key={item.id} item={item} selected={selected === item.id} onSelect={() => selected === item.id ? setSelected(null) : onSelect(item.id)} location={location}/>)}</div>
            {filteredItems.length > visibleItems.length && <div className="equipment-pagination"><p>{ui.overview.page} {visibleItems.length} / {filteredItems.length.toLocaleString()} {text.results}</p><button className="small-button" onClick={() => setVisibleLimit(limit => limit + 40)}>{ui.overview.more}<ChevronDown size={16}/></button><small>{ui.overview.mapCount}</small></div>}
            {!equipment.loading && !equipment.error && filteredItems.length === 0 && <div className="empty-state"><Search size={27}/><h3>{text.noResults}</h3><p>{filter === 'FIRST_AID' ? ui.equipment.firstAidEmpty : text.noResultsDetail}</p><button className="text-button" onClick={() => { setQuery(''); setFilter('ALL'); }}>{text.all}<ArrowRight size={14}/></button></div>}
            {equipment.data?.message && <p className="data-message">{equipment.data.message}</p>}
            <div className="panel-footnote"><ShieldCheck size={16}/><p>{ui.equipment.limit}</p></div>
          </>}

          {layer === 'weather' && <>
            <div className="weather-view-switch" aria-label={text.weather}>
              <button aria-pressed={weatherView === 'maps'} className={weatherView === 'maps' ? 'active' : ''} onClick={() => setWeatherView('maps')}><Map size={15}/>{rainMapCopy.maps}</button>
              <button aria-pressed={weatherView === 'details'} className={weatherView === 'details' ? 'active' : ''} onClick={() => setWeatherView('details')}><CloudRain size={15}/>{rainMapCopy.details}</button>
            </div>
            {weatherView === 'maps' ? <RainMapPanel catalog={rainMaps.data} loading={rainMaps.loading} error={rainMaps.error} retry={rainMaps.retry} controls={rainControls}/> : <>
              <div className="section-heading"><div><h2>{text.weather}</h2><p>{text.weatherSub}</p></div></div>
              {mode === 'demo' && <div className="notice warning demo-banner"><Info size={17}/><span><strong>{text.demoNotice}</strong>{text.demoDetail}</span></div>}
              {weather.loading && <Loading/>}{weather.error && <ErrorNotice retry={weather.retry} detail={text.noFakeZero}/>}
              {!weather.loading && weatherData && <WeatherPanel data={weatherData} kind={weatherKind} onKind={setWeatherKind} onDemo={() => setMode('demo')}/>}
            </>}
          </>}
          {layer === 'basins' && <>


            <p className="body-copy">{text.basinBody}</p>
            <div className="basin-selected"><div className="basin-selected-title"><Layers size={17}/><strong>{basin ? basin.name : text.basinNotSelected}</strong><span>{text.boundary}</span></div>{basin ? <dl className="detail-list"><div><dt>{text.basinId}</dt><dd>{basin.id}</dd></div><div><dt>{text.basinParent}</dt><dd>{basin.basin}</dd></div><div><dt>{text.basinYear}</dt><dd>{basin.year}</dd></div></dl> : <p>{ui.basin.choose}</p>}</div>
            <div className="notice"><Info size={16}/><span>{text.basinLimit}</span></div><div className="basin-rain"><CloudRain size={20}/><h4>{text.basinRain}</h4><p>{text.basinRainDetail}</p><button className="text-button" onClick={() => setLayer('weather')}>{text.weather}<ArrowRight size={14}/></button></div><a className="source-link" href="https://data.ardswc.gov.tw/Data/OpenData/Api" target="_blank" rel="noreferrer">{ui.basin.source}<ArrowUpRight size={14}/></a>
          </>}
        </div><footer className="panel-footer"><button onClick={() => setSources(true)}>{text.dataNote}<ArrowUpRight size={12}/></button></footer>
      </section>
      {showRainMaps ? <RainMapCanvas controls={rainControls} revision={rainRevision} loading={rainMaps.loading} error={rainMaps.error} onLoadState={setRainImageLoaded} onImageError={onRainImageError}/> : <MapBoundary className="map-area"><Suspense fallback={<section className="map-area map-loading" role="status"><p>正在載入地圖，文字資訊可先閱讀。</p></section>}><MapView sheetExpanded={mobileList} region={region} layer={layer} equipment={baseFilteredItems} selectedId={selected} onSelect={onSelect} onCluster={onCluster} onBasin={setBasin} location={location} products={weatherProducts} conditions={null} conditionQuery="" selectedConditionId={null} onConditionSelect={onConditionSelect} conditionSelectionRevision={0} onConditionHits={() => {}} onConditionsViewport={() => {}} route={localRoute?.route || null} routeFocus={routeFocus}/></Suspense></MapBoundary>}
      {layer === 'equipment' && equipmentMapNotice && <div className={`overview-data-notice ${equipment.error || equipment.data?.status === 'stale' ? 'warning' : ''}`} role="status">
        {equipment.loading ? <LoaderCircle size={16} className="spin"/> : <Info size={16}/>}
        <span>{equipmentMapNotice}</span>
        {equipment.error && <button aria-label={text.retry} onClick={equipment.retry}><RefreshCw size={16}/></button>}
      </div>}

      <button className="mobile-view-toggle" aria-expanded={mobileList} onClick={() => setMobileList(!mobileList)}>{mobileList ? <><Map size={16}/>{layer === 'equipment' ? ui.overview.collapse : ui.showMap}</> : <><Layers size={16}/>{layer === 'equipment' ? ui.overview.expand : ui.showData}</>}</button>
    </main>)}
    {plannerOpen && <PlanBoundary onClose={() => setPlannerOpen(false)}><Suspense fallback={<main id="tool-main" tabIndex={-1} className="planner-loading" role="status"><LoaderCircle size={20} className="spin"/>{routeCopy.planLoading}<button onClick={() => setPlannerOpen(false)}>{text.close}</button></main>}><PlanPanel onRegisterNavigation={registerPlannerLeave} onClose={() => setPlannerOpen(false)} localRouteName={localRoute?.route.name || null} localRoute={localRoute?.route || null} onImportGpx={() => routeInput.current?.click()} onViewRoute={referenceRouteId => {
      setPlannerOpen(false);
      if (referenceRouteId) {
        const item = agedConditions?.trails.items.find(item => item.trailId === referenceRouteId);
        if (item) { setQuery(''); setLayer('conditions'); onConditionSelect(item.id); }
      } else if (localRoute) { setLayer('equipment'); setRouteFocus(value => value + 1); }
    }} conditions={agedConditions} conditionsLoading={conditions.loading} conditionsError={conditions.error ? conditionsCopy.failed : null} onRetryConditions={conditions.retry}/></Suspense></PlanBoundary>}
    {sources && <dialog ref={sourceDialog} className="modal-backdrop" aria-labelledby="sources-title" onCancel={() => setSources(false)} onClick={e => { if (e.target === e.currentTarget) setSources(false); }}><section className="source-modal" aria-labelledby="sources-title"><div className="modal-heading"><button className="icon-button" aria-label={text.close} onClick={() => setSources(false)}><X size={22}/></button></div><h2 id="sources-title">{text.sourceIntro}</h2><p>{text.sourceDescription}</p><div className="source-list">{sourceLinks.map((s, i) => <a key={s.url} href={s.url} target="_blank" rel="noreferrer"><span className="source-number">0{i + 1}</span><span><small>{s.owner}</small><strong>{s.name}</strong><p>{s.note}</p></span><ArrowUpRight size={18}/></a>)}</div><h3>{text.privacyTitle}</h3><p>{text.privacyBody}</p><h3>{text.limitTitle}</h3><p>{text.limitBody}</p><p className="fine-print">{ui.sources.limitation}</p><div className="modal-footer"><span>{brand.name} · {ui.sources.local}</span><button className="primary-button" onClick={() => setSources(false)}>{ui.sources.back}<ArrowRight size={16}/></button></div></section></dialog>}
  </div>;
}
function ClockIcon() { return <RefreshCw size={16}/>; }
function Loading() { return <div className="loading-state" role="status"><LoaderCircle size={20} className="spin"/>{text.pending}</div>; }
function ErrorNotice({ retry, detail }: { retry: () => void; detail: string }) { return <div className="notice warning" role="alert"><Info size={17}/><span><strong>{text.loadError}</strong>{detail}</span><button className="icon-button" aria-label={text.retry} onClick={retry}><RefreshCw size={17}/></button></div>; }
