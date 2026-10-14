import {validateSshConnection} from '../../../../shared/ssh-connection.ts';
import type {SshConnection} from '../../../../shared/contracts.ts';
interface SavedConnection extends SshConnection {id:string}
export function createSshConnections(token:string){
 const dialog=document.createElement('dialog');dialog.id='ssh-dialog';dialog.setAttribute('aria-labelledby','ssh-title');
 dialog.innerHTML='<header class="dialog-heading"><span id="ssh-title">SSH connections</span><button type="button" class="icon-button" aria-label="Close SSH connections">×</button></header><p class="ssh-caption">Connect to a remote machine in a terminal tab.</p><section class="ssh-saved" aria-label="Saved SSH connections"></section><form class="ssh-form"><h3>New connection</h3><label>Name<input name="name" aria-label="SSH connection name" maxlength="80" placeholder="My server"></label><label>Host or SSH alias<input name="host" aria-label="SSH host" required maxlength="253" placeholder="server.example.com or my-host" autocomplete="off"></label><div class="ssh-form-row"><label>Username <small>optional</small><input name="username" aria-label="SSH username" maxlength="64" placeholder="From SSH config"></label><label>Port <small>optional</small><input name="port" aria-label="SSH port" type="number" min="1" max="65535" placeholder="Config or 22"></label></div><label>Private key <small>optional</small><div class="ssh-key-row"><input name="identityFile" aria-label="SSH private key path" placeholder="Default keys or absolute file path" maxlength="4096"><button type="button" class="secondary-button ssh-pick-key">Choose key</button></div></label><p class="ssh-caption">Only the file path is saved. Enter the key passphrase in the terminal.</p><p class="ssh-caption">Uses your local OpenSSH keys, agent and config. Enter passwords and host key confirmations directly in the terminal.</p><p class="form-error" role="alert"></p><div class="dialog-actions"><button type="button" class="secondary-button ssh-cancel">Cancel</button><button type="submit" class="primary-button">Save & connect</button></div></form>';
 document.body.append(dialog);
 let connections:SavedConnection[]=[];
 try{const saved=JSON.parse(localStorage.getItem('ai-web.ssh-connections')||'[]');if(Array.isArray(saved))for(const item of saved){try{if(typeof item.id==='string')connections.push({id:item.id,...validateSshConnection(item)});}catch{}}}catch{}
 let connect:((connection:SshConnection)=>void)|undefined;
 const form=dialog.querySelector<HTMLFormElement>('form')!,error=dialog.querySelector<HTMLElement>('.form-error')!,list=dialog.querySelector<HTMLElement>('.ssh-saved')!;
 const persist=()=>localStorage.setItem('ai-web.ssh-connections',JSON.stringify(connections));
 function openConnection(connection:SshConnection){dialog.close();connect?.(connection);}
 function render(){
  list.replaceChildren();if(!connections.length)return;
  const heading=document.createElement('h3');heading.textContent='Saved connections';list.append(heading);
  for(const connection of connections){
   const row=document.createElement('div');row.className='ssh-saved-row';
   const button=document.createElement('button');button.type='button';button.className='ssh-connect';button.setAttribute('aria-label',`Connect SSH: ${connection.name}`);
   const name=document.createElement('strong');name.textContent=connection.name;
   const detail=document.createElement('small');detail.textContent=`${connection.username?`${connection.username}@`:''}${connection.host}${connection.port?`:${connection.port}`:''}`;
   if(connection.identityFile){detail.textContent+=` · Key: ${connection.identityFile.split(/[\\/]/).pop()}`;button.title=connection.identityFile;}
   button.append(name,detail);button.onclick=()=>openConnection(connection);
   const remove=document.createElement('button');remove.type='button';remove.className='icon-button';remove.textContent='×';remove.setAttribute('aria-label',`Remove SSH connection: ${connection.name}`);remove.title='Remove saved connection';
   remove.onclick=()=>{const previous=connections;connections=connections.filter(item=>item.id!==connection.id);try{persist();render();}catch{connections=previous;error.textContent='Could not save SSH connections in this browser.';}};
   row.append(button,remove);list.append(row);
  }
 }
 const picker=dialog.querySelector<HTMLButtonElement>('.ssh-pick-key')!;
 picker.onclick=async()=>{
  picker.disabled=true;picker.textContent='Choosing…';error.textContent='';
  try{
   const response=await fetch('/api/ssh/select-key',{method:'POST',headers:{'X-AI-Web-Token':token}});
   const result=await response.json();if(!response.ok)throw new Error(result.error||result.message||'Could not choose a key file.');
   if(typeof result.path==='string')form.querySelector<HTMLInputElement>('[name=identityFile]')!.value=result.path;
  }catch(failure){error.textContent=failure instanceof Error?failure.message:'Could not choose a key file.';}
  finally{picker.disabled=false;picker.textContent='Choose key';}
 };
 form.onsubmit=event=>{
  event.preventDefault();error.textContent='';const data=new FormData(form);
  try{
   const host=String(data.get('host')||'').trim(),username=String(data.get('username')||'').trim(),port=String(data.get('port')||'').trim();
   const identityFile=String(data.get('identityFile')||'').trim();
   const connection=validateSshConnection({name:String(data.get('name')||'').trim()||host,host,...(username?{username}:{}),...(port?{port:Number(port)}:{}),...(identityFile?{identityFile}:{})});
   const old=connections.find(item=>item.host===connection.host&&item.username===connection.username&&item.port===connection.port&&item.identityFile===connection.identityFile),previous=connections;
   connections=[{id:old?.id||crypto.randomUUID(),...connection},...connections.filter(item=>item.id!==old?.id)].slice(0,50);
   try{persist();}catch{connections=previous;throw new Error('Could not save SSH connections in this browser.');}
   openConnection(connection);
  }catch(failure){error.textContent=failure instanceof Error?failure.message:'Invalid connection.';}
 };
 dialog.querySelector<HTMLButtonElement>('[aria-label="Close SSH connections"]')!.onclick=()=>dialog.close();dialog.querySelector<HTMLButtonElement>('.ssh-cancel')!.onclick=()=>dialog.close();
 return {open(onConnect:(connection:SshConnection)=>void){connect=onConnect;error.textContent='';form.reset();render();if(!dialog.open)dialog.showModal();dialog.querySelector<HTMLInputElement>('[name=host]')!.focus();}};
}
