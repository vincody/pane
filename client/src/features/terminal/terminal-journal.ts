import type {SshConnection} from '../../../../shared/contracts.ts';
import {validateSshConnection} from '../../../../shared/ssh-connection.ts';
export interface SavedConversation {agent:'codex'|'claude';id:string;cwd:string}
export interface SavedTerminal {sessionId:string;projectId:string;launch:string;name:string;ssh?:SshConnection;ended?:boolean;openedAt?:number;conversation?:SavedConversation}
export function readTerminalJournal():SavedTerminal[]{
 try{const desktop=window.paneDesktop;const stored=JSON.parse((desktop?localStorage:sessionStorage).getItem('ai-web.open-terminals')||'[]');const value=Array.isArray(stored)?stored:stored.terminals;if(!Array.isArray(value))return [];const ended=Boolean(desktop&&stored.backendId!==desktop.backendId);return value.slice(0,64).flatMap(item=>{try{
  if(!item||typeof item.sessionId!=='string'||typeof item.projectId!=='string'||typeof item.name!=='string'||!['shell','codex','claude','ssh'].includes(item.launch))return [];
  return [{sessionId:item.sessionId,projectId:item.projectId,launch:item.launch,name:item.name,...(ended||item.ended?{ended:true}:{}),...(Number.isFinite(item.openedAt)?{openedAt:item.openedAt}:{}),...readConversation(item.conversation),...(item.ssh?{ssh:validateSshConnection(item.ssh)}:{})}];
 }catch{return [];}});}catch{return [];}
}
export function saveTerminalJournal(value:SavedTerminal[]):boolean{try{const desktop=window.paneDesktop;(desktop?localStorage:sessionStorage).setItem('ai-web.open-terminals',JSON.stringify(desktop?{backendId:desktop.backendId,terminals:value}:value));return true;}catch{return false;}}
function readConversation(value:unknown):{conversation?:SavedConversation}{
 const item=value as Partial<SavedConversation>|null;
 return item&&(item.agent==='codex'||item.agent==='claude')&&typeof item.id==='string'&&typeof item.cwd==='string'&&item.id.length<=128&&item.cwd.length<=4096?{conversation:{agent:item.agent,id:item.id,cwd:item.cwd}}:{};
}
