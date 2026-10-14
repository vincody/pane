import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
export function cliBinary(provider){
 const explicit=provider==='codex'?process.env.CODEX_BIN_PATH:process.env.CLAUDE_BIN_PATH;if(explicit)return explicit;
 if(process.platform!=='win32')return provider;
 if(provider==='codex'){
  const managed=path.join(process.env.CODEX_HOME || path.join(os.homedir(),'.codex'),'packages','app-server-daemon','current','bin','codex.exe');if(fs.existsSync(managed))return managed;
  for(const directory of (process.env.PATH || '').split(path.delimiter)){const vendor=path.join(directory,'node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe');if(fs.existsSync(vendor))return vendor;}
 }
 for(const directory of [path.join(os.homedir(),'.local','bin'),...(process.env.PATH || '').split(path.delimiter)]){const binary=path.join(directory,provider+'.exe');if(fs.existsSync(binary))return binary;}
 return provider;
}
