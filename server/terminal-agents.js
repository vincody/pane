import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec = promisify(execFile);

export function agentInProcessTree(rows, rootPid) {
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
    for (const agent of ['codex', 'claude', 'opencode', 'gemini']) {
      const packages = {codex:'@openai/codex/',claude:'@anthropic-ai/claude-code/',opencode:'opencode-ai/',gemini:'@google/gemini-cli/'};
      if (name === `${agent}.exe` || name === agent || /^(node|bun)(\.exe)?$/.test(name) && (command.includes(packages[agent]) || new RegExp(`/${agent}(?:/|\\.)`).test(command))) return agent;
    }
  }
  return null;
}

export async function readProcesses() {
  if (process.platform === 'win32') {
    const {stdout} = await exec('powershell.exe', ['-NoLogo', '-NoProfile', '-Command', 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress'], {windowsHide:true, maxBuffer:8*1024*1024, timeout:5000});
    const rows = JSON.parse(stdout || '[]');
    return Array.isArray(rows) ? rows : [rows];
  }
  const {stdout} = await exec('ps', ['-eo', 'pid=,ppid=,comm=,args='], {maxBuffer:8*1024*1024, timeout:5000});
  return stdout.split('\n').flatMap(line => { const m=line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/); return m ? [{ProcessId:Number(m[1]),ParentProcessId:Number(m[2]),Name:m[3].split('/').at(-1),CommandLine:m[4]}] : []; });
}
