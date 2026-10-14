import test from 'node:test';
import assert from 'node:assert/strict';
import { toolActions, resultState, polledExecutions, commandOutput } from '../server/agent-actions.ts';
import { parseSession, type ParsedSession, type SessionAction } from '../server/session-parser.ts';
function actionsOf(parsed: ParsedSession): SessionAction[] { return parsed.messages.map(message => { assert.equal(message.kind, 'action'); assert.ok(message.kind === 'action'); return message; }); }

test('known tools provide factual edit/write/run labels without evaluating orchestration code',()=>{
 assert.deepEqual(toolActions('Bash',{command:'npm test'}),[{action:'run',target:'npm test'}]);
 assert.deepEqual(toolActions('Edit',{file_path:'src/main.js'}),[{action:'edit',target:'src/main.js'}]);
 assert.deepEqual(toolActions('Write',{file_path:'README.md',content:'not exposed'}),[{action:'write',target:'README.md'}]);
 assert.deepEqual(toolActions('apply_patch','*** Begin Patch\n*** Add File: new.js\n+hi\n*** Update File: old.js\n@@\n-hi\n+hello\n*** End Patch'),[{action:'write',target:'new.js'},{action:'edit',target:'old.js'}]);
 const source='text(await tools.exec_command({cmd:'+JSON.stringify('npm test\nnode check.js')+',workdir:"repo"}));';
 assert.deepEqual(toolActions('exec',source),[{action:'run',target:'npm test\nnode check.js'}]);
 assert.deepEqual(toolActions('unknown_tool',{command:'not a known shell'}),[]);
 assert.equal(resultState('{"exit_code":1}'),'failed');assert.equal(resultState('{"session_id":123}'),'running');
});
test('Codex and Claude tool results correlate with actions while reasoning and raw payloads stay out of chat',()=>{
 const codex=[{type:'response_item',payload:{type:'function_call',call_id:'call1',name:'exec_command',arguments:JSON.stringify({cmd:'npm test'})}},{type:'response_item',payload:{type:'function_call_output',call_id:'call1',output:'{"exit_code":0,"secret_output":"not exposed"}'}},{type:'response_item',payload:{type:'reasoning',summary:[{text:'hidden'}]}}];
 const parsed=parseSession(codex.map(row=>JSON.stringify(row)).join('\n'),'codex');const parsedActions=actionsOf(parsed);assert.equal(parsedActions[0].action,'run');assert.equal(parsedActions[0].status,'done');assert.equal(JSON.stringify(parsed).includes('secret_output'),false);
 const claude=[{message:{role:'assistant',content:[{type:'tool_use',id:'tool1',name:'Write',input:{file_path:'test.js',content:'private file body'}}]}},{message:{role:'user',content:[{type:'tool_result',tool_use_id:'tool1',content:'ok'}]}}];
 const action=actionsOf(parseSession(claude.map(row=>JSON.stringify(row)).join('\n'),'claude'))[0];assert.equal(action.action,'write');assert.equal(action.status,'done');assert.equal(JSON.stringify(action).includes('private file body'),false);
});


test('a later terminal poll completes the original run rather than leaving it running forever',()=>{
 const rows=[{type:'response_item',payload:{type:'function_call',call_id:'run',name:'exec_command',arguments:'{"cmd":"npm test"}'}},{type:'response_item',payload:{type:'function_call_output',call_id:'run',output:'{"session_id":123}'}},{type:'response_item',payload:{type:'custom_tool_call',call_id:'poll',name:'exec',input:'text(await tools.write_stdin({session_id:123,chars:""}));'}},{type:'response_item',payload:{type:'custom_tool_call_output',call_id:'poll',output:'{"exit_code":0}'}}];
 const messages=actionsOf(parseSession(rows.map(row=>JSON.stringify(row)).join('\n'),'codex'));
 assert.equal(messages.length,1);assert.equal(messages[0].status,'done');
});


test('a mixed orchestration call completes both a new command and the previous command it polls',()=>{
 const rows=[{type:'response_item',payload:{type:'function_call',call_id:'build',name:'exec_command',arguments:'{"cmd":"npm run build"}'}},{type:'response_item',payload:{type:'function_call_output',call_id:'build',output:'{"session_id":84577}'}},{type:'response_item',payload:{type:'custom_tool_call',call_id:'mixed',name:'exec',input:'text(await tools.exec_command({cmd:"npm test"})); text(await tools.write_stdin({session_id:84577,chars:""}));'}},{type:'response_item',payload:{type:'custom_tool_call_output',call_id:'mixed',output:'[{"exit_code":0},{"exit_code":0}]'}}];
 const actions=actionsOf(parseSession(rows.map(row=>JSON.stringify(row)).join('\n'),'codex'));assert.deepEqual(actions.map(action=>[action.target,action.status]),[['npm run build','done'],['npm test','done']]);
});

test('direct terminal polling preserves the actual failed exit status',()=>{
 const rows=[{type:'response_item',payload:{type:'function_call',call_id:'run',name:'exec_command',arguments:'{"cmd":"npm test"}'}},{type:'response_item',payload:{type:'function_call_output',call_id:'run',output:'{"session_id":123}'}},{type:'response_item',payload:{type:'function_call',call_id:'poll',name:'write_stdin',arguments:'{"session_id":123}'}},{type:'response_item',payload:{type:'function_call_output',call_id:'poll',output:'{"exit_code":1}'}}];assert.equal(actionsOf(parseSession(rows.map(row=>JSON.stringify(row)).join('\n'),'codex'))[0].status,'failed');
});


test('poll examples embedded inside a shell command never reopen a completed real command',()=>{
 const example='text(await tools.write_stdin({session_id:84577,chars:""}));';const input='text(await tools.exec_command({cmd:'+JSON.stringify('write a test fixture: '+example)+'}));';
 assert.deepEqual(polledExecutions('exec',input),[]);assert.deepEqual(polledExecutions('exec',input+' '+example),['84577']);assert.deepEqual(polledExecutions('wait',{cell_id:'62'}),['62']);
});


test('command output extracts stdout and stderr, preserves JSON output, strips terminal escapes, and excludes metadata',()=>{
 assert.equal(commandOutput({exit_code:0,output:'{"value":42}',secret_output:'private metadata'}).text,'{"value":42}');assert.equal(commandOutput([{type:'text',text:'{"exit_code":0,"output":"hello"}'}]).text,'hello');assert.equal(commandOutput('Chunk ID: test\nWall time: 1s\nOutput:\nhello').text,'hello');assert.equal(commandOutput({stdout:'ok',stderr:'error'}).text,'ok\nerror');assert.equal(commandOutput({output:'\u001b[31merror\u001b[0m'}).text,'error');const huge=commandOutput({output:'x'.repeat(17000)});assert.equal(huge.text.length,16000);assert.equal(huge.truncated,true);assert.equal(commandOutput({exit_code:0,secret_output:'private'}).available,false);
});

test('command output appends later process results and clearly labels a shared batch result',()=>{
 const rows=[{type:'response_item',payload:{type:'function_call',call_id:'run',name:'exec_command',arguments:'{"cmd":"npm test"}'}},{type:'response_item',payload:{type:'function_call_output',call_id:'run',output:'{"session_id":123,"output":"Starting tests"}'}},{type:'response_item',payload:{type:'function_call',call_id:'poll',name:'write_stdin',arguments:'{"session_id":123}'}},{type:'response_item',payload:{type:'function_call_output',call_id:'poll',output:'{"exit_code":0,"output":"All tests passed"}'}}];const action=actionsOf(parseSession(rows.map(row=>JSON.stringify(row)).join('\n'),'codex'))[0];assert.equal(action.output,'Starting tests\nAll tests passed');assert.equal(action.status,'done');
 const batch=[{type:'response_item',payload:{type:'custom_tool_call',call_id:'batch',name:'exec',input:'text(await tools.exec_command({cmd:"first"}));text(await tools.exec_command({cmd:"second"}));'}},{type:'response_item',payload:{type:'custom_tool_call_output',call_id:'batch',output:'[{"output":"one","exit_code":0},{"output":"two","exit_code":0}]'}}];const actions=actionsOf(parseSession(batch.map(row=>JSON.stringify(row)).join('\n'),'codex'));assert.equal(actions[0].outputScope,'batch');assert.equal(actions[0].output,'one\ntwo');
});


test('native local tool-result input_text blocks expose command output instead of losing it',()=>{
 const result=[{type:'input_text',text:'Script completed\nWall time 1 second\nOutput:\n'},{type:'input_text',text:JSON.stringify({chunk_id:'abc',exit_code:0,output:'53 tests passed'})}];assert.equal(commandOutput(result).text,'53 tests passed');
 const rows=[{type:'response_item',payload:{type:'function_call',call_id:'run',name:'exec_command',arguments:'{"cmd":"npm test"}'}},{type:'response_item',payload:{type:'function_call_output',call_id:'run',output:result}}];const output=actionsOf(parseSession(rows.map(row=>JSON.stringify(row)).join('\n'),'codex'))[0].output;assert.ok(output);assert.match(output,/53 tests passed/);
});
