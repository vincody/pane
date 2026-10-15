import {useEffect,useState} from 'react';
import type {Api} from '../../components/contracts.ts';
import type {GitHubIntegrationStatus} from '../../../../shared/contracts.ts';

const labels={connected:'Connected','not-installed':'Not installed','not-authenticated':'Not authenticated',unavailable:'Unavailable'};
export function Integrations({api,active}:{api:Api;active:boolean}){
 const [result,setResult]=useState<GitHubIntegrationStatus|null>(null),[checking,setChecking]=useState(false),[revision,setRevision]=useState(0),[copied,setCopied]=useState(false);
 useEffect(()=>{if(!active)return;let canceled=false;setChecking(true);void api<GitHubIntegrationStatus>('/api/integrations/github').then(data=>{if(!canceled)setResult(data);}).catch(()=>{if(!canceled)setResult({status:'unavailable',version:null,account:null,message:'Could not check GitHub CLI. Check the Pane server connection and try again.'});}).finally(()=>{if(!canceled)setChecking(false);});return ()=>{canceled=true;};},[active,revision]);
 return <article className="integration-card" aria-label="GitHub integration" aria-busy={checking}>
  <header><div><strong>GitHub</strong><p>Pull requests, issues and checks via GitHub CLI.</p></div><span className="integration-status" data-status={checking?'checking':result?.status} role="status">{checking?'Checking…':result?labels[result.status]:'Not checked'}</span></header>
  {result&&<><dl><div><dt>GitHub CLI</dt><dd>{result.version?`gh ${result.version}`:result.status==='not-installed'?'Not installed':'Version unavailable'}</dd></div><div><dt>Account</dt><dd>{result.account?`@${result.account} · github.com`:'Not connected'}</dd></div></dl><p>{result.message}</p></>}
  {result?.status==='not-authenticated'&&<div className="integration-command"><code>gh auth login --hostname github.com</code><button type="button" className="secondary-button" onClick={()=>{void navigator.clipboard.writeText('gh auth login --hostname github.com').then(()=>setCopied(true)).catch(()=>setCopied(false));}}>{copied?'Copied':'Copy command'}</button></div>}
  <footer>{result?.status==='not-installed'&&<a href="https://cli.github.com/" target="_blank" rel="noopener noreferrer">Install GitHub CLI ↗</a>}<button type="button" className="secondary-button" disabled={checking} onClick={()=>{setCopied(false);setRevision(value=>value+1);}}>Re-check</button></footer>
  <small>Uses GitHub CLI on the machine running Pane. After installing, restart Pane if the CLI is not detected. Workspaces also need a github.com origin remote.</small>
 </article>;
}
