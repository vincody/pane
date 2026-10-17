import {cpSync,createReadStream,existsSync,statSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,extname,join,resolve,sep} from 'node:path';
import type {Plugin} from 'vite';

// pdf.js loads CJK character maps, the standard 14 fonts and its WebAssembly decoders by URL at runtime.
const DIRECTORIES=['cmaps','standard_fonts','wasm'];
const PREFIX='/pdfjs/';

export function pdfjsAssets():Plugin{
 const root=dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
 return {
  name:'pdfjs-assets',
  configureServer(server){
   server.middlewares.use((request,response,next)=>{
    const pathname=(request.url||'').split('?')[0];
    if(!pathname.startsWith(PREFIX)||request.method!=='GET')return next();
    let relative:string;try{relative=decodeURIComponent(pathname.slice(PREFIX.length));}catch{return next();}
    const [directory]=relative.split('/');
    const file=resolve(root,relative);
    if(!DIRECTORIES.includes(directory)||!file.startsWith(join(root,directory)+sep)||!existsSync(file)||!statSync(file).isFile())return next();
    response.setHeader('Content-Type',extname(file)==='.wasm'?'application/wasm':'application/octet-stream');
    createReadStream(file).pipe(response);
   });
  },
  writeBundle(options){
   const output=options.dir;if(!output)throw new Error('[pdfjs-assets] output directory is required');
   for(const directory of DIRECTORIES){
    const source=join(root,directory);
    if(!existsSync(source))throw new Error(`[pdfjs-assets] missing ${source}`);
    cpSync(source,join(output,'pdfjs',directory),{recursive:true});
   }
  },
 };
}
