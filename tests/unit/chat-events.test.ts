import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createChatNormalizer,foldChatEvent,historyEvents,toolOutput} from '../../server/src/features/claude-chat/chat-events.ts';
import type {ChatEvent} from '../../shared/contracts.ts';

test('streamed text deltas and the final assistant message share one row',()=>{
 const normalize=createChatNormalizer(),log:ChatEvent[]=[];
 const frames=[
  {type:'stream_event',parent_tool_use_id:null,event:{type:'message_start',message:{id:'msg_1'}}},
  {type:'stream_event',parent_tool_use_id:null,event:{type:'content_block_delta',delta:{type:'text_delta',text:'Hel'}}},
  {type:'stream_event',parent_tool_use_id:null,event:{type:'content_block_delta',delta:{type:'text_delta',text:'lo'}}},
  {type:'assistant',parent_tool_use_id:null,message:{id:'msg_1',content:[{type:'text',text:'Hello'}]}},
 ];
 for(const frame of frames)for(const event of normalize(frame))foldChatEvent(log,event);
 assert.deepEqual(log,[{type:'text',id:'msg_1',text:'Hello',final:true}]);
});

test('a tool call becomes done when its result arrives, and errors are marked',()=>{
 const normalize=createChatNormalizer(),log:ChatEvent[]=[];
 const frames=[
  {type:'assistant',parent_tool_use_id:null,message:{id:'m',content:[{type:'tool_use',id:'t1',name:'Bash',input:{command:'ls'}},{type:'tool_use',id:'t2',name:'Read',input:{file_path:'x'}}]}},
  {type:'user',parent_tool_use_id:null,message:{content:[{type:'tool_result',tool_use_id:'t1',content:[{type:'text',text:'a.txt'}]},{type:'tool_result',tool_use_id:'t2',is_error:true,content:'missing'}]}},
 ];
 for(const frame of frames)for(const event of normalize(frame))foldChatEvent(log,event);
 assert.deepEqual(log,[
  {type:'tool',id:'t1',name:'Bash',input:{command:'ls'},status:'done',output:'a.txt'},
  {type:'tool',id:'t2',name:'Read',input:{file_path:'x'},status:'error',output:'missing'},
 ]);
});

test('subagent messages stay out of the transcript',()=>{
 const normalize=createChatNormalizer();
 assert.deepEqual(normalize({type:'assistant',parent_tool_use_id:'t1',message:{id:'s',content:[{type:'text',text:'inner'}]}}),[]);
 assert.deepEqual(normalize({type:'stream_event',parent_tool_use_id:'t1',event:{type:'content_block_delta',delta:{type:'text_delta',text:'x'}}}),[]);
});

test('a result frame reports idle, or the error and cost',()=>{
 const normalize=createChatNormalizer();
 assert.deepEqual(normalize({type:'result',subtype:'success',is_error:false,total_cost_usd:0.5}),[{type:'status',state:'idle',costUsd:0.5}]);
 assert.deepEqual(normalize({type:'result',subtype:'error_during_execution',is_error:true,result:'boom'}),[{type:'status',state:'error',message:'boom'}]);
});

test('only the latest status is kept and a resolved permission disappears',()=>{
 const log:ChatEvent[]=[];
 foldChatEvent(log,{type:'status',state:'working'});
 foldChatEvent(log,{type:'permission',id:'p',tool:'Bash',input:{}});
 foldChatEvent(log,{type:'status',state:'idle'});
 foldChatEvent(log,{type:'permission-done',id:'p'});
 assert.deepEqual(log,[{type:'status',state:'idle'}]);
});

test('long tool output is capped',()=>{
 const output=toolOutput('x'.repeat(30_000));
 assert.ok(output.length<20_100);assert.match(output,/10000 more characters/);
});

test('a saved transcript becomes the chat history, without tool results or CLI notes as messages',async()=>{
 const {historyEvents}=await import('../../server/src/features/claude-chat/chat-events.ts');
 const log=historyEvents([
  {type:'user',uuid:'u0',message:{role:'user',content:'<system-reminder>ignore</system-reminder>'}},
  {type:'user',uuid:'u1',message:{role:'user',content:'list files'}},
  {type:'assistant',uuid:'a1',message:{id:'m1',content:[{type:'text',text:'Sure'},{type:'tool_use',id:'t1',name:'Bash',input:{command:'ls'}}]}},
  {type:'user',uuid:'u2',message:{role:'user',content:[{type:'tool_result',tool_use_id:'t1',content:'a.txt'}]}},
  {type:'assistant',uuid:'a2',message:{id:'m2',content:[{type:'text',text:'Done'}]}},
  {type:'assistant',uuid:'s1',parent_tool_use_id:'t9',message:{id:'m3',content:[{type:'text',text:'subagent'}]}},
 ]);
 assert.deepEqual(log,[
  {type:'user',id:'u1',text:'list files'},
  {type:'text',id:'m1',text:'Sure',final:true},
  {type:'tool',id:'t1',name:'Bash',input:{command:'ls'},status:'done',output:'a.txt'},
  {type:'text',id:'m2',text:'Done',final:true},
 ]);
});

test('edits and writes are shown as removed and added lines',async()=>{
 const {toolDiff}=await import('../../client/src/features/chat/chat-format.ts');
 assert.deepEqual(toolDiff('Edit',{old_string:'a\nb',new_string:'c'}),[{kind:'del',text:'a'},{kind:'del',text:'b'},{kind:'add',text:'c'}]);
 assert.deepEqual(toolDiff('Write',{content:'x\n'}),[{kind:'add',text:'x'}]);
 assert.equal(toolDiff('Bash',{command:'ls'}),null);
 const long=toolDiff('Write',{content:Array.from({length:300},(_,i)=>`l${i}`).join('\n')})!;
 assert.equal(long.length,161);assert.equal(long.at(-1)!.kind,'note');
});

test('a tab name is derived from the first prompt the way Orca does it',async()=>{
 const {chatTitle}=await import('../../client/src/features/chat/chat-format.ts');
 assert.equal(chatTitle('can you please fix the login redirect. It loops'),'Fix the login redirect');
 assert.equal(chatTitle('Look at https://example.com/a_b and `summarize` it'),'Look at and summarize it');
 assert.equal(chatTitle('Issue #12: crash on startup'),'Crash on startup');
 assert.equal(chatTitle('x'.repeat(80)).length,40);
 assert.equal(chatTitle('   '),'Claude');
});

test('a resumed transcript gets its "Worked for" row back from the log timestamps',()=>{
 const saved=[
  {type:'user',uuid:'u1',message:{role:'user',content:'hello'}},
  {type:'assistant',uuid:'a1',message:{role:'assistant',content:[{type:'text',text:'working'}]}},
  {type:'assistant',uuid:'a2',message:{role:'assistant',content:[{type:'text',text:'done'}]}},
 ];
 const log=historyEvents(saved,new Map([['u1',1000],['a1',4000],['a2',9000]]));
 const turn=log.find(event=>event.type==='turn');
 assert.ok(turn&&turn.type==='turn');assert.equal(turn.ms,8000);assert.equal(turn.at,9000);
 assert.equal(historyEvents(saved).some(event=>event.type==='turn'),false);
});

test('a rate_limit_event becomes a limit event; utilization as a fraction or a percent, reset in ms',()=>{
 const normalize=createChatNormalizer();
 const frame=(utilization:number,resetsAt:number)=>({type:'rate_limit_event',rate_limit_info:{status:'allowed',rateLimitType:'five_hour',utilization,resetsAt}});
 assert.deepEqual(normalize(frame(0.37,1_800_000_000)),[{type:'limit',window:'five_hour',usedPercent:37,resetsAt:1_800_000_000_000}]);
 assert.deepEqual(normalize(frame(72,1_800_000_000_000)),[{type:'limit',window:'five_hour',usedPercent:72,resetsAt:1_800_000_000_000}]);
 assert.deepEqual(normalize({type:'rate_limit_event',rate_limit_info:{status:'allowed',rateLimitType:'overage',utilization:0.5}}),[]);
 const log:ChatEvent[]=[];foldChatEvent(log,{type:'limit',window:'five_hour',usedPercent:1,resetsAt:null});foldChatEvent(log,{type:'limit',window:'five_hour',usedPercent:2,resetsAt:null});
 assert.equal(log.length,1);
});
