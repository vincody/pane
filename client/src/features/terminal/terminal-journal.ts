import type {SshConnection} from '../../../../shared/contracts.ts';
import {validateSshConnection} from '../../../../shared/ssh-connection.ts';
export interface SavedTerminal {sessionId:string;projectId:string;launch:string;name:string;ssh?:SshConnection;ended?:boolean}
export function readTerminalJournal():SavedTerminal[]{
 try{const desktop=window.paneDesktop;const stored=JSON.parse((desktop?localStorage:sessionStorage).getItem('ai-web.open-terminals')||'[]');const value=Array.isArray(stored)?stored:stored.terminals;if(!Array.isArray(value))return [];const ended=Boolean(desktop&&stored.backendId!==desktop.backendId);return value.slice(0,64).flatMap(item=>{try{
  if(!item||typeof item.sessionId!=='string'||typeof item.projectId!=='string'||typeof item.name!=='string'||!['shell','codex','claude','ssh'].includes(item.launch))return [];
  return [{sessionId:item.sessionId,projectId:item.projectId,launch:item.launch,name:item.name,...(ended||item.ended?{ended:true}:{}),...(item.ssh?{ssh:validateSshConnection(item.ssh)}:{})}];
 }catch{return [];}});}catch{return [];}
}
export function saveTerminalJournal(value:SavedTerminal[]):boolean{try{const desktop=window.paneDesktop;(desktop?localStorage:sessionStorage).setItem('ai-web.open-terminals',JSON.stringify(desktop?{backendId:desktop.backendId,terminals:value}:value));return true;}catch{return false;}}
