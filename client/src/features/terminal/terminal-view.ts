import type {SavedLayout,SavedPaneTree} from '../layout/workbench-journal.ts';
import {Terminal} from '@xterm/xterm';
import {createSshConnections} from './ssh-connections.ts';
import {readTerminalJournal,saveTerminalJournal,type SavedTerminal} from './terminal-journal.ts';
import {FitAddon} from '@xterm/addon-fit';
import {positionTab,forgetTabPosition} from '../layout/tab-position.ts';
import {leaves, removePane, splitPane, swapPanes, chooseBalancedSplit} from './terminal-layout.ts';
import {terminalName, threadTitle} from './terminal-name.ts';
import {readTerminalActivity} from './terminal-activity.ts';
import {trackPromptInput} from './terminal-input.ts';
import {resumeCommand,validateResume} from '../history/history-session.ts';
import '@xterm/xterm/css/xterm.css';
import type {Workspace,SessionRecord,TerminalServerMessage,SshConnection} from '../../../../shared/contracts.ts';
import type {PaneTree,SplitDirection} from './terminal-layout.ts';
import type {TerminalActivity} from './terminal-activity.ts';
export interface ExternalFilePane {id:string;project:Workspace;element:HTMLElement;paneHeader:HTMLElement;paneZoom:HTMLButtonElement;layout?:()=>void;onSelect?:()=>void;}
export interface TerminalSnapshot {id:string;project:string;agent:string;name:string;status:string;completed:boolean;selected:boolean;}
export interface TerminalViewOptions {token:string;icon:(name:string)=>SVGElement;onClose?:(visible:boolean)=>void;onSessionsChange?:(sessions:TerminalSnapshot[])=>void;onSelect?:()=>void;}
interface PaneGroup {root:PaneTree<PaneSession>|null;manual?:boolean;}
interface PaneSession extends ExternalFilePane {restorePending?:boolean;reconnect?:()=>void;replaying?:boolean;serverId?:string;ssh?:SshConnection;disposed?:boolean;reconnectTimer?:ReturnType<typeof setTimeout>;retries?:number;external?:boolean;name:string;shell:string;state:string;launch:string;lastUsed:number;group:PaneGroup;ready?:boolean;socket?:WebSocket|null;terminal?:Terminal;fit?:FitAddon;paneTitle?:HTMLElement;paneMark?:HTMLElement;paneProvider?:string|null;tab?:HTMLDivElement;renameInput?:HTMLInputElement|null;customName?:boolean;resume?:SessionRecord|null;cliTitle?:string;activityTitle?:string;agent?:string|null;agentStatus?:string;activity?:TerminalActivity;activityTimer?:ReturnType<typeof setTimeout>|null;turnSubmitted?:boolean;inputDraft?:string;observer?:ResizeObserver;paneAnimation?:Animation;}

export function createTerminalView({token, icon, onClose, onSessionsChange, onSelect}:TerminalViewOptions) {
  const workspace = document.querySelector<HTMLElement>('#workspace')!;
  const panel = document.createElement('section');
  panel.id = 'terminal-panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Interactive terminal');
  panel.innerHTML = '<header class="terminal-titlebar"><div id="terminal-tabs" role="group" aria-label="Terminal sessions"></div><div class="terminal-title-actions"><button id="terminal-new" class="terminal-title-button" aria-label="New terminal" title="New terminal"></button><button id="terminal-close" class="terminal-title-button" aria-label="Close terminal session" title="Close terminal session"></button><span id="terminal-state" class="sr-only" role="status">Closed</span></div></header><div id="terminal-screens"></div><div id="terminal-error" role="alert" hidden></div><div id="terminal-menu" role="menu" aria-label="Terminal tab options" hidden><button type="button" role="menuitem" data-terminal-action="rename">Rename tab</button><button type="button" role="menuitem" data-terminal-action="clear">Clear terminal</button><button type="button" role="menuitem" data-terminal-action="restart">Restart terminal</button><button type="button" role="menuitem" data-terminal-action="close">Close terminal</button></div>';

  const header = panel.querySelector<HTMLElement>('.terminal-titlebar')!;
  document.querySelector<HTMLElement>('.topbar')!.insertBefore(header, document.querySelector<HTMLElement>('.topbar .toolbar-actions')!);
  header.classList.add('unified-terminal-tabs');
  const strip = document.createElement('div'); strip.id = 'unified-tabs';
  header.before(strip); strip.append(document.querySelector<HTMLElement>('#tabs')!, header);
  const $ = <T extends HTMLElement=HTMLElement>(selector:string):T => (panel.querySelector<T>(selector) || header.querySelector<T>(selector) || document.querySelector<T>(selector))!;
  $('#terminal-new').append(icon('plus'));
  $('#terminal-new').append(document.createTextNode('New session'));
  document.querySelector<HTMLElement>('.workspace-actions')!.append($('#terminal-new'));
  $('#terminal-close').append(icon('close'));
  $('#terminal-close').remove();
  for(const [action,label] of [['split-right','Split right'],['split-down','Split down']]){
    const button=document.createElement('button');button.type='button';button.setAttribute('role','menuitem');button.dataset.terminalAction=action;button.textContent=label;$('#terminal-menu').prepend(button);
  }
  const launcher = document.createElement('div'); launcher.id='terminal-launcher'; launcher.hidden=true; launcher.setAttribute('role','dialog'); launcher.setAttribute('aria-label','New session');
  const heading=document.createElement('strong');heading.textContent='New session';
  const description=document.createElement('p');description.textContent='Choose an agent, local shell or SSH connection.';
  const choices=document.createElement('div');choices.className='terminal-launch-choices';
  for(const [kind,label] of [['claude','Claude Code'],['codex','Codex'],['shell','Shell'],['ssh','SSH']]){
    const button=document.createElement('button');button.type='button';button.dataset.launch=kind;
    if(kind==='shell'||kind==='ssh')button.append(icon('terminal'));else{const image=document.createElement('img');image.src=`/agents/${kind}.svg`;image.alt='';button.append(image);}
    button.append(document.createTextNode(label));choices.append(button);
  }
  launcher.append(heading,description,choices);document.body.append(launcher);
  $('#terminal-new').setAttribute('aria-haspopup','dialog');$('#terminal-new').setAttribute('aria-expanded','false');$('#terminal-new').title='New session';$('#terminal-new').setAttribute('aria-label','New session');
  function closeLauncher(){launcher.hidden=true;$('#terminal-new').setAttribute('aria-expanded','false');}
  const sessions:PaneSession[] = [];
  const savedTerminals=readTerminalJournal();
  const sshConnections=createSshConnections(token);
  function journal(){return saveTerminalJournal(sessions.filter(session=>!session.external&&(session.serverId||session.restorePending)&&session.state!=='closed').map(session=>({sessionId:session.serverId||session.id,...(session.restorePending?{ended:true}:{}),projectId:session.project.id,launch:session.launch,name:terminalName(session),...(session.ssh?{ssh:session.ssh}:{})})));}

  let useOrder = 0;
  let activeSession:PaneSession|null|undefined,menuSession:PaneSession|undefined,lastProject:Workspace|null|undefined,visible=false;
  let menuAnchor={x:8,y:8};
  let hasFocus=true;
  let pendingSplit:{target:PaneSession;direction:SplitDirection}|null|undefined,draggedSession:PaneSession|null|undefined;
  let maximizedSession:PaneSession|null|undefined;
  function toggleMaximize(session:PaneSession){
    const before=session.element.getBoundingClientRect();
    session.paneAnimation?.cancel();
    activeSession=session;session.lastUsed=++useOrder;
    maximizedSession=maximizedSession===session?null:session;
    renderLayout();renderTabs();publish();
    const after=session.element.getBoundingClientRect();
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches && before.width && after.width){
      session.paneAnimation=session.element.animate([
        {transform:`translate(${before.left-after.left}px,${before.top-after.top}px) scale(${before.width/after.width},${before.height/after.height})`,transformOrigin:'top left'},
        {transform:'none',transformOrigin:'top left'}
      ],{duration:180,easing:'cubic-bezier(.2,.8,.2,1)'});
    }
    session.terminal?.focus();
  }
  let autoSplit=true;try{autoSplit=localStorage.getItem('ai-web.auto-split-terminals')!=='false';}catch{}
  const autoSetting=document.createElement('div');autoSetting.className='setting-row';autoSetting.innerHTML='<div><strong>Auto split terminals</strong><small>Add new sessions to the focused split group. Preserve adjusted layouts; use separate tabs in narrow windows.</small></div><input id="auto-split-terminal-setting" type="checkbox" aria-label="Auto split terminals">';
  document.querySelector<HTMLElement>('.settings-footnote')!.before(autoSetting);
  const autoCheckbox=autoSetting.querySelector<HTMLInputElement>('input')!;autoCheckbox.checked=autoSplit;autoCheckbox.onchange=()=>{autoSplit=autoCheckbox.checked;try{localStorage.setItem('ai-web.auto-split-terminals',String(autoSplit));}catch{}};
  const stash=document.createElement('div');stash.hidden=true;panel.append(stash);
  function renderLayout() {
    document.querySelector<HTMLElement>('#app')!.classList.toggle('terminal-pane-maximized',Boolean(visible && maximizedSession===activeSession && maximizedSession));
    for(const session of sessions) { stash.append(session.element); session.element.hidden=true; }
    $('#terminal-screens').replaceChildren();
    function draw(tree:PaneTree<PaneSession>):HTMLElement{
      if('session' in tree){const session=tree.session;session.element.dataset.layoutId=session.id;session.element.style.flex='1 1 0';session.element.hidden=false;session.element.classList.toggle('pane-focused',hasFocus&&session===activeSession);return session.element;}
      const branch=document.createElement('div');branch.className=`terminal-split terminal-split-${tree.direction}`;
      const first=draw(tree.first),second=draw(tree.second);first.style.flex=`${tree.ratio} 1 0`;second.style.flex=`${1-tree.ratio} 1 0`;
      const divider=document.createElement('div');divider.className='terminal-divider';divider.tabIndex=0;divider.setAttribute('role','separator');divider.setAttribute('aria-label','Resize terminal panes');divider.setAttribute('aria-orientation',tree.direction==='right'?'vertical':'horizontal');
      const setRatio=(ratio:number)=>{tree.ratio=Math.max(.15,Math.min(.85,ratio));first.style.flex=`${tree.ratio} 1 0`;second.style.flex=`${1-tree.ratio} 1 0`;divider.setAttribute('aria-valuenow',String(Math.round(tree.ratio*100)));};setRatio(tree.ratio);
      divider.onpointerdown=event=>{event.preventDefault();activeSession!.group.manual=true;divider.setPointerCapture(event.pointerId);divider.classList.add('dragging');};
      divider.onpointermove=event=>{if(!divider.hasPointerCapture(event.pointerId))return;const rect=branch.getBoundingClientRect();setRatio(tree.direction==='right'?(event.clientX-rect.left)/rect.width:(event.clientY-rect.top)/rect.height);};
      divider.onpointerup=divider.onpointercancel=event=>{if(divider.hasPointerCapture(event.pointerId))divider.releasePointerCapture(event.pointerId);divider.classList.remove('dragging');publish();};
      divider.ondblclick=()=>{activeSession!.group.manual=true;setRatio(.5);publish();};divider.onkeydown=event=>{if(['ArrowLeft','ArrowUp','ArrowRight','ArrowDown','Home'].includes(event.key)){event.preventDefault();activeSession!.group.manual=true;setRatio(event.key==='Home'?.5:tree.ratio+(['ArrowLeft','ArrowUp'].includes(event.key)?-.05:.05));}};
      branch.append(first,divider,second);return branch;
    }
    if(activeSession?.group?.root)$('#terminal-screens').append(draw(maximizedSession===activeSession?{session:activeSession}:activeSession.group.root));
    document.dispatchEvent(new Event('pane-layout-changed'));
    requestAnimationFrame(()=>{for(const session of leaves(activeSession?.group?.root))fitSession(session);});
  }
  function attachPane(target:PaneSession,session:PaneSession,direction:SplitDirection){
    if(!target || target===session)return;
    if(session.group)session.group.root=removePane(session.group.root,session);
    session.group=target.group;session.group.manual=true;session.group.root=splitPane(session.group.root!,target,session,direction);activate(session);setVisible(true);
  }
  function swapPanePositions(target:PaneSession,source:PaneSession){
    const sourceGroup=source.group,targetGroup=target.group;
    sourceGroup.root=swapPanes(sourceGroup.root!,source,target);sourceGroup.manual=true;
    if(targetGroup!==sourceGroup){targetGroup.root=swapPanes(targetGroup.root!,source,target);targetGroup.manual=true;source.group=targetGroup;target.group=sourceGroup;}
    activate(source);setVisible(true);
  }
  function showLauncher(target?:PaneSession,direction:SplitDirection='right',anchor?:{x:number;y:number}){
    pendingSplit=target?{target,direction}:null;
    heading.textContent=target?(direction==='right'?'Split right':'Split down'):'New session';
    launcher.setAttribute('aria-label',heading.textContent);
    launcher.hidden=false;$('#terminal-new').setAttribute('aria-expanded','true');
    const rect=$('#terminal-new').getBoundingClientRect();
    const x=anchor?.x??rect.left,y=anchor?.y??rect.bottom+8;
    launcher.style.left=`${Math.max(8,Math.min(x,innerWidth-launcher.offsetWidth-8))}px`;
    launcher.style.top=`${Math.max(8,Math.min(y,innerHeight-launcher.offsetHeight-8))}px`;
    choices.querySelector<HTMLButtonElement>('button')!.focus();
  }
  const publish = () => {journal();onSessionsChange?.(sessions.filter(session => !session.external && session.ready).map(session => ({id:session.id, project:session.project.id, agent:session.agent||session.launch, name:terminalName(session), status:session.state==='error'?'error':session.state==='closed'?'done':session.agentStatus || 'idle', completed:Boolean(session.activity?.completed), selected:visible && hasFocus && session===activeSession})));};
  function scheduleActivity(session:PaneSession) {
    // Bound the wait: spinner frames must not postpone detection forever.
    if(session.activityTimer)return;
    session.activityTimer=setTimeout(()=>{session.activityTimer=null;if(sessions.includes(session))inspectScreen(session);},200);
  }
  function inspectScreen(session:PaneSession) {
    if (!session.agent || !session.ready) return;
    const buffer = session.terminal!.buffer.active;
    const lines = [];
    for (let y = buffer.baseY; y < buffer.baseY + session.terminal!.rows; y++) lines.push(buffer.getLine(y)?.translateToString(true) || '');
    const screen = lines.join('\n');
    const wasCompleted=session.activity?.completed;
    session.activity=readTerminalActivity(screen,session.activity,{title:session.activityTitle,agent:session.agent});
    // Startup spinners and title changes are not a user-requested work turn.
    if(session.activity.completed){session.activity.completed=Boolean(session.turnSubmitted);session.turnSubmitted=false;}
    const {status,completed}=session.activity;
    if (status !== session.agentStatus || completed || wasCompleted) { session.agentStatus = status; renderTabs(); publish(); }
  }

  function setVisible(next:boolean) {
    visible = next;
    panel.hidden = !next;
    workspace.hidden = next;
    document.querySelector<HTMLElement>('#app')!.classList.toggle('terminal-pane-maximized',Boolean(next && maximizedSession===activeSession && maximizedSession));
    onClose?.(next);
    renderTabs();
    publish();
    if (next && activeSession) requestAnimationFrame(() => {
      for(const session of leaves(activeSession!.group.root))fitSession(session);
      activeSession?.terminal?.focus();
    });
  }

  function fitSession(session:PaneSession) {
    if(session.external){session.layout?.();return;}
    if (!visible || session.element.hidden || session.group !== activeSession?.group || !session.element.isConnected) return;
    try {
      session.fit!.fit();
      if (session.ready && session.socket?.readyState === WebSocket.OPEN) {
        session.socket!.send(JSON.stringify({type: 'resize', cols: session.terminal!.cols, rows: session.terminal!.rows}));
      }
    } catch { /* The panel can briefly have no measurable size during layout. */ }
  }

  function renderTabs() {
    const tabs = $('#terminal-tabs');
    const activeIds = new Set(sessions.map(session => session.id));
    for (const node of tabs.querySelectorAll<HTMLElement>(':scope > *')) if (!activeIds.has(node.dataset.sessionId || '')) node.remove();
    for (const session of sessions) {
      session.element.classList.toggle('pane-focused',hasFocus&&session===activeSession);
      if(session.external){const zoomed=maximizedSession===session;session.element.classList.toggle('pane-focused',hasFocus&&session===activeSession);session.paneZoom.disabled=!zoomed&&leaves(session.group.root).length<2;session.paneZoom.setAttribute('aria-label',zoomed?'Restore file pane':'Maximize file pane');session.paneZoom.setAttribute('aria-pressed',String(zoomed));continue;}
      if (!session.tab) {
        session.tab = document.createElement('div');
        session.tab.tabIndex = 0;
        session.tab.setAttribute('role', 'tab');
        session.tab.className = 'terminal-tab';
        session.tab.dataset.sessionId = session.id;
        session.tab.draggable=true;
        session.tab.ondragstart=event=>{if((event.target as Element).closest<HTMLButtonElement>('button,input')){event.preventDefault();return;}draggedSession=session;event.dataTransfer!.setData('application/x-terminal-session',session.id);event.dataTransfer!.effectAllowed='move';};
        session.tab.ondragend=()=>{draggedSession=null;panel.querySelectorAll<HTMLElement>('[data-terminal-drop]').forEach(node=>delete node.dataset.terminalDrop);};
        positionTab(session.tab, `terminal:${session.id}`);
        session.tab.setAttribute('aria-haspopup', 'menu');
        const status = document.createElement('span');
        status.className = 'terminal-tab-status';
        status.setAttribute('aria-hidden', 'true');
        const mark = icon('terminal');
        mark.classList.add('terminal-tab-icon');
        const label = document.createElement('span');
        label.className = 'terminal-tab-label';
        session.tab.append(status, mark, label);
        const close = document.createElement('button'); close.type='button'; close.className='terminal-tab-close'; close.append(icon('close')); close.setAttribute('aria-label','Close terminal'); close.onclick=event=>{event.stopPropagation();destroySession(session);}; session.tab.append(close);
        session.tab.onclick = event => {
          if (event.detail >= 2) { event.preventDefault(); requestAnimationFrame(() => beginRename(session)); }
          else { onSelect?.(); activate(session); setVisible(true); }
        };
        session.tab.oncontextmenu = event => {
          event.preventDefault();
          showMenu(session, event.clientX, event.clientY);
        };
        session.tab.onkeydown = event => {
          if(event.target===session.tab && ['Enter',' '].includes(event.key)){event.preventDefault();onSelect?.();activate(session);setVisible(true);}
          if ((event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu') {
            event.preventDefault();
            const rect = session.tab!.getBoundingClientRect();
            showMenu(session, rect.left, rect.bottom);
          }
        };
        tabs.append(session.tab);
      }
      session.tab.hidden=session.project.id!==lastProject?.id;
      session.tab.setAttribute('aria-pressed', String(visible && hasFocus && session === activeSession));
      session.tab.setAttribute('aria-selected', String(visible && hasFocus && session === activeSession));
      session.tab.title = `${session.shell} · ${session.project.name}`;
      session.tab.querySelector<HTMLElement>('.terminal-tab-status')!.dataset.state = session.state;
      const label = session.tab.querySelector<HTMLElement>('.terminal-tab-label')!;
      const provider=session.agent || (session.launch!=='shell' && session.state!=='closed' ? session.launch : null);
      const name=terminalName(session);
      if (label) label.textContent = name;
      session.paneTitle!.textContent=name;session.paneTitle!.title=name;
      const zoomed=maximizedSession===session;
      session.paneZoom.setAttribute('aria-label',zoomed?'Restore terminal pane':'Maximize terminal pane');session.paneZoom.title=zoomed?'Restore pane':'Maximize pane';session.paneZoom.setAttribute('aria-pressed',String(zoomed));
      session.paneZoom.disabled=!zoomed && leaves(session.group.root).length<2 && !document.querySelector<HTMLElement>('#app')!.classList.contains('file-file-split');
      session.paneHeader.dataset.status=session.agent ? session.agentStatus || 'idle' : session.state;
      if(session.paneProvider!==provider){session.paneProvider=provider;session.paneMark!.replaceChildren();if(['codex','claude'].includes(provider || '')){const image=document.createElement('img');image.src=`/agents/${provider}.svg`;image.alt=provider || '';session.paneMark!.append(image);}else session.paneMark!.append(icon('terminal'));}
    }
  }

  function activate(session:PaneSession|null|undefined) {
    hasFocus=true;
    if(maximizedSession && maximizedSession!==session)maximizedSession=null;
    if (session) session.lastUsed = ++useOrder;
    activeSession = session;if(session)lastProject=session.project;
    if(session?.external)session.onSelect?.();else onSelect?.();
    renderLayout();
    $('#terminal-error').hidden = true;
    $('#terminal-state').textContent = session?.state || 'Closed';
    renderTabs();
    publish();
    if (visible && session) requestAnimationFrame(() => {
      fitSession(session);
      session.terminal?.focus();
    });
  }

  function destroySession(session:PaneSession) {
    session.disposed=true;if(session.reconnectTimer)clearTimeout(session.reconnectTimer);
    if(session.serverId){if(session.socket?.readyState===WebSocket.OPEN)session.socket.send(JSON.stringify({type:'close'}));else void fetch('/api/close-terminal',{method:'POST',headers:{'Content-Type':'application/json','X-AI-Web-Token':token},body:JSON.stringify({sessionId:session.serverId})}).catch(()=>{});}

    if(!session.external)forgetTabPosition(`terminal:${session.id}`);
    if(maximizedSession===session)maximizedSession=null;
    session.paneAnimation?.cancel();
    if(session.activityTimer)clearTimeout(session.activityTimer);
    session.observer?.disconnect();
    if (session.socket && session.socket.readyState < WebSocket.CLOSING) session.socket.close(1000, 'Terminal closed');
    session.terminal?.dispose();
    session.element.remove();
    session.group.root=removePane(session.group.root,session);
    sessions.splice(sessions.indexOf(session), 1);
    if (activeSession === session) {
      activeSession = leaves(session.group.root)[0] || sessions.filter(item=>item.project.id===session.project.id).reduce<PaneSession|null>((latest, item) => !latest || item.lastUsed > latest.lastUsed ? item : latest, null);
      if (activeSession) activate(activeSession);
      else { renderLayout();renderTabs(); setVisible(false); }
    } else {renderLayout();renderTabs();}
    publish();
  }

  function createSession(project:Workspace,launch='shell',allowAuto=true,resume:SessionRecord|null=null,ssh:SshConnection|null=null,restored:SavedTerminal|null=null) {
    const previous=activeSession;
    const area=$('#terminal-screens').getBoundingClientRect();
    const autoGroup=allowAuto && autoSplit && previous?.project.id===project.id && area.width>=800 && area.height>=500 ? previous.group : null;
    const autoTarget=autoGroup?chooseBalancedSplit(autoGroup.root!,session=>{if(maximizedSession)return 0;const rect=session.element.getBoundingClientRect();return rect.width*rect.height/(area.width*area.height);}):null;
    const id = restored?.sessionId||crypto.randomUUID();
    const element = document.createElement('div');
    element.className = 'terminal-screen';
    element.id = `terminal-screen-${id}`;
    const paneHeader=document.createElement('header');paneHeader.className='terminal-pane-header';
    const paneMark=document.createElement('span');paneMark.className='terminal-pane-mark';paneMark.append(icon('terminal'));
    const paneTitle=document.createElement('span');paneTitle.className='terminal-pane-title';
    const paneState=document.createElement('span');paneState.className='terminal-pane-state';paneState.setAttribute('aria-label','Terminal status');
    const paneClose=document.createElement('button');paneClose.type='button';paneClose.className='terminal-pane-close';paneClose.setAttribute('aria-label','Close terminal pane');paneClose.append(icon('close'));
    const paneZoom=document.createElement('button');paneZoom.type='button';paneZoom.className='terminal-pane-zoom';paneZoom.setAttribute('aria-label','Maximize terminal pane');
    paneZoom.innerHTML='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M6 2H2v4M10 2h4v4M2 10v4h4M14 10v4h-4"/></svg>';
    paneHeader.append(paneMark,paneTitle,paneState,paneZoom,paneClose);
    const body=document.createElement('div');body.className='terminal-pane-body';element.append(paneHeader,body);
    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontFamily: '"JetBrains Mono", Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.1,
      scrollback: 5000,
      convertEol: true,
      macOptionIsMeta: false,
      theme: (() => {
        const styles = getComputedStyle(document.documentElement);
        const color = (name:string,fallback:string) => styles.getPropertyValue(name).trim() || fallback;
        const accent = color('--accent', '#d97757');
        return {
          background: color('--code-bg', '#181715'),
          foreground: color('--code-text', '#faf9f5'),
          cursor: accent,
          selectionBackground: /^#[\da-f]{6}$/i.test(accent) ? `${accent}44` : accent,
        };
      })(),
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(body);
    $('#terminal-screens').append(element);

    const session:PaneSession = {...(ssh?{ssh}:{}),...(restored?{serverId:restored.ended?undefined:restored.sessionId,restorePending:restored.ended,customName:true}:{}),group:{root:null},lastUsed:0,id, project, name: restored?.name||ssh?.name||project.name, shell: 'Shell', state: 'connecting', ready: false, socket: null, terminal, fit, element, launch,paneHeader,paneTitle,paneMark,paneZoom,resume,cliTitle:restored?.name||ssh?.name||resume?.name};
    paneZoom.onclick=event=>{event.stopPropagation();toggleMaximize(session);};
    paneClose.onclick=event=>{event.stopPropagation();destroySession(session);};
    paneHeader.ondblclick=event=>{if(!(event.target as Element).closest<HTMLButtonElement>('button'))beginRename(session);};
    paneHeader.draggable=true;
    paneHeader.ondragstart=event=>{
      if((event.target as Element).closest<HTMLButtonElement>('button,input')){event.preventDefault();return;}
      draggedSession=session;event.dataTransfer!.setData('application/x-terminal-session',session.id);event.dataTransfer!.effectAllowed='move';paneHeader.classList.add('pane-dragging');
    };
    paneHeader.ondragend=()=>{draggedSession=null;paneHeader.classList.remove('pane-dragging');panel.querySelectorAll<HTMLElement>('[data-terminal-drop]').forEach(node=>delete node.dataset.terminalDrop);};
    terminal.onTitleChange(title=>{
      const name=threadTitle(title,project);
      // Shell startup also emits OSC titles; do not use its executable path
      // as the name of an agent session.
      if(session.agent || launch!=='shell'){
        if(/^(?:powershell|pwsh|cmd)(?:\.exe)?(?:\s|$)/i.test(title.trim()) || /^[A-Za-z]:[\\/]/.test(title.trim()))return;
        session.activityTitle=title;
        if(name && !/action\s+required/i.test(name))session.cliTitle=name.replace(/^\s*\[?\s*[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏◐◑◒◓✳]\s*\]?\s*/,'');
        renderTabs();
        scheduleActivity(session);
      }
    });
    session.group={root:{session}};
    element.onpointerdown=()=>{if(activeSession!==session||!hasFocus){hasFocus=true;activeSession=session;onSelect?.();session.lastUsed=++useOrder;for(const item of sessions)item.element.classList.toggle('pane-focused',item===session);renderTabs();publish();}};
    paneHeader.oncontextmenu=event=>{if(event.shiftKey)return;event.preventDefault();event.stopPropagation();showMenu(session,event.clientX,event.clientY);};
    element.ondragover=event=>{if(!draggedSession||draggedSession===session)return;event.preventDefault();const rect=element.getBoundingClientRect();element.dataset.terminalDrop=event.clientY>rect.bottom-Math.min(80,rect.height*.2)?'down':event.clientX>rect.right-Math.min(80,rect.width*.2)?'right':'swap';};
    element.ondragleave=event=>{if(!element.contains(event.relatedTarget as Node|null))delete element.dataset.terminalDrop;};
    element.ondrop=event=>{if(!draggedSession||draggedSession===session)return;event.preventDefault();event.stopPropagation();const source=draggedSession,direction=element.dataset.terminalDrop || 'swap';delete element.dataset.terminalDrop;draggedSession=null;if(direction==='swap')swapPanePositions(session,source);else attachPane(session,source,direction as SplitDirection);};
    session.observer = new ResizeObserver(() => fitSession(session));
    session.observer.observe(element);
    terminal.onData(data => {
      if(session.replaying)return;
      if(session.agent || launch!=='shell'){
        const input=trackPromptInput(data,session.inputDraft);session.inputDraft=input.draft;
        if(input.submitted && session.agentStatus!=='blocked')session.turnSubmitted=true;
      }
      if (session.ready && session.socket?.readyState === WebSocket.OPEN) session.socket!.send(JSON.stringify({type: 'input', data}));
    });
    terminal.onResize(({cols, rows}) => {
      if (session.ready && session.socket?.readyState === WebSocket.OPEN) session.socket!.send(JSON.stringify({type: 'resize', cols, rows}));
    });
    sessions.push(session);
    if(autoGroup){
      session.group=autoGroup;
      autoGroup.root=splitPane(autoGroup.root!,autoTarget!.session,session,autoTarget!.direction);
    }
    activate(session);
    renderTabs();

    function connectSocket(){
    if(session.disposed)return;
    const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
    session.socket = new WebSocket(`${scheme}//${location.host}/api/terminal`, ['ai-web-terminal', `token.${token}`]);
    session.socket.addEventListener('open', () => {
      fitSession(session);
      if(session.serverId){terminal.reset();session.socket!.send(JSON.stringify({type:'attach',sessionId:session.serverId,cols:terminal.cols,rows:terminal.rows}));}else {session.serverId=id;journal();session.socket!.send(JSON.stringify({type:'start',sessionId:id,project:project.id,cols:terminal.cols,rows:terminal.rows,detachable:true,...(session.ssh?{ssh:session.ssh}:{})}));}
    });
    session.socket.addEventListener('message', event => {
      let message:TerminalServerMessage;
      try { message = JSON.parse(event.data) as TerminalServerMessage; } catch { return; }
      if (message.type === 'ready') {
        session.ready = true;session.retries=0;session.serverId=message.sessionId;
        session.replaying=Boolean(message.attached);session.state=message.attached?'restoring':'running';session.element.dataset.connection=session.state;
        journal();if(session===activeSession)$('#terminal-error').hidden=true;
        session.shell = message.shell.includes('powershell') ? 'PowerShell' : message.shell;
        if (session === activeSession) $('#terminal-state').textContent = 'Running';
        renderTabs();
        fitSession(session);
        publish();
        if (session === activeSession) terminal.focus();
        if (!message.attached && launch !== 'shell' && launch!=='ssh') session.socket!.send(JSON.stringify({type:'input',data:resume?resumeCommand(resume,message.shell):`${launch}\r`}));
      } else if (message.type === 'data') {
        const finished=()=>{if(message.replay){session.replaying=false;session.state='running';session.element.dataset.connection='running';renderTabs();}scheduleActivity(session);};
        if(message.replay)session.replaying=true;
        if(!message.data)finished();else terminal.write(message.data,finished);
      } else if (message.type === 'agent') {
        session.agent = message.agent;
        renderTabs();
        session.agentStatus = 'idle';
        inspectScreen(session);
        publish();
      } else if (message.type === 'error') {
        session.state = 'error';
        if(!session.ready||message.code==='SESSION_NOT_FOUND'||message.code==='SESSION_START_FAILED'){session.serverId=undefined;session.state='closed';}
        publish();
        if (session === activeSession) {
          $('#terminal-state').textContent = 'Error';
          $('#terminal-error').textContent = message.message;
          $('#terminal-error').hidden = false;
        }
        renderTabs();
      } else if (message.type === 'exit') {
        session.ready = false;session.state='closed';session.serverId=undefined;
        session.agent = null;
        publish();
        if (session === activeSession) $('#terminal-state').textContent = `Exited (${message.exitCode ?? 'unknown'})`;
        renderTabs();
      }
    });
    session.socket.addEventListener('error', () => {
      session.state = 'error';
        publish();
      if (session === activeSession) {
        $('#terminal-state').textContent = 'Connection error';
        $('#terminal-error').textContent = 'Could not connect to the local terminal service.';
        $('#terminal-error').hidden = false;
      }
      renderTabs();
    });
    session.socket.addEventListener('close',event=>{
      session.ready=false;
      if(session.disposed)return;
      if(session.state==='closed'){renderTabs();publish();return;}
      if(session.serverId&&event.code!==4001&&session.state!=='closed'){
        session.state='reconnecting';session.retries=(session.retries||0)+1;
        if(session.retries<=5)session.reconnectTimer=setTimeout(connectSocket,Math.min(8000,500*2**(session.retries-1)));
        else session.state='disconnected';
      }else if(session.state!=='closed')session.state='disconnected';
      if(session===activeSession){$('#terminal-state').textContent=session.state;$('#terminal-error').textContent=event.code===4001?'This session is open in another browser tab.':session.state==='reconnecting'?'Reconnecting to the running terminal…':'Connection lost. Reload to reconnect.';$('#terminal-error').hidden=session.state==='closed';}
      renderTabs();publish();
    });
    }
    session.reconnect=()=>{if(session.disposed||!session.serverId||session.socket?.readyState===WebSocket.CONNECTING||session.socket?.readyState===WebSocket.OPEN)return;if(session.reconnectTimer)clearTimeout(session.reconnectTimer);session.retries=0;session.state='reconnecting';connectSocket();};
    if(restored?.ended){session.state='ended';terminal.writeln('This terminal ended when Pane last quit. Use Restart terminal to start a new session, or History to resume an existing AI conversation.');renderTabs();}else connectSocket();

    return session;
  }

  function toggle(project?:Workspace|null) {
    if (visible) { setVisible(false); return; }
    if (!project) {
      $('#terminal-error').textContent = 'Select a workspace before opening a terminal.';
      $('#terminal-error').hidden = false;
      setVisible(true);
      return;
    }
    lastProject = project;
    const existing = sessions.find(session => session.project.id === project.id);
    if (existing) activate(existing);
    else createSession(project);
    setVisible(true);
  }

  function closeActive() {
    if (activeSession) destroySession(activeSession);
    else setVisible(false);
  }

  function showMostRecent() {
    const recent = sessions.filter(item=>!item.external&&(!lastProject||item.project.id===lastProject.id)).reduce<PaneSession|null>((latest, item) => !latest || item.lastUsed > latest.lastUsed ? item : latest, null);
    if (!recent) return false;
    activate(recent);
    setVisible(true);
    return true;
  }
  function inputMostRecent(data:string) {
    const recent=sessions.filter(session=>(!lastProject||session.project.id===lastProject.id)&&session.ready && session.socket?.readyState===WebSocket.OPEN).reduce<PaneSession|null>((latest,item)=>!latest||item.lastUsed>latest.lastUsed?item:latest,null);
    if(!recent)return false;
    onSelect?.();closeLauncher();closeMenu();activate(recent);setVisible(true);
    recent.terminal!.focus();recent.inputDraft=(recent.inputDraft || '')+data;recent.socket!.send(JSON.stringify({type:'input',data}));return true;
  }

  function restartSession(session = activeSession) {
    if (!session) return;
    const project = session.project;
    destroySession(session);
    lastProject = project;
    createSession(project, session.launch, false,session.resume,session.ssh||null);
    setVisible(true);
  }

  function closeMenu() {
    $('#terminal-menu').hidden = true;
    menuSession?.tab?.setAttribute('aria-expanded', 'false');
    menuSession = undefined;
  }

  function showMenu(session:PaneSession,x:number,y:number) {
    closeMenu();
    onSelect?.();
    activate(session);
    setVisible(true);
    menuSession = session;
    session.tab!.setAttribute('aria-expanded', 'true');
    const menu = $('#terminal-menu');
    menu.hidden = false;
    const rect = menu.getBoundingClientRect();
    menuAnchor={x:Math.max(8,Math.min(x,innerWidth-rect.width-8)),y:Math.max(8,Math.min(y,innerHeight-rect.height-8))};
    menu.style.left = `${menuAnchor.x}px`;
    menu.style.top = `${menuAnchor.y}px`;
    requestAnimationFrame(() => menu.querySelector<HTMLElement>('[role="menuitem"]')!?.focus());
  }

  function beginRename(session:PaneSession|undefined) {
    if (!session?.tab || session.renameInput) return;
    const inPane=document.querySelector<HTMLElement>('#unified-tabs')!.hidden;
    const label = inPane?session.paneTitle:session.tab.querySelector<HTMLElement>('.terminal-tab-label');
    if (!label) return;
    const input = document.createElement('input');
    input.className = 'terminal-tab-rename';
    input.type = 'text';
    input.maxLength = 48;
    input.value = label.textContent || '';
    input.setAttribute('aria-label', 'Terminal tab name');
    label.replaceWith(input);
    session.renameInput = input;
    let finished = false;
    const finish = (save:boolean) => {
      if (finished) return;
      finished = true;
      if (save && input.value.trim()) { session.name = input.value.trim(); session.customName = true; }
      session.renameInput = null;
      if (sessions.includes(session)) {
        const restoredLabel = document.createElement('span');
        restoredLabel.className = inPane?'terminal-pane-title':'terminal-tab-label';
        restoredLabel.textContent = session.name;
        input.replaceWith(restoredLabel);
        if(inPane)session.paneTitle=restoredLabel;
        renderTabs();
        journal();
        if(inPane)session.terminal?.focus();else session.tab!.focus();
      }
    };
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); finish(true); }
      if (event.key === 'Escape') { event.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
    input.focus();
    input.select();
  }

  $('#terminal-new').onclick = () => {
    if(!launcher.hidden){closeLauncher();return;}
    closeMenu();showLauncher();
  };
  launcher.onclick = event => {
    const launch=(event.target as Element).closest<HTMLElement>('[data-launch]')?.dataset.launch;if(!launch)return;
    closeLauncher();
    onSelect?.();
    const split=pendingSplit;pendingSplit=null;
    const project = split?.target.project || lastProject || activeSession?.project;
    if (!project) {
      $('#terminal-error').textContent = 'Select a workspace before opening a terminal.';
      $('#terminal-error').hidden = false;
      setVisible(true);
      return;
    }
    lastProject = project;
    const open=(connection:SshConnection|null=null)=>{const existing=connection?sessions.find(session=>session.project.id===project.id&&session.ssh?.host===connection.host&&session.ssh?.username===connection.username&&session.ssh?.port===connection.port&&session.ssh?.identityFile===connection.identityFile&&session.state!=='closed'&&!session.disposed):undefined;if(existing){if(existing.state==='disconnected')existing.reconnect?.();activate(existing);setVisible(true);return;}const created=createSession(project,launch,!split,null,connection);if(split&&sessions.includes(split.target))attachPane(split.target,created,split.direction);setVisible(true);};
    if(launch==='ssh')sshConnections.open(connection=>open(connection));else open();
  };
  $('#terminal-menu').onclick = event => {
    const action = (event.target as Element).closest<HTMLElement>('[data-terminal-action]')?.dataset.terminalAction;
    const session = menuSession;
    const anchor=menuAnchor;
    closeMenu();
    if(session&&(action==='split-right'||action==='split-down')) {
      const direction=action==='split-right'?'right':'down';
      const previous=sessions.filter(item=>item!==session && item.project.id===session.project.id && item.group!==session.group).reduce<PaneSession|null>((latest,item)=>!latest||item.lastUsed>latest.lastUsed?item:latest,null);
      if(previous && leaves(session.group.root).length===1) attachPane(previous,session,direction);
      else showLauncher(session,direction,anchor);
    }
    if (action === 'rename') beginRename(session);
    if (action === 'clear') session?.terminal?.clear();
    if (action === 'restart') restartSession(session);
    if (action === 'close' && session) destroySession(session);
  };
  document.addEventListener('pointerdown', event => {
    if(!(event.target as Element).closest<HTMLElement>('#terminal-launcher,#terminal-new'))closeLauncher();
    if (!(event.target as Element).closest<HTMLElement>('#terminal-menu, #terminal-tabs')) closeMenu();
  });
  document.addEventListener('keydown', event => {
    if(event.key==='Escape'&&!launcher.hidden){const target=pendingSplit?.target;pendingSplit=null;closeLauncher();if(target&&!target.external)target.terminal?.focus();else $('#terminal-new').focus();return;}
    if(!launcher.hidden && ['ArrowDown','ArrowUp','ArrowLeft','ArrowRight'].includes(event.key)){
      event.preventDefault();const buttons=[...choices.querySelectorAll<HTMLButtonElement>('button')];const direction=['ArrowUp','ArrowLeft'].includes(event.key)?-1:1;buttons[(buttons.indexOf(document.activeElement as HTMLButtonElement)+direction+buttons.length)%buttons.length].focus();
    }
    if (event.key === 'Escape' && !$('#terminal-menu').hidden) {
      const session = menuSession;
      closeMenu();
      session?.tab?.focus();
    }
  });
  function placeFilePane(options:ExternalFilePane,targetId:string|null|undefined,direction:SplitDirection|'bottom'|'swap'='right'){
    let session=sessions.find(item=>item.id===options.id);
    const target=targetId===null?null:sessions.find(item=>item.id===targetId)||activeSession;
    if(!session){
      session={...options,external:true,name:'',shell:'Shell',state:'running',launch:'shell',lastUsed:++useOrder,group:{root:null}};
      session.group={root:{session}};sessions.push(session);
      const mounted=session;
      mounted.paneZoom.onclick=()=>toggleMaximize(mounted);
      mounted.element.onpointerdown=()=>{if(activeSession!==mounted||!hasFocus){activeSession=mounted;hasFocus=true;mounted.lastUsed=++useOrder;mounted.onSelect?.();renderTabs();publish();}};
      mounted.paneHeader.draggable=true;
      mounted.paneHeader.ondragstart=event=>{if((event.target as Element).closest<HTMLButtonElement>('button,input')){event.preventDefault();return;}draggedSession=mounted;event.dataTransfer!.setData('application/x-terminal-session',mounted.id);event.dataTransfer!.effectAllowed='move';};
      mounted.paneHeader.ondragend=()=>{draggedSession=null;panel.querySelectorAll<HTMLElement>('[data-terminal-drop]').forEach(node=>delete node.dataset.terminalDrop);};
      mounted.element.ondragover=event=>{if(!draggedSession||draggedSession===mounted)return;event.preventDefault();const rect=mounted.element.getBoundingClientRect();mounted.element.dataset.terminalDrop=event.clientY>rect.bottom-Math.min(80,rect.height*.2)?'down':event.clientX>rect.right-Math.min(80,rect.width*.2)?'right':'swap';};
      mounted.element.ondragleave=event=>{if(!mounted.element.contains(event.relatedTarget as Node|null))delete mounted.element.dataset.terminalDrop;};
      mounted.element.ondrop=event=>{if(!draggedSession||draggedSession===mounted)return;event.preventDefault();event.stopPropagation();const source=draggedSession,direction=mounted.element.dataset.terminalDrop||'swap';draggedSession=null;delete mounted.element.dataset.terminalDrop;if(direction==='swap')swapPanePositions(mounted,source);else attachPane(mounted,source,direction as SplitDirection);};
    }
    if(target&&target!==session){if(direction==='swap')swapPanePositions(target,session);else attachPane(target,session,direction==='bottom'?'down':direction);}else activate(session);
    setVisible(true);return session;
  }
  function resumeSession(record:SessionRecord,project:Workspace|undefined){
    validateResume(record);if(!project)throw new Error('Select a workspace before resuming.');
    const existing=sessions.find(session=>session.resume?.id===record.id&&session.state!=='closed'&&session.state!=='error');
    lastProject=project;closeLauncher();closeMenu();if(existing)activate(existing);else createSession(project,record.agent,true,record);setVisible(true);
  }
  function captureLayout():SavedLayout{
    const groups=[...new Set(sessions.map(session=>session.group))];
    function capture(tree:PaneTree<PaneSession>):SavedPaneTree{return 'session' in tree?{id:tree.session.id}:{direction:tree.direction,ratio:tree.ratio,first:capture(tree.first),second:capture(tree.second)};}
    const selected:Record<string,string>={};for(const session of [...sessions].sort((a,b)=>a.lastUsed-b.lastUsed))selected[session.project.id]=session.id;
    return {groups:groups.flatMap(group=>group.root?[{project:leaves(group.root)[0].project.id,tree:capture(group.root),manual:Boolean(group.manual)}]:[]),selected,...(maximizedSession?{maximized:maximizedSession.id}:{})};
  }
  function restoreLayout(saved:SavedLayout){
    const used=new Set<string>();
    function restore(tree:SavedPaneTree,project:string):PaneTree<PaneSession>|null{
      if('id' in tree){const session=sessions.find(session=>session.id===tree.id&&session.project.id===project);if(!session||used.has(session.id))return null;used.add(session.id);return {session};}
      const first=restore(tree.first,project),second=restore(tree.second,project);return !first?second:!second?first:{direction:tree.direction,ratio:tree.ratio,first,second};
    }
    for(const savedGroup of saved.groups){const root=restore(savedGroup.tree,savedGroup.project);if(!root)continue;const group={root,manual:savedGroup.manual};for(const session of leaves(root))session.group=group;}
    for(const id of Object.values(saved.selected)){const session=sessions.find(session=>session.id===id);if(session)session.lastUsed=++useOrder;}
    maximizedSession=sessions.find(session=>session.id===saved.maximized);renderLayout();renderTabs();
  }
  return {element: panel,checkpoint:journal,captureLayout,restoreLayout,get runningCount(){return sessions.filter(session=>!session.external&&session.state!=='closed'&&!session.restorePending).length;},startSession(project:Workspace,launch:'shell'|'claude'|'codex'){lastProject=project;closeLauncher();closeMenu();createSession(project,launch,false);setVisible(true);},restore(projects:Workspace[]){for(const saved of savedTerminals){const project=projects.find(item=>item.id===saved.projectId);if(project)createSession(project,saved.launch,false,null,saved.ssh||null,saved);}if(savedTerminals.length&&sessions.length)setVisible(true);}, toggle, showMostRecent, inputMostRecent, resumeSession, placeFilePane, get focusedProjectId(){return activeSession?.project?.id;}, removeFilePane(id:string){const pane=sessions.find(item=>item.external&&item.id===id);if(pane)destroySession(pane);}, hasFilePane(id:string){return sessions.some(item=>item.external&&item.id===id);}, get activePaneId(){return activeSession?.id;}, refreshPaneControls:renderTabs, setFocused(next:boolean){hasFocus=next;renderTabs();publish();}, setProject(project:Workspace|null){lastProject=project;closeLauncher();closeMenu();const recent=sessions.filter(session=>session.project.id===project?.id).sort((a,b)=>b.lastUsed-a.lastUsed)[0];if(recent){activate(recent);setVisible(true);}else{activeSession=null;renderLayout();setVisible(false);}}, newSession(project:Workspace|null){if(project)lastProject=project;$('#terminal-new').click();}, select(id:string) { const session=sessions.find(item=>item.id===id); if(session){activate(session);setVisible(true);} }, close: () => { for (const session of [...sessions]) destroySession(session); setVisible(false); }, get visible() { return visible; }};
}
