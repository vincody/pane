import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {FileError} from './files.ts';

const execute=promisify(execFile);
export async function createProjectFolder(input:Record<string,unknown>):Promise<string>{
 if(input.mode!=='create'&&input.mode!=='clone')throw new FileError(400,'Choose how to add the workspace.');
 const name=typeof input.name==='string'?input.name.trim():'';
 if(!name||name.length>80||/[<>:"/\\|?*\x00-\x1f]/.test(name)||/[. ]$/.test(name)||name==='.'||name==='..'||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))throw new FileError(400,'Use a valid folder name of up to 80 characters.');
 if(typeof input.parent!=='string'||!path.isAbsolute(input.parent)||input.parent.includes('\0'))throw new FileError(400,'Choose an absolute parent folder.');
 let parent:string;
 try{parent=await fs.realpath(input.parent);if(!(await fs.stat(parent)).isDirectory())throw new Error();}catch{throw new FileError(400,'Choose an existing parent folder.');}
 const url=typeof input.url==='string'?input.url.trim():'';
 if(input.mode==='clone'&&(!url||url.length>4096||/[\x00-\x20]/.test(url)||url.startsWith('-')||!(/^(https?:\/\/|ssh:\/\/|git:\/\/)/i.test(url)||/^[\w.-]+@[\w.-]+:.+/.test(url))))throw new FileError(400,'Enter an HTTPS or SSH Git repository URL.');
 const directory=path.join(parent,name);
 try{await fs.mkdir(directory);}catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')throw new FileError(409,'That folder already exists. Browse to open it or choose another name.');throw new FileError(400,'Could not create the folder. Check its location and permissions.');}
 try{
  const args=input.mode==='clone'?['-c','protocol.ext.allow=never','clone','--',url,directory]:['init','-b','main','--',directory];
  await execute('git',args,{windowsHide:true,timeout:300_000,maxBuffer:2*1024*1024,env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});
 }catch{throw new FileError(400,`${input.mode==='clone'?'Could not clone the repository. Check the URL, connection and Git access.':'Could not initialize Git. Check that Git is installed.'} Any folder created has been kept at ${directory}.`);}
 return directory;
}
