import { useEffect, useState } from 'react';
import { CloudRain, Thermometer, Droplets, ExternalLink, Clock, ArrowRight, CircleHelp, Radio } from 'lucide-react';
import { text, ui } from '../config';
import { itemsAtTime } from '../shared/weather-view';
import { formatTime } from '../utils';
import type { WeatherKind, WeatherProduct, WeatherResponse } from '../shared/types';
export default function WeatherPanel({ data, onDemo, kind, onKind }: { data: WeatherResponse | null; onDemo: () => void; kind: WeatherKind; onKind: (value: WeatherKind) => void }) {
  const [index, setIndex] = useState(0);
  const products = data?.products || [];
  const product = products.find(p => p.kind === kind);
  const tabs = ui.weather.tabs;
  const names = [...new Set(product?.items.map(i => i.name) || [])];
  const [pointName, setPointName] = useState('');
  const selectedName = names.includes(pointName) ? pointName : names[0];
  const pointItems = product?.items.filter(i => i.name === selectedName) || [];
  const times = [...new Set(pointItems.map(i => i.startsAt))].sort((a, b) => Date.parse(a) - Date.parse(b));
  const time = times[Math.min(index, Math.max(times.length - 1, 0))];
  const items = itemsAtTime(pointItems, time);
  useEffect(() => {
    const now = Date.now();
    const first = times.findIndex(t => pointItems.some(i => i.startsAt === t && Date.parse(i.endsAt) >= now));
    if (product?.kind === 'observation') setIndex(Math.max(times.length - 1, 0));
    else setIndex(first >= 0 ? first : Math.max(times.length - 1, 0));
  }, [product?.id, product?.fetchedAt, selectedName, data?.mode, data?.region]);
  const elapsed = product?.kind !== 'observation' && items.length > 0 && items.every(i => Date.parse(i.endsAt) < Date.now());
  const noKey = products.some(p => p.status === 'unconfigured');
  return <div className="weather-panel">
    <div className="weather-tabs" aria-label={ui.weather.productLabel}>{tabs.map(t => <button key={t.id} className={kind === t.id ? 'active' : ''} onClick={() => { onKind(t.id as WeatherKind); setIndex(0); }}>{t.name}</button>)}</div>
    {noKey && <div className="setup-card"><span className="setup-icon"><CloudRain size={25}/></span><h3>{text.notConfigured}</h3><p>{text.notConfiguredDetail}</p><button className="primary-button" onClick={onDemo}>{text.previewDemo}<ArrowRight size={16}/></button></div>}
    {product && <ProductHeader product={product}/>}
    {names.length > 1 && <label className="station-select">{text.station}<select value={selectedName} onChange={e => { setPointName(e.target.value); setIndex(0); }}>{names.map(n => <option key={n}>{n}</option>)}</select></label>}
    {items.length > 0 ? <>
      {(elapsed || product?.status === 'demo') && <p className="period-note">{product?.status === 'demo' ? ui.weather.sampleTime : ui.weather.elapsed}</p>}
      <div className="weather-values">{items.map(item => <div key={item.id} className="value-card">{item.metric === 'temperature' ? <Thermometer size={18}/> : item.metric === 'condition' ? <CloudRain size={18}/> : <Droplets size={18}/>}<span>{ui.weather.metrics[item.metric]}</span><strong>{item.metric === 'condition' ? item.description || text.unknown : item.value === null ? ui.weather.missing : item.value}<small>{item.value !== null && item.metric !== 'condition' ? item.unit : ''}</small></strong>{item.status === 'stale' && <span className="status-badge status-stale">{text.state.stale}</span>}<span className="value-range">{formatTime(item.startsAt, true)}{item.endsAt !== item.startsAt && <> → {formatTime(item.endsAt, true)}</>}</span>{item.description && item.metric !== 'condition' && <span className="value-description">{item.description}</span>}</div>)}</div>
      {times.length > 1 && <div className="timeline"><div><Clock size={14}/><span>{text.period}</span><b>{Math.min(index + 1, times.length)} / {times.length}</b></div><input aria-label={ui.weather.timeLabel} type="range" min={0} max={times.length - 1} value={Math.min(index, times.length - 1)} onChange={e => setIndex(Number(e.target.value))}/><div className="timeline-ends"><span>{formatTime(times[0], true)}</span><span>{formatTime(times.at(-1), true)}</span></div></div>}
    </> : product && product.status !== 'unconfigured' && <div className="empty-inline"><CircleHelp size={20}/><p>{text.weatherNoData}</p><span>{text.noFakeZero}</span></div>}
    {product && <div className="weather-times"><span>{text.issued}<b>{formatTime(product.issuedAt)}</b></span><span>{text.valid}<b>{formatTime(product.validFrom)} → {formatTime(product.validTo)}</b></span><span>{text.fetched}<b>{formatTime(product.fetchedAt)}</b></span></div>}
    <p className="fine-print">{ui.weather.limit}</p>
    <div className="ncdr-note"><Radio size={18}/><span><strong>NCDR</strong><small>{ui.weather.ncdrNote}</small></span><a href="https://watch.ncdr.nat.gov.tw/watch_api_open" target="_blank" rel="noreferrer" aria-label={ui.weather.ncdrSource}><ExternalLink size={14}/></a></div>
  </div>;
}
function ProductHeader({ product }: { product: WeatherProduct }) {
  return <div className="product-header"><div><span className={`status-badge status-${product.status}`}>{text.state[product.status]}</span><h3>{product.title}</h3><p>{product.message}</p></div>{product.status !== 'demo' && <a href={product.source.url} title={product.source.name} target="_blank" rel="noreferrer" aria-label={`${text.official}：${product.source.name}`}><ExternalLink size={16}/></a>}</div>;
}
