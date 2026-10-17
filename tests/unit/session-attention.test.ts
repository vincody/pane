import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionAttention,needsAttention,nextAttention,workspaceLead} from '../../client/src/features/workspaces/session-attention.ts';
import type {TerminalAgent} from '../../client/src/components/contracts.ts';
const agent=(id:string,status='idle',selected=false,completed=false):TerminalAgent=>({id,project:'project',agent:'codex',name:id,status,selected,completed});
test('completion is retained after its signal clears; viewing acknowledges unread completion',()=>{
 const tracker=createSessionAttention();tracker.update([agent('a','working')]);let rows=tracker.update([agent('a','idle',false,true)]);assert.equal(rows[0].status,'done');assert.equal(rows[0].unread,true);
 rows=tracker.update([agent('a')]);assert.equal(rows[0].status,'done');assert.equal(needsAttention(rows[0]),true);
 rows=tracker.update([agent('a','idle',true)]);assert.equal(rows[0].unread,false);assert.equal(needsAttention(rows[0]),false);
 rows=tracker.update([agent('a','working')]);assert.equal(rows[0].status,'working');assert.equal(rows[0].unread,false);
});
test('blocked and error sessions keep needing action after opening, without unread marks',()=>{
 const tracker=createSessionAttention();let rows=tracker.update([agent('a','blocked'),agent('b','error')]);assert.ok(rows.every(row=>row.unread&&needsAttention(row)));
 rows=tracker.update([agent('a','blocked',true),agent('b','error',true)]);assert.ok(rows.every(row=>!row.unread&&needsAttention(row)));
 rows=tracker.update([agent('a','working'),agent('b','working')]);assert.ok(rows.every(row=>!needsAttention(row)));
});
test('hidden or unfocused selected sessions retain unread; removed sessions forget previous state',()=>{
 const tracker=createSessionAttention();tracker.update([agent('a','working')]);let rows=tracker.update([agent('a','idle',true,true)],false);assert.equal(rows[0].unread,true);
 rows=tracker.update([agent('a','idle',true)],true);assert.equal(rows[0].unread,false);tracker.update([]);rows=tracker.update([agent('a')]);assert.equal(rows[0].status,'idle');
});
test('attention navigation cycles through actionable sessions and skips acknowledged completions',()=>{
 const rows=[agent('a','working'),agent('b','blocked'),{...agent('c','done'),unread:true},agent('d','done'),agent('e','error')];
 assert.equal(nextAttention(rows)?.id,'b');assert.equal(nextAttention(rows,'b')?.id,'c');assert.equal(nextAttention(rows,'c')?.id,'e');assert.equal(nextAttention(rows,'e')?.id,'b');assert.equal(nextAttention([agent('a')]),undefined);assert.equal(nextAttention([]),undefined);
});
test('a workspace row shows its most urgent session status',()=>{
 const unread=(id:string)=>({...agent(id,'done'),unread:true});
 assert.equal(workspaceLead([]),'idle');assert.equal(workspaceLead([agent('a'),agent('b','done')]),'idle');
 assert.equal(workspaceLead([agent('a'),unread('b')]),'review');
 assert.equal(workspaceLead([unread('a'),agent('b','working')]),'working');
 assert.equal(workspaceLead([agent('a','working'),agent('b','blocked')]),'blocked');
 assert.equal(workspaceLead([agent('a','blocked'),agent('b','failed'),unread('c')]),'failed');
 assert.equal(workspaceLead([agent('a','error')]),'failed');
});

test('a session is a plain idle shell again once its agent has exited',()=>{
 const tracker=createSessionAttention();tracker.update([agent('a','working')]);
 let rows=tracker.update([agent('a','idle',false,true)]);assert.equal(rows[0].status,'done');
 rows=tracker.update([{...agent('a'),agent:'shell'}]);assert.equal(rows[0].status,'idle');
});
