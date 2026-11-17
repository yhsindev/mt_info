import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PlanCatalog from '../src/components/PlanCatalog';

const catalog = renderToStaticMarkup(<PlanCatalog onUseTemplate={() => undefined}/>);

function templateCard(id: string): string {
  const marker = `data-template-id="${id}"`;
  const start = catalog.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = catalog.indexOf('data-template-id="', start + marker.length);
  return catalog.slice(start, end < 0 ? undefined : end);
}

describe('plan catalog source presentation', () => {
  it('labels Shanghe sheets as unverified coverage rather than a complete route timetable', () => {
    for (const id of ['xueshan-west-ridge', 'badaxiu-four-days']) {
      const card = templateCard(id);
      expect(card).toContain('上河圖幅對照');
      expect(card).toContain('涵蓋範圍尚未核對');
      expect(card).toContain('不可視為本路線全段步程');
    }
  });

  it('keeps GPX candidates as linked comparisons with a shared usage note', () => {
    const snow = templateCard('xueshan-west-ridge');
    expect(snow).toContain('GPX 僅供私下比對地理路徑，不是推薦行程或上河步程時間；下載請至原站。');
    expect(snow).toContain('資料適用範圍：');
    expect(snow).toContain('GPX 路點標記 0 個，範本路點仍待人工核對。');
    expect(snow).toContain('至原站查看／下載');
    expect(snow).toContain('gpx_detail&amp;id=6114289');
    expect(snow).not.toContain('.gpx"');
    expect(templateCard('yushan')).toContain('前峰與北峰支線排除');
    expect(templateCard('wuling-four')).not.toContain('pc-community-track');
  });
});
