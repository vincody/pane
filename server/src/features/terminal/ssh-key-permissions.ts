import {execFileSync} from 'node:child_process';
import os from 'node:os';

// Well-known SIDs, so the fix does not depend on the Windows display language.
const BROAD_GROUPS=['*S-1-1-0','*S-1-5-11','*S-1-5-32-545'];

export const sshKeyAclCommands=(key:string,user:string)=>[
 ['/grant:r',`${user}:(R)`],
 ['/inheritance:r'],
 ['/remove:g',...BROAD_GROUPS],
].map(args=>[key,...args]);

// OpenSSH on Windows ignores a private key that other accounts can read (for example one inside a shared project folder).
// Leave only the current user with read access; failures are ignored so ssh itself reports the problem.
export function protectSshKey(key:string,run:(args:string[])=>void=args=>{execFileSync('icacls',args,{stdio:'ignore',timeout:5000,windowsHide:true});},platform=process.platform){
 if(platform!=='win32')return;
 const user=process.env.USERDOMAIN?`${process.env.USERDOMAIN}\${os.userInfo().username}`:os.userInfo().username;
 for(const args of sshKeyAclCommands(key,user)){try{run(args);}catch{return;}}
}
