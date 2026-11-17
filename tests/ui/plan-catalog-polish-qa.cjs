/*
 * Route-library polish acceptance checks. Run after the taste scripts have closed Chrome:
 * NODE_PATH=/tmp/mt-info-ui-tools/node_modules node tests/ui/plan-catalog-polish-qa.cjs
 * Uses isolated storage and the actual source records; never crawls official links.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

const base = process.env.MT_INFO_QA_URL || 'http://127.0.0.1:5173';
const out = path.resolve(process.env.MT_INFO_POLISH_QA_OUT || 'artifacts/catalog-polish-2026-11-17/ui-polish');
const sizes = [
  { width: 320, height: 740 }, { width: 360, height: 640 }, { width: 390, height: 844 },
  { width: 768, height: 1024 }, { width: 820, height: 1180 },
  { width: 1024, height: 768 }, { width: 1440, height: 1000 },
];
const result = { base, checkedAt: new Date().toISOString(), screens: {}, checks: {}, failures: [], screenshots: [], pageErrors: [] };
const fixtures = JSON.parse(execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
  import fs from 'node:fs';
  import { PLAN_TEMPLATES, PLAN_RESOURCES } from './src/plan/catalog.ts';
  import { planCatalogCopy } from './src/plan/catalog-copy.ts';
  const ledger = JSON.parse(fs.readFileSync('data/route-library/biji-gpx-candidates.json', 'utf8'));
  console.log(JSON.stringify({ templates: PLAN_TEMPLATES, resources: PLAN_RESOURCES, copy: planCatalogCopy, ledger }));
`], { cwd: process.cwd(), encoding: 'utf8' }));
const pendingIds = ['xueshan-west-ridge', 'daxiaojian', 'zhijiayang-xueshan', 'pingfeng-two-days', 'badaxiu-four-days'];
const longRoute = fixtures.templates.find(route => route.id === 'jiaming-lake');
const longSource = fixtures.resources.find(resource => resource.id === 'shuiyang-water');
const longResource = fixtures.resources.find(resource => resource.id === 'shuanling-25k-camp');
const longTrack = fixtures.ledger.candidates.filter(track => track.templateId === 'daxiaojian').sort((a, b) => b.sourceTitle.length - a.sourceTitle.length)[0];
const copy = fixtures.copy;
const bodySelector = '.pc-template-summary,.pc-reference-note,.pc-route-outline span,.pc-resource-fields dd,.pc-planning-review,.pc-access-notice p,.pc-shanghe-sheets p,.pc-community-track-row h5,.pc-community-track-row p:not(h5+p),.pc-community-context,.pc-node-note,.pc-day-note';
const metaSelector = '.pc-template-region,.pc-template-meta,.pc-template-counts dt,.pc-template-checked,.pc-field-label,.pc-select-filter>span,.pc-resource-kind,.pc-availability,.pc-node-source-label,.pc-resource-fields dt,.pc-resource-sources a,.pc-route-sources a,.pc-community-track-row h5+p';

function check(ok, screen, label, detail) {
  if (!ok) result.failures.push({ screen, label, detail });
}
async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function shot(page, name) {
  await settle(page);
  await page.screenshot({ path: path.join(out, name), type: 'png' });
  result.screenshots.push(name);
}
async function expand(details) {
  if (!await details.evaluate(node => node.open)) await details.locator(':scope > summary').click();
}
function displayDate(value) {
  if (!value) return '未知';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}

async function audit(page, name) {
  await settle(page);
  const state = await page.locator('.plan-catalog').evaluate((scope, selectors) => {
    const visible = node => node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && node.getBoundingClientRect().height > 0;
    const rgba = value => {
      const numbers = value.match(/[\d.]+/g)?.map(Number);
      return numbers && numbers.length >= 3 ? [...numbers.slice(0, 3), numbers[3] ?? 1] : [0, 0, 0, 0];
    };
    const over = (fg, bg) => {
      const alpha = fg[3] + bg[3] * (1 - fg[3]);
      return [0, 1, 2].map(i => alpha ? (fg[i] * fg[3] + bg[i] * bg[3] * (1 - fg[3])) / alpha : 0).concat(alpha);
    };
    const luminance = rgb => rgb.slice(0, 3).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
    // Compose both text and its ground through group opacity, including disabled controls.
    const contrast = node => {
      let foreground = rgba(getComputedStyle(node).color), background = [0, 0, 0, 0];
      for (let current = node; current; current = current.parentElement) {
        const style = getComputedStyle(current), ground = rgba(style.backgroundColor), opacity = Number(style.opacity);
        foreground = over(foreground, ground); background = over(background, ground);
        foreground[3] *= opacity; background[3] *= opacity;
      }
      foreground = over(foreground, [255, 255, 255, 1]); background = over(background, [255, 255, 255, 1]);
      const values = [luminance(foreground), luminance(background)].sort((a, b) => a - b);
      return (values[1] + .05) / (values[0] + .05);
    };
    const label = node => (node.getAttribute('aria-label') || node.textContent || node.value || '').trim().replace(/\s+/g, ' ').slice(0, 180);
    const samples = selector => [...scope.querySelectorAll(selector)].filter(node => visible(node) && label(node)).map(node => {
      const style = getComputedStyle(node);
      return { text: label(node), tag: node.tagName, fontSize: parseFloat(style.fontSize), contrast: contrast(node), width: node.clientWidth, scrollWidth: node.scrollWidth, height: node.clientHeight, scrollHeight: node.scrollHeight, overflowX: style.overflowX, overflowY: style.overflowY, lineClamp: style.webkitLineClamp };
    });
    const controls = [...scope.querySelectorAll('button,summary,input,select,a[href]')].filter(visible).filter(node => !node.matches('[type=file]')).map(node => {
      const box = node.getBoundingClientRect();
      return { text: label(node), tag: node.tagName, height: box.height, fontSize: parseFloat(getComputedStyle(node).fontSize), contrast: contrast(node), disabled: node.disabled === true };
    });
    const motions = [...scope.querySelectorAll('*')].filter(visible).filter(node => {
      const style = getComputedStyle(node);
      return [style.animationDuration, style.transitionDuration].some(value => value.split(',').some(duration => parseFloat(duration) > .001));
    }).map(node => ({ text: label(node), animation: getComputedStyle(node).animationDuration, transition: getComputedStyle(node).transitionDuration }));
    return {
      viewport: innerWidth, documentWidth: document.documentElement.scrollWidth,
      catalogWidth: scope.clientWidth, catalogScrollWidth: scope.scrollWidth,
      body: samples(selectors.bodySelector), meta: samples(selectors.metaSelector), controls,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, motions,
    };
  }, { bodySelector, metaSelector });
  result.screens[name] = state;
  check(state.documentWidth <= state.viewport + 1 && state.catalogScrollWidth <= state.catalogWidth + 1, name, 'no horizontal overflow', { document: state.documentWidth, viewport: state.viewport, catalog: state.catalogWidth, catalogScroll: state.catalogScrollWidth });
  check(state.body.length > 0 && state.meta.length > 0, name, 'body and metadata samples exist', { body: state.body.length, meta: state.meta.length });
  check(state.body.every(sample => sample.fontSize >= 15.9), name, 'body text at least 16px', state.body.filter(sample => sample.fontSize < 15.9));
  check(state.meta.every(sample => sample.fontSize >= 13.9), name, 'source/date/tag text at least 14px', state.meta.filter(sample => sample.fontSize < 13.9));
  check(state.controls.every(control => control.height >= 47.9), name, 'all primary and source controls at least 48px tall', state.controls.filter(control => control.height < 47.9));
  check(state.controls.filter(control => /INPUT|SELECT/.test(control.tag)).every(control => control.fontSize >= 15.9), name, 'editable fields at least 16px', state.controls.filter(control => /INPUT|SELECT/.test(control.tag) && control.fontSize < 15.9));
  check([...state.body, ...state.meta].every(sample => sample.contrast >= 4.49), name, 'normal text contrast at least 4.5', [...state.body, ...state.meta].filter(sample => sample.contrast < 4.49));
  const clipped = [...state.body, ...state.meta].filter(sample => sample.width > 0 && (sample.scrollWidth > sample.width + 2 || sample.scrollHeight > sample.height + 2 && /hidden|clip/.test(sample.overflowY)));
  check(clipped.length === 0, name, 'display text not clipped', clipped);
  check(state.reducedMotion && state.motions.length === 0, name, 'reduced motion disables transitions and animations', state.motions);
  return state;
}

async function textLayout(locator, expectedText, name) {
  const state = await locator.evaluate(node => {
    const box = node.getBoundingClientRect(), style = getComputedStyle(node), lines = new Map(), outside = [];
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = walker.currentNode;
      let offset = 0;
      for (const character of text.textContent) {
        const range = document.createRange(); range.setStart(text, offset); range.setEnd(text, offset + character.length); offset += character.length;
        if (!character.trim()) continue;
        const glyph = range.getBoundingClientRect(), key = Math.round(glyph.top);
        lines.set(key, (lines.get(key) || '') + character);
        if (glyph.left < box.left - 2 || glyph.right > box.right + 2 || glyph.top < box.top - 2 || glyph.bottom > box.bottom + 2) outside.push(character);
      }
    }
    return { text: node.textContent, fontSize: parseFloat(style.fontSize), lineClamp: style.webkitLineClamp, lines: [...lines.values()], outside, width: box.width, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, overflowY: style.overflowY };
  });
  check(state.text.trim() === expectedText.trim(), name, 'full original text preserved', { expectedText, actual: state.text });
  check(state.outside.length === 0 && (!state.clientWidth || state.scrollWidth <= state.clientWidth + 2), name, 'every character fits its natural multiline layout', state);
  check(!state.lineClamp || state.lineClamp === 'none' || state.lineClamp === '0', name, 'no line clamp on important names or sources', state);
  result.checks[name] = state;
  return state;
}

async function main() {
  assert.ok(longRoute && longSource && longResource && longTrack, 'Actual long-text fixtures must exist');
  assert.deepEqual(fixtures.templates.filter(route => route.planningReady === false).map(route => route.id).sort(), [...pendingIds].sort());
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: sizes[0], reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', error => result.pageErrors.push(error.message));
    await page.goto(`${base}/?layer=conditions&plan=1`, { waitUntil: 'domcontentloaded' });
    const catalog = page.locator('.plan-catalog');
    await catalog.waitFor();
    const mode = catalog.getByRole('group', { name: copy.viewLabel, exact: true });
    const search = catalog.getByRole('searchbox', { name: copy.search, exact: true });
    const routesMode = mode.getByRole('button', { name: copy.routes, exact: true });
    const resourcesMode = mode.getByRole('button', { name: copy.resources, exact: true });
    for (const size of sizes) {
      await page.setViewportSize(size);
      await routesMode.click();
      await search.fill('');
      await page.locator('.plan-page').evaluate(node => node.scrollTo({ top: 0 }));
      const screen = `routes-${size.width}`;
      check(await catalog.locator('[data-template-id]').count() === fixtures.templates.length, screen, 'all routes remain in the library');
      check((await catalog.locator('.pc-reference-note').innerText()).includes('水源現況未知'), screen, 'unknown availability remains explicit');
      const initial = await audit(page, screen);
      const pending = initial.controls.filter(control => control.disabled);
      check(pending.length === pendingIds.length && pending.every(control => control.contrast >= 4.49), screen, 'all five paused templates have readable disabled controls', pending);
      for (const id of pendingIds) {
        const button = catalog.locator(`[data-template-id="${id}"] button.pc-use-template`);
        check(await button.isDisabled(), screen, `paused template ${id} remains disabled`);
        check((await button.innerText()).includes('暫停套用'), screen, `paused template ${id} keeps explanatory text`);
      }
      const jiaming = catalog.locator(`[data-template-id="${longRoute.id}"]`);
      await textLayout(jiaming.locator('h3'), longRoute.name, `mountain-name-${size.width}`);
      const checked = jiaming.locator('time');
      check(await checked.count() > 0 && await checked.first().getAttribute('datetime') === longRoute.checkedAt, screen, 'route checking time retains original machine-readable value');
      if (await checked.count()) check((await checked.first().innerText()).trim() === displayDate(longRoute.checkedAt), screen, 'route checking time retains original date meaning');
      await shot(page, `routes-${size.width}.png`);

      const trackCard = catalog.locator(`[data-template-id="${longTrack.templateId}"]`);
      await expand(trackCard.locator('.pc-template-details'));
      const more = trackCard.locator('.pc-community-more');
      if (await more.count()) await expand(more);
      const title = trackCard.getByRole('heading', { name: longTrack.sourceTitle, exact: true });
      const trackLayout = await textLayout(title, longTrack.sourceTitle, `track-title-${size.width}`);
      check(trackLayout.lines.length >= 2, screen, 'long GPX source title wraps to multiple lines', trackLayout);
      const trackRow = title.locator('..');
      const trackText = await trackRow.innerText();
      check(trackText.includes(longTrack.author) && trackText.includes(longTrack.recordedAt) && trackText.includes(longTrack.versionDifference), screen, 'GPX attribution, recording date and limitations preserved');
      check((await trackCard.innerText()).includes('不是推薦行程或上河步程時間'), screen, 'GPX usage limitation preserved');
      await title.scrollIntoViewIfNeeded();
      await shot(page, `track-title-${size.width}.png`);
      await audit(page, `expanded-route-${size.width}`);
      await trackCard.locator('.pc-template-details > summary').click();

      await resourcesMode.click();
      const resource = catalog.locator(`.pc-node-grid [data-resource-id="${longSource.id}"]`);
      check(await resource.locator('.pc-node-source-label').isVisible(), `source-${size.width}`, 'source attribution is readable before expanding the resource');
      await expand(resource);
      const fields = await resource.locator('.pc-resource-fields > div').evaluateAll(nodes => Object.fromEntries(nodes.map(node => [node.querySelector('dt').textContent.trim(), node.querySelector('dd').textContent.trim()])));
      const expectedFields = {
        [copy.sourceName]: longSource.sourceName, [copy.published]: displayDate(longSource.sourcePublishedAt),
        [copy.observed]: displayDate(longSource.observedAt), [copy.checked]: displayDate(longSource.checkedAt),
        [copy.limitations]: longSource.limitations, [copy.season]: longSource.season,
        [copy.availability]: copy.unknownAvailability,
      };
      for (const [label, expected] of Object.entries(expectedFields)) check(fields[label] === expected, `source-${size.width}`, `original ${label} retained`, { expected, actual: fields[label] });
      result.checks[`source-fields-${size.width}`] = fields;
      const sourceText = resource.locator('.pc-node-source-label');
      await textLayout(sourceText, `${copy.sourceName}：${longSource.sourceName}`, `source-name-${size.width}`);
      const sourceLinks = resource.locator('.pc-resource-sources a');
      check(await sourceLinks.count() === longSource.sourceUrls.length, `source-${size.width}`, 'all original source links remain');
      for (let index = 0; index < await sourceLinks.count(); index++) {
        const link = sourceLinks.nth(index), expected = longSource.sourceUrls[index];
        check(await link.getAttribute('href') === new URL(expected).href, `source-${size.width}`, 'source destination preserved', { expected, actual: await link.getAttribute('href') });
        const span = link.locator(':scope > span');
        check(await span.count() === 1, `source-${size.width}`, 'link text has a separate wrapping region');
        if (await span.count()) {
          const layout = await textLayout(span, await span.innerText(), `source-link-${size.width}-${index}`);
          if (size.width <= 390) check(layout.lines.length > 1, `source-${size.width}`, 'long source link wraps on phones', layout);
        }
      }
      const resourceName = catalog.locator(`.pc-node-grid [data-resource-id="${longResource.id}"] .pc-resource-name strong`);
      await textLayout(resourceName, longResource.name, `resource-name-${size.width}`);
      await resource.locator('.pc-resource-fields').scrollIntoViewIfNeeded();
      await shot(page, `source-fields-${size.width}.png`);
      await audit(page, `expanded-source-${size.width}`);
      await resource.locator(':scope > summary').click();
      await routesMode.click();
      // A real Tab key, rather than the selected-state color, must produce a visible focus ring.
      await routesMode.focus();
      await page.keyboard.press('Tab');
      const focus = await catalog.evaluate(node => {
        const active = document.activeElement, style = getComputedStyle(active);
        return { inside: node.contains(active), text: active.textContent, visible: active.matches(':focus-visible'), outlineWidth: parseFloat(style.outlineWidth), outlineStyle: style.outlineStyle };
      });
      check(focus.inside && focus.visible && focus.outlineWidth >= 2 && focus.outlineStyle !== 'none', `keyboard-${size.width}`, 'keyboard focus visible separately from selected state', focus);
      result.checks[`keyboard-${size.width}`] = focus;
      await search.focus();
      const searchFocus = await search.evaluate(node => {
        const fieldStyle = getComputedStyle(node.parentElement), inputStyle = getComputedStyle(node);
        return { outlineWidth: parseFloat(fieldStyle.outlineWidth), outlineStyle: fieldStyle.outlineStyle, outlineColor: fieldStyle.outlineColor, inputOutlineWidth: parseFloat(inputStyle.outlineWidth), inputOutlineStyle: inputStyle.outlineStyle };
      });
      check(searchFocus.outlineWidth >= 3 && searchFocus.outlineStyle !== 'none' && (searchFocus.inputOutlineStyle === 'none' || searchFocus.inputOutlineWidth === 0), `keyboard-${size.width}`, 'search has one visible group focus ring', searchFocus);
      result.checks[`search-focus-${size.width}`] = searchFocus;
      check(await page.evaluate(() => localStorage.getItem('mt-info-plan-v1')) === null, screen, 'browsing and visual checks do not create or save a draft');
    }
    check(result.pageErrors.length === 0, 'runtime', 'no page errors', result.pageErrors);
    await context.close();
  } finally {
    await browser.close();
    await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
  }
  console.log(JSON.stringify({ output: out, screens: Object.keys(result.screens).length, screenshots: result.screenshots.length, checks: Object.keys(result.checks).length, failures: result.failures, pageErrors: result.pageErrors }, null, 2));
  assert.equal(result.failures.length, 0, 'Route-library polish acceptance checks failed; see result.json');
}
main().catch(async error => {
  result.fatal = error.stack || error.message;
  await fs.mkdir(out, { recursive: true });
  await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
