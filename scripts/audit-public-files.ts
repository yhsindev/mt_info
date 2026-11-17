import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, lstatSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface PublicFinding { file: string; line?: number; kind: string }
const generated = new Set(['.git','node_modules','dist','.cache','artifacts','.taste-skill','.agents','.codex','.aws','private','local']);
const workbooks = new Set([
  'outputs/route-library-2026-10-25/mt_info_路線資訊庫範本.xlsx',
  'outputs/alpine-library-2026-10-25/mt_info_百岳路線資訊庫.xlsx',
]);
const binary = /\.(?:xlsx|png|jpe?g|webp|gif|pdf|woff2?|ttf|otf|ico)$/i;
export function publicCandidates(root = process.cwd()): string[] {
  try {
    const top = execFileSync('git',['-C',root,'rev-parse','--show-toplevel'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
    if (resolve(top) === resolve(root)) return [...new Set(execFileSync('git',['-C',root,'ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean))].sort();
  } catch { /* A prepared source tree can be checked before it gets its own Git history. */ }
  const files:string[] = [];
  function visit(directory:string) {
    for (const item of readdirSync(directory,{withFileTypes:true})) {
      const file = resolve(directory,item.name), name = relative(root,file).split(sep).join('/');
      if (item.isDirectory()) { if (!generated.has(item.name)) visit(file); }
      else if (item.isFile() && (!name.startsWith('outputs/') || workbooks.has(name))) files.push(name);
    }
  }
  visit(root); return files.sort();
}
export function inspectPublicText(text:string): { line:number; kind:string }[] {
  const findings:{line:number;kind:string}[] = [];
  const patterns = [
    {kind:'secret-token',pattern:/\b(?:ghp_|github_pat_|sk-proj-|sk-live-)[A-Za-z0-9_-]{20,}|\bAKIA[A-Z0-9]{16}\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/},
    // A URL such as https://example.org/home/... is not a local home directory.
    {kind:'private-home-path',pattern:/(?:^|[\s"'`=(])\/(?:Users|home)\/[^\s/"'`<>]+\/|[A-Za-z]:\\Users\\[^\\\s]+\\/},
    {kind:'personal-email',pattern:/\b[A-Za-z0-9._%+-]+@(?:gmail|icloud|outlook|hotmail|yahoo)\.com\b/i},
  ];
  for (const [index,line] of text.split('\n').entries()) for (const {kind,pattern} of patterns) if (pattern.test(line)) findings.push({line:index+1,kind});
  return findings;
}
export function auditPublicFiles(root:string, files:string[]) {
  const findings:PublicFinding[] = [], binaries:string[] = [];
  for (const name of files) {
    const file = resolve(root,name), normal = name.split(sep).join('/');
    if (relative(root,file).startsWith('..') || normal.split('/').some(part => generated.has(part)) || /(?:^|\/)\.env(?:\..+)?$/.test(normal) && normal !== '.env.example' || /\.(?:gpx|fit|docx|pem|key)$/i.test(normal) || normal.startsWith('outputs/') && !workbooks.has(normal)) {
      findings.push({file:normal,kind:'private-or-generated-file'}); continue;
    }
    if (!lstatSync(file).isFile()) { findings.push({file:normal,kind:'non-regular-file'}); continue; }
    if (binary.test(normal)) { binaries.push(normal); continue; }
    const text = readFileSync(file,'utf8');
    findings.push(...inspectPublicText(text).map(finding => ({file:normal,...finding})));
    if (normal.endsWith('.json')) try {
      const value = JSON.parse(text);
      if (value && typeof value === 'object' && value.schemaVersion === 1 && Array.isArray(value.days) && 'leaderPhone' in value && 'keeperPhone' in value) findings.push({file:normal,kind:'exported-plan-draft'});
    } catch { /* Syntax validation belongs to build/tests; no data is printed here. */ }
  }
  return {status:findings.length ? 'FAIL' : 'PASS',candidateFiles:files.length,findings,binaryFilesNotTextScanned:binaries};
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const report = auditPublicFiles(process.cwd(),publicCandidates());
    console.log(JSON.stringify(report,null,2));
    if (report.findings.length) process.exitCode = 1;
  } catch { console.error('Public file audit could not complete; no file contents were printed.'); process.exitCode = 1; }
}
