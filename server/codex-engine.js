import {spawn} from 'node:child_process';
import {StringDecoder} from 'node:string_decoder';
import {cliBinary} from './cli-binary.js';
import {FileError} from './files.js';
export function createCodexEngine(record,{onNotification=()=>{},onServerRequest=()=>{},onExit=()=>{},launch=spawn}={}){
 let child,next=1,buffer='',closed=false;const pending=new Map(),decoder=new StringDecoder('utf8');
 function fail(message){for(const task of pending.values()){clearTimeout(task.timer);task.reject(new FileError(503,message));}pending.clear();}
 function send(message){if(!child||closed||!child.stdin.writable)throw new FileError(503,'Codex is disconnected. Retry to reconnect.');child.stdin.write(JSON.stringify(message)+'\n');}
 function request(method,params){return new Promise((resolve,reject)=>{const id=next++;const timer=setTimeout(()=>{pending.delete(id);reject(new FileError(504,'Codex took too long to respond. Retry to reconnect.'));},30000);pending.set(id,{resolve,reject,timer});try{send({id,method,params});}catch(error){clearTimeout(timer);pending.delete(id);reject(error);}});}
 function ingest(row){if(row.method){if(row.id!==undefined)onServerRequest(row);else onNotification(row);return;}const task=pending.get(row.id);if(!task)return;clearTimeout(task.timer);pending.delete(row.id);if(row.error){const error=new FileError(/already has an active writer|open(?:ed)? in another app|thread.*already.*(?:locked|in use)/i.test(row.error.message || '')?409:502,row.error.message || 'Codex rejected this request.');error.rpcCode=row.error.code;task.reject(error);}else task.resolve(row.result);}
 const engine={
  request,
  reply(id,result){send({id,result});},reject(id,message){send({id,error:{code:-32601,message}});},
  async start(){
   if(child)return;const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!['CODEX_THREAD_ID','CODEX_SESSION_ID'].includes(key)));
   child=launch(cliBinary('codex'),['app-server','--listen','stdio://'],{cwd:record.cwd,env,windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
   child.stderr.resume();child.stdin.on('error',()=>fail('Codex disconnected. Retry to reconnect.'));
   child.on('error',()=>{closed=true;fail('Could not start Codex. Check that the CLI is installed.');onExit();});child.on('close',()=>{closed=true;fail('Codex disconnected. Retry to reconnect.');onExit();});
   child.stdout.on('data',data=>{buffer+=decoder.write(data);let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);try{ingest(JSON.parse(line));}catch{}}if(buffer.length>16*1024*1024){buffer='';fail('Codex sent an oversized response. Retry to reconnect.');void engine.close();}});
   await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',()=>reject(new FileError(503,'Could not start Codex. Check that the CLI is installed.')));});
   await request('initialize',{clientInfo:{name:'ai_web',title:'AI Web',version:'0.1.0'},capabilities:{experimentalApi:true}});send({method:'initialized'});
  },
  close(){if(!child||closed)return Promise.resolve();closed=true;fail('Codex session closed.');return new Promise(resolve=>{const timer=setTimeout(()=>{if(process.platform==='win32'&&child.pid){const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.on('error',()=>child.kill());}else child.kill('SIGTERM');resolve();},2000);timer.unref();child.once('close',()=>{clearTimeout(timer);resolve();});child.stdin.end();});},
 };
 return engine;
}
