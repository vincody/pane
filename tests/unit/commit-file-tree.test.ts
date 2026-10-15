import test from 'node:test';
import assert from 'node:assert/strict';
import {commitFileTree} from '../../client/src/features/git/commit-file-tree.ts';

test('commit file tree groups and compacts directories while retaining file identity and rename metadata',()=>{
 const files=[{path:'client/src/features/git/graph.ts',status:'A',added:20,removed:0},{path:'README.md',status:'M'},{path:'client/src/app/main.ts',previousPath:'old.ts',status:'R'},{path:'client/src/app/config.ts',status:'M'}];
 const tree=commitFileTree(files);assert.equal(tree[0].kind,'directory');assert.equal(tree[0].name,'client/src');assert.equal(tree[1].name,'README.md');
 const directory=tree[0];assert.ok(directory.kind==='directory');assert.deepEqual(directory.children.map(item=>item.name),['app','features/git']);
 const app=directory.children[0];assert.ok(app.kind==='directory');assert.deepEqual(app.children.map(item=>item.name),['config.ts','main.ts']);const renamed=app.children[1];assert.ok(renamed.kind==='file');assert.equal(renamed.file,files[2]);assert.equal(renamed.file.previousPath,'old.ts');assert.deepEqual(commitFileTree([]),[]);
});
