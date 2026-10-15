import {useEffect,useState} from 'react';
import type {DesktopUpdateState} from '../../../../shared/desktop-updates.ts';

export function AboutUpdates({active}:{active:boolean}){
 const desktop=window.paneDesktop;
 const [state,setState]=useState<DesktopUpdateState|null>(null),[error,setError]=useState(''),[working,setWorking]=useState(false);
 useEffect(()=>{
  if(!desktop||!active)return;let disposed=false;
  const unsubscribe=desktop.onUpdateState(value=>{if(!disposed)setState(value);});
  void desktop.updates('state').then(value=>{if(!disposed)setState(value);}).catch(()=>{if(!disposed)setError('Could not read update status. Reopen this page to try again.');});
  return ()=>{disposed=true;unsubscribe();};
 },[active,desktop]);
 async function action(command:'check'|'download'|'install'|'automatic',value?:boolean){
  if(!desktop)return;setWorking(true);setError('');
  try{setState(await desktop.updates(command,value));}catch{setError('Could not complete this action. Please try again.');}finally{setWorking(false);}
 }
 const busy=working||state?.status==='checking'||state?.status==='downloading';
 return <article className="integration-card about-updates" aria-label="About Pane">
  <header><div><strong>Pane</strong><p>Your workspace for AI coding.</p></div>{state&&<span className="about-version">v{state.version}</span>}</header>
  {!desktop?<p>Browser edition. Desktop updates are managed in the installed Pane app.</p>:<>
   {state&&<>
    <dl><div><dt>Version</dt><dd>{state.version}</dd></div><div><dt>Platform</dt><dd>{state.platform}</dd></div><div><dt>Channel</dt><dd>Stable</dd></div><div><dt>Last checked</dt><dd>{state.checkedAt?new Date(state.checkedAt).toLocaleString():'Not checked yet'}</dd></div></dl>
    <p role="status" aria-live="polite">{state.message}</p>
    {state.latestVersion&&<p className="about-update-version">New version: <strong>{state.latestVersion}</strong></p>}
    {state.status==='downloading'&&<div className="about-download"><progress max="100" value={state.progress} aria-label="Update download progress"/><span>{Math.floor(state.progress)}%</span></div>}
    {state.releaseNotes&&<details className="about-release-notes"><summary>What’s new</summary><p>{state.releaseNotes}</p></details>}
    <label className="setting-row"><div><strong>Automatically check for updates</strong><small>Check after launch and every six hours. Downloads and restarts require your action.</small></div><input type="checkbox" aria-label="Automatically check for updates" checked={state.automatic} disabled={!state.supported||busy} onChange={event=>{void action('automatic',event.target.checked);}}/></label>
    <footer>
     <button className="secondary-button" type="button" disabled={!state.supported||busy||state.status==='downloaded'} onClick={()=>{void action('check');}}>{state.status==='checking'?'Checking…':'Check for updates'}</button>
     {state.status==='available'&&<button className="secondary-button" type="button" disabled={busy} onClick={()=>{void action('download');}}>Download update</button>}
     {state.status==='downloaded'&&<button className="secondary-button" type="button" disabled={busy} onClick={()=>{void action('install');}}>Restart to update</button>}
    </footer>
    <small>Restarting ends running terminals, agents and SSH connections. Pane saves supported drafts and layout before installing.</small>
   </>}
  </>}
  {error&&<p role="alert">{error}</p>}
  <a href="https://github.com/vincody/pane/releases" target="_blank" rel="noopener noreferrer">View releases on GitHub ↗</a>
 </article>;
}
