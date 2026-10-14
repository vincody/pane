import {spawn, type ChildProcessWithoutNullStreams} from 'node:child_process';
import {StringDecoder} from 'node:string_decoder';
import {cliBinary} from '../../lib/cli-binary.ts';
import {FileError} from '../files/files.ts';
export interface CodexMessage {id?:string|number;method?:string;params?:unknown;result?:unknown;error?:{message?:string;code?:number};}
export interface CodexEngineOptions {onNotification?:(message:CodexMessage)=>void;onServerRequest?:(message:CodexMessage)=>void;onExit?:()=>void;launch?:typeof spawn;}
export interface CodexEngine {request:(method:string,params?:unknown)=>Promise<unknown>;reply:(id:string|number,result:unknown)=>void;reject:(id:string|number,message:string)=>void;start:()=>Promise<void>;close:()=>Promise<void>;}
interface PendingRequest {resolve:(value:unknown)=>void;reject:(reason:unknown)=>void;timer:ReturnType<typeof setTimeout>;}
export function createCodexEngine(record:{cwd:string},{onNotification=()=>{},onServerRequest=()=>{},onExit=()=>{},launch=spawn}:CodexEngineOptions={}):CodexEngine{
 let child:ChildProcessWithoutNullStreams|undefined,next=1,buffer='',closed=false;const pending=new Map<string|number,PendingRequest>(),decoder=new StringDecoder('utf8');
 function fail(message:string){for(const task of pending.values()){clearTimeout(task.timer);task.reject(new FileError(503,message));}pending.clear();}
 function send(message:CodexMessage){if(!child||closed||!child.stdin.writable)throw new FileError(503,'Codex is disconnected. Retry to reconnect.');child.stdin.write(JSON.stringify(message)+'\n');}
 function request(method:string,params?:unknown){return new Promise<unknown>((resolve,reject)=>{const id=next++;const timer=setTimeout(()=>{pending.delete(id);reject(new FileError(504,'Codex took too long to respond. Retry to reconnect.'));},30000);pending.set(id,{resolve,reject,timer});try{send({id,method,params});}catch(error){clearTimeout(timer);pending.delete(id);reject(error);}});}
 function ingest(row:CodexMessage){if(row.method){if(row.id!==undefined)onServerRequest(row);else onNotification(row);return;}if(row.id===undefined)return;const task=pending.get(row.id);if(!task)return;clearTimeout(task.timer);pending.delete(row.id);if(row.error){const error=Object.assign(new FileError(/already has an active writer|open(?:ed)? in another app|thread.*already.*(?:locked|in use)/i.test(row.error.message || '')?409:502,row.error.message || 'Codex rejected this request.'),{rpcCode:row.error.code});task.reject(error);}else task.resolve(row.result);}
 const engine:CodexEngine={
  request,
  reply(id,result){send({id,result});},reject(id,message){send({id,error:{code:-32601,message}});},
  async start(){
   if(child)return;const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!['CODEX_THREAD_ID','CODEX_SESSION_ID'].includes(key)));
   child=launch(cliBinary('codex'),['app-server','--listen','stdio://'],{cwd:record.cwd,env,windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
   child.stderr.resume();child.stdin.on('error',()=>fail('Codex disconnected. Retry to reconnect.'));
   child.on('error',()=>{closed=true;fail('Could not start Codex. Check that the CLI is installed.');onExit();});child.on('close',()=>{closed=true;fail('Codex disconnected. Retry to reconnect.');onExit();});
   child.stdout.on('data',(data:Buffer)=>{buffer+=decoder.write(data);let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);try{ingest(JSON.parse(line) as CodexMessage);}catch{}}if(buffer.length>16*1024*1024){buffer='';fail('Codex sent an oversized response. Retry to reconnect.');void engine.close();}});
   const started=child;await new Promise<void>((resolve,reject)=>{started.once('spawn',resolve);started.once('error',()=>reject(new FileError(503,'Could not start Codex. Check that the CLI is installed.')));});
   await request('initialize',{clientInfo:{name:'ai_web',title:'AI Web',version:'0.1.0'},capabilities:{experimentalApi:true}});send({method:'initialized'});
  },
  close(){if(!child||closed)return Promise.resolve();const running=child;closed=true;fail('Codex session closed.');return new Promise<void>(resolve=>{const timer=setTimeout(()=>{if(process.platform==='win32'&&running.pid){const killer=spawn('taskkill.exe',['/PID',String(running.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.on('error',()=>running.kill());}else running.kill('SIGTERM');resolve();},2000);timer.unref();running.once('close',()=>{clearTimeout(timer);resolve();});running.stdin.end();});},
 };
 return engine;
}
