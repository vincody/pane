import {app,session,type WebContents} from 'electron';
import {BROWSER_PARTITION} from '../shared/browser.ts';
import {cleanUserAgent,isPaneAddress,isPaneRequest,webAddress} from './browser-url.ts';
const ALLOWED_PERMISSIONS=new Set(['fullscreen','clipboard-sanitized-write']);
/** Lets only Pane's Browser tab attach a <webview>, in its own session and without any access to Pane or Node. */
export function installBrowserGuards(host:WebContents,getOrigin:()=>string){
 const browserSession=session.fromPartition(BROWSER_PARTITION);
 browserSession.setUserAgent(cleanUserAgent(browserSession.getUserAgent(),app.getName()));
 browserSession.setPermissionRequestHandler((_contents,permission,callback)=>callback(ALLOWED_PERMISSIONS.has(permission)));
 browserSession.setPermissionCheckHandler((_contents,permission)=>ALLOWED_PERMISSIONS.has(permission));
 browserSession.setDevicePermissionHandler(()=>false);
 // Whatever the path (typed address, redirect, fetch, WebSocket), a page in the browser never reaches Pane's own server.
 browserSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:isPaneRequest(details.url,getOrigin())}));
 const blocked=(address:string)=>{const target=webAddress(address);return !target||isPaneAddress(target,getOrigin());};
 host.on('will-attach-webview',(event,webPreferences,params)=>{
  if(params.partition!==BROWSER_PARTITION||(params.src&&blocked(params.src))){event.preventDefault();return;}
  webPreferences.preload=undefined;Reflect.deleteProperty(webPreferences,'preloadURL');
  webPreferences.nodeIntegration=false;webPreferences.nodeIntegrationInSubFrames=false;webPreferences.contextIsolation=true;
  webPreferences.sandbox=true;webPreferences.webSecurity=true;webPreferences.allowRunningInsecureContent=false;
 });
 app.on('web-contents-created',(_event,contents)=>{
  if(contents.getType()!=='webview'||contents.hostWebContents!==host)return;
  contents.setWindowOpenHandler(({url})=>{if(!blocked(url)&&!host.isDestroyed())host.send('pane:browser-open',url);return {action:'deny'};});
  contents.on('will-navigate',(event,url)=>{if(blocked(url))event.preventDefault();});
  contents.on('will-redirect',(event,url)=>{if(blocked(url))event.preventDefault();});
 });
}
