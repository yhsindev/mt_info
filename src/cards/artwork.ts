import type { CardId } from './catalog';

// Original vector compositions. No downloaded paths, images, fonts or textures.
const paper = '#f3eddf', ink = '#234d3e', deep = '#183b32', moss = '#a3ad85', pale = '#d9ddc6', ochre = '#bd8b4e';
const fir = (x: number, y: number, scale = 1, color = ink) => `<g transform="translate(${x} ${y}) scale(${scale})" fill="${color}"><path d="M0-119C-7-103-13-91-27-79L-13-82C-21-63-31-49-45-37L-26-41C-39-18-52-4-66 8C-43 14-20 17 0 17C20 17 43 14 66 8C52-4 39-18 26-41L45-37C31-49 21-63 13-82L27-79C13-91 7-103 0-119Z"/><path d="M-3 9H3V48H-3Z"/><path d="M0-88V9M-1-46-21-26M1-18 24-1" fill="none" stroke="${paper}" stroke-width="1.5" opacity=".45"/></g>`;
const star = (x: number, y: number, size = 4, color = paper) => `<path d="M${x} ${y - size}Q${x + 1} ${y - 1} ${x + size} ${y}Q${x + 1} ${y + 1} ${x} ${y + size}Q${x - 1} ${y + 1} ${x - size} ${y}Q${x - 1} ${y - 1} ${x} ${y - size}Z" fill="${color}"/>`;

const scenes: Record<CardId, string> = {
  ridge: `
    <rect width="400" height="560" fill="${paper}"/>
    <circle cx="296" cy="119" r="51" fill="${ochre}"/>
    <path d="M0 295 54 231 101 254 162 174 220 240 261 214 325 272 400 226V560H0Z" fill="${pale}"/>
    <path d="M0 353 69 289 115 308 174 220 232 291 274 262 332 326 400 291V560H0Z" fill="${moss}"/>
    <path d="M0 422 88 358 135 383 210 270 265 350 309 326 400 407V560H0Z" fill="${ink}"/>
    <path d="m210 270 13 94 42-14-55-80ZM88 358l35 104 12-79-47-25Z" fill="${deep}"/>
    <path d="m210 270-26 80 20-18 8 17 10-29-12-50Z" fill="${paper}"/>
    <path d="M174 220 156 265 178 254 193 264 174 220Z" fill="${paper}" opacity=".8"/>
    <path d="M24 458c55-37 94-21 129-45s45-62 76-47M30 477c59-38 91-17 132-42s49-63 78-49M36 496c52-31 95-18 134-39s51-59 79-49" fill="none" stroke="${paper}" stroke-width="1.15" opacity=".45"/>
    <path d="M238 560c-4-37 48-54 34-79-12-21-64-17-55-44 8-23 50-38 43-62" fill="none" stroke="${ochre}" stroke-width="9"/>
    <path d="m43 177 54-13m-43 24 61-14" stroke="${moss}" stroke-width="1.3"/>
  `,
  clouds: `
    <rect width="400" height="560" fill="${pale}"/>
    <circle cx="110" cy="120" r="43" fill="${ochre}"/>
    <path d="M0 298c61-10 75-62 119-52l69-104 63 107c28-17 70-4 149 57v254H0Z" fill="${moss}"/>
    <path d="m188 142-34 155 43-29 54-19-63-107Z" fill="${ink}"/>
    <path d="m188 142-20 72 22-14 17 17-19-75Z" fill="${paper}"/>
    <path d="M-20 188c26-28 48-32 71-24 16-31 58-33 80-10 24-15 48-8 65 10 37-13 71-8 93 15 35-4 74 5 131 28v40H-20Z" fill="${paper}"/>
    <path d="M-18 205c61-8 95 14 147 5s89-2 128 11 90 3 161 19" fill="none" stroke="${moss}" stroke-width="1.1"/>
    <path d="M0 397 58 351l47 19 50-62 48 65 48-38 67 53 82-42v214H0Z" fill="${ink}"/>
    <path d="m155 308 6 102 42-37-48-65Z" fill="${deep}"/>
    <path d="M-20 320c34-22 62-27 97-16 28-21 58-16 79 5 27-17 68-15 96 9 42-13 89-5 168 32v40c-45-18-84-29-122-22-42 8-77 1-113-9-35-10-68-7-99 0-34 8-67 5-106-3Z" fill="${paper}"/>
    <path d="M-10 344c48-5 78 5 112-2s66-4 100 9 83-2 119 2 59 15 89 18" fill="none" stroke="${ochre}" stroke-width="1.4"/>
    <path d="M-20 455c52-27 98-29 140-4 35-22 74-16 104 8 63-19 128-7 196 22v79H-20Z" fill="${paper}"/>
    <path d="M0 486c75-15 102 14 150 1s84-6 133 11 77 7 117 8M18 512c53-9 79 13 132 3s84-5 119 9" fill="none" stroke="${moss}" stroke-width="1.15"/>
  `,
  forest: `
    <rect width="400" height="560" fill="${paper}"/>
    <circle cx="240" cy="128" r="56" fill="${ochre}"/>
    <path d="M0 297c88-77 150-97 216-63s104 23 184-36v362H0Z" fill="${pale}"/>
    ${fir(53, 306, .63, moss)}${fir(130, 282, .72, moss)}${fir(268, 283, .67, moss)}${fir(356, 268, .76, moss)}
    <path d="M0 405c73-40 127-26 181-42s125-7 219 18v179H0Z" fill="${moss}"/>
    <path d="M160 560c-24-51 64-80 48-123-12-31-44-49-16-83 13-16 30-29 31-46 15 25 4 38-4 55-22 38 18 52 30 77 21 45-29 73-20 120Z" fill="${ochre}"/>
    ${fir(55, 424, 1.04, ink)}${fir(340, 425, 1.13, ink)}${fir(115, 366, .66, ink)}${fir(294, 354, .64, ink)}
    ${fir(-4, 505, 1.1, deep)}${fir(397, 510, 1.09, deep)}
    <path d="m76 508 17-5m-9 20 19-7m171 3 21-6m-24 21 24-4" stroke="${paper}" stroke-width="1.4" opacity=".7"/>
    <path d="M151 164c8-8 15-7 22 0m1 0c7-7 14-8 21-2" fill="none" stroke="${ink}" stroke-width="2"/>
  `,
  stream: `
    <rect width="400" height="560" fill="${paper}"/>
    <path d="M0 196c51-25 79-72 121-65s68 76 111 88 102-45 168-30v371H0Z" fill="${pale}"/>
    <path d="M0 270c66-68 111-38 151-13s63-7 94-28 72-18 155-1v332H0Z" fill="${moss}"/>
    <path d="M0 375c63-25 116-6 150-33s48-64 91-79 89-1 159 22v275H0Z" fill="${ink}"/>
    <path d="M204 210c60 36-58 69-37 107 22 39 123 9 128 68 4 47-139 52-86 119l37 56H83c-51-92 122-102 129-159 6-46-94-48-101-86-9-51 127-62 93-105Z" fill="${ochre}"/>
    <path d="M204 210c48 36-68 66-43 109 23 39 115 13 120 64 3 44-142 58-86 124l40 53H107c-52-88 116-97 119-158 2-54-102-52-106-87-6-49 117-67 84-105Z" fill="${paper}"/>
    <path d="M181 275c-44 22-56 37-38 53m15 19c23 14 77 14 94 31m-2 26c-9 15-35 27-58 37m-29 24c-28 26-23 50-7 67" fill="none" stroke="${moss}" stroke-width="2" stroke-linecap="round"/>
    <path d="m22 415 39-16 33 18-7 32-53 2Zm284 40 36-24 45 16-11 43-61-9ZM34 293l28-12 32 18-14 25-41-7Z" fill="${deep}"/>
    <path d="m34 415 27-5 17 10m240 34 24-10 31 9M45 295l17-3 19 11" fill="none" stroke="${paper}" stroke-width="1.4"/>
    ${fir(47, 218, .47, ink)}${fir(345, 233, .55, ink)}
    <path d="m298 128 29-9m-21 22 37-11" stroke="${ochre}" stroke-width="1.3"/>
  `,
  camp: `
    <rect width="400" height="560" fill="${pale}"/>
    <circle cx="280" cy="116" r="36" fill="${paper}"/>
    <path d="M0 285 65 227l49 29 57-63 67 89 57-35 105 60v253H0Z" fill="${moss}"/>
    <path d="M0 368c79-30 134-41 203-21s119 8 197-6v219H0Z" fill="${ink}"/>
    ${fir(43, 337, .83, deep)}${fir(355, 341, .9, deep)}
    <path d="M0 479c104-38 253-23 400 9v72H0Z" fill="${ochre}"/>
    <path d="m112 452 75-154 107 148Z" fill="${paper}"/>
    <path d="m187 298 38 150 69-2-107-148Z" fill="${ochre}"/>
    <path d="m187 318-50 132 88-2-38-130Z" fill="${deep}"/>
    <path d="m187 318 5 130h33l-38-130Z" fill="${ink}"/>
    <path d="m112 452 75-154 107 148M99 467l88-169 119 164M187 298v-13" fill="none" stroke="${paper}" stroke-width="1.5"/>
    <path d="m93 469 12-4m195-2 15 1m-166 37 16-4m86 15 23 3M96 528l29-4m113 17 40 4" stroke="${deep}" stroke-width="1.6"/>
    ${star(109, 110, 4, ink)}${star(195, 84, 3, ink)}${star(337, 173, 4, ink)}
    <path d="M192 560c-12-18-28-29-17-46 7-12 13-18 8-29" fill="none" stroke="${paper}" stroke-width="3" opacity=".6"/>
  `,
  stars: `
    <rect width="400" height="560" fill="${deep}"/>
    <path d="M20 260c76-105 160-129 359-177M20 283c91-104 181-138 359-180M20 305c114-102 195-137 359-183" fill="none" stroke="${moss}" stroke-width=".7" opacity=".3"/>
    <path d="M0 392 55 350l54 32 76-79 52 63 46-21 57 58 60-45v202H0Z" fill="${moss}"/>
    <path d="M0 449 84 400l67 44 57-62 78 61 47-29 67 47v99H0Z" fill="${ink}"/>
    <path d="m185 303-23 53 25-13 23 18-25-58Z" fill="${paper}"/>
    <path d="M0 512c104-37 168-1 243 7s113-5 157-10v51H0Z" fill="${deep}"/>
    <path d="m83 194 62-37 57 27 48-72 57 18" fill="none" stroke="${ochre}" stroke-width="1.2" opacity=".85"/>
    ${[[83, 194, 5], [145, 157, 5], [202, 184, 5], [250, 112, 9], [307, 130, 5], [62, 90, 3], [127, 72, 3], [215, 63, 3], [339, 67, 3], [341, 211, 4], [72, 294, 4], [151, 255, 3], [273, 273, 4], [323, 321, 3], [225, 237, 3]].map(([x, y, size]) => star(x, y, size, paper)).join('')}
    <g fill="${paper}" opacity=".7"><circle cx="43" cy="146" r="1.4"/><circle cx="181" cy="109" r="1.2"/><circle cx="287" cy="83" r="1.2"/><circle cx="366" cy="157" r="1.2"/><circle cx="115" cy="236" r="1.1"/><circle cx="306" cy="234" r="1.1"/><circle cx="42" cy="250" r="1.1"/></g>
    <path d="m51 495 49-8m-33 23 41-3m161 26 52 4" stroke="${moss}" stroke-width="1" opacity=".55"/>
  `,
  lake: `
    <rect width="400" height="560" fill="${paper}"/>
    <circle cx="286" cy="122" r="39" fill="${ochre}"/>
    <path d="M0 273 62 210l60 37 63-87 66 92 49-33 100 64v277H0Z" fill="${pale}"/>
    <path d="M0 323 67 267l64 30 57-92 69 106 53-43 90 55v237H0Z" fill="${moss}"/>
    <path d="m188 205-17 68 18-16 22 21-23-73Z" fill="${paper}"/>
    <path d="M0 353c84-23 119-31 200-15s133-8 200-18v240H0Z" fill="${ink}"/>
    <path d="M38 383c41-30 88-29 140-13 60 19 119-7 177 7 47 11 9 88-32 121-59 46-218 19-264-22-41-35-56-68-21-93Z" fill="${pale}"/>
    <path d="m68 382 52 37 67-45 56 60 62-46 46-5c-46-17-104 6-173-13-52-15-82-12-110 12Z" fill="${moss}"/>
    <path d="M99 411h64m43 1h61M71 444h80m39 0h127m-194 28h95m28 1h45m-109 26h76" stroke="${paper}" stroke-width="2" stroke-linecap="round"/>
    <path d="M258 388h31m-22 10h20m-29 26h39m-29 10h17" stroke="${ochre}" stroke-width="2.5" stroke-linecap="round"/>
    ${fir(25, 374, .6, deep)}${fir(373, 355, .7, deep)}
    <path d="m35 502 30-5m-13 18 27-2m237 10 43-9" fill="none" stroke="${ochre}" stroke-width="1.4"/>
  `,
  dawn: `
    <rect width="400" height="560" fill="${paper}"/>
    <circle cx="160" cy="220" r="102" fill="${ochre}"/>
    <path d="M59 197h202M58 220h204M61 243h198M70 266h180" fill="none" stroke="${paper}" stroke-width="2"/>
    <path d="M0 299c51-14 87-56 133-46 34 7 60 50 102 43 52-8 89-70 165-59v323H0Z" fill="${pale}"/>
    <path d="M0 354c69-41 102-31 147-9 48 24 99-27 144-40 36-10 72-5 109 8v247H0Z" fill="${moss}"/>
    <path d="M0 422c62-9 99-59 156-51 47 6 74 50 121 40s77-34 123-16v165H0Z" fill="${ink}"/>
    <path d="M0 498c69-54 130-41 191-17 54 22 109-20 209-11v90H0Z" fill="${deep}"/>
    <path d="M15 370c66-34 97-17 138-2 44 16 80-11 116-27M24 386c65-30 93-13 128 0 45 16 77-11 111-24" fill="none" stroke="${paper}" stroke-width="1.1" opacity=".5"/>
    <path d="M134 560c2-31 54-42 46-70-7-21-48-23-39-45 9-20 44-35 50-49" fill="none" stroke="${ochre}" stroke-width="6"/>
    <path d="m74 105 11 23m19-35 7 25m20-31 2 26m85-9-11 23m-18-35-7 25" stroke="${ochre}" stroke-width="1.3"/>
    <path d="M281 167c7-7 14-7 21 0m0 0c7-7 14-6 21 1" fill="none" stroke="${ink}" stroke-width="2"/>
  `,
};

/** Self-contained 400 × 560 artwork; intentionally contains no lettering. */
export function cardArtworkSvg(id: CardId): string {
  const scene = scenes[id];
  if (!scene) throw new RangeError('未知的山行卡圖像');
  const frame = id === 'stars' ? paper : ink;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="560" viewBox="0 0 400 560"><defs><pattern id="${id}-print-grain" width="13" height="17" patternUnits="userSpaceOnUse"><path d="m2 3 2-1m6 9 1-2M5 15l2-1" stroke="${paper}" stroke-width=".7"/></pattern><clipPath id="${id}-print-clip"><rect width="400" height="560"/></clipPath></defs><g clip-path="url(#${id}-print-clip)">${scene}<rect width="400" height="560" fill="url(#${id}-print-grain)" opacity=".18"/></g><rect x="14" y="14" width="372" height="532" fill="none" stroke="${frame}" stroke-width=".8" opacity=".45"/><path d="M22 41V22h19m318 0h19v19M22 519v19h19m318 0h19v-19" fill="none" stroke="${frame}" stroke-width=".9" opacity=".65"/></svg>`;
}
