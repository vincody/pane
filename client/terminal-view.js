import {Terminal} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
import {positionTab,forgetTabPosition} from './tab-position.js';
import {leaves, removePane, splitPane, swapPanes, chooseBalancedSplit} from './terminal-layout.js';
import {terminalName, threadTitle} from './terminal-name.js';
import {readTerminalActivity} from './terminal-activity.js';
import {trackPromptInput} from './terminal-input.js';
import {resumeCommand,validateResume} from './history-session.js';
import '@xterm/xterm/css/xterm.css';

export function createTerminalView({token, icon, onClose, onSessionsChange, onSelect}) {
  const workspace = document.querySelector('#workspace');
  const panel = document.createElement('section');
  panel.id = 'terminal-panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Interactive terminal');
  panel.innerHTML = '<header class="terminal-titlebar"><div id="terminal-tabs" role="group" aria-label="Terminal sessions"></div><div class="terminal-title-actions"><button id="terminal-new" class="terminal-title-button" aria-label="New terminal" title="New terminal"></button><button id="terminal-close" class="terminal-title-button" aria-label="Close terminal session" title="Close terminal session"></button><span id="terminal-state" class="sr-only" role="status">Closed</span></div></header><div id="terminal-screens"></div><div id="terminal-error" role="alert" hidden></div><div id="terminal-menu" role="menu" aria-label="Terminal tab options" hidden><button type="button" role="menuitem" data-terminal-action="rename">Rename tab</button><button type="button" role="menuitem" data-terminal-action="clear">Clear terminal</button><button type="button" role="menuitem" data-terminal-action="restart">Restart terminal</button><button type="button" role="menuitem" data-terminal-action="close">Close terminal</button></div>';

  const header = panel.querySelector('.terminal-titlebar');
  document.querySelector('.topbar').insertBefore(header, document.querySelector('.topbar .toolbar-actions'));
  header.classList.add('unified-terminal-tabs');
  const strip = document.createElement('div'); strip.id = 'unified-tabs';
  header.before(strip); strip.append(document.querySelector('#tabs'), header);
  const $ = selector => panel.querySelector(selector) || header.querySelector(selector) || document.querySelector(selector);
  $('#terminal-new').append(icon('plus'));
  $('#terminal-new').append(document.createTextNode('Agent'));
  document.querySelector('.workspace-actions').append($('#terminal-new'));
  $('#terminal-close').append(icon('close'));
  $('#terminal-close').remove();
  for(const [action,label] of [['split-right','Split right'],['split-down','Split down']]){
    const button=document.createElement('button');button.type='button';button.setAttribute('role','menuitem');button.dataset.terminalAction=action;button.textContent=label;$('#terminal-menu').prepend(button);
  }
  const launcher = document.createElement('div'); launcher.id='terminal-launcher'; launcher.hidden=true; launcher.setAttribute('role','dialog'); launcher.setAttribute('aria-label','New session');
  const heading=document.createElement('strong');heading.textContent='New session';
  const description=document.createElement('p');description.textContent='Choose an agent or open a shell.';
  const choices=document.createElement('div');choices.className='terminal-launch-choices';
  for(const [kind,label] of [['claude','Claude Code'],['codex','Codex'],['shell','Shell']]){
    const button=document.createElement('button');button.type='button';button.dataset.launch=kind;
    if(kind==='shell')button.append(icon('terminal'));else{const image=document.createElement('img');image.src=`/agents/${kind}.svg`;image.alt='';button.append(image);}
    button.append(document.createTextNode(label));choices.append(button);
  }
  launcher.append(heading,description,choices);document.body.append(launcher);
  $('#terminal-new').setAttribute('aria-haspopup','dialog');$('#terminal-new').setAttribute('aria-expanded','false');$('#terminal-new').title='New session';$('#terminal-new').setAttribute('aria-label','New session');
  function closeLauncher(){launcher.hidden=true;$('#terminal-new').setAttribute('aria-expanded','false');}
  const sessions = [];
  let useOrder = 0;
  let activeSession, menuSession, lastProject, visible = false;
  let hasFocus=true;
  let pendingSplit, draggedSession;
  let maximizedSession;
  function toggleMaximize(session){
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
  document.querySelector('.settings-footnote').before(autoSetting);
  const autoCheckbox=autoSetting.querySelector('input');autoCheckbox.checked=autoSplit;autoCheckbox.onchange=()=>{autoSplit=autoCheckbox.checked;try{localStorage.setItem('ai-web.auto-split-terminals',String(autoSplit));}catch{}};
  const stash=document.createElement('div');stash.hidden=true;panel.append(stash);
  function renderLayout() {
    document.querySelector('#app').classList.toggle('terminal-pane-maximized',Boolean(visible && maximizedSession===activeSession && maximizedSession));
    for(const session of sessions) { stash.append(session.element); session.element.hidden=true; }
    $('#terminal-screens').replaceChildren();
    function draw(tree){
      if(tree.session){const session=tree.session;session.element.dataset.layoutId=session.id;session.element.style.flex='1 1 0';session.element.hidden=false;session.element.classList.toggle('pane-focused',session===activeSession);return session.element;}
      const branch=document.createElement('div');branch.className=`terminal-split terminal-split-${tree.direction}`;
      const first=draw(tree.first),second=draw(tree.second);first.style.flex=`${tree.ratio} 1 0`;second.style.flex=`${1-tree.ratio} 1 0`;
      const divider=document.createElement('div');divider.className='terminal-divider';divider.tabIndex=0;divider.setAttribute('role','separator');divider.setAttribute('aria-label','Resize terminal panes');divider.setAttribute('aria-orientation',tree.direction==='right'?'vertical':'horizontal');
      const setRatio=ratio=>{tree.ratio=Math.max(.15,Math.min(.85,ratio));first.style.flex=`${tree.ratio} 1 0`;second.style.flex=`${1-tree.ratio} 1 0`;divider.setAttribute('aria-valuenow',String(Math.round(tree.ratio*100)));};setRatio(tree.ratio);
      divider.onpointerdown=event=>{event.preventDefault();activeSession.group.manual=true;divider.setPointerCapture(event.pointerId);divider.classList.add('dragging');};
      divider.onpointermove=event=>{if(!divider.hasPointerCapture(event.pointerId))return;const rect=branch.getBoundingClientRect();setRatio(tree.direction==='right'?(event.clientX-rect.left)/rect.width:(event.clientY-rect.top)/rect.height);};
      divider.onpointerup=divider.onpointercancel=event=>{if(divider.hasPointerCapture(event.pointerId))divider.releasePointerCapture(event.pointerId);divider.classList.remove('dragging');};
      divider.ondblclick=()=>{activeSession.group.manual=true;setRatio(.5);};divider.onkeydown=event=>{if(['ArrowLeft','ArrowUp','ArrowRight','ArrowDown','Home'].includes(event.key)){event.preventDefault();activeSession.group.manual=true;setRatio(event.key==='Home'?.5:tree.ratio+(['ArrowLeft','ArrowUp'].includes(event.key)?-.05:.05));}};
      branch.append(first,divider,second);return branch;
    }
    if(activeSession?.group?.root)$('#terminal-screens').append(draw(maximizedSession===activeSession?{session:activeSession}:activeSession.group.root));
    requestAnimationFrame(()=>{for(const session of leaves(activeSession?.group?.root))fitSession(session);});
  }
  function attachPane(target, session, direction){
    if(!target || target===session)return;
    if(session.group)session.group.root=removePane(session.group.root,session);
    session.group=target.group;session.group.manual=true;session.group.root=splitPane(session.group.root,target,session,direction);activate(session);setVisible(true);
  }
  function swapPanePositions(target,source){
    const sourceGroup=source.group,targetGroup=target.group;
    sourceGroup.root=swapPanes(sourceGroup.root,source,target);sourceGroup.manual=true;
    if(targetGroup!==sourceGroup){targetGroup.root=swapPanes(targetGroup.root,source,target);targetGroup.manual=true;source.group=targetGroup;target.group=sourceGroup;}
    activate(source);setVisible(true);
  }
  function showLauncher(target, direction){pendingSplit=target?{target,direction}:null;heading.textContent=target?(direction==='right'?'Split right':'Split down'):'New session';launcher.hidden=false;$('#terminal-new').setAttribute('aria-expanded','true');const rect=$('#terminal-new').getBoundingClientRect();launcher.style.left=`${Math.max(8,Math.min(rect.left,innerWidth-launcher.offsetWidth-8))}px`;launcher.style.top=`${rect.bottom+8}px`;choices.querySelector('button').focus();}
  const publish = () => onSessionsChange?.(sessions.filter(session => session.agent && session.ready).map(session => ({id:session.id, project:session.project.id, agent:session.agent, name:terminalName(session), status:session.agentStatus || 'idle', completed:Boolean(session.activity?.completed), selected:visible && hasFocus && session===activeSession})));
  function scheduleActivity(session) {
    // Bound the wait: spinner frames must not postpone detection forever.
    if(session.activityTimer)return;
    session.activityTimer=setTimeout(()=>{session.activityTimer=null;if(sessions.includes(session))inspectScreen(session);},200);
  }
  function inspectScreen(session) {
    if (!session.agent || !session.ready) return;
    const buffer = session.terminal.buffer.active;
    const lines = [];
    for (let y = buffer.baseY; y < buffer.baseY + session.terminal.rows; y++) lines.push(buffer.getLine(y)?.translateToString(true) || '');
    const screen = lines.join('\n');
    const wasCompleted=session.activity?.completed;
    session.activity=readTerminalActivity(screen,session.activity,{title:session.activityTitle,agent:session.agent});
    // Startup spinners and title changes are not a user-requested work turn.
    if(session.activity.completed){session.activity.completed=Boolean(session.turnSubmitted);session.turnSubmitted=false;}
    const {status,completed}=session.activity;
    if (status !== session.agentStatus || completed || wasCompleted) { session.agentStatus = status; renderTabs(); publish(); }
  }

  function setVisible(next) {
    visible = next;
    panel.hidden = !next;
    workspace.hidden = next;
    document.querySelector('#app').classList.toggle('terminal-pane-maximized',Boolean(next && maximizedSession===activeSession && maximizedSession));
    onClose?.(next);
    renderTabs();
    publish();
    if (next && activeSession) requestAnimationFrame(() => {
      for(const session of leaves(activeSession.group.root))fitSession(session);
      activeSession.terminal?.focus();
    });
  }

  function fitSession(session) {
    if(session.external){session.layout?.();return;}
    if (!visible || session.element.hidden || session.group !== activeSession?.group || !session.element.isConnected) return;
    try {
      session.fit.fit();
      if (session.ready && session.socket?.readyState === WebSocket.OPEN) {
        session.socket.send(JSON.stringify({type: 'resize', cols: session.terminal.cols, rows: session.terminal.rows}));
      }
    } catch { /* The panel can briefly have no measurable size during layout. */ }
  }

  function renderTabs() {
    const tabs = $('#terminal-tabs');
    const activeIds = new Set(sessions.map(session => session.id));
    for (const node of tabs.children) if (!activeIds.has(node.dataset.sessionId)) node.remove();
    for (const session of sessions) {
      if(session.external){const zoomed=maximizedSession===session;session.element.classList.toggle('pane-focused',hasFocus&&session===activeSession);session.paneZoom.disabled=!zoomed&&leaves(session.group.root).length<2;session.paneZoom.setAttribute('aria-label',zoomed?'Restore file pane':'Maximize file pane');session.paneZoom.setAttribute('aria-pressed',String(zoomed));continue;}
      if (!session.tab) {
        session.tab = document.createElement('div');
        session.tab.tabIndex = 0;
        session.tab.setAttribute('role', 'tab');
        session.tab.className = 'terminal-tab';
        session.tab.dataset.sessionId = session.id;
        session.tab.draggable=true;
        session.tab.ondragstart=event=>{if(event.target.closest('button,input')){event.preventDefault();return;}draggedSession=session;event.dataTransfer.setData('application/x-terminal-session',session.id);event.dataTransfer.effectAllowed='move';};
        session.tab.ondragend=()=>{draggedSession=null;panel.querySelectorAll('[data-terminal-drop]').forEach(node=>delete node.dataset.terminalDrop);};
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
            const rect = session.tab.getBoundingClientRect();
            showMenu(session, rect.left, rect.bottom);
          }
        };
        tabs.append(session.tab);
      }
      session.tab.setAttribute('aria-pressed', String(visible && hasFocus && session === activeSession));
      session.tab.setAttribute('aria-selected', String(visible && hasFocus && session === activeSession));
      session.tab.title = `${session.shell} · ${session.project.name}`;
      session.tab.querySelector('.terminal-tab-status').dataset.state = session.state;
      const label = session.tab.querySelector('.terminal-tab-label');
      const provider=session.agent || (session.launch!=='shell' && session.state!=='closed' ? session.launch : null);
      const name=terminalName(session);
      if (label) label.textContent = name;
      session.paneTitle.textContent=name;session.paneTitle.title=name;
      const zoomed=maximizedSession===session;
      session.paneZoom.setAttribute('aria-label',zoomed?'Restore terminal pane':'Maximize terminal pane');session.paneZoom.title=zoomed?'Restore pane':'Maximize pane';session.paneZoom.setAttribute('aria-pressed',String(zoomed));
      session.paneZoom.disabled=!zoomed && leaves(session.group.root).length<2 && !document.querySelector('#app').classList.contains('file-file-split');
      session.paneHeader.dataset.status=session.agent ? session.agentStatus || 'idle' : session.state;
      if(session.paneProvider!==provider){session.paneProvider=provider;session.paneMark.replaceChildren();if(['codex','claude'].includes(provider)){const image=document.createElement('img');image.src=`/agents/${provider}.svg`;image.alt=provider;session.paneMark.append(image);}else session.paneMark.append(icon('terminal'));}
    }
  }

  function activate(session) {
    hasFocus=true;
    if(maximizedSession && maximizedSession!==session)maximizedSession=null;
    if (session) session.lastUsed = ++useOrder;
    activeSession = session;
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

  function destroySession(session) {
    if(!session.external)forgetTabPosition(`terminal:${session.id}`);
    if(maximizedSession===session)maximizedSession=null;
    session.paneAnimation?.cancel();
    clearTimeout(session.activityTimer);
    session.observer?.disconnect();
    if (session.socket && session.socket.readyState < WebSocket.CLOSING) session.socket.close(1000, 'Terminal closed');
    session.terminal?.dispose();
    session.element.remove();
    session.group.root=removePane(session.group.root,session);
    sessions.splice(sessions.indexOf(session), 1);
    if (activeSession === session) {
      activeSession = leaves(session.group.root)[0] || sessions.reduce((latest, item) => !latest || item.lastUsed > latest.lastUsed ? item : latest, null);
      if (activeSession) activate(activeSession);
      else { renderLayout();renderTabs(); setVisible(false); }
    } else {renderLayout();renderTabs();}
    publish();
  }

  function createSession(project, launch = 'shell', allowAuto = true, resume = null) {
    const previous=activeSession;
    const area=$('#terminal-screens').getBoundingClientRect();
    const autoGroup=allowAuto && autoSplit && previous?.project.id===project.id && area.width>=800 && area.height>=500 ? previous.group : null;
    const autoTarget=autoGroup?chooseBalancedSplit(autoGroup.root,session=>{if(maximizedSession)return 0;const rect=session.element.getBoundingClientRect();return rect.width*rect.height/(area.width*area.height);}):null;
    const id = crypto.randomUUID();
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
      lineHeight: 1.35,
      scrollback: 5000,
      convertEol: true,
      macOptionIsMeta: false,
      theme: (() => {
        const styles = getComputedStyle(document.documentElement);
        const color = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
        const accent = color('--accent', '#d97757');
        return {
          background: color('--bg', '#262522'),
          foreground: color('--text', '#ece7de'),
          cursor: accent,
          selectionBackground: /^#[\da-f]{6}$/i.test(accent) ? `${accent}44` : accent,
        };
      })(),
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(body);
    $('#terminal-screens').append(element);

    const session = {id, project, name: project.name, shell: 'Shell', state: 'connecting', ready: false, socket: null, terminal, fit, element, launch,paneHeader,paneTitle,paneMark,paneZoom,resume,cliTitle:resume?.name};
    paneZoom.onclick=event=>{event.stopPropagation();toggleMaximize(session);};
    paneClose.onclick=event=>{event.stopPropagation();destroySession(session);};
    paneHeader.ondblclick=event=>{if(!event.target.closest('button'))beginRename(session);};
    paneHeader.draggable=true;
    paneHeader.ondragstart=event=>{
      if(event.target.closest('button,input')){event.preventDefault();return;}
      draggedSession=session;event.dataTransfer.setData('application/x-terminal-session',session.id);event.dataTransfer.effectAllowed='move';paneHeader.classList.add('pane-dragging');
    };
    paneHeader.ondragend=()=>{draggedSession=null;paneHeader.classList.remove('pane-dragging');panel.querySelectorAll('[data-terminal-drop]').forEach(node=>delete node.dataset.terminalDrop);};
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
    element.oncontextmenu=event=>{if(event.shiftKey)return;event.preventDefault();showMenu(session,event.clientX,event.clientY);};
    element.ondragover=event=>{if(!draggedSession||draggedSession===session)return;event.preventDefault();const rect=element.getBoundingClientRect();element.dataset.terminalDrop=event.clientY>rect.bottom-Math.min(80,rect.height*.2)?'down':event.clientX>rect.right-Math.min(80,rect.width*.2)?'right':'swap';};
    element.ondragleave=event=>{if(!element.contains(event.relatedTarget))delete element.dataset.terminalDrop;};
    element.ondrop=event=>{if(!draggedSession||draggedSession===session)return;event.preventDefault();event.stopPropagation();const source=draggedSession,direction=element.dataset.terminalDrop || 'swap';delete element.dataset.terminalDrop;draggedSession=null;if(direction==='swap')swapPanePositions(session,source);else attachPane(session,source,direction);};
    session.observer = new ResizeObserver(() => fitSession(session));
    session.observer.observe(element);
    terminal.onData(data => {
      if(session.agent || launch!=='shell'){
        const input=trackPromptInput(data,session.inputDraft);session.inputDraft=input.draft;
        if(input.submitted && session.agentStatus!=='blocked')session.turnSubmitted=true;
      }
      if (session.ready && session.socket?.readyState === WebSocket.OPEN) session.socket.send(JSON.stringify({type: 'input', data}));
    });
    terminal.onResize(({cols, rows}) => {
      if (session.ready && session.socket?.readyState === WebSocket.OPEN) session.socket.send(JSON.stringify({type: 'resize', cols, rows}));
    });
    sessions.push(session);
    if(autoGroup){
      session.group=autoGroup;
      autoGroup.root=splitPane(autoGroup.root,autoTarget.session,session,autoTarget.direction);
    }
    activate(session);
    renderTabs();

    const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
    session.socket = new WebSocket(`${scheme}//${location.host}/api/terminal`, ['ai-web-terminal', `token.${token}`]);
    session.socket.addEventListener('open', () => {
      fitSession(session);
      session.socket.send(JSON.stringify({type: 'start', project: project.id, cols: terminal.cols, rows: terminal.rows}));
    });
    session.socket.addEventListener('message', event => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === 'ready') {
        session.ready = true;
        session.state = 'running';
        session.shell = message.shell.includes('powershell') ? 'PowerShell' : message.shell;
        if (session === activeSession) $('#terminal-state').textContent = 'Running';
        renderTabs();
        fitSession(session);
        if (session === activeSession) terminal.focus();
        if (launch !== 'shell') session.socket.send(JSON.stringify({type:'input',data:resume?resumeCommand(resume,message.shell):`${launch}\r`}));
      } else if (message.type === 'data') {
        terminal.write(message.data, () => {
          scheduleActivity(session);
        });
      } else if (message.type === 'agent') {
        session.agent = message.agent;
        renderTabs();
        session.agentStatus = 'idle';
        inspectScreen(session);
        publish();
      } else if (message.type === 'error') {
        session.state = 'error';
        if (session === activeSession) {
          $('#terminal-state').textContent = 'Error';
          $('#terminal-error').textContent = message.message;
          $('#terminal-error').hidden = false;
        }
        renderTabs();
      } else if (message.type === 'exit') {
        session.ready = false;
        session.agent = null;
        publish();
        session.state = 'closed';
        if (session === activeSession) $('#terminal-state').textContent = `Exited (${message.exitCode ?? 'unknown'})`;
        renderTabs();
      }
    });
    session.socket.addEventListener('error', () => {
      session.state = 'error';
      if (session === activeSession) {
        $('#terminal-state').textContent = 'Connection error';
        $('#terminal-error').textContent = 'Could not connect to the local terminal service.';
        $('#terminal-error').hidden = false;
      }
      renderTabs();
    });
    session.socket.addEventListener('close', event => {
      session.ready = false;
      session.agent = null;
      publish();
      if (event.code !== 1000 && session.state !== 'error') session.state = 'closed';
      if (session === activeSession && event.code !== 1000 && session.state !== 'error') {
        $('#terminal-state').textContent = 'Disconnected';
        if (event.reason) {
          $('#terminal-error').textContent = event.reason;
          $('#terminal-error').hidden = false;
        }
      }
      renderTabs();
    });
    return session;
  }

  function toggle(project) {
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
    const recent = sessions.filter(item=>!item.external).reduce((latest, item) => !latest || item.lastUsed > latest.lastUsed ? item : latest, null);
    if (!recent) return false;
    activate(recent);
    setVisible(true);
    return true;
  }
  function inputMostRecent(data) {
    const recent=sessions.filter(session=>session.ready && session.socket?.readyState===WebSocket.OPEN).reduce((latest,item)=>!latest||item.lastUsed>latest.lastUsed?item:latest,null);
    if(!recent)return false;
    onSelect?.();closeLauncher();closeMenu();activate(recent);setVisible(true);
    recent.terminal.focus();recent.inputDraft=(recent.inputDraft || '')+data;recent.socket.send(JSON.stringify({type:'input',data}));return true;
  }

  function restartSession(session = activeSession) {
    if (!session) return;
    const project = session.project;
    destroySession(session);
    lastProject = project;
    createSession(project, session.launch, false,session.resume);
    setVisible(true);
  }

  function closeMenu() {
    $('#terminal-menu').hidden = true;
    menuSession?.tab?.setAttribute('aria-expanded', 'false');
    menuSession = undefined;
  }

  function showMenu(session, x, y) {
    closeMenu();
    onSelect?.();
    activate(session);
    setVisible(true);
    menuSession = session;
    session.tab.setAttribute('aria-expanded', 'true');
    const menu = $('#terminal-menu');
    menu.hidden = false;
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(x, innerWidth - rect.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, innerHeight - rect.height - 8))}px`;
    requestAnimationFrame(() => menu.querySelector('[role="menuitem"]')?.focus());
  }

  function beginRename(session) {
    if (!session?.tab || session.renameInput) return;
    const label = session.tab.querySelector('.terminal-tab-label');
    if (!label) return;
    const input = document.createElement('input');
    input.className = 'terminal-tab-rename';
    input.type = 'text';
    input.maxLength = 48;
    input.value = label.textContent;
    input.setAttribute('aria-label', 'Terminal tab name');
    label.replaceWith(input);
    session.renameInput = input;
    let finished = false;
    const finish = save => {
      if (finished) return;
      finished = true;
      if (save && input.value.trim()) { session.name = input.value.trim(); session.customName = true; }
      session.renameInput = null;
      if (sessions.includes(session)) {
        const restoredLabel = document.createElement('span');
        restoredLabel.className = 'terminal-tab-label';
        restoredLabel.textContent = session.name;
        input.replaceWith(restoredLabel);
        renderTabs();
        session.tab.focus();
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
    const launch=event.target.closest('[data-launch]')?.dataset.launch;if(!launch)return;
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
    const created=createSession(project, launch, !split);
    if(split && sessions.includes(split.target))attachPane(split.target,created,split.direction);
    setVisible(true);
  };
  $('#terminal-menu').onclick = event => {
    const action = event.target.closest('[data-terminal-action]')?.dataset.terminalAction;
    const session = menuSession;
    closeMenu();
    if(action==='split-right'||action==='split-down') {
      const direction=action==='split-right'?'right':'down';
      const previous=sessions.filter(item=>item!==session && item.project.id===session.project.id && item.group!==session.group).reduce((latest,item)=>!latest||item.lastUsed>latest.lastUsed?item:latest,null);
      if(previous && leaves(session.group.root).length===1) attachPane(previous,session,direction);
      else showLauncher(session,direction);
    }
    if (action === 'rename') beginRename(session);
    if (action === 'clear') session?.terminal.clear();
    if (action === 'restart') restartSession(session);
    if (action === 'close' && session) destroySession(session);
  };
  document.addEventListener('pointerdown', event => {
    if(!event.target.closest('#terminal-launcher,#terminal-new'))closeLauncher();
    if (!event.target.closest('#terminal-menu, #terminal-tabs')) closeMenu();
  });
  document.addEventListener('keydown', event => {
    if(event.key==='Escape'&&!launcher.hidden){closeLauncher();$('#terminal-new').focus();return;}
    if(!launcher.hidden && ['ArrowDown','ArrowUp','ArrowLeft','ArrowRight'].includes(event.key)){
      event.preventDefault();const buttons=[...choices.children];const direction=['ArrowUp','ArrowLeft'].includes(event.key)?-1:1;buttons[(buttons.indexOf(document.activeElement)+direction+buttons.length)%buttons.length].focus();
    }
    if (event.key === 'Escape' && !$('#terminal-menu').hidden) {
      const session = menuSession;
      closeMenu();
      session?.tab?.focus();
    }
  });
  function placeFilePane(options,targetId,direction='right'){
    let session=sessions.find(item=>item.id===options.id);
    const target=targetId===null?null:sessions.find(item=>item.id===targetId)||activeSession;
    if(!session){
      session={...options,external:true,state:'running',launch:'shell',lastUsed:++useOrder};
      session.group={root:{session}};sessions.push(session);
      session.paneZoom.onclick=()=>toggleMaximize(session);
      session.element.onpointerdown=()=>{if(activeSession!==session||!hasFocus){activeSession=session;hasFocus=true;session.lastUsed=++useOrder;session.onSelect?.();renderTabs();publish();}};
      session.paneHeader.draggable=true;
      session.paneHeader.ondragstart=event=>{if(event.target.closest('button,input')){event.preventDefault();return;}draggedSession=session;event.dataTransfer.setData('application/x-terminal-session',session.id);event.dataTransfer.effectAllowed='move';};
      session.paneHeader.ondragend=()=>{draggedSession=null;panel.querySelectorAll('[data-terminal-drop]').forEach(node=>delete node.dataset.terminalDrop);};
      session.element.ondragover=event=>{if(!draggedSession||draggedSession===session)return;event.preventDefault();const rect=session.element.getBoundingClientRect();session.element.dataset.terminalDrop=event.clientY>rect.bottom-Math.min(80,rect.height*.2)?'down':event.clientX>rect.right-Math.min(80,rect.width*.2)?'right':'swap';};
      session.element.ondragleave=event=>{if(!session.element.contains(event.relatedTarget))delete session.element.dataset.terminalDrop;};
      session.element.ondrop=event=>{if(!draggedSession||draggedSession===session)return;event.preventDefault();event.stopPropagation();const source=draggedSession,direction=session.element.dataset.terminalDrop||'swap';draggedSession=null;delete session.element.dataset.terminalDrop;if(direction==='swap')swapPanePositions(session,source);else attachPane(session,source,direction);};
    }
    if(target&&target!==session){if(direction==='swap')swapPanePositions(target,session);else attachPane(target,session,direction==='bottom'?'down':direction);}else activate(session);
    setVisible(true);return session;
  }
  function resumeSession(record,project){
    validateResume(record);if(!project)throw new Error('Select a workspace before resuming.');
    const existing=sessions.find(session=>session.resume?.id===record.id&&session.state!=='closed'&&session.state!=='error');
    lastProject=project;closeLauncher();closeMenu();if(existing)activate(existing);else createSession(project,record.agent,true,record);setVisible(true);
  }
  return {element: panel, toggle, showMostRecent, inputMostRecent, resumeSession, placeFilePane, get focusedProjectId(){return activeSession?.project?.id;}, removeFilePane(id){const pane=sessions.find(item=>item.external&&item.id===id);if(pane)destroySession(pane);}, hasFilePane(id){return sessions.some(item=>item.external&&item.id===id);}, get activePaneId(){return activeSession?.id;}, refreshPaneControls:renderTabs, setFocused(next){hasFocus=next;renderTabs();publish();}, setProject(project){lastProject=project;}, newSession(project){if(project)lastProject=project;$('#terminal-new').click();}, select(id) { const session=sessions.find(item=>item.id===id); if(session){activate(session);setVisible(true);} }, close: () => { for (const session of [...sessions]) destroySession(session); setVisible(false); }, get visible() { return visible; }};
}
