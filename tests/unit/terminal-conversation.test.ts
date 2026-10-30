import assert from 'node:assert/strict';
import test from 'node:test';
import type {SessionRecord} from '../../shared/contracts.ts';
import {pickConversation} from '../../client/src/features/terminal/terminal-conversation.ts';
import type {SavedTerminal} from '../../client/src/features/terminal/terminal-journal.ts';

const project={root:'C:\work\app'};
const record=(id:string,created:string,over:Partial<SessionRecord>={}):SessionRecord=>({id:`claude:${id}`,agent:'claude',agent_session:{value:id},cwd:'C:\work\app',name:id,createdAt:created,updatedAt:created,...over});
const saved=(over:Partial<SavedTerminal>={}):SavedTerminal=>({sessionId:'t1',projectId:'p',launch:'claude',name:'Claude',ended:true,openedAt:Date.parse('2026-01-01T10:00:00Z'),...over});

test('a terminal that remembers its conversation resumes exactly that one', () => {
  const records=[record('a','2026-01-01T10:01:00Z'),record('b','2026-01-01T10:02:00Z')];
  assert.equal(pickConversation(saved({conversation:{agent:'claude',id:'a',cwd:'C:\work\app'}}),project,records,new Set(),0)?.agent_session.value,'a');
  assert.equal(pickConversation(saved({conversation:{agent:'claude',id:'gone',cwd:'C:\work\app'}}),project,records,new Set(),0),null);
});

test('without a stored conversation it picks the newest matching one started after the terminal opened', () => {
  const records=[record('old','2025-12-31T10:00:00Z'),record('a','2026-01-01T10:01:00Z'),record('b','2026-01-01T10:02:00Z',{updatedAt:'2026-01-01T11:00:00Z'}),record('other','2026-01-01T10:03:00Z',{cwd:'C:\elsewhere'}),record('codex','2026-01-01T10:03:00Z',{agent:'codex'})];
  assert.equal(pickConversation(saved(),project,records,new Set(),0)?.agent_session.value,'b');
  assert.equal(pickConversation(saved(),project,records,new Set(['b']),0)?.agent_session.value,'a');
});

test('ambiguous or unmatched terminals are left for the user', () => {
  const records=[record('a','2026-01-01T10:01:00Z')];
  assert.equal(pickConversation(saved(),project,records,new Set(),1),null);
  assert.equal(pickConversation(saved({openedAt:undefined}),project,records,new Set(),0),null);
  assert.equal(pickConversation(saved({launch:'shell'}),project,records,new Set(),0),null);
  assert.equal(pickConversation(saved(),project,[],new Set(),0),null);
});
