import type {Workspace} from '../shared/contracts.ts';
export interface TerminalNaming {customName?:boolean;name:string;agent?:string|null;launch?:string;state:string;shell:string;cliTitle?:string}
export function terminalName(session:TerminalNaming) {
  if (session.customName) return session.name;
  const provider=session.agent || (session.launch!=='shell' && session.state!=='closed' ? session.launch : null);
  if (provider && session.cliTitle) return session.cliTitle;
  return provider ? provider.charAt(0).toUpperCase()+provider.slice(1) : session.shell==='Shell'?'Terminal':session.shell;
}
export function threadTitle(title:string, project:Pick<Workspace,'name'|'root'>) {
  const name=title.trim().replace(/\s*\|\s*[^|]*$/, '').trim();
  const folder=project.root?.replace(/[\\/]+$/,'').split(/[\\/]/).at(-1);
  if(!name || /^[A-Za-z]:[\\/]/.test(name) || /^(?:powershell|pwsh|cmd)(?:\.exe)?(?:\s|$)/i.test(name) || [project.name,folder,project.root].some(value=>value && value.toLowerCase()===name.toLowerCase()))return '';
  return name;
}
