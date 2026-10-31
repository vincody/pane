import test from 'node:test';
import assert from 'node:assert/strict';
import {appendMissingPath, createCurrentPath, expandEnvironment, parseRegistryPath} from '../../server/src/features/terminal/windows-path.ts';

test('%NAME% references expand case-insensitively and unknown names stay as written', () => {
  const env = {SystemRoot: 'C:\\Windows', USERPROFILE: 'C:\\Users\\Me'};
  assert.equal(expandEnvironment('%SYSTEMROOT%\\system32;%userprofile%\\bin', env), 'C:\\Windows\\system32;C:\\Users\\Me\\bin');
  assert.equal(expandEnvironment('%UNKNOWN%\\x', env), '%UNKNOWN%\\x');
});

test('the Path value is read from reg query output, expandable or not', () => {
  assert.equal(parseRegistryPath('\r\nHKEY_CURRENT_USER\\Environment\r\n    Path    REG_EXPAND_SZ    C:\\a;%USERPROFILE%\\b\r\n\r\n'), 'C:\\a;%USERPROFILE%\\b');
  assert.equal(parseRegistryPath('HKEY_LOCAL_MACHINE\\x\r\n    Path    REG_SZ    C:\\only\r\n'), 'C:\\only');
  assert.equal(parseRegistryPath('ERROR: The system was unable to find the specified registry key or value.'), undefined);
});

test('missing entries are appended without reordering or duplicating what Pane already had', () => {
  assert.equal(
    appendMissingPath('C:\\first;C:\\Second\\', ['c:\\second', 'C:\\Users\\Me\\.cargo\\bin', 'C:\\FIRST\\', 'C:\\Users\\Me\\.cargo\\bin']),
    'C:\\first;C:\\Second\\;C:\\Users\\Me\\.cargo\\bin',
  );
  assert.equal(appendMissingPath('', ['C:\\a']), 'C:\\a');
});

test('a terminal on Windows gets the current Path under the existing variable name, and the registry is read once per few seconds', () => {
  let reads = 0, time = 0;
  const currentPath = createCurrentPath({platform: 'win32', read: () => { reads++; return ['C:\\new\\bin']; }, now: () => time});
  const env = {Path: 'C:\\old', TERM: 'x'};
  const first = currentPath(env);
  assert.equal(first.Path, 'C:\\old;C:\\new\\bin');
  assert.equal(first.TERM, 'x');
  assert.equal(env.Path, 'C:\\old', 'the input is not modified');
  time = 2000; currentPath(env); assert.equal(reads, 1);
  time = 3500; currentPath(env); assert.equal(reads, 2);
});

test('other platforms keep their environment untouched', () => {
  const env = {PATH: '/usr/bin'};
  assert.equal(createCurrentPath({platform: 'linux', read: () => { throw new Error('must not read'); }})(env), env);
});

test('the real registry read keeps everything Pane started with and never throws', {skip: process.platform !== 'win32'}, () => {
  const result = createCurrentPath()({...process.env});
  const key = Object.keys(result).find(item => item.toLowerCase() === 'path')!;
  const original = process.env[Object.keys(process.env).find(item => item.toLowerCase() === 'path')!]!;
  assert.ok(result[key]!.startsWith(original.split(';').filter(Boolean).join(';')));
});
