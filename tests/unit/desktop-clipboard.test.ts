import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {filePathsFromUriList,readClipboardForPaste,MAX_PASTE_FILES,PASTE_IMAGE_MAX_AGE_MS} from '../../desktop/clipboard.ts';

const item=(types:Record<string,string|Uint8Array>)=>({types:Object.keys(types),getType:async(type:string)=>new Blob([types[type] as BlobPart],{type})});
const board=(items:ReturnType<typeof item>[],text='')=>({read:async()=>items,readText:async()=>text});

test('file URIs become local paths and other lines are ignored',()=>{
 const win=process.platform==='win32';
 assert.deepEqual(filePathsFromUriList(`# comment\r\n${win?'file:///C:/a%20b/c.png':'file:///tmp/a%20b/c.png'}\r\nhttp://example.com/x\r\n`),[win?'C:\\a b\\c.png':'/tmp/a b/c.png']);
 assert.equal(filePathsFromUriList(Array.from({length:MAX_PASTE_FILES+5},(_,index)=>(win?`file:///C:/tmp/${index}`:`file:///tmp/${index}`)).join('\n')).length,MAX_PASTE_FILES);
});

test('clipboard reads prefer copied files, then text, then save the image as a temp file',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'pane-clip-test-'));
 try{
  assert.equal((await readClipboardForPaste(board([item({'text/uri-list':process.platform==='win32'?'file:///C:/a.png':'file:///tmp/a.png'})],'a.png'),folder)).kind,'files');
  assert.deepEqual(await readClipboardForPaste(board([item({'text/plain':'hi'})],'hi'),folder),{kind:'text',text:'hi'});
  const image=await readClipboardForPaste(board([item({'image/png':new Uint8Array([1,2,3])})]),folder);
  assert.equal(image.kind,'image');
  if(image.kind==='image'){assert.equal(path.dirname(image.path),folder);assert.match(path.basename(image.path),/^pane-paste-\d+-.+\.png$/);assert.deepEqual([...await fs.readFile(image.path)],[1,2,3]);}
  assert.deepEqual(await readClipboardForPaste(board([]),folder),{kind:'empty'});
  assert.equal((await readClipboardForPaste(board([],'x'.repeat(5*1024*1024+1)),folder)).kind,'error');
  assert.equal((await readClipboardForPaste({read:async()=>{throw new Error('boom');},readText:async()=>''},folder)).kind,'error');
 }finally{await fs.rm(folder,{recursive:true,force:true});}
});

test('old pasted images are removed when a new one is saved',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'pane-clip-test-'));
 try{
  const old=path.join(folder,'pane-paste-1-old.png'),other=path.join(folder,'keep.png');await fs.writeFile(old,'x');await fs.writeFile(other,'x');
  const past=new Date(Date.now()-PASTE_IMAGE_MAX_AGE_MS-60000);await fs.utimes(old,past,past);await fs.utimes(other,past,past);
  await readClipboardForPaste(board([item({'image/png':new Uint8Array([1])})]),folder);
  const left=await fs.readdir(folder);
  assert.equal(left.includes('pane-paste-1-old.png'),false);
  assert.equal(left.includes('keep.png'),true);
 }finally{await fs.rm(folder,{recursive:true,force:true});}
});
