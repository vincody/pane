import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {native} from '../../server/src/lib/native.ts';
import {readProcesses} from '../../server/src/features/terminal/terminal-agents.ts';
import {collectDevServerPorts} from '../../server/src/features/dev-servers/dev-server-scan.ts';

// The addon is an optimisation: without a Rust toolchain it is not built and the PowerShell and netstat paths stay in use.
const addon = native();
const options = {skip: addon ? false : 'the native addon is not built (npm run native:build)'};

test('the addon lists this process with its parent, name, command line, start time, memory and CPU time', options, () => {
  const rows = JSON.parse(addon!.listProcesses()) as Record<string, unknown>[];
  const own = rows.find(row => row.ProcessId === process.pid);
  assert.ok(own, 'this process is listed');
  assert.equal(own.ParentProcessId, process.ppid);
  assert.match(String(own.Name), /^node(\.exe)?$/i);
  assert.match(String(own.CommandLine), /node/i);
  assert.match(String(own.CreationDate), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{7}Z$/);
  const memory = Number(own.WorkingSetSize), rss = process.memoryUsage().rss;
  assert.ok(memory > rss / 2 && memory < rss * 2, `working set ${memory} is near rss ${rss}`);
  assert.ok(Number(own.KernelModeTime) + Number(own.UserModeTime) > 0);
});

test('the addon reports a listening socket with its owning process, on IPv4 and IPv6', options, async t => {
  const v4 = net.createServer().listen(0, '127.0.0.1'), v6 = net.createServer().listen(0, '::1').on('error', () => {});
  t.after(() => { v4.close(); v6.close(); });
  await new Promise(resolve => v4.once('listening', resolve));
  const port = (v4.address() as net.AddressInfo).port;
  const rows = JSON.parse(addon!.listTcpListeners()) as {pid: number; host: string; port: number}[];
  assert.ok(rows.some(row => row.pid === process.pid && row.host === '127.0.0.1' && row.port === port));
  if (v6.listening) {
    const v6port = (v6.address() as net.AddressInfo).port;
    assert.ok(rows.some(row => row.pid === process.pid && row.host === '::1' && row.port === v6port));
  }
});

test('the backend reads processes and listening ports through the same calls its callers always used', options, async t => {
  const server = net.createServer().listen(0, '127.0.0.1');
  t.after(() => server.close());
  await new Promise(resolve => server.once('listening', resolve));
  const port = (server.address() as net.AddressInfo).port;
  const processes = await readProcesses();
  assert.ok(processes.some(row => Number(row.ProcessId) === process.pid && String(row.CommandLine).length > 0));
  const scan = await collectDevServerPorts();
  assert.equal(scan.complete, true);
  const found = scan.listeners.find(listener => listener.port === port);
  assert.equal(found?.pid, process.pid);
  assert.match(String(found?.processName), /^node(\.exe)?$/i);
});
