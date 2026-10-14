import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createTokenUsage,parseTokenLog} from '../../server/src/features/usage/token-usage.ts';
import {createApp} from '../../server/src/app.ts';

const event=(at:string,input:number,output:number,cacheRead=0)=>({type:'event_msg',timestamp:at,payload:{type:'token_count',info:{total_token_usage:{input_tokens:input,output_tokens:output,cached_input_tokens:cacheRead,total_tokens:input+output}}}});
const claude=(id:string,at:string,input:number,output:number)=>({type:'assistant',sessionId:'claude-session',timestamp:at,message:{id,usage:{input_tokens:input,output_tokens:output,cache_read_input_tokens:20,cache_creation_input_tokens:5}}});
async function fixture(t:test.TestContext){const home=await fs.mkdtemp(path.join(os.tmpdir(),'pane-token-'));t.after(()=>fs.rm(home,{recursive:true,force:true}));return home;}
async function log(file:string,rows:unknown[]){await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,rows.map(row=>JSON.stringify(row)).join('\n')+'\n');}

test('Codex cumulative usage yields per-event deltas, skips duplicates and counts cache only once',async t=>{
 const home=await fixture(t),file=path.join(home,'codex.jsonl');
 await log(file,[{type:'session_meta',payload:{id:'session-one'}},event('2030-01-01T10:00:00Z',100,10,40),event('2030-01-01T10:00:01Z',100,10,40),event('2030-01-02T10:00:00Z',180,30,70)]);
 const result=await parseTokenLog(file,'codex');assert.equal(result.entries.length,2);assert.deepEqual(result.entries.map(row=>row.counters),[{input:100,output:10,cacheRead:40,cacheWrite:0,total:110},{input:80,output:20,cacheRead:30,cacheWrite:0,total:100}]);
});
test('Claude message updates are merged; cache contributes to input and total once',async t=>{
 const home=await fixture(t),file=path.join(home,'claude.jsonl');await log(file,[claude('message-one','2030-01-01T10:00:00Z',10,2),claude('message-one','2030-01-01T10:00:01Z',10,8),claude('message-two','2030-01-02T10:00:00Z',15,4)]);
 const result=await parseTokenLog(file,'claude');assert.equal(result.entries.length,2);assert.deepEqual(result.entries[0].counters,{input:35,output:8,cacheRead:20,cacheWrite:5,total:43});
});
test('history includes archives and Claude subagents, deduplicates copies, filters dates and refreshes changed logs',async t=>{
 const home=await fixture(t),codexHome=path.join(home,'codex'),claudeHome=path.join(home,'claude');let clock=1000000;
 const first=[{type:'session_meta',payload:{id:'session-one'}},event('2030-01-01T10:00:00Z',100,10),event('2030-01-02T10:00:00Z',180,30)];
 const file=path.join(codexHome,'sessions','2030','01','01','one.jsonl');await log(file,first);await log(path.join(codexHome,'archived_sessions','copy.jsonl'),first);
 await log(path.join(claudeHome,'projects','project','session','subagents','agent.jsonl'),[claude('message-one','2030-01-02T10:00:00Z',10,8)]);
 const service=createTokenUsage({codexHome,claudeHome,now:()=>clock});const [all,duplicate]=await Promise.all([service.read(),service.read()]);assert.deepEqual(all,duplicate);assert.equal(all.providers[0].counters.total,210);assert.equal(all.providers[0].sessions,1);assert.equal(all.providers[1].counters.total,43);assert.equal(all.providers[2].supported,false);
 const recent=await service.read(Date.parse('2030-01-02T00:00:00Z'));assert.equal(recent.providers[0].counters.total,100);
 await log(file,[...first,event('2030-01-03T10:00:00Z',200,40)]);clock+=30001;assert.equal((await service.read()).providers[0].counters.total,240);
 await assert.rejects(service.read(NaN));assert.equal((await service.read(Date.parse('2040-01-01'))).providers[0].counters.total,0);
});
test('missing log sources remain unavailable instead of claiming zero usage',async t=>{
 const home=await fixture(t);const result=await createTokenUsage({codexHome:path.join(home,'codex'),claudeHome:path.join(home,'claude')}).read();assert.equal(result.providers[0].available,false);assert.equal(result.providers[1].available,false);assert.equal(result.partial,false);
});
test('token history endpoint enforces token authentication and validates start time',async t=>{
 const home=await fixture(t),app=await createApp({initialRoot:home,stateDir:path.join(home,'state'),agentHome:home});await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise<void>(resolve=>app.server.close(()=>resolve())));const address=app.server.address();assert.ok(address&&typeof address!=='string');const url=`http://127.0.0.1:${address.port}/api/token-usage`;
 assert.equal((await fetch(url)).status,403);const headers={'X-AI-Web-Token':app.token};assert.equal((await fetch(url+'?since=invalid',{headers})).status,400);assert.equal((await fetch(url+'?since=-1',{headers})).status,400);assert.equal((await fetch(url,{headers})).status,200);
});
