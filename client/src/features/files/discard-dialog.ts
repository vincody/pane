import './discard-dialog.css';

export function confirmDiscardFile(name:string,action:'close'|'reload'='close'):Promise<boolean>{
 const dialog=document.createElement('dialog');dialog.className='discard-file-dialog';
 dialog.setAttribute('aria-labelledby','discard-file-title');dialog.setAttribute('aria-describedby','discard-file-detail');
 dialog.innerHTML='<h2 id="discard-file-title">Discard unsaved changes?</h2><p id="discard-file-detail"></p><footer><button type="button" class="secondary-button" autofocus>Keep editing</button><button type="button" class="discard-file-confirm">Discard changes</button></footer>';
 dialog.querySelector('p')!.textContent=`Your edits to “${name}” haven’t been saved. Discard them and ${action==='reload'?'load the version on disk':'close this tab'}?`;
 const keep=dialog.querySelector<HTMLButtonElement>('.secondary-button')!,discard=dialog.querySelector<HTMLButtonElement>('.discard-file-confirm')!;
 document.body.append(dialog);
 return new Promise(resolve=>{
  keep.onclick=()=>dialog.close('keep');discard.onclick=()=>dialog.close('discard');
  dialog.addEventListener('close',()=>{const confirmed=dialog.returnValue==='discard';dialog.remove();resolve(confirmed);},{once:true});
  dialog.showModal();keep.focus();
 });
}
