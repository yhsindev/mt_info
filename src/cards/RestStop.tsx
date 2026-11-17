import {useState} from 'react';
import {ArrowUpRight, RotateCcw} from 'lucide-react';
import {BINGO_PROMPTS, bingoLines, newBingoBoard, readBingoBoard, saveBingoBoard, toggleBingoMark, type BingoBoard} from './bingo';
import type {CardsOfflineStatus} from './offline';

const byId = new Map<string,string>(BINGO_PROMPTS.map(item => [item.id,item.text]));
const songLinks = [
  {title:'當我遠颺', note:'原頁署名詞曲黃凱文；權利待查核', url:'https://hiking.biji.co/index.php?act=info&id=7394&q=news', site:'健行筆記'},
  {title:'白米酒', note:'MusicMike 演唱版本；詞曲作者待查核', url:'https://streetvoice.com/musicmike/songs/102117/', site:'StreetVoice'},
] as const;

const offlineCopy: Record<CardsOfflineStatus,string> = {
  development:'目前是開發預覽；離線重開請用正式編譯版測試。',
  unsupported:'此瀏覽器不支援離線重新開啟卡頁。',
  installing:'正在準備離線卡頁…',
  ready:'離線卡頁已備妥。關閉網路後仍可重新開啟此頁。',
  failed:'離線卡頁尚未備妥；請連線後重新載入。',
};

export default function RestStop({heading,offlineStatus}: {heading: React.RefObject<HTMLHeadingElement|null>; offlineStatus:CardsOfflineStatus}) {
  const [initial] = useState(() => {
    const board = readBingoBoard() ?? newBingoBoard();
    return {board, saved:saveBingoBoard(board)};
  });
  const [board, setBoard] = useState<BingoBoard>(initial.board);
  const [saved, setSaved] = useState(initial.saved);
  const wins = bingoLines(board);
  const winningIds = new Set(wins.flatMap(line => line.map(index => board.ids[index])));
  function update(next:BingoBoard) { setBoard(next); setSaved(saveBingoBoard(next)); }
  return <section className="sc-rest" aria-labelledby="sc-heading">
    <p className="sc-eyebrow">山路休息站</p>
    <h1 id="sc-heading" ref={heading} tabIndex={-1}>休息一下</h1>
    <p className="sc-rest-intro">等隊友、吃點心時，玩一局山路觀察賓果。</p>
    <div className="sc-rest-layout">
      <section className="sc-bingo" aria-labelledby="sc-bingo-title">
        <div className="sc-bingo-head"><div><p className="sc-eyebrow">01 / 小遊戲</p><h2 id="sc-bingo-title">山路觀察賓果</h2></div><button className="sc-button" type="button" onClick={() => update(newBingoBoard())}><RotateCcw size={16}/>換一局</button></div>
        <p>看到了就點一下。連成一橫、一豎或一斜，就算完成。</p>
        <div className="sc-bingo-grid" role="group" aria-label="山路觀察賓果，三乘三方格">{board.ids.map((id,index) => <button key={id} type="button" className={`${board.marked.includes(id) ? 'is-marked' : ''} ${winningIds.has(id) ? 'is-winning' : ''}`} aria-pressed={board.marked.includes(id)} aria-label={`第 ${Math.floor(index/3)+1} 列第 ${index%3+1} 格，${byId.get(id)}`} onClick={() => update(toggleBingoMark(board,id))}><span>{String(index+1).padStart(2,'0')}</span><strong>{byId.get(id)}</strong></button>)}</div>
        <p className="sc-bingo-status" role="status">{wins.length ? `賓果！連成 ${wins.length} 線。` : `已點選 ${board.marked.length} / 9 格。`}{!saved && ' 此次進度無法保存在瀏覽器。'}</p>
      </section>
      <section className="sc-songs" aria-labelledby="sc-songs-title">
        <p className="sc-eyebrow">02 / 山歌</p><h2 id="sc-songs-title">山歌索引</h2>
        <p>先收錄歌名與原頁。曲譜、歌詞與錄音需確認各版本的授權，之後才能加入離線歌本。</p>
        <ul>{songLinks.map(song => <li key={song.title}><div><strong>{song.title}</strong><small>{song.note}</small></div><a href={song.url} target="_blank" rel="noopener noreferrer" aria-label={`前往${song.site}查看${song.title}，需連線`}>{song.site}<ArrowUpRight size={16}/></a></li>)}</ul>
        <p className="sc-songs-online">原頁連結需連線。{offlineCopy[offlineStatus]}</p>
      </section>
    </div>
  </section>;
}
