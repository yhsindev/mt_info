export type CardId = 'ridge' | 'clouds' | 'forest' | 'stream' | 'camp' | 'stars' | 'lake' | 'dawn';

export interface CardDefinition {
  id: CardId;
  number: string;
  title: string;
  englishTitle: string;
  description: string;
  detail: string;
  accent: string;
  paper: string;
  artworkVersion: 1;
}

export const CARD_CATALOG: readonly CardDefinition[] = [
  { id: 'ridge', number: '01', title: '稜線', englishTitle: 'Ridgeline', description: '山峰之間，一道起伏的線。', detail: '隔著山谷看稜線，遠近的山有不同深淺。陽光沿著山脊移動，岩壁的紋理漸漸清楚。', accent: '#315c49', paper: '#f1efdf', artworkVersion: 1 },
  { id: 'clouds', number: '02', title: '雲海', englishTitle: 'Cloud Sea', description: '雲層緩緩移動，山頭時隱時現。', detail: '雲填進谷地，只留下幾座山峰。留一張卡，記住曾經想多看一會的風景。', accent: '#52777b', paper: '#edf0e8', artworkVersion: 1 },
  { id: 'forest', number: '03', title: '森林', englishTitle: 'Forest', description: '樹影重疊，光從葉隙落下。', detail: '腳步聲、枝葉聲，還有林間的濕潤氣味。這張卡收進一小片安靜的森林。', accent: '#365b40', paper: '#e9eddf', artworkVersion: 1 },
  { id: 'stream', number: '04', title: '溪谷', englishTitle: 'Stream Valley', description: '水沿著谷地，繞過石頭。', detail: '從高處看，溪流像一道細線穿過山谷。水聲從谷底傳來，岸邊的石頭被磨出了圓角。', accent: '#437579', paper: '#eaf0e8', artworkVersion: 1 },
  { id: 'camp', number: '05', title: '營地', englishTitle: 'Camp', description: '帳篷搭好，晚餐還在鍋裡。', detail: '整理背包、借個打火機、一起等水滾。天色一點點變暗，帳篷裡亮起暖黃的燈。', accent: '#886242', paper: '#f3ecdd', artworkVersion: 1 },
  { id: 'stars', number: '06', title: '星空', englishTitle: 'Night Sky', description: '天色暗了，星星慢慢變多。', detail: '遠處的山只剩下輪廓，夜空顯得更寬。記下仰頭的那一刻，也記下同行的人。', accent: '#3e506b', paper: '#eeede4', artworkVersion: 1 },
  { id: 'lake', number: '07', title: '湖泊', englishTitle: 'Mountain Lake', description: '水面平靜時，山有了倒影。', detail: '風一吹，倒影散成細小的波紋。等風停下，山的輪廓又慢慢回到水面上。', accent: '#4d7972', paper: '#e9eee2', artworkVersion: 1 },
  { id: 'dawn', number: '08', title: '晨光', englishTitle: 'First Light', description: '第一道光，先落在高處。', detail: '山的顏色從灰藍轉暖，營地也慢慢醒來。這一張留給山裡的清晨。', accent: '#a26d3c', paper: '#f4ebda', artworkVersion: 1 },
];

export function getCard(id: string): CardDefinition | undefined {
  return CARD_CATALOG.find(card => card.id === id);
}

export type RoleId = 'observer' | 'explorer' | 'recorder' | 'camper';
export interface RoleDefinition { id: RoleId; title: string; description: string }
export interface QuizChoice { id: string; label: string; role: RoleId }
export interface QuizQuestion { id: string; title: string; choices: QuizChoice[] }

// This order also resolves tied scores; it does not rank ability or experience.
export const ROLES: readonly RoleDefinition[] = [
  { id: 'observer', title: '觀察派', description: '你容易注意到山裡細小的變化：雲的形狀、葉子的顏色，或一段突然安靜下來的路。' },
  { id: 'explorer', title: '探索派', description: '陌生的地名和山谷會引起你的好奇。你喜歡對照地圖，慢慢認識山峰、溪流與聚落的關係。' },
  { id: 'recorder', title: '紀錄派', description: '你喜歡把山行留下來。照片、文字和隨手記下的小事，讓一趟旅程能在回家後繼續被想起。' },
  { id: 'camper', title: '營地派', description: '你喜歡一天走完後的相聚：整理營地、一起煮飯，聽大家說說路上的見聞。' },
];

export const QUIZ_QUESTIONS: readonly QuizQuestion[] = [
  { id: 'gathering', title: '集合後還有一點空檔，你最可能做什麼？', choices: [
    { id: 'look', label: '看看周圍的樹、天色和光線', role: 'observer' },
    { id: 'map', label: '翻翻地圖，認識附近的地名', role: 'explorer' },
    { id: 'photo', label: '拍張出發前的照片', role: 'recorder' },
    { id: 'chat', label: '和大家聊聊，分點帶來的食物', role: 'camper' },
  ] },
  { id: 'view', title: '走到開闊的地方，最吸引你的是？', choices: [
    { id: 'light', label: '雲影在山坡上移動的樣子', role: 'observer' },
    { id: 'peaks', label: '眼前的山峰和山谷各叫什麼', role: 'explorer' },
    { id: 'frame', label: '可以記錄眼前景色的角度', role: 'recorder' },
    { id: 'together', label: '能和同行的人一起坐下來看山', role: 'camper' },
  ] },
  { id: 'break', title: '休息的時候，你常自然做哪件事？', choices: [
    { id: 'listen', label: '聽鳥聲，看看身邊的小東西', role: 'observer' },
    { id: 'names', label: '研究地圖上沒聽過的名字', role: 'explorer' },
    { id: 'notes', label: '補幾句筆記或整理剛拍的照片', role: 'recorder' },
    { id: 'snack', label: '拿出點心，問大家要不要吃', role: 'camper' },
  ] },
  { id: 'evening', title: '一天結束，什麼最讓你覺得滿足？', choices: [
    { id: 'details', label: '今天看見了幾個以前沒注意過的細節', role: 'observer' },
    { id: 'landscape', label: '終於把地圖上的地形和眼前的山連起來', role: 'explorer' },
    { id: 'story', label: '留下了一段很想分享的山行紀錄', role: 'recorder' },
    { id: 'meal', label: '和大家一起吃上一頓熱飯', role: 'camper' },
  ] },
  { id: 'memory', title: '想起上一趟山行，最先浮現的是？', choices: [
    { id: 'color', label: '某個時刻的光線、顏色或聲音', role: 'observer' },
    { id: 'discovery', label: '第一次見到的山形或聚落', role: 'explorer' },
    { id: 'journal', label: '相簿裡的一張照片或筆記裡的一句話', role: 'recorder' },
    { id: 'company', label: '營地裡的談笑和一起做的小事', role: 'camper' },
  ] },
  { id: 'next', title: '下一次山行，你最想多留一點時間給什麼？', choices: [
    { id: 'notice', label: '停下腳步，仔細看看身邊的風景', role: 'observer' },
    { id: 'learn', label: '認識一片還不熟悉的山域', role: 'explorer' },
    { id: 'keep', label: '把這趟旅程記得更完整', role: 'recorder' },
    { id: 'stay', label: '在營地和同行的人好好相處', role: 'camper' },
  ] },
];
