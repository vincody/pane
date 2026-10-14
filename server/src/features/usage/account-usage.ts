import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {codexRequest} from '../codex/codex-control.ts';
import {FileError} from '../files/files.ts';
import type { AccountQuota, Limit, Provider } from '../../../../shared/contracts.ts';
const record=(value: unknown): Record<string, unknown>=>value!==null&&typeof value==='object'?value as Record<string, unknown>:{};
const percentage=(value: unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?Math.min(100,value):null;
export interface QuotaWindows { fiveHour: Limit | null; weekly: Limit | null }
export interface AccountUsageOptions { home?: string; claudeHome?: string; requestCodex?: (method: string, params: Record<string, unknown>)=>Promise<unknown>; fetchClaude?: typeof fetch; now?: ()=>number }
function window(value: unknown,percentKey: string,resetKey: string): Limit | null {const data=record(value),used=percentage(data[percentKey]);if(used===null)return null;const raw=data[resetKey];const milliseconds=typeof raw==='number'?raw*1000:typeof raw==='string'?Date.parse(raw):NaN;return {usedPercent:used,resetsAt:Number.isFinite(milliseconds)?new Date(milliseconds).toISOString():null};}
export function codexQuota(reply: unknown): QuotaWindows {const data=record(reply),rateLimits=record(data.rateLimits),limits=record(record(data.rateLimitsByLimitId).codex || (rateLimits.limitId==null || rateLimits.limitId==='codex'?rateLimits:null));const windows=[limits.primary,limits.secondary];return {fiveHour:window(windows.find(item=>record(item).windowDurationMins===300),'usedPercent','resetsAt'),weekly:window(windows.find(item=>record(item).windowDurationMins===10080),'usedPercent','resetsAt')};}
export function claudeQuota(reply: unknown): QuotaWindows {const data=record(reply);return {fiveHour:window(data.five_hour,'utilization','resets_at'),weekly:window(data.seven_day,'utilization','resets_at')};}
export function createAccountUsage({home=os.homedir(),requestCodex=codexRequest,fetchClaude=fetch,now=Date.now,claudeHome=process.env.CLAUDE_CONFIG_DIR || path.join(home,'.claude')}: AccountUsageOptions={}){
 const cache=new Map<Provider,{value: AccountQuota; expires: number}>(),pending=new Map<Provider,Promise<AccountQuota>>();
 async function readProvider(provider: Provider): Promise<AccountQuota>{const cached=cache.get(provider);if(cached&&now()<cached.expires)return cached.value;const current=pending.get(provider);if(current)return current;
 const task=(async()=>{await Promise.resolve();let ttl=provider==='claude'?300000:60000;try{
   let quota;
   if(provider==='codex')quota=codexQuota(await requestCodex('account/rateLimits/read',{}));
   else{let token=process.env.CLAUDE_CODE_OAUTH_TOKEN;
    if(!token){try{const file=path.join(claudeHome,'.credentials.json');if((await fs.stat(file)).size>65536)throw new Error();const raw=record(record(JSON.parse(await fs.readFile(file,'utf8'))).claudeAiOauth).accessToken;if(typeof raw==='string')token=raw;}catch{}}
    if(typeof token!=='string'||!token)throw new FileError(401,'Sign in to Claude Code to view quota.');
    const response=await fetchClaude('https://api.anthropic.com/api/oauth/usage',{headers:{Authorization:`Bearer ${token}`,'anthropic-beta':'oauth-2025-04-20',Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(8000)});
    if(response.status===429){const retry=Number(response.headers.get('retry-after'));ttl=Math.max(300000,Math.min(3600000,Number.isFinite(retry)?retry*1000:300000));throw new FileError(429,'Claude quota is rate limited. Retrying later.');}
    if(response.status===401)throw new FileError(401,'Claude login expired. Sign in again through Claude Code.');
    if(response.status===403)throw new FileError(403,'Quota is unavailable for this Claude account.');
    if(!response.ok)throw new FileError(502,'Claude quota is temporarily unavailable.');quota=claudeQuota(await response.json());
   }
   const available=Boolean(quota.fiveHour||quota.weekly);const value: AccountQuota={provider,...quota,available,stale:false,updatedAt:new Date(now()).toISOString(),message:available?'':'This account did not provide 5h or weekly limits.'};cache.set(provider,{value,expires:now()+ttl});return value;
  }catch(error){const message=provider==='claude'&&error instanceof FileError?error.message:provider==='codex'?'Codex quota is unavailable. Keep Codex signed in and running.':'Claude quota is temporarily unavailable.';
   const value: AccountQuota=cached?.value.available?{...cached.value,stale:true,message}:{provider,available:false,fiveHour:null,weekly:null,stale:false,updatedAt:null,message};cache.set(provider,{value,expires:now()+ttl});return value;
  }finally{pending.delete(provider);}})();pending.set(provider,task);return task;
 }
 return {async read(providers: unknown){if(!Array.isArray(providers)||providers.some(provider=>provider!=='codex'&&provider!=='claude'))throw new FileError(400,'Unsupported usage provider.');const selected: Provider[]=providers.filter((provider): provider is Provider=>provider==='codex'||provider==='claude');return {providers:await Promise.all([...new Set(selected)].map(readProvider))};}};
}
