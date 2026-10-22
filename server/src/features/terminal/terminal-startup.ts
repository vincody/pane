import type {StartupLaunch} from '../../../../shared/contracts.ts';

const AGENTS=['claude','codex','agy'];
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const MAX_CWD=2048;

// Only a fixed agent name, a UUID and a directory are accepted; the command itself is built here, never taken from the client.
export function parseStartupLaunch(value:unknown):StartupLaunch|null{
 if(!value||typeof value!=='object')return null;
 const {agent,resume}=value as Record<string,unknown>;
 if(typeof agent!=='string'||!AGENTS.includes(agent))return null;
 if(resume===undefined)return {agent:agent as StartupLaunch['agent']};
 if(!resume||typeof resume!=='object')return null;
 const {id,cwd}=resume as Record<string,unknown>;
 if(typeof id!=='string'||!UUID.test(id)||typeof cwd!=='string'||!cwd||cwd.length>MAX_CWD||/[\r\n\0]/.test(cwd))return null;
 return {agent:agent as StartupLaunch['agent'],resume:{id,cwd}};
}

const quote=(text:string)=>`'${text.replaceAll("'","''")}'`;
export function powerShellStartupScript(launch:StartupLaunch){
 if(!launch.resume)return launch.agent;
 return `try { Set-Location -LiteralPath ${quote(launch.resume.cwd)} -ErrorAction Stop; ${launch.agent} ${launch.agent==='codex'?'resume':'--resume'} ${launch.resume.id} } catch { Write-Error $_ }`;
}

// A command passed this way is not echoed into the terminal, and -NoExit keeps the shell after the agent exits.
export function powerShellStartupArgs(launch:StartupLaunch){
 return ['-NoLogo','-NoExit','-EncodedCommand',Buffer.from(powerShellStartupScript(launch),'utf16le').toString('base64')];
}
