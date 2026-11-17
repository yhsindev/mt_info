/* Isolated visual-system QA. Run once the design changes have settled; no production test hooks. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const base = process.env.MT_INFO_QA_URL || 'http://127.0.0.1:5173';
const output = path.resolve(process.env.MT_INFO_QA_OUTPUT || 'artifacts/design-qa');
const skipPlan = process.argv.includes('--skip-plan');
const productionSmoke = process.argv.includes('--production-smoke');
const sourcesOnly = process.argv.includes('--sources-only');
const onlyViewport = process.argv.find(value => value.startsWith('--viewport='))?.split('=')[1];
const result = { base, checkedAt: new Date().toISOString(), screens: {}, checks: {}, failures: [], screenshots: [], pageErrors: [] };
const sizes = [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 360, height: 640 }];
const bodySelectors = {
  equipment: '.equipment-name,.equipment-place,.check-note,.equipment-details .detail-list dd',
  basins: '.body-copy,.basin-selected>p,.basin-selected .detail-list dd,.basin-rain>p',
  conditions: '.cd-original,.cd-row-main>span:not(.cd-effective-date),.cd-alert-overview p',
  catalog: '.pc-template-summary,.pc-route-outline span,.pc-resource-fields dd',
  plan: '.plan-overview-day>p,.plan-overview-day dd,.plan-help:not(.plan-meta),.plan-reference-note,.plan-advisory>p,.plan-issue-list li,.plan-field input,.plan-field textarea',
  sources: '.source-modal>p:not(.fine-print),.source-list a p',
};
const metaSelectors = {
  equipment: '.overview-count,.coverage-note,.equipment-sync-note,.equipment-sync-note small,.equipment-brief,.timestamp-list span,.timestamp-list b,.source-link,.coordinate-note,.panel-footer',
  basins: '.section-heading p,.basin-selected-title>span,.detail-list dt,.source-link,.panel-footer,.notice>span',
  conditions: '.cd-check-times span,.cd-check-times b,.cd-row-date,.cd-row-county,.cd-detail-grid dt,.cd-detail-grid dd,.cd-source-link,.cd-generated,.cd-source-state,.cd-source-block>p,.cd-effective-date',
  catalog: '.pc-template-region,.pc-template-meta span,.pc-template-counts dt,.pc-node-source-label,.pc-resource-fields dt,.pc-resource-sources a,.pc-reference-note,.pc-day-note',
  plan: '.plan-day-title small,.plan-leg-timing,.plan-advisory-times dt,.plan-advisory-times dd,.plan-source,.plan-meta,.plan-save-state,.plan-stat>span,.plan-stat small,.plan-field>span,.plan-overview-day dt,.plan-overview-day dd small,.plan-official-links>small',
  sources: '.source-list a small,.source-number,.fine-print,.modal-footer span',
};
function check(ok, screen, label, detail) { if (!ok) result.failures.push({ screen, label, detail }); }
async function settle(page) { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function shot(page, name) { await settle(page); await page.screenshot({ path: path.join(output, name), type: 'jpeg', quality: 90 }); result.screenshots.push(name); }
async function expand(scope, label) {
  const summary = scope.locator('summary').filter({ hasText: new RegExp(`^${label}$`) }).first();
  if (!await summary.evaluate(node => node.parentElement.open)) await summary.click();
}
async function inspect(page, scopeSelector, bodySelector, metaSelector) {
  return page.evaluate(({ scopeSelector, bodySelector, metaSelector }) => {
    const scope = document.querySelector(scopeSelector);
    const visible = el => el.checkVisibility() && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
    const rgba = text => { const values = text.match(/[\d.]+/g)?.map(Number); return values && values.length >= 3 ? [...values.slice(0, 3), values[3] ?? 1] : [0, 0, 0, 0]; };
    const over = (fg, bg) => { const a = fg[3] + bg[3] * (1 - fg[3]); return [0, 1, 2].map(i => a ? (fg[i] * fg[3] + bg[i] * bg[3] * (1 - fg[3])) / a : 0).concat(a); };
    const background = el => { const ancestors = []; for (let node = el; node; node = node.parentElement) ancestors.unshift(node); return ancestors.reduce((color, node) => over(rgba(getComputedStyle(node).backgroundColor), color), [255, 255, 255, 1]); };
    const luminance = color => color.slice(0, 3).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((total, value, index) => total + value * [.2126, .7152, .0722][index], 0);
    const text = node => (node.textContent || node.value || node.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 110);
    const samples = selector => [...scope.querySelectorAll(selector)].filter(node => visible(node) && text(node)).map(node => {
      const style = getComputedStyle(node), bg = background(node), fg = over(rgba(style.color), bg), l1 = luminance(fg), l2 = luminance(bg);
      return { selector: node.tagName.toLowerCase() + (node.className && typeof node.className === 'string' ? '.' + node.className.trim().split(/\s+/).join('.') : ''), text: text(node), editable: node.matches('input,textarea,select'), fontSize: parseFloat(style.fontSize), lineHeight: style.lineHeight, color: style.color, background: bg, contrast: +(Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05), width: node.clientWidth, scrollWidth: node.scrollWidth, height: node.clientHeight, scrollHeight: node.scrollHeight, overflowX: style.overflowX, overflowY: style.overflowY, textOverflow: style.textOverflow };
    });
    const excluded = '.maplibregl-ctrl,.maplibregl-marker,.rain-map-canvas,.rain-controls,.weather-view-switch';
    const controls = [...document.querySelectorAll('.header-nav button,.header-source,' + scopeSelector + ' button,' + scopeSelector + ' summary,' + scopeSelector + ' input,' + scopeSelector + ' select,' + scopeSelector + ' textarea,' + scopeSelector + ' a[href]')].filter(node => visible(node) && !node.closest(excluded) && !node.matches('input[type=checkbox],input[type=range],input[type=file]')).map(node => {
      const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
      const fonts = [], walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) { const part = walker.currentNode; if (part.textContent.trim() && part.parentElement?.checkVisibility() && !part.parentElement.closest('svg')) fonts.push(parseFloat(getComputedStyle(part.parentElement).fontSize)); }
      return { text: node.getAttribute('aria-label') || text(node), height: rect.height, width: rect.width, fontSize: fonts.length ? Math.min(...fonts) : parseFloat(style.fontSize), selector: node.tagName.toLowerCase() + '.' + (typeof node.className === 'string' ? node.className : '') };
    });
    const titles = [...scope.querySelectorAll(scopeSelector === '.source-modal' ? 'h2' : 'h1')].filter(visible).map(node => ({ text: text(node), fontSize: parseFloat(getComputedStyle(node).fontSize), color: getComputedStyle(node).color }));
    return { viewport: { width: innerWidth, height: innerHeight }, documentWidth: document.documentElement.scrollWidth, scopeWidth: scope.clientWidth, scopeScrollWidth: scope.scrollWidth, titles, body: samples(bodySelector), meta: samples(metaSelector), controls, nativeMapControls: [...scope.querySelectorAll('.maplibregl-ctrl button')].filter(visible).map(node => ({ label: node.getAttribute('aria-label'), height: node.getBoundingClientRect().height })), scrollContainers: [...scope.querySelectorAll('*')].filter(node => visible(node) && /^(auto|scroll)$/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight + 2).map(node => ({ className: node.className, height: node.clientHeight, scrollHeight: node.scrollHeight })) };
  }, { scopeSelector, bodySelector, metaSelector });
}
async function audit(page, screen, scopeSelector, type) {
  await settle(page); const state = await inspect(page, scopeSelector, bodySelectors[type], metaSelectors[type]); result.screens[screen] = state;
  check(state.documentWidth <= state.viewport.width + 1, screen, 'no document horizontal overflow', { width: state.documentWidth, viewport: state.viewport.width });
  check(state.scopeScrollWidth <= state.scopeWidth + 1, screen, 'no content horizontal overflow', { width: state.scopeWidth, scroll: state.scopeScrollWidth });
  check(state.body.length > 0, screen, 'body samples exist', state.body.length); check(state.meta.length > 0, screen, 'source/time samples exist', state.meta.length);
  const mobile = state.viewport.width <= 760, bodySize = 16, metaSize = 14;
  const smallBody = state.body.filter(sample => sample.fontSize < bodySize - .1); check(!smallBody.length, screen, `body text at least ${bodySize}px`, smallBody);
  const smallMeta = state.meta.filter(sample => sample.fontSize < metaSize - .1); check(!smallMeta.length, screen, `source/time text at least ${metaSize}px`, smallMeta);
  const lowContrast = [...state.body, ...state.meta].filter(sample => sample.contrast < 4.49); check(!lowContrast.length, screen, 'normal text contrast at least 4.5', lowContrast);
  // Editable single-line fields intentionally scroll their value; display text must wrap.
  const clipped = [...state.body, ...state.meta].filter(sample => !sample.editable && (sample.scrollWidth > sample.width + 2 || sample.scrollHeight > sample.height + 2 && /hidden|clip/.test(sample.overflowY))); check(!clipped.length, screen, 'body/source text not clipped', clipped);
  const expectedTitle = mobile ? 30 : 36; check(state.titles.length > 0 && state.titles.every(title => Math.abs(title.fontSize - expectedTitle) < .1), screen, `main title ${expectedTitle}px`, state.titles);
  const smallControlText = state.controls.filter(control => control.text && control.fontSize < (mobile ? 13.9 : 15.9)); check(!smallControlText.length, screen, 'readable control text', smallControlText);
  const smallInputText = state.controls.filter(control => /^(input|select|textarea)\./.test(control.selector) && control.fontSize < 15.9); check(!smallInputText.length, screen, 'form input/select text at least 16px', smallInputText);
  if (state.viewport.width <= 760) { const smallControls = state.controls.filter(control => control.height < 47.9); check(!smallControls.length, screen, 'mobile target height at least 48px', smallControls); }
  await shot(page, screen + '.jpg');
}
async function focusCheck(page) {
  const nav = page.getByRole('navigation', { name: '主要工具', exact: true });
  await nav.getByRole('button', { name: '急救', exact: true }).focus(); await page.keyboard.press('Tab');
  const state = await nav.evaluate(node => {
    const active = node.querySelector('[aria-pressed=true]'), focused = document.activeElement;
    const focusedStyle = getComputedStyle(focused), activeStyle = active && getComputedStyle(active, '::after');
    return { active: active?.textContent, focused: focused?.textContent, differentElements: active !== focused, focusVisible: focused.matches(':focus-visible'), outlineStyle: focusedStyle.outlineStyle, outlineWidth: parseFloat(focusedStyle.outlineWidth), activeIndicator: activeStyle ? { background: activeStyle.backgroundColor, height: activeStyle.height, border: getComputedStyle(active).borderBottomColor } : null };
  });
  check(state.differentElements && state.focusVisible && state.outlineStyle !== 'none' && state.outlineWidth >= 2, 'navigation', 'keyboard focus distinguishable from current page', state);
  result.checks.keyboardFocusVsActive = state;
}
async function brandIdentityCheck(page, width) {
  await page.waitForFunction(() => { const image = document.querySelector('.brand-symbol img'); return image?.complete && image.naturalWidth > 0; });
  const identity = await page.locator('.brand').evaluate(node => {
    const image = node.querySelector('img'), wordmark = node.querySelector(':scope > span:last-child');
    return { src: image.getAttribute('src'), naturalWidth: image.naturalWidth, width: image.width, family: getComputedStyle(wordmark).fontFamily, weight: getComputedStyle(wordmark).fontWeight, favicon: document.querySelector('link[rel=icon]').getAttribute('href') };
  });
  check(identity.src === '/brand/mt-info-symbol-reverse.svg' && identity.family.includes('Georgia') && Number(identity.weight) >= 700, `brand-${width}`, 'refined C icon and existing Georgia wordmark applied', identity);
  check(identity.favicon === '/brand/mt-info-favicon.svg', `brand-${width}`, 'refined favicon linked', identity.favicon);
  const favicon = await page.request.get(new URL(identity.favicon, base).href);
  check(favicon.ok() && (await favicon.text()).includes('viewBox="0 0 16 16"'), `brand-${width}`, 'optical 16px favicon asset loads', favicon.status());
  result.checks[`brandIdentity${width}`] = identity;
}
async function equipmentMapReady(page, width) {
  // Observe the existing React ref without adding a production test API.
  // A base-map load alone can precede GeoJSON worker processing and leave a misleading empty screenshot.
  const state = await page.waitForFunction(() => {
    const node = document.querySelector('.map-canvas'); if (!node) return false;
    const key = Object.keys(node).find(key => key.startsWith('__reactFiber$')); if (!key) return false;
    let map;
    for (let fiber = node[key], depth = 0; fiber && !map && depth < 60; fiber = fiber.return, depth++) {
      for (let hook = fiber.memoizedState, count = 0; hook && count < 100; hook = hook.next, count++) {
        const candidate = hook.memoizedState?.current;
        if (typeof candidate?.queryRenderedFeatures === 'function' && typeof candidate?.getStyle === 'function') { map = candidate; break; }
      }
    }
    if (!map || map.isMoving()) return false;
    const ids = map.getStyle()?.layers.filter(layer => /^equipment-/.test(layer.id) && layer.layout?.visibility !== 'none').map(layer => layer.id) || [];
    if (!ids.length) return false;
    const rendered = map.queryRenderedFeatures({ layers: ids });
    return rendered.length ? { renderedFeatures: rendered.length, zoom: map.getZoom(), clusterIconVisibility: map.getStyle().layers.filter(layer => /^equipment-.*-cluster-icon$/.test(layer.id)).map(layer => ({ id: layer.id, visibility: layer.layout?.visibility })), domEquipmentMarkers: document.querySelectorAll('.equipment-selected-marker').length } : false;
  }, null, { timeout: 20000 });
  result.checks[`equipmentMapReady${width}`] = await state.jsonValue(); await state.dispose(); await settle(page);
}
async function getMapHandle(page) {
  return page.waitForFunction(() => {
    const node = document.querySelector('.map-canvas'); if (!node) return false;
    const key = Object.keys(node).find(key => key.startsWith('__reactFiber$')); if (!key) return false;
    for (let fiber = node[key], depth = 0; fiber && depth < 60; fiber = fiber.return, depth++) {
      for (let hook = fiber.memoizedState, count = 0; hook && count < 100; hook = hook.next, count++) {
        const candidate = hook.memoizedState?.current;
        if (typeof candidate?.queryRenderedFeatures === 'function' && typeof candidate?.getStyle === 'function') return candidate;
      }
    }
    return false;
  });
}
async function outsidePanelCheck(page, name, collapsed = false) {
  const state = await page.evaluate(() => {
    const visible = node => node && node.checkVisibility() && node.getBoundingClientRect().height > 0;
    const read = node => { const style = getComputedStyle(node), rect = node.getBoundingClientRect(); return { text: node.getAttribute('aria-label') || node.textContent.trim(), fontSize: parseFloat(style.fontSize), height: rect.height, width: rect.width, top: rect.top, bottom: rect.bottom, display: style.display }; };
    const header = [...document.querySelectorAll('.header-nav button,.header-source')].filter(visible).map(read);
    const count = document.querySelector('.overview-count'), toggle = document.querySelector('.mobile-view-toggle');
    const filters = [...document.querySelectorAll('.filter-chips button')].filter(visible).map(read);
    const title = document.querySelector('.overview-title h1'), introSearch = document.querySelector('.panel-intro input');
    return { width: innerWidth, documentWidth: document.documentElement.scrollWidth, header, count: count && visible(count) ? read(count) : null, toggle: toggle && visible(toggle) ? read(toggle) : null, title: title && visible(title) ? read(title) : null, introSearch: introSearch && visible(introSearch) ? read(introSearch) : null, filters, sheetTop: document.querySelector('.information-panel')?.getBoundingClientRect().top };
  });
  check(state.documentWidth <= state.width, name, 'intro/header do not overflow', state);
  const mobile = state.width <= 760;
  check(state.header.every(control => control.fontSize >= (mobile ? 14 : 16) && control.height >= 48), name, 'header text and hit targets readable/48px', state.header);
  if (collapsed) check(state.count && state.count.fontSize >= 14, name, 'collapsed overview count readable', state.count);
  if (state.title) check(Math.abs(state.title.fontSize - (mobile ? 30 : 36)) < .1, name, 'intro title size', state.title);
  if (state.toggle) check(state.toggle.fontSize >= (mobile ? 15 : 16) && state.toggle.height >= 48 && state.toggle.bottom <= state.sheetTop + 1, name, 'map/list toggle readable/48px and above sheet', { toggle: state.toggle, sheetTop: state.sheetTop });
  check(state.filters.every(control => control.fontSize >= (mobile ? 15 : 16) && control.height >= 48), name, 'filter controls readable/48px', state.filters);
  result.checks[name] = state;
}
async function sourceDialogCheck(page, width) {
  await page.locator('.header-source').click(); await page.locator('dialog[open] .source-modal').waitFor();
  await audit(page, `sources-${width}`, '.source-modal', 'sources');
  const owner = await page.locator('.source-modal .source-list a small').first().evaluate(node => ({ text: node.textContent, fontSize: parseFloat(getComputedStyle(node).fontSize) }));
  const close = page.locator('dialog[open] .icon-button');
  const closeSize = await close.evaluate(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height }));
  check(owner.fontSize >= 14 && closeSize.height >= 48 && closeSize.width >= 48, `sources-${width}`, 'source owner metadata and close target', { owner, closeSize });
  const heading = await page.locator('.source-modal h2').evaluate(node => {
    const lines = new Map(), walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT), style = getComputedStyle(node);
    while (walker.nextNode()) {
      const part = walker.currentNode; let offset = 0;
      for (const character of part.textContent) {
        const range = document.createRange(); range.setStart(part, offset); range.setEnd(part, offset + character.length); offset += character.length;
        if (!character.trim()) continue;
        const rect = range.getBoundingClientRect(), key = Math.round(rect.top);
        lines.set(key, (lines.get(key) || '') + character);
      }
    }
    return { text: node.textContent, fontSize: parseFloat(style.fontSize), textWrapStyle: style.textWrapStyle, lines: [...lines.values()] };
  });
  check(Math.abs(heading.fontSize - (width <= 760 ? 30 : 36)) < .1 && (heading.lines.length < 2 || Math.max(...heading.lines.map(line => [...line].length)) - Math.min(...heading.lines.map(line => [...line].length)) <= 2), `sources-${width}`, 'source heading size and balanced wrapping', heading);
  result.checks[`sourceDialog${width}`] = { owner, closeSize, heading };
  await close.click();
}
async function basinSelectionSmoke(page) {
  check(await page.locator('.panel-intro .search-field').count() === 0, 'basins production', 'unsupported basin search omitted', await page.locator('.panel-intro .search-field').count());
  const toggle = page.locator('.mobile-view-toggle');
  if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
  const map = await getMapHandle(page);
  try {
    await map.evaluate(map => map.jumpTo({ center: [121.28, 24.37], zoom: 10 }));
    const deadline = Date.now() + 18000;
    let point = null;
    while (!point && Date.now() < deadline) {
      point = await map.evaluate(map => {
        if (!map.getLayer('basin-fill')) return null;
        const box = map.getContainer().getBoundingClientRect(), sheet = document.querySelector('.information-panel')?.getBoundingClientRect();
        const bottom = Math.min(box.height - 25, (sheet?.top ?? box.bottom) - box.top - 20);
        for (let y = 110; y < bottom; y += 28) for (let x = 30; x < box.width - 60; x += 28) {
          const target = document.elementFromPoint(box.left + x, box.top + y);
          if (!target?.closest('.map-canvas')) continue;
          const feature = map.queryRenderedFeatures([x, y], { layers: ['basin-fill'] })[0];
          if (feature?.properties?.ws_id != null) return { x: box.left + x, y: box.top + y, id: String(feature.properties.ws_id), name: String(feature.properties.ws_name || '') };
        }
        return null;
      });
      if (!point) await page.waitForTimeout(600);
    }
    const outlineWidth = await map.evaluate(map => map.getPaintProperty('basin-selected-outline', 'line-width'));
    check(outlineWidth === 4, 'basins production', 'selected basin outline is 4px', outlineWidth);
    if (point) {
      await page.mouse.click(point.x, point.y); await page.waitForTimeout(100);
      const filters = await map.evaluate(map => ({ fill: map.getFilter('basin-selected'), outline: map.getFilter('basin-selected-outline') }));
      check(JSON.stringify(filters.fill) === JSON.stringify(filters.outline) && JSON.stringify(filters.fill).includes(JSON.stringify(point.id)), 'basins production', 'real MVT selection updates fill and outline filters together', { point, filters });
      if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
      const text = await page.locator('.basin-selected').innerText(); check(text.includes(point.id) && (!point.name || text.includes(point.name)), 'basins production', 'selected MVT feature matches details', { point, text });
      result.checks.realBasinSelection = { point, outlineWidth, filters, text };
      await shot(page, 'production-basin-selected-390.jpg');
    } else result.checks.realBasinSelection = { available: false, outlineWidth, note: 'No selectable official MVT feature loaded in the visible viewport within 18 seconds; selection behavior not claimed.' };
  } finally { await map.dispose(); }
}
async function productionChecks(browser) {
  for (const size of sizes.filter(size => size.width < 761)) {
    const context = await browser.newContext({ viewport: size, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const page = await context.newPage(); page.on('pageerror', error => result.pageErrors.push({ viewport: size.width, message: error.message }));
    try {
      await page.goto(base + '/?layer=equipment', { waitUntil: 'domcontentloaded' }); await page.locator('.equipment-card').first().waitFor({ state: 'attached' });
      await equipmentMapReady(page, size.width); await outsidePanelCheck(page, `production-intro-collapsed-${size.width}`, true);
      await shot(page, `production-equipment-map-${size.width}.jpg`);
      await page.locator('.mobile-view-toggle').click(); await outsidePanelCheck(page, `production-intro-expanded-${size.width}`);
      await sourceDialogCheck(page, size.width);
      if (size.width === 390) {
        await page.getByRole('navigation', { name: '主要工具' }).getByRole('button', { name: '集水區', exact: true }).click(); await page.locator('.basin-selected').waitFor({ state: 'attached' }); await basinSelectionSmoke(page);
        await page.getByRole('navigation', { name: '主要工具' }).getByRole('button', { name: '路況', exact: true }).click(); await page.locator('.cd-trail-row').first().waitFor();
        const order = await page.locator('.conditions-dashboard').evaluate(node => {
          const stats = node.querySelector('.cd-statistics'), search = node.querySelector('.cd-filters'), regions = node.querySelector('.cd-regions');
          return { searchAfterStatistics: !!(stats.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING), searchBeforeRegions: !!(search.compareDocumentPosition(regions) & Node.DOCUMENT_POSITION_FOLLOWING), statistics: stats.textContent, checkedAt: node.querySelector('.cd-check-times')?.textContent };
        });
        check(order.searchAfterStatistics && order.searchBeforeRegions, 'conditions production', 'search appears between statistics and regional cards', order); result.checks.productionConditions = order;
        await page.getByRole('navigation', { name: '主要工具' }).getByRole('button', { name: '計畫通', exact: true }).click(); const plan = page.locator('.plan-page'); await plan.waitFor();
        await plan.locator('[data-template-id=xueshan]').getByRole('button', { name: '使用此範本', exact: true }).click(); await plan.getByRole('alertdialog').getByRole('button', { name: '確認取代', exact: true }).click();
        await plan.getByLabel('計畫名稱', { exact: true }).fill('【QA】正式版大字計畫保存');
        await page.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('mt-info-plan-v1'))?.title === '【QA】正式版大字計畫保存'; } catch { return false; } });
        await plan.getByRole('button', { name: '儲存／匯出', exact: true }).click(); await settle(page);
        const exportState = await plan.locator('#plan-export-section').evaluate(node => ({ focused: document.activeElement === node, top: node.getBoundingClientRect().top, title: node.querySelector('h2')?.textContent }));
        check(exportState.focused && exportState.top >= 0 && exportState.top < size.height, 'plan production', 'third step scrolls and focuses export tools', exportState);
        await shot(page, 'production-plan-export-390.jpg');
        await page.getByRole('navigation', { name: '主要工具' }).getByRole('button', { name: '路況', exact: true }).click();
        await page.getByRole('navigation', { name: '主要工具' }).getByRole('button', { name: '計畫通', exact: true }).click(); await plan.waitFor();
        check(await plan.getByLabel('計畫名稱', { exact: true }).inputValue() === '【QA】正式版大字計畫保存', 'plan production', 'draft restores after navigation', true); result.checks.productionPlan = { savedAndRestored: true, exportState };
      }
    } finally { await context.close(); }
  }
  await scheduledClosureCheck(browser); await rainRegression(browser);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await context.newPage();
  try {
    page.on('pageerror', error => result.pageErrors.push(error.message)); await page.goto(base + '/brand-study.html');
    await page.waitForFunction(() => [...document.images].length === 18 && [...document.images].every(image => image.complete && image.naturalWidth > 0));
    result.checks.brandImages = await page.locator('img').evaluateAll(images => images.map(image => ({ src: image.getAttribute('src'), width: image.naturalWidth, height: image.naturalHeight })));
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'brand production', 'brand comparison does not overflow', true); await shot(page, 'production-brand-390.jpg');
  } finally { await context.close(); }
}
async function retestSources(browser) {
  const previous = JSON.parse(await fs.readFile(path.join(output, 'production-result.json'), 'utf8'));
  assert.equal(previous.base, base, 'Resume only the same production preview');
  await fs.copyFile(path.join(output, 'production-result.json'), path.join(output, 'production-source-classification-before.json'));
  result.screens = previous.screens; result.checks = previous.checks; result.pageErrors = previous.pageErrors;
  result.screenshots = previous.screenshots; result.failures = previous.failures.filter(failure => !failure.screen.startsWith('sources-'));
  result.checks.targetedSourceRetest = { priorCheckedAt: previous.checkedAt, retestedAt: new Date().toISOString(), correctedClassification: 'Source fine-print is metadata (14px), excluded from body (16px).' };
  for (const size of sizes.filter(size => size.width < 761)) {
    const context = await browser.newContext({ viewport: size, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const page = await context.newPage(); page.on('pageerror', error => result.pageErrors.push(error.message));
    try { await page.goto(base + '/?layer=conditions'); await sourceDialogCheck(page, size.width); }
    finally { await context.close(); }
  }
  result.screenshots = [...new Set(result.screenshots)];
}
async function conditions(page, size) {
  await page.getByRole('navigation', { name: '主要工具' }).getByRole('button', { name: '路況', exact: true }).click();
  const board = page.locator('.conditions-dashboard'); await board.waitFor();
  await page.waitForFunction(() => document.querySelector('.cd-trail-row'));
  const first = board.locator('.cd-trail-row').first(); await first.locator('.cd-row-toggle').click();
  const alert = board.locator('.cd-alert-row').first(); if (await alert.count()) await alert.locator('.cd-alert-toggle').click();
  await board.locator('.cd-source-details>summary').click();
  const anchors = {};
  for (const [id, label] of [['north', '北部'], ['central', '中部'], ['south', '南部'], ['east', '東部']]) {
    await board.locator('.cd-regions').getByRole('button', { name: new RegExp(`^${label}`) }).click(); await settle(page);
    const position = await board.locator(`[data-region=${id}] h2`).boundingBox(); const top = (await board.boundingBox()).y;
    check(position && position.y >= top - 1 && position.y < size.height, `conditions-${size.width}`, 'region heading remains reachable ' + id, { position, top }); anchors[id] = position;
  }
  result.checks[`conditionAnchors${size.width}`] = anchors;
  await board.evaluate(node => node.scrollTo({ top: 0 })); await audit(page, `conditions-${size.width}`, '.conditions-dashboard', 'conditions');
  await first.scrollIntoViewIfNeeded(); await shot(page, `conditions-expanded-${size.width}.jpg`);
}
async function planner(page, size) {
  await page.getByRole('navigation', { name: '主要工具' }).getByRole('button', { name: '計畫通', exact: true }).click();
  const plan = page.locator('.plan-page'); await plan.waitFor();
  await plan.getByRole('button', { name: '選擇路線', exact: true }).click();
  const template = plan.locator('[data-template-id=xueshan]'); await template.locator('.pc-template-details>summary').click();
  await template.locator('[data-resource-id]').first().locator('summary').click();
  await plan.evaluate(node => node.scrollTo({ top: 0 })); await audit(page, `catalog-${size.width}`, '.plan-page', 'catalog');
  await template.getByRole('button', { name: '使用此範本', exact: true }).click(); await plan.getByRole('alertdialog').getByRole('button', { name: '確認取代', exact: true }).click();
  await plan.locator('.plan-overview-day').first().waitFor();
  const day = plan.locator('.plan-day').first(); await expand(day, '飲水與取水'); await expand(day, '住宿與備案'); await expand(day, '撤退與決策');
  await plan.evaluate(node => node.scrollTo({ top: 0 })); await audit(page, `plan-${size.width}`, '.plan-page', 'plan');
  await plan.getByRole('button', { name: '編輯第 2 天', exact: true }).click(); await settle(page);
  const selectedDay = plan.locator('.plan-day').nth(1), position = await selectedDay.boundingBox();
  check(await selectedDay.evaluate(node => node.open) && position?.y >= 0 && position?.y < size.height, `plan-${size.width}`, 'day editor remains reachable', position);
  await shot(page, `plan-fields-${size.width}.jpg`);
  const exportStep = plan.getByRole('button', { name: '儲存／匯出', exact: true });
  check(await exportStep.count() === 1, `plan-${size.width}`, 'three-stage planner export entry exists', await exportStep.count());
  if (await exportStep.count()) {
    await exportStep.click(); await settle(page);
    const exportPosition = await plan.locator('#plan-export-section').boundingBox();
    const focused = await plan.locator('#plan-export-section').evaluate(node => node === document.activeElement);
    check(focused && exportPosition?.y >= 0 && exportPosition?.y < size.height, `plan-${size.width}`, 'export stage focuses and scrolls to export tools', { focused, position: exportPosition });
    await shot(page, `plan-export-${size.width}.jpg`);
  }
  await plan.evaluate(node => node.scrollTo({ top: node.scrollHeight }));
  const clear = plan.getByRole('button', { name: '清除草稿', exact: true });
  await clear.scrollIntoViewIfNeeded(); check(await clear.isVisible(), `plan-${size.width}`, 'end-of-plan controls reachable', true);
  const title = `【QA】手機比例保存 ${size.width}`;
  await plan.getByLabel('計畫名稱', { exact: true }).fill(title);
  await page.waitForFunction(title => JSON.parse(localStorage.getItem('mt-info-plan-v1'))?.title === title, title);
  await page.getByRole('navigation', { name: '主要工具' }).getByRole('button', { name: '路況', exact: true }).click();
  await page.getByRole('navigation', { name: '主要工具' }).getByRole('button', { name: '計畫通', exact: true }).click();
  check(await plan.getByLabel('計畫名稱', { exact: true }).inputValue() === title, `plan-${size.width}`, 'draft retained after leaving and reopening', true);
}
async function rainRegression(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage(); page.on('pageerror', error => result.pageErrors.push(error.message));
  try {
    await page.goto(`${base}/?layer=weather`); const canvas = page.locator('.rain-map-canvas'); await canvas.waitFor();
    const states = [];
    for (const label of ['每 6 小時', '每 12 小時']) {
      await canvas.locator('.rain-canvas-products').getByRole('button', { name: label, exact: true }).click();
      await page.waitForFunction(() => { const img = document.querySelector('.rain-image-stage>img'); return img?.complete && img.naturalWidth > 0 && !img.classList.contains('image-hidden'); }, null, { timeout: 35000 });
      const image = await canvas.locator('.rain-image-stage>img').evaluate(node => ({ url: node.src, naturalWidth: node.naturalWidth, naturalHeight: node.naturalHeight, alt: node.alt, status: document.querySelector('.rain-image-state')?.textContent, insetPresent: !!document.querySelector('.rain-time-inset'), imageHeight: node.height }));
      check(/^https:\/\/www\.cwa\.gov\.tw\//.test(image.url) && image.naturalWidth > 1000 && image.naturalHeight > 1000 && image.insetPresent && image.status === '圖面已載入', 'rain', 'official full image/time inset retained ' + label, image);
      states.push(image);
    }
    const next = canvas.getByRole('button', { name: '下一時段', exact: true }); const before = await canvas.locator('.rain-image-stage>img').getAttribute('src'); await next.click();
    await page.waitForFunction(previous => { const img = document.querySelector('.rain-image-stage>img'); return img?.src !== previous && img?.complete && img.naturalWidth > 0 && !img.classList.contains('image-hidden'); }, before, { timeout: 35000 });
    const play = canvas.getByRole('button', { name: '播放時段', exact: true }); await play.click(); await canvas.getByRole('button', { name: '暫停播放', exact: true }).click();
    check(await canvas.getByRole('button', { name: '播放時段', exact: true }).count() === 1, 'rain', 'play/pause retained', true);
    result.checks.rainRegression = { images: states, frameSwitch: true, playPause: true, controlsExcludedFromNew48pxRule: true };
    await page.waitForFunction(() => document.querySelector('.rain-image-state')?.textContent === '圖面已載入', null, { timeout: 35000 }); await shot(page, 'rain-unchanged-390.jpg');
  } finally { await context.close(); }
}
async function scheduledClosureCheck(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage(); page.on('pageerror', error => result.pageErrors.push(error.message));
  try {
    const data = await (await context.request.get(`${base}/api/conditions`)).json(), sourceItem = data.trails.items[0]; assert.ok(sourceItem);
    const now = Date.now(), tomorrow = new Date(now + 32 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const fixture = structuredClone(data); fixture.generatedAt = new Date(now).toISOString();
    for (const feed of [fixture.trails, fixture.alerts]) { feed.status = 'ready'; feed.checkedAt = new Date(now).toISOString(); feed.fetchedAt = feed.checkedAt; }
    fixture.trails.items = [
      { ...sourceItem, id: 'qa:scheduled-closed', name: '【QA 合成】翌日封閉顯示', condition: 'closed', rawCondition: '封閉', closureDate: tomorrow, expectedOpeningDate: '2020-01-01', issuedAt: new Date(now).toISOString(), description: '僅供版面驗收的合成公告，非官方事件。' },
      { ...sourceItem, id: 'qa:scheduled-partial', name: '【QA 合成】翌日局部限制顯示', condition: 'partial', rawCondition: '局部限制', closureDate: tomorrow, issuedAt: new Date(now).toISOString(), description: '僅供版面驗收的合成公告，非官方事件。' },
    ]; fixture.alerts.status = 'empty'; fixture.alerts.items = [];
    if (data.alerts.items[0]) {
      fixture.alerts.status = 'ready';
      fixture.alerts.items = [{ ...data.alerts.items[0], id: 'qa:design-expiry', identifier: 'qa:design-expiry', headline: '【QA 合成】短效示警，非官方事件', publisher: 'QA 受控資料', issuedAt: new Date(now - 60000).toISOString(), effectiveAt: new Date(now - 30000).toISOString(), expiresAt: new Date(now + 90000).toISOString() }];
    }
    await page.clock.install({ time: now }); await page.route('**/api/conditions', route => route.fulfill({ status: 200, json: fixture }));
    await page.goto(`${base}/?layer=conditions`);
    const closed = page.locator('[data-condition-id="qa:scheduled-closed"]'), partial = page.locator('[data-condition-id="qa:scheduled-partial"]');
    await closed.waitFor();
    check((await closed.innerText()).includes('預定封閉') && (await partial.innerText()).includes('預定限制'), 'scheduled closure', 'future source dates not presented as already effective', { closed: await closed.innerText(), partial: await partial.innerText() });
    check(await closed.locator('time').getAttribute('datetime') === tomorrow, 'scheduled closure', 'exact source effective calendar date retained', tomorrow);
    const counts = await page.locator('.cd-stat strong').allTextContents(); check(counts[0] === '1' && counts[1] === '1', 'scheduled closure', 'source status counts unchanged', counts);
    await closed.scrollIntoViewIfNeeded(); await shot(page, 'conditions-scheduled-390.jpg');
    if (fixture.alerts.items.length) {
      await page.locator('[data-condition-id="qa:design-expiry"]').waitFor();
      await page.clock.fastForward(120000);
      await page.locator('[data-condition-id="qa:design-expiry"]').waitFor({ state: 'detached' });
      check(await closed.count() === 1, 'CAP timer production', 'expiry removes CAP and retains trail announcements', true);
      result.checks.capBoundaryTimer = { fixtureOnly: true, advancedSeconds: 120, expiredRemoved: true, trailRetained: true };
    }
    await page.clock.fastForward(24 * 60 * 60 * 1000 - (fixture.alerts.items.length ? 120000 : 0));
    await page.waitForFunction(() => document.querySelector('[data-condition-id="qa:scheduled-closed"]')?.textContent.includes('當日生效'));
    check((await closed.innerText()).includes('時刻未提供') && !(await closed.locator('.cd-trail-badge').innerText()).includes('預定'), 'scheduled closure', 'effective day states unknown exact time', await closed.innerText());
    result.checks.scheduledClosure = { fixtureOnly: true, effectiveDate: tomorrow, rawCountsPreserved: true, onDateDoesNotInferExactTime: true, openingDateDoesNotReopen: true };
  } finally { await context.close(); }
}
(async () => {
  await fs.mkdir(output, { recursive: true }); const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    if (sourcesOnly) await retestSources(browser);
    else if (productionSmoke) await productionChecks(browser);
    else {
    for (const size of sizes.filter(size => !onlyViewport || size.width === Number(onlyViewport))) {
      const context = await browser.newContext({ viewport: size, isMobile: size.width < 761, hasTouch: size.width < 761, reducedMotion: 'reduce' });
      const page = await context.newPage(); page.on('pageerror', error => result.pageErrors.push({ viewport: size.width, message: error.message }));
      try {
        await page.goto(base + '/?layer=equipment', { waitUntil: 'domcontentloaded' }); await page.locator('.equipment-card').first().waitFor({ state: 'attached' });
        await page.waitForFunction(() => document.querySelector('.maplibregl-canvas') && !document.querySelector('.map-state'), null, { timeout: 30000 });
        await equipmentMapReady(page, size.width);
        await brandIdentityCheck(page, size.width);
        await outsidePanelCheck(page, `intro-collapsed-${size.width}`, true);
        await shot(page, `equipment-map-${size.width}.jpg`);
        if (size.width < 761) { const toggle = page.locator('.mobile-view-toggle'); if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click(); }
        await outsidePanelCheck(page, `intro-expanded-${size.width}`);
        await sourceDialogCheck(page, size.width);
        await page.locator('.equipment-summary').first().click(); await page.locator('.equipment-details').first().waitFor();
        await page.locator('.panel-content').evaluate(node => node.scrollTo({ top: 0 })); await audit(page, `equipment-${size.width}`, '.workspace', 'equipment');
        await page.locator('.equipment-details .source-link').first().scrollIntoViewIfNeeded(); await shot(page, `equipment-expanded-${size.width}.jpg`);
        if (size.width === 1440) await focusCheck(page);
        await page.getByRole('navigation', { name: '主要工具' }).getByRole('button', { name: '集水區', exact: true }).click(); await page.locator('.basin-selected').waitFor({ state: 'attached' });
        if (size.width < 761) { const toggle = page.locator('.mobile-view-toggle'); if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click(); }
        await page.locator('.panel-content').evaluate(node => node.scrollTo({ top: 0 })); await audit(page, `basins-${size.width}`, '.workspace', 'basins');
        await page.locator('.basin-rain').scrollIntoViewIfNeeded(); await shot(page, `basins-guidance-${size.width}.jpg`);
        if (size.width === 390) await basinSelectionSmoke(page);
        await conditions(page, size); if (!skipPlan) await planner(page, size);
      } finally { await context.close(); }
    }
    await scheduledClosureCheck(browser);
    if (!process.argv.includes('--skip-rain')) await rainRegression(browser);
    }
    check(result.pageErrors.length === 0, 'global', 'no page errors', result.pageErrors);
    assert.deepEqual(result.failures, []);
  } catch (error) { result.failure = error.stack || error.message; throw error; }
  finally { await browser.close(); await fs.writeFile(path.join(output, productionSmoke || sourcesOnly ? 'production-result.json' : skipPlan ? 'maps-result.json' : 'result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify({ screens: Object.keys(result.screens), checks: Object.keys(result.checks), failures: result.failures, screenshots: result.screenshots, pageErrors: result.pageErrors, failure: result.failure || null }, null, 2)); }
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
