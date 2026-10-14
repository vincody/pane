import type {AccountQuota} from '../../../../shared/contracts.ts';
export function miniQuota(value:AccountQuota|undefined,now=Date.now()){
 const windows:QuotaWindow[]=value?.available?([['5h',value.fiveHour],['7d',value.weekly]] as const).flatMap(([label,limit])=>{
  if(!limit||!Number.isFinite(limit.usedPercent)||limit.resetsAt&&!(Date.parse(limit.resetsAt)>now))return [];
  return [{label,remaining:Math.floor(Math.max(0,Math.min(100,100-limit.usedPercent))),used:limit.usedPercent,resetsAt:limit.resetsAt}];
 }):[];
 return {windows,tightest:windows.reduce<QuotaWindow|null>((best,window)=>!best||window.used>best.used?window:best,null)};
}
export interface QuotaWindow {label:'5h'|'7d';remaining:number;used:number;resetsAt?:string|null}
