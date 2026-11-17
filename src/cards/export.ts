import { cardArtworkSvg } from './artwork';
import type { CardDefinition } from './catalog';

const serif = "'Songti TC','Noto Serif CJK TC',Georgia,serif";
const sans = "'PingFang TC','Microsoft JhengHei',sans-serif";
const ink = '#234d3e';
const text = (value: string) => Array.from(value).filter(char => {
  const cp = char.codePointAt(0)!;
  return cp === 9 || cp === 10 || cp === 13 || cp >= 32 && cp <= 0xd7ff || cp >= 0xe000 && cp <= 0xfffd || cp > 0xffff && cp <= 0x10ffff;
}).join('');
const xml = (value: string) => text(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const color = (value: string, fallback: string) => /^#[\da-f]{6}$/i.test(value) ? value : fallback;

// Width is counted in half-em units so Chinese and Latin both fit without a
// remote font, canvas text metrics or foreignObject. Excess text ends visibly.
function lines(value: string, width: number, maximum: number): string[] {
  const chars = Array.from(text(value).replace(/\s+/g, ' ').trim());
  const result: string[] = []; let line = '', used = 0;
  for (let index = 0; index < chars.length; index++) {
    const char = chars[index], units = /[\u0000-\u007f]/.test(char) ? 1 : 2;
    if (used + units > width && line) {
      // Keep Chinese closing punctuation with its preceding character.
      const previous = Array.from(line);
      const carry = /^[，。！？、；：）》」』】〉]$/.test(char) || /[（《「『【〈]$/.test(line) ? previous.pop() || '' : '';
      result.push((carry ? previous.join('') : line).trim()); line = carry; used = carry ? /[\u0000-\u007f]/.test(carry) ? 1 : 2 : 0;
      if (result.length === maximum) {
        result[maximum - 1] = Array.from(result[maximum - 1]).slice(0, -1).join('') + '…';
        return result;
      }
    }
    line += char; used += units;
  }
  if (line) result.push(line.trim());
  return result;
}
function lettering(value: string, x: number, y: number, size: number, options: { width: number; maximum?: number; leading?: number; family?: string; weight?: number; fill?: string; spacing?: number }) {
  const wrapped = lines(value, options.width, options.maximum ?? 1);
  return `<text x="${x}" y="${y}" font-family="${options.family || sans}" font-size="${size}" font-weight="${options.weight || 400}" fill="${options.fill || ink}"${options.spacing ? ` letter-spacing="${options.spacing}"` : ''}>${wrapped.map((line, index) => `<tspan x="${x}" dy="${index ? options.leading || size * 1.4 : 0}">${xml(line)}</tspan>`).join('')}</text>`;
}
function artwork(card: CardDefinition, x: number, y: number, width: number, height: number) {
  return cardArtworkSvg(card.id).replace('<svg ', `<svg x="${x}" y="${y}" `).replace('width="400" height="560"', `width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"`);
}
const number = (card: CardDefinition) => xml(String(card.number).padStart(2, '0'));

/** Complete share image. Fonts use the viewer's local serif/sans fallbacks. */
export function createCardSvg(card: CardDefinition, roleTitle?: string): string {
  const accent = color(card.accent, ink), paper = color(card.paper, '#f3eddf');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1120" viewBox="0 0 800 1120" role="img" aria-labelledby="card-title"><title id="card-title">${xml(card.title)}・mt_info 山行卡</title><rect width="800" height="1120" fill="${paper}"/><rect x="24" y="24" width="752" height="1072" rx="2" fill="none" stroke="${accent}" stroke-opacity=".3"/>
    <text x="56" y="68" font-family="Georgia,serif" font-size="28" font-weight="700" fill="${ink}">mt_info</text><text x="744" y="66" text-anchor="end" font-family="${sans}" font-size="18" letter-spacing="2" fill="${accent}">${number(card)} / 08</text>
    ${artwork(card, 56, 92, 688, 705)}
    <path d="M56 829H744" stroke="${accent}" stroke-opacity=".35"/>
    ${lettering(card.title, 56, 889, 44, { width: 28, family: serif, weight: 600, spacing: 2 })}
    ${lettering(card.englishTitle.toUpperCase(), 58, 923, 18, { width: 59, fill: accent, spacing: 2 })}
    ${lettering(card.description, 56, 970, 30, { width: 43, maximum: 2, leading: 40 })}
    ${roleTitle ? lettering(roleTitle, 56, 1052, 23, { width: 54, fill: accent }) : ''}
    <text x="744" y="1080" text-anchor="end" font-family="${sans}" font-size="16" fill="${accent}">mt_info 原創幾何圖像</text>
  </svg>`;
}

/** Print dimensions are physical; PNG uses the explicit 591 × 1772 pixel size. */
export function createBookmarkSvg(card: CardDefinition, roleTitle?: string): string {
  const accent = color(card.accent, ink), paper = color(card.paper, '#f3eddf');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="50mm" height="150mm" viewBox="0 0 500 1500" role="img" aria-labelledby="bookmark-title"><title id="bookmark-title">${xml(card.title)}・mt_info 山行書籤</title><rect width="500" height="1500" fill="${paper}"/><rect x="16" y="16" width="468" height="1468" fill="none" stroke="${accent}" stroke-width="1.5" stroke-opacity=".35"/>
    <text x="36" y="76" font-family="Georgia,serif" font-size="32" font-weight="700" fill="${ink}">mt_info</text><text x="464" y="74" text-anchor="end" font-family="${sans}" font-size="24" fill="${accent}">${number(card)} / 08</text>
    ${artwork(card, 35, 112, 430, 670)}
    <path d="M36 830H464" stroke="${accent}" stroke-width="1.5" stroke-opacity=".4"/>
    ${lettering(card.title, 36, 914, 58, { width: 13, family: serif, weight: 600 })}
    ${lettering(card.englishTitle.toUpperCase(), 38, 961, 23, { width: 33, maximum: 2, leading: 32, fill: accent, spacing: 1 })}
    ${lettering(card.description, 36, 1050, 36, { width: 24, maximum: 3, leading: 52 })}
    ${roleTitle ? lettering(roleTitle, 36, 1274, 32, { width: 25, maximum: 2, leading: 44, fill: accent }) : ''}
    <path d="M36 1366H464" stroke="${accent}" stroke-width="1.5" stroke-opacity=".25"/>
    <text x="36" y="1420" font-family="${sans}" font-size="24" fill="${accent}">mt_info 原創幾何圖像</text>
  </svg>`;
}

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), anchor = document.createElement('a'); let clicked = false;
  try {
    anchor.href = url; anchor.download = filename; document.body.appendChild(anchor);
    anchor.click(); clicked = true;
  } finally {
    anchor.remove();
    if (clicked) window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    else URL.revokeObjectURL(url);
  }
}
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = window.setTimeout(() => { image.onload = null; image.onerror = null; image.src = ''; reject(new Error('圖像轉換逾時')); }, 10_000);
    image.onload = () => { window.clearTimeout(timer); image.onload = null; image.onerror = null; resolve(image); };
    image.onerror = () => { window.clearTimeout(timer); image.onload = null; image.onerror = null; reject(new Error('圖像無法轉換')); };
    image.src = url;
  });
}

/** PNG failure downloads the complete SVG instead; all temporary URLs are released. */
export async function downloadCardImage(card: CardDefinition, format: 'png' | 'svg', kind: 'card' | 'bookmark', roleTitle?: string): Promise<'png' | 'svg'> {
  const svg = kind === 'bookmark' ? createBookmarkSvg(card, roleTitle) : createCardSvg(card, roleTitle);
  const source = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const filename = `mt_info_${card.id}_${kind}`;
  if (format === 'svg') { save(source, `${filename}.svg`); return 'svg'; }
  let url: string | null = null;
  try {
    url = URL.createObjectURL(source);
    const image = await loadImage(url), canvas = document.createElement('canvas');
    canvas.width = kind === 'bookmark' ? 591 : 800; canvas.height = kind === 'bookmark' ? 1772 : 1120;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('此瀏覽器無法轉換 PNG');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG 無法產生')), 'image/png');
    });
    save(png, `${filename}.png`);
    return 'png';
  } catch {
    save(source, `${filename}.svg`);
    return 'svg';
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}
