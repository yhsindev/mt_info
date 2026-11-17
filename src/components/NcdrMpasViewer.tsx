import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ExternalLink, Info, LoaderCircle, RefreshCw, WifiOff } from 'lucide-react';
import { useOnline } from '../hooks';
import { NCDR_MPAS_PAGE_URL } from '../shared/rain-maps';
import '../ncdr-mpas.css';

export const ncdrMpasCopy = {
  source: 'NCDR 官方 MPAS 雙週預報頁面',
  experimental: '實驗性模式；模擬時間與預報時段請核對原站標示。',
  originalSite: '開啟 NCDR 原站',
  refresh: '重新載入',
  fit: '符合寬度（概覽）',
  original: '原始大小',
  sizeLabel: '官方頁面顯示大小',
  originalHint: '原站採寬版排列，可在下方頁面左右、上下捲動；切換概覽可查看整體排列。',
  fitHint: '概覽會縮小整個官方頁面；閱讀圖例與數字時請切換原始大小。',
  opening: '正在開啟官方頁面…',
  opened: '官方頁面已開啟；請核對原圖時間。',
  slow: '官方頁面載入較久，可重新載入或開啟原站。',
  failed: '無法確認官方頁面是否完整顯示，可重新載入或開啟原站。',
  offline: '目前離線，連線恢復後才能開啟官方頁面。',
  offlineExisting: '目前離線；保留已開啟頁面，無法確認更新狀態。',
  invalid: '尚未設定可用的 NCDR 官方頁面，請由原站查看。',
  limitation: '若畫面空白或無法操作，請開啟原站。本站無法確認頁面內每張預報圖的載入與更新狀態。',
  iframeTitle: (title: string) => `${title}｜NCDR 官方互動頁面`,
} as const;

interface Props {
  pageUrl: string;
  title: string;
  revision: number;
  onRefresh: () => void;
}
type PageState = 'opening' | 'opened' | 'slow' | 'failed';
type DisplaySize = 'original' | 'fit';
const OFFICIAL_DOCUMENT_WIDTH = 1150;
const VIEWPORT_HEIGHT = 720;
const FRAME_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox';

/** This frame reports navigation only. Cross-origin image/freshness checks are unavailable. */
function OfficialFrame({ title, displaySize, online }: { title: string; displaySize: DisplaySize; online: boolean }) {
  const [state, setState] = useState<PageState>('opening');
  const viewport = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(OFFICIAL_DOCUMENT_WIDTH);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => setWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (state !== 'opening' || !online) return;
    const timer = setTimeout(() => setState('slow'), 16_000);
    return () => clearTimeout(timer);
  }, [state, online]);

  const scale = displaySize === 'fit' ? Math.min(1, Math.max(1, width) / OFFICIAL_DOCUMENT_WIDTH) : 1;
  const frameStyle = displaySize === 'fit'
    ? { width: OFFICIAL_DOCUMENT_WIDTH, height: Math.ceil(VIEWPORT_HEIGHT / scale), transform: `scale(${scale})` }
    : { width: '100%', height: '100%' };
  return <>
    <p className={`ncdr-mpas-status ${state === 'slow' || state === 'failed' ? 'ncdr-mpas-status-warning' : ''}`} role="status" aria-live="polite">
      {state === 'opening' ? <LoaderCircle size={16} className="spin" aria-hidden="true"/> : <Info size={16} aria-hidden="true"/>}
      <span>{ncdrMpasCopy[state]}</span>
    </p>
    <div className={`ncdr-mpas-viewport ncdr-mpas-${displaySize}`} ref={viewport}>
      <iframe
        className="ncdr-mpas-frame"
        src={NCDR_MPAS_PAGE_URL}
        title={ncdrMpasCopy.iframeTitle(title)}
        sandbox={FRAME_SANDBOX}
        referrerPolicy="no-referrer"
        style={frameStyle}
        onLoad={() => setState('opened')}
        onError={() => setState('failed')}
      />
    </div>
  </>;
}

export default function NcdrMpasViewer({ pageUrl, title, revision, onRefresh }: Props) {
  const online = useOnline();
  const allowed = pageUrl === NCDR_MPAS_PAGE_URL;
  const [displaySize, setDisplaySize] = useState<DisplaySize>('original');
  // Retain the mounted attempt when connectivity changes. An offline page must not start a new navigation.
  const [attempt, setAttempt] = useState<number | null>(() => online && allowed ? revision : null);
  useEffect(() => {
    if (!allowed) { setAttempt(null); return; }
    if (online && allowed) setAttempt(revision);
  }, [online, allowed, revision]);
  const hasFrame = allowed && attempt !== null;

  return <div className="ncdr-mpas-viewer">
    <div className="ncdr-mpas-source">
      <div><p>{ncdrMpasCopy.experimental}</p></div>
      <div className="ncdr-mpas-actions">
        <a href={NCDR_MPAS_PAGE_URL} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"><ExternalLink size={16} aria-hidden="true"/>{ncdrMpasCopy.originalSite}</a>
        <button type="button" onClick={onRefresh} disabled={!online || !allowed}><RefreshCw size={16} aria-hidden="true"/>{ncdrMpasCopy.refresh}</button>
      </div>
    </div>
    <div className="ncdr-mpas-size-controls" role="group" aria-label={ncdrMpasCopy.sizeLabel}>
      <button type="button" aria-pressed={displaySize === 'original'} onClick={() => setDisplaySize('original')}>{ncdrMpasCopy.original}</button>
      <button type="button" aria-pressed={displaySize === 'fit'} onClick={() => setDisplaySize('fit')}>{ncdrMpasCopy.fit}</button>
    </div>
    <p className="ncdr-mpas-hint">{displaySize === 'fit' ? ncdrMpasCopy.fitHint : ncdrMpasCopy.originalHint}</p>
    {!online && <p className="ncdr-mpas-status ncdr-mpas-status-warning" role="status"><WifiOff size={16} aria-hidden="true"/><span>{hasFrame ? ncdrMpasCopy.offlineExisting : ncdrMpasCopy.offline}</span></p>}
    {hasFrame ? <OfficialFrame key={attempt} title={title} displaySize={displaySize} online={online}/> : <div className="ncdr-mpas-unavailable" role="status"><Info size={28} aria-hidden="true"/><p>{allowed ? ncdrMpasCopy.offline : ncdrMpasCopy.invalid}</p></div>}
    <p className="ncdr-mpas-limitation"><Info size={15} aria-hidden="true"/><span>{ncdrMpasCopy.limitation}</span></p>
  </div>;
}
