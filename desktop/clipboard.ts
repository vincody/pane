import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import type {ClipboardPaste} from '../shared/desktop-clipboard.ts';

export const MAX_PASTE_TEXT_BYTES=5*1024*1024;
export const MAX_PASTE_IMAGE_BYTES=25*1024*1024;
export const MAX_PASTE_FILES=20;
export const PASTE_IMAGE_MAX_AGE_MS=24*60*60*1000;
const IMAGE_PREFIX='pane-paste-';
interface ClipboardItemLike {types:readonly string[];getType(type:string):Promise<Blob>}
export interface ClipboardLike {read():Promise<ClipboardItemLike[]>;readText():Promise<string>}

export function filePathsFromUriList(list:string){
 const paths:string[]=[];
 for(const line of list.split(/\r?\n/)){
  if(!line||line.startsWith('#'))continue;
  try{if(line.startsWith('file:'))paths.push(fileURLToPath(line));}catch{}
 }
 return paths.slice(0,MAX_PASTE_FILES);
}

async function removeOldPasteImages(folder:string,now:number){
 try{for(const name of await fs.readdir(folder))if(name.startsWith(IMAGE_PREFIX)){const file=path.join(folder,name);try{if(now-(await fs.stat(file)).mtimeMs>PASTE_IMAGE_MAX_AGE_MS)await fs.rm(file,{force:true});}catch{}}}catch{}
}

// Files copied in Explorer, then text, then a screenshot or copied image saved as a temp PNG whose path is pasted.
export async function readClipboardForPaste(clipboard:ClipboardLike,folder:string,now=Date.now()):Promise<ClipboardPaste>{
 try{
  const items=await clipboard.read();
  for(const item of items)if(item.types.includes('text/uri-list')){
   const paths=filePathsFromUriList(await (await item.getType('text/uri-list')).text());
   if(paths.length)return {kind:'files',paths};
  }
  const text=await clipboard.readText();
  if(text){
   if(Buffer.byteLength(text)>MAX_PASTE_TEXT_BYTES)return {kind:'error',message:'The clipboard text is too large to paste into a terminal.'};
   return {kind:'text',text};
  }
  for(const item of items){
   const type=item.types.find(value=>value==='image/png')||item.types.find(value=>value.startsWith('image/'));
   if(!type)continue;
   const blob=await item.getType(type);
   if(blob.size>MAX_PASTE_IMAGE_BYTES)return {kind:'error',message:'The clipboard image is too large to paste.'};
   await fs.mkdir(folder,{recursive:true});await removeOldPasteImages(folder,now);
   const file=path.join(folder,`${IMAGE_PREFIX}${now}-${randomUUID()}.${type==='image/png'?'png':type.slice(6).replace(/[^a-z0-9]/gi,'')||'img'}`);
   await fs.writeFile(file,Buffer.from(await blob.arrayBuffer()));
   return {kind:'image',path:file};
  }
 }catch{return {kind:'error',message:'Could not read the clipboard.'};}
 return {kind:'empty'};
}
