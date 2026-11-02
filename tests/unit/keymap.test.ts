import test from 'node:test';
import assert from 'node:assert/strict';
import {commandFor,shortcutFor,DEFAULT_KEYS} from '../../client/src/features/palette/keymap.ts';
import {fuzzy} from '../../client/src/features/palette/fuzzy.ts';

const press=(init:Partial<KeyboardEvent>)=>commandFor({ctrlKey:false,metaKey:false,shiftKey:false,altKey:false,isComposing:false,code:'',key:'',...init} as KeyboardEvent);

test('keys resolve to the command they are bound to',()=>{
  assert.equal(press({ctrlKey:true,shiftKey:true,code:'KeyP',key:'P'}),'app.palette');
  assert.equal(press({ctrlKey:true,shiftKey:true,code:'KeyT',key:'T'}),'tab.new');
  assert.equal(press({key:'F2',code:'F2'}),'tab.rename');
  assert.equal(press({ctrlKey:true,code:'Tab',key:'Tab'}),'tab.next');
  assert.equal(press({ctrlKey:true,shiftKey:true,code:'Tab',key:'Tab'}),'tab.prev');
  assert.equal(press({ctrlKey:true,code:'Digit3',key:'3'}),'tab.select:3');
  assert.equal(press({altKey:true,code:'ArrowLeft',key:'ArrowLeft'}),'pane.go:left');
  assert.equal(press({ctrlKey:true,code:'Comma',key:','}),'app.settings');
});
test('a Mac Cmd key counts as Ctrl',()=>{
  assert.equal(press({metaKey:true,shiftKey:true,code:'KeyO',key:'O'}),'pane.split:right');
});
test('unbound keys, extra modifiers and composition do nothing',()=>{
  assert.equal(press({ctrlKey:true,code:'KeyC',key:'c'}),null);
  assert.equal(press({ctrlKey:true,altKey:true,shiftKey:true,code:'KeyP',key:'P'}),null);
  assert.equal(press({ctrlKey:true,shiftKey:true,code:'KeyP',key:'P',isComposing:true}),null);
});
test('no two key strings bind the same chord to different commands',()=>{
  const seen=new Map<string,string>();
  for(const [spec,command] of Object.entries(DEFAULT_KEYS)){const chord=spec.split('-').sort().join('-');assert.ok(!seen.has(chord)||seen.get(chord)===command,`${spec} clashes`);seen.set(chord,command);}
});
test('shortcut labels follow the first key bound to a command',()=>{
  assert.deepEqual(shortcutFor('tab.new'),['Ctrl','Shift','T']);
  assert.deepEqual(shortcutFor('tab.rename'),['F2']);
  assert.equal(shortcutFor('nothing.here'),undefined);
});
test('fuzzy search needs the letters in order and prefers word starts',()=>{
  assert.equal(fuzzy('zzz','Split right'),null);
  assert.deepEqual(fuzzy('sr','Split right')?.hits,[0,6]);
  const start=fuzzy('sr','Split right')!.score,scattered=fuzzy('sr','Toggle sidebar results')!.score;
  assert.ok(start>scattered);
  assert.ok(fuzzy('spl','Split down')!.score>fuzzy('spl','Toggle sidebar please')!.score);
});
