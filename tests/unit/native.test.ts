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

test('the addon reads token usage from a log exactly as the TypeScript reference does', {skip: addon?.parseTokenLog ? false : 'the native addon is not built (npm run native:build)'}, async t => {
  const {parseTokenLogInJs} = await import('../../server/src/features/usage/token-usage.ts');
  const fs = await import('node:fs/promises'), os = await import('node:os'), path = await import('node:path');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pane-token-'));
  t.after(() => fs.rm(directory, {recursive: true, force: true}));
  const codex = [
    {type: 'session_meta', payload: {id: 'sess-1'}},
    {timestamp: '2026-10-31T10:00:00.000Z', type: 'event_msg', payload: {type: 'token_count', info: {total_token_usage: {input_tokens: 10, output_tokens: 2, cached_input_tokens: 4, total_tokens: 12}}}},
    {timestamp: '2026-10-31T10:05:00.500Z', type: 'event_msg', payload: {type: 'token_count', info: {total_token_usage: {input_tokens: 25, output_tokens: 5, cached_input_tokens: 4, total_tokens: 30}}}},
    {timestamp: '2026-10-31T10:06:00.000Z', type: 'event_msg', payload: {type: 'token_count', info: {total_token_usage: {input_tokens: 25, output_tokens: 5, cached_input_tokens: 4, total_tokens: 30}}}},
    {timestamp: 'garbage', type: 'event_msg', payload: {type: 'token_count', info: {total_token_usage: {input_tokens: 99, total_tokens: 99}}}},
  ].map(row => JSON.stringify(row)).join('\n') + '\nthis token_count line is not json\n';
  const claude = [
    {type: 'assistant', sessionId: 's2', timestamp: '2026-10-31T11:00:00.000Z', message: {id: 'm1', usage: {input_tokens: 3, cache_read_input_tokens: 100, cache_creation_input_tokens: 7, output_tokens: 1}}},
    {type: 'assistant', sessionId: 's2', timestamp: '2026-10-31T11:00:09.000Z', message: {id: 'm1', usage: {input_tokens: 3, cache_read_input_tokens: 100, cache_creation_input_tokens: 7, output_tokens: 9}}},
    {type: 'assistant', sessionId: 's2', timestamp: '2026-10-31T11:01:00.000Z', message: {id: 'm2', usage: {input_tokens: 1, output_tokens: 4}}},
    {type: 'user', message: {usage: {input_tokens: 5}}},
  ].map(row => JSON.stringify(row)).join('\r\n') + '\r\n';
  for (const [name, provider, body] of [['codex.jsonl', 'codex', codex], ['claude.jsonl', 'claude', claude]] as const) {
    const file = path.join(directory, name);
    await fs.writeFile(file, body);
    const reference = await parseTokenLogInJs(file, provider);
    const native = JSON.parse(await addon!.parseTokenLog!(file, provider));
    assert.deepEqual(native, reference, `${provider} log`);
    assert.ok(reference.entries.length > 0);
  }
});
