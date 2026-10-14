import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter, once} from 'node:events';
import {WebSocket} from 'ws';
import http from 'node:http';
import {attachTerminalPty} from '../server/terminal-pty.js';

const nextMessage = socket => new Promise((resolve, reject) => {
  socket.once('message', raw => resolve(JSON.parse(raw.toString())));
  socket.once('error', reject);
});

test('terminal websocket authenticates, streams IO, resizes and closes its PTY', async t => {
  const saved = {NO_COLOR: process.env.NO_COLOR, TERM_PROGRAM: process.env.TERM_PROGRAM};
  process.env.NO_COLOR = '1';
  process.env.TERM_PROGRAM = 'herdr';
  t.after(() => { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  const token = 'a'.repeat(64);
  const project = {id: 'project-one', name: 'Workspace', root: 'C:\\workspace'};
  let spawned, spawnedChild, received = [], resized, killed = false;
  const ptyApi = {spawn(shell, args, options) {
    spawned = {shell, args, options};
    const child = new EventEmitter();
    child.onData = callback => child.on('data', callback);
    child.onExit = callback => child.on('exit', callback);
    child.write = data => received.push(data);
    child.resize = (cols, rows) => { resized = {cols, rows}; };
    child.kill = () => { killed = true; child.emit('exit', {exitCode: 0, signal: 0}); };
    spawnedChild = child;
    return child;
  }};
  const server = http.createServer();
  const closeTerminal = attachTerminalPty(server, {token, getProject: id => id === project.id ? project : null, ptyApi});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await closeTerminal();
    await new Promise(resolve => server.close(resolve));
  });

  const url = `ws://127.0.0.1:${server.address().port}/api/terminal`;
  const denied = new WebSocket(url, ['ai-web-terminal', 'token.invalid']);
  await assert.rejects(once(denied, 'open'));
  if (denied.readyState !== WebSocket.CLOSED) await once(denied, 'close');

  const client = new WebSocket(url, ['ai-web-terminal', `token.${token}`]);
  await once(client, 'open');
  const readyMessage = nextMessage(client);
  client.send(JSON.stringify({type: 'start', project: project.id, cols: 90, rows: 30}));
  assert.deepEqual(await readyMessage, {type: 'ready', shell: process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash', project: project.name});
  assert.equal(spawned.options.cwd, project.root);
  assert.equal(spawned.options.env.NO_COLOR, undefined);
  assert.equal(spawned.options.env.TERM_PROGRAM, undefined);
  assert.equal(spawned.options.env.TERM, 'xterm-256color');
  assert.equal(spawned.options.env.COLORTERM, 'truecolor');
  if (process.platform === 'win32') assert.equal(spawned.options.useConptyDll, true);
  assert.deepEqual([spawned.options.cols, spawned.options.rows], [90, 30]);

  const dataMessage = nextMessage(client);
  const coloredOutput = '\x1b[32mgreen\x1b[48;2;80;80;80m input \x1b[0m';
  spawnedChild.emit('data', coloredOutput);
  assert.deepEqual(await dataMessage, {type: 'data', data: coloredOutput});
  client.send(JSON.stringify({type: 'input', data: 'input bytes'}));
  client.send(JSON.stringify({type: 'resize', cols: 120, rows: 40}));
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline && (!received.length || !resized)) await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual(received, ['input bytes']);
  assert.deepEqual(resized, {cols: 120, rows: 40});

  const closed = once(client, 'close');
  await closeTerminal();
  await closed;
  assert.equal(killed, true);
});
