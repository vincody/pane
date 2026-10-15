import fs from 'node:fs/promises';
import type {AppUpdater} from 'electron-updater';
import type {DesktopUpdateState} from '../shared/desktop-updates.ts';

export type UpdateEngine=Pick<AppUpdater,'on'|'autoDownload'|'autoInstallOnAppQuit'|'allowPrerelease'|'allowDowngrade'|'checkForUpdates'|'downloadUpdate'|'quitAndInstall'>;
interface Options {engine:UpdateEngine;version:string;platform:string;supported:boolean;preferencesFile:string;publish:(state:DesktopUpdateState)=>void;log:(message:string)=>unknown}
export async function createUpdates(options:Options){
 const {engine,publish,log}=options;
 let automatic=true;try{automatic=JSON.parse(await fs.readFile(options.preferencesFile,'utf8')).automatic!==false;}catch{}
 let state:DesktopUpdateState={version:options.version,platform:options.platform,supported:options.supported,automatic,status:options.supported?'idle':'unsupported',latestVersion:null,releaseNotes:'',progress:0,checkedAt:null,message:options.supported?'Check for a newer version of Pane.':'Updates are available in the installed Windows x64 app. Development builds do not download updates.'};
 let operation=false,preferenceWrite=Promise.resolve();
 const send=(patch:Partial<DesktopUpdateState>)=>{state={...state,...patch};publish({...state});};
 const failed=(error:unknown)=>{
  const detail=error instanceof Error?error.message:String(error),code=error&&typeof error==='object'&&'code' in error?error.code:undefined;
  void log(`Updater: ${detail}`);
  const message=code==='ERR_UPDATER_NO_PUBLISHED_VERSIONS'||detail==='No published versions on GitHub'
   ?'Pane has no public releases yet. Updates will become available after the first release is published on GitHub.'
   :code==='ERR_UPDATER_CHANNEL_FILE_NOT_FOUND'
    ?'The latest release is missing its Windows update files. The release needs a Windows installer and latest.yml before Pane can check for updates.'
    :'Could not complete the update. Check your connection and try again.';
  send({status:'error',message});
 };
 const info=(value:unknown)=>{
  const data=value&&typeof value==='object'?value as Record<string,unknown>:{};
  const notes=typeof data.releaseNotes==='string'?data.releaseNotes:Array.isArray(data.releaseNotes)?data.releaseNotes.map(item=>item&&typeof item==='object'&&typeof item.note==='string'?item.note:'').join('\n'):'';
  // Render release notes as bounded text, never remote HTML.
  return {latestVersion:typeof data.version==='string'?data.version.slice(0,80):null,releaseNotes:notes.replace(/<[^>]*>/g,'').slice(0,16000)};
 };
 engine.autoDownload=false;engine.autoInstallOnAppQuit=false;engine.allowPrerelease=false;engine.allowDowngrade=false;
 engine.on('error',failed);
 engine.on('update-available',value=>send({...info(value),status:'available',progress:0,message:'A new version of Pane is available.'}));
 engine.on('update-not-available',()=>send({status:'current',latestVersion:null,releaseNotes:'',message:'You are using the latest published version.'}));
 engine.on('download-progress',value=>send({status:'downloading',progress:Number.isFinite(value.percent)?Math.max(0,Math.min(100,value.percent)):0,message:'Downloading update…'}));
 engine.on('update-downloaded',value=>send({...info(value),status:'downloaded',progress:100,message:'Update ready. Restart Pane when you are ready to install.'}));
 async function check(){
  if(!state.supported||operation||state.status==='downloaded')return;
  operation=true;send({status:'checking',message:'Checking for updates…'});
  try{await engine.checkForUpdates();}catch(error){failed(error);}finally{operation=false;send({checkedAt:new Date().toISOString()});}
 }
 async function download(){
  if(!state.supported||operation||state.status!=='available')return;
  operation=true;send({status:'downloading',progress:0,message:'Downloading update…'});
  try{await engine.downloadUpdate();}catch(error){failed(error);}finally{operation=false;}
 }
 async function setAutomatic(value:boolean){
  const save=preferenceWrite.then(async()=>{const temporary=options.preferencesFile+'.tmp';await fs.writeFile(temporary,JSON.stringify({automatic:value}));await fs.rename(temporary,options.preferencesFile);send({automatic:value});});
  preferenceWrite=save.catch(()=>{});
  await save;
 }
 const startup=setTimeout(()=>{if(state.automatic)void check();},30000);
 const periodic=setInterval(()=>{if(state.automatic)void check();},6*60*60*1000);
 startup.unref();periodic.unref();
 return {get:()=>({...state}),check,download,setAutomatic,ready:()=>state.status==='downloaded',install:()=>{if(state.status==='downloaded')engine.quitAndInstall(false,true);},dispose:()=>{clearTimeout(startup);clearInterval(periodic);}};
}
