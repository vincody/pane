import type {Terminal} from '@xterm/xterm';
import type {Workspace,SessionRecord,TerminalServerMessage} from '../../../../shared/contracts.ts';
import type {PaneSession} from './terminal-types.ts';
import {resumeCommand} from '../history/history-session.ts';
interface ConnectionOptions {
 session:PaneSession; token:string; project:Workspace; id:string; terminal:Terminal; launch:string; resume:SessionRecord|null; onOutput?:(data:string)=>void;
 getActive:()=>PaneSession|null|undefined;
 $:(selector:string)=>HTMLElement;
 fitSession:(session:PaneSession)=>void;
 journal:()=>unknown; renderTabs:()=>void; publish:()=>void;
 scheduleActivity:(session:PaneSession)=>void; inspectScreen:(session:PaneSession)=>void;
}
export function createTerminalConnection({session,token,project,id,terminal,launch,resume,onOutput,getActive,$,fitSession,journal,renderTabs,publish,scheduleActivity,inspectScreen}:ConnectionOptions){
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
        journal();if(session===getActive())$('#terminal-error').hidden=true;
        session.shell = message.shell.includes('powershell') ? 'PowerShell' : message.shell;
        if (session === getActive()) $('#terminal-state').textContent = 'Running';
        renderTabs();
        fitSession(session);
        publish();
        if (session === getActive()) terminal.focus();
        if (!message.attached && launch !== 'shell' && launch!=='ssh') session.socket!.send(JSON.stringify({type:'input',data:resume?resumeCommand(resume,message.shell):`${launch}\r`}));
      } else if (message.type === 'data') {
        const finished=()=>{if(message.replay){session.replaying=false;session.state='running';session.element.dataset.connection='running';renderTabs();}scheduleActivity(session);};
        if(message.replay)session.replaying=true;
        if(!message.data)finished();else{if(!message.replay)onOutput?.(message.data);terminal.write(message.data,finished);}
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
        if (session === getActive()) {
          $('#terminal-state').textContent = 'Error';
          $('#terminal-error').textContent = message.message;
          $('#terminal-error').hidden = false;
        }
        renderTabs();
      } else if (message.type === 'exit') {
        session.ready = false;session.state='closed';session.serverId=undefined;
        session.agent = null;
        publish();
        if (session === getActive()) $('#terminal-state').textContent = `Exited (${message.exitCode ?? 'unknown'})`;
        renderTabs();
      }
    });
    session.socket.addEventListener('error', () => {
      session.state = 'error';
        publish();
      if (session === getActive()) {
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
      if(session===getActive()){$('#terminal-state').textContent=session.state;$('#terminal-error').textContent=event.code===4001?'This session is open in another browser tab.':session.state==='reconnecting'?'Reconnecting to the running terminal…':'Connection lost. Reload to reconnect.';$('#terminal-error').hidden=session.state==='closed';}
      renderTabs();publish();
    });
    }
return connectSocket;
}
