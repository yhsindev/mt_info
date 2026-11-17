import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CloudRain, Expand, Info, LoaderCircle, Minus, Pause, Play, Plus, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { rainMapCopy as copy } from '../rain-map-copy';
import type { RainMapControls } from './RainMapPanel';
import NcdrMpasViewer from './NcdrMpasViewer';
import './RainMap.css';
interface Props { controls: RainMapControls; revision: number; loading: boolean; error: boolean; onLoadState: (loaded: boolean) => void; onImageError: () => void }
export default function RainMapCanvas({ controls, revision, loading, error, onLoadState, onImageError }: Props) {
  const { product, productId, index, onIndex, playing, canPlay, onPlay, onRefresh, onProduct } = controls;
  const frame = product?.frames[index];
  const officialPage = product?.display === 'official-page';
  const viewport = useRef<HTMLDivElement>(null);
  const [imageState, setImageState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [zoom, setZoom] = useState(1), [size, setSize] = useState({ width: 800, height: 700 });
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  // Cache token controls image revalidation only; it never represents forecast issuance.
  const [cacheToken, setCacheToken] = useState(() => Math.floor(Date.now() / 600_000));
  useEffect(() => {
    const update = () => { if (!playing && navigator.onLine && document.visibilityState === 'visible') setCacheToken(Math.floor(Date.now() / 600_000)); };
    update(); const timer = setInterval(update, 60_000);
    document.addEventListener('visibilitychange', update);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, [revision, playing]);
  const imageUrl = frame ? `${frame.imageUrl}${frame.imageUrl.includes('?') ? '&' : '?'}mt_cache=${cacheToken}-${revision}` : '';
  useLayoutEffect(() => { setImageState('loading'); onLoadState(false); }, [imageUrl, onLoadState]);
  useEffect(() => {
    if (!imageUrl || imageState !== 'loading') return;
    const timer = setTimeout(() => { setImageState('error'); onLoadState(false); onImageError(); }, 16_000);
    return () => clearTimeout(timer);
  }, [imageUrl, imageState, onLoadState, onImageError]);
  useEffect(() => {
    if (!viewport.current) return;
    const observer = new ResizeObserver(entries => { const rect = entries[0].contentRect; setSize({ width: rect.width, height: rect.height }); });
    observer.observe(viewport.current); return () => observer.disconnect();
  }, [officialPage]);
  const imageHeight = Math.max(200, Math.min(size.height - 32, (size.width - 32) / (1245 / 1500))) * zoom;
  const imageWidth = imageHeight * (1245 / 1500);
  return <section className={`rain-map-canvas${officialPage ? ' rain-official-page' : ''}`} aria-label={copy.title}>
    <header className="rain-view-heading"><div><CloudRain size={18}/><strong>{product?.title || copy.title}</strong><>{frame && <span>{frame.label}</span>}</></div><span className={`rain-image-state ${imageState === 'error' ? 'failed' : ''}`}>{officialPage ? copy.mpasPage : frame ? imageState === 'loaded' ? copy.loaded : imageState === 'error' ? copy.imageError : copy.loading : product?.status === 'disabled' ? copy.ncdrNote : copy.catalogLoading}</span></header>
    <div className="rain-canvas-products" aria-label={copy.productLabel}>
      <button aria-pressed={productId === 'cwa-qpf-6h'} onClick={() => onProduct('cwa-qpf-6h')}>{copy.six}</button>
      <button aria-pressed={productId === 'cwa-qpf-12h'} onClick={() => onProduct('cwa-qpf-12h')}>{copy.twelve}</button>
      <button aria-pressed={productId === 'ncdr-mpas'} onClick={() => onProduct('ncdr-mpas')}>{copy.twoWeeks}</button>
    </div>
    {officialPage ? <NcdrMpasViewer pageUrl={product.pageUrl || ''} title={product.title} revision={revision} onRefresh={onRefresh}/> : <>
    {frame && <button className="rain-time-inset" disabled={imageState !== 'loaded'} title={copy.timeEnlarge} onClick={() => { setZoom(2); requestAnimationFrame(() => viewport.current?.scrollTo({ top: 0, left: 0 })); }}><span>{copy.timeEnlarged}</span><svg className={imageState === 'loaded' ? undefined : 'time-pending'} viewBox="35 48 1160 91" role="img" aria-label={copy.timeEnlarge}><image href={imageUrl} x="0" y="0" width="1245" height="1500"/></svg></button>}
    <div className="rain-image-area">
    <div className={`rain-image-viewport ${zoom > 1 ? 'zoomed' : ''}`} ref={viewport} tabIndex={0} aria-label={copy.zoomHint}
      onPointerDown={e => { if (zoom <= 1 || e.pointerType === 'touch') return; const el = e.currentTarget; drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop }; el.setPointerCapture(e.pointerId); }}
      onPointerMove={e => { if (!drag.current) return; const el = e.currentTarget; el.scrollLeft = drag.current.left - (e.clientX - drag.current.x); el.scrollTop = drag.current.top - (e.clientY - drag.current.y); }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      {frame && <div className="rain-image-stage" style={{ width: Math.max(size.width, imageWidth + 32), height: Math.max(size.height, imageHeight + 32) }}><img key={imageUrl} src={imageUrl} alt={copy.imageAlt(product?.title || copy.title, frame.label)} draggable={false} width={imageWidth} height={imageHeight} onLoad={() => { setImageState('loaded'); onLoadState(true); }} onError={() => { setImageState('error'); onLoadState(false); onImageError(); }} className={imageState === 'loaded' ? '' : 'image-hidden'}/></div>}
      {(!frame || imageState !== 'loaded') && <div className="rain-image-placeholder" role={imageState === 'error' || error ? 'alert' : 'status'}>{product?.status === 'disabled' ? <><CloudRain size={35}/><h2>{copy.ncdrNote}</h2><p>{copy.ncdrDetail}</p></> : error || imageState === 'error' && frame ? <><CloudRain size={32}/><h2>{copy.imageError}</h2><p>{copy.imageErrorDetail}</p><button className="primary-button" onClick={onRefresh}><RefreshCw size={15}/>{copy.refresh}</button></> : <><LoaderCircle size={28} className="spin"/><p>{loading ? copy.catalogLoading : copy.loading}</p></>}</div>}
    </div>
    {frame && <div className="rain-zoom-controls"><button aria-label={copy.zoomIn} title={copy.zoomIn} disabled={zoom >= 3} onClick={() => setZoom(z => Math.min(z + 0.5, 3))}><Plus size={19}/></button><button aria-label={copy.zoomOut} title={copy.zoomOut} disabled={zoom <= 1} onClick={() => setZoom(z => Math.max(z - 0.5, 1))}><Minus size={19}/></button><button aria-label={copy.returnAll} title={copy.returnAll} onClick={() => { setZoom(1); viewport.current?.scrollTo({ top: 0, left: 0 }); }}><Expand size={17}/></button></div>}
    {frame && <div className="rain-canvas-playback"><button aria-label={copy.previous} disabled={index === 0} onClick={() => onIndex(index - 1)}><ChevronLeft size={18}/></button><span>{frame.label}<small>{index + 1} / {product?.frames.length}</small></span><button aria-label={playing ? copy.pause : copy.play} disabled={!playing && !canPlay} onClick={onPlay}>{playing ? <Pause size={16}/> : <Play size={16}/>}</button><button aria-label={copy.next} disabled={index >= (product?.frames.length || 0) - 1} onClick={() => onIndex(index + 1)}><ChevronRight size={18}/></button></div>}
    </div>
    </>}
    <footer className="rain-canvas-footer"><Info size={13}/>{officialPage ? copy.mpasTimeNote : copy.timeNote}{!officialPage && zoom > 1 && <span>{copy.zoomHint}</span>}</footer>
  </section>;
}
