import shangheIndex from '../../data/route-library/shanghe-source-index.json';

const sheetIdsByTemplate: Record<string, readonly string[]> = {
  yushan: ['G02'],
  'yushan-main-west': ['G02'],
  daba: ['G04'],
  xueshan: ['G04'],
  'xueshan-cuichi': ['G04'],
  'wuling-four': ['G04'],
  'xueshan-west-ridge': ['G05'],
  daxiaojian: ['G05'],
  'zhijiayang-xueshan': ['G05'],
  baigu: ['G06'],
  nanhu: ['G07'],
  'shuanling-three-days': ['G08'],
  'biyang-traverse': ['G08'],
  'pingfeng-two-days': ['G09'],
  'qilai-main-north': ['G09'],
  'qilai-nanhua': ['G11'],
  'jiaming-lake': ['G17'],
  'badaxiu-four-days': ['G17'],
  'kuhanoxin-guanshan': ['G19'],
  beidawu: ['G20'],
};

const sheetsById = new Map(shangheIndex.sheets.map(sheet => [sheet.id, sheet]));

export interface ShangheSheetReference { id: string; title: string; sourceUrl: string }

export function shangheSheetsForTemplate(templateId: string): ShangheSheetReference[] {
  return (sheetIdsByTemplate[templateId] ?? []).flatMap(id => {
    const sheet = sheetsById.get(id);
    if (!sheet) return [];
    // G07 and G09 include an additional link labelled 更新 in the publisher's index.
    const sourceUrl = sheet.stepDiagramLinks.at(-1)?.url ?? shangheIndex.indexUrl;
    return [{ id: sheet.id, title: sheet.title, sourceUrl }];
  });
}
