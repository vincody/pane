import type {SshConnection} from '../../../../shared/contracts.ts';
import {validateSshConnection} from '../../../../shared/ssh-connection.ts';
export interface SavedTerminal {sessionId:string;projectId:string;launch:string;name:string;ssh?:SshConnection}
export function readTerminalJournal():SavedTerminal[]{
 try{const value=JSON.parse(sessionStorage.getItem('ai-web.open-terminals')||'[]');if(!Array.isArray(value))return [];return value.slice(0,64).flatMap(item=>{try{
  if(!item||typeof item.sessionId!=='string'||typeof item.projectId!=='string'||typeof item.name!=='string'||!['shell','codex','claude','ssh'].includes(item.launch))return [];
  return [{sessionId:item.sessionId,projectId:item.projectId,launch:item.launch,name:item.name,...(item.ssh?{ssh:validateSshConnection(item.ssh)}:{})}];
 }catch{return [];}});}catch{return [];}
}
export function saveTerminalJournal(value:SavedTerminal[]){try{sessionStorage.setItem('ai-web.open-terminals',JSON.stringify(value));}catch{}}
