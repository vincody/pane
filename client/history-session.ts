import type {SessionRecord,Workspace} from '../shared/contracts.ts';
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export function validateResume(record:SessionRecord){
 if(!['codex','claude'].includes(record?.agent)||!uuid.test(record.agent_session?.value||'')||typeof record.cwd!=='string'||!record.cwd||/[\r\n\0]/.test(record.cwd))throw new Error('This session cannot be resumed.');
 return record;
}
export function resumeCommand(record:SessionRecord,shell:string){
 validateResume(record);
 const command=record.agent==='codex'?`codex resume ${record.agent_session.value}`:`claude --resume ${record.agent_session.value}`;
 if(/powershell|pwsh/i.test(shell))return `try { Set-Location -LiteralPath '${record.cwd.replaceAll("'","''")}' -ErrorAction Stop; ${command} } catch { Write-Error $_ }\r`;
 return `cd -- '${record.cwd.replaceAll("'","'\\''")}' && ${command}\r`;
}
export function workspaceForSession<T extends Pick<Workspace,'root'>>(record:{cwd?:string},projects:T[]):T|undefined{
 const windows=/^[a-z]:[\\/]/i.test(record.cwd||'')||record.cwd?.startsWith('\\\\');
 const normalize=(value:unknown)=>{const text=String(value||'').replaceAll('\\','/').replace(/\/+$/,'');return windows?text.toLowerCase():text;};
 const cwd=normalize(record.cwd);
 return [...projects].filter(project=>{const root=normalize(project.root);return root&&(cwd===root||cwd.startsWith(root+'/'));}).sort((a,b)=>b.root.length-a.root.length)[0];
}
