import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspaceDiffs,sumChanges} from '../../client/src/features/workspaces/workspace-diff.ts';
import type {Api} from '../../client/src/components/contracts.ts';
import type {GitChanges} from '../../shared/contracts.ts';
const changes=(files:GitChanges['files'],available=true):GitChanges=>({available,files});
test('sums text changes and ignores binary or unavailable results',()=>{
 assert.deepEqual(sumChanges(changes([{path:'a',added:3,removed:1,binary:false},{path:'b',added:null,removed:null,binary:true},{path:'c',added:2,removed:0,binary:false,untracked:true}])),{added:5,removed:1});
 assert.deepEqual(sumChanges(changes([{path:'a',added:9,removed:9,binary:false}],false)),{added:0,removed:0});
});
test('refreshes each workspace at most once per interval, reports only changes and drops removed workspaces',async()=>{
 const calls:string[]=[],totals:Record<string,number>={one:4,two:0};let notifications=0;
 const api=(async(route:string)=>{const id=new URLSearchParams(route.split('?')[1]).get('project')!;calls.push(id);if(id==='bad')throw new Error('git failed');return changes([{path:'f',added:totals[id]||0,removed:0,binary:false}]);}) as Api;
 const diffs=createWorkspaceDiffs(api,()=>{notifications++;});
 diffs.refresh(['one','two','bad']);await new Promise(resolve=>setTimeout(resolve,20));
 assert.deepEqual(calls.sort(),['bad','one','two']);assert.deepEqual(diffs.stats().get('one'),{added:4,removed:0});assert.equal(diffs.stats().has('bad'),false);assert.equal(notifications,1);
 diffs.refresh(['one','two','bad']);await new Promise(resolve=>setTimeout(resolve,20));assert.equal(calls.length,3);
 diffs.refresh(['two']);assert.equal(diffs.stats().has('one'),false);
});
