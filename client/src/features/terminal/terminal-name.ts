import {agentLabel} from '../../../../shared/agent-label.ts';
import type {Workspace} from '../../../../shared/contracts.ts';
export interface TerminalNaming {customName?:boolean;name:string;agent?:string|null;launch?:string;state:string;shell:string;cliTitle?:string;agentEnded?:boolean}
// A session opened as an agent is a plain shell again once that agent has exited.
export function terminalProvider(session:Pick<TerminalNaming,'agent'|'launch'|'state'|'agentEnded'>) {
  return session.agent || (session.launch!=='shell' && session.state!=='closed' && !session.agentEnded ? session.launch : null);
}
export function terminalName(session:TerminalNaming) {
  if (session.customName) return session.name;
  if (session.launch==='ssh'&&session.cliTitle)return session.cliTitle;
  const provider=terminalProvider(session);
  if (provider && session.cliTitle) return session.cliTitle;
  return provider ? agentLabel(provider) : session.shell==='Shell'?'Terminal':session.shell;
}
export function threadTitle(title:string, project:Pick<Workspace,'name'|'root'>) {
  const name=title.trim().replace(/\s*\|\s*[^|]*$/, '').trim();
  const folder=project.root?.replace(/[\\/]+$/,'').split(/[\\/]/).at(-1);
  if(!name || /^[A-Za-z]:[\\/]/.test(name) || /^(?:powershell|pwsh|cmd)(?:\.exe)?(?:\s|$)/i.test(name) || [project.name,folder,project.root].some(value=>value && value.toLowerCase()===name.toLowerCase()))return '';
  return name;
}
