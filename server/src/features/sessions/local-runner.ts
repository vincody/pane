import crypto from 'node:crypto';
import {sessionId} from './session-id.ts';
import {createModelControl} from '../codex/codex-control.ts';
import {createCodexSessions} from '../codex/codex-sessions.ts';
import fs from 'node:fs/promises';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {StringDecoder} from 'node:string_decoder';
import {cliBinary} from '../../lib/cli-binary.ts';
import {FileError} from '../files/files.ts';
import {gitBranch} from '../git/git.ts';
import {changes,fileDiff} from '../git/git-changes.ts';
import type {SessionRecord,AgentSnapshot} from '../../../../shared/contracts.ts';
import type {createLocalSessions} from './local-sessions.ts';
import type {LiveMessage,SessionInput} from '../codex/codex-sessions.ts';
import type {createCodexEngine} from '../codex/codex-engine.ts';
interface RunnerState {child?:ChildProcessWithoutNullStreams|null;output:string;messages:LiveMessage[];completed:boolean;stopped?:boolean;error?:string;starting?:boolean;started?:boolean;model?:string;effort?:string;}
export interface LocalRunnerOptions {local:Awaited<ReturnType<typeof createLocalSessions>>;launch?:typeof spawn;allowRecord?:(record:SessionRecord)=>boolean;codexEngineFactory?:typeof createCodexEngine;}
export interface CreateSessionInput {cwd:string;provider:string;prompt?:string|null;startEmpty?:boolean;model?:string|null;effort?:string|null;}
interface RunnerEvent {type:string;item?:{id?:string;type?:string;text?:string;phase?:string};message?:string|{content?:{type:string;text?:string}[]};error?:{message?:string};result?:string;is_error?:boolean;}
const errorMessage=(error:unknown)=>error instanceof Error?error.message:String(error);
export function createLocalRunner({local,launch=spawn,allowRecord=()=>true,codexEngineFactory}:LocalRunnerOptions){
 const selected=new Map<string,RunnerState>();const codex=createCodexSessions({engineFactory:codexEngineFactory});
 const agent=async(record:SessionRecord,state?:RunnerState):Promise<AgentSnapshot&SessionRecord>=>{const activity=await local.activity(record.id);if(record.agent==='codex'){const binding=codex.state(record.id),ready=binding.connection==='ready',busy=binding.connection==='busy';return {...record,archived:false,local:true,saved_session_id:record.id,pane_id:`local:${record.id}`,terminal_id:`local:${record.id}`,agent_status:ready?(binding.question?'blocked':binding.working?'working':binding.completed?'done':'idle'):activity.status,externalWorking:busy&&activity.status==='working',canStop:ready&&binding.working&&Boolean(binding.turnId),inputLocked:!ready,sessionInUse:busy,sessionConnection:binding.connection,sessionMessage:binding.error,externalStartedAt:busy?activity.startedAt:null,display_agent:record.name};}return {...record,archived:false,local:true,saved_session_id:record.id,pane_id:`local:${record.id}`,terminal_id:`local:${record.id}`,agent_status:state?.child?'working':state?.completed?'done':'idle',externalWorking:false,canStop:Boolean(state?.child),display_agent:record.name};};
 async function resolve(target:string,expected:string){const id=target?.replace(/^local:/,'');const record=await local.get(id);if(!allowRecord(record))throw new FileError(404,'Add this session folder as a project first.');if(!target?.startsWith('local:') || expected!==record.agent_session.value)throw new FileError(409,'Select the local session again before sending input.');return {record,state:selected.get(id)};}
 function stop(state:RunnerState|undefined){if(!state?.child)return;state.stopped=true;state.error='';const child=state.child;if(process.platform==='win32'&&child.pid){const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.on('error',()=>child.kill());}else child.kill('SIGINT');}
 return {
  async newModels(){return {models:await createModelControl({request:(method,params)=>codex.accountRequest(method,params)}).list()};},
  async create({cwd,provider,prompt,startEmpty=false,model,effort}:CreateSessionInput){
   if(!['codex','claude'].includes(provider))throw new FileError(400,'Choose Codex or Claude.');
   if(typeof startEmpty!=='boolean')throw new FileError(400,'Invalid session option.');
   if(startEmpty ? (prompt!==undefined&&prompt!==null&&prompt!=='') : (typeof prompt!=='string'||!prompt.trim()||prompt.length>16000||prompt.includes('\0')))throw new FileError(400,startEmpty?'Leave the first message empty when opening an empty session.':'Enter a chat prompt.');
   if(model!=null&&(typeof model!=='string'||model.length>120)||effort!=null&&(typeof effort!=='string'||effort.length>30))throw new FileError(400,'Invalid model settings.');
   const folder=await fs.stat(cwd).catch(()=>null);if(!folder?.isDirectory())throw new FileError(400,'The project folder is no longer available.');
   const now=new Date().toISOString(),record:SessionRecord={id:"",agent:provider as 'codex'|'claude',agent_session:{value:crypto.randomUUID()},cwd,name:startEmpty?`New ${provider==='codex'?'Codex':'Claude'} session`:prompt!.replace(/\s+/g,' ').trim().slice(0,80),createdAt:now,updatedAt:now,local:true,live:false,newSession:true};record.id=sessionId(record);
   if(!allowRecord(record))throw new FileError(404,'Add this folder as a project first.');
   if(provider==='codex')await codex.open(record,{create:true,model:model || undefined,effort:effort || undefined});
   try{await local.register(record);}catch(error){if(provider==='codex')await codex.release(record.id);throw error;}
   selected.set(record.id,{output:'',messages:[],completed:false});
   if(startEmpty)return {agent:await agent(record,selected.get(record.id))};
   try{await this.input(`local:${record.id}`,record.agent_session.value,{type:'prompt',value:prompt});return {agent:await agent(record,selected.get(record.id))};}
   catch(error){return {agent:await agent(record,selected.get(record.id)),warning:errorMessage(error)};}
  },
  async resume(id:string){const record=await local.get(id);if(!allowRecord(record))throw new FileError(404,'Add this session folder as a project first.');const folder=await fs.stat(record.cwd).catch(()=>null);if(!folder?.isDirectory())throw new FileError(400,'The original folder is no longer available. Use History to read this session.');if(!selected.has(id))selected.set(id,{output:'',messages:[],completed:false});if(record.agent==='codex')await codex.open(record);return {agent:await agent(record,selected.get(id))};},
  async snapshot(){const records=(await local.list()).filter(allowRecord);return {connected:true,source:'local',workspaces:[],sessions:records.map(record=>({...record,live:selected.has(record.id)})),agents:await Promise.all(records.filter(record=>selected.has(record.id)).map(record=>agent(record,selected.get(record.id))))};},
  async read(target:string,expected:string){const {record,state}=await resolve(target,expected);const history=await local.history(record.id);const currentAgent=await agent(record,state);const binding=record.agent==='codex'?codex.state(record.id):null;const messages:(LiveMessage|typeof history.messages[number])[]=[...history.messages];if(binding?.connection==='ready'||state?.child){for(const message of (binding?.messages || state!.messages)){if(message.kind==='action'){const existing=messages.find(old=>old.kind==='action'&&(old.id===message.id||old.target===message.target&&old.turnId&&old.turnId===message.turnId));if(existing)Object.assign(existing,{...message,id:existing.id});else messages.push(message);}else if(!messages.some(old=>old.kind!=='action'&&old.role===message.role&&old.text===message.text))messages.push(message);}}
   return {...history,messages:messages.slice(-80),metadata:{...history.metadata,...(binding?.metadata || {}),...(binding?.startedAt?{startedAt:binding.startedAt}:{}),...(currentAgent.externalStartedAt?{startedAt:currentAgent.externalStartedAt}:{}),...(state?.model?{configuredModel:state.model,configuredEffort:state.effort}:{})},agent:currentAgent,terminal:binding?messages.filter(message=>message.role==='assistant'&&message.kind!=='action').slice(-10).map(message=>'text' in message?message.text:undefined).join('\n\n'):state?.output || (currentAgent.externalWorking?'This turn is running in another terminal. Chat updates are read from its local log.':'Local CLI output appears here after you send a message. This is a read-only output view.'),error:binding?.connection==='ready'?binding.error:state?.error || '',question:binding?.question || null,context:{cwd:record.cwd,branch:await gitBranch(record.cwd)}};
  },
  async input(target:string,expected:string,input:SessionInput){const {record,state}=await resolve(target,expected);if(!state)throw new FileError(409,'Continue this session before sending a message.');if(record.agent==='codex')return codex.input(record,input);if(input?.type==='key'&&input.value==='ctrl+c'){if(!state.child&&(await agent(record,state)).externalWorking)throw new FileError(409,'Stop this external turn from its original terminal.');stop(state);return {sent:true};}
   if(input?.type!=='prompt' || typeof input.value!=='string'||!input.value.trim()||input.value.length>16000||input.value.includes('\0'))throw new FileError(400,'Local sessions accept chat prompts; the output view is read only.');
   if(state.starting || state.child)throw new FileError(409,'This session is already working.');state.starting=true;
   try{if((await agent(record,state)).externalWorking)throw new FileError(409,'This session is working in another Codex window. Wait for it to finish before sending a prompt here.');
    const stat=await fs.stat(record.cwd).catch(()=>null);if(!stat?.isDirectory())throw new FileError(400,'The original session folder is no longer available.');
    const args=['-p',record.newSession&&!state.started?'--session-id':'--resume',record.agent_session.value,'--output-format','stream-json','--verbose'];
    const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!['CODEX_THREAD_ID','CODEX_SESSION_ID','CLAUDECODE'].includes(key)));
    const child=launch(cliBinary(record.agent),args,{cwd:record.cwd,env,windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});state.child=child;state.output='';state.error='';state.completed=false;state.stopped=false;state.messages=[{id:`local-user:${Date.now()}`,role:'user',text:input.value}];let buffer='',counter=0;const decoder=new StringDecoder('utf8');
    const output=(text:string)=>state.output=(state.output+text).slice(-1024*1024);
    const event=(row:RunnerEvent)=>{const item=row.item;if(record.agent==='codex'&&['item.completed','item.updated'].includes(row.type)&&item?.type==='agent_message'&&item.text){const existing=state.messages.find(message=>message.id===`local:${item.id}`);if(existing)existing.text=item.text;else state.messages.push({id:`local:${item.id || ++counter}`,role:'assistant',text:item.text,phase:item.phase || (row.type==='item.completed'?'final_answer':'commentary')});}
     if(row.type==='assistant'&&typeof row.message==='object'&&row.message?.content){const text=row.message.content.filter(block=>block.type==='text').map(block=>block.text).join('\n');if(text)state.messages.push({id:`local-claude:${++counter}`,role:'assistant',text});}
     if(row.type==='error'||row.type==='turn.failed'||row.type==='result'&&row.is_error)state.error=row.error?.message || (typeof row.message==='string'?row.message:undefined) || row.result || 'The local CLI could not finish this turn.';
    };
    child.stdout.on('data',data=>{const text=decoder.write(data);output(text);buffer+=text;let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);try{event(JSON.parse(line) as RunnerEvent);}catch{}}if(buffer.length>2*1024*1024)buffer='';});child.stderr.on('data',data=>output(data.toString()));child.stdin.on('error',()=>{});
    child.once('error',failure=>{state.child=null;state.error=('code' in failure&&failure.code==='ENOENT')?`${record.agent} CLI is not installed or could not be found.`:'Could not start the local CLI.';});
    child.once('close',code=>{if(buffer.trim())try{event(JSON.parse(buffer) as RunnerEvent);}catch{}state.child=null;state.completed=true;if(code&&!state.error&&!state.stopped)state.error=`The local CLI exited with code ${code}. See its output for details.`;void local.refresh(true);});
    await new Promise<void>((resolve,reject)=>{child.once('spawn',resolve);child.once('error',()=>reject(new FileError(503,state.error || 'Could not start the local CLI.')));});state.started=true;child.stdin.end(input.value);return {sent:true};
   }finally{state.starting=false;}
  },
  async models(target:string,expected:string){const {record}=await resolve(target,expected);return record.agent==='codex'?codex.models(record):{supported:false,message:'Claude uses its saved CLI model settings.',models:[]};},
  async configure(target:string,expected:string,model:string,effort?:string|null){const {record}=await resolve(target,expected);if(record.agent!=='codex')throw new FileError(400,'Use this agent’s native model settings.');return codex.configure(record,model,effort);},
  async permissions(target:string,expected:string){const {record}=await resolve(target,expected);if(record.agent!=='codex')throw new FileError(400,'Permissions are available for Codex sessions.');return codex.permissions(record);},
  async setPermissions(target:string,expected:string,id:unknown){const {record}=await resolve(target,expected);if(record.agent!=='codex')throw new FileError(400,'Permissions are available for Codex sessions.');return codex.setPermissions(record,id);},
  async changes(target:string,expected:string,file?:string){const {record}=await resolve(target,expected);return file?fileDiff(record.cwd,file):changes(record.cwd);},
  async release(target:string,expected:string){const {record,state}=await resolve(target,expected);if(record.agent==='codex')await codex.release(record.id);else stop(state);selected.delete(record.id);return {closed:record.id};},
  accountRequest:(method:string,params?:unknown)=>codex.accountRequest(method,params),
  close(){for(const state of selected.values())stop(state);return codex.close();},
 };
}

export type LocalRunner=ReturnType<typeof createLocalRunner>;
