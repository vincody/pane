import '../../styles/desktop.css';
export function setupDesktopTitlebar(bar:HTMLElement){
 const desktop=window.paneDesktop;if(!desktop)return ()=>{};
 document.documentElement.dataset.desktop='true';
 const menu=document.createElement('button');menu.type='button';menu.className='desktop-app-menu';menu.setAttribute('aria-label','Pane menu');menu.title='Pane menu';menu.setAttribute('aria-haspopup','menu');menu.innerHTML='<img src="/pane.svg" alt=""><span>Pane</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5 6 3 3 3-3"/></svg>';menu.onclick=()=>{void desktop.windowControl('menu');};
 const left=document.createElement('div');left.className='desktop-titlebar-left';
 const toggle=bar.querySelector<HTMLElement>('#show-sidebar')!;left.append(menu,toggle);bar.prepend(left);
 const controls=document.createElement('div');controls.className='desktop-window-controls';controls.setAttribute('role','group');controls.setAttribute('aria-label','Window controls');
 function control(label:string,path:string,action:'minimize'|'maximize'|'close'){
  const button=document.createElement('button');button.type='button';button.className=`desktop-window-${action}`;button.setAttribute('aria-label',label);button.title=label;button.innerHTML=`<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${path}"/></svg>`;button.onclick=()=>{void window.paneDesktop?.windowControl(action);};controls.append(button);return button;
 }
 control('Minimize window','M3 8h10','minimize');
 const maximize=control('Maximize window','M3.5 3.5h9v9h-9z','maximize');
 control('Close window','m3.5 3.5 9 9m0-9-9 9','close');
 const right=document.createElement('div');right.className='desktop-titlebar-right';
 const rightActions=bar.querySelector<HTMLElement>('.topbar-right')!,status=rightActions.querySelector<HTMLElement>('.react-icon');
 if(status)bar.insertBefore(status,bar.querySelector('.toolbar-actions'));
 right.append(rightActions,controls);bar.append(right);
 const main=document.querySelector('main')!;
 const updateButton=document.createElement('button');updateButton.type='button';updateButton.className='desktop-update-button';updateButton.hidden=true;updateButton.onclick=()=>document.dispatchEvent(new Event('pane-open-updates'));bar.insertBefore(updateButton,bar.querySelector('.toolbar-actions'));
 const updateState=(state:import('../../../../shared/desktop-updates.ts').DesktopUpdateState)=>{updateButton.hidden=!['available','downloaded','downloading','waiting','installing'].includes(state.status);updateButton.textContent=state.status==='available'?'Update available':state.status==='downloaded'?'Update ready':'Updating…';updateButton.title=state.latestVersion?`Pane ${state.latestVersion}`:'Pane updates';};
 // Offer a newly found release once per version and session; the titlebar button stays as the persistent entry point.
 const offered=new Set<string>();let prompt:HTMLElement|undefined;
 const offerUpdate=(state:import('../../../../shared/desktop-updates.ts').DesktopUpdateState)=>{
  if(state.status!=='available'||!state.latestVersion||offered.has(state.latestVersion))return;
  offered.add(state.latestVersion);prompt?.remove();
  const card=document.createElement('aside');card.id='update-prompt';card.className='update-prompt';card.setAttribute('role','status');card.setAttribute('aria-label','Update available');
  const copy=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('span');copy.className='update-prompt-copy';title.textContent=`Pane ${state.latestVersion} is available`;detail.textContent='Review what is new and install it from About & Updates.';copy.append(title,detail);
  const actions=document.createElement('div');actions.className='update-prompt-actions';
  const close=()=>{card.remove();if(prompt===card)prompt=undefined;};
  const view=document.createElement('button');view.type='button';view.textContent='View update';view.onclick=()=>{close();document.dispatchEvent(new Event('pane-open-updates'));};
  const later=document.createElement('button');later.type='button';later.textContent='Later';later.onclick=close;actions.append(view,later);
  card.append(copy,actions);document.body.append(card);prompt=card;
 };
 const unsubscribeUpdates=desktop.onUpdateState(state=>{updateState(state);offerUpdate(state);});void desktop.updates('state').then(state=>{updateState(state);offerUpdate(state);}).catch(()=>{});
 const align=()=>{const rect=main.getBoundingClientRect();bar.style.setProperty('--desktop-left-edge',`${rect.left}px`);bar.style.setProperty('--desktop-right-edge',`${Math.max(0,innerWidth-rect.right)}px`);};
 const geometry=new ResizeObserver(align);for(const element of [main,document.querySelector('#projects-sidebar'),document.querySelector('#files-sidebar')])if(element)geometry.observe(element);align();
 const unsubscribe=desktop.onWindowState(state=>{
  const restore=state.maximized||state.fullscreen;
  maximize.setAttribute('aria-label',restore?'Restore window':'Maximize window');maximize.title=restore?'Restore window':'Maximize window';maximize.querySelector('path')!.setAttribute('d',restore?'M5.5 5.5h7v7h-7zM3.5 10.5v-7h7':'M3.5 3.5h9v9h-9z');
  document.documentElement.dataset.windowFocused=String(state.focused);document.documentElement.dataset.windowMaximized=String(restore);
 });
 return ()=>{geometry.disconnect();unsubscribe();unsubscribeUpdates();prompt?.remove();updateButton.remove();bar.prepend(toggle);if(status)rightActions.prepend(status);bar.append(rightActions);left.remove();right.remove();delete document.documentElement.dataset.desktop;};
}
