import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'node:crypto';
import path from 'node:path';
import {existsSync,statSync,accessSync,constants} from 'node:fs';
import {sshArguments,validateSshConnection} from '../../../../shared/ssh-connection.ts';
import * as pty from 'node-pty';
import type { Server } from 'node:http';
import type { Workspace, TerminalServerMessage } from '../../../../shared/contracts.ts';
import {agentInProcessTree, readProcesses} from './terminal-agents.ts';
import {protectSshKey} from './ssh-key-permissions.ts';
import {parseStartupLaunch,powerShellStartupArgs} from './terminal-startup.ts';
import {createCurrentPath} from './windows-path.ts';

const maxCols = 300;
const maxRows = 150;
const validSize = (cols: unknown, rows: unknown) => typeof cols === 'number' && typeof rows === 'number' && Number.isInteger(cols) && cols >= 2 && cols <= maxCols && Number.isInteger(rows) && rows >= 2 && rows <= maxRows;
export interface TerminalPtyOptions { token: string; getProject: (id: string) => Workspace | undefined; ptyApi?: Pick<typeof pty, 'spawn'>;protectKey?:(key:string)=>void;onStart?:(pid:number,project:Workspace)=>void;onStop?:(pid:number)=>void;onOutput?:(pid:number,data:string)=>void }
interface TerminalSession {id:string;pty:pty.IPty;client:WebSocket|null;send:(message:TerminalServerMessage)=>void;agent:string|null;exited?:boolean;detachable:boolean;project:Workspace;shell:string;output:string[];outputSize:number;ssh:boolean}

export function attachTerminalPty(server: Server, { token, getProject, ptyApi = pty,protectKey=protectSshKey,onStart,onStop,onOutput }: TerminalPtyOptions){
  const currentPath = createCurrentPath();
  const websocketServer = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024, perMessageDeflate: false });
  const sessions=new Map<string,TerminalSession>();
  const sendTo=(client:WebSocket|null,message:TerminalServerMessage)=>{if(client?.readyState===WebSocket.OPEN)client.send(JSON.stringify(message));};
  function stop(id:string){const session=sessions.get(id);if(!session)return false;sessions.delete(id);session.exited=true;onStop?.(session.pty.pid);try{session.pty.kill();}catch{}session.client?.close(1000,'Terminal closed');return true;}

  let closing: Promise<void> | undefined;
  let inspecting = false;
  const monitor = setInterval(async () => {
    if (inspecting || !sessions.size) return;
    inspecting = true;
    try {
      const rows = await readProcesses();
      for (const session of sessions.values()) {
        if (session.exited||session.ssh) continue;
        const agent = agentInProcessTree(rows, session.pty.pid);
        if (agent !== session.agent) { session.agent = agent; session.send({type:'agent', agent}); }
      }
    } catch { /* Keep the last known identity during a transient process query failure. */ }
    finally { inspecting = false; }
  }, 1500);
  monitor.unref();

  server.on('upgrade', (request, socket, head) => {
    const host = request.headers.host || '';
    let url;
    try { url = new URL(request.url || '', `http://${host}`); } catch { socket.destroy(); return; }
    const origin = request.headers.origin;
    const protocols = (request.headers['sec-websocket-protocol'] || '').split(',').map(value => value.trim());
    const deniedBy = url.pathname !== '/api/terminal' ? 'path'
      : !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host) ? 'host'
      : origin && origin !== `http://${host}` ? 'origin'
      : !protocols.includes(`token.${token}`) ? 'token' : null;
    if (deniedBy) {
      console.warn(`Terminal WebSocket rejected: ${deniedBy} (host=${host}, origin=${origin || 'none'}, protocols=${protocols.map(value => value.startsWith('token.') ? 'token.[redacted]' : value).join(',')})`);
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    websocketServer.handleUpgrade(request, socket, head, client => {
      websocketServer.emit('connection', client, request);
    });
  });

  websocketServer.on('connection',client=>{
    let session:TerminalSession|null=null;
    const send=(message:TerminalServerMessage)=>sendTo(client,message);
    client.on('message',raw=>{
      let parsed:unknown;try{parsed=JSON.parse(raw.toString());}catch{client.close(1007,'Invalid terminal message');return;}
      if(!parsed||typeof parsed!=='object'){client.close(1007,'Invalid terminal message');return;}
      const message=parsed as Record<string,unknown>;
      if(message.type==='attach'){
        if(session||typeof message.sessionId!=='string'||!validSize(message.cols,message.rows)){client.close(1008,'Invalid terminal attach');return;}
        const existing=sessions.get(message.sessionId);
        if(!existing||existing.exited||!existing.detachable||!getProject(existing.project.id)){send({type:'error',code:'SESSION_NOT_FOUND',message:'This terminal is no longer running. Open a new session to reconnect.'});client.close(1000,'Session no longer running');return;}
        session=existing;const previous=existing.client;existing.client=client;if(previous&&previous!==client)previous.close(4001,'Session attached in another tab');
        send({type:'ready',shell:existing.shell,project:existing.project.name,sessionId:existing.id,attached:true});
        send({type:'data',data:existing.output.join(''),replay:true});
        send({type:'agent',agent:existing.agent});
        try{existing.pty.resize(message.cols as number,message.rows as number);}catch{}
        return;
      }
      if(message.type==='start'){
        if(session||typeof message.project!=='string'||!validSize(message.cols,message.rows)){client.close(1008,'Invalid terminal start');return;}
        if(message.sessionId!==undefined&&(typeof message.sessionId!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(message.sessionId)||sessions.has(message.sessionId))){send({type:'error',code:'SESSION_START_FAILED',message:'Invalid or duplicate terminal session ID.'});client.close(1008,'Invalid terminal ID');return;}
        const project=getProject(message.project);if(!project){send({type:'error',message:'Select a registered project before opening a terminal.'});client.close(1008,'Unknown project');return;}
        if(sessions.size>=64){send({type:'error',message:'Close an existing terminal before opening another session.'});client.close(1008,'Terminal limit');return;}
        let shell=process.platform==='win32'?'powershell.exe':process.env.SHELL||'/bin/bash';let args=process.platform==='win32'?['-NoLogo']:['-l'];
        try{if(message.ssh!==undefined){const connection=validateSshConnection(message.ssh);args=sshArguments(connection);if(connection.identityFile){const key=connection.identityFile;if(!path.isAbsolute(key))throw new Error('Use an absolute SSH key file path.');try{if(!statSync(key).isFile())throw new Error();accessSync(key,constants.R_OK);}catch{throw new Error('SSH key file is missing or unreadable. Choose the key file again.');}protectKey(key);}const windowsSsh=path.join(process.env.SystemRoot||'C:\Windows','System32','OpenSSH','ssh.exe');shell=process.platform==='win32'&&existsSync(windowsSsh)?windowsSsh:'ssh';}}
        catch(error){send({type:'error',message:error instanceof Error?error.message:'Invalid SSH connection.'});client.close(1008,'Invalid SSH connection');return;}
        // On Windows PowerShell the agent starts from the shell's own arguments, so its command line is never typed into the terminal.
        let startupDelivered=false;
        if(message.launch!==undefined){
          const launch=parseStartupLaunch(message.launch);
          if(!launch||message.ssh!==undefined){send({type:'error',code:'SESSION_START_FAILED',message:'Invalid session launch.'});client.close(1008,'Invalid session launch');return;}
          if(process.platform==='win32'){args=powerShellStartupArgs(launch);startupDelivered=true;}
        }
        const env:NodeJS.ProcessEnv=currentPath({...process.env,TERM:'xterm-256color',COLORTERM:'truecolor'});
        for(const key of Object.keys(env))if(['NO_COLOR','FORCE_COLOR','CLICOLOR','CLICOLOR_FORCE','TERM_PROGRAM','TERM_PROGRAM_VERSION'].includes(key.toUpperCase()))delete env[key];
        try{
          const child=ptyApi.spawn(shell,args,{name:'xterm-256color',cols:message.cols as number,rows:message.rows as number,cwd:project.root,env,...(process.platform==='win32'?{useConptyDll:true}:{})});
          const owned:TerminalSession={id:typeof message.sessionId==='string'?message.sessionId:crypto.randomUUID(),pty:child,client,agent:null,detachable:message.detachable===true,project,shell,output:[],outputSize:0,ssh:message.ssh!==undefined,send:message=>sendTo(owned.client,message)};
          session=owned;sessions.set(owned.id,owned);onStart?.(child.pid,project);
          child.onData(data=>{onOutput?.(child.pid,data);if(owned.detachable){owned.output.push(data);owned.outputSize+=Buffer.byteLength(data);while(owned.outputSize>524288&&owned.output.length>1)owned.outputSize-=Buffer.byteLength(owned.output.shift()!);if(owned.outputSize>524288){const bytes=Buffer.from(owned.output[0]);let start=bytes.length-524288;while(start<bytes.length&&(bytes[start]&0xc0)===0x80)start++;owned.output=[bytes.subarray(start).toString('utf8')];owned.outputSize=bytes.length-start;}}owned.send({type:'data',data});});
          child.onExit(({exitCode,signal})=>{if(owned.exited)return;owned.exited=true;sessions.delete(owned.id);onStop?.(child.pid);owned.send({type:'exit',exitCode,signal});});
          send({type:'ready',shell,project:project.name,...(owned.detachable?{sessionId:owned.id}:{}),...(startupDelivered?{startupDelivered:true}:{})});
        }catch(error){send({type:'error',code:'SESSION_START_FAILED',message:error instanceof Error&&error.message?error.message:'Could not start the terminal.'});client.close(1011,'Terminal could not start');}
        return;
      }
      if(!session||session.exited||session.client!==client){client.close(1008,'Start or attach a terminal first');return;}
      if(message.type==='close'){stop(session.id);session=null;return;}
      if(message.type==='input'&&typeof message.data==='string'&&message.data.length<=65536){try{session.pty.write(message.data);}catch{client.close(1011,'Terminal input failed');}}
      else if(message.type==='resize'&&validSize(message.cols,message.rows)){try{session.pty.resize(message.cols as number,message.rows as number);}catch{}}
      else client.close(1008,'Invalid terminal message');
    });
    const detach=()=>{if(session?.client!==client)return;if(session.detachable)session.client=null;else stop(session.id);session=null;};
    client.on('close',detach);client.on('error',detach);
  });

  const close=()=>closing ||= new Promise<void>(resolve=>{
    clearInterval(monitor);
    for (const client of websocketServer.clients) client.terminate();
    for (const session of [...sessions.values()]) stop(session.id);
    sessions.clear();
    websocketServer.close(() => resolve());
  });
  const list=()=>[...sessions.values()].filter(session=>!session.exited).map(session=>({id:session.id,project:session.project.id,pid:session.pty.pid,agent:session.agent,ssh:session.ssh}));
  return Object.assign(close,{stop,list});
}
