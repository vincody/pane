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
 const updateState=(state:import('../../../../shared/desktop-updates.ts').DesktopUpdateState)=>{updateButton.hidden=!['available','downloaded'].includes(state.status);updateButton.textContent=state.status==='downloaded'?'Restart to update':'Update available';updateButton.title=state.latestVersion?`Pane ${state.latestVersion}`:'Pane updates';};
 const unsubscribeUpdates=desktop.onUpdateState(updateState);void desktop.updates('state').then(updateState).catch(()=>{});
 const align=()=>{const rect=main.getBoundingClientRect();bar.style.setProperty('--desktop-left-edge',`${rect.left}px`);bar.style.setProperty('--desktop-right-edge',`${Math.max(0,innerWidth-rect.right)}px`);};
 const geometry=new ResizeObserver(align);for(const element of [main,document.querySelector('#projects-sidebar'),document.querySelector('#files-sidebar')])if(element)geometry.observe(element);align();
 const unsubscribe=desktop.onWindowState(state=>{
  const restore=state.maximized||state.fullscreen;
  maximize.setAttribute('aria-label',restore?'Restore window':'Maximize window');maximize.title=restore?'Restore window':'Maximize window';maximize.querySelector('path')!.setAttribute('d',restore?'M5.5 5.5h7v7h-7zM3.5 10.5v-7h7':'M3.5 3.5h9v9h-9z');
  document.documentElement.dataset.windowFocused=String(state.focused);document.documentElement.dataset.windowMaximized=String(restore);
 });
 return ()=>{geometry.disconnect();unsubscribe();unsubscribeUpdates();updateButton.remove();bar.prepend(toggle);if(status)rightActions.prepend(status);bar.append(rightActions);left.remove();right.remove();delete document.documentElement.dataset.desktop;};
}
