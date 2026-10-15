import {build} from 'esbuild';
import fs from 'node:fs/promises';
import {deflateSync} from 'node:zlib';
await fs.mkdir('desktop-build',{recursive:true});
await build({entryPoints:['desktop/main.ts'],outfile:'desktop-build/main.mjs',bundle:true,platform:'node',format:'esm',target:'node22',packages:'external',sourcemap:true});
await fs.copyFile('desktop/preload.cjs','desktop-build/preload.cjs');
// Rasterize Pane's simple window mark without a platform graphics dependency.
const size=256,raw=Buffer.alloc((size*4+1)*size);
for(let y=0;y<size;y++)for(let x=0;x<size;x++){
 const i=y*(size*4+1)+1+x*4,px=x/4,py=y/4;
 const corner=Math.hypot(Math.max(16-px,0,px-48),Math.max(16-py,0,py-48))>16;
 const line=(px>=12&&px<=52&&py>=12&&py<=52)&&(px<15||px>49||py<15||py>49||Math.abs(px-35)<1.75||(px<=35&&Math.abs(py-32)<1.75));
 const color=line?[33,31,28]:[217,119,87];raw.set([...color,corner?0:255],i);
}
function crc(buffer){let value=0xffffffff;for(const byte of buffer){value^=byte;for(let j=0;j<8;j++)value=(value>>>1)^((value&1)?0xedb88320:0);}return (value^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type),length=Buffer.alloc(4),checksum=Buffer.alloc(4);length.writeUInt32BE(data.length);checksum.writeUInt32BE(crc(Buffer.concat([name,data])));return Buffer.concat([length,name,data,checksum]);}
const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
await fs.writeFile('desktop-build/icon.png',png);
const ico=Buffer.alloc(22);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);ico.writeUInt16LE(1,10);ico.writeUInt16LE(32,12);ico.writeUInt32LE(png.length,14);ico.writeUInt32LE(22,18);
await fs.writeFile('desktop-build/icon.ico',Buffer.concat([ico,png]));
console.log('Desktop entry point, preload and icons built.');
