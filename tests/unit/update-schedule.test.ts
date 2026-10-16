import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createUpdateSchedule,UPDATE_CHECK_INTERVAL} from '../../desktop/update-schedule.ts';

test('successful checks retain their remaining interval and focus/wake catches up without duplicate checks',async context=>{
 const now=Date.UTC(2026,9,16);context.mock.timers.enable({apis:['setTimeout','Date'],now});let calls=0;
 const schedule=createUpdateSchedule({enabled:()=>true,lastSuccess:now-UPDATE_CHECK_INTERVAL+60000,check:async()=>{calls++;schedule.completed(true);}});
 try{
  await schedule.activity();context.mock.timers.tick(59999);assert.equal(calls,0);
  context.mock.timers.tick(1);assert.equal(calls,1);await new Promise<void>(resolve=>setImmediate(resolve));
  context.mock.timers.setTime(Date.now()+UPDATE_CHECK_INTERVAL+1000);
  await Promise.all([schedule.activity(),schedule.activity()]);assert.equal(calls,2);
  await schedule.activity();assert.equal(calls,2);
 }finally{schedule.dispose();context.mock.timers.reset();}
});

test('network failure retries with backoff and success restores the regular interval',async context=>{
 context.mock.timers.enable({apis:['setTimeout','Date']});let calls=0,success=false;
 const schedule=createUpdateSchedule({enabled:()=>true,lastSuccess:0,check:async()=>{calls++;schedule.completed(success);}});
 try{
  context.mock.timers.tick(5000);await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(calls,1);
  context.mock.timers.tick(15*60000-1);await schedule.activity();assert.equal(calls,1);
  context.mock.timers.tick(1);await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(calls,2);
  context.mock.timers.tick(30*60000-1);assert.equal(calls,2);success=true;context.mock.timers.tick(1);await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(calls,3);
  context.mock.timers.tick(UPDATE_CHECK_INTERVAL-1);assert.equal(calls,3);context.mock.timers.tick(1);assert.equal(calls,4);
 }finally{schedule.dispose();context.mock.timers.reset();}
});

test('deferred checks are rearmed and opt-out/disposal prevent wake checks',async context=>{
 context.mock.timers.enable({apis:['setTimeout','Date']});let calls=0,enabled=true;
 const schedule=createUpdateSchedule({enabled:()=>enabled,lastSuccess:0,check:async()=>{calls++;}});
 try{
  context.mock.timers.tick(5000);await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(calls,1);
  context.mock.timers.tick(60000);await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(calls,2);
  enabled=false;schedule.refresh();context.mock.timers.tick(UPDATE_CHECK_INTERVAL);await schedule.activity();assert.equal(calls,2);
  enabled=true;schedule.dispose();await schedule.activity();assert.equal(calls,2);
 }finally{schedule.dispose();context.mock.timers.reset();}
});
