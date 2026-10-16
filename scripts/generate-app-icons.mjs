// Renders desktop/icons/pane.svg into icon.png and a multi-size icon.ico. Run: npm run icons:app
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),directory=path.join(root,'desktop/icons');
const sizes=[16,24,32,48,64,128,256];
const svg=await fs.readFile(path.join(directory,'pane.svg'),'utf8');
const browser=await chromium.launch();
try{
 const page=await browser.newPage({deviceScaleFactor:1});
 const render=async size=>{
  await page.setViewportSize({width:size,height:size});
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  return page.screenshot({omitBackground:true,clip:{x:0,y:0,width:size,height:size}});
 };
 const images=[];for(const size of sizes)images.push({size,data:await render(size)});
 const header=Buffer.alloc(6);header.writeUInt16LE(1,2);header.writeUInt16LE(images.length,4);
 const entries=Buffer.alloc(16*images.length);let offset=header.length+entries.length;
 images.forEach(({size,data},index)=>{const at=index*16;entries[at]=size>=256?0:size;entries[at+1]=size>=256?0:size;entries.writeUInt16LE(1,at+4);entries.writeUInt16LE(32,at+6);entries.writeUInt32LE(data.length,at+8);entries.writeUInt32LE(offset,at+12);offset+=data.length;});
 await fs.writeFile(path.join(directory,'icon.ico'),Buffer.concat([header,entries,...images.map(image=>image.data)]));
 await fs.writeFile(path.join(directory,'icon.png'),images.at(-1).data);
 console.log(`App icons written: icon.png (256px) and icon.ico (${sizes.join(', ')}px).`);
}finally{await browser.close();}
