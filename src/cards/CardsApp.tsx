import {useEffect, useMemo, useRef, useState, type ChangeEvent} from 'react';
import {ArrowLeft, ArrowRight, BookOpen, Check, Download, FileUp, Layers, Printer, RotateCcw, Shuffle, X} from 'lucide-react';
import {brand} from '../config';
import {CARD_CATALOG, getCard, QUIZ_QUESTIONS, type CardDefinition, type RoleDefinition} from './catalog';
import {drawCard, emptyCollection, recordCard, scoreQuiz, type CardCollection} from './model';
import {MAX_COLLECTION_BYTES, parseCollection, readCollection, replaceCollection, saveCollection} from './storage';
import {cardArtworkSvg} from './artwork';
import {createBookmarkSvg, createCardSvg, downloadCardImage} from './export';
import {readReturnPath} from './navigation';
import RestStop from './RestStop';
import {registerCardsOffline, type CardsOfflineStatus} from './offline';

type View = 'home' | 'quiz' | 'result' | 'collection' | 'rest';
type Pending = {kind:'import';collection:CardCollection;name:string} | {kind:'reset'} | {kind:'leave'};
const imageUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const dateLabel = (value: string) => new Intl.DateTimeFormat('zh-TW', {timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
function downloadText(body: string, name: string) {
  const url = URL.createObjectURL(new Blob([body], {type:'application/json;charset=utf-8'}));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
function CardView({card, flipped, onFlip, reveal = false}: {card:CardDefinition;flipped:boolean;onFlip:()=>void;reveal?:boolean}) {
  const art = useMemo(() => imageUrl(cardArtworkSvg(card.id)), [card.id]);
  return <button type="button" className={`sc-card${flipped ? ' is-flipped' : ''}${reveal ? ' is-revealed' : ''}`} onClick={onFlip} aria-label={`翻看「${card.title}」${flipped ? '正面' : '背面'}`}>
    <span className="sc-card-turn">
      <span className="sc-card-face sc-card-front" aria-hidden={flipped} style={{backgroundColor:card.paper}}>
        <span className="sc-card-edition"><span>山景・第一輯</span><span>{card.number} / 08</span></span>
        <img className="sc-card-art" src={art} alt="" draggable={false}/>
        <span className="sc-card-caption"><span className="sc-card-english">{card.englishTitle}</span><strong>{card.title}</strong><span className="sc-card-signature">{brand.name}</span></span>
      </span>
      <span className="sc-card-face sc-card-back" aria-hidden={!flipped}>
        <span className="sc-card-edition">山景・{card.number}</span><strong>{card.title}</strong><span>{card.description}</span><span className="sc-card-detail">{card.detail}</span><span className="sc-card-credit">mt_info 原創幾何圖像<br/>點一下，翻回正面</span>
      </span>
    </span>
  </button>;
}
export default function CardsApp() {
  const [initial] = useState(() => readCollection());
  const [collection, setCollection] = useState(initial.collection);
  const [storageError, setStorageError] = useState<string|null>(initial.error);
  const [unreadableRaw, setUnreadableRaw] = useState(initial.error ? initial.raw : null);
  const [unsaved, setUnsaved] = useState(false);
  const [view, setView] = useState<View>('home');
  const [answers, setAnswers] = useState<Record<string,string>>({}), [step, setStep] = useState(0);
  const [role, setRole] = useState<RoleDefinition|null>(null);
  const [current, setCurrent] = useState<CardDefinition>(CARD_CATALOG[0]);
  const [fromCollection, setFromCollection] = useState(false), [collected, setCollected] = useState(false), [flipped, setFlipped] = useState(false), [drawNumber, setDrawNumber] = useState(0);
  const [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [exportChoice, setExportChoice] = useState('card-png');
  const [pending, setPending] = useState<Pending|null>(null), [printCard, setPrintCard] = useState<CardDefinition|null>(null);
  const [offlineStatus, setOfflineStatus] = useState<CardsOfflineStatus>(import.meta.env.PROD ? 'installing' : 'development');
  const heading = useRef<HTMLHeadingElement>(null), importInput = useRef<HTMLInputElement>(null), dialog = useRef<HTMLDialogElement>(null), previousFocus = useRef<HTMLElement|null>(null);
  const returnPath = useMemo(() => readReturnPath(window.location.search), []);
  const question = QUIZ_QUESTIONS[step];
  const collectedEntry = collection.cards.find(entry => entry.cardId === current.id);
  const roleTitle = fromCollection ? undefined : role?.title;
  useEffect(() => { document.title = `${view === 'rest' ? '休息站' : '山行卡'} · ${brand.name}`; }, [view]);
  useEffect(() => registerCardsOffline(setOfflineStatus), []);
  useEffect(() => {
    if (!unsaved) return;
    const guard = (event:BeforeUnloadEvent) => {event.preventDefault(); event.returnValue = '';};
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [unsaved]);
  useEffect(() => {
    if (view !== 'home') { heading.current?.focus({preventScroll:true}); window.scrollTo({top:0,behavior:'instant'}); }
  }, [view, step]);
  useEffect(() => {
    if (!pending) return;
    previousFocus.current = document.activeElement as HTMLElement|null;
    dialog.current?.showModal();
    return () => { dialog.current?.close(); previousFocus.current?.focus(); };
  }, [pending]);
  function navigate(next: View) { setView(next); setNotice(''); }
  function startQuiz() { setAnswers({}); setStep(0); setRole(null); navigate('quiz'); }
  function reveal(nextRole:RoleDefinition|null = role) {
    try {
      const card = drawCard(); setCurrent(card); setRole(nextRole); setFlipped(false); setCollected(false); setFromCollection(false); setDrawNumber(value => value + 1); navigate('result');
    } catch { setNotice('暫時無法抽卡，請再試一次。'); }
  }
  function nextQuestion() {
    if (!answers[question.id]) return;
    if (step < QUIZ_QUESTIONS.length - 1) setStep(value => value + 1);
    else {
      const result = scoreQuiz(answers);
      if (!result) { setNotice('還有題目未作答，請返回確認。'); return; }
      reveal(result);
    }
  }
  function collect() {
    if (collected || fromCollection) return;
    try {
      const next = recordCard(collection, current.id);
      setCollection(next); setCollected(true);
      const saved = saveCollection(next); setStorageError(saved.error); setUnsaved(!!saved.error);
      setNotice(saved.error ? '這張卡已留在本次畫面，尚未保存；請備份圖鑑。' : collectedEntry ? '再次收藏，取得次數已更新。' : '已加入你的圖鑑。');
    } catch (error) { setNotice(error instanceof Error ? error.message : '暫時無法加入圖鑑，請先下載卡片。'); }
  }
  function retrySave() {
    const saved = saveCollection(collection); setStorageError(saved.error); setUnsaved(!!saved.error);
    if (!saved.error) { setUnreadableRaw(null); setNotice('圖鑑已保存在目前瀏覽器。'); }
  }
  function openCollected(card:CardDefinition) {
    setCurrent(card); setFromCollection(true); setCollected(true); setFlipped(false); navigate('result');
  }
  async function importBackup(event:ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    if (file.size > MAX_COLLECTION_BYTES) { setNotice('備份檔過大，請使用本站匯出的圖鑑 JSON。'); return; }
    try { setPending({kind:'import', collection:parseCollection(await file.text()), name:file.name}); }
    catch (error) { setNotice(error instanceof Error ? error.message : '無法讀取這份圖鑑備份；目前收藏沒有變更。'); }
  }
  function confirmReplacement() {
    if (!pending) return;
    if (pending.kind === 'leave') { setUnsaved(false); window.setTimeout(() => window.location.assign(returnPath), 0); return; }
    const next = pending.kind === 'import' ? pending.collection : emptyCollection();
    const saved = replaceCollection(next);
    if (saved.error) { setStorageError(saved.error); setNotice('未能寫入本機，現在的圖鑑沒有變更。'); setPending(null); return; }
    setCollection(next); setStorageError(null); setUnreadableRaw(null); setUnsaved(false); setCollected(fromCollection || next.cards.some(entry => entry.cardId === current.id));
    setNotice(pending.kind === 'import' ? '已還原圖鑑。' : '已清空圖鑑。'); setPending(null);
  }
  async function exportImage() {
    if (busy) return; setBusy(true); setNotice('');
    const [kind, format] = exportChoice.split('-') as ['card'|'bookmark','png'|'svg'];
    try {
      const actual = await downloadCardImage(current, format, kind, roleTitle);
      setNotice(format === 'png' && actual === 'svg' ? 'PNG 未能產生，已改下載 SVG。' : '已產生下載檔案。');
    }
    catch (error) { setNotice(error instanceof Error ? error.message : '圖片產生失敗，請改下載 SVG。'); }
    finally { setBusy(false); }
  }
  function printBookmark() {
    setPrintCard(current);
    // Let the print-only image decode before opening the browser print dialog.
    requestAnimationFrame(() => {
      const image = document.querySelector<HTMLImageElement>('.sc-print-bookmark img');
      const ready = image?.decode().catch(() => {}) ?? Promise.resolve();
      void ready.then(() => window.print());
    });
  }
  function returnToTool(event:React.MouseEvent<HTMLAnchorElement>) {
    if (!unsaved || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); setPending({kind:'leave'});
  }
  return <>
    <div className="sc-screen">
      <a className="skip-link" href="#cards-main">略過導覽，前往山行卡內容</a>
      <header className="sc-header"><div className="sc-header-inner"><a className="sc-brand" href={returnPath} onClick={returnToTool} aria-label="mt_info 返回工具"><span><img src="/brand/mt-info-symbol-reverse.svg" alt="" width="30" height="30"/></span><strong>{brand.name}</strong></a><a className="sc-return" href={returnPath} onClick={returnToTool}><ArrowLeft size={17}/>返回工具</a></div></header>
      <main id="cards-main" tabIndex={-1} className="sc-main">
        <nav className="sc-nav" aria-label="山行卡檢視"><button aria-pressed={view === 'home' || view === 'quiz' || view === 'result'} onClick={() => navigate('home')}><Layers size={17}/>山行卡</button><button aria-pressed={view === 'rest'} onClick={() => navigate('rest')}>休息站</button><button aria-pressed={view === 'collection'} onClick={() => navigate('collection')}><BookOpen size={17}/>我的圖鑑<span className="sc-count">{collection.cards.length} / 8</span></button></nav>
        {storageError && <section className="sc-storage-warning" role="alert"><div><strong>收藏尚未完整保存</strong><p>{storageError}</p></div><div className="sc-warning-actions"><button onClick={() => downloadText(JSON.stringify(collection,null,2),'mt_info_山行卡圖鑑.json')}><Download size={16}/>備份本次圖鑑</button>{unreadableRaw !== null ? <><button onClick={() => downloadText(unreadableRaw,'mt_info_圖鑑原始資料.json')}>備份原始資料</button><button onClick={() => setPending({kind:'reset'})}>重建圖鑑</button></> : <button onClick={retrySave}>重試保存</button>}</div></section>}
        {notice && <div className="sc-notice" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="關閉提示"><X size={16}/></button></div>}
        {view === 'rest' ? <RestStop heading={heading} offlineStatus={offlineStatus}/> : view === 'collection' ? <section className="sc-collection" aria-labelledby="sc-heading">
          <div className="sc-collection-heading"><div><p className="sc-eyebrow">山景・第一輯</p><h1 id="sc-heading" ref={heading} tabIndex={-1}>我的圖鑑 <span>{collection.cards.length}<small> / 8</small></span></h1><p>收藏留在目前瀏覽器{unsaved ? '，本次變更尚未保存' : ''}。可下載備份，帶到另一台裝置還原。</p></div><button className="sc-button sc-primary" onClick={() => reveal(null)}><Shuffle size={17}/>再抽一張</button></div>
          <div className="sc-collection-progress" aria-label={`已收藏 ${collection.cards.length} 張，共 8 張`}><span style={{width:`${collection.cards.length / 8 * 100}%`}}/></div>
          <div className="sc-collection-grid">{CARD_CATALOG.map(card => {
            const entry = collection.cards.find(item => item.cardId === card.id);
            return entry ? <button className="sc-collection-card" key={card.id} onClick={() => openCollected(card)} aria-label={`查看${card.title}，取得 ${entry.count} 次`}><img src={imageUrl(createCardSvg(card))} alt="" loading="lazy"/><span className="sc-collection-card-title"><strong>{card.title}</strong><span>{card.number}</span></span><span className="sc-collection-card-meta">{dateLabel(entry.firstObtainedAt)} · {entry.count} 次</span></button>
              : <article className="sc-collection-card is-locked" key={card.id} aria-label={`${card.title}，尚未收藏`}><div className="sc-card-placeholder"><img src="/brand/mt-info-symbol-reverse.svg" alt="" width="46" height="46"/><span>{card.number}</span></div><span className="sc-collection-card-title"><strong>{card.title}</strong><span>{card.number}</span></span><span className="sc-collection-card-meta">尚未收藏</span></article>;
          })}</div>
          <div className="sc-collection-tools"><button className="sc-button" onClick={() => downloadText(JSON.stringify(collection,null,2),'mt_info_山行卡圖鑑.json')}><Download size={17}/>備份圖鑑</button><button className="sc-button" onClick={() => importInput.current?.click()}><FileUp size={17}/>還原備份</button><button className="sc-text-button" onClick={() => setPending({kind:'reset'})}>清空圖鑑</button><input ref={importInput} type="file" accept=".json,application/json" onChange={importBackup} hidden/></div>
        </section> : <section className={`sc-workspace sc-view-${view}`} aria-labelledby="sc-heading">
          <div className="sc-content">
            {view === 'home' && <><p className="sc-eyebrow">山景・第一輯</p><h1 id="sc-heading" ref={heading} tabIndex={-1}>山行卡</h1><p className="sc-intro">做個小測驗，看看你的山行偏好。<br/>抽一張山景，收進圖鑑，也能印成書籤。</p><div className="sc-start-actions"><button className="sc-button sc-primary" onClick={startQuiz}>開始測驗<ArrowRight size={18}/></button><button className="sc-button" onClick={() => reveal(null)}><Shuffle size={17}/>直接抽卡</button></div><p className="sc-meta">6 道情境題 · 4 種偏好 · 8 張山景卡</p><div className="sc-home-bottom"><span className="sc-edition-line"/><span>幾何山景<br/>mt_info 原創系列</span><span className="sc-home-number">01—08</span></div></>}
            {view === 'quiz' && <><div className="sc-question-top"><span className="sc-eyebrow">山行偏好測驗</span><span className="sc-meta">{step + 1} / {QUIZ_QUESTIONS.length}</span></div><div className="sc-question-progress" aria-label={`第 ${step + 1} 題，共 ${QUIZ_QUESTIONS.length} 題`}>{QUIZ_QUESTIONS.map((item,index) => <span key={item.id} className={index <= step ? 'is-done' : ''}/>)}</div><h1 id="sc-heading" ref={heading} tabIndex={-1} className="sc-question-title">{question.title}</h1><fieldset className="sc-answers"><legend className="sc-sr-only">{question.title}</legend>{question.choices.map((choice,index) => <label key={choice.id} className={answers[question.id] === choice.id ? 'is-selected' : ''}><input type="radio" name={question.id} value={choice.id} checked={answers[question.id] === choice.id} onChange={() => setAnswers(value => ({...value,[question.id]:choice.id}))}/><span className="sc-answer-letter">{'ABCD'[index]}</span><span>{choice.label}</span><Check size={17} aria-hidden="true"/></label>)}</fieldset><div className="sc-quiz-navigation"><button className="sc-text-button" onClick={() => step ? setStep(value => value - 1) : navigate('home')}><ArrowLeft size={17}/>{step ? '上一題' : '返回'}</button><button className="sc-button sc-primary" disabled={!answers[question.id]} onClick={nextQuestion}>{step === QUIZ_QUESTIONS.length - 1 ? '查看結果' : '下一題'}<ArrowRight size={17}/></button></div><p className="sc-meta sc-quiz-note">依當下偏好作答即可，沒有標準答案。</p></>}
            {view === 'result' && <><p className="sc-eyebrow">{fromCollection ? '我的收藏' : role ? '你的山行偏好' : '山景・第一輯'}</p><h1 id="sc-heading" ref={heading} tabIndex={-1}>{fromCollection ? current.title : role?.title || '這次的山景'}</h1>{role && !fromCollection ? <><p className="sc-result-description">{role.description}</p><p className="sc-meta">趣味偏好描述，與隨機抽取的山景卡分開呈現。</p></> : <p className="sc-result-description">{current.description}</p>}<div className="sc-drawn-label"><span>{current.number}</span><div><strong>{current.title}</strong><small>{current.englishTitle}</small></div>{collectedEntry && <span className="sc-already-collected"><Check size={15}/>已收藏</span>}</div><div className="sc-result-actions">{!fromCollection && <button className="sc-button sc-primary" disabled={collected} onClick={collect}><Check size={17}/>{collected ? unsaved ? '本次已收下 · 待保存' : '已加入圖鑑' : '加入圖鑑'}</button>}<button className="sc-button" onClick={() => reveal(role)}><Shuffle size={17}/>再抽一張</button><button className="sc-text-button" onClick={() => navigate('collection')}><BookOpen size={17}/>查看圖鑑</button></div><section className="sc-export" aria-label="卡片下載與書籤"><h2>下載與書籤</h2><div className="sc-export-controls"><label><span className="sc-sr-only">匯出格式</span><select aria-label="匯出格式" value={exportChoice} onChange={event => setExportChoice(event.target.value)}><option value="card-png">卡片 PNG</option><option value="card-svg">卡片 SVG</option><option value="bookmark-png">書籤 PNG</option><option value="bookmark-svg">書籤 SVG</option></select></label><button className="sc-button" disabled={busy} onClick={() => void exportImage()}><Download size={17}/>{busy ? '產生中…' : '下載'}</button></div><button className="sc-text-button" onClick={printBookmark}><Printer size={17}/>列印書籤 · A4 裁切版</button><p className="sc-meta">書籤成品 50 × 150 mm。列印選實際尺寸／100%，關閉頁首頁尾。</p></section><button className="sc-text-button sc-restart" onClick={startQuiz}><RotateCcw size={16}/>{role ? '重新測驗' : '做個山行測驗'}</button></>}
          </div>
          <aside className="sc-stage" aria-label="山景卡展示"><div className="sc-preview-stack"><div className="sc-preview-shadow" aria-hidden="true"><img src="/brand/mt-info-symbol-reverse.svg" alt="" width="46" height="46"/></div><CardView key={drawNumber} card={current} flipped={flipped} onFlip={() => setFlipped(value => !value)} reveal={view === 'result' && !fromCollection}/></div><p className="sc-card-hint">點一下卡片，翻看背面</p>{view === 'quiz' && <p className="sc-preview-note">完成測驗後，抽取一張山景卡。</p>}</aside>
        </section>}
        <footer className="sc-footer"><span>山景・第一輯</span><span>圖像與文字 © mt_info</span></footer>
      </main>
      {pending && <dialog className="sc-dialog" ref={dialog} onCancel={event => {event.preventDefault();setPending(null);}} aria-labelledby="sc-dialog-title"><div className="sc-dialog-heading"><h2 id="sc-dialog-title">{pending.kind === 'import' ? '還原圖鑑備份' : pending.kind === 'leave' ? '圖鑑尚未保存' : '清空圖鑑'}</h2><button className="sc-icon-button" aria-label="關閉確認" onClick={() => setPending(null)}><X size={20}/></button></div><p>{pending.kind === 'import' ? `「${pending.name}」包含 ${pending.collection.cards.length} 張卡片。還原會取代目前的 ${collection.cards.length} 張收藏。` : pending.kind === 'leave' ? '本次收藏還沒有寫入瀏覽器。可先下載備份，或留在這裡繼續。' : `將清空目前 ${collection.cards.length} 張收藏。建議先下載備份。`}</p>{pending.kind === 'leave' && <button className="sc-text-button" onClick={() => downloadText(JSON.stringify(collection,null,2),'mt_info_山行卡圖鑑.json')}><Download size={17}/>下載圖鑑備份</button>}<div className="sc-dialog-actions"><button className="sc-button" onClick={() => setPending(null)}>取消</button><button className="sc-button sc-primary" onClick={confirmReplacement}>{pending.kind === 'import' ? '確認取代並還原' : pending.kind === 'leave' ? '仍然離開' : '確認清空圖鑑'}</button></div></dialog>}
    </div>
    <section className="sc-print" aria-label="書籤列印版">{printCard ? <><div className="sc-print-bookmark"><img src={imageUrl(createBookmarkSvg(printCard, roleTitle))} alt={`${printCard.title}書籤`}/><i className="sc-crop sc-crop-tl"/><i className="sc-crop sc-crop-tr"/><i className="sc-crop sc-crop-bl"/><i className="sc-crop sc-crop-br"/></div><p className="sc-print-label">{printCard.title} · mt_info · 成品 50 × 150 mm</p></> : <p>請先選一張卡片，再使用「列印書籤」。</p>}</section>
  </>;
}
