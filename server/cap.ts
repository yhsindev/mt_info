import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { Polygon } from 'geojson';
import { timestamp } from './weather.js';

export interface CapMessage {
  identifier: string; sender: string; sent: string; status: string; msgType: string; scope: string;
  references: string[]; info: { headline: string; description: string; instruction: string; senderName: string; areas: string[]; effective: string | null; expires: string | null; event?: string; severity?: string; language?: string; polygons?: Polygon[] }[];
}
const asArray = <T>(v: T | T[] | undefined): T[] => v === undefined ? [] : Array.isArray(v) ? v : [v];
const str = (v: unknown) => typeof v === 'string' ? v : '';
const key = (m: Pick<CapMessage, 'sender' | 'identifier' | 'sent'>) => `${m.sender},${m.identifier},${m.sent}`;

/** CAP polygons use latitude,longitude; GeoJSON uses longitude,latitude. */
function polygon(value: unknown): Polygon[] {
  if (typeof value !== 'string') return [];
  const tokens = value.trim().split(/\s+/);
  if (tokens.length < 3 || tokens.length > 10_000) return [];
  // Number('') and Number('0x79') accept values that are not decimal coordinates.
  const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
  const pairs: [number, number][] = [];
  for (const token of tokens) {
    const parts = token.split(',');
    if (parts.length !== 2 || !parts.every(part => decimal.test(part))) return [];
    const lat = Number(parts[0]), lng = Number(parts[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return [];
    pairs.push([lat, lng]);
  }
  const ring = pairs.map(([lat, lng]) => [lng, lat]);
  if (ring[0][0] !== ring.at(-1)![0] || ring[0][1] !== ring.at(-1)![1]) ring.push([...ring[0]]);
  const vertices = ring.slice(0, -1);
  if (new Set(vertices.map(point => `${point[0]},${point[1]}`)).size < 3) return [];
  // Translate and scale before the shoelace sum, avoiding cancellation from the
  // absolute longitude/latitude. Collapsed, collinear and zero-area rings do not
  // describe a usable official affected area; the original text remains intact.
  const origin = vertices[0];
  let scale = 0, magnitude = 1;
  for (const point of vertices) {
    scale = Math.max(scale, Math.abs(point[0] - origin[0]), Math.abs(point[1] - origin[1]));
    magnitude = Math.max(magnitude, Math.abs(point[0]), Math.abs(point[1]));
  }
  if (!scale) return [];
  let twiceArea = 0;
  for (let index = 0; index < vertices.length; index++) {
    const a = vertices[index], b = vertices[(index + 1) % vertices.length];
    twiceArea += (a[0] - origin[0]) / scale * ((b[1] - origin[1]) / scale) - (b[0] - origin[0]) / scale * ((a[1] - origin[1]) / scale);
  }
  const tolerance = Number.EPSILON * vertices.length * 16 * magnitude / scale;
  if (Math.abs(twiceArea) <= tolerance) return [];
  return [{ type: 'Polygon', coordinates: [ring] }];
}

/** Strict XML parsing; lifecycle and source transport are handled separately. */
export function parseCap(xml: string): CapMessage {
  if (xml.length > 2_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error('無效的 CAP XML');
  const raw = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false }).parse(xml).alert;
  if (!raw || !str(raw.identifier) || !str(raw.sender) || !timestamp(raw.sent)) throw new Error('CAP 缺少識別或時間');
  const references = str(raw.references).trim().split(/\s+/).filter(Boolean);
  if (['Update', 'Cancel'].includes(raw.msgType) && (!references.length || references.some(reference => { const parts = reference.split(','); return parts.length !== 3 || !parts[0] || !parts[1] || !timestamp(parts[2]); }))) throw new Error('CAP 更新或取消缺少有效 reference');
  return { identifier: raw.identifier, sender: raw.sender, sent: raw.sent, status: str(raw.status), msgType: str(raw.msgType), scope: str(raw.scope), references, info: asArray<Record<string, unknown>>(raw.info).map(info => {
    if (info.effective !== undefined && !timestamp(info.effective)) throw new Error('CAP 生效時間無效');
    const areas = asArray<Record<string, unknown>>(info.area as Record<string, unknown> | Record<string, unknown>[] | undefined);
    const geometries = areas.flatMap(area => asArray(area.polygon)).map(polygon);
    // A partially omitted geometry could imply an incomplete affected area on the map.
    const polygons = geometries.every(shapes => shapes.length > 0) ? geometries.flat() : [];
    return { headline: str(info.headline), description: str(info.description), instruction: str(info.instruction), senderName: str(info.senderName), areas: areas.map(area => str(area.areaDesc)), effective: timestamp(info.effective), expires: timestamp(info.expires), event: str(info.event), severity: str(info.severity), language: str(info.language), polygons: polygons.length <= 32 && polygons.reduce((count, shape) => count + shape.coordinates[0].length, 0) <= 20_000 ? polygons : [] };
  }) };
}

/** Caller must retain lifecycle messages, including Cancel, across polling windows. */
export function activeCapMessages(messages: CapMessage[], now = new Date()): CapMessage[] {
  const active = new Map<string, CapMessage>(); const superseded = new Set<string>();
  const sorted = [...messages].filter(m => m.status === 'Actual' && m.scope === 'Public' && Date.parse(m.sent) <= now.getTime()).sort((a,b) => Date.parse(a.sent) - Date.parse(b.sent));
  for (const message of sorted) {
    if (!['Alert', 'Update', 'Cancel'].includes(message.msgType)) continue;
    if (message.msgType === 'Update' || message.msgType === 'Cancel') for (const reference of message.references) { superseded.add(reference); active.delete(reference); }
    const id = key(message);
    if (message.msgType !== 'Cancel' && !superseded.has(id)) active.set(id, message);
  }
  return [...active.values()].map(message => ({ ...message, info: message.info.filter(info => info.expires && Date.parse(info.expires) > now.getTime() && (!info.effective || Date.parse(info.effective) <= now.getTime())) })).filter(message => message.info.length > 0);
}
