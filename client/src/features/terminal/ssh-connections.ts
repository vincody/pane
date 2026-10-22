import {validateSshConnection} from '../../../../shared/ssh-connection.ts';
import type {SshConnection} from '../../../../shared/contracts.ts';
interface SavedConnection extends SshConnection {id:string}
export function createSshConnections(token:string){
 const dialog=document.createElement('dialog');dialog.id='ssh-dialog';dialog.setAttribute('aria-labelledby','ssh-title');
 dialog.innerHTML='<header class="dialog-heading"><span id="ssh-title">SSH connections</span><button type="button" class="icon-button" aria-label="Close SSH connections">×</button></header><p class="ssh-caption">Connect to a remote machine in a terminal tab.</p><section class="ssh-saved" aria-label="Saved SSH connections"></section><form class="ssh-form"><h3>New connection</h3><label>Name<input name="name" aria-label="SSH connection name" maxlength="80" placeholder="My server"></label><label>Host or SSH alias<input name="host" aria-label="SSH host" required maxlength="253" placeholder="server.example.com or my-host" autocomplete="off"></label><div class="ssh-form-row"><label>Username <small>optional</small><input name="username" aria-label="SSH username" maxlength="64" placeholder="From SSH config"></label><label>Port <small>optional</small><input name="port" aria-label="SSH port" type="number" min="1" max="65535" placeholder="Config or 22"></label></div><label>Private key <small>optional</small><div class="ssh-key-row"><input name="identityFile" aria-label="SSH private key path" placeholder="Default keys or absolute file path" maxlength="4096"><button type="button" class="secondary-button ssh-pick-key">Choose key</button><button type="button" class="secondary-button ssh-import-key" title="Copy the key into ~/.ssh/pane-keys so it keeps working if the original is moved or deleted">Import key</button></div></label><div class="ssh-keys" aria-label="Saved SSH keys"></div><p class="ssh-caption">Only the file path is saved. Import copies the key into ~/.ssh/pane-keys, readable only by you. Enter the key passphrase in the terminal.</p><p class="ssh-caption">Uses your local OpenSSH keys, agent and config. Enter passwords and host key confirmations directly in the terminal.</p><p class="form-error" role="alert"></p><div class="dialog-actions"><button type="button" class="secondary-button ssh-cancel">Cancel</button><button type="submit" class="primary-button">Save & connect</button></div></form>';
 document.body.append(dialog);
 let connections:SavedConnection[]=[];
 try{const saved=JSON.parse(localStorage.getItem('ai-web.ssh-connections')||'[]');if(Array.isArray(saved))for(const item of saved){try{if(typeof item.id==='string')connections.push({id:item.id,...validateSshConnection(item)});}catch{}}}catch{}
 // Key file paths the user has used before, so they can be picked again without browsing.
 let keys:string[]=[];
 try{const saved=JSON.parse(localStorage.getItem('ai-web.ssh-keys')||'[]');if(Array.isArray(saved))keys=saved.filter((item):item is string=>typeof item==='string'&&item.length<=4096);}catch{}
 for(const connection of connections)if(connection.identityFile&&!keys.includes(connection.identityFile))keys.push(connection.identityFile);
 let connect:((connection:SshConnection)=>void)|undefined;
 const form=dialog.querySelector<HTMLFormElement>('form')!,error=dialog.querySelector<HTMLElement>('.form-error')!,list=dialog.querySelector<HTMLElement>('.ssh-saved')!;
 const persist=()=>localStorage.setItem('ai-web.ssh-connections',JSON.stringify(connections));
 const keyInput=form.querySelector<HTMLInputElement>('[name=identityFile]')!,keyList=dialog.querySelector<HTMLElement>('.ssh-keys')!;
 const persistKeys=()=>{try{localStorage.setItem('ai-web.ssh-keys',JSON.stringify(keys));}catch{}};
 function rememberKey(path:string){keys=[path,...keys.filter(item=>item!==path)].slice(0,20);persistKeys();renderKeys();}
 function renderKeys(){
  keyList.replaceChildren();if(!keys.length)return;
  const heading=document.createElement('small');heading.textContent='Saved keys';keyList.append(heading);
  for(const path of keys){
   const chip=document.createElement('span');chip.className='ssh-key-chip';chip.classList.toggle('selected',keyInput.value.trim()===path);
   const pick=document.createElement('button');pick.type='button';pick.textContent=path.split(/[\/]/).pop()||path;pick.title=path;pick.setAttribute('aria-label',`Use SSH key: ${path}`);pick.onclick=()=>{keyInput.value=path;renderKeys();};
   const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.title='Remove saved key';remove.setAttribute('aria-label',`Remove saved SSH key: ${path}`);remove.onclick=()=>{keys=keys.filter(item=>item!==path);if(keyInput.value.trim()===path)keyInput.value='';persistKeys();renderKeys();};
   chip.append(pick,remove);keyList.append(chip);
  }
 }
 keyInput.addEventListener('input',renderKeys);
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
 const pickKey=(button:HTMLButtonElement,endpoint:string,label:string)=>async()=>{
  button.disabled=true;button.textContent=`${label}…`;error.textContent='';
  try{
   const response=await fetch(endpoint,{method:'POST',headers:{'X-AI-Web-Token':token}});
   const result=await response.json();if(!response.ok)throw new Error(result.error||result.message||'Could not choose a key file.');
   if(typeof result.path==='string'){keyInput.value=result.path;rememberKey(result.path);}
  }catch(failure){error.textContent=failure instanceof Error?failure.message:'Could not choose a key file.';}
  finally{button.disabled=false;button.textContent=label;}
 };
 const picker=dialog.querySelector<HTMLButtonElement>('.ssh-pick-key')!,importer=dialog.querySelector<HTMLButtonElement>('.ssh-import-key')!;
 picker.onclick=pickKey(picker,'/api/ssh/select-key','Choose key');
 importer.onclick=pickKey(importer,'/api/ssh/import-key','Import key');
 form.onsubmit=event=>{
  event.preventDefault();error.textContent='';const data=new FormData(form);
  try{
   const host=String(data.get('host')||'').trim(),username=String(data.get('username')||'').trim(),port=String(data.get('port')||'').trim();
   const identityFile=String(data.get('identityFile')||'').trim();
   const connection=validateSshConnection({name:String(data.get('name')||'').trim()||host,host,...(username?{username}:{}),...(port?{port:Number(port)}:{}),...(identityFile?{identityFile}:{})});
   const old=connections.find(item=>item.host===connection.host&&item.username===connection.username&&item.port===connection.port&&item.identityFile===connection.identityFile),previous=connections;
   connections=[{id:old?.id||crypto.randomUUID(),...connection},...connections.filter(item=>item.id!==old?.id)].slice(0,50);
   try{persist();}catch{connections=previous;throw new Error('Could not save SSH connections in this browser.');}
   if(connection.identityFile)rememberKey(connection.identityFile);
   openConnection(connection);
  }catch(failure){error.textContent=failure instanceof Error?failure.message:'Invalid connection.';}
 };
 dialog.querySelector<HTMLButtonElement>('[aria-label="Close SSH connections"]')!.onclick=()=>dialog.close();dialog.querySelector<HTMLButtonElement>('.ssh-cancel')!.onclick=()=>dialog.close();
 return {open(onConnect:(connection:SshConnection)=>void){connect=onConnect;error.textContent='';form.reset();render();renderKeys();if(!dialog.open)dialog.showModal();dialog.querySelector<HTMLInputElement>('[name=host]')!.focus();}};
}
