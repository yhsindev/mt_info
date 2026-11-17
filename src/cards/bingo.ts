export const BINGO_PROMPTS = [
  {id:'five-minutes', text:'有人說「再五分鐘」'},
  {id:'snack-circle', text:'零食一拿出來，大家都靠過來'},
  {id:'phone-signal', text:'沒訊號，還是忍不住看手機'},
  {id:'rain-stops', text:'雨衣剛穿好，雨就停了'},
  {id:'same-photo', text:'同一座山又拍了一張'},
  {id:'bag-search', text:'在背包裡找剛放進去的東西'},
  {id:'dinner-plan', text:'有人開始討論下山吃什麼'},
  {id:'one-more-hill', text:'以為爬完了，前面還有一坡'},
  {id:'wind-hair', text:'風把頭髮吹出自己的路線'},
  {id:'group-photo', text:'合照時有人還在整理背包'},
  {id:'trail-name', text:'有人認真研究路邊植物的名字'},
  {id:'sit-down', text:'一看到能坐的地方就坐下'},
  {id:'sleep-well', text:'有人說今晚一定很好睡'},
  {id:'last-bite', text:'說只吃一口，結果整包吃完'},
  {id:'false-summit', text:'遠方那個山頭不是終點'},
  {id:'boot-mud', text:'鞋底的泥比想像中厚'},
  {id:'forgot-item', text:'想找的東西就在自己口袋裡'},
  {id:'bird-call', text:'大家安靜下來聽一聲鳥叫'},
] as const;

export type BingoBoard = {ids: string[]; marked: string[]};
const STORAGE_KEY = 'mt-info-rest-bingo-v1';
const promptIds = new Set<string>(BINGO_PROMPTS.map(item => item.id));

export function newBingoBoard(random = Math.random): BingoBoard {
  const ids = BINGO_PROMPTS.map(item => item.id);
  for (let index = ids.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [ids[index], ids[swap]] = [ids[swap], ids[index]];
  }
  return {ids:ids.slice(0,9), marked:[]};
}

export function readBingoBoard(storage: Pick<Storage,'getItem'> = localStorage): BingoBoard | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const board: unknown = JSON.parse(raw);
    if (!board || typeof board !== 'object') return null;
    const {ids,marked} = board as Partial<BingoBoard>;
    if (!Array.isArray(ids) || ids.length !== 9 || new Set(ids).size !== 9 || ids.some(id => typeof id !== 'string' || !promptIds.has(id))) return null;
    if (!Array.isArray(marked) || new Set(marked).size !== marked.length || marked.some(id => typeof id !== 'string' || !ids.includes(id))) return null;
    return {ids,marked};
  } catch { return null; }
}

export function saveBingoBoard(board: BingoBoard, storage: Pick<Storage,'setItem'> = localStorage): boolean {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(board)); return true; }
  catch { return false; }
}

export function toggleBingoMark(board: BingoBoard, id: string): BingoBoard {
  if (!board.ids.includes(id)) return board;
  return {...board, marked:board.marked.includes(id) ? board.marked.filter(item => item !== id) : [...board.marked,id]};
}

export function bingoLines(board: BingoBoard): number[][] {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  return lines.filter(line => line.every(index => board.marked.includes(board.ids[index])));
}
