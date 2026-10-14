import { cliBinary } from './cli-binary.js';
import WebSocket from 'ws';
import { Duplex } from 'node:stream';
import { spawn } from 'node:child_process';
import { FileError } from './files.js';
function launch(){return spawn(cliBinary('codex'),['app-server','proxy'],{windowsHide:true,stdio:['pipe','pipe','pipe']});}
export async function codexRequest(method,params) {
 const child=launch();const socket=Duplex.from({readable:child.stdout,writable:child.stdin});
 const ws=new WebSocket('ws://localhost/',{createConnection:()=>socket,handshakeTimeout:6000,maxPayload:4*1024*1024});
 let next=1;const pending=new Map();
 const fail=()=>{for(const task of pending.values())task.reject(new FileError(503,'The running Codex app-server is not reachable. Keep Codex running and try again.'));pending.clear();};
 child.on('error',fail);child.on('exit',fail);child.stderr.resume();ws.on('error',fail);ws.on('close',fail);
 ws.on('message',data=>{try{const message=JSON.parse(data.toString());const task=pending.get(message.id);if(!task)return;pending.delete(message.id);if(message.error)task.reject(new FileError(502,message.error.message || 'Codex rejected the settings change.'));else task.resolve(message.result);}catch{}});
 const request=(name,args)=>new Promise((resolve,reject)=>{const id=next++;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method:name,params:args}),error=>{if(error){pending.delete(id);reject(new FileError(503,'Could not connect to Codex.'));}});});
 const timeout=setTimeout(()=>{fail();ws.terminate();child.kill();},10000);
 try{
  await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);ws.once('close',()=>reject(new FileError(503,'Could not connect to Codex.')));});
  await request('initialize',{clientInfo:{name:'ai_web',title:'AI Web',version:'0.1.0'},capabilities:{experimentalApi:true}});ws.send(JSON.stringify({method:'initialized'}));return await request(method,params);
 }catch(error){throw error instanceof FileError?error:new FileError(503,'Could not reach the running Codex daemon. Try the native model picker in Terminal.');}finally{clearTimeout(timeout);ws.terminate();child.kill();}
}
export function createModelControl({request=codexRequest}={}) {
 let cache,expires=0;
 return {
  async list(){
   if(cache&&Date.now()<expires)return cache;
   const models=[];let cursor;
   do{const response=await request('model/list',{limit:100,includeHidden:false,...(cursor?{cursor}:{})});models.push(...response.data);cursor=response.nextCursor;}while(cursor&&models.length<500);
   cache=models.map(model=>({id:model.model || model.id,name:model.displayName || model.model,defaultEffort:model.defaultReasoningEffort,efforts:(model.supportedReasoningEfforts || []).map(effort=>({value:effort.reasoningEffort,description:effort.description}))}));expires=Date.now()+60000;return cache;
  },
  async validate(model,effort){
   const selected=(await this.list()).find(item=>item.id===model);if(!selected)throw new FileError(400,'Choose an available model.');
   if(selected.efforts.length&&!selected.efforts.some(item=>item.value===effort))throw new FileError(400,'This reasoning effort is not supported by that model.');
   return {model,effort:selected.efforts.length?effort:null};
  },
  async update(threadId,model,effort){const result=await this.validate(model,effort);await request('thread/settings/update',{threadId,model,...(result.effort?{effort:result.effort}:{})});return result;
  },
 };
}
