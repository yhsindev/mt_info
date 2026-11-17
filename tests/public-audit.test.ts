import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { auditPublicFiles, inspectPublicText } from '../scripts/audit-public-files';

describe('public-source privacy checks',() => {
  it('detects credential and private-home patterns without returning their values',() => {
    const home = ['', 'Users', 'example-person', 'project'].join('/');
    const token = 'ghp_' + 'a'.repeat(40);
    const findings = inspectPublicText(`const folder = '${home}/';\nconst credential = '${token}';`);
    expect(findings.map(row => row.kind)).toEqual(['private-home-path','secret-token']);
    expect(JSON.stringify(findings)).not.toContain(token); expect(JSON.stringify(findings)).not.toContain(home);
  });
  it('retains official /home URLs, author attribution and defensive XML fixtures',() => {
    expect(inspectPublicText('https://www.taiwan.nps.gov.tw/home/zh-tw/topic/18664.html\n來源作者：山友甲\nfile:///etc/passwd')).toEqual([]);
  });
  it('rejects forced secret files and exported team plans while allowing public source JSON',() => {
    const root=mkdtempSync(join(tmpdir(),'mt-public-audit-'));
    try {
      writeFileSync(join(root,'plan.json'),JSON.stringify({schemaVersion:1,days:[],leaderPhone:'',keeperPhone:''}));
      writeFileSync(join(root,'source.json'),JSON.stringify({source:'官方來源',phone:'公開場所聯絡欄'}));
      const report=auditPublicFiles(root,['.env','plan.json','source.json']);
      expect(report.findings).toEqual([{file:'.env',kind:'private-or-generated-file'},{file:'plan.json',kind:'exported-plan-draft'}]);
    } finally { rmSync(root,{recursive:true,force:true}); }
  });
});
