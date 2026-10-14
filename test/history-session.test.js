import test from 'node:test';
import assert from 'node:assert/strict';
import {resumeCommand,workspaceForSession} from '../client/history-session.js';
const id='12345678-1234-1234-1234-123456789abc';
test('resume commands retain exact thread, quote cwd literally, and reject invalid input',()=>{
 const record={agent:'codex',agent_session:{value:id},cwd:"C:\\work\\O'Brien $test"};
 assert.equal(resumeCommand(record,'powershell.exe'),`try { Set-Location -LiteralPath 'C:\\work\\O''Brien $test' -ErrorAction Stop; codex resume ${id} } catch { Write-Error $_ }\r`);
 assert.equal(resumeCommand({...record,agent:'claude',cwd:"/tmp/O'Brien"},'/bin/bash'),`cd -- '/tmp/O'\\''Brien' && claude --resume ${id}\r`);
 assert.throws(()=>resumeCommand({...record,agent_session:{value:'bad; command'}},'powershell'));
 assert.throws(()=>resumeCommand({...record,cwd:'bad\npath'},'powershell'));
});
test('history belongs to the deepest workspace, respecting directory boundaries and Windows casing',()=>{
 const projects=[{id:'root',root:'C:\\work'},{id:'nested',root:'C:\\work\\repo'}];
 assert.equal(workspaceForSession({cwd:'c:/WORK/repo/src'},projects)?.id,'nested');
 assert.equal(workspaceForSession({cwd:'C:\\work-other'},projects),undefined);
 assert.equal(workspaceForSession({cwd:'/Work/repo'},[{id:'unix',root:'/work'}]),undefined);
});
