import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import type { ConditionsResponse } from '../shared/conditions';
import { ageConditions } from '../shared/conditions-freshness';
import { useClock } from '../hooks';
import { formatTime } from '../utils';
import { compareNoticeChecks, createNoticeCheck, noticeRecords, NOTICE_CHECKS_KEY, readNoticeChecks, writeNoticeCheck, type NoticeRecord } from '../plan/notice-checks';
import { planCopy } from '../plan/copy';

interface Props { routeId: string | null; officialUrl?: string; conditions: ConditionsResponse | null; onUpdated: () => void; download: (raw: string, filename: string) => void }
function Notice({ item }: { item: NoticeRecord }) {
  return <article className="departure-notice"><h4>{item.headline || item.name}</h4><p className="departure-meta">{item.manager || '發布單位未知'} · {item.rawCondition || '狀況未知'}{item.section ? ` · ${item.section}` : ''}</p><dl className="departure-dates"><div><dt>來源發布</dt><dd>{formatTime(item.issuedAt)}</dd></div><div><dt>來源更新</dt><dd>{formatTime(item.updatedAt)}</dd></div><div><dt>封閉起日</dt><dd>{formatTime(item.closureDate)}</dd></div><div><dt>預計開放</dt><dd>{formatTime(item.expectedOpeningDate)}</dd></div></dl><p className="departure-source-text">{item.description || '來源未提供內文。'}</p><a className="departure-link" href={item.sourceUrl} target="_blank" rel="noopener noreferrer">查看官方原文<ExternalLink size={15}/></a></article>;
}
export default function DepartureNotices({ routeId, officialUrl, conditions, onUpdated, download }: Props) {
  const [stored,setStored] = useState(readNoticeChecks), [manual,setManual] = useState<ConditionsResponse | null>(null);
  const [busy,setBusy] = useState(false), [message,setMessage] = useState(''), [failed,setFailed] = useState(false), [reset,setReset] = useState(false);
  const [messageError,setMessageError] = useState(false);
  const request = useRef<AbortController | null>(null), now = useClock();
  useEffect(() => () => { const controller = request.current; request.current = null; controller?.abort(); }, []);
  const source = useMemo(() => {
    const latest = manual && (Date.parse(manual.trails.checkedAt || '') || 0) >= (Date.parse(conditions?.trails.checkedAt || '') || 0) ? manual : conditions || manual;
    return ageConditions(latest,now,failed)?.trails ?? null;
  },[manual,conditions,now,failed]);
  const supported = !!routeId && ['027','139','119','064'].includes(routeId);
  const current = source && supported ? createNoticeCheck(source,routeId!,now) : null;
  const baseline = routeId ? stored.checks[routeId] : undefined;
  const diff = current && baseline ? compareNoticeChecks(baseline,current) : null;
  const displayItems = current?.items ?? baseline?.items ?? noticeRecords(source?.items || [],routeId || '');
  const refresh = async () => {
    if (request.current) return;
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setMessageError(false); setMessage('正在向來源重新查核，以下保留先前資料。');
    const timeout = setTimeout(() => controller.abort(),30_000);
    try {
      const response = await fetch('/api/conditions/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',cache:'no-store',signal:controller.signal});
      if (!response.ok) throw new Error(response.status === 429 ? `查核較頻繁，請 ${response.headers.get('Retry-After') || '稍後'} 秒後再試。` : '重新查核未完成，請稍後再試。');
      const value = await response.json() as ConditionsResponse;
      if (!value.trails || !Array.isArray(value.trails.items) || !value.alerts) throw new Error('回傳資料無法辨識，保留先前紀錄。');
      setManual(value);
      const successful = !!createNoticeCheck(value.trails,routeId!,Date.now());
      setFailed(!successful);
      setMessage(successful ? '已完成來源查核。請先閱讀差異，再保存作為下次比對。' : '來源查核未成功或仍在重試等待；以下保留舊資料與原有時間。');
      onUpdated();
    } catch (error) {
      if (request.current !== controller) return;
      setFailed(true); setMessage(controller.signal.aborted ? '查核逾時或已中止，先前紀錄保持。' : error instanceof Error ? error.message : '無法查核，先前紀錄保持。');
    } finally { clearTimeout(timeout); if (request.current === controller) { request.current = null; setBusy(false); } }
  };
  const save = () => {
    if (!current || busy || failed) return;
    const snapshot = source && routeId ? createNoticeCheck(source,routeId,Date.now()) : null;
    if (!snapshot) { setMessageError(true); setMessage('來源資料已超過查核期限，請重新查核後再保存。'); return; }
    const result = writeNoticeCheck(snapshot);
    if (result.error) { setMessageError(true); setMessage(result.error); return; }
    setStored(readNoticeChecks()); setMessageError(false); setMessage('已保存本次查核，作為下次比對基準；原計畫中的公告快照保持。');
  };
  return <section className="departure-section" aria-labelledby="departure-notices-title">
    <div className="departure-section-heading"><div><p className="departure-kicker">公告查核</p><h2 id="departure-notices-title">和上次相比，有什麼變動？</h2></div>{supported && <button className="plan-button is-primary" disabled={busy} onClick={() => void refresh()}><RefreshCw size={17} aria-hidden="true"/>{busy ? '查核中…' : '重新查核'}</button>}</div>
    <p>依步道識別碼比對已收錄的林業署公告。來源可能有延遲或涵蓋缺口，仍需核對官方適用範圍與核准文件。</p>
    <div className="departure-inline-links">{officialUrl && <a className="departure-link" href={officialUrl} target="_blank" rel="noopener noreferrer">路線官方查詢<ExternalLink size={15}/></a>}<a className="departure-link" href="?layer=conditions" target="_blank" rel="noopener noreferrer">查看路況與全臺官方示警<ExternalLink size={15}/></a></div>
    {!supported ? <p className="departure-note">這條路線尚未建立可確認的公告對應，請由官方入口查核；這不表示沒有公告或限制。</p> : <>
      <p className="departure-meta">來源狀態：{source ? planCopy.states[source.status] : '尚未取得'} · 最後成功查核：{formatTime(source?.checkedAt ?? null)}</p>
      {message && <p className={`departure-note${failed || messageError ? ' is-warning' : ''}`} role={failed || messageError ? 'alert' : 'status'}>{message}</p>}
      {stored.error && <div className="departure-note is-warning" role="alert"><p>{stored.error}</p>{stored.raw !== null && <div className="plan-toolbar"><button className="plan-button" onClick={() => download(stored.raw!,'mt-info-notice-checks-original.json')}>下載原始紀錄</button><button className="plan-button" onClick={() => setReset(true)}>清除比對紀錄</button></div>}{reset && <div><p>清除後無法還原上次比對，請先下載原始紀錄。</p><button className="plan-button" onClick={() => setReset(false)}>取消清除</button><button className="plan-button" onClick={() => { try { window.localStorage.removeItem(NOTICE_CHECKS_KEY); setStored(readNoticeChecks()); setReset(false); } catch { setMessage('無法清除，原始紀錄保持。'); } }}>確認清除紀錄</button></div>}</div>}
      <p className="departure-meta">上次保存：{baseline ? formatTime(baseline.capturedAt) : '尚無比對基準'}{baseline && <> · 當時來源查核：{formatTime(baseline.checkedAt)}</>}</p>
      {!current && <p className="departure-note is-warning">目前資料無法作為新的比對結果，請重新查核。上次保存的公告仍可閱讀。</p>}
      {diff && <p className="departure-diff-summary">新增／內容更新 {diff.added.length} 筆 · 同筆內容有變 {diff.changed.length} 筆 · 本次未列出 {diff.absent.length} 筆{!diff.added.length && !diff.changed.length && !diff.absent.length && ' · 已收錄內容相同'}</p>}
      <p className="departure-meta">部分來源未提供固定公告編號，內容更新可能呈現為新增與舊筆未列出；未列出不表示解除限制。</p>
      <div className="departure-notice-list">{displayItems.map(item => <details key={item.id} className="departure-notice-detail"><summary><span>{item.headline || item.name}</span><span className="departure-meta">{!current ? baseline ? '上次保存' : '先前取得，待重查' : diff?.added.some(row => row.id === item.id) ? '新增／更新' : diff?.changed.some(row => row.after.id === item.id) ? '內容有變' : '查看內容'}</span></summary><Notice item={item}/>{diff?.changed.find(row => row.after.id === item.id) && <div className="departure-previous"><h3>上次保存的內容</h3><Notice item={diff.changed.find(row => row.after.id === item.id)!.before}/></div>}</details>)}</div>
      {current && !current.items.length && <p className="departure-note">本次來源未列出這條步道的公告，不代表已開放或沒有其他單位的限制。</p>}
      {!!diff?.absent.length && <details className="departure-notice-detail departure-previous"><summary>本次清單未列出的舊公告 · {diff.absent.length} 筆</summary>{diff.absent.map(item => <Notice key={item.id} item={item}/>)}</details>}
      <button className="plan-button" disabled={!current || busy || failed || !!stored.error} onClick={save}>保存這次查核</button>
    </>}
  </section>;
}
