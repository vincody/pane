import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {gitSnapshot,gitHistory,gitCommitDetails,gitCommitDiff} from '../../server/src/features/git/git-history.ts';
import {gitSync} from '../../server/src/features/git/git-sync.ts';
import {graphRows} from '../../client/src/features/git/graph-layout.ts';
import {createApp} from '../../server/src/app.ts';
import {isWithin} from '../../server/src/features/files/files.ts';

const execute=promisify(execFile);
const git=async(root:string,args:string[])=>(await execute('git',['-C',root,...args],{windowsHide:true})).stdout.trim();
async function init(root:string){await fs.mkdir(root,{recursive:true});await git(root,['init','-b','main']);await git(root,['config','user.name','Test Author']);await git(root,['config','user.email','test@example.invalid']);await git(root,['config','core.autocrlf','false']);await git(root,['config','commit.gpgsign','false']);}
async function commit(root:string,file:string,text:string,message:string){await fs.writeFile(path.join(root,file),text);await git(root,['add','--',file]);await git(root,['commit','-m',message]);return git(root,['rev-parse','HEAD']);}
async function temporary(t:test.TestContext){const root=await fs.mkdtemp(path.join(os.tmpdir(),'pane-git-history-'));t.after(async()=>{assert.ok(isWithin(path.resolve(os.tmpdir()),root));await fs.rm(root,{recursive:true,force:true});});return root;}

test('history preserves merge ancestry, refs and renamed/root diffs without touching local edits',async t=>{
 const temp=await temporary(t),root=path.join(temp,'repo');await init(root);
 const initial=await commit(root,'file.txt','base\n','initial');await git(root,['checkout','-b','feature']);const feature=await commit(root,'feature.txt','feature\n','feat: <safe text>');await git(root,['checkout','main']);await commit(root,'main.txt','main\n','main work');await git(root,['merge','--no-ff','feature','-m','merge feature']);const merge=await git(root,['rev-parse','HEAD']);await git(root,['tag','-a','v1','-m','tag']);
 await git(root,['mv','file.txt','renamed file.txt']);await git(root,['commit','-m','rename']);const rename=await git(root,['rev-parse','HEAD']);await fs.writeFile(path.join(root,'main.txt'),'local edit');
 const before=await git(root,['status','--porcelain']);const state=await gitSnapshot(root);assert.equal(state.branch,'main');assert.equal(state.dirty,true);assert.ok(state.refs.some(ref=>ref.kind==='tag'&&ref.hash===merge));
 const history=await gitHistory(root);assert.equal(history.commits[0].hash,rename);assert.equal(history.commits.find(item=>item.hash===merge)?.parents.length,2);assert.ok(history.commits.some(item=>item.hash===feature));
 for(const [index,item] of history.commits.entries())for(const parent of item.parents){const parentIndex=history.commits.findIndex(item=>item.hash===parent);assert.ok(parentIndex<0||parentIndex>index);}
 assert.equal((await gitHistory(root,'HEAD',1)).hasMore,true);assert.equal((await gitHistory(root,'refs/heads/feature')).commits[0].hash,feature);await assert.rejects(gitHistory(root,'--all'),/available branch/);
 const detail=await gitCommitDetails(root,rename);assert.deepEqual(detail.files,[{path:'renamed file.txt',previousPath:'file.txt',status:'R',added:0,removed:0,binary:false}]);const diff=await gitCommitDiff(root,rename,'renamed file.txt');assert.equal(diff.original,'base\n');assert.equal(diff.modified,'base\n');
 assert.equal((await gitCommitDiff(root,initial,'file.txt')).original,'');assert.equal((await gitCommitDetails(root,initial)).files[0].added,1);assert.equal((await gitCommitDetails(root,merge)).files[0].path,'feature.txt');
 await assert.rejects(gitCommitDetails(root,'HEAD'),/valid commit/);await assert.rejects(gitCommitDiff(root,rename,'../outside'),/not in the selected commit/);assert.equal(await git(root,['status','--porcelain']),before);
 await fs.writeFile(path.join(root,'binary.bin'),Buffer.from([0,1,2]));await git(root,['add','binary.bin']);await git(root,['commit','-m','binary']);await assert.rejects(gitCommitDiff(root,await git(root,['rev-parse','HEAD']),'binary.bin'),/supported text diff/);
});

test('graph lanes split and converge for a merge without losing parent edges',()=>{
 const commits=[{hash:'merge',parents:['main','feature']},{hash:'main',parents:['base']},{hash:'feature',parents:['base']},{hash:'base',parents:[]}].map(item=>({...item,author:'',date:'',subject:''}));
 const graph=graphRows(commits);assert.equal(graph.width,2);assert.deepEqual(graph.rows.map(row=>row.lane),[0,0,1,0]);assert.equal(graph.rows[0].segments.length,2);assert.ok(graph.rows[2].segments.some(segment=>segment.from===1&&segment.to===0));assert.equal(graph.rows[3].segments.length,0);
});

test('sync fetches, pulls fast-forward, publishes and refuses dirty, stale and diverged updates',async t=>{
 const temp=await temporary(t),remote=path.join(temp,'remote.git'),root=path.join(temp,'repo'),other=path.join(temp,'other');await fs.mkdir(remote);await git(remote,['init','--bare','--initial-branch=main']);await init(root);await commit(root,'file.txt','base\n','initial');await git(root,['remote','add','origin',remote]);await git(root,['push','-u','origin','main']);await execute('git',['clone',remote,other],{windowsHide:true});await git(other,['config','user.name','Other']);await git(other,['config','user.email','other@example.invalid']);await git(other,['config','commit.gpgsign','false']);
 const input=async(action:string)=>{const state=await gitSnapshot(root);return {action,remote:'origin',expectedHead:state.head,expectedBranch:state.branch};};
 await commit(other,'file.txt','remote update\n','remote update');await git(other,['push']);assert.equal((await gitSnapshot(root)).behind,0);const fetched=await gitSync(root,await input('fetch'));assert.equal(fetched.state.behind,1);assert.equal(await fs.readFile(path.join(root,'file.txt'),'utf8'),'base\n');
 await fs.writeFile(path.join(root,'local.txt'),'keep');await assert.rejects(gitSync(root,await input('pull')),/Commit or stash/);await fs.rm(path.join(root,'local.txt'));await gitSync(root,await input('pull'));assert.equal(await fs.readFile(path.join(root,'file.txt'),'utf8'),'remote update\n');
 await assert.rejects(gitSync(root,{...await input('push'),expectedHead:'0'.repeat(40)}),/branch changed/);
 await git(root,['checkout','-b','feature']);await commit(root,'feature.txt','publish\n','publish');await gitSync(root,await input('push'));assert.equal((await gitSnapshot(root)).upstream,'refs/remotes/origin/feature');assert.equal(await git(remote,['rev-parse','refs/heads/feature']),await git(root,['rev-parse','HEAD']));
 await git(root,['checkout','main']);await commit(root,'local.txt','local commit\n','local commit');await commit(other,'remote.txt','remote commit\n','remote commit');await git(other,['push']);await gitSync(root,await input('fetch'));const diverged=await gitSnapshot(root);assert.equal(diverged.ahead,1);assert.equal(diverged.behind,1);await assert.rejects(gitSync(root,await input('pull')),/diverged/);await assert.rejects(gitSync(root,await input('push')),/remote has changed/);assert.equal((await gitSnapshot(root)).ahead,1);
 await git(root,['checkout','--detach']);await assert.rejects(gitSync(root,await input('push')),/Check out a branch/);await assert.rejects(gitSync(root,{action:'reset'}),/Fetch, Pull or Push/);
});

test('Git APIs authenticate and scope history and diff to registered workspaces',async t=>{
 const temp=await temporary(t),root=path.join(temp,'repo');await init(root);const hash=await commit(root,'file.txt','hello','first');
 const app=await createApp({initialRoot:root,stateDir:path.join(temp,'state')});await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise<void>(resolve=>app.server.close(()=>resolve())));
 const address=app.server.address();assert.ok(address&&typeof address!=='string');const base=`http://127.0.0.1:${address.port}`,headers={'X-AI-Web-Token':app.token};const project=(await(await fetch(base+'/api/projects',{headers})).json()).projects[0];
 assert.equal((await fetch(base+`/api/git/history?project=${project.id}`)).status,403);assert.equal((await fetch(base+'/api/git/history?project=missing',{headers})).status,404);
 assert.equal((await fetch(base+`/api/github/issues?project=${project.id}`,{method:'POST',body:JSON.stringify({title:'Must not create'})})).status,403);
 assert.equal((await fetch(base+'/api/github/issues?project=missing',{method:'POST',headers,body:JSON.stringify({title:'Must not create'})})).status,404);
 assert.equal((await fetch(base+'/api/github/labels?project=missing',{headers})).status,404);
 const history=await(await fetch(base+`/api/git/history?project=${project.id}`,{headers})).json();assert.equal(history.commits[0].hash,hash);
 const diff=await(await fetch(base+`/api/git/commit-diff?${new URLSearchParams({project:project.id,hash,path:'file.txt'})}`,{headers})).json();assert.equal(diff.modified,'hello');
 assert.equal((await fetch(base+`/api/git/commit?project=${project.id}&hash=--all`,{headers})).status,400);
});
