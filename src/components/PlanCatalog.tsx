import { useId, useMemo, useState } from 'react';
import { ArrowRight, BedDouble, ChevronDown, CircleHelp, Droplets, ExternalLink, Route, Search, Tent, X } from 'lucide-react';
import { PLAN_RESOURCES, PLAN_TEMPLATES, findPlanTemplates, searchPlanResources, templateDataCoverage, type MountainRange, type PlanCategory, type PlanResource, type PlanTemplate, type ResourceType } from '../plan/catalog';
import { planCatalogCopy as copy } from '../plan/catalog-copy';
import { shangheSheetsForTemplate } from '../plan/shanghe-sheets';
import { formatTime } from '../utils';
import gpxCandidateLedger from '../../data/route-library/biji-gpx-candidates.json';
import './PlanCatalog.css';

export interface PlanCatalogProps { onUseTemplate: (id: string) => void; disabled?: boolean; currentRouteName?: string }
const CATEGORIES: PlanCategory[] = ['百岳', '中級山'];
const MOUNTAIN_RANGES = [...new Set(PLAN_TEMPLATES.map(template => template.mountainRange))];
const RESOURCE_TYPES: ResourceType[] = ['water', 'hut', 'camp'];
const resourcesById = new Map(PLAN_RESOURCES.map(resource => [resource.id, resource]));
const routesById = new Map(PLAN_TEMPLATES.map(template => [template.id, template]));
const resourceIcon = { water: Droplets, hut: BedDouble, camp: Tent };
type CommunityTrack = (typeof gpxCandidateLedger.candidates)[number];
const communityTracksByTemplate = new Map<string, CommunityTrack[]>();
for (const candidate of gpxCandidateLedger.candidates) {
  const tracks = communityTracksByTemplate.get(candidate.templateId) ?? [];
  tracks.push(candidate);
  communityTracksByTemplate.set(candidate.templateId, tracks);
}
for (const tracks of communityTracksByTemplate.values()) tracks.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt) || b.gpxId - a.gpxId);

function publicUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try { const url = new URL(value); return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
function routeResources(template: PlanTemplate): PlanResource[] {
  return [...new Set(template.resourceIds)].map(id => resourcesById.get(id)).filter((resource): resource is PlanResource => !!resource);
}
function officialLink(url: string | null | undefined, label: string) {
  const href = publicUrl(url);
  return href ? <a href={href} target="_blank" rel="noopener noreferrer"><span>{label}</span><ExternalLink size={14} aria-hidden="true"/></a> : <span className="pc-unknown-link">{copy.noLink}</span>;
}
function templateSourceLabel(url: string, index: number, total: number): string {
  const href = publicUrl(url);
  if (!href) return copy.sourceLink(copy.source, index, total);
  const source = new URL(href);
  if (source.hostname !== 'hiking.biji.co') return copy.sourceLink(copy.source, index, total);
  const kind = source.searchParams.get('q');
  return kind === 'trail' ? copy.bijiSource : kind === 'review' ? copy.bijiReviewSource : kind === 'news' ? copy.bijiArticleSource : copy.bijiOtherSource;
}

export default function PlanCatalog({ onUseTemplate, disabled = false, currentRouteName }: PlanCatalogProps) {
  const id = useId();
  const [mode, setMode] = useState<'routes' | 'resources'>('routes');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<PlanCategory | 'all'>('all');
  const [mountainRange, setMountainRange] = useState<MountainRange | 'all'>('all');
  const [resourceType, setResourceType] = useState<ResourceType | 'all'>('all');
  const templates = useMemo(() => findPlanTemplates(query, category === 'all' ? undefined : category, mountainRange === 'all' ? undefined : mountainRange), [query, category, mountainRange]);
  const resources = useMemo(() => {
    const unique = new Map(searchPlanResources(query, resourceType === 'all' ? undefined : resourceType).map(resource => [resource.id, resource]));
    return [...unique.values()].filter(resource => {
      if (category === 'all' && mountainRange === 'all') return true;
      return resource.routeIds.some(routeId => {
        const route = routesById.get(routeId);
        return route && (category === 'all' || route.category === category) && (mountainRange === 'all' || route.mountainRange === mountainRange);
      });
    });
  }, [query, category, mountainRange, resourceType]);
  const totalResources = new Set(PLAN_RESOURCES.map(resource => resource.id)).size;
  const shownCount = mode === 'routes' ? templates.length : resources.length;
  const hasFilters = !!query || category !== 'all' || mountainRange !== 'all' || (mode === 'resources' && resourceType !== 'all');
  const reset = () => { setQuery(''); setCategory('all'); setMountainRange('all'); setResourceType('all'); };
  return <section className="plan-catalog" aria-labelledby={`${id}-title`}>
    <header className="pc-heading"><div className="pc-heading-copy"><h2 id={`${id}-title`}>{copy.title}</h2>{currentRouteName?.trim() && <p className="pc-current-draft"><span>{copy.currentDraft}</span><strong>{currentRouteName}</strong></p>}</div>
      <div className="pc-mode-switch" role="group" aria-label={copy.viewLabel}><button type="button" aria-pressed={mode === 'routes'} onClick={() => setMode('routes')}><Route size={20} aria-hidden="true"/>{copy.routes}</button><button type="button" aria-pressed={mode === 'resources'} onClick={() => setMode('resources')}><Droplets size={20} aria-hidden="true"/>{copy.resources}</button></div>
    </header>
    <div className="pc-discovery">
      <div className="pc-search-field"><label className="pc-field-label" htmlFor={`${id}-search`}>{copy.searchLabel}</label><div className="pc-search"><Search size={20} aria-hidden="true"/><input id={`${id}-search`} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={copy.searchPlaceholder} aria-label={copy.search}/>{query && <button type="button" aria-label={copy.clearSearch} onClick={() => setQuery('')}><X size={18} aria-hidden="true"/></button>}</div></div>
      <div className="pc-filters">
      <div className="pc-category-filter"><span className="pc-field-label" id={`${id}-category`}>{copy.categoryLabel}</span><div className="pc-chips" role="group" aria-label={copy.categories} aria-describedby={`${id}-category`}><button type="button" aria-pressed={category === 'all'} onClick={() => setCategory('all')}>{copy.allCategories}</button>{CATEGORIES.filter(value => PLAN_TEMPLATES.some(template => template.category === value)).map(value => <button type="button" key={value} aria-pressed={category === value} onClick={() => setCategory(value)}>{value}</button>)}</div></div>
      <label className="pc-select-filter pc-range-filter"><span>{copy.mountainRange}</span><select value={mountainRange} aria-label={copy.mountainRange} onChange={event => setMountainRange(event.target.value as MountainRange | 'all')}><option value="all">{copy.allMountainRanges}</option>{MOUNTAIN_RANGES.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      {mode === 'resources' && <label className="pc-select-filter pc-resource-type"><span>{copy.resourceTypes}</span><select value={resourceType} aria-label={copy.resourceTypes} onChange={event => setResourceType(event.target.value as ResourceType | 'all')}><option value="all">{copy.allResources}</option>{RESOURCE_TYPES.map(value => <option key={value} value={value}>{copy.resourceKind[value]}</option>)}</select></label>}
      </div>
    </div>
    <div className="pc-results-bar"><p className="pc-result-count" role="status" aria-live="polite" aria-atomic="true">{mode === 'routes' ? copy.routeCount(templates.length, PLAN_TEMPLATES.length) : copy.resourceCount(resources.length, totalResources)}</p>{hasFilters && shownCount > 0 && <button type="button" className="pc-reset-filters" onClick={reset}><X size={16} aria-hidden="true"/>{copy.clearFilters}</button>}</div>
    <p className="pc-reference-note">{copy.referenceNote}{mode === 'resources' && <> {copy.sharedNote}</>}</p>
    {mode === 'routes' ? templates.length ? <div className={`pc-route-grid${templates.length === 1 ? ' is-single' : ''}`}>{templates.map(template => <TemplateCard key={template.id} template={template} onUse={() => onUseTemplate(template.id)} disabled={disabled}/>)}</div> : <EmptyResults text={copy.noMatches} reset={reset}/> : <>
      {resources.length ? <div className="pc-node-grid">{resources.map(resource => <ResourceCard key={resource.id} resource={resource}/>)}</div> : <EmptyResults text={copy.noResourceMatches} reset={reset}/>}
    </>}
  </section>;
}

function TemplateCard({ template, onUse, disabled }: { template: PlanTemplate; onUse: () => void; disabled: boolean }) {
  const resources = routeResources(template);
  const communityTracks = communityTracksByTemplate.get(template.id) ?? [];
  const shangheSheets = template.category === '百岳' ? shangheSheetsForTemplate(template.id) : [];
  const waterCount = resources.filter(resource => resource.type === 'water').length;
  const lodgingCount = resources.filter(resource => resource.type === 'hut' || resource.type === 'camp').length;
  const coverage = templateDataCoverage(template);
  const planningPending = template.planningReady === false;
  const planningReviewId = `pc-planning-review-${template.id}`;
  return <article className="pc-template-card" data-template-id={template.id}>
    <div className="pc-template-intro"><p className="pc-template-region"><span className="pc-category-tag">{template.category}</span><span>{template.mountainRange}</span><span>{template.region}</span></p><h3>{template.name}</h3>{template.summary && <p className="pc-template-summary">{template.summary}</p>}
      {(template.planningReview || planningPending) && <div className="pc-planning-review" id={planningReviewId} role="note"><strong>{planningPending ? copy.planningPending : copy.planningReview}</strong><p>{template.planningReview || copy.planningPendingReason}</p></div>}
      <dl className="pc-template-counts"><div><dt>{copy.days}</dt><dd>{copy.referenceDays(template.referenceDays)}</dd></div><div><dt>{copy.waterRecords}</dt><dd>{waterCount}</dd></div><div><dt>{copy.lodgingNodes}</dt><dd>{lodgingCount}</dd></div></dl>
      <div className="pc-template-meta"><span>{copy.grade}：{template.grade || copy.unknown}</span><p className="pc-template-coverage" aria-label={copy.dataCoverage}><span>{coverage.track === 'partial' ? copy.partialTrack : copy.missingTrack}</span><span>{copy.timedSegments(coverage.timed, coverage.total)}</span></p></div>
      {template.accessNotice && <div className="pc-access-notice"><p>{template.accessNotice.text}</p>{officialLink(template.accessNotice.sourceUrl, copy.accessNotice)}</div>}
      <p className="pc-template-checked"><span>{copy.checked}</span><time dateTime={template.checkedAt}>{formatTime(template.checkedAt)}</time></p>
      <button type="button" className="pc-use-template" onClick={onUse} disabled={disabled || planningPending} aria-describedby={planningPending ? planningReviewId : undefined}>{planningPending ? copy.planningPending : copy.use}{!planningPending && <ArrowRight size={18} aria-hidden="true"/>}</button>
    </div>
    <details className="pc-template-details"><summary>{copy.expandRoute}<ChevronDown size={17} aria-hidden="true"/></summary><div className="pc-template-expanded">
      <h4>{copy.routeOutline}</h4><ol className="pc-route-outline">{template.days.map((day, index) => <li key={`${index}-${day.label}`}><strong>{day.label}</strong><span>{day.stops.join(' → ')}</span></li>)}</ol><p className="pc-day-note">{copy.dayNote}</p>
      <dl className="pc-official-entries"><div><dt>{copy.application}</dt><dd>{officialLink(template.links.application, copy.verify)}</dd></div><div><dt>{copy.beds}</dt><dd>{officialLink(template.links.beds, copy.verify)}</dd></div><div><dt>{copy.status}</dt><dd>{officialLink(template.links.status, copy.verify)}</dd></div></dl>
      {shangheSheets.length > 0 && <section className="pc-shanghe-sheets" aria-label="上河圖幅對照"><h4>上河候選圖幅</h4><p>原站圖幅的涵蓋範圍尚未核對，不可視為本路線全段步程；本站未採錄分段分鐘。</p><div>{shangheSheets.map(sheet => <span key={sheet.id}>{officialLink(sheet.sourceUrl, `${sheet.id} · ${sheet.title}（原站查看）`)}</span>)}</div></section>}
      {communityTracks.length > 0 && <section className="pc-community-track" aria-label="山友軌跡參考"><h4>山友軌跡參考 <span>{communityTracks.length} 筆</span></h4><p className="pc-community-context">GPX 僅供私下比對地理路徑，不是推薦行程或上河步程時間；下載請至原站。</p>
        {communityTracks.slice(0, 2).map(track => <CommunityTrackRow key={track.gpxId} track={track}/>)}
        {communityTracks.length > 2 && <details className="pc-community-more"><summary>查看其餘 {communityTracks.length - 2} 筆參考軌跡</summary>{communityTracks.slice(2).map(track => <CommunityTrackRow key={track.gpxId} track={track}/>)}</details>}
      </section>}
      <h4>{copy.nodeTable}</h4>{resources.length ? <div className="pc-resource-table"><div className="pc-resource-table-labels" aria-hidden="true"><span>{copy.node}</span><span>{copy.type}</span><span>{copy.availability}</span><span/></div>{resources.map(resource => <ResourceCard key={resource.id} resource={resource} template={template} compact/>)}</div> : <p className="pc-day-note">{copy.noResources}</p>}
      <div className="pc-route-sources"><h4>{copy.source}</h4>{template.sourceUrls.map((url, index) => <div key={`${url}-${index}`}>{officialLink(url, templateSourceLabel(url, index, template.sourceUrls.length))}</div>)}</div>
    </div></details>
  </article>;
}
function CommunityTrackRow({ track }: { track: CommunityTrack }) {
  const planningSuitability = 'planningSuitability' in track ? track.planningSuitability : undefined;
  const waypointCount = track.fileInspection.waypoints;
  return <article className="pc-community-track-row">
    <h5>{track.sourceTitle}</h5>
    <p>{gpxCandidateLedger.platform} · {track.author} · 紀錄 {track.recordedAt}</p>
    <p>{track.versionDifference}</p>
    {planningSuitability && <p className="pc-community-suitability"><strong>資料適用範圍：</strong>{planningSuitability}</p>}
    {waypointCount <= 1 && <p>GPX 路點標記 {waypointCount} 個，範本路點仍待人工核對。</p>}
    {officialLink(track.sourceUrl, '至原站查看／下載')}
  </article>;
}
function ResourceCard({ resource, template, compact = false }: { resource: PlanResource; template?: PlanTemplate; compact?: boolean }) {
  const Icon = resourceIcon[resource.type];
  const related = resource.routeIds.map(id => routesById.get(id)).filter((route): route is PlanTemplate => !!route);
  const days = template?.days.filter(day => day.resourceIds.includes(resource.id)).map(day => day.label);
  return <details className={`pc-resource-card${compact ? ' pc-resource-compact' : ''}`} data-resource-id={resource.id}>
    <summary><span className="pc-resource-name"><Icon size={17} aria-hidden="true"/><span><strong>{resource.name}</strong>{!compact && <span>{resource.region || copy.unknown}</span>}</span></span><span className="pc-resource-kind">{copy.resourceKind[resource.type]}</span><span className="pc-availability"><CircleHelp size={13} aria-hidden="true"/>{copy.unknownAvailability}</span><ChevronDown className="pc-resource-chevron" size={16} aria-hidden="true"/>{!compact && <span className="pc-node-source-label">{copy.sourceName}：{resource.sourceName || copy.unknown}</span>}</summary>
    <div className="pc-resource-expanded">
      <dl className="pc-resource-fields"><div><dt>{copy.type}</dt><dd>{copy.resourceKind[resource.type]}</dd></div><div><dt>{copy.availability}</dt><dd>{copy.unknownAvailability}</dd></div><div><dt>{copy.region}</dt><dd>{resource.region || copy.unknown}</dd></div><div><dt>{copy.sourceName}</dt><dd>{resource.sourceName || copy.unknown}</dd></div><div><dt>{copy.published}</dt><dd>{formatTime(resource.sourcePublishedAt)}</dd></div><div><dt>{copy.observed}</dt><dd>{formatTime(resource.observedAt)}</dd></div><div><dt>{copy.checked}</dt><dd>{formatTime(resource.checkedAt)}</dd></div><div><dt>{copy.season}</dt><dd>{resource.season || copy.unknown}</dd></div><div><dt>{copy.limitations}</dt><dd>{resource.limitations || copy.unknown}</dd></div>{days?.length ? <div><dt>{copy.associatedDays}</dt><dd>{days.join('、')}</dd></div> : null}<div><dt>{copy.relatedRoutes}</dt><dd>{related.length ? related.map(route => route.name).join('、') : copy.unknown}</dd></div></dl>
      <p className="pc-node-note">{copy.availabilityNote}</p>
      <div className="pc-resource-sources">{resource.sourceUrls.map((url, index) => <div key={`${url}-${index}`}>{officialLink(url, copy.sourceLink(resource.sourceName || copy.source, index, resource.sourceUrls.length))}</div>)}</div>
    </div>
  </details>;
}
function EmptyResults({ text, reset }: { text: string; reset: () => void }) { return <div className="pc-empty" role="status"><p>{text}</p><button type="button" onClick={reset}>{copy.clearFilters}</button></div>; }
