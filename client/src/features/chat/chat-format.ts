/** One short line that says what a tool call is doing, shown beside the tool name. */
export function toolSummary(name:string,input:unknown):string{
 if(!input||typeof input!=='object')return '';
 const data=input as Record<string,unknown>,text=(value:unknown)=>typeof value==='string'?value:'';
 const pick=text(data.command)||text(data.file_path)||text(data.path)||text(data.pattern)||text(data.url)||text(data.query)||text(data.description)||text(data.prompt)||text(data.notebook_path);
 const first=pick||Object.values(data).find((value):value is string=>typeof value==='string')||'';
 const lines=first.split(/\r?\n/).map(part=>part.trim()).filter(Boolean),line=(lines[0]||'')+(lines.length>1?' …':'');
 return line.length>120?`${line.slice(0,117)}…`:line;
}
import {deriveTabTitle} from '../../../../shared/tab-title.ts';
/** A short, stable tab name from the first prompt (shared with History so both show the same name). */
export const chatTitle=(text:string)=>deriveTabTitle(text)||'Claude';
export const MODE_LABELS={auto:'Auto',default:'Ask before edits',acceptEdits:'Accept edits',plan:'Plan mode',bypassPermissions:'Bypass permissions'} as const;
export const MODE_HINTS={auto:'Claude handles permission decisions',default:'Always ask before making changes',acceptEdits:'Automatically accept file edits',plan:'Create a plan before making changes',bypassPermissions:'Skip every permission prompt'} as const;
export interface DiffLine {kind:'add'|'del'|'note';text:string}
const MAX_DIFF_LINES=160;
const split=(text:string)=>text===''?[]:text.replace(/\r?\n$/,'').split(/\r?\n/);
/** The lines an edit or write removes and adds, so the chat can show the change itself and not only a path. */
export function toolDiff(name:string,input:unknown):DiffLine[]|null{
 if(!input||typeof input!=='object')return null;
 const data=input as Record<string,unknown>,text=(value:unknown)=>typeof value==='string'?value:'';
 const pairs:[string,string][]=name==='Edit'&&typeof data.old_string==='string'?[[text(data.old_string),text(data.new_string)]]
  :name==='MultiEdit'&&Array.isArray(data.edits)?data.edits.flatMap(edit=>edit&&typeof edit==='object'?[[text((edit as Record<string,unknown>).old_string),text((edit as Record<string,unknown>).new_string)] as [string,string]]:[])
  :name==='Write'&&typeof data.content==='string'?[['',data.content]]:[];
 if(!pairs.length)return null;
 const lines:DiffLine[]=pairs.flatMap(([before,after])=>[...split(before).map(line=>({kind:'del' as const,text:line})),...split(after).map(line=>({kind:'add' as const,text:line}))]);
 return lines.length>MAX_DIFF_LINES?[...lines.slice(0,MAX_DIFF_LINES),{kind:'note',text:`… ${lines.length-MAX_DIFF_LINES} more lines`}]:lines;
}
