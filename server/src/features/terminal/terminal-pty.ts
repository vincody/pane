import { WebSocketServer, WebSocket } from 'ws';
import * as pty from 'node-pty';
import type { Server } from 'node:http';
import type { Workspace, TerminalServerMessage } from '../../../../shared/contracts.ts';
import {agentInProcessTree, readProcesses} from './terminal-agents.ts';

const maxCols = 300;
const maxRows = 150;
const validSize = (cols: unknown, rows: unknown) => typeof cols === 'number' && typeof rows === 'number' && Number.isInteger(cols) && cols >= 2 && cols <= maxCols && Number.isInteger(rows) && rows >= 2 && rows <= maxRows;
export interface TerminalPtyOptions { token: string; getProject: (id: string) => Workspace | undefined; ptyApi?: Pick<typeof pty, 'spawn'>;onStart?:(pid:number,project:Workspace)=>void;onStop?:(pid:number)=>void;onOutput?:(pid:number,data:string)=>void }
interface TerminalSession { pty: pty.IPty; send: (message: TerminalServerMessage) => void; agent: string | null; exited?: boolean }

export function attachTerminalPty(server: Server, { token, getProject, ptyApi = pty,onStart,onStop,onOutput }: TerminalPtyOptions): () => Promise<void> {
  const websocketServer = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024, perMessageDeflate: false });
  const sessions = new Set<TerminalSession>();
  let closing: Promise<void> | undefined;
  let inspecting = false;
  const monitor = setInterval(async () => {
    if (inspecting || !sessions.size) return;
    inspecting = true;
    try {
      const rows = await readProcesses();
      for (const session of sessions) {
        if (session.exited) continue;
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

  websocketServer.on('connection', client => {
    let session: TerminalSession | null = null;
    const send = (value: TerminalServerMessage) => {
      if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(value));
    };
    const stop = () => {
      if (!session) return;
      sessions.delete(session);
      onStop?.(session.pty.pid);
      try { session.pty.kill(); } catch {}
      session = null;
    };
    client.on('message', raw => {
      let parsed: unknown;
      try { parsed = JSON.parse(raw.toString()); } catch { client.close(1007, 'Invalid terminal message'); return; }
      if (!parsed || typeof parsed !== 'object') { client.close(1007, 'Invalid terminal message'); return; }
      const message = parsed as Record<string, unknown>;

      if (message.type === 'start') {
        if (session || typeof message.project !== 'string' || typeof message.cols !== 'number' || typeof message.rows !== 'number' || !validSize(message.cols, message.rows)) { client.close(1008, 'Invalid terminal start'); return; }
        const project = getProject(message.project);
        if (!project) { send({ type: 'error', message: 'Select a registered project before opening a terminal.' }); client.close(1008, 'Unknown project'); return; }
        const shell = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash';
        const args = process.platform === 'win32' ? ['-NoLogo'] : ['-l'];
        // The server may run under an agent with color disabled. Those
        // settings describe its output, not the interactive xterm client.
        const env: NodeJS.ProcessEnv = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' };
        for (const key of Object.keys(env)) {
          if (['NO_COLOR', 'FORCE_COLOR', 'CLICOLOR', 'CLICOLOR_FORCE', 'TERM_PROGRAM', 'TERM_PROGRAM_VERSION'].includes(key.toUpperCase())) delete env[key];
        }
        try {
          const child = ptyApi.spawn(shell, args, {
            name: 'xterm-256color', cols: message.cols, rows: message.rows,
            cwd: project.root, env,
            // The system ConPTY consumes OSC 10/11 color queries. The bundled
            // implementation forwards them to xterm so CLI input surfaces can
            // use the terminal's actual foreground and background colors.
            ...(process.platform === 'win32' ? { useConptyDll: true } : {}),
          });
          session = { pty: child, send, agent: null };
          sessions.add(session);
          onStart?.(child.pid,project);
          child.onData(data => {onOutput?.(child.pid,data);send({ type: 'data', data });});
          child.onExit(({ exitCode, signal }) => {
            if (session?.pty !== child) return;
            session.exited = true;
            onStop?.(child.pid);
            send({ type: 'exit', exitCode, signal });
          });
          send({ type: 'ready', shell, project: project.name });
        } catch (error) {
          send({ type: 'error', message: error instanceof Error && error.message ? error.message : 'Could not start the terminal.' });
          client.close(1011, 'Terminal could not start');
        }
        return;
      }

      if (!session || session.exited) { client.close(1008, 'Start a terminal first'); return; }
      if (message.type === 'input' && typeof message.data === 'string' && message.data.length <= 65536) {
        try { session.pty.write(message.data); } catch { client.close(1011, 'Terminal input failed'); }
      } else if (message.type === 'resize' && typeof message.cols === 'number' && typeof message.rows === 'number' && validSize(message.cols, message.rows)) {
        try { session.pty.resize(message.cols, message.rows); } catch { /* Terminal exited during resize. */ }
      } else {
        client.close(1008, 'Invalid terminal message');
      }
    });
    client.on('close', stop);
    client.on('error', stop);
  });

  return () => closing ||= new Promise(resolve => {
    clearInterval(monitor);
    for (const client of websocketServer.clients) client.terminate();
    for (const session of sessions) { try { session.pty.kill(); } catch {} }
    sessions.clear();
    websocketServer.close(() => resolve());
  });
}
