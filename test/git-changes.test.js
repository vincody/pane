import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {changes,fileDiff,parseNumstat} from '../server/git-changes.js';
const execute=promisify(execFile);
test('real Git working-tree summary includes staged, unstaged, deleted and untracked files without modifying them',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ai-web-diff-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const git=args=>execute('git',args,{cwd:root,windowsHide:true});
 await fs.writeFile(path.join(root,'rename-me.txt'),'stable content\n');
 await git(['init']);await fs.mkdir(path.join(root,'sub'));await fs.writeFile(path.join(root,'main.js'),'old\n');await fs.writeFile(path.join(root,'gone.txt'),'gone\n');await fs.writeFile(path.join(root,'sub','nested.txt'),'before\n');await git(['add','.']);await git(['-c','core.hooksPath='+path.join(root,'no-hooks'),'-c','commit.gpgsign=false','-c','user.name=AI Web Tests','-c','user.email=tests@example.invalid','commit','-m','fixture']);
 await fs.writeFile(path.join(root,'main.js'),'new\nsecond\n');await git(['add','main.js']);await fs.rm(path.join(root,'gone.txt'));await fs.writeFile(path.join(root,'new file.txt'),'hello\n');await fs.writeFile(path.join(root,'image.bin'),Buffer.from([0,1,2]));await fs.writeFile(path.join(root,'sub','nested.txt'),'after\n');
 const before=(await git(['status','--porcelain'])).stdout;const summary=await changes(root);assert.equal(summary.available,true);assert.equal(summary.files.length,5);assert.deepEqual(summary.files.find(file=>file.path==='main.js'),{path:'main.js',added:2,removed:1,binary:false});assert.equal(summary.files.find(file=>file.path==='image.bin').binary,true);
 const diff=await fileDiff(root,'main.js');assert.equal(diff.original,'old\n');assert.equal(diff.modified,'new\nsecond\n');assert.equal((await fileDiff(root,'gone.txt')).modified,'');assert.equal((await fileDiff(root,'new file.txt')).original,'');
 await assert.rejects(fileDiff(root,'../outside'),error=>error.status===404);await assert.rejects(fileDiff(root,'image.bin'),error=>error.status===415);
 const nested=await changes(path.join(root,'sub'));assert.deepEqual(nested.files.map(file=>file.path),['nested.txt']);assert.equal((await fileDiff(path.join(root,'sub'),'nested.txt')).original,'before\n');assert.equal((await git(['status','--porcelain'])).stdout,before);
 await git(['mv','rename-me.txt','renamed.txt']);const renamed=await fileDiff(root,'renamed.txt');assert.equal(renamed.original,'stable content\n');assert.equal(renamed.modified,'stable content\n');
});
test('numstat handles renamed paths and filenames with spaces or tabs',()=>{assert.deepEqual(parseNumstat('1\t2\t\0old name\0new name\0-\t-\timage.bin\0'),[{path:'new name',added:1,removed:2,binary:false},{path:'image.bin',added:null,removed:null,binary:true}]);});
test('new repositories show staged and untracked additions before the first commit',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'pane-unborn-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await execute('git',['init'],{cwd:root,windowsHide:true});await fs.mkdir(path.join(root,'sub'));await fs.writeFile(path.join(root,'sub','new.txt'),'new\n');await fs.writeFile(path.join(root,'staged.txt'),'staged\n');await execute('git',['add','staged.txt'],{cwd:root,windowsHide:true});
 const summary=await changes(root);assert.equal(summary.available,true);assert.equal(summary.baseline,null);assert.deepEqual(summary.files.map(file=>file.path).sort(),['staged.txt','sub/new.txt']);
 const diff=await fileDiff(root,'staged.txt');assert.equal(diff.original,'');assert.equal(diff.modified,'staged\n');
 const nested=await changes(path.join(root,'sub'));assert.deepEqual(nested.files.map(file=>file.path),['new.txt']);assert.equal((await fileDiff(path.join(root,'sub'),'new.txt')).modified,'new\n');
});
