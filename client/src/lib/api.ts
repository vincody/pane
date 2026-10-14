export class ApiError extends Error {constructor(message:string,public readonly status:number){super(message);this.name='ApiError';}}
export type ApiOptions=RequestInit&{image?:false};
export function createApi(token:string){
 async function api(url:string,options:RequestInit&{image:true}):Promise<Blob>;
 async function api<T=unknown>(url:string,options?:ApiOptions):Promise<T>;
 async function api<T>(url:string,options:RequestInit&{image?:boolean}={}):Promise<T|Blob>{
  const {image,...request}=options;
  const response=await fetch(url,{...request,headers:{'X-AI-Web-Token':token,...(options.body?{'Content-Type':'application/json'}:{}),...Object.fromEntries(new Headers(options.headers).entries())}});
  if(!response.ok){const data:unknown=await response.json().catch(()=>null);const message=data&&typeof data==='object'&&'error'in data&&typeof data.error==='string'?data.error:`Request failed (${response.status}).`;throw new ApiError(message,response.status);}
  // The local server owns this wire contract. Callers choose a shared DTO;
  // untyped requests remain unknown instead of implicitly becoming any.
  return image?response.blob():await response.json() as T;
 }
 return api;
}
