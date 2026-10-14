import test from 'node:test';
import assert from 'node:assert/strict';
import {createCodexSessions} from '../server/codex-sessions.js';
import {fakeCodexFactory} from './helpers/codex-engine.js';
const record={id:'test',agent_session:{value:'31a12b4c-fe47-7312-80a2-4b55c3540085'},cwd:process.cwd()};
test('native writer conflict blocks even idle sessions; retry acquires once without sending a turn',async()=>{
 let busy=true;const calls=[];const sessions=createCodexSessions({engineFactory:fakeCodexFactory({busy:()=>busy,calls})});const [a,b]=await Promise.all([sessions.open(record),sessions.open(record)]);assert.equal(a.connection,'busy');assert.equal(b.connection,'busy');assert.equal(calls.filter(call=>call.method==='start').length,1);await assert.rejects(sessions.input(record,{type:'prompt',value:'No'}),e=>e.status===409);busy=false;assert.equal(sessions.state(record.id).connection,'busy');await sessions.open(record);assert.equal(sessions.state(record.id).connection,'ready');assert.equal(calls.filter(call=>call.method==='turn/start').length,0);await sessions.open(record);assert.equal(calls.filter(call=>call.method==='start').length,2);await sessions.release(record.id);assert.equal(sessions.state(record.id).connection,'closed');
});
test('owned turns reuse the engine, route explicit approvals/questions, and never approve an unsupported request',async()=>{
 const calls=[],controls=[];const sessions=createCodexSessions({engineFactory:fakeCodexFactory({calls,controls})});await sessions.open(record);await sessions.input(record,{type:'prompt',value:'Build'});const callback=controls[0].handlers;callback.onServerRequest({id:7,method:'item/commandExecution/requestApproval',params:{threadId:record.agent_session.value,command:'npm test'}});assert.equal(sessions.state(record.id).question.detail,'npm test');assert.equal(calls.some(call=>call.method==='reply'),false);await sessions.input(record,{type:'text',value:'deny'});await sessions.input(record,{type:'key',value:'enter'});assert.deepEqual(calls.find(call=>call.id===7).result,{decision:'decline'});
 callback.onServerRequest({id:10,method:'item/commandExecution/requestApproval',params:{threadId:record.agent_session.value,command:'git push',availableDecisions:['accept','acceptForSession','decline']}});assert.equal(sessions.state(record.id).question.options.length,3);await sessions.input(record,{type:'text',value:'acceptForSession'});await sessions.input(record,{type:'key',value:'enter'});assert.deepEqual(calls.find(call=>call.id===10).result,{decision:'acceptForSession'});
 callback.onServerRequest({id:8,method:'item/tool/requestUserInput',params:{threadId:record.agent_session.value,questions:[{id:'one',question:'First?',options:[{label:'A'}]},{id:'two',question:'Second?',options:[{label:'B'}]}]}});await sessions.input(record,{type:'text',value:'A'});await sessions.input(record,{type:'key',value:'enter'});assert.equal(sessions.state(record.id).question.title,'Second?');await sessions.input(record,{type:'text',value:'B'});await sessions.input(record,{type:'key',value:'enter'});assert.deepEqual(calls.find(call=>call.id===8).result,{answers:{one:{answers:['A']},two:{answers:['B']}}});callback.onServerRequest({id:9,method:'item/permissions/requestApproval',params:{threadId:record.agent_session.value}});assert.equal(calls.find(call=>call.id===9).method,'reject');await sessions.input(record,{type:'key',value:'ctrl+c'});assert.equal(sessions.state(record.id).working,false);assert.equal(calls.filter(call=>call.method==='start').length,1);await sessions.close();
});


test('native command events stream output without adding chunk separators and finish with exit status',async()=>{
 const controls=[];const sessions=createCodexSessions({engineFactory:fakeCodexFactory({controls})});await sessions.open(record);const notify=controls[0].handlers.onNotification;notify({method:'item/started',params:{threadId:record.agent_session.value,turnId:'one',item:{id:'command',type:'commandExecution',command:'npm test',status:'inProgress'}}});notify({method:'item/commandExecution/outputDelta',params:{threadId:record.agent_session.value,itemId:'command',delta:'Hel'}});notify({method:'item/commandExecution/outputDelta',params:{threadId:record.agent_session.value,itemId:'command',delta:'lo'}});assert.equal(sessions.state(record.id).messages[0].output,'Hello');notify({method:'item/completed',params:{threadId:record.agent_session.value,turnId:'one',item:{id:'command',type:'commandExecution',command:'npm test',status:'failed',aggregatedOutput:'Tests failed',exitCode:1}}});const action=sessions.state(record.id).messages[0];assert.equal(action.status,'failed');assert.equal(action.output,'Tests failed');assert.equal(action.exitCode,1);await sessions.close();
});

test('an async Codex question becomes a choice after the turn and sends the selected answer in a new turn',async()=>{
 const calls=[],controls=[];const sessions=createCodexSessions({engineFactory:fakeCodexFactory({calls,controls})});await sessions.open(record);await sessions.input(record,{type:'prompt',value:'Ask me to choose'});
 const notify=controls[0].handlers.onNotification;const item={id:'async-choice',type:'agentMessage',delivery:'async',questions:[{title:'Continue or stop?',options:['Continue','Stop']}],text:'Continue or stop?\n- Continue\n- Stop'};
 notify({method:'item/agentMessage/delta',params:{threadId:record.agent_session.value,itemId:item.id,delta:item.text}});
 notify({method:'item/completed',params:{threadId:record.agent_session.value,item}});
 assert.equal(sessions.state(record.id).question,null,'wait for the active turn to finish');
 notify({method:'turn/completed',params:{threadId:record.agent_session.value,turn:{id:'completed-turn',status:'completed'}}});
 assert.deepEqual(sessions.state(record.id).question,{title:'Continue or stop?',async:true,options:[{value:'Continue',label:'Continue'},{value:'Stop',label:'Stop'}]});
 assert.equal(sessions.state(record.id).messages.some(message=>message.text===item.text),false,'do not render a duplicate plain-text choice');
 await sessions.input(record,{type:'text',value:'Continue'});await sessions.input(record,{type:'key',value:'enter'});
 assert.equal(calls.filter(call=>call.method==='turn/start').length,2);assert.equal(calls.filter(call=>call.method==='turn/start').at(-1).params.input[0].text,'Continue');assert.equal(sessions.state(record.id).question,null);await sessions.close();
});

test('async Codex question accepts an answer outside the offered options',async()=>{
 const calls=[],controls=[];const sessions=createCodexSessions({engineFactory:fakeCodexFactory({calls,controls})});await sessions.open(record);const notify=controls[0].handlers.onNotification;
 notify({method:'item/completed',params:{threadId:record.agent_session.value,item:{id:'custom-choice',type:'agentMessage',delivery:'async',questions:[{title:'Choose one',options:['a','b']}],text:'Choose one'}}});
 await sessions.input(record,{type:'text',value:'my own option'});await sessions.input(record,{type:'key',value:'enter'});
 assert.equal(calls.find(call=>call.method==='turn/start').params.input[0].text,'my own option');await sessions.close();
});

test('Codex permissions use allowed profiles and update the native thread for later turns',async()=>{
 const calls=[];const sessions=createCodexSessions({engineFactory:fakeCodexFactory({calls})});await sessions.open(record);
 const profiles=await sessions.permissions(record);assert.equal(profiles.current,':workspace');assert.equal(profiles.profiles.length,3);
 await assert.rejects(sessions.setPermissions(record,':danger-full-access'),error=>error.status===400);
 await sessions.setPermissions(record,':read-only');assert.deepEqual(calls.find(call=>call.method==='thread/settings/update').params,{threadId:record.agent_session.value,permissions:':read-only'});assert.equal(sessions.state(record.id).metadata.permissions,':read-only');assert.equal(sessions.state(record.id).metadata.access,'readOnly');await sessions.close();
});
