import { workspaceTree } from '../client/workspaces.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { projectForAgent, groupAgents } from '../client/workspaces.js';
import { gitBranch } from '../server/git.js';

test('agents join the most specific project and cannot match a sibling prefix', () => {
  const projects = [{ id: 'parent', root: 'C:\\Projects\\app' }, { id: 'tree', root: 'C:\\Projects\\app\\worktree' }];
  assert.equal(projectForAgent(projects, { cwd: 'c:\\projects\\APP\\src' }).id, 'parent');
  assert.equal(projectForAgent(projects, { foreground_cwd: 'C:\\Projects\\app\\worktree\\src', cwd: 'C:\\Projects\\app' }).id, 'tree');
  assert.equal(projectForAgent(projects, { cwd: 'C:\\Projects\\app-other' }), null);
  assert.equal(projectForAgent(projects, {}), null);
  const agents = [{ cwd: 'C:\\Projects\\app', workspace_id: 'w1' }, { workspace_id: 'w1' }, { cwd: 'C:\\Projects\\other', workspace_id: 'w1' }];
  const grouped = groupAgents(projects, agents);
  assert.equal(grouped.groups.get('parent').length, 2);
  assert.equal(grouped.unmatched.length, 1, 'a known outside cwd must not be grouped through a peer');
});

test('branch reads HEAD changes, worktree pointers and detached hashes without Git subprocesses', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-web-git-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo'); const git = path.join(repo, '.git');
  await fs.mkdir(path.join(repo, 'src'), { recursive: true }); await fs.mkdir(git);
  await fs.writeFile(path.join(git, 'HEAD'), 'ref: refs/heads/main\n');
  assert.equal(await gitBranch(path.join(repo, 'src')), 'main');
  await fs.writeFile(path.join(git, 'HEAD'), 'ref: refs/heads/feat/clean-ui\n');
  assert.equal(await gitBranch(repo), 'feat/clean-ui');
  const worktree = path.join(root, 'tree'); await fs.mkdir(worktree);
  await fs.writeFile(path.join(worktree, '.git'), 'gitdir: ../repo/.git\n');
  assert.equal(await gitBranch(worktree), 'feat/clean-ui');
  await fs.writeFile(path.join(git, 'HEAD'), 'abcdef0123456789abcdef0123456789abcdef0123\n');
  assert.equal(await gitBranch(worktree), 'abcdef0');
  assert.equal(await gitBranch(path.join(root, 'no-repo')), null);
});


test('unregistered session folders do not appear in the sidebar',()=>{
 const projects=[{id:'opened',root:'C:\\web',name:'web'}];const agents=[{local:true,cwd:'C:\\repo'},{local:true,cwd:'C:\\web\\src'}];
 const tree=workspaceTree(projects,agents);assert.deepEqual(tree.folders,projects);assert.equal(tree.groups.get('opened').length,1);
});

test('local sessions never create folders outside the user project list',()=>{
 const projects=[{id:'chosen',root:'C:\\Projects\\app',name:'app'}];const agents=[{local:true,cwd:'C:\\Projects\\app\\src'},{local:true,cwd:'C:\\Projects\\app-other'},{local:true,cwd:'C:\\Other'}];const tree=workspaceTree(projects,agents);assert.deepEqual(tree.folders,projects);assert.equal(tree.groups.get('chosen').length,1);
});
