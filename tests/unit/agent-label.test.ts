import test from 'node:test';
import assert from 'node:assert/strict';
import {agentLabel} from '../../shared/agent-label.ts';
import {terminalName} from '../../client/src/features/terminal/terminal-name.ts';
test('agy is shown as Antigravity and other agents keep their capitalised command',()=>{
  assert.equal(agentLabel('agy'),'Antigravity');
  assert.equal(agentLabel('codex'),'Codex');
  assert.equal(terminalName({name:'x',agent:'agy',launch:'agy',state:'running',shell:'PowerShell'}),'Antigravity');
});
