import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {query as sdkQuery,getSessionMessages,getSessionInfo,forkSession} from '@anthropic-ai/claude-agent-sdk';
import type {Options,PermissionResult,PermissionUpdate,SDKUserMessage} from '@anthropic-ai/claude-agent-sdk';
import {cliBinary} from '../../lib/cli-binary.ts';
import {createChatNormalizer,foldChatEvent,historyEvents} from './chat-events.ts';
import type {ChatCommand,ChatContextUsage,ChatEvent,ChatImage,ChatPermissionMode} from '../../../../shared/contracts.ts';

type QueryFn=(params:{prompt:AsyncIterable<SDKUserMessage>;options?:Options})=>ReturnType<typeof sdkQuery>;
export interface ChatSessionOptions {history?:(sessionId:string,cwd:string)=>Promise<Parameters<typeof historyEvents>[0]>;times?:(sessionId:string,cwd:string)=>Promise<ReadonlyMap<string,number>>;cwd:string;sessionId?:string;resume?:boolean;model?:string;permissionMode?:ChatPermissionMode;query?:QueryFn;effort?:string;ultracode?:boolean;onPrefs?:(patch:{model?:string;effort?:string;ultracode?:boolean;permissionMode?:ChatPermissionMode})=>void;fork?:(sessionId:string,cwd:string)=>Promise<{sessionId:string}>;info?:(sessionId:string,cwd:string)=>Promise<{summary?:string;lastModified?:number}|undefined>;onChange?:()=>void}
export interface ChatModel {value:string;displayName:string;description?:string;efforts?:string[];resolved?:string}

/** When each message was written: Claude's own log keeps a timestamp the SDK's reader drops. */
async function readTimes(sessionId:string,cwd:string){
 const times=new Map<string,number>();
 try{
  const file=path.join(process.env.CLAUDE_CONFIG_DIR||path.join(os.homedir(),'.claude'),'projects',cwd.replace(/[^a-zA-Z0-9]/g,'-'),`${sessionId}.jsonl`);
  for(const line of (await fs.readFile(file,'utf8')).split('\n')){
   if(!line.includes('"timestamp"'))continue;
   try{const row=JSON.parse(line) as {uuid?:string;timestamp?:string},at=Date.parse(row.timestamp||'');if(row.uuid&&Number.isFinite(at))times.set(row.uuid,at);}catch{/* A torn line is skipped. */}
  }
 }catch{/* Without the log there are no durations. */}
 return times;
}

/** A queue the SDK reads as the user's side of the conversation; closing it ends the session. */
function createInbox(){
 const waiting:Array<(result:IteratorResult<SDKUserMessage>)=>void>=[],items:SDKUserMessage[]=[];let closed=false;
 return {
  push(message:SDKUserMessage){if(closed)return;const next=waiting.shift();if(next)next({value:message,done:false});else items.push(message);},
  close(){closed=true;for(const next of waiting.splice(0))next({value:undefined,done:true});},
  iterable:{[Symbol.asyncIterator]:()=>({next:()=>items.length?Promise.resolve({value:items.shift()!,done:false} as IteratorResult<SDKUserMessage>):closed?Promise.resolve({value:undefined,done:true} as IteratorResult<SDKUserMessage>):new Promise<IteratorResult<SDKUserMessage>>(resolve=>waiting.push(resolve))})} as AsyncIterable<SDKUserMessage>,
 };
}

const errorText=(error:unknown)=>{const text=error instanceof Error?error.message:String(error);return /ENOENT|not found/i.test(text)?'The Claude CLI is not installed or could not be found.':text;};

export function createChatSession({cwd,sessionId=crypto.randomUUID(),resume=false,model,effort,ultracode,onPrefs,permissionMode='default',query=sdkQuery,history=(id,dir)=>getSessionMessages(id,{dir}),times=readTimes,info=(id,dir)=>getSessionInfo(id,{dir}),fork=(id,dir)=>forkSession(id,{dir}),onChange}:ChatSessionOptions){
 const inbox=createInbox(),abort=new AbortController(),normalize=createChatNormalizer();
 const log:ChatEvent[]=[],listeners=new Set<(event:ChatEvent)=>void>();
 const pending=new Map<string,{resolve:(result:PermissionResult)=>void;input:Record<string,unknown>;suggestions?:PermissionUpdate[]}>();
 let state=('starting' as 'starting'|'idle'|'working'|'error'),closed=false,currentMode=permissionMode,currentModel=model;
 let turnStart=0,lastTextId='';
 const emit=(event:ChatEvent)=>{
  if(event.type==='status')state=event.state;
  if(event.type==='text')lastTextId=event.id;
  if(event.type==='status'&&event.state==='idle'&&turnStart&&lastTextId){const done:ChatEvent={type:'turn',id:lastTextId,ms:Date.now()-turnStart,at:Date.now()};turnStart=0;foldChatEvent(log,done);for(const listener of listeners)listener(done);}
  foldChatEvent(log,event);for(const listener of listeners)listener(event);onChange?.();
 };
 const env=Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>typeof entry[1]==='string'&&!['CLAUDECODE','CODEX_THREAD_ID','CODEX_SESSION_ID'].includes(entry[0])));
 const canUseTool:NonNullable<Options['canUseTool']>=(tool,input,{signal,suggestions,blockedPath,toolUseID})=>new Promise<PermissionResult>(resolve=>{
  const id=toolUseID||crypto.randomUUID();
  const settle=(result:PermissionResult)=>{if(!pending.delete(id))return;emit({type:'permission-done',id});resolve(result);};
  pending.set(id,{resolve:result=>settle(result),input,suggestions});
  signal.addEventListener('abort',()=>settle({behavior:'deny',message:'The request was cancelled.'}),{once:true});
  emit({type:'permission',id,tool,input,...(blockedPath?{blockedPath}:{})});
 });
 const run=query({prompt:inbox.iterable,options:{
  cwd,env,abortController:abort,includePartialMessages:true,canUseTool,permissionMode:currentMode,
  ...(currentMode==='bypassPermissions'?{allowDangerouslySkipPermissions:true}:{}),
  ...(currentModel?{model:currentModel}:{}),
  ...(effort?{effort:effort as 'low'}:{}),
  ...(ultracode?{settings:{ultracode:true} as Options['settings']}:{}),
  ...(resume?{resume:sessionId}:{sessionId}),
  settingSources:['user','project','local'],
  pathToClaudeCodeExecutable:cliBinary('claude'),
 }});
 // A resumed conversation shows what was already said; the socket waits for this before it sends the first replay.
 const loaded=resume?history(sessionId,cwd).then(async saved=>{if(closed)return;
  // A conversation reopened without a remembered model goes back to the one it last answered with.
  if(!model){const used=[...saved].reverse().map(item=>(item as {message?:{model?:unknown}}).message?.model).find((name):name is string=>typeof name==='string'&&name.startsWith('claude-'));if(used){try{await run.setModel(used);currentModel=used;emit({type:'status',state:state==='starting'?'idle':state,model:used,permissionMode:currentMode});}catch{/* Keeps the default model. */}}}
  const stamps=await times(sessionId,cwd).catch(()=>undefined);const earlier:ChatEvent[]=[];for(const event of historyEvents(saved,stamps))foldChatEvent(earlier,event);log.unshift(...earlier);onChange?.();}).catch(()=>{}):Promise.resolve();
 // What the CLI actually resolved (saved choice, settings file, org caps), so the picker never guesses.
 const readApplied=async()=>{
  try{
   const settings=await (run as unknown as {getSettings?:()=>Promise<{applied?:{model?:string;effort?:string|null;ultracode?:boolean}}>}).getSettings?.();
   const applied=settings?.applied;if(!applied||closed)return;
   if(applied.model)currentModel=applied.model;
   emit({type:'status',state:state==='starting'?'idle':state,permissionMode:currentMode,...(applied.model?{model:applied.model}:{}),...(applied.effort!==undefined?{effort:applied.effort}:{}),...(typeof applied.ultracode==='boolean'?{ultracode:applied.ultracode}:{})});
  }catch{/* Older CLIs have no get_settings; the picker then shows only what was chosen. */}
 };
 // Claude names the conversation after a turn; the same title the terminal tab used to show.
 let lastTitle='';
 const refreshTitle=async()=>{try{const found=await info(sessionId,cwd),text=found?.summary?.trim();if(!closed&&text&&text!==lastTitle){lastTitle=text;emit({type:'title',text});}}catch{/* The tab keeps its first-message name. */}};
 // Like the terminal's "Resume this conversation?" dialog: an old session re-sends its whole context uncached, which spends the 5-hour limit.
 const CACHE_TTL_MS=5*60_000;
 const checkResumeCost=async()=>{
  try{
   const found=await info(sessionId,cwd);if(closed||!found?.lastModified)return;
   const inactiveMs=Date.now()-found.lastModified;if(inactiveMs<CACHE_TTL_MS)return;
   const usage=await Promise.race([run.getContextUsage(),new Promise<null>(resolve=>setTimeout(()=>resolve(null),8000).unref?.())]) as ({totalTokens:number;coldResumeQuota?:{percentPerMillionTokens:number;minPercent:number}}|null);
   const price=usage?.coldResumeQuota;if(closed||!usage||!price)return;
   const percent=Math.round(usage.totalTokens/1_000_000*price.percentPerMillionTokens);if(percent<price.minPercent)return;
   emit({type:'resume-cost',tokens:usage.totalTokens,percent,inactiveMs});
  }catch{/* Without a known price the terminal stays quiet too. */}
 };
 void loaded.then(()=>{if(resume){void refreshTitle();void checkResumeCost();}void readApplied();});
 const pump=(async()=>{
  try{for await(const message of run)for(const event of normalize(message)){
   if(event.type==='status'&&event.state==='starting'){if(event.model)currentModel=event.model;emit({...event,state:state==='starting'?'idle':state,permissionMode:currentMode});void readApplied();}
   else emit(event.type==='status'?{...event,permissionMode:currentMode}:event);
   if(event.type==='status'&&event.state==='idle'){void refreshTitle();setTimeout(()=>void refreshTitle(),4000).unref?.();}
  }}
  catch(error){if(!closed)emit({type:'status',state:'error',message:errorText(error)});}
  finally{if(!closed&&state==='working')emit({type:'status',state:'error',message:'Claude stopped before finishing this turn.'});}
 })();
 function denyAll(message:string){for(const [,item] of [...pending])item.resolve({behavior:'deny',message});}
 return {
  id:sessionId,cwd,loaded,
  get state(){return state;},
  get model(){return currentModel;},
  get permissionMode(){return currentMode;},
  /** Everything a late-joining view needs to draw the conversation so far. */
  snapshot:()=>log.map(event=>({...event})) as ChatEvent[],
  subscribe(listener:(event:ChatEvent)=>void){listeners.add(listener);return ()=>{listeners.delete(listener);};},
  send(text:string,images:ChatImage[]=[]){
   if(closed)throw new Error('This chat is closed.');
   if(state==='working')throw new Error('Claude is still working on the previous message.');
   turnStart=Date.now();lastTextId='';
   emit({type:'user',id:crypto.randomUUID(),text,...(images.length?{images:images.length}:{})});emit({type:'status',state:'working',permissionMode:currentMode,...(currentModel?{model:currentModel}:{})});
   inbox.push({type:'user',message:{role:'user',content:images.length?[...images.map(image=>({type:'image' as const,source:{type:'base64' as const,media_type:image.mediaType,data:image.data}})),...(text?[{type:'text' as const,text}]:[])]:text},parent_tool_use_id:null});
  },
  async interrupt(){denyAll('Stopped by the user.');try{await run.interrupt();}catch{}},
  answer(id:string,decision:'allow'|'always'|'deny',answers?:Record<string,string>){
   const item=pending.get(id);if(!item)return false;
   if(decision==='deny')item.resolve({behavior:'deny',message:'The user denied this request.'});
   else item.resolve({behavior:'allow',updatedInput:answers?{...item.input,answers}:item.input,...(decision==='always'&&item.suggestions?.length?{updatedPermissions:item.suggestions}:{})});
   return true;
  },
  async setModel(next:string){await run.setModel(next);currentModel=next;onPrefs?.({model:next});void readApplied();emit({type:'status',state:state==='starting'?'idle':state,model:next,permissionMode:currentMode});},
  async context():Promise<ChatContextUsage|null>{try{const usage=await run.getContextUsage();return {total:usage.totalTokens,max:usage.maxTokens,categories:usage.categories.map(({name,tokens,kind})=>({name,tokens,kind}))};}catch{return null;}},
  async fork(){return (await fork(sessionId,cwd)).sessionId;},
  async setEffort(effort?:string,ultracode?:boolean){await run.applyFlagSettings({...(effort?{effortLevel:effort as 'low'}:{}),...(ultracode===undefined?{}:{ultracode})} as Parameters<typeof run.applyFlagSettings>[0]);onPrefs?.({...(effort?{effort}:{}),...(ultracode===undefined?{}:{ultracode})});void readApplied();},
  async setPermissionMode(mode:ChatPermissionMode){await run.setPermissionMode(mode);currentMode=mode;onPrefs?.({permissionMode:mode});emit({type:'status',state:state==='starting'?'idle':state,permissionMode:mode,...(currentModel?{model:currentModel}:{})});},
  async commands():Promise<ChatCommand[]>{try{return (await run.supportedCommands()).map(({name,description,argumentHint})=>({name,description,...(argumentHint?{argumentHint}:{})}));}catch{return [];}},
  async models():Promise<ChatModel[]>{
   try{
    const all=await run.supportedModels();
    const same=(a:{value:string;resolvedModel?:string},b:{value:string;resolvedModel?:string})=>a.value!==b.value&&Boolean(a.resolvedModel)&&(b.value===a.resolvedModel||b.resolvedModel===a.resolvedModel);
    // The "Default (recommended)" row is just one of the others; show that model by name instead.
    const rows=all.filter(model=>!(model.value==='default'&&all.some(other=>same(model,other))));
    return rows.map(({value,displayName,description,supportedEffortLevels,resolvedModel})=>({value,displayName:value==='default'?displayName.replace(/\s*\((?:recommended|default)\)/i,''):displayName,description,...(resolvedModel?{resolved:resolvedModel}:{}),...(supportedEffortLevels?.length?{efforts:supportedEffortLevels}:{})}));
   }catch{return [];}
  },
  async close(){if(closed)return;closed=true;denyAll('The chat was closed.');inbox.close();abort.abort();try{run.close();}catch{}await pump.catch(()=>{});},
 };
}
export type ChatSession=ReturnType<typeof createChatSession>;
