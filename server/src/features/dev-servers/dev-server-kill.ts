import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
const sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
const alive=(pid:number)=>{try{process.kill(pid,0);return true;}catch(error){return (error as NodeJS.ErrnoException).code==='EPERM';}};
/** Stops one process: the whole tree on Windows, SIGTERM then SIGKILL elsewhere. */
export async function terminateProcess(pid:number){
 if(!Number.isSafeInteger(pid)||pid<=4)throw new Error('Refusing to stop this process.');
 if(process.platform==='win32'){await exec('taskkill.exe',['/PID',String(pid),'/T','/F'],{windowsHide:true,timeout:8000});return;}
 process.kill(pid,'SIGTERM');
 for(let attempt=0;attempt<30;attempt++){await sleep(100);if(!alive(pid))return;}
 process.kill(pid,'SIGKILL');
}
