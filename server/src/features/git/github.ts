import {execFile} from 'node:child_process';
import {FileError} from '../files/files.ts';
import {gitSnapshot,runGit} from './git-history.ts';
import type {GitHubContext,GitHubItem,GitHubPull,GitHubPullDetails,GitHubPullFile,GitHubCheck,GitHubIntegrationStatus,GitHubMessage,GitHubConversation,GitHubLabelPage} from '../../../../shared/contracts.ts';

type RecordValue=Record<string,unknown>;
const object=(value:unknown):RecordValue=>value&&typeof value==='object'&&!Array.isArray(value)?value as RecordValue:{};
const list=(value:unknown):unknown[]=>Array.isArray(value)?value:[];
const text=(value:unknown,limit=65_536)=>typeof value==='string'?value.slice(0,limit):'';
const https=(value:unknown)=>{try{const url=new URL(text(value));return url.protocol==='https:'?url.href:null;}catch{return null;}};
export function githubRepository(remote:string):string|null{
 let host='',pathname='';try{if(/^https?:\/\/|^ssh:\/\//i.test(remote)){const url=new URL(remote);host=url.hostname;pathname=url.pathname;}else{const match=remote.match(/^(?:git@)?([^:\s/]+):(.+)$/);if(!match)return null;host=match[1];pathname=match[2];}}catch{return null;}
 if(host.toLowerCase()!=='github.com')return null;
 const match=pathname.replace(/^\/|\/$/g,'').replace(/\.git$/i,'').match(/^([A-Za-z0-9_-]+)\/([A-Za-z0-9_.-]+)$/);
 return match&&match[1]!=='.'&&match[2]!=='.'&&match[2]!=='..'?`${match[1]}/${match[2]}`:null;
}
export type GitHubRunner=(root:string,args:string[],input?:string)=>Promise<string>;
const execute:GitHubRunner=(root,args,input)=>new Promise((resolve,reject)=>{
 const child=execFile('gh',args,{cwd:root,windowsHide:true,timeout:45_000,maxBuffer:8*1024*1024,env:{...process.env,GH_PROMPT_DISABLED:'1',GH_PAGER:'cat',NO_COLOR:'1'}},(error,stdout)=>error?reject(error):resolve(stdout));
 child.stdin?.on('error',()=>{});child.stdin?.end(input);
});
const issueNumber=(value:unknown)=>{const number=Number(value);if(!Number.isSafeInteger(number)||number<1||number>1_000_000_000)throw new FileError(400,'Choose a valid issue or pull request number.');return number;};
function item(value:unknown,repository:string,kind:'issues'|'pull'):GitHubItem{const data=object(value);return {number:Number(data.number),title:text(data.title,512),body:text(data.body),state:data.merged_at?'merged':text(data.state,20),url:`https://github.com/${repository}/${kind}/${data.number}`,author:text(object(data.user).login,100),updatedAt:text(data.updated_at,80),labels:list(data.labels).map(label=>text(object(label).name,100)).filter(Boolean)};}
function pull(value:unknown,repository:string):GitHubPull{const data=object(value);return {...item(data,repository,'pull'),draft:data.draft===true,base:text(object(data.base).ref,200),head:text(object(data.head).ref,200),headSha:text(object(data.head).sha,64),mergeable:data.mergeable===true?'Mergeable':data.mergeable===false?'Conflicts':'Checking'};}
export function createGitHub({run=execute}:{run?:GitHubRunner}={}){
 let running=0;const queue:Array<()=>void>=[];
 async function limitedRun(root:string,args:string[],input?:string){
  if(running>=4)await new Promise<void>(resolve=>queue.push(resolve));else running++;
  try{return await run(root,args,input);}finally{const next=queue.shift();if(next)next();else running--;}
 }
 const creating=new Map<string,Promise<GitHubPull>>();
 const cache=new Map<string,{value:unknown;expires:number}>(),pending=new Map<string,Promise<unknown>>();
 let cacheGeneration=0;
 function invalidate(){cacheGeneration++;cache.clear();pending.clear();}
 async function labels(root:string,pageValue:unknown=1,fresh=false):Promise<GitHubLabelPage>{
  const page=Number(pageValue);if(!Number.isSafeInteger(page)||page<1||page>1000)throw new FileError(400,'Choose a valid label page.');const name=await repository(root);
  const values=list(await cachedRequest(root,`repos/${name}/labels?per_page=100&page=${page}`,60_000,fresh));
  return {labels:values.map(value=>{const label=object(value),color=text(label.color,6);return {name:text(label.name,100),color:/^[a-f0-9]{6}$/i.test(color)?color:'888888',description:text(label.description,200)};}),hasMore:values.length===100,page};
 }
 async function createIssue(root:string,input:Record<string,unknown>):Promise<GitHubItem>{
  const title=typeof input.title==='string'?input.title.trim():'',body=typeof input.body==='string'?input.body:'',selected=input.labels===undefined?[]:input.labels;
  if(!title||title.length>256||/[\0\r\n]/.test(title)||body.length>65_536||body.includes('\0'))throw new FileError(400,'Provide a title under 257 characters and a description under 65,537 characters.');
  if(!Array.isArray(selected)||selected.length>50||selected.some(value=>typeof value!=='string'||!value.trim()||value.length>100||/[\0\r\n]/.test(value)))throw new FileError(400,'Choose up to 50 valid repository labels.');
  const name=await repository(root),created=item(await request(root,`repos/${name}/issues`,{title,body,labels:[...new Set(selected)]}),name,'issues');invalidate();return created;
 }
 async function cachedRequest(root:string,endpoint:string,ttl:number,fresh=false){
  const key=`${root}\0${endpoint}`,cached=cache.get(key);
  if(!fresh&&cached&&cached.expires>Date.now())return cached.value;
  const existing=pending.get(key);if(existing)return existing;
  const generation=cacheGeneration;
  const operation=request(root,endpoint).then(value=>{if(generation===cacheGeneration){if(cache.size>=64)cache.delete(cache.keys().next().value!);cache.set(key,{value,expires:Date.now()+ttl});}return value;});
  pending.set(key,operation);try{return await operation;}finally{if(pending.get(key)===operation)pending.delete(key);}
 }
 function message(value:unknown,name:string,number:number,kind:GitHubMessage['kind']):GitHubMessage{const data=object(value);return {id:`${kind}:${data.id}`,author:text(object(data.user).login,100)||'ghost',body:text(data.body),createdAt:text(kind==='review'?data.submitted_at:data.created_at,80),url:`https://github.com/${name}/pull/${number}#${kind==='comment'?'issuecomment':kind==='review'?'pullrequestreview':'discussion_r'}${kind==='inline'?'':'-'}${data.id}`,kind,...(kind==='review'?{state:text(data.state,40)}:{}),...(kind==='inline'?{path:text(data.path,4096),line:Number(data.line)||undefined}:{})};}
 async function conversation(root:string,value:unknown,pageValue:unknown=1):Promise<GitHubConversation>{
  const number=issueNumber(value),page=Number(pageValue);if(!Number.isSafeInteger(page)||page<1||page>1000)throw new FileError(400,'Choose a valid conversation page.');const name=await repository(root);
  const query=`per_page=100&page=${page}`;
  const batches=await Promise.all([request(root,`repos/${name}/issues/${number}/comments?${query}`),request(root,`repos/${name}/pulls/${number}/reviews?${query}`),request(root,`repos/${name}/pulls/${number}/comments?${query}`)]);
  const messages=batches.flatMap((batch,index)=>list(batch).filter(value=>index!==1||object(value).state!=='PENDING').map(value=>message(value,name,number,(['comment','review','inline'] as const)[index]))).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
  return {messages,hasMore:batches.some(batch=>list(batch).length===100),page};
 }
 async function comment(root:string,value:unknown,input:Record<string,unknown>):Promise<GitHubMessage>{
  const number=issueNumber(value),body=typeof input.body==='string'?input.body.trim():'';if(!body||body.length>65_536||body.includes('\0'))throw new FileError(400,'Write a comment between 1 and 65,536 characters.');const name=await repository(root);
  await request(root,`repos/${name}/pulls/${number}`);
  const posted=message(await request(root,`repos/${name}/issues/${number}/comments`,{body}),name,number,'comment');invalidate();return posted;
 }
 async function integrationStatus(root:string):Promise<GitHubIntegrationStatus>{
  let version:string|null=null;
  try{const output=await limitedRun(root,['--version']);version=output.match(/gh version ([\w.+-]+)/)?.[1]||null;}
  catch(error){const missing=(error as {code?:string}).code==='ENOENT';return {status:missing?'not-installed':'unavailable',version:null,account:null,message:missing?'Install GitHub CLI to use pull requests, issues and checks.':'Could not check GitHub CLI. Try again.'};}
  try{const account=(await limitedRun(root,['api','--hostname','github.com','user','--jq','.login'])).trim();if(!/^[A-Za-z0-9-]{1,100}$/.test(account))throw new Error('Invalid account');return {status:'connected',version,account,message:'Ready for pull requests, issues and checks.'};}
  catch(error){const auth=/401|authentication|gh auth login|GH_TOKEN|not logged/i.test((error as {stderr?:string}).stderr||'');return {status:auth?'not-authenticated':'unavailable',version,account:null,message:auth?'GitHub CLI is installed. Sign in to connect your GitHub account.':'GitHub CLI is installed, but the account could not be verified. Check your connection or CLI access and try again.'};}
 }
 async function repository(root:string){const remote=await runGit(root,['config','--get','remote.origin.url']).catch(()=>'');const name=githubRepository(remote.trim());if(!name)throw new FileError(400,'This workspace needs a github.com origin remote to use pull requests and issues.');return name;}
 async function request(root:string,endpoint:string,body?:unknown):Promise<unknown>{
  try{return JSON.parse(await limitedRun(root,['api','--hostname','github.com','--method',body===undefined?'GET':'POST',endpoint,...(body===undefined?[]:['--input','-'])],body===undefined?undefined:JSON.stringify(body)));}
  catch(error){if(error instanceof SyntaxError)throw new FileError(502,'GitHub returned an unreadable response. Try Refresh.');const failure=error as {code?:string;stderr?:string;killed?:boolean};const message=failure.stderr||'';
   throw new FileError(400,failure.code==='ENOENT'?'Install GitHub CLI (gh), then run gh auth login to connect.':failure.killed?'GitHub timed out. Check your connection and retry.':/401|authentication|gh auth login|GH_TOKEN/i.test(message)?'Sign in with gh auth login in your terminal, then refresh.':/403|rate limit|429/i.test(message)?'GitHub denied access or its rate limit was reached. Check repository permissions and retry later.':/404/i.test(message)?'The GitHub repository, branch or item is unavailable for your account.':/422|already exists/i.test(message)?'GitHub rejected this request. Check the fields and permissions. A PR may already exist or its branches may have no differences.':'Could not reach GitHub. Check your connection and GitHub CLI access.');
  }
 }
 async function context(root:string,fresh=false):Promise<GitHubContext>{
  const state=await gitSnapshot(root),empty:GitHubContext={available:false,repository:null,branch:state.branch,head:state.head,headBranch:null,canCreate:false,bases:[],dirty:state.dirty};
  try{const name=await repository(root),repo=object(await cachedRequest(root,`repos/${name}`,60_000,fresh));const defaultBranch=text(repo.default_branch,200);let headBranch:string|null=null;
   if(state.branch&&state.remote==='origin'&&state.upstream?.startsWith('refs/remotes/origin/'))headBranch=state.upstream.slice('refs/remotes/origin/'.length);
   return {...empty,available:true,repository:{name,url:`https://github.com/${name}`,defaultBranch},headBranch,canCreate:Boolean(headBranch&&state.head&&state.ahead===0),bases:[...new Set([defaultBranch,...state.refs.filter(ref=>ref.kind==='remote'&&ref.name.startsWith('origin/')).map(ref=>ref.name.slice(7))])].filter(Boolean)};
  }catch(error){return {...empty,message:error instanceof Error?error.message:'Could not connect to GitHub.'};}
 }
 async function entries(root:string,kind:'pulls'|'issues',state='open',search='',fresh=false){
  if(!['open','closed','all'].includes(state))throw new FileError(400,'Choose Open, Closed or All.');if(search.length>200)throw new FileError(400,'Keep the search under 200 characters.');
  const name=await repository(root);
  const result=list(await cachedRequest(root,`repos/${name}/${kind}?${new URLSearchParams({state,per_page:'100',sort:'updated',direction:'desc'})}`,15_000,fresh));
  const values=result.filter(value=>kind==='pulls'||!object(value).pull_request).map(value=>kind==='pulls'?pull(value,name):item(value,name,'issues'));
  const needle=search.toLowerCase();return {items:values.filter(value=>`${value.number} ${value.title} ${value.author} ${value.labels.join(' ')}`.toLowerCase().includes(needle)).slice(0,50),limited:result.length>=100};
 }
 async function issue(root:string,value:unknown,fresh=false){const number=issueNumber(value),name=await repository(root),data=object(await cachedRequest(root,`repos/${name}/issues/${number}`,15_000,fresh));if(data.pull_request)throw new FileError(400,'Choose an issue rather than a pull request.');return item(data,name,'issues');}
 async function pullDetails(root:string,value:unknown,section='all',fresh=false):Promise<GitHubPullDetails>{
  if(!['all','summary','files','checks'].includes(section))throw new FileError(400,'Choose a valid PR section.');
  const number=issueNumber(value),name=await repository(root),data=object(await cachedRequest(root,`repos/${name}/pulls/${number}`,15_000,fresh)),current=pull(data,name);
  const includeFiles=section==='all'||section==='files',includeChecks=section==='all'||section==='checks';
  const [changed,checksResult,statusResult]=await Promise.all([includeFiles?request(root,`repos/${name}/pulls/${number}/files?per_page=100`):[],includeChecks?request(root,`repos/${name}/commits/${current.headSha}/check-runs?per_page=100`).catch(()=>null):{},includeChecks?request(root,`repos/${name}/commits/${current.headSha}/status?per_page=100`).catch(()=>null):{}]);
  const files:GitHubPullFile[]=list(changed).map(value=>{const file=object(value);return {path:text(file.filename,4096),previousPath:text(file.previous_filename,4096)||undefined,status:({added:'A',modified:'M',removed:'D',renamed:'R',copied:'C'} as Record<string,string>)[text(file.status)]||'M',added:Number(file.additions)||0,removed:Number(file.deletions)||0,patch:typeof file.patch==='string'?file.patch.slice(0,200_000):null};});
  const checks:GitHubCheck[]=[...list(object(checksResult).check_runs).map(value=>{const check=object(value);return {name:text(check.name,200),status:text(check.status,40),conclusion:text(check.conclusion,40)||null,url:https(check.details_url)};}),...list(object(statusResult).statuses).map(value=>{const check=object(value);return {name:text(check.context,200),status:'completed',conclusion:text(check.state,40),url:https(check.target_url)};})];
  return {pull:current,files,checks,...(checksResult===null||statusResult===null?{checksMessage:'Some checks could not be read. View the pull request on GitHub for full status.'}:{}),truncated:Number(data.changed_files)>files.length};
 }
 async function createDraft(root:string,input:Record<string,unknown>):Promise<GitHubPull>{
  const name=await repository(root),state=await gitSnapshot(root),title=typeof input.title==='string'?input.title.trim():'',body=typeof input.body==='string'?input.body:'',base=typeof input.base==='string'?input.base:'';
  if(!title||title.length>256||/[\0\r\n]/.test(title)||body.length>65_536||body.includes('\0')||!base||base.length>200||/[\0\r\n]/.test(base))throw new FileError(400,'Provide a title, valid base branch and a description under 65,536 characters.');
  if(!state.branch||!state.head||state.head!==input.expectedHead||state.branch!==input.expectedBranch)throw new FileError(409,'The branch changed. Refresh before creating a draft.');
  if(state.remote!=='origin'||!state.upstream?.startsWith('refs/remotes/origin/')||state.ahead>0)throw new FileError(409,'Push or publish this branch to origin from Graph before creating a draft PR.');
  const head=state.upstream.slice('refs/remotes/origin/'.length);if(head===base)throw new FileError(400,'Choose a base branch different from the current branch.');
  const key=`${name}:${head}`;if(creating.has(key))throw new FileError(409,'A draft is already being created for this branch.');
  const operation=(async()=>{
   const remoteBranch=object(await request(root,`repos/${name}/branches/${encodeURIComponent(head)}`));if(object(remoteBranch.commit).sha!==state.head)throw new FileError(409,'The remote branch differs from this workspace. Fetch, review and push before creating a draft.');
   const current=await gitSnapshot(root);if(current.head!==state.head||current.branch!==state.branch)throw new FileError(409,'The branch changed. Refresh before creating a draft.');
   const created=pull(await request(root,`repos/${name}/pulls`,{title,body,head,base,draft:true}),name);invalidate();return created;
  })();creating.set(key,operation);try{return await operation;}finally{creating.delete(key);}
 }
 return {context,entries,issue,pullDetails,createDraft,createIssue,labels,integrationStatus,conversation,comment};
}
