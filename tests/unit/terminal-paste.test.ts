import {test} from 'node:test';
import assert from 'node:assert/strict';
import {copyTerminalSelection,isCopyShortcut,isPasteShortcut,pasteIntoTerminal,sanitizePasteText,terminalPasteText} from '../../client/src/features/terminal/terminal-paste.ts';

const key=(over:Partial<Parameters<typeof isPasteShortcut>[0]>)=>({type:'keydown',ctrlKey:false,shiftKey:false,altKey:false,metaKey:false,code:'KeyV',...over});

test('paste shortcuts are Ctrl+V, Ctrl+Shift+V and Shift+Insert, or Cmd+V on macOS',()=>{
 assert.equal(isPasteShortcut(key({ctrlKey:true}),'win32'),true);
 assert.equal(isPasteShortcut(key({ctrlKey:true,shiftKey:true}),'win32'),true);
 assert.equal(isPasteShortcut(key({shiftKey:true,code:'Insert'}),'win32'),true);
 assert.equal(isPasteShortcut(key({metaKey:true}),'darwin'),true);
 assert.equal(isPasteShortcut(key({ctrlKey:true}),'darwin'),false);
 assert.equal(isPasteShortcut(key({ctrlKey:true,altKey:true}),'win32'),false);
 assert.equal(isPasteShortcut(key({ctrlKey:true,type:'keyup'}),'win32'),false);
 assert.equal(isPasteShortcut(key({}),'win32'),false);
});

test('pasted text drops escape characters and paths with spaces are quoted',()=>{
 assert.equal(sanitizePasteText('a\x1b[201~b'),'a\u241b[201~b');
 assert.equal(terminalPasteText({kind:'text',text:'hi\nthere'}),'hi\nthere');
 assert.equal(terminalPasteText({kind:'files',paths:['C:\\a b\\c.png','C:\\d.txt']}),'"C:\\a b\\c.png" C:\\d.txt');
 assert.equal(terminalPasteText({kind:'image',path:'C:\\tmp\\pane-paste-1.png'}),'C:\\tmp\\pane-paste-1.png');
 assert.equal(terminalPasteText({kind:'empty'}),'');
});

test('paste sends clipboard content to the terminal and reports errors',async()=>{
 const run=async(content:Parameters<typeof terminalPasteText>[0]|Error|undefined)=>{
  const calls:string[]=[],notices:string[]=[];
  await pasteIntoTerminal({paste:text=>calls.push(text)},content===undefined?undefined:async()=>{if(content instanceof Error)throw content;return content;},message=>notices.push(message));
  return {calls,notices};
 };
 assert.deepEqual(await run({kind:'text',text:'hi'}),{calls:['hi'],notices:[]});
 assert.deepEqual(await run({kind:'image',path:'C:\\x.png'}),{calls:['C:\\x.png'],notices:[]});
 assert.deepEqual(await run({kind:'empty'}),{calls:[],notices:[]});
 assert.deepEqual(await run({kind:'error',message:'too large'}),{calls:[],notices:['too large']});
 assert.deepEqual(await run(new Error('ipc')),{calls:[],notices:['Could not read the clipboard.']});
 assert.deepEqual(await run(undefined),{calls:[],notices:[]});
});

test('copy shortcuts are Ctrl+Shift+C and Ctrl+Insert, or Cmd+C on macOS; plain Ctrl+C stays an interrupt',()=>{
 assert.equal(isCopyShortcut(key({ctrlKey:true,shiftKey:true,code:'KeyC'}),'win32'),true);
 assert.equal(isCopyShortcut(key({ctrlKey:true,code:'Insert'}),'win32'),true);
 assert.equal(isCopyShortcut(key({metaKey:true,code:'KeyC'}),'darwin'),true);
 assert.equal(isCopyShortcut(key({ctrlKey:true,code:'KeyC'}),'win32'),false);
});

test('copying writes the selection and ignores an empty one',async()=>{
 const written:string[]=[];
 const write=async(text:string)=>{written.push(text);};
 assert.equal(await copyTerminalSelection({hasSelection:()=>true,getSelection:()=>'abc'},write),true);
 assert.equal(await copyTerminalSelection({hasSelection:()=>false,getSelection:()=>''},write),false);
 assert.deepEqual(written,['abc']);
});
