import { BookOpen, ChevronLeft, ChevronRight, ExternalLink, Info, LoaderCircle, Pause, Play, RefreshCw } from 'lucide-react';
import type { RainMapCatalog, RainMapProduct, RainMapProductId } from '../shared/rain-maps';
import { rainMapCopy as copy } from '../rain-map-copy';
import './RainMap.css';
export interface RainMapControls {
  product: RainMapProduct | null; productId: RainMapProductId; index: number;
  playing: boolean; canPlay: boolean; onProduct: (id: RainMapProductId) => void; onIndex: (index: number) => void;
  onPlay: () => void; onRefresh: () => void;
}
export default function RainMapPanel({ catalog, loading, error, retry, controls }: { catalog: RainMapCatalog | null; loading: boolean; error: boolean; retry: () => void; controls: RainMapControls }) {
  const { product, productId, index, playing, canPlay, onProduct, onIndex, onPlay, onRefresh } = controls;
  const frames = product?.frames || [];
  const officialPage = product?.display === 'official-page';
  return <div className="rain-controls">
    <div className="section-heading"><div><h2>{copy.title}</h2></div></div>
    <div className="rain-product-tabs" aria-label={copy.productLabel}>{[{ id: 'cwa-qpf-6h', label: copy.six }, { id: 'cwa-qpf-12h', label: copy.twelve }, { id: 'ncdr-mpas', label: copy.twoWeeks }].map(p => <button key={p.id} aria-pressed={productId === p.id} className={productId === p.id ? 'active' : ''} onClick={() => onProduct(p.id as RainMapProductId)}>{p.label}</button>)}</div>
    {loading && <div className="loading-state" role="status"><LoaderCircle size={19} className="spin"/>{copy.catalogLoading}</div>}
    {error && <div className="notice warning" role="alert"><Info size={17}/><span>{copy.catalogError}</span><button className="icon-button" aria-label={copy.refresh} onClick={retry}><RefreshCw size={17}/></button></div>}
    {product?.status === 'disabled' && <div className="rain-pending"><span className="status-badge">{copy.ncdrNote}</span><h3>{product.title}</h3><p>{product.message || copy.ncdrDetail}</p><p>{copy.ncdrDetail}</p></div>}
    {product?.status === 'available' && !officialPage && <>
      <div className="rain-product-heading"><span className="status-badge">{copy.original}</span><h3>{product.title}</h3><span>{copy.unit}</span></div>
      <div className="rain-frame-grid" aria-label={copy.frameLabel}>{frames.map((frame, i) => <button key={frame.id} onClick={() => onIndex(i)} className={index === i ? 'active' : ''} aria-pressed={index === i}><span>{String(i + 1).padStart(2, '0')}</span><strong>{frame.label}</strong></button>)}</div>
      <div className="rain-playback"><button aria-label={copy.previous} disabled={index === 0} onClick={() => onIndex(index - 1)}><ChevronLeft size={18}/></button><button className="rain-play-button" disabled={!playing && !canPlay} onClick={onPlay} aria-pressed={playing}>{playing ? <Pause size={16}/> : <Play size={16}/>}<span>{playing ? copy.pause : copy.play}</span></button><button aria-label={copy.next} disabled={index >= frames.length - 1} onClick={() => onIndex(index + 1)}><ChevronRight size={18}/></button></div>
      <label className="rain-range"><span>{copy.position}<b>{index + 1} / {frames.length}</b></span><input type="range" min={0} max={Math.max(frames.length - 1, 0)} value={index} onChange={e => onIndex(Number(e.target.value))} aria-label={copy.frameLabel}/></label>
      <p className="rain-time-note"><Info size={15}/>{copy.timeNote}</p>
      <p className="fine-print">{copy.leadNote}</p>
      <button className="rain-refresh text-button" onClick={onRefresh}><RefreshCw size={14}/>{copy.refresh}</button>
      <div className="rain-reading-note"><strong>{copy.rainNote}</strong><p>{copy.noAutomaticFreshness}</p><p>{copy.chartNote}</p></div>
    </>}
    {product && officialPage && <div className="rain-reading-note"><span className="status-badge">{copy.mpasExperimental}</span><h3>{product.title}</h3><p>{copy.mpasModel}</p><p>{copy.mpasTimeNote}</p><p>{copy.mpasInteraction}</p></div>}
    {product && <div className="rain-source"><BookOpen size={16}/><div><span>{copy.source}</span><a href={product.source.url} target="_blank" rel="noreferrer"><span>{product.source.name}</span><ExternalLink size={14} aria-hidden="true"/></a></div></div>}
    {!officialPage && <p className="fine-print">{copy.areaNote}</p>}
    <details className="rain-method"><summary>{copy.sourceDetails}</summary><p>{officialPage ? copy.mpasAbout : copy.aboutDetail}</p><p>{copy.savedNone}</p>{officialPage ? <a href="https://watch.ncdr.nat.gov.tw/watch_user" target="_blank" rel="noreferrer">{copy.mpasUsage}<ExternalLink size={12}/></a> : <a href="https://ben901227.github.io/rain-predit/" target="_blank" rel="noreferrer">{copy.reference}：{copy.referenceName}<ExternalLink size={12}/></a>}</details>
  </div>;
}
