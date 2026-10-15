import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('notification preload only invokes the handler advertised by the running main process',async()=>{
 const source=readFileSync('desktop/preload.cjs','utf8');
 for(const supported of [false,true]){
  let bridge:any;const calls:string[]=[];
  runInNewContext(source,{process:{platform:'win32',argv:supported?['--pane-notifications=1']:[]},require:()=>({contextBridge:{exposeInMainWorld(_name:string,value:unknown){bridge=value;}},ipcRenderer:{invoke(channel:string){calls.push(channel);return Promise.resolve({status:'sent'});}}})});
  assert.equal(bridge.notificationVersion,supported?1:0);
  const result=await bridge.notify({id:'test',title:'Test',body:'Test',silent:true,allowFocused:true});
  assert.equal(result.status,supported?'sent':'unavailable');assert.deepEqual(calls,supported?['pane:notify']:[]);
 }
});
