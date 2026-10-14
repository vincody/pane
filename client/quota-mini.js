export function miniQuota(value,now=Date.now()){
 const windows=value?.available?[['5h',value.fiveHour],['7d',value.weekly]].flatMap(([label,limit])=>{
  if(!limit||!Number.isFinite(limit.usedPercent)||limit.resetsAt&&!(Date.parse(limit.resetsAt)>now))return [];
  return [{label,remaining:Math.floor(Math.max(0,Math.min(100,100-limit.usedPercent))),used:limit.usedPercent,resetsAt:limit.resetsAt}];
 }):[];
 return {windows,tightest:windows.reduce((best,window)=>!best||window.used>best.used?window:best,null)};
}
