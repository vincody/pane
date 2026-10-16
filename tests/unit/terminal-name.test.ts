import test from 'node:test';
import assert from 'node:assert/strict';
import {terminalName,threadTitle} from '../../client/src/features/terminal/terminal-name.ts';
test('agent defaults and thread titles exclude workspace suffixes',()=>{
  const project={name:'ai-web',root:'C:\\UIT\\ai-web'};
  assert.equal(terminalName({name:'ai-web',launch:'codex',state:'connecting',shell:'powershell.exe'}),'Codex');
  assert.equal(terminalName({name:'ai-web',launch:'claude',state:'connecting',shell:'powershell.exe'}),'Claude');
  assert.equal(threadTitle('Fix pane resize | ai-web',project),'Fix pane resize');
  assert.equal(threadTitle('ai-web',project),'');
  assert.equal(threadTitle('pwsh in <ai-web>',project),'');
  assert.equal(threadTitle('C:\\Windows\\powershell.exe',project),'');
  assert.equal(terminalName({name:'My session',customName:true,state:'ready',shell:'powershell.exe',launch:'codex',cliTitle:'Other title'}),'My session');
});

test('a session opened as an agent is named after the shell once the agent exits',()=>{
  const opened={name:'ai-web',launch:'claude',state:'running',shell:'PowerShell',cliTitle:'Claude Code'};
  assert.equal(terminalName({...opened,agent:'claude'}),'Claude Code');
  assert.equal(terminalName({...opened,agent:null}),'Claude Code');
  assert.equal(terminalName({...opened,agent:null,agentEnded:true,cliTitle:undefined}),'PowerShell');
  assert.equal(terminalName({...opened,agent:'claude',agentEnded:false}),'Claude Code');
});
