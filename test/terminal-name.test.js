import test from 'node:test';
import assert from 'node:assert/strict';
import {terminalName,threadTitle} from '../client/terminal-name.js';
test('agent defaults and thread titles exclude workspace suffixes',()=>{
  const project={name:'ai-web',root:'C:\\UIT\\ai-web'};
  assert.equal(terminalName({name:'ai-web',launch:'codex',state:'connecting'}),'Codex');
  assert.equal(terminalName({name:'ai-web',launch:'claude',state:'connecting'}),'Claude');
  assert.equal(threadTitle('Fix pane resize | ai-web',project),'Fix pane resize');
  assert.equal(threadTitle('ai-web',project),'');
  assert.equal(threadTitle('pwsh in <ai-web>',project),'');
  assert.equal(threadTitle('C:\\Windows\\powershell.exe',project),'');
  assert.equal(terminalName({name:'My session',customName:true,launch:'codex',cliTitle:'Other title'}),'My session');
});
