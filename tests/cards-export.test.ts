import { afterEach, describe, expect, it, vi } from 'vitest';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { CARD_CATALOG, type CardDefinition } from '../src/cards/catalog';
import { cardArtworkSvg } from '../src/cards/artwork';
import { createBookmarkSvg, createCardSvg, downloadCardImage } from '../src/cards/export';

const parse = (value: string) => new XMLParser({ ignoreAttributes: false }).parse(value).svg;
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('原創山行卡向量圖與分享檔', () => {
  it.each(CARD_CATALOG)('$id has a distinct self-contained 400 × 560 composition', card => {
    const svg = cardArtworkSvg(card.id), root = parse(svg);
    expect(XMLValidator.validate(svg)).toBe(true);
    expect(root['@_viewBox']).toBe('0 0 400 560');
    expect(root['@_width']).toBe('400'); expect(root['@_height']).toBe('560');
    expect(svg).not.toMatch(/<text\b|<image\b|<foreignObject\b|<script\b|@font-face|(?:href|src)\s*=/i);
    expect(svg).not.toMatch(/url\(\s*['"]?(?:https?:|\/\/)/i);
    expect(XMLValidator.validate(createCardSvg(card))).toBe(true);
    expect(XMLValidator.validate(createBookmarkSvg(card))).toBe(true);
  });
  it('contains eight different original compositions rather than only recoloured artwork', () => {
    const scenes = CARD_CATALOG.map(card => cardArtworkSvg(card.id)
      .replace(/#[\da-f]{6}/gi, '#color').replace(/(?:ridge|clouds|forest|stream|camp|stars|lake|dawn)-print-/g, 'print-'));
    expect(new Set(scenes).size).toBe(8);
  });
  it('does not strand Chinese punctuation on a new bookmark line', () => {
    for (const card of CARD_CATALOG) expect(createBookmarkSvg(card)).not.toMatch(/<tspan[^>]*>[，。！？、；：）》」』】〉]/);
  });
  it('gives full cards pixel dimensions and bookmarks explicit print dimensions', () => {
    const card = parse(createCardSvg(CARD_CATALOG[0], '觀察派'));
    expect([card['@_width'], card['@_height'], card['@_viewBox']]).toEqual(['800', '1120', '0 0 800 1120']);
    const bookmark = parse(createBookmarkSvg(CARD_CATALOG[0], '觀察派'));
    expect([bookmark['@_width'], bookmark['@_height'], bookmark['@_viewBox']]).toEqual(['50mm', '150mm', '0 0 500 1500']);
    for (const source of [createCardSvg(CARD_CATALOG[0]), createBookmarkSvg(CARD_CATALOG[0])]) {
      expect(source).toContain('mt_info 原創幾何圖像'); expect(source).not.toContain('undefined');
      expect(source).not.toMatch(/<foreignObject|<image|@font-face/);
    }
  });
  it('escapes every text field and rejects injected colours without fetching fonts or images', () => {
    const hostile: CardDefinition = { ...CARD_CATALOG[0], number: '</text><script>x</script>', title: '<山>&"\'', englishTitle: '<svg>&"\'', description: '<script>&"\'', accent: '"><script/>', paper: 'url(https://example.test/x)' };
    for (const svg of [createCardSvg(hostile, '<img>&"\''), createBookmarkSvg(hostile, '<img>&"\'')]) {
      expect(XMLValidator.validate(svg)).toBe(true);
      expect(svg).toContain('&lt;山&gt;&amp;&quot;&apos;');
      expect(svg).toContain('&lt;script&gt;&amp;&quot;&apos;');
      expect(svg).toContain('&lt;img&gt;&amp;&quot;&apos;');
      expect(svg).toContain('&lt;/text&gt;&lt;script&gt;x&lt;/script&gt;');
      expect(svg).not.toMatch(/<script|<img|example\.test/);
    }
  });
  it('keeps long labels inside a bounded visible text layout and strips invalid XML controls', () => {
    const long: CardDefinition = { ...CARD_CATALOG[0], title: '山'.repeat(500), englishTitle: 'RIDGE '.repeat(500), description: '長文'.repeat(500) + '\u0001' };
    for (const svg of [createCardSvg(long, '角色'.repeat(500)), createBookmarkSvg(long, '角色'.repeat(500))]) {
      expect(XMLValidator.validate(svg)).toBe(true); expect(svg).toContain('…'); expect(svg).not.toContain('\u0001');
      expect(svg.length).toBeLessThan(10_000);
    }
  });
});

// These mocks check browser lifecycle and exact raster arguments. A real Chrome
// raster/download check is also run during visual QA; mock PNG bytes are not a
// claim that a browser rendered the illustration correctly.
function browser(mode: 'ready' | 'image-error' | 'no-context' | 'null-png' = 'ready') {
  vi.useFakeTimers();
  const blobs = new Map<string, Blob>(), downloads: { filename: string; blob: Blob }[] = [];
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => {
    const id = `blob:qa-${blobs.size}`; blobs.set(id, blob as Blob); return id;
  });
  const drawImage = vi.fn();
  const canvas = { width: 0, height: 0, getContext: () => mode === 'no-context' ? null : { drawImage }, toBlob: vi.fn((done: BlobCallback, mime: string) => done(mode === 'null-png' ? null : new Blob(['mock raster bytes'], { type: mime }))) };
  vi.stubGlobal('window', { setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id) });
  vi.stubGlobal('Image', class {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(value: string) { if (value) Promise.resolve().then(() => mode === 'image-error' ? this.onerror?.() : this.onload?.()); }
  });
  vi.stubGlobal('document', {
    body: { appendChild: vi.fn() },
    createElement(tag: string) {
      if (tag === 'canvas') return canvas;
      const anchor = { href: '', download: '', remove: vi.fn(), click: () => downloads.push({ filename: anchor.download, blob: blobs.get(anchor.href)! }) };
      return anchor;
    },
  });
  return { canvas, drawImage, downloads, create, revoke };
}
describe('瀏覽器匯出與清理', () => {
  it.each(['card', 'bookmark'] as const)('rasterizes %s at the intended PNG resolution', async kind => {
    const env = browser(); expect(await downloadCardImage(CARD_CATALOG[0], 'png', kind, '紀錄派')).toBe('png');
    const dimensions = kind === 'bookmark' ? [591, 1772] : [800, 1120];
    expect([env.canvas.width, env.canvas.height]).toEqual(dimensions);
    expect(env.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, ...dimensions);
    expect(env.canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png');
    expect(env.downloads[0].filename).toBe(`mt_info_ridge_${kind}.png`);
    expect(env.downloads[0].blob.type).toBe('image/png');
    await vi.runOnlyPendingTimersAsync();
    expect(env.revoke.mock.calls.flat().sort()).toEqual(env.create.mock.results.map(result => result.value).sort());
  });
  it('downloads a self-contained SVG without starting raster conversion', async () => {
    const env = browser(); expect(await downloadCardImage(CARD_CATALOG[1], 'svg', 'bookmark')).toBe('svg');
    expect(env.drawImage).not.toHaveBeenCalled(); expect(env.downloads[0].filename).toBe('mt_info_clouds_bookmark.svg');
    const svg = await env.downloads[0].blob.text(); expect(XMLValidator.validate(svg)).toBe(true); expect(svg).toContain('width="50mm"');
    await vi.runOnlyPendingTimersAsync(); expect(env.revoke).toHaveBeenCalledTimes(1);
  });
  it.each(['image-error', 'no-context', 'null-png'] as const)('falls back to complete SVG and releases URLs after %s', async mode => {
    const env = browser(mode); expect(await downloadCardImage(CARD_CATALOG[4], 'png', 'card', '營地派')).toBe('svg');
    expect(env.downloads[0].filename).toBe('mt_info_camp_card.svg');
    expect(XMLValidator.validate(await env.downloads[0].blob.text())).toBe(true);
    await vi.runOnlyPendingTimersAsync();
    expect(env.revoke.mock.calls.flat().sort()).toEqual(env.create.mock.results.map(result => result.value).sort());
  });
});
