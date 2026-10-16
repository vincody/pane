export interface ResourceUsage {memory:number;cpu:number|null;processes:number}
export interface ResourceTerminal extends ResourceUsage {id:string;project:string;pid:number;agent:string|null;ssh:boolean}
export interface ResourceApp extends ResourceUsage {main:ResourceUsage;renderer:ResourceUsage;gpu:ResourceUsage;other:ResourceUsage}
export interface ResourceSnapshot {
 available:boolean;sampledAt:string;error?:string;
 host:{totalMemory:number;freeMemory:number};
 app:ResourceApp;terminals:ResourceTerminal[];
}
