import fs from 'node:fs/promises';
import path from 'node:path';
import type {ChatPermissionMode} from '../../../../shared/contracts.ts';

/** What a conversation was last set to. Kept on the server by session id so any window reopening it (a reload, History) gets the same model, effort and permission mode. */
export interface ChatPrefs {model?:string;effort?:string;ultracode?:boolean;permissionMode?:ChatPermissionMode}
const EFFORTS=['low','medium','high','xhigh','max'],MODES=['auto','default','acceptEdits','plan','bypassPermissions'],MAX_ENTRIES=500;

function clean(value:unknown):ChatPrefs{
 const data=(value&&typeof value==='object'?value:{}) as Record<string,unknown>,out:ChatPrefs={};
 if(typeof data.model==='string'&&data.model&&data.model.length<120)out.model=data.model;
 if(typeof data.effort==='string'&&EFFORTS.includes(data.effort))out.effort=data.effort;
 if(typeof data.ultracode==='boolean')out.ultracode=data.ultracode;
 if(typeof data.permissionMode==='string'&&MODES.includes(data.permissionMode))out.permissionMode=data.permissionMode as ChatPermissionMode;
 return out;
}

export async function createChatPrefs(stateDir:string){
 const file=path.join(stateDir,'chat-prefs.json');
 let entries=new Map<string,ChatPrefs>();
 try{const raw=JSON.parse(await fs.readFile(file,'utf8')) as Record<string,unknown>;entries=new Map(Object.entries(raw).map(([id,value])=>[id,clean(value)]));}catch{/* First run, or an unreadable file: start empty. */}
 let writing:Promise<void>=Promise.resolve();
 const save=()=>{
  // Newest entries win once the file grows past its cap.
  while(entries.size>MAX_ENTRIES){const oldest=entries.keys().next().value as string;entries.delete(oldest);}
  const body=JSON.stringify(Object.fromEntries(entries));
  writing=writing.then(()=>fs.writeFile(file,body,'utf8')).catch(()=>{});
 };
 return {
  get:(id:string):ChatPrefs=>({...(entries.get(id)||{})}),
  set(id:string,patch:ChatPrefs){const next={...(entries.get(id)||{}),...clean(patch)};entries.delete(id);entries.set(id,next);save();},
  flush:()=>writing,
 };
}
export type ChatPrefsStore=Awaited<ReturnType<typeof createChatPrefs>>;
