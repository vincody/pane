import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createModelControl } from '../server/codex-control.js';
import {parseSession} from '../server/session-parser.js';
import { createApp } from '../server/app.js';
const catalog=[{model:'model-a',displayName:'Model A',defaultReasoningEffort:'low',supportedReasoningEfforts:[{reasoningEffort:'low',description:'Fast'},{reasoningEffort:'high',description:'Deep'}]},{model:'model-b',displayName:'Model B',defaultReasoningEffort:'medium',supportedReasoningEfforts:[{reasoningEffort:'medium',description:'Balanced'}]}];
test('model catalog determines supported effort and settings updates only the requested thread',async()=>{
 const calls=[];const control=createModelControl({request:async(method,params)=>{calls.push({method,params});return method==='model/list'?{data:catalog,nextCursor:null}:{};}});
 await control.list();await control.update('thread-1','model-b','medium');assert.equal(calls.filter(call=>call.method==='model/list').length,1);assert.deepEqual(calls.at(-1),{method:'thread/settings/update',params:{threadId:'thread-1',model:'model-b',effort:'medium'}});
 await assert.rejects(control.update('thread-1','model-b','high'),error=>error.status===400);await assert.rejects(control.update('thread-1','invented-model','low'),error=>error.status===400);assert.equal(calls.length,2);
});
test('future model configuration is separate from the current turn model',()=>{
 const rows=[{type:'turn_context',payload:{model:'model-a',effort:'low'}},{type:'event_msg',payload:{type:'thread_settings_applied',thread_settings:{model:'model-b',reasoning_effort:'medium'}}}];const parsed=parseSession(rows.map(JSON.stringify).join('\n'),'codex');assert.equal(parsed.metadata.model,'model-a');assert.equal(parsed.metadata.configuredModel,'model-b');assert.equal(parsed.metadata.configuredEffort,'medium');
});
