import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { Files } from '../server/files.js';
import { createApp } from '../server/app.js';

async function fixture(t) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-web-test-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'project'); await fs.mkdir(root);
  await fs.writeFile(path.join(root, 'main.js'), 'export const value = 1;\r\n');
  const files = new Files(); const project = await files.addProject(root);
  return { temp, root, files, id: project.id };
}

test('UTF-8 save preserves line endings and rejects stale disk versions', async t => {
  const { root, files, id } = await fixture(t);
  const original = await files.read(id, 'main.js');
  const result = await files.save(id, 'main.js', 'export const value = 2;\r\n', original.version);
  assert.notEqual(result.version, original.version);
  assert.equal(await fs.readFile(path.join(root, 'main.js'), 'utf8'), 'export const value = 2;\r\n');
  await fs.writeFile(path.join(root, 'main.js'), '// an agent changed this\n');
  await assert.rejects(files.save(id, 'main.js', 'overwrite', result.version), error => error.status === 409);
  assert.equal(await fs.readFile(path.join(root, 'main.js'), 'utf8'), '// an agent changed this\n');
});

test('concurrent saves with the same version cannot overwrite one another', async t => {
  const { files, id } = await fixture(t);
  const original = await files.read(id, 'main.js');
  const saves = await Promise.allSettled([files.save(id, 'main.js', 'first', original.version), files.save(id, 'main.js', 'second', original.version)]);
  assert.equal(saves.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(saves.find(result => result.status === 'rejected').reason.status, 409);
});

test('selected project contains browsing and writes, including linked paths', async t => {
  const { temp, root, files, id } = await fixture(t);
  await fs.writeFile(path.join(temp, 'outside.txt'), 'private');
  await assert.rejects(files.read(id, '../outside.txt'), error => error.status === 403);
  await assert.rejects(files.read(id, path.join(temp, 'outside.txt')), error => error.status === 400);
  const outside = path.join(temp, 'outside'); await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'secret.txt'), 'private');
  await fs.symlink(outside, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(files.read(id, 'linked/secret.txt'), error => error.status === 403);
});

test('binary, oversized and non-UTF-8 files are not editable; UTF-8 BOM is retained', async t => {
  const { root, files, id } = await fixture(t);
  await fs.writeFile(path.join(root, 'binary.bin'), Buffer.from([1, 0, 2]));
  await assert.rejects(files.read(id, 'binary.bin'), error => error.status === 415);
  await fs.writeFile(path.join(root, 'large.txt'), Buffer.alloc(2 * 1024 * 1024 + 1, 65));
  await assert.rejects(files.read(id, 'large.txt'), error => error.status === 413);
  await fs.writeFile(path.join(root, 'legacy.txt'), Buffer.from([0xff, 0xfe, 0x61]));
  await assert.rejects(files.read(id, 'legacy.txt'), error => error.status === 415);
  await fs.writeFile(path.join(root, 'bom.txt'), '\ufeffTiếng Việt\r\n');
  const file = await files.read(id, 'bom.txt'); assert.equal(file.bom, true);
  await files.save(id, 'bom.txt', file.content + 'ok', file.version, file.bom);
  assert.equal(await fs.readFile(path.join(root, 'bom.txt'), 'utf8'), '\ufeffTiếng Việt\r\nok');
});

test('HTTP API requires a local Host and token, then opens, reads and saves files', async t => {
  const { temp, root } = await fixture(t);
  const { server, token } = await createApp({ initialRoot: root, stateDir: path.join(temp, 'state') });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base + '/api/projects')).status, 403);
  const headers = { 'X-AI-Web-Token': token };
  assert.equal((await fetch(base + '/api/projects', { headers: { ...headers, Origin: 'https://example.com' } })).status, 403);
  const badHost = await new Promise((resolve, reject) => {
    const request = http.get(base + '/api/projects', { headers: { ...headers, Host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); });
    request.on('error', reject);
  });
  assert.equal(badHost, 403);
  const { projects } = await (await fetch(base + '/api/projects', { headers })).json();
  const url = `${base}/api/file?project=${projects[0].id}&path=main.js`;
  const file = await (await fetch(url, { headers })).json();
  const response = await fetch(url, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'saved from web', version: file.version }) });
  assert.equal(response.status, 200);
  assert.equal(await fs.readFile(path.join(root, 'main.js'), 'utf8'), 'saved from web');
});


test('renaming/removing a workspace changes only the web registry and survives restart', async t => {
  const { temp, root } = await fixture(t);
  const stateDir = path.join(temp, 'registry');
  const create = () => createApp({ initialRoot: root, stateDir });
  let app = await create();
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  let base = `http://127.0.0.1:${app.server.address().port}`;
  let headers = { 'X-AI-Web-Token': app.token, 'Content-Type': 'application/json' };
  const listing = await (await fetch(base + '/api/projects', { headers })).json();
  const id = listing.projects[0].id;
  const renamed = await fetch(base + `/api/projects?project=${id}`, { method: 'PATCH', headers, body: JSON.stringify({ name: 'My workspace' }) });
  assert.equal(renamed.status, 200);
  assert.equal((await renamed.json()).name, 'My workspace');
  assert.equal(await fs.readFile(path.join(root, 'main.js'), 'utf8'), 'export const value = 1;\r\n');
  await new Promise(resolve => app.server.close(resolve));
  app = await create();
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${app.server.address().port}`; headers = { 'X-AI-Web-Token': app.token };
  assert.equal((await (await fetch(base + '/api/projects', { headers })).json()).projects[0].name, 'My workspace');
  assert.equal((await fetch(base + `/api/projects?project=${id}`, { method: 'DELETE', headers })).status, 200);
  assert.equal((await (await fetch(base + '/api/projects', { headers })).json()).projects.length, 0);
  assert.equal((await fs.stat(root)).isDirectory(), true);
  assert.equal(await fs.readFile(path.join(root, 'main.js'), 'utf8'), 'export const value = 1;\r\n');
  await new Promise(resolve => app.server.close(resolve));
  app = await create();
  assert.equal(app.files.projects.size, 0, 'removed default workspace resurrected');
});
