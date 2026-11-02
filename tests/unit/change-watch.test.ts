import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createChangeWatch,treeEventMatters,gitEventMatters} from '../../server/src/features/git/change-watch.ts';

test('working-tree events skip dependencies, the git directory and lock files',()=>{
  assert.equal(treeEventMatters('src/app.ts'),true);
  assert.equal(treeEventMatters('.env'),true);
  assert.equal(treeEventMatters(null),true);
  assert.equal(treeEventMatters('node_modules/pkg/index.js'),false);
  assert.equal(treeEventMatters('packages/a/node_modules/x.js'),false);
  assert.equal(treeEventMatters('.git/index'),false);
  assert.equal(treeEventMatters('src/.#file.lock'),false);
});
test('git directory events keep the state that status reads and drop the noise',()=>{
  for(const name of ['index','HEAD','packed-refs','refs/heads/main','MERGE_HEAD'])assert.equal(gitEventMatters(name),true,name);
  for(const name of ['objects/ab/cdef','logs/HEAD','hooks/pre-commit','index.lock','FETCH_HEAD'])assert.equal(gitEventMatters(name),false,name);
});
async function until(check:()=>boolean,ms=3000){const end=Date.now()+ms;while(Date.now()<end){if(check())return true;await new Promise(resolve=>setTimeout(resolve,25));}return check();}

test('a client is told "unchanged" until a file in the workspace changes',async()=>{
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'pane-watch-')));
  const watch=createChangeWatch();
  try{
    const entry=watch.track('p',root);
    assert.equal(watch.unchanged('p',root,entry.version),false,'nothing has run yet, so a full refresh is needed');
    watch.ran('p');
    assert.equal(watch.unchanged('p',root,entry.version),true);
    fs.writeFileSync(path.join(root,'a.txt'),'x');
    assert.ok(await until(()=>entry.version>0),'a new file bumps the version');
    assert.equal(watch.unchanged('p',root,0),false);
    const held=entry.version;
    fs.mkdirSync(path.join(root,'node_modules'));await new Promise(resolve=>setTimeout(resolve,200));fs.writeFileSync(path.join(root,'node_modules','dep.js'),'x');
    await new Promise(resolve=>setTimeout(resolve,400));
    const bumpedByDependency=entry.version-held;
    assert.ok(bumpedByDependency<=1,'only the folder creation itself may count; files inside node_modules do not');
  }finally{watch.dispose();fs.rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:50});}
});
test('forgetting a workspace stops its watcher and starts it fresh next time',async()=>{
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'pane-watch2-')));
  const watch=createChangeWatch();
  try{
    const first=watch.track('p',root);watch.ran('p');watch.forget('p');
    const second=watch.track('p',root);
    assert.notEqual(first,second);
    assert.equal(watch.unchanged('p',root,second.version),false);
    await new Promise(resolve=>setTimeout(resolve,400)); // the one-off `git rev-parse` started by track() holds the folder until it exits
  }finally{watch.dispose();fs.rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:50});}
});
