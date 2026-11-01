import test from 'node:test';
import assert from 'node:assert/strict';
import {layoutAgents,summarize,zoneOf,DESK_SLOTS,type LoungeAgent,type Slot} from '../../client/src/features/agents/lounge-layout.ts';
const agent=(id:string,status='idle'):LoungeAgent=>({id,agent:'codex',name:id,status,project:'p'});
const slotsOf=(rows:ReturnType<typeof layoutAgents>)=>new Map<string,Slot>(rows.placed.map(row=>[row.id,{zone:row.zone,slot:row.slot}]));

test('working and waiting agents sit at desks, finished and idle ones rest in the lounge',()=>{
 for(const status of ['working','connecting','blocked','error','failed'])assert.equal(zoneOf(status),'desk',status);
 for(const status of ['idle','done','whatever'])assert.equal(zoneOf(status),'lounge',status);
});
test('blocked and error agents carry a bubble',()=>{
 const {placed}=layoutAgents([agent('a','blocked'),agent('b','error'),agent('c','working')]);
 assert.deepEqual(placed.map(row=>row.bubble),['alert','error',null]);
});
test('an agent keeps its own desk whatever it is doing',()=>{
 const first=layoutAgents([agent('a','working'),agent('b','working'),agent('c','working')]);
 assert.deepEqual(first.placed.map(row=>row.slot),[0,1,2]);
 const next=layoutAgents([agent('a','working'),agent('b','done'),agent('c','idle')],slotsOf(first));
 assert.deepEqual(next.placed.map(row=>[row.slot,row.zone]),[[0,'desk'],[1,'lounge'],[2,'lounge']]);
 const again=layoutAgents([agent('a','idle'),agent('b','working'),agent('c','working')],slotsOf(next));
 assert.deepEqual(again.placed.map(row=>row.slot),[0,1,2]);
});
test('a desk is freed only when its agent goes away, and the next agent takes it',()=>{
 const first=layoutAgents([agent('a','working'),agent('b','idle')]);
 const next=layoutAgents([agent('b','idle'),agent('c','working')],slotsOf(first));
 assert.equal(next.placed.find(row=>row.id==='b')!.slot,1);
 assert.equal(next.placed.find(row=>row.id==='c')!.slot,0);
});
test('agents beyond the number of desks are counted, never overlapped',()=>{
 const many=Array.from({length:DESK_SLOTS+2},(_,index)=>agent(`w${index}`,index%2?'idle':'working'));
 const rows=layoutAgents(many);
 assert.equal(rows.placed.length,DESK_SLOTS);assert.equal(rows.hidden,2);
 assert.equal(new Set(rows.placed.map(row=>row.slot)).size,DESK_SLOTS);
});
test('layout does not depend on the order agents arrive in',()=>{
 const a=layoutAgents([agent('b','working'),agent('a','working')]),b=layoutAgents([agent('a','working'),agent('b','working')]);
 assert.deepEqual(a,b);
});
test('summary counts working, waiting and resting agents',()=>{
 assert.equal(summarize([agent('a','working'),agent('b','blocked'),agent('c','done'),agent('d','idle')]),'1 working · 1 waiting · 2 idle');
 assert.equal(summarize([]),'');
});
