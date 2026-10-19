import './app-dialog.css';

export interface AppDialogRequest {type:string;message:string;detail:string;buttons:string[];defaultId:number;cancelId:number}

const LABELS:Record<string,string> = {question:'Confirm',warning:'Warning',error:'Error',info:'Notice'};

/** A modal message box in the app's own design; resolves with the index of the chosen button (Escape picks cancelId). */
export function showAppDialog(request:AppDialogRequest):Promise<number>{
 const dialog=document.createElement('dialog');dialog.className='app-dialog';dialog.dataset.type=request.type;
 dialog.setAttribute('aria-labelledby','app-dialog-title');dialog.setAttribute('aria-describedby','app-dialog-detail');
 const kind=document.createElement('span');kind.className='app-dialog-kind';kind.textContent=LABELS[request.type]||LABELS.info;
 const title=document.createElement('h2');title.id='app-dialog-title';title.textContent=request.message;
 const detail=document.createElement('p');detail.id='app-dialog-detail';detail.textContent=request.detail;detail.hidden=!request.detail;
 const footer=document.createElement('footer');
 dialog.append(kind,title,detail,footer);
 return new Promise(resolve=>{
  let answer=request.cancelId;
  request.buttons.forEach((label,index)=>{
   const button=document.createElement('button');button.type='button';button.textContent=label;
   // A default of Cancel is a safe default, not a recommendation, so only a real action is filled in.
   if(index===request.defaultId){button.dataset.default='true';if(!/^(cancel|no)$/i.test(label.trim()))button.classList.add('app-dialog-primary');}
   button.onclick=()=>{answer=index;dialog.close();};footer.append(button);
  });
  dialog.addEventListener('cancel',event=>{event.preventDefault();answer=request.cancelId;dialog.close();});
  dialog.addEventListener('close',()=>{dialog.remove();resolve(answer);},{once:true});
  document.body.append(dialog);dialog.showModal();
  footer.querySelector<HTMLButtonElement>('[data-default]')?.focus();
 });
}
