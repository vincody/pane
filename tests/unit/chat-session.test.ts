import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createChatSession} from '../../server/src/features/claude-chat/chat-session.ts';
import type {ChatEvent} from '../../shared/contracts.ts';

/** A stand-in for the Agent SDK: replies to each user message with scripted frames. */
function fakeQuery(script:(text:string,options:any)=>Promise<unknown[]>|unknown[]){
 const captured:{options?:any;interrupts:number;models:string[];modes:string[]}={interrupts:0,models:[],modes:[]};
 const query=((params:any)=>{
  captured.options=params.options;
  const iterator=params.prompt[Symbol.asyncIterator]();
  const run={
   async *[Symbol.asyncIterator](){
    yield {type:'system',subtype:'init',model:'claude-test',session_id:'s'};
    for(;;){
     const next=await iterator.next();if(next.done)return;
     for(const frame of await script(String(next.value.message.content),params.options))yield frame;
    }
   },
   async interrupt(){captured.interrupts++;},async setModel(model:string){captured.models.push(model);},async setPermissionMode(mode:string){captured.modes.push(mode);},
   async supportedModels(){return [{value:'sonnet',displayName:'Sonnet',description:'fast'}];},close(){},
  };
  return run;
 }) as any;
 return {query,captured};
}
const wait=async(ok:()=>boolean)=>{for(let i=0;i<200&&!ok();i++)await new Promise(resolve=>setTimeout(resolve,5));assert.ok(ok(),'timed out');};

test('a message goes in, the reply is replayed, and the turn ends idle',async()=>{
 const {query}=fakeQuery(text=>[{type:'assistant',parent_tool_use_id:null,message:{id:'m1',content:[{type:'text',text:`echo ${text}`}]}},{type:'result',subtype:'success',is_error:false}]);
 const session=createChatSession({cwd:process.cwd(),query});
 const seen:ChatEvent[]=[];session.subscribe(event=>seen.push(event));
 await wait(()=>session.state==='idle');
 session.send('hi');
 assert.equal(session.state,'working');
 assert.throws(()=>session.send('again'),/still working/);
 await wait(()=>session.state==='idle'&&session.snapshot().some(event=>event.type==='text'));
 const types=session.snapshot().map(event=>event.type);
 assert.deepEqual(types,['user','text','turn','status']);
 assert.equal((session.snapshot()[1] as {text:string}).text,'echo hi');
 assert.equal(session.model,'claude-test');
 await session.close();
});

test('a permission request waits for an answer and "always" passes the suggestions back',async()=>{
 let verdict:unknown;
 const {query}=fakeQuery(async(_text,options)=>{
  verdict=await options.canUseTool('Bash',{command:'ls'},{signal:new AbortController().signal,suggestions:[{type:'addRules'}],toolUseID:'tool-1'});
  return [{type:'result',subtype:'success',is_error:false}];
 });
 const session=createChatSession({cwd:process.cwd(),query});
 await wait(()=>session.state==='idle');
 session.send('run it');
 await wait(()=>session.snapshot().some(event=>event.type==='permission'));
 assert.equal(session.answer('missing','allow'),false);
 assert.equal(session.answer('tool-1','always'),true);
 await wait(()=>session.state==='idle'&&verdict!==undefined);
 assert.deepEqual(verdict,{behavior:'allow',updatedInput:{command:'ls'},updatedPermissions:[{type:'addRules'}]});
 assert.ok(!session.snapshot().some(event=>event.type==='permission'));
 await session.close();
});

test('stopping denies a pending request and interrupts the run; closing denies too',async()=>{
 let verdict:any;
 const {query,captured}=fakeQuery(async(_text,options)=>{verdict=await options.canUseTool('Edit',{},{signal:new AbortController().signal,toolUseID:'t'});return [{type:'result',subtype:'success',is_error:false}];});
 const session=createChatSession({cwd:process.cwd(),query});
 await wait(()=>session.state==='idle');
 session.send('edit');await wait(()=>session.snapshot().some(event=>event.type==='permission'));
 await session.interrupt();
 await wait(()=>verdict!==undefined);
 assert.equal(verdict.behavior,'deny');assert.equal(captured.interrupts,1);
 await session.close();
});

test('model, permission mode and a resumed session id reach the SDK',async()=>{
 const {query,captured}=fakeQuery(()=>[]);
 const id='123e4567-e89b-12d3-a456-426614174000';
 const session=createChatSession({cwd:process.cwd(),query,sessionId:id,resume:true,model:'opus',permissionMode:'acceptEdits'});
 await wait(()=>session.state==='idle');
 assert.equal(captured.options.resume,id);assert.equal(captured.options.sessionId,undefined);
 assert.equal(captured.options.model,'opus');assert.equal(captured.options.permissionMode,'acceptEdits');
 assert.equal(captured.options.env.CLAUDECODE,undefined);
 await session.setModel('sonnet');await session.setPermissionMode('plan');
 assert.deepEqual([captured.models,captured.modes],[['sonnet'],['plan']]);
 assert.equal(session.permissionMode,'plan');
 assert.deepEqual(await session.models(),[{value:'sonnet',displayName:'Sonnet',description:'fast'}]);
 await session.close();
});

test('saved model and effort are applied at spawn, changes are persisted, and the CLI-applied settings are reported',async()=>{
 const {query,captured}=fakeQuery(()=>[]);
 const run=query as any;
 const saved:any[]=[];
 const wrapped=((params:any)=>{const instance=run(params);instance.getSettings=async()=>({applied:{model:'claude-test',effort:'high',ultracode:false}});instance.applyFlagSettings=async()=>{};return instance;}) as any;
 const session=createChatSession({cwd:process.cwd(),query:wrapped,model:'sonnet',effort:'low',onPrefs:patch=>saved.push(patch)});
 const seen:ChatEvent[]=[];session.subscribe(event=>seen.push(event));
 await wait(()=>seen.some(event=>event.type==='status'&&event.effort==='high'));
 assert.equal(captured.options.model,'sonnet');assert.equal(captured.options.effort,'low');
 await session.setEffort('medium');
 assert.deepEqual(saved,[{effort:'medium'}]);
 await session.close();
});

test('the prefs store keeps only valid values per conversation and survives a restart',async()=>{
 const {createChatPrefs}=await import('../../server/src/features/claude-chat/chat-prefs.ts');
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'chat-prefs-'));
 const store=await createChatPrefs(dir);
 store.set('a',{model:'sonnet',effort:'high',permissionMode:'plan'});store.set('a',{effort:'bogus' as any,ultracode:true});
 await store.flush();
 const again=await createChatPrefs(dir);
 assert.deepEqual(again.get('a'),{model:'sonnet',effort:'high',permissionMode:'plan',ultracode:true});
 assert.deepEqual(again.get('missing'),{});
 await fs.rm(dir,{recursive:true,force:true});
});

test('resuming an old, large session warns about its cost, and the first message clears the warning',async()=>{
 const {query}=fakeQuery(()=>[]);
 const withUsage=((params:any)=>Object.assign(query(params),{async getContextUsage(){return {totalTokens:400_000,coldResumeQuota:{percentPerMillionTokens:20,minPercent:1}};}})) as any;
 const seen:ChatEvent[]=[];
 const make=(lastModified:number)=>createChatSession({cwd:process.cwd(),query:withUsage,sessionId:'123e4567-e89b-12d3-a456-426614174000',resume:true,history:async()=>[],info:async()=>({lastModified})});
 const old=make(Date.now()-3_600_000);old.subscribe(event=>seen.push(event));
 await old.loaded;await new Promise(resolve=>setTimeout(resolve,50));
 assert.deepEqual(seen.find(event=>event.type==='resume-cost'),{type:'resume-cost',tokens:400_000,percent:8,inactiveMs:seen.find((event:any)=>event.type==='resume-cost')!.type==='resume-cost'?(seen.find((event:any)=>event.type==='resume-cost') as any).inactiveMs:0});
 old.send('hello');
 assert.equal(old.snapshot().some(event=>event.type==='resume-cost'),false);
 await old.close();
 const fresh=make(Date.now()-60_000),fed:ChatEvent[]=[];fresh.subscribe(event=>fed.push(event));
 await fresh.loaded;await new Promise(resolve=>setTimeout(resolve,50));
 assert.equal(fed.some(event=>event.type==='resume-cost'),false);
 await fresh.close();
});

test('answers to a question reach Claude inside the tool input',async()=>{
 let ask:((tool:string,input:any,meta:any)=>Promise<any>)|undefined;
 const {query}=fakeQuery(()=>[]);
 const capture=((params:any)=>{ask=params.options.canUseTool;return query(params);}) as any;
 const session=createChatSession({cwd:process.cwd(),query:capture});
 const pending=ask!('AskUserQuestion',{questions:[{question:'Pick?',options:[]}]},{signal:new AbortController().signal,toolUseID:'q1'});
 assert.equal(session.answer('q1','allow',{'Pick?':'A'}),true);
 const result=await pending;
 assert.equal(result.behavior,'allow');assert.deepEqual(result.updatedInput.answers,{'Pick?':'A'});
 assert.equal(result.updatedInput.questions.length,1);
 await session.close();
});
