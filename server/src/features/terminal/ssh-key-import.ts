import {copyFile,mkdir,stat,readFile,chmod} from 'node:fs/promises';
import {homedir} from 'node:os';
import path from 'node:path';
import {FileError} from '../files/files.ts';
import {protectSshKey} from './ssh-key-permissions.ts';
// Imported keys are copied next to the user's own OpenSSH keys, so the connection survives the original file being moved or deleted.
export function importedKeyDir(home=homedir()){return path.join(home,'.ssh','pane-keys');}
export async function importSshKey(source:string,dir=importedKeyDir()):Promise<string>{
 const info=await stat(source).catch(()=>null);
 if(!info?.isFile())throw new FileError(400,'The selected key file was not found.');
 if(info.size>65_536)throw new FileError(400,'The selected file is too large to be an SSH private key.');
 const head=(await readFile(source,'utf8')).slice(0,200);
 if(!/PRIVATE KEY|PuTTY-User-Key-File/.test(head))throw new FileError(400,'The selected file is not an SSH private key.');
 if(path.dirname(path.resolve(source))===path.resolve(dir))return path.resolve(source);
 await mkdir(dir,{recursive:true,mode:0o700});
 const parsed=path.parse(source);let target=path.join(dir,parsed.base);
 for(let index=2;await stat(target).then(()=>true,()=>false);index++){
  if((await readFile(target,'utf8').catch(()=>''))===(await readFile(source,'utf8')))return target;
  target=path.join(dir,`${parsed.name}-${index}${parsed.ext}`);
 }
 await copyFile(source,target);
 await chmod(target,0o600).catch(()=>{});protectSshKey(target);
 return target;
}
