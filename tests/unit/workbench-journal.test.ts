import test from 'node:test';
import assert from 'node:assert/strict';
import {parseWorkbenchJournal} from '../../client/src/features/layout/workbench-journal.ts';
test('workbench journal preserves drafts and split direction, clamps ratios and bounds malformed snapshots',()=>{
 const value={version:1,files:[{project:'p',path:'file.ts',draft:'unsaved',version:'disk-v1',pane:true,view:'preview'},null],layout:{groups:[{project:'p',manual:true,tree:{direction:'right',ratio:12,first:{id:'a'},second:{id:'file:p:file.ts'}}}],selected:{p:'a'}},views:[{project:'p',kind:'pane',classes:['split-vertical','untrusted-class']}],git:['p'],positions:[['terminal:a',1]],selected:'p'};
 const result=parseWorkbenchJournal(value)!;assert.equal(result.files.length,1);assert.equal(result.files[0].draft,'unsaved');assert.deepEqual(result.views[0].classes,['split-vertical']);assert.deepEqual(result.layout.groups[0].tree,{direction:'right',ratio:.85,first:{id:'a'},second:{id:'file:p:file.ts'}});
 assert.equal(parseWorkbenchJournal({version:2}),null);assert.equal(parseWorkbenchJournal(null),null);
 let tree:unknown={id:'leaf'};for(let i=0;i<30;i++)tree={direction:'down',ratio:.5,first:tree,second:{id:'x'}};
 assert.equal(parseWorkbenchJournal({version:1,layout:{groups:[{project:'p',tree}]}})!.layout.groups.length,0);
});
