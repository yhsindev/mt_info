import { describe, expect, it } from 'vitest';
import { inflateRawSync } from 'node:zlib';
import { createPlanPrintHtml, exportFilename, exportPlanDocx, safePlanUrl } from '../src/plan/export';
import { createBlankPlan, parsePlanDraft } from '../src/plan/model';
import { createDabaPlan } from '../src/plan/reference';

// Read the ZIP central directory to inspect real OOXML rather than trusting a file extension.
function zipMembers(bytes: Buffer) {
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(end).toBeGreaterThan(0);
  const members = new Map<string, string>(); let cursor = bytes.readUInt32LE(end + 16);
  for (let i = 0, count = bytes.readUInt16LE(end + 10); i < count; i++) {
    expect(bytes.readUInt32LE(cursor)).toBe(0x02014b50);
    const method = bytes.readUInt16LE(cursor + 10), length = bytes.readUInt32LE(cursor + 20);
    const nameLength = bytes.readUInt16LE(cursor + 28), extra = bytes.readUInt16LE(cursor + 30), comment = bytes.readUInt16LE(cursor + 32);
    const name = bytes.toString('utf8', cursor + 46, cursor + 46 + nameLength), local = bytes.readUInt32LE(cursor + 42);
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28), payload = bytes.subarray(start, start + length);
    members.set(name, (method === 8 ? inflateRawSync(payload) : payload).toString('utf8'));
    cursor += 46 + nameLength + extra + comment;
  }
  return members;
}

describe('計畫官方參考及匯出', () => {
  it('keeps source discrepancies and unknowns in a valid editable Daba draft', () => {
    const plan = createDabaPlan('2026-10-21T15:00:00Z');
    expect(parsePlanDraft(plan)).toEqual(plan);
    expect(plan.days.map(day => day.legs.reduce((n, leg) => n + (leg.minutes ?? 0), 0))).toEqual([570, 490, 490]);
    expect(plan.days.flatMap(day => day.legs).every(leg => leg.restMinutes === null && leg.ascentM === null)).toBe(true);
    expect(plan.days.every(day => day.water.availability === 'unknown' && day.lodging.reservation === 'unknown' && !day.retreat.confirmed)).toBe(true);
    expect(plan.leaderPhone).toBe(''); expect(plan.keeperPhone).toBe(''); expect(plan.advisories).toEqual([]);
    expect(plan.days[0].notes).toContain('不一致');
    expect(plan.days[0].water.note).toContain('不供應熱水');
  });
  it('escapes hostile text, suppresses unsafe links and keeps source/unknown metadata in print', () => {
    const plan = createBlankPlan(); plan.title = '<script>alert("x")</script>'; plan.notes = 'A & B';
    plan.days[0].legs[0].sourceUrl = 'javascript:alert(1)';
    plan.advisories = [{ id: 'old', title: '舊公告', description: '<img src=x onerror=alert(1)>', publisher: '測試發布者', sourceUrl: 'https://example.test/notice', issuedAt: '2026-10-01', closureDate: '2026-10-02', expectedOpeningDate: null, capturedAt: '2026-10-21T15:00:00Z', sourceCheckedAt: '2026-10-20T15:00:00Z', sourceStatus: 'stale' }];
    const html = createPlanPrintHtml(plan);
    expect(html).not.toContain('<script>'); expect(html).not.toContain('<img'); expect(html).not.toContain('href="javascript:');
    expect(html).toContain('&lt;script&gt;'); expect(html).toContain('A &amp; B'); expect(html).toContain('來源過期');
    expect(html).toContain('2026-10-21T15:00:00Z'); expect(html).toContain('2026-10-02'); expect(html).toContain('未知');
    expect(html).toContain("default-src 'none'"); expect(html).toContain('來源附錄');
    for (const value of ['javascript:alert(1)', 'https://user:secret@example.test', 'https://example.test/\nfoo', '//example.test']) expect(safePlanUrl(value)).toBeNull();
    expect(safePlanUrl('https://example.test/source?id=1')).toBe('https://example.test/source?id=1');
  });
  it('creates actual Word tables, links, title and footer with unknowns preserved', async () => {
    const plan = createDabaPlan(); plan.title = '大霸測試草稿'; plan.days[0].water.backup = '另行確認的備援';
    const blob = await exportPlanDocx(plan), members = zipMembers(Buffer.from(await blob.arrayBuffer()));
    expect(members.has('[Content_Types].xml')).toBe(true);
    const xml = members.get('word/document.xml')!;
    expect(xml).toContain('<w:tbl>'); expect(xml).toContain('w:val="Title"'); expect(xml).toContain('大霸測試草稿');
    expect(xml).toContain('另行確認的備援'); expect(xml).toContain('未知'); expect(xml).toContain('官方'); expect(xml).toContain('來源附錄');
    expect(xml).toContain('w:tblHeader'); expect(xml).toContain('w:vAlign');
    expect(members.get('word/_rels/document.xml.rels')).toContain('https://recreation.forest.gov.tw/Trail/RT?tr_id=027');
    expect([...members.keys()].some(name => /^word\/footer\d+\.xml$/.test(name))).toBe(true);
    expect([...members.keys()].some(name => name.startsWith('word/media/'))).toBe(false);
  });
  it('makes portable filenames without paths, bidi controls or reserved device names', () => {
    const plan = createBlankPlan(); plan.title = '../\\danger:\u202e名'; plan.startDate = '2026-11-14';
    const filename = exportFilename(plan, '.docx');
    expect(filename).not.toMatch(/[\\/:\u202e]/); expect(filename).toMatch(/_2026-11-14\.docx$/);
    plan.title = 'CON'; expect(exportFilename(plan, 'json')).toMatch(/^行程_CON/);
  });
});
