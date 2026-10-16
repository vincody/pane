import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec = promisify(execFile);

export interface ProcessRow {ProcessId:number|string;ParentProcessId:number|string;Name?:string;CommandLine?:string;CreationDate?:string;WorkingSetSize?:number|string;KernelModeTime?:number|string;UserModeTime?:number|string}
export function agentInProcessTree(rows:ProcessRow[], rootPid:number) {
  const descendants = new Set([Number(rootPid)]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) if (descendants.has(Number(row.ParentProcessId)) && !descendants.has(Number(row.ProcessId))) { descendants.add(Number(row.ProcessId)); changed = true; }
  }
  for (const row of [...rows].reverse()) {
    if (!descendants.has(Number(row.ProcessId)) || Number(row.ProcessId) === Number(rootPid)) continue;
    const name = String(row.Name || '').toLowerCase();
    const command = String(row.CommandLine || '').toLowerCase().replaceAll('\\', '/');
    for (const agent of ['codex', 'claude', 'opencode', 'gemini'] as const) {
      const packages = {codex:'@openai/codex/',claude:'@anthropic-ai/claude-code/',opencode:'opencode-ai/',gemini:'@google/gemini-cli/'};
      if (name === `${agent}.exe` || name === agent || /^(node|bun)(\.exe)?$/.test(name) && (command.includes(packages[agent]) || new RegExp(`/${agent}(?:/|\\.)`).test(command))) return agent;
    }
  }
  return null;
}

let processSnapshot:{at:number;rows:ProcessRow[]}|undefined;
let processRead:Promise<ProcessRow[]>|undefined;
export function readProcesses():Promise<ProcessRow[]> {
  if(processSnapshot&&Date.now()-processSnapshot.at<1500)return Promise.resolve(processSnapshot.rows);
  return processRead||=(collectProcesses().then(rows=>{processSnapshot={at:Date.now(),rows};return rows;}).finally(()=>{processRead=undefined;}));
}
export function parsePsRows(stdout:string):ProcessRow[] {
  return stdout.split(/\r?\n/).flatMap(line => { const m=line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\w+\s+\w+\s+\d+\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(\S+)\s+(.*)$/); return m ? [{ProcessId:Number(m[1]),ParentProcessId:Number(m[2]),WorkingSetSize:Number(m[3])*1024,Name:m[5].split('/').at(-1),CommandLine:m[6],CreationDate:m[4]}] : []; });
}
async function collectProcesses():Promise<ProcessRow[]> {
  if (process.platform === 'win32') {
    const {stdout} = await exec('powershell.exe', ['-NoLogo', '-NoProfile', '-Command', 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine,WorkingSetSize,KernelModeTime,UserModeTime,@{Name="CreationDate";Expression={$_.CreationDate.ToUniversalTime().ToString("o")}} | ConvertTo-Json -Compress'], {windowsHide:true, maxBuffer:8*1024*1024, timeout:5000});
    const rows = JSON.parse(stdout || '[]');
    return Array.isArray(rows) ? rows : [rows];
  }
  const {stdout} = await exec('ps', ['-eo', 'pid=,ppid=,rss=,lstart=,comm=,args='], {env:{...process.env,LC_ALL:'C'},maxBuffer:8*1024*1024, timeout:5000});
  return parsePsRows(stdout);
}
