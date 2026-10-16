export const UPDATE_CHECK_INTERVAL=6*60*60*1000;
const RETRY_INTERVAL=15*60*1000;

export function createUpdateSchedule(options:{enabled:()=>boolean;check:()=>Promise<void>}){
 // The first check runs shortly after every launch; a recent successful check must not hide a release published since.
 let due=Date.now()+5000;
 let timer:ReturnType<typeof setTimeout>|undefined,disposed=false,running=false,failures=0;
 function schedule(){
  clearTimeout(timer);timer=undefined;
  if(disposed||!options.enabled())return;
  timer=setTimeout(()=>{void activity();},Math.max(0,due-Date.now()));timer.unref();
 }
 function completed(success:boolean){
  if(success)failures=0;else failures++;
  due=Date.now()+(success?UPDATE_CHECK_INTERVAL:Math.min(RETRY_INTERVAL*2**Math.min(failures-1,5),UPDATE_CHECK_INTERVAL));schedule();
 }
 async function activity(){
  if(disposed||!options.enabled()||running||Date.now()<due)return;
  running=true;
  try{await options.check();}catch{completed(false);}finally{
   running=false;
   // Downloads/installations can defer checks without producing an outcome.
   if(due<=Date.now())due=Date.now()+60000;
   schedule();
  }
 }
 schedule();
 return {activity,completed,refresh:schedule,dispose(){disposed=true;clearTimeout(timer);}};
}
