import test from 'node:test';
import assert from 'node:assert/strict';
import {agentInProcessTree} from '../server/terminal-agents.js';
test('agent identity follows live descendants and disappears when the CLI exits', () => {
  const shell={ProcessId:10,ParentProcessId:1,Name:'powershell.exe'};
  const wrapper={ProcessId:11,ParentProcessId:10,Name:'node.exe',CommandLine:'C:\\npm\\node_modules\\@openai\\codex\\bin\\codex.js'};
  const cli={ProcessId:12,ParentProcessId:11,Name:'codex.exe'};
  assert.equal(agentInProcessTree([shell,wrapper,cli],10),'codex');
  assert.equal(agentInProcessTree([shell],10),null);
  assert.equal(agentInProcessTree([shell,{...cli,ParentProcessId:90}],10),null);
  assert.equal(agentInProcessTree([shell,{...wrapper,CommandLine:'node server.js --comment codex'}],10),null);
  assert.equal(agentInProcessTree([shell,{...wrapper,CommandLine:'C:\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js'}],10),'claude');
});
