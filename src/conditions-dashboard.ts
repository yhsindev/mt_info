import { filterOfficialAlerts, filterTrailConditions } from './conditions-view';
import type { ConditionsResponse, OfficialAlert, TrailCondition, TrailConditionKind } from './shared/conditions';

export const DASHBOARD_REGIONS = ['north', 'central', 'south', 'east', 'cross', 'other'] as const;
export type DashboardRegion = typeof DASHBOARD_REGIONS[number];
export type DashboardFilter = 'all' | 'trails' | 'alerts' | TrailConditionKind;
export interface DashboardOptions { query?: string; type?: DashboardFilter; now?: number; sort?: 'latest' | 'oldest' }
export interface DashboardCounts {
  total: number | null;
  /** Actual listed records, even when an incomplete source prevents a complete total. */
  knownTotal: number;
  trails: number | null; alerts: number | null;
  closed: number | null; partial: number | null; caution: number | null; unknown: number | null;
}
export interface DashboardGroup { id: DashboardRegion; trails: TrailCondition[]; alerts: OfficialAlert[]; counts: DashboardCounts }
export interface ConditionsDashboard {
  groups: DashboardGroup[]; counts: DashboardCounts; totalCounts: DashboardCounts;
  available: { trails: boolean; alerts: boolean };
}

/** Product navigation groups, not a claim of an official administrative region standard. */
export const DASHBOARD_COUNTY_REGIONS: Readonly<Record<string, Exclude<DashboardRegion, 'cross'>>> = {
  臺北市: 'north', 新北市: 'north', 基隆市: 'north', 桃園市: 'north', 新竹縣: 'north', 新竹市: 'north', 宜蘭縣: 'north',
  苗栗縣: 'central', 臺中市: 'central', 彰化縣: 'central', 南投縣: 'central', 雲林縣: 'central',
  嘉義縣: 'south', 嘉義市: 'south', 臺南市: 'south', 高雄市: 'south', 屏東縣: 'south',
  花蓮縣: 'east', 臺東縣: 'east', 澎湖縣: 'other', 金門縣: 'other', 連江縣: 'other',
};
const normalize = (value: string) => value.normalize('NFKC').replace(/台/g, '臺').trim();

/** Use only the original county-bearing region/area fields; never infer from the title or manager. */
export function classifyDashboardRegion(value: string | readonly string[]): DashboardRegion {
  const fields = typeof value === 'string' ? [value] : value;
  const regions = new Set<Exclude<DashboardRegion, 'cross'>>();
  let unresolved = fields.length === 0;
  for (const value of fields) {
    const field = normalize(value);
    if (['全臺', '全臺灣', '全國', '臺灣全境'].includes(field)) return 'cross';
    let matched = false;
    for (const [county, region] of Object.entries(DASHBOARD_COUNTY_REGIONS)) {
      if (field.includes(county)) { matched = true; regions.add(region); }
    }
    if (!matched) unresolved = true;
  }
  // A genuinely multi-region announcement appears once in cross, not once per county.
  if (regions.size > 1) return 'cross';
  // For example, a county plus a separate sea-area description must not be
  // presented as exclusively belonging to that county's region.
  return unresolved ? 'other' : regions.values().next().value ?? 'other';
}

function unique<T extends { id: string }>(items: readonly T[]): T[] {
  const ids = new Set<string>();
  return items.filter(item => { if (ids.has(item.id)) return false; ids.add(item.id); return true; });
}
function order<T extends { id: string; issuedAt: string | null }>(items: T[], sort: 'latest' | 'oldest'): T[] {
  return [...items].sort((a, b) => {
    const aTime = a.issuedAt ? Date.parse(a.issuedAt) : NaN, bTime = b.issuedAt ? Date.parse(b.issuedAt) : NaN;
    if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return sort === 'latest' ? bTime - aTime : aTime - bTime;
    if (Number.isFinite(aTime) !== Number.isFinite(bTime)) return Number.isFinite(aTime) ? -1 : 1;
    return a.id.localeCompare(b.id, 'zh-TW');
  });
}
function counts(trails: TrailCondition[], alerts: OfficialAlert[], available: ConditionsDashboard['available'], filter: DashboardFilter): DashboardCounts {
  const needsTrails = filter !== 'alerts', needsAlerts = filter === 'all' || filter === 'alerts';
  const complete = (!needsTrails || available.trails) && (!needsAlerts || available.alerts);
  return {
    total: complete ? trails.length + alerts.length : null, knownTotal: trails.length + alerts.length,
    trails: available.trails ? trails.length : null, alerts: available.alerts ? alerts.length : null,
    closed: available.trails ? trails.filter(item => item.condition === 'closed').length : null,
    partial: available.trails ? trails.filter(item => item.condition === 'partial').length : null,
    caution: available.trails ? trails.filter(item => item.condition === 'caution').length : null,
    unknown: available.trails ? trails.filter(item => item.condition === 'unknown').length : null,
  };
}

/** One announcement belongs to one group. Missing/failed sources never become a complete zero. */
export function buildConditionsDashboard(data: ConditionsResponse | null, options: DashboardOptions = {}): ConditionsDashboard {
  const query = options.query ?? '', type = options.type ?? 'all', now = options.now ?? Date.now(), sort = options.sort ?? 'latest';
  const readable = (status: string | undefined) => status === 'ready' || status === 'empty' || status === 'stale';
  const available = { trails: readable(data?.trails.status), alerts: readable(data?.alerts.status) };
  const allTrails = unique(data?.trails.items ?? []);
  const allAlerts = unique(filterOfficialAlerts(data?.alerts.items ?? [], '', now));
  const trails = type === 'alerts' ? [] : order(filterTrailConditions(allTrails, query).filter(item => type === 'all' || type === 'trails' || item.condition === type), sort);
  const alerts = type === 'all' || type === 'alerts' ? order(filterOfficialAlerts(allAlerts, query, now), sort) : [];
  const groups: DashboardGroup[] = DASHBOARD_REGIONS.map(id => ({ id, trails: [], alerts: [], counts: counts([], [], available, type) }));
  const byRegion = new Map(groups.map(group => [group.id, group]));
  for (const item of trails) byRegion.get(classifyDashboardRegion(item.region))!.trails.push(item);
  for (const item of alerts) byRegion.get(classifyDashboardRegion(item.areas))!.alerts.push(item);
  for (const group of groups) group.counts = counts(group.trails, group.alerts, available, type);
  return { groups, counts: counts(trails, alerts, available, type), totalCounts: counts(allTrails, allAlerts, available, 'all'), available };
}
