import fs from 'node:fs/promises';
import {createUpdateSchedule} from './update-schedule.ts';
import type {AppUpdater} from 'electron-updater';
import type {DesktopUpdateState} from '../shared/desktop-updates.ts';

export type UpdateEngine=Pick<AppUpdater,'on'|'autoDownload'|'autoInstallOnAppQuit'|'allowPrerelease'|'allowDowngrade'|'checkForUpdates'|'downloadUpdate'|'quitAndInstall'>;
interface Options {engine:UpdateEngine;version:string;platform:string;supported:boolean;preferencesFile:string;publish:(state:DesktopUpdateState)=>void;log:(message:string)=>unknown;installApproved?:()=>Promise<'started'|'busy'|'blocked'|undefined>}
export async function createUpdates(options:Options){
 const {engine,publish,log}=options;
 let persisted:{automatic:boolean;lastSuccessfulCheckAt?:number;checkedAt?:string;available?:{forVersion:string;version:string;releaseNotes:string}|null}={automatic:true};try{const saved=JSON.parse(await fs.readFile(options.preferencesFile,'utf8'));persisted={automatic:saved.automatic!==false,...(Number.isFinite(saved.lastSuccessfulCheckAt)&&saved.lastSuccessfulCheckAt>0&&saved.lastSuccessfulCheckAt<=Date.now()?{lastSuccessfulCheckAt:saved.lastSuccessfulCheckAt}:{}),...(typeof saved.checkedAt==='string'&&Number.isFinite(Date.parse(saved.checkedAt))?{checkedAt:saved.checkedAt}:{})};const cached=saved.available;if(cached&&cached.forVersion===options.version&&typeof cached.version==='string'&&cached.version!==options.version&&cached.version.length<=80&&typeof cached.releaseNotes==='string')persisted.available={forVersion:options.version,version:cached.version,releaseNotes:cached.releaseNotes.replace(/<[^>]*>/g,'').slice(0,16000)};}catch{}
 const cached=options.supported?persisted.available:null;
 const automatic=persisted.automatic;
 let state:DesktopUpdateState={version:options.version,platform:options.platform,supported:options.supported,automatic,status:options.supported?(cached?'available':'idle'):'unsupported',latestVersion:cached?.version||null,releaseNotes:cached?.releaseNotes||'',progress:0,checkedAt:persisted.checkedAt||null,message:options.supported?(cached?'A new version of Pane is available.':'Check for a newer version of Pane.'):'Updates are available in the installed Windows x64 app. Development builds do not download updates.'};
 let operation=false,preferenceWrite=Promise.resolve(),downloaded=false,approved=false,installing=false,disposed=false;
 let retry:ReturnType<typeof setTimeout>|undefined;
 let providerReady=false,checking=false,background=false,outcome:boolean|null=null,pendingCheck:Promise<void>|undefined;
 function cancelApproval(){approved=false;clearTimeout(retry);retry=undefined;}
 const send=(patch:Partial<DesktopUpdateState>)=>{state={...state,...patch};publish({...state});};
 const failed=(error:unknown)=>{
  if(checking){outcome=false;providerReady=false;}
  cancelApproval();
  const detail=error instanceof Error?error.message:String(error),code=error&&typeof error==='object'&&'code' in error?error.code:undefined;
  void log(`Updater: ${detail}`);
  const message=code==='ERR_UPDATER_NO_PUBLISHED_VERSIONS'||detail==='No published versions on GitHub'
   ?'Pane has no public releases yet. Updates will become available after the first release is published on GitHub.'
   :code==='ERR_UPDATER_CHANNEL_FILE_NOT_FOUND'
    ?'The latest release is missing its Windows update files. The release needs a Windows installer and latest.yml before Pane can check for updates.'
    :'Could not complete the update. Check your connection and try again.';
  if(checking&&background&&state.latestVersion){send({status:'available',message:'Could not refresh update information. The previously found update is still available.'});}
  else send({status:'error',message});
 };
 const info=(value:unknown)=>{
  const data=value&&typeof value==='object'?value as Record<string,unknown>:{};
  const notes=typeof data.releaseNotes==='string'?data.releaseNotes:Array.isArray(data.releaseNotes)?data.releaseNotes.map(item=>item&&typeof item==='object'&&typeof item.note==='string'?item.note:'').join('\n'):'';
  // Render release notes as bounded text, never remote HTML.
  return {latestVersion:typeof data.version==='string'?data.version.slice(0,80):null,releaseNotes:notes.replace(/<[^>]*>/g,'').slice(0,16000)};
 };
 engine.autoDownload=false;engine.autoInstallOnAppQuit=false;engine.allowPrerelease=false;engine.allowDowngrade=false;
 engine.on('error',failed);
 engine.on('update-available',value=>{providerReady=true;if(checking)outcome=true;if(!downloaded&&!approved)send({...info(value),status:'available',progress:0,message:'A new version of Pane is available.'});});
 engine.on('update-not-available',()=>{providerReady=false;if(checking)outcome=true;if(!downloaded&&!approved)send({status:'current',latestVersion:null,releaseNotes:'',message:'You are using the latest published version.'});});
 engine.on('download-progress',value=>send({status:'downloading',progress:Number.isFinite(value.percent)?Math.max(0,Math.min(100,value.percent)):0,message:'Downloading update…'}));
 engine.on('update-downloaded',value=>{if(state.status==='installing')return;downloaded=true;send({...info(value),status:'downloaded',progress:100,message:'Update ready. Preparing to restart…'});if(approved&&!operation)void continueUpdate();});
 function persist(patch:Partial<typeof persisted>){
  const save=preferenceWrite.then(async()=>{const next={...persisted,...patch},temporary=options.preferencesFile+'.tmp';await fs.writeFile(temporary,JSON.stringify(next));await fs.rename(temporary,options.preferencesFile);persisted=next;});preferenceWrite=save.catch(()=>{});return save;
 }
 async function check(quiet=false):Promise<void>{
  if(pendingCheck)return pendingCheck;
  if(disposed||!state.supported||operation||downloaded||approved||installing)return;
  operation=true;checking=true;background=quiet;outcome=null;
  if(!quiet||!state.latestVersion)send({status:'checking',message:'Checking for updates…'});
  pendingCheck=(async()=>{
   try{await engine.checkForUpdates();if(outcome===null)failed(new Error('Update check completed without a result.'));}catch(error){failed(error);}
   finally{
    const checkedAt=new Date().toISOString(),success=outcome===true;
    try{await persist({checkedAt,...(success?{lastSuccessfulCheckAt:Date.now(),available:state.latestVersion?{forVersion:options.version,version:state.latestVersion,releaseNotes:state.releaseNotes}:null}:{})});}catch{void log('Could not persist update check time.');}
    operation=false;checking=false;pendingCheck=undefined;send({checkedAt});schedule.completed(success);
   }
  })();return pendingCheck;
 }
 async function download(){
  if(!providerReady&&!downloaded&&!operation&&!approved)await check();
  if(!providerReady||!state.supported||operation||downloaded||!state.latestVersion||!['available','error'].includes(state.status))return;
  operation=true;send({status:'downloading',progress:0,message:'Downloading update…'});
  try{await engine.downloadUpdate();}catch(error){failed(error);}finally{operation=false;if(approved&&downloaded)void continueUpdate();}
 }
 async function continueUpdate(){
  if(!approved||!downloaded||installing||disposed||!options.installApproved)return;
  installing=true;send({status:'waiting',message:'Saving session recovery before installing the update…'});
  try{
   const result=await options.installApproved();
   if(result==='started')cancelApproval();
   else if(result==='busy'&&approved&&!disposed){send({status:'waiting',message:'Update downloaded. Waiting for current file or Git operations to finish before restarting…'});retry=setTimeout(()=>{retry=undefined;void continueUpdate();},1500);retry.unref();}
   else if(!disposed){cancelApproval();send({status:'downloaded',message:'Could not save session recovery. Save your files, then choose Update now to try again.'});}
  }catch(error){failed(error);}finally{installing=false;}
 }
 async function update(){
  if(disposed||!state.supported||operation||approved||installing||!state.latestVersion||!['available','downloaded','error'].includes(state.status)||!options.installApproved)return;
  // Persisted release information is for display; electron-updater still needs
  // a live check to resolve its provider and installer metadata after a restart.
  if(!downloaded&&!providerReady){await check();if(approved||operation||disposed||state.status!=='available'||!providerReady)return;}
  approved=true;
  if(downloaded)await continueUpdate();else await download();
 }
 async function setAutomatic(value:boolean){
  await persist({automatic:value});send({automatic:value});schedule.refresh();
 }
 const schedule=createUpdateSchedule({enabled:()=>state.supported&&state.automatic,check:()=>check(true)});
 return {get:()=>({...state}),check,backgroundCheck:schedule.activity,download,update,setAutomatic,ready:()=>downloaded,install:()=>{if(downloaded&&state.status!=='installing'){send({status:'installing',message:'Installing update and restarting Pane…'});try{engine.quitAndInstall(true,true);}catch(error){failed(error);}}},dispose:()=>{disposed=true;cancelApproval();schedule.dispose();}};
}
