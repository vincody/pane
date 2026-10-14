import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
export function cliBinary(provider:string){
 const explicit=provider==='codex'?process.env.CODEX_BIN_PATH:provider==='claude'?process.env.CLAUDE_BIN_PATH:provider==='antigravity'||provider==='agy'?process.env.ANTIGRAVITY_BIN_PATH||process.env.AGY_BIN_PATH:undefined;if(explicit)return explicit;
 const names=provider==='antigravity'?[provider,'agy']:provider==='agy'?['agy','antigravity']:[provider];
 if(process.platform!=='win32')return names[0];
 if(provider==='codex'){
  const managed=path.join(process.env.CODEX_HOME || path.join(os.homedir(),'.codex'),'packages','app-server-daemon','current','bin','codex.exe');if(fs.existsSync(managed))return managed;
  for(const directory of (process.env.PATH || '').split(path.delimiter)){const vendor=path.join(directory,'node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe');if(fs.existsSync(vendor))return vendor;}
 }
 const searchDirs=[
  ...(provider==='antigravity'||provider==='agy'?[
   path.join(process.env.LOCALAPPDATA || path.join(os.homedir(),'AppData','Local'),'agy','bin'),
   path.join(process.env.LOCALAPPDATA || path.join(os.homedir(),'AppData','Local'),'antigravity','bin'),
  ]:[]),
  path.join(os.homedir(),'.local','bin'),
  ...(process.env.PATH || '').split(path.delimiter)
 ];
 for(const directory of searchDirs){for(const name of names){const binary=path.join(directory,name+'.exe');if(fs.existsSync(binary))return binary;}}
 return names[0];
}
