import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=(file:string)=>fs.readFileSync(new URL(`../../${file}`,import.meta.url));
const pngSignature='89504e470d0a1a0a';
test('the Windows icon holds every size the taskbar, tray and installer ask for',()=>{
 const ico=read('desktop/icons/icon.ico'),count=ico.readUInt16LE(4),sizes:number[]=[];
 assert.equal(ico.readUInt16LE(2),1);
 for(let index=0;index<count;index++){
  const entry=6+index*16,size=ico[entry]||256,offset=ico.readUInt32LE(entry+12);
  assert.equal(ico.subarray(offset,offset+8).toString('hex'),pngSignature);
  assert.equal(ico.readUInt32BE(offset+16),size);assert.equal(ico.readUInt32BE(offset+20),size);sizes.push(size);
 }
 assert.deepEqual(sizes,[16,24,32,48,64,128,256]);
});
test('the window and tray PNG is 256px and the in-app logo is the same artwork',()=>{
 const png=read('desktop/icons/icon.png');
 assert.equal(png.subarray(0,8).toString('hex'),pngSignature);assert.equal(png.readUInt32BE(16),256);assert.equal(png.readUInt32BE(20),256);
 assert.equal(read('client/public/pane.svg').toString(),read('desktop/icons/pane.svg').toString());
});
