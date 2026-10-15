import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import type {LocalToolStatus} from '../../../../shared/contracts.ts';
const run=promisify(execFile);
const tools=[['git','Git'],['ssh','OpenSSH'],['codex','Codex CLI'],['claude','Claude Code']] as const;
export async function localTools():Promise<LocalToolStatus[]>{
 return Promise.all(tools.map(async([id,name])=>{
  try{await run(process.platform==='win32'?'where.exe':'which',[id],{windowsHide:true,timeout:5000,maxBuffer:32768});return {id,name,installed:true};}
  catch(error){return {id,name,installed:(error as {code?:unknown}).code===1?false:null};}
 }));
}
