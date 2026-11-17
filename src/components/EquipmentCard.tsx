import { ChevronDown, ExternalLink, HeartPulse, Package, Zap, MapPin, Clock } from 'lucide-react';
import { text, ui } from '../config';
import { distanceKm, formatTime } from '../utils';
import type { Equipment } from '../shared/types';
export function EquipmentIcon({ type, size = 19 }: { type: Equipment['type']; size?: number }) { const Icon = type === 'AED' ? Zap : type === 'PAC' ? HeartPulse : Package; return <Icon size={size}/>; }
export default function EquipmentCard({ item, selected, onSelect, location }: { item: Equipment; selected: boolean; onSelect: () => void; location: [number, number] | null }) {
  return <article className={`equipment-card ${selected ? 'is-selected' : ''}`}>
    <button className="equipment-summary" aria-expanded={selected} onClick={onSelect}>
      <span className={`equipment-icon type-${item.type}`}><EquipmentIcon type={item.type}/></span>
      <span className="equipment-heading"><span className="equipment-name">{item.name}</span><span className="equipment-place">{item.place}</span></span>
      <span className="type-label">{text[item.type]}</span><ChevronDown className={selected ? 'rotated' : ''} size={16}/>
    </button>
    <div className="equipment-provenance"><span>{item.source.dataset === '12063' ? ui.equipment.catalogue : ui.equipment.bulletin}</span><span>{item.source.name}</span></div>
    <div className="equipment-brief"><span><Clock size={12}/>{item.checkedAt ? ui.equipment.inspected : ui.equipment.recorded}</span><span>{location && item.longitude != null && item.latitude != null ? `${text.distance} ${distanceKm(location, [item.longitude, item.latitude]).toFixed(1)} km` : item.latitude == null ? text.positionUnknown : item.coordinateNote ? ui.equipment.coordinates : ui.equipment.officialCoordinates}</span></div>
    {selected && <div className="equipment-details">
      <div className="unknown-notice"><span className="status-dot"/>{text.currentUnknown}</div>
      <p className="check-note">{item.checkNote}</p>
      <dl className="detail-list">
        <div><dt>{text.location}</dt><dd>{item.place}</dd></div>
        <div><dt>{text.address}</dt><dd>{item.address || text.unknown}</dd></div>
        <div><dt>{text.placement}</dt><dd>{item.placement || text.unknown}</dd></div>
        <div><dt>{text.access}</dt><dd>{item.access || text.unknown}</dd></div>
        <div><dt>{text.manager}</dt><dd>{item.manager || text.unknown}</dd></div>
      </dl>
      {item.coordinateNote && <p className="coordinate-note"><MapPin size={13}/>{item.coordinateNote}</p>}
      {location && <p className="coordinate-note">{text.noWalking}</p>}
      <div className="timestamp-list"><span>{text.published}<b>{formatTime(item.publishedAt)}</b></span><span>{text.fetched}<b>{formatTime(item.fetchedAt)}</b></span><span>{text.checked}<b>{formatTime(item.checkedAt)}</b></span></div>
      <a className="source-link" href={item.source.url} target="_blank" rel="noopener noreferrer">{item.source.name}<ExternalLink size={13}/></a>
    </div>}
  </article>;
}
