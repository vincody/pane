import {agentLabel} from '../../../../shared/agent-label.ts';
import type {Workspace} from '../../../../shared/contracts.ts';
export interface TerminalNaming {customName?:boolean;name:string;agent?:string|null;launch?:string;state:string;shell:string;cliTitle?:string;agentEnded?:boolean;number?:number}
// A session opened as an agent is a plain shell again once that agent has exited.
export function terminalProvider(session:Pick<TerminalNaming,'agent'|'launch'|'state'|'agentEnded'>) {
  return session.agent || (session.launch!=='shell' && session.state!=='closed' && !session.agentEnded ? session.launch : null);
}
export function terminalName(session:TerminalNaming) {
  if (session.customName) return session.name;
  // SSH tabs keep the saved connection name; the remote shell title is usually just user@host.
  if (session.launch==='ssh')return session.name;
  const provider=terminalProvider(session);
  if (provider && session.cliTitle) return session.cliTitle;
  return provider ? agentLabel(provider) : session.number?String(session.number):session.shell==='Shell'?'Terminal':session.shell;
}
const MAX_TITLE=60;
function clean(value:string){
  const text=value.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060\ufeff]/g,' ').replace(/\s+/g,' ').trim();
  return text.length>MAX_TITLE?text.slice(0,MAX_TITLE-1).trimEnd()+'\u2026':text;
}
export function threadTitle(title:string, project:Pick<Workspace,'name'|'root'>) {
  // Control and zero-width characters can't be shown in a tab; long titles are cut so one agent can't take over the tab strip.
  const name=clean(title.replace(/\s*\|\s*[^|]*$/, ''));
  const folder=project.root?.replace(/[\\/]+$/,'').split(/[\\/]/).at(-1);
  if(!name || /^[A-Za-z]:[\\/]/.test(name) || /^(?:powershell|pwsh|cmd)(?:\.exe)?(?:\s|$)/i.test(name) || [project.name,folder,project.root].some(value=>value && value.toLowerCase()===name.toLowerCase()))return '';
  return name;
}
