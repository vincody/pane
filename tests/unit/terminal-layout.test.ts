import test from 'node:test';
import assert from 'node:assert/strict';
import {leaves,removePane,splitPane,swapPanes,chooseBalancedSplit} from '../../client/src/features/terminal/terminal-layout.ts';
import type {PaneTree} from '../../client/src/features/terminal/terminal-layout.ts';
test('nested splits preserve sessions and collapse only the closed pane',()=>{
  const a={id:'a'},b={id:'b'},c={id:'c'};
  let root=splitPane({session:a},a,b,'right');
  root=splitPane(root,a,c,'down');
  assert.deepEqual(leaves(root),[a,c,b]);
  assert.ok('first' in root && 'direction' in root.first);
  assert.equal(root.first.direction,'down');
  const remaining=removePane(root,a);
  assert.deepEqual(leaves(remaining),[c,b]);
  assert.ok(remaining && 'first' in remaining && 'session' in remaining.first);
  assert.equal(remaining.first.session,c);
  assert.equal(removePane(removePane(remaining,c),b),null);
});
test('swapping keeps split structure and ratios',()=>{
 const a={id:'a'},b={id:'b'},c={id:'c'};
 const tree:PaneTree<typeof a>={direction:'right',ratio:.6,first:{session:a},second:{direction:'down',ratio:.3,first:{session:b},second:{session:c}}};
 const swapped=swapPanes(tree,a,c);
 assert.deepEqual(leaves(swapped),[c,b,a]);assert.ok('second' in swapped && 'ratio' in swapped.second);assert.equal(swapped.ratio,.6);assert.equal(swapped.second.ratio,.3);
});
test('auto split balances depth, then size, then recent focus',()=>{
 const a={id:'a',lastUsed:1},b={id:'b',lastUsed:2};
 let root=splitPane({session:a},a,b,'right');
 assert.equal(chooseBalancedSplit(root).session,b);
 assert.equal(chooseBalancedSplit(root,session=>session===a?200:100).session,a);
 for(let i=2;i<8;i++){const choice=chooseBalancedSplit(root);root=splitPane(root,choice.session,{id:String(i),lastUsed:i},choice.direction);}
 const depths:number[]=[];const visit=(node:PaneTree<typeof a>,depth=0):void=>{if('session' in node)depths.push(depth);else{visit(node.first,depth+1);visit(node.second,depth+1);}};visit(root);
 assert.deepEqual(depths,[3,3,3,3,3,3,3,3]);
});
