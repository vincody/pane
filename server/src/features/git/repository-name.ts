import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute=promisify(execFile);
export function nameFromRemote(remote:string):string|null{
 let pathname:string;
 try{
  if(/^[a-z][\w+.-]*:\/\//i.test(remote)){const url=new URL(remote);if(url.protocol==='file:')return null;pathname=url.pathname;}
  else {if(/^[a-z]:[\\/]/i.test(remote))return null;const match=remote.match(/^(?:[^@\s]+@)?[^:\s/]+:(.+)$/);if(!match)return null;pathname=match[1]!;}
  const name=decodeURIComponent(pathname.replace(/\/+$/,'').split('/').pop()||'').replace(/\.git$/i,'');
  return name&&name.length<=200&&!/[\0\r\n\\/]/.test(name)?name:null;
 }catch{return null;}
}
export async function repositoryName(root:string):Promise<string|null>{
 try{const {stdout}=await execute('git',['-C',root,'config','--local','--get','remote.origin.url'],{windowsHide:true,timeout:5000,maxBuffer:16_384});return nameFromRemote(stdout.trim());}catch{return null;}
}
