export function formatMemory(bytes:number){
 if(!Number.isFinite(bytes)||bytes<=0)return '0 MB';
 const mb=bytes/(1024*1024);
 return mb>=1024?`${(mb/1024).toFixed(mb>=10*1024?0:1)} GB`:`${Math.round(mb)} MB`;
}
export const formatCpu=(cpu:number|null)=>cpu===null?'—':cpu>=10?`${Math.round(cpu)}%`:`${cpu.toFixed(1)}%`;
