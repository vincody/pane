import fs from 'node:fs/promises';
import path from 'node:path';
import {constants} from 'node:fs';
import {Files,FileError,isWithin} from './files.ts';
import type {FileActionResult} from '../../../../shared/file-actions.ts';

export interface NativeFileActions {trash:(absolute:string)=>Promise<void>;reveal:(absolute:string)=>void|Promise<void>}
export function createFileActions(files:Files,native?:NativeFileActions){
 const queues=new Map<string,Promise<unknown>>();
 function validName(value:unknown):string{
  if(typeof value!=='string'||!value||value.length>200||/[<>:"/\\|?*\x00-\x1f]/.test(value)||/[. ]$/.test(value)||value==='.'||value==='..'||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value))throw new FileError(400,'Enter a valid file or folder name without path separators.');
  if(['.git','.ai-web'].includes(value.toLowerCase()))throw new FileError(403,'Workspace metadata cannot be changed here.');return value;
 }
 function relative(value:unknown):string{
  if(typeof value!=='string'||value.includes('\\')||path.posix.isAbsolute(value)||path.win32.isAbsolute(value))throw new FileError(400,'Invalid file path.');
  if(value)for(const part of value.split('/'))validName(part);return value;
 }
 async function source(id:string,file:string,mutation:boolean){
  const root=files.projects.get(id)?.root;if(!root)throw new FileError(404,'Workspace is not open.');
  if(mutation&&!file)throw new FileError(403,'The workspace root cannot be renamed, duplicated or deleted.');
  const lexical=path.resolve(root,file),stat=await fs.lstat(lexical);
  if(stat.isSymbolicLink())throw new FileError(403,'Linked entries cannot be changed here.');
  const target=await files.resolve(id,file);
  if(mutation&&[...files.projects.values()].some(project=>isWithin(target,project.root)))throw new FileError(409,'This folder contains an open workspace. Close that workspace before changing it.');
  return {target,stat};
 }
 async function run(id:string,data:Record<string,unknown>):Promise<FileActionResult>{
  const file=relative(data.path),action=data.action;
  if(!['create-file','create-folder','rename','duplicate','trash','reveal'].includes(String(action)))throw new FileError(400,'Unknown file action.');
  if(action==='create-file'||action==='create-folder'){
   const parent=await files.resolve(id,file);if(!(await fs.stat(parent)).isDirectory())throw new FileError(400,'Choose a folder.');
   const name=validName(data.name),destination=path.join(parent,name);
   if(action==='create-file')await fs.writeFile(destination,'',{flag:'wx'});else await fs.mkdir(destination);
   return {path:path.posix.join(file,name)};
  }
  const {target,stat}=await source(id,file,action!=='reveal');
  if(action==='reveal'){if(!native)throw new FileError(501,'Open File Explorer is available in the desktop app.');await native.reveal(target);return {path:file};}
  if(action==='trash'){if(!native)throw new FileError(501,'Recycle Bin is available in the desktop app.');await native.trash(target);return {path:file};}
  const parent=path.dirname(target),relativeParent=path.posix.dirname(file)==='.'?'':path.posix.dirname(file);
  if(action==='rename'){
   const name=validName(data.name),destination=path.join(parent,name);
   if(destination===target)return {path:file};
   try{await fs.lstat(destination);throw new FileError(409,'A file or folder with that name already exists.');}catch(error){if(!(error&&typeof error==='object'&&'code'in error&&error.code==='ENOENT'))throw error;}
   if(stat.isFile()){
    // An exclusive hard link prevents rename from overwriting a concurrently created file.
    await fs.link(target,destination);await fs.unlink(target);
   }else await fs.rename(target,destination);
   return {path:path.posix.join(relativeParent,name)};
  }
  const extension=stat.isFile()?path.extname(target):'',stem=path.basename(target,extension);
  for(let index=1;index<=100;index++){
   const name=`${stem} copy${index===1?'':` ${index}`}${extension}`,destination=path.join(parent,name);
   try{
    if(stat.isFile())await fs.copyFile(target,destination,constants.COPYFILE_EXCL);
    else if(stat.isDirectory()){
     await fs.mkdir(destination);
     try{for(const entry of await fs.readdir(target))await fs.cp(path.join(target,entry),path.join(destination,entry),{recursive:true,force:false,errorOnExist:true,filter:async source=>{if((await fs.lstat(source)).isSymbolicLink())throw new FileError(403,'Folders containing linked entries cannot be duplicated.');return true;}});}catch{throw new FileError(409,`Could not finish duplicating this folder. A partial copy may remain in "${name}".`);}
    }else throw new FileError(400,'Choose a regular file or folder.');
    return {path:path.posix.join(relativeParent,name)};
   }catch(error){if(error&&typeof error==='object'&&'code'in error&&error.code==='EEXIST')continue;throw error;}
  }
  throw new FileError(409,'Too many copies already exist. Rename an existing copy first.');
 }
 return {capabilities:()=>({trash:Boolean(native),reveal:Boolean(native)}),perform(id:string,data:Record<string,unknown>){
  const previous=queues.get(id)||Promise.resolve();const operation=previous.catch(()=>{}).then(()=>run(id,data)).then(result=>{files.referenceIndexes.delete(id);return result;}).catch(error=>{
   if(error&&typeof error==='object'&&'code'in error&&['EEXIST','ENOTEMPTY'].includes(String(error.code)))throw new FileError(409,'A file or folder with that name already exists.');throw error;
  });queues.set(id,operation);void operation.finally(()=>{if(queues.get(id)===operation)queues.delete(id);}).catch(()=>{});return operation;
 }};
}
