import {describe, expect, it} from 'vitest';
import {XMLValidator} from 'fast-xml-parser';
import {createPlanDay, createPlanLeg} from '../src/plan/model';
import {createPlanDiagramSvg, planDiagramSegments, planDiagramSize, type PlanDiagramInput} from '../src/plan/diagram';

function fixture(): PlanDiagramInput {
  const day = createPlanDay(); day.startTime = '23:30';
  day.legs = [{...createPlanLeg(), from:'登山口', to:'山屋', minutes:90, restMinutes:10, distanceKm:3, sourceUrl:'https://example.test/record?a=1&b=2'}, {...createPlanLeg(), from:'山屋', to:'登山口', minutes:80, restMinutes:0, distanceKm:3}];
  return {title:'測試行程', routeName:'測試往返', day, dayIndex:1, generatedAt:'2026-10-25T05:00:00Z'};
}
describe('計畫路點示意圖', () => {
  it('keeps each return visit and uses the existing cross-midnight timing', () => {
    const input = fixture(), segments = planDiagramSegments(input);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({depart:'23:30', arrive:'次日 01:00', gapBefore:false});
    expect(segments[1]).toMatchObject({depart:'次日 01:10', arrive:'次日 02:30', to:'登山口', gapBefore:false});
    expect(segments[0].id).not.toBe(segments[1].id);
  });
  it('preserves unknowns and explicitly disconnects unmatched or blank endpoints', () => {
    const input = fixture(); input.day.legs[0].minutes = null; input.day.legs[1].from = '不同登山口';
    const segments = planDiagramSegments(input);
    expect(segments[0]).toMatchObject({minutes:'未知', arrive:'未知'});
    expect(segments[1]).toMatchObject({depart:'未知', arrive:'未知', gapBefore:true});
    const svg = createPlanDiagramSvg(input);
    expect(svg).toContain('路點未銜接'); expect(svg).not.toContain('stroke-dasharray');
    input.day.legs[1].from = ''; expect(planDiagramSegments(input)[1].gapBefore).toBe(true);
  });
  it('escapes markup and produces self-contained white and transparent versions with provenance', () => {
    const input = fixture(); input.title = '<script>alert("x")</script>'; input.day.legs[0].from = '<img onerror="x"> & 名稱';
    const white = createPlanDiagramSvg(input), transparent = createPlanDiagramSvg(input, {transparent:true});
    expect(XMLValidator.validate(white)).toBe(true); expect(XMLValidator.validate(transparent)).toBe(true);
    expect(white).not.toContain('<script>'); expect(white).not.toContain('<img'); expect(white).toContain('&lt;script&gt;');
    expect(white).toContain('路點示意・非地理軌跡'); expect(white).toContain('2026-10-25T05:00:00Z');
    expect(white).toContain('https://example.test/record?a=1&amp;b=2'); expect(white).toContain('第 2 天');
    expect(white).toContain('fill="#fffefb"/>'); expect(transparent).not.toContain('<rect width="960"');
    expect(white).not.toContain('<image'); expect(white).not.toContain('foreignObject');
  });
  it('supports an empty day and deterministic output without exposing unrelated personal fields', () => {
    const input = fixture(); input.day.legs = []; input.day.notes = '私人電話 0912345678'; input.day.water.note = '另一私人電話 0923456789';
    expect(createPlanDiagramSvg(input)).toContain('尚未加入路段');
    expect(createPlanDiagramSvg(input)).toEqual(createPlanDiagramSvg(input));
    expect(createPlanDiagramSvg(input)).not.toMatch(/0912345678|0923456789/);
    expect(planDiagramSize(input).height).toBeGreaterThan(400);
  });
  it('marks shortened display labels and retains full text in accessible metadata', () => {
    const input = fixture(), name = '一二三四五六七八九十'.repeat(10);
    input.title = name; input.day.legs[0].from = name;
    const svg = createPlanDiagramSvg(input);
    expect(svg).toContain('…'); expect(svg).toContain(`<title>${name} → 山屋</title>`);
    expect(svg).toContain(`&quot;from&quot;:&quot;${name}&quot;`);
  });
});
