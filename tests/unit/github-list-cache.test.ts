import test from 'node:test';
import assert from 'node:assert/strict';
import {createGitHubListCache,githubListKey} from '../../client/src/features/git/github-list-cache.ts';

test('GitHub UI cache separates sources, keeps stale snapshots, bounds memory and rejects pre-mutation writes',()=>{
 let now=0;const cache=createGitHubListCache({now:()=>now,ttl:30_000,max:2}),project={id:'a',root:'C:\\repo'},data={items:[],limited:false};
 const pulls=githubListKey(project,'pulls','open'),issues=githubListKey(project,'issues','open');assert.notEqual(pulls,issues);assert.notEqual(pulls,githubListKey(project,'pulls','closed'));assert.notEqual(pulls,githubListKey({...project,root:'C:\\other'},'pulls','open'));
 cache.set(pulls,data);now=29_999;assert.equal(cache.get(pulls)?.fresh,true);now=30_000;assert.equal(cache.get(pulls)?.fresh,false);assert.equal(cache.get(pulls)?.data,data);
 cache.set(issues,data);cache.get(pulls);cache.set('third',data);assert.equal(cache.get(issues),undefined);assert.ok(cache.get(pulls));
 const generation=cache.generation();cache.clear();cache.set(pulls,data,generation);assert.equal(cache.get(pulls),undefined);cache.set(pulls,data);assert.equal(cache.get(pulls)?.fresh,true);
});
