export {BROWSER_PARTITION} from '../shared/browser.ts';
const LOOPBACK=new Set(['127.0.0.1','localhost','[::1]','::1']);
/** An http(s) address without embedded credentials, or null. */
export function webAddress(value:string):URL|null{
 try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url:null;}catch{return null;}
}
/** True when `target` points at Pane's own local server, which pages in the browser must never reach. */
export function isPaneAddress(target:URL,paneOrigin:string){
 if(!paneOrigin)return false;
 const pane=new URL(paneOrigin);
 return target.port===pane.port&&target.protocol===pane.protocol&&(target.hostname===pane.hostname||LOOPBACK.has(target.hostname));
}
/** Any request a page makes (including WebSocket and redirects) that would land on Pane's own server. */
export function isPaneRequest(value:string,paneOrigin:string){
 try{const url=new URL(value);const mapped=url.protocol==='ws:'?'http:':url.protocol==='wss:'?'https:':url.protocol;if(!['http:','https:'].includes(mapped))return false;url.protocol=mapped;return isPaneAddress(url,paneOrigin);}catch{return false;}
}
/** Pages should see a normal Chromium browser, not an "Electron" or "Pane" app. */
export function cleanUserAgent(userAgent:string,appName:string){
 return userAgent.replace(/\sElectron\/\S+/,'').replace(new RegExp(`\\s${appName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}/\\S+`),'');
}
