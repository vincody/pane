import {applyLifecycle,emptyActivity} from './session-lifecycle.ts';
import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {parseSession} from './session-parser.ts';
import {sessionId} from './session-id.ts';
import {FileError,isWithin} from '../files/files.ts';
import type { Provider, SessionRecord } from '../../../../shared/contracts.ts';
import type { TranscriptMessage } from './session-parser.ts';
export interface LocalSessionOptions { home?: string; stateDir: string; codexHome?: string; claudeHome?: string }
export type LocalSessions = Awaited<ReturnType<typeof createLocalSessions>>;
export interface SessionActivity { known: boolean; status: 'idle'|'working'|'done'; turnId: string | null; startedAt: string | null }
interface Preference { name?: string; hidden?: boolean; created?: SessionRecord }
interface SessionCache { stamp: string; record: SessionRecord; size: number }
interface ActivityCache { stamp: string | null; size: number; cursor: number; state: SessionActivity; pending?: Promise<SessionActivity> | null }
interface LogRow { [key: string]: unknown; type?: string; id?: string; session_id?: string; sessionId?: string; thread_name?: string; customTitle?: string; cwd?: string; timestamp?: string; payload?: LogRow; source?: Record<string, unknown>; isSidechain?: unknown }
const object=(value: unknown): Record<string, unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string, unknown>:{};
function logRow(value: unknown): LogRow { const data=object(value); const result: LogRow={...data};for(const key of ['type','id','session_id','sessionId','thread_name','customTitle','cwd','timestamp'] as const){const field=data[key];if(typeof field==='string')result[key]=field;else delete result[key];}if(data.payload)result.payload=logRow(data.payload);if(data.source)result.source=object(data.source);return result; }
function restoredSession(value: unknown): SessionRecord | undefined {const data=object(value),native=object(data.agent_session);if(typeof data.id!=='string'||(data.agent!=='codex'&&data.agent!=='claude')||typeof native.value!=='string'||typeof data.cwd!=='string'||typeof data.name!=='string'||typeof data.updatedAt!=='string')return;return {...data,id:data.id,agent:data.agent,agent_session:{value:native.value},cwd:data.cwd,name:data.name,updatedAt:data.updatedAt};}
function readPreferences(value: unknown): Record<string,Preference> {const result: Record<string,Preference>={};for(const [id,raw] of Object.entries(object(value))){const entry=object(raw);result[id]={...(typeof entry.name==='string'?{name:entry.name}:{}),...(typeof entry.hidden==='boolean'?{hidden:entry.hidden}:{}),...(entry.created?{created:restoredSession(entry.created)}:{})};}return result;}
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
async function chunk(file: string,limit: number,tail=false){const handle=await fs.open(file,'r');try{const {size}=await handle.stat();const offset=tail?Math.max(0,size-limit):0,buffer=Buffer.alloc(Math.min(limit,size));const {bytesRead}=await handle.read(buffer,0,buffer.length,offset);let text=buffer.subarray(0,bytesRead).toString('utf8');if(offset)text=text.slice(text.indexOf('\n')+1);return text;}finally{await handle.close();}}
const rows=(text: string): LogRow[]=>text.split('\n').flatMap(line=>{try{return [logRow(JSON.parse(line))];}catch{return [];}});
async function contextSince(file: string,start=0){
 const stream=createReadStream(file,{start:Math.max(0,start-1024),encoding:'utf8'}),lines=createInterface({input:stream,crlfDelay:Infinity});let cwd: string | undefined;
 try{for await(const line of lines){if(!/"type"\s*:\s*"turn_context"/.test(line))continue;try{const row=logRow(JSON.parse(line));if(row.type==='turn_context'&&typeof row.payload?.cwd==='string'&&path.isAbsolute(row.payload.cwd))cwd=row.payload.cwd;}catch{}}return cwd;}finally{lines.close();stream.destroy();}
}
export async function createLocalSessions({home=os.homedir(),stateDir,codexHome=process.env.CODEX_HOME || path.join(home,'.codex'),claudeHome=process.env.CLAUDE_CONFIG_DIR || path.join(home,'.claude')}: LocalSessionOptions){
 const preferencesFile=path.join(stateDir,'local-session-preferences.json');let preferences: Record<string,Preference>={};try{preferences=readPreferences(JSON.parse(await fs.readFile(preferencesFile,'utf8')));}catch{}
 let records=new Map<string,SessionRecord>(),cache=new Map<string,SessionCache>(),activityCache=new Map<string,ActivityCache>(),expires=0,pending: Promise<void> | null = null,queue=Promise.resolve();
 const cacheFile=path.join(stateDir,'local-session-cache.json');let persisting=Promise.resolve();
 // Unchanged logs (same size and mtime) keep their parsed record across restarts, so launching Pane no longer re-reads every session log.
 try{const saved=object(JSON.parse(await fs.readFile(cacheFile,'utf8')));if(saved.version===1&&Array.isArray(saved.entries))for(const entry of saved.entries){const [file,raw]=Array.isArray(entry)?entry:[],data=object(raw),record=restoredSession(data.record);if(typeof file==='string'&&record&&typeof data.stamp==='string'&&typeof data.size==='number')cache.set(file,{stamp:data.stamp,record,size:data.size});}}catch{}
 const persist=(entries: Map<string,SessionCache>)=>(persisting=persisting.then(async()=>{try{await fs.mkdir(stateDir,{recursive:true});const temp=cacheFile+'.tmp';await fs.writeFile(temp,JSON.stringify({version:1,entries:[...entries]}));await fs.rename(temp,cacheFile);}catch{}}));
 const roots: {agent: Provider; root: string; depth: number}[]=[{agent:'codex',root:path.join(codexHome,'sessions'),depth:3},{agent:'claude',root:path.join(claudeHome,'projects'),depth:1}];
 async function scan(){
  const names=new Map<string,string>();try{for(const row of rows(await chunk(path.join(codexHome,'session_index.jsonl'),2*1024*1024,true)))if(row.id&&uuid.test(row.id)&&typeof row.thread_name==='string')names.set(row.id,row.thread_name);}catch{}
  const found: {agent: Provider; root: string; file: string; depth: number}[]=[];
  for(const source of roots){let root: string;try{root=await fs.realpath(source.root);}catch{continue;}
   async function walk(dir: string,depth: number): Promise<void>{for(const entry of await fs.readdir(dir,{withFileTypes:true}).catch(()=>[])){if(found.length>=10000)break;const file=path.join(dir,entry.name);if(entry.isDirectory()&&depth>0)await walk(file,depth-1);else if(entry.isFile()&&entry.name.endsWith('.jsonl'))found.push({...source,root,file});}}
   await walk(root,source.depth);
  }
  const next=new Map<string,SessionRecord>(),nextCache=new Map<string,SessionCache>(),before=cache.size;let cursor=0,parsed=0;
  async function worker(){while(cursor<found.length){const source=found[cursor++];try{
   const real=await fs.realpath(source.file);if(!isWithin(source.root,real))continue;const stat=await fs.stat(real),stamp=`${stat.size}:${stat.mtimeMs}`,cachedRecord=cache.get(real);let record=cachedRecord?.stamp===stamp?{...cachedRecord.record,file:real,root:source.root}:null;
   if(!record){parsed++;const head=rows(await chunk(real,128*1024)),tailText=await chunk(real,2*1024*1024,true),tail=rows(tailText);
    const meta=source.agent==='codex'?head.find(row=>row.type==='session_meta')?.payload:head.find(row=>row.cwd && row.sessionId);
    const nativeId=source.agent==='codex'?(meta?.id || meta?.session_id):meta?.sessionId;
    if(!nativeId||!uuid.test(nativeId)||!meta?.cwd || !path.isAbsolute(meta.cwd)||meta.source?.subagent || meta.isSidechain)continue;
    const latestContext=[...tail].reverse().find(row=>source.agent==='codex'?row.type==='turn_context'&&row.payload?.cwd:row.cwd);
    let candidate=source.agent==='codex'?latestContext?.payload?.cwd:latestContext?.cwd;
    const previous=cache.get(real);if(!candidate&&source.agent==='codex'&&stat.size>2*1024*1024&&(!previous || stat.size-(previous.size || 0)>2*1024*1024))candidate=await contextSince(real,previous?.size || 0);
    const cwd=candidate&&path.isAbsolute(candidate)?candidate:cache.get(real)?.record.cwd || meta.cwd;
    const lastTimestamp=[...tail].reverse().find(row=>Number.isFinite(Date.parse(row.timestamp || '')))?.timestamp;
    const conversation=parseSession(head.map(row=>JSON.stringify(row)).join('\n'),source.agent),first=conversation.messages.find((message): message is TranscriptMessage=>message.role==='user'&&message.kind!=='action');
    const title=names.get(nativeId)||[...tail].reverse().find(row=>row.type==='custom-title')?.customTitle || first?.text || `${source.agent==='codex'?'Codex':'Claude'} session`;
    const summary=[...parseSession(tailText,source.agent).messages].reverse().find((message): message is TranscriptMessage=>message.role==='assistant'&&message.kind!=='action');
    record={id:sessionId({agent:source.agent,agent_session:{value:nativeId}}),agent:source.agent,agent_session:{value:nativeId},cwd,name:String(title).replace(/\s+/g,' ').trim().slice(0,120),last_update:summary?.text?.replace(/\s+/g,' ').slice(0,200)||'',createdAt:meta.timestamp || new Date(stat.birthtimeMs).toISOString(),updatedAt:new Date(lastTimestamp || stat.mtimeMs).toISOString(),local:true,live:false,file:real,root:source.root};
   }
   const indexedName=names.get(record.agent_session.value);if(source.agent==='codex'&&indexedName!==undefined)record={...record,name:indexedName.replace(/\s+/g,' ').trim().slice(0,120)};
   nextCache.set(real,{stamp,record,size:stat.size});const existing=next.get(record.id);if(!existing||existing.updatedAt<record.updatedAt)next.set(record.id,record);
  }catch{}}}
  await Promise.all(Array.from({length:4},worker));for(const [id,preference] of Object.entries(preferences)){const created=preference?.created;if(!next.has(id)&&created&&uuid.test(created.agent_session?.value || '')&&['codex','claude'].includes(created.agent)&&path.isAbsolute(created.cwd || '')&&sessionId(created)===id)next.set(id,created);}records=next;cache=nextCache;expires=Date.now()+8000;if(parsed||nextCache.size!==before)await persist(nextCache);
 }
 async function refresh(force=false){if(pending)return pending;if(!force&&Date.now()<expires)return;pending=scan().finally(()=>pending=null);return pending;}
 const publicRecord=(record: SessionRecord)=>{const {file,root,...value}=record;return {...value,name:preferences[record.id]?.name || value.name};};
 const get=(id: string)=>{const record=records.get(id);if(!record || preferences[id]?.hidden)throw new FileError(404,'Local session not found.');return record;};
 async function activity(id: string): Promise<SessionActivity>{
  await refresh();const record=get(id);if(record.agent!=='codex'||!record.file)return emptyActivity();const real=await fs.realpath(record.file);if(!record.root||!isWithin(record.root,real))throw new FileError(404,'Local session log moved outside its root.');const stat=await fs.stat(real),cached=activityCache.get(real),stamp=`${stat.size}:${stat.mtimeMs}`;if(cached?.stamp===stamp)return cached.state;
  if(cached?.pending)return cached.pending;
  const incremental=cached&&stat.size>cached.size;const start=incremental?cached.cursor:0;let state=incremental?cached.state:emptyActivity(),offset=start,cursor=start;
  const entry: ActivityCache={size:cached?.size || 0,cursor:cached?.cursor || 0,state,...cached,stamp:null};activityCache.set(real,entry);
  entry.pending=(async()=>{const stream=createReadStream(real,{start}),lines=createInterface({input:stream,crlfDelay:Infinity});let readFailure: unknown;stream.on('error',failure=>{readFailure=failure;lines.close();});lines.on('error',failure=>{readFailure=failure;lines.close();});stream.on('data',(buffer: Buffer)=>{const newline=buffer.lastIndexOf(10);if(newline>=0)cursor=offset+newline+1;offset+=buffer.length;});
   try{for await(const line of lines){if(!/"type"\s*:\s*"event_msg"/.test(line))continue;try{state=applyLifecycle(state,JSON.parse(line));}catch{}}if(readFailure)throw new FileError(404,'The local session log could not be read.');activityCache.set(real,{stamp,size:stat.size,cursor,state});return state;}
   finally{lines.close();stream.destroy();entry.pending=null;}
  })();return entry.pending;
 }
 const save=(operation: ()=>void)=>{const task=queue.catch(()=>{}).then(async()=>{const before=structuredClone(preferences);try{operation();await fs.mkdir(stateDir,{recursive:true});await fs.writeFile(preferencesFile+'.tmp',JSON.stringify(preferences,null,2));await fs.rename(preferencesFile+'.tmp',preferencesFile);}catch(failure){preferences=before;throw failure;}});queue=task;return task;};
 return {
  refresh,
  async register(record: SessionRecord){await save(()=>preferences[record.id]={...preferences[record.id],created:record});records.set(record.id,record);return publicRecord(record);},
  async list(){await refresh();return [...records.values()].filter(record=>!preferences[record.id]?.hidden).map(publicRecord).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));},
  async get(id: string){await refresh();return publicRecord(get(id));},
  async history(id: string){await refresh();const record=get(id);if(!record.file)return {messages:[],metadata:{},available:true};try{const real=await fs.realpath(record.file);if(!record.root||!isWithin(record.root,real))throw new Error();return {...parseSession(await chunk(real,2*1024*1024,true),record.agent),available:true};}catch{throw new FileError(404,'The local session log is no longer available.');}},
  activity,
  async externalWorking(id: string){return (await activity(id)).status==='working';},
  async rename(id: string,name: unknown){await refresh();get(id);if(typeof name!=='string'||!name.trim()||name.trim().length>80)throw new FileError(400,'Session name must be 1–80 characters.');await save(()=>preferences[id]={...preferences[id],name:name.trim()});return publicRecord(get(id));},
  async remove(id: string){await refresh();get(id);await save(()=>preferences[id]={...preferences[id],hidden:true});},
 };
}
