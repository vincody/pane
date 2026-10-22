/** Short "worked for" text, or '' when the turn was too brief or the time is unknown. */
export function formatWorked(ms:number|undefined){
  if(ms===undefined||!Number.isFinite(ms)||ms<1000)return '';
  const total=Math.floor(ms/1000),hours=Math.floor(total/3600),minutes=Math.floor(total%3600/60),seconds=total%60;
  return hours?`${hours}h ${minutes}m`:minutes?`${minutes}m ${seconds}s`:`${seconds}s`;
}
