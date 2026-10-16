import manifest from './file-icon-manifest.json';
const icons=manifest as {file:string;folder:string;folderOpen:string;fileNames:Record<string,string>;fileExtensions:Record<string,string>;folderNames:Record<string,string>};
const baseName=(path:string)=>String(path||'').replace(/(?::\d+(?::\d+)?|#L\d+(?:C\d+)?)$/,'').split(/[\/]/).pop()||'';
/** Material Icon Theme name for a file: exact name first, then the longest matching extension ("d.ts" before "ts"). */
export function fileIconName(path:string){
 const name=baseName(path),lower=name.toLowerCase(),exact=icons.fileNames[name]||icons.fileNames[lower];
 if(exact)return exact;
 const dot=lower.indexOf('.');
 if(dot!==-1){const parts=lower.slice(dot+1).split('.');for(let index=0;index<parts.length;index++){const icon=icons.fileExtensions[parts.slice(index).join('.')];if(icon)return icon;}}
 return icons.file;
}
export function folderIconName(name:string,open=false){
 const icon=icons.folderNames[baseName(name).toLowerCase()];
 return icon?(open?`${icon}-open`:icon):open?icons.folderOpen:icons.folder;
}
