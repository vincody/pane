import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import path from 'node:path';
import os from 'node:os';
import {FileError,isWithin} from '../files/files.ts';
import type {Provider,TokenCounters,TokenUsageSnapshot} from '../../../../shared/contracts.ts';

const object=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const count=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:0;
const empty=():TokenCounters=>({input:0,output:0,cacheRead:0,cacheWrite:0,total:0});
interface Entry {key:string;session:string;at:number;counters:TokenCounters}
interface Parsed {entries:Entry[];partial:boolean}
const maxCounters=(a:TokenCounters,b:TokenCounters):TokenCounters=>({input:Math.max(a.input,b.input),output:Math.max(a.output,b.output),cacheRead:Math.max(a.cacheRead,b.cacheRead),cacheWrite:Math.max(a.cacheWrite,b.cacheWrite),total:Math.max(a.total,b.total)});
const add=(a:TokenCounters,b:TokenCounters)=>{for(const key of ['input','output','cacheRead','cacheWrite','total'] as const)a[key]+=b[key];};

/** Only usage metadata is retained; message text never leaves the reader. */
export async function parseTokenLog(file:string,provider:'codex'|'claude'):Promise<Parsed>{
 const entries:Entry[]=[],messages=new Map<string,Entry>();let session=path.basename(file,'.jsonl'),previous=empty(),partial=false;
 const stream=createReadStream(file,{encoding:'utf8'}),lines=createInterface({input:stream,crlfDelay:Infinity});
 try{for await(const line of lines){
  if(!line.includes('token_count')&&!line.includes('session_meta')&&!(provider==='claude'&&line.includes('"usage"')))continue;
  let row:Record<string,unknown>;try{row=object(JSON.parse(line));}catch{partial=true;continue;}
  const payload=object(row.payload);
  if(provider==='codex'&&row.type==='session_meta'){if(typeof payload.id==='string')session=payload.id;continue;}
  const at=typeof row.timestamp==='string'?Date.parse(row.timestamp):NaN;
  if(provider==='codex'){
   if(row.type!=='event_msg'||payload.type!=='token_count')continue;
   const usage=object(object(payload.info).total_token_usage);if(!Object.keys(usage).length)continue;
   const current:TokenCounters={input:count(usage.input_tokens),output:count(usage.output_tokens),cacheRead:count(usage.cached_input_tokens),cacheWrite:count(usage.cache_write_input_tokens),total:count(usage.total_tokens)};
   // Codex input already includes cached input, and output includes reasoning.
   const delta=empty();for(const key of ['input','output','cacheRead','cacheWrite','total'] as const)delta[key]=Math.max(0,current[key]-previous[key]);
   previous=maxCounters(previous,current);
   if(!delta.total)continue;
   if(!Number.isFinite(at)){partial=true;continue;}
   entries.push({key:`${session}:${JSON.stringify(current)}`,session,at,counters:delta});
  }else{
   const message=object(row.message),usage=object(message.usage);if(row.type!=='assistant'||!Object.keys(usage).length)continue;
   if(typeof row.sessionId==='string')session=row.sessionId;
   if(typeof message.id!=='string'||!Number.isFinite(at)){partial=true;continue;}
   const cacheRead=count(usage.cache_read_input_tokens),cacheWrite=count(usage.cache_creation_input_tokens);
   // Claude reports ordinary input and cache separately: total includes each once.
   const input=count(usage.input_tokens)+cacheRead+cacheWrite,output=count(usage.output_tokens);
   const counters={input,output,cacheRead,cacheWrite,total:input+output},key=`${session}:${message.id}`;
   const old=messages.get(key);messages.set(key,{key,session,at:old?.at??at,counters:old?maxCounters(old.counters,counters):counters});
  }
 }}finally{lines.close();stream.destroy();}
 return {entries:provider==='claude'?[...messages.values()]:entries,partial};
}

export function createTokenUsage({home=os.homedir(),codexHome=process.env.CODEX_HOME||path.join(home,'.codex'),claudeHome=process.env.CLAUDE_CONFIG_DIR||path.join(home,'.claude'),now=Date.now}:{home?:string;codexHome?:string;claudeHome?:string;now?:()=>number}={}){
 const roots:{provider:'codex'|'claude';root:string}[]=[{provider:'codex',root:path.join(codexHome,'sessions')},{provider:'codex',root:path.join(codexHome,'archived_sessions')},{provider:'claude',root:path.join(claudeHome,'projects')}];
 let cache=new Map<string,{stamp:string;parsed:Parsed}>(),pending:Promise<void>|null=null,expires=0,updatedAt='',partial=false;
 let data=new Map<Provider,Entry[]>(),available=new Set<Provider>();
 async function scan(){
  const next=new Map<string,{stamp:string;parsed:Parsed}>(),found:{file:string;root:string;provider:'codex'|'claude'}[]=[];partial=false;available=new Set();
  for(const source of roots){let root:string;try{root=await fs.realpath(source.root);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')partial=true;continue;}available.add(source.provider);
   async function walk(dir:string,depth:number):Promise<void>{let entries;try{entries=await fs.readdir(dir,{withFileTypes:true});}catch{partial=true;return;}
    for(const entry of entries){if(found.length>=10000){partial=true;return;}const file=path.join(dir,entry.name);if(entry.isDirectory()){if(depth>0)await walk(file,depth-1);else partial=true;}else if(entry.isFile()&&entry.name.endsWith('.jsonl'))found.push({...source,file,root});}
   }await walk(root,5);
  }
  const merged=new Map<Provider,Map<string,Entry>>();let cursor=0;
  async function worker(){while(cursor<found.length){const source=found[cursor++];try{const real=await fs.realpath(source.file);if(!isWithin(source.root,real)){partial=true;continue;}const stat=await fs.stat(real),stamp=`${stat.size}:${stat.mtimeMs}`,old=cache.get(real);const parsed=old?.stamp===stamp?old.parsed:await parseTokenLog(real,source.provider);next.set(real,{stamp,parsed});partial ||= parsed.partial;
    const records=merged.get(source.provider)||new Map<string,Entry>();for(const entry of parsed.entries){const old=records.get(entry.key);records.set(entry.key,old?{...old,counters:maxCounters(old.counters,entry.counters)}:entry);}merged.set(source.provider,records);
   }catch{partial=true;}}}
  await Promise.all([worker(),worker()]);cache=next;data=new Map([...merged].map(([provider,entries])=>[provider,[...entries.values()]]));updatedAt=new Date(now()).toISOString();expires=now()+30000;
 }
 return {async read(since:unknown=0):Promise<TokenUsageSnapshot>{
  if(typeof since!=='number'||!Number.isFinite(since)||since<0)throw new FileError(400,'Invalid token usage start time.');
  if(pending)await pending;else if(now()>=expires){pending=scan().finally(()=>pending=null);await pending;}
  return {updatedAt,partial,providers:(['codex','claude','antigravity'] as const).map(provider=>{const supported=provider!=='antigravity',counters=empty(),sessions=new Set<string>();for(const entry of data.get(provider)||[]){if(entry.at<since)continue;add(counters,entry.counters);sessions.add(entry.session);}return {provider,supported,available:available.has(provider),counters,sessions:sessions.size,message:!supported?'Token history is not supported for Antigravity yet.':!available.has(provider)?'No local session logs found.':undefined};})};
 }};
}
