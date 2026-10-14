import {applyLifecycle,emptyActivity} from './session-lifecycle.js';
import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {parseSession} from './session-parser.js';
import {sessionId} from './session-id.js';
import {FileError,isWithin} from './files.js';
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
async function chunk(file,limit,tail=false){const handle=await fs.open(file,'r');try{const {size}=await handle.stat();const offset=tail?Math.max(0,size-limit):0,buffer=Buffer.alloc(Math.min(limit,size));const {bytesRead}=await handle.read(buffer,0,buffer.length,offset);let text=buffer.subarray(0,bytesRead).toString('utf8');if(offset)text=text.slice(text.indexOf('\n')+1);return text;}finally{await handle.close();}}
const rows=text=>text.split('\n').flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
async function contextSince(file,start=0){
 const stream=createReadStream(file,{start:Math.max(0,start-1024),encoding:'utf8'}),lines=createInterface({input:stream,crlfDelay:Infinity});let cwd;
 try{for await(const line of lines){if(!/"type"\s*:\s*"turn_context"/.test(line))continue;try{const row=JSON.parse(line);if(row.type==='turn_context'&&typeof row.payload?.cwd==='string'&&path.isAbsolute(row.payload.cwd))cwd=row.payload.cwd;}catch{}}return cwd;}finally{lines.close();stream.destroy();}
}
export async function createLocalSessions({home=os.homedir(),stateDir,codexHome=process.env.CODEX_HOME || path.join(home,'.codex'),claudeHome=process.env.CLAUDE_CONFIG_DIR || path.join(home,'.claude')}={}){
 const preferencesFile=path.join(stateDir,'local-session-preferences.json');let preferences={};try{preferences=JSON.parse(await fs.readFile(preferencesFile,'utf8'));}catch{}
 let records=new Map(),cache=new Map(),activityCache=new Map(),expires=0,pending,queue=Promise.resolve();
 const roots=[{agent:'codex',root:path.join(codexHome,'sessions'),depth:3},{agent:'claude',root:path.join(claudeHome,'projects'),depth:1}];
 async function scan(){
  const names=new Map();try{for(const row of rows(await chunk(path.join(codexHome,'session_index.jsonl'),2*1024*1024,true)))if(uuid.test(row.id)&&typeof row.thread_name==='string')names.set(row.id,row.thread_name);}catch{}
  const found=[];
  for(const source of roots){let root;try{root=await fs.realpath(source.root);}catch{continue;}
   async function walk(dir,depth){for(const entry of await fs.readdir(dir,{withFileTypes:true}).catch(()=>[])){if(found.length>=10000)break;const file=path.join(dir,entry.name);if(entry.isDirectory()&&depth>0)await walk(file,depth-1);else if(entry.isFile()&&entry.name.endsWith('.jsonl'))found.push({...source,root,file});}}
   await walk(root,source.depth);
  }
  const next=new Map(),nextCache=new Map();let cursor=0;
  async function worker(){while(cursor<found.length){const source=found[cursor++];try{
   const real=await fs.realpath(source.file);if(!isWithin(source.root,real))continue;const stat=await fs.stat(real),stamp=`${stat.size}:${stat.mtimeMs}`;let record=cache.get(real)?.stamp===stamp?cache.get(real).record:null;
   if(!record){const head=rows(await chunk(real,128*1024)),tailText=await chunk(real,2*1024*1024,true),tail=rows(tailText);
    const meta=source.agent==='codex'?head.find(row=>row.type==='session_meta')?.payload:head.find(row=>row.cwd && row.sessionId);
    const nativeId=source.agent==='codex'?(meta?.id || meta?.session_id):meta?.sessionId;
    if(!uuid.test(nativeId || '')||!meta?.cwd || !path.isAbsolute(meta.cwd)||meta.source?.subagent || meta.isSidechain)continue;
    const latestContext=[...tail].reverse().find(row=>source.agent==='codex'?row.type==='turn_context'&&row.payload?.cwd:row.cwd);
    let candidate=source.agent==='codex'?latestContext?.payload?.cwd:latestContext?.cwd;
    const previous=cache.get(real);if(!candidate&&source.agent==='codex'&&stat.size>2*1024*1024&&(!previous || stat.size-(previous.size || 0)>2*1024*1024))candidate=await contextSince(real,previous?.size || 0);
    const cwd=candidate&&path.isAbsolute(candidate)?candidate:cache.get(real)?.record.cwd || meta.cwd;
    const lastTimestamp=[...tail].reverse().find(row=>Number.isFinite(Date.parse(row.timestamp || '')))?.timestamp;
    const conversation=parseSession(head.map(row=>JSON.stringify(row)).join('\n'),source.agent),first=conversation.messages.find(message=>message.role==='user');
    const title=names.get(nativeId)||[...tail].reverse().find(row=>row.type==='custom-title')?.customTitle || first?.text || `${source.agent==='codex'?'Codex':'Claude'} session`;
    const summary=[...parseSession(tailText,source.agent).messages].reverse().find(message=>message.role==='assistant'&&message.kind!=='action');
    record={id:sessionId({agent:source.agent,agent_session:{value:nativeId}}),agent:source.agent,agent_session:{value:nativeId},cwd,name:String(title).replace(/\s+/g,' ').trim().slice(0,120),last_update:summary?.text?.replace(/\s+/g,' ').slice(0,200)||'',createdAt:meta.timestamp || new Date(stat.birthtimeMs).toISOString(),updatedAt:new Date(lastTimestamp || stat.mtimeMs).toISOString(),local:true,live:false,file:real,root:source.root};
   }
   if(source.agent==='codex'&&names.has(record.agent_session.value))record={...record,name:names.get(record.agent_session.value).replace(/\s+/g,' ').trim().slice(0,120)};
   nextCache.set(real,{stamp,record,size:stat.size});const existing=next.get(record.id);if(!existing||existing.updatedAt<record.updatedAt)next.set(record.id,record);
  }catch{}}}
  await Promise.all(Array.from({length:8},worker));for(const [id,preference] of Object.entries(preferences)){const created=preference?.created;if(!next.has(id)&&created&&uuid.test(created.agent_session?.value || '')&&['codex','claude'].includes(created.agent)&&path.isAbsolute(created.cwd || '')&&sessionId(created)===id)next.set(id,created);}records=next;cache=nextCache;expires=Date.now()+8000;
 }
 async function refresh(force=false){if(pending)return pending;if(!force&&Date.now()<expires)return;pending=scan().finally(()=>pending=null);return pending;}
 const publicRecord=record=>{const {file,root,...value}=record;return {...value,name:preferences[record.id]?.name || value.name};};
 const get=id=>{const record=records.get(id);if(!record || preferences[id]?.hidden)throw new FileError(404,'Local session not found.');return record;};
 async function activity(id){
  await refresh();const record=get(id);if(record.agent!=='codex'||!record.file)return emptyActivity();const real=await fs.realpath(record.file);if(!isWithin(record.root,real))throw new FileError(404,'Local session log moved outside its root.');const stat=await fs.stat(real),cached=activityCache.get(real),stamp=`${stat.size}:${stat.mtimeMs}`;if(cached?.stamp===stamp)return cached.state;
  if(cached?.pending)return cached.pending;
  const incremental=cached&&stat.size>cached.size;const start=incremental?cached.cursor:0;let state=incremental?cached.state:emptyActivity(),offset=start,cursor=start;
  const entry={...cached,stamp:null};activityCache.set(real,entry);
  entry.pending=(async()=>{const stream=createReadStream(real,{start}),lines=createInterface({input:stream,crlfDelay:Infinity});let readFailure;stream.on('error',failure=>{readFailure=failure;lines.close();});lines.on('error',failure=>{readFailure=failure;lines.close();});stream.on('data',buffer=>{const newline=buffer.lastIndexOf(10);if(newline>=0)cursor=offset+newline+1;offset+=buffer.length;});
   try{for await(const line of lines){if(!/"type"\s*:\s*"event_msg"/.test(line))continue;try{state=applyLifecycle(state,JSON.parse(line));}catch{}}if(readFailure)throw new FileError(404,'The local session log could not be read.');activityCache.set(real,{stamp,size:stat.size,cursor,state});return state;}
   finally{lines.close();stream.destroy();entry.pending=null;}
  })();return entry.pending;
 }
 const save=operation=>{const task=queue.catch(()=>{}).then(async()=>{const before=structuredClone(preferences);try{operation();await fs.mkdir(stateDir,{recursive:true});await fs.writeFile(preferencesFile+'.tmp',JSON.stringify(preferences,null,2));await fs.rename(preferencesFile+'.tmp',preferencesFile);}catch(failure){preferences=before;throw failure;}});queue=task;return task;};
 return {
  refresh,
  async register(record){await save(()=>preferences[record.id]={...preferences[record.id],created:record});records.set(record.id,record);return publicRecord(record);},
  async list(){await refresh();return [...records.values()].filter(record=>!preferences[record.id]?.hidden).map(publicRecord).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));},
  async get(id){await refresh();return publicRecord(get(id));},
  async history(id){await refresh();const record=get(id);if(!record.file)return {messages:[],metadata:{},available:true};try{const real=await fs.realpath(record.file);if(!isWithin(record.root,real))throw new Error();return {...parseSession(await chunk(real,2*1024*1024,true),record.agent),available:true};}catch{throw new FileError(404,'The local session log is no longer available.');}},
  activity,
  async externalWorking(id){return (await activity(id)).status==='working';},
  async rename(id,name){await refresh();get(id);if(typeof name!=='string'||!name.trim()||name.trim().length>80)throw new FileError(400,'Session name must be 1–80 characters.');await save(()=>preferences[id]={...preferences[id],name:name.trim()});return publicRecord(get(id));},
  async remove(id){await refresh();get(id);await save(()=>preferences[id]={...preferences[id],hidden:true});},
 };
}
