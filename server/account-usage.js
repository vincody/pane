import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {codexRequest} from './codex-control.js';
import {FileError} from './files.js';
const percentage=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?Math.min(100,value):null;
function window(value,percentKey,resetKey){const used=percentage(value?.[percentKey]);if(used===null)return null;const raw=value?.[resetKey];const milliseconds=typeof raw==='number'?raw*1000:typeof raw==='string'?Date.parse(raw):NaN;return {usedPercent:used,resetsAt:Number.isFinite(milliseconds)?new Date(milliseconds).toISOString():null};}
export function codexQuota(reply){const limits=reply.rateLimitsByLimitId?.codex || (reply.rateLimits?.limitId==null || reply.rateLimits.limitId==='codex'?reply.rateLimits:null);const windows=[limits?.primary,limits?.secondary];return {fiveHour:window(windows.find(item=>item?.windowDurationMins===300),'usedPercent','resetsAt'),weekly:window(windows.find(item=>item?.windowDurationMins===10080),'usedPercent','resetsAt')};}
export function claudeQuota(reply){return {fiveHour:window(reply.five_hour,'utilization','resets_at'),weekly:window(reply.seven_day,'utilization','resets_at')};}
export function createAccountUsage({home=os.homedir(),requestCodex=codexRequest,fetchClaude=fetch,now=Date.now,claudeHome=process.env.CLAUDE_CONFIG_DIR || path.join(home,'.claude')}={}){
 const cache=new Map(),pending=new Map();
 async function readProvider(provider){const cached=cache.get(provider);if(cached&&now()<cached.expires)return cached.value;if(pending.has(provider))return pending.get(provider);
 const task=(async()=>{await Promise.resolve();let ttl=provider==='claude'?300000:60000;try{
   let quota;
   if(provider==='codex')quota=codexQuota(await requestCodex('account/rateLimits/read',{}));
   else{let token=process.env.CLAUDE_CODE_OAUTH_TOKEN;
    if(!token){try{const file=path.join(claudeHome,'.credentials.json');if((await fs.stat(file)).size>65536)throw new Error();token=JSON.parse(await fs.readFile(file,'utf8')).claudeAiOauth?.accessToken;}catch{}}
    if(typeof token!=='string'||!token)throw new FileError(401,'Sign in to Claude Code to view quota.');
    const response=await fetchClaude('https://api.anthropic.com/api/oauth/usage',{headers:{Authorization:`Bearer ${token}`,'anthropic-beta':'oauth-2025-04-20',Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(8000)});
    if(response.status===429){const retry=Number(response.headers.get('retry-after'));ttl=Math.max(300000,Math.min(3600000,Number.isFinite(retry)?retry*1000:300000));throw new FileError(429,'Claude quota is rate limited. Retrying later.');}
    if(response.status===401)throw new FileError(401,'Claude login expired. Sign in again through Claude Code.');
    if(response.status===403)throw new FileError(403,'Quota is unavailable for this Claude account.');
    if(!response.ok)throw new FileError(502,'Claude quota is temporarily unavailable.');quota=claudeQuota(await response.json());
   }
   const available=Boolean(quota.fiveHour||quota.weekly);const value={provider,...quota,available,stale:false,updatedAt:new Date(now()).toISOString(),message:available?'':'This account did not provide 5h or weekly limits.'};cache.set(provider,{value,expires:now()+ttl});return value;
  }catch(error){const message=provider==='claude'&&error instanceof FileError?error.message:provider==='codex'?'Codex quota is unavailable. Keep Codex signed in and running.':'Claude quota is temporarily unavailable.';
   const value=cached?.value.available?{...cached.value,stale:true,message}:{provider,available:false,fiveHour:null,weekly:null,stale:false,updatedAt:null,message};cache.set(provider,{value,expires:now()+ttl});return value;
  }finally{pending.delete(provider);}})();pending.set(provider,task);return task;
 }
 return {async read(providers){if(!Array.isArray(providers)||providers.some(provider=>!['codex','claude'].includes(provider)))throw new FileError(400,'Unsupported usage provider.');return {providers:await Promise.all([...new Set(providers)].map(readProvider))};}};
}
