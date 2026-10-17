import {serverPort} from '../helpers/http.ts';
import {expectComposerValue} from './composer-value.ts';
import {fakeCodexFactory} from '../helpers/codex-engine.ts';
import { test, expect, type Locator } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

test.beforeEach(async({page})=>{await page.route('**/api/account-usage?**',route=>route.fulfill({json:{providers:[]}}));});

test('open folder, edit, preview unsaved Markdown, save, then preserve a conflict', async ({ page }) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-web-ui-'));
  await fs.writeFile(path.join(root, 'notes.md'), '# Hello\n\nOriginal text.\n');
  await fs.writeFile(path.join(root, 'unsafe.md'), '<img src=x onerror="window.bad=true"><script>window.bad=true</script>\n');
  await fs.writeFile(path.join(root, 'unsafe.html'), '<h1>Static HTML preview</h1><script>document.querySelector("h1").textContent="Executed"</script>');
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open folder', exact: true }).click();
    await page.getByLabel('Folder path').fill(root);
    await page.getByRole('button', { name: 'Open folder', exact: true }).last().click();
    await page.getByRole('treeitem', { name: 'notes.md' }).click();
    await expect(page.locator('.monaco-editor')).toBeVisible();
    await page.locator('.monaco-editor textarea').focus();
    await page.keyboard.press('Control+Home');
    await page.keyboard.press('Control+a');
    await page.keyboard.type('# Edited in AI Web\n\nUnsaved preview works.');
    await page.getByRole('button', { name: 'Split', exact: true }).click();
    await expect(page.locator('#preview-content h1')).toHaveText('Edited in AI Web');
    await expect(page.locator('#dirty-label')).toBeVisible();
    await page.keyboard.press('Control+s');
    await expect(page.locator('#status-message')).toHaveText('Saved to disk');
    expect(await fs.readFile(path.join(root, 'notes.md'), 'utf8')).toContain('Edited in AI Web');
    await fs.writeFile(path.join(root, 'notes.md'), '# Changed by agent\n');
    await page.locator('.monaco-editor textarea').focus();
    await page.keyboard.press('Control+End'); await page.keyboard.type('\nMy extra edit');
    await page.keyboard.press('Control+s');
    await expect(page.locator('#status-message')).toContainText('changed on disk');
    expect(await fs.readFile(path.join(root, 'notes.md'), 'utf8')).toBe('# Changed by agent\n');
    await expect(page.locator('#dirty-label')).toBeVisible();
    await page.getByRole('treeitem', { name: 'unsafe.md' }).click();
    await expect(page.locator('#preview-content script')).toHaveCount(0);
    expect(await page.evaluate(() => ('bad' in window ? window.bad : undefined))).toBeUndefined();
    await page.getByRole('treeitem', { name: 'unsafe.html', exact: true }).click();
    await expect(page.frameLocator('#preview-content iframe').locator('h1')).toHaveText('Static HTML preview');
    await page.screenshot({ path: 'test-results/editor-preview.png', fullPage: true });
    expect(errors).toEqual([]);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('reference layout renders Markdown and images; compact viewport does not overflow', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('treeitem', { name: 'demo', exact: true }).click();
  await page.getByRole('treeitem', { name: 'Welcome.md' }).click();
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  await expect(page.locator('#preview-content h1')).toHaveText('A workspace that stays out of your way.');
  await page.screenshot({ path: 'test-results/workspace.png', fullPage: true });
  for(const folder of ['client','public','agents'])await page.getByRole('treeitem',{name:folder,exact:true}).click();
  await page.getByRole('treeitem', { name: 'codex.svg',exact:true }).click();
  await expect(page.locator('#image-editor img')).toBeVisible();
  await page.setViewportSize({ width: 650, height: 850 });
  await page.getByRole('button', { name: 'Toggle projects sidebar' }).click();
  await expect(page.locator('#preview-content img')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


test('Files lives on the right and can be hidden, reopened and remembered', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.sidebar #tree')).toHaveCount(0);
  await expect(page.locator('.sidebar #projects')).toBeVisible();
  await expect(page.locator('.sidebar #projects')).toBeVisible();await expect(page.locator('.agents-section')).toBeHidden();
  await expect(page.getByRole('complementary', { name: 'File explorer' })).toBeVisible();
  const right = await page.locator('#files-sidebar').boundingBox();
  const center = await page.locator('main').boundingBox();
  expect(right!.x).toBeGreaterThanOrEqual(center!.x + center!.width - 1);
  await page.getByRole('treeitem', { name: 'demo', exact: true }).click();
  await page.getByRole('treeitem', { name: 'Welcome.md', exact: true }).click();
  await page.getByRole('button', { name: 'Toggle files', exact: true }).click();
  await expect(page.locator('#files-sidebar')).toBeHidden();
  await expect(page.locator('.monaco-editor')).toBeVisible();
  await expect(page.locator('#file-name')).toHaveText('Welcome.md');
  await expect(page.getByRole('button', { name: 'Toggle files', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Control+Shift+e');
  await expect(page.locator('#files-sidebar')).toBeVisible();
  await page.getByRole('button', { name: 'Toggle files', exact: true }).click();
  await page.reload();
  await expect(page.locator('#files-sidebar')).toBeHidden();
  await page.getByRole('button', { name: 'Toggle files', exact: true }).click();
  await expect(page.locator('#files-sidebar')).toBeVisible();
  await page.screenshot({ path: 'test-results/two-sidebars.png', fullPage: true });
});


test('agent rows show identity, logo status and working preferences', async ({ page }) => {
  await page.route('**/api/local-sessions', route => route.fulfill({ json: {
    connected: true, agents: [{ agent: 'claude', pane_id: 'w-demo:p1', cwd: path.resolve('.'), name: 'checkout-api', agent_status: 'working', focused: true }],
  } }));
  await page.goto('/');
  const row = page.locator('.agent-card');
  await expect(row.locator('.agent-title')).toHaveText('checkout-api');
  await expect(row.locator('.agent-meta')).toHaveText('Claude · Working');
  await expect(row.locator('.provider-mark img')).toHaveAttribute('src', '/agents/claude.svg');
  await expect(row.locator('.agent-state')).toHaveAttribute('aria-label', 'working');
  const copy = await row.locator('.agent-copy').boundingBox();
  const indicator = await row.locator('.agent-state').boundingBox();
  expect(indicator!.x).toBeLessThan(copy!.x);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Compact sidebar', { exact: true }).check();
  await page.locator('#settings-dialog').getByRole('button',{name:'Editor',exact:true}).click();await page.getByLabel('Editor font size', { exact: true }).selectOption('14');
  await page.getByLabel('Wrap long lines', { exact: true }).check();
  await expect(page.locator('#app')).toHaveAttribute('data-density', 'compact');
  await page.getByRole('button', { name: 'Close settings', exact: true }).click();
  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('data-density', 'compact');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel('Editor font size', { exact: true })).toHaveValue('14');
  await expect(page.getByLabel('Wrap long lines', { exact: true })).toBeChecked();
});


test('workspace context menu renames and removes from web without deleting files', async ({ page }) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-web-menu-'));
  const original = 'keep this file';
  await fs.writeFile(path.join(root, 'keep.txt'), original);
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open folder', exact: true }).click();
    await page.getByLabel('Folder path').fill(root);
    await page.getByRole('button', { name: 'Open folder', exact: true }).last().click();
    const workspace = page.locator('.project-button').filter({ hasText: path.basename(root) });
    await workspace.click({ button: 'right' });
    await expect(page.getByRole('menu', { name: 'Workspace actions' })).toBeVisible();
    await page.getByRole('menuitem', { name: 'Rename in web' }).click();
    await page.getByLabel('Project name').fill('Menu test workspace');
    await page.getByRole('button', { name: 'Rename', exact: true }).click();
    await expect(page.locator('.project-button').filter({ hasText: 'Menu test workspace' })).toBeVisible();
    expect((await fs.stat(root)).isDirectory()).toBe(true);
    await page.getByRole('treeitem', { name: 'keep.txt', exact: true }).click();
    await page.locator('.monaco-editor textarea').focus();
    await page.keyboard.press('Control+End'); await page.keyboard.type(' unsaved');
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('button', { name: 'Actions for Menu test workspace' }).click();
    await page.getByRole('menuitem', { name: 'Remove from web' }).click();
    await expect(page.locator('#dirty-label')).toBeVisible();
    await expect(page.locator('.project-button').filter({ hasText: 'Menu test workspace' })).toBeVisible();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Actions for Menu test workspace' }).click();
    await page.getByRole('menuitem', { name: 'Remove from web' }).click();
    await expect(page.locator('.project-button').filter({ hasText: 'Menu test workspace' })).toHaveCount(0);
    expect(await fs.readFile(path.join(root, 'keep.txt'), 'utf8')).toBe(original);
    await page.reload();
    await expect(page.locator('.project-button').filter({ hasText: 'Menu test workspace' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Open folder', exact: true }).click();
    await page.getByLabel('Folder path').fill(root);
    await page.getByRole('button', { name: 'Open folder', exact: true }).last().click();
    await expect(page.getByRole('treeitem', { name: 'keep.txt', exact: true })).toBeVisible();
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('workspace menu supports keyboard, escape, outside click and reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const workspace = page.locator('.project-button').first();
  await workspace.focus(); await page.keyboard.press('Shift+F10');
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Open project' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Rename in web' })).toBeFocused();
  expect(await page.getByRole('menu').evaluate(element => getComputedStyle(element).animationName)).toBe('none');
  await page.keyboard.press('Escape'); await expect(page.getByRole('menu')).toBeHidden();
  await workspace.click({ button: 'right' }); await expect(page.getByRole('menu')).toBeVisible();
  await page.locator('.topbar').click(); await expect(page.getByRole('menu')).toBeHidden();
});


test('clean workspace tree groups agents below a real branch and preserves folding', async ({ page }) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-web-hierarchy-'));
  await fs.mkdir(path.join(root, '.git'));
  await fs.writeFile(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  await fs.writeFile(path.join(root, 'note.md'), '# Clean workspace\n');
  await page.route('**/api/local-sessions', route => route.fulfill({ json: {
    connected: true, workspaces: [{ workspace_id: 'w-clean', label: 'clean-project' }],
    agents: [
      { agent: 'claude', name: 'Fix pane resize', agent_status: 'blocked', focused: true, cwd: root, workspace_id: 'w-clean' },
      { agent: 'codex', name: 'Run regression tests', agent_status: 'working', cwd: root, workspace_id: 'w-clean' },
      { agent: 'opencode', name: 'Review changes', agent_status: 'idle', cwd: root, workspace_id: 'w-clean' },
    ],
  } }));
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open folder', exact: true }).click();
    await page.getByLabel('Folder path').fill(root);
    await page.getByRole('button', { name: 'Open folder', exact: true }).last().click();
    const group = page.locator('.workspace-group').filter({ has: page.locator('.project-text', { hasText: path.basename(root) }) });
    await expect(group.locator('.workspace-branch')).toHaveText('main');
    await expect(group.locator('.agent-card')).toHaveCount(3);
    await expect(group.locator('.agent-card.selected')).toHaveCount(1);
    await expect(group.locator('.workspace-count')).toHaveText('1 needs you');
    await expect(group.locator('.agent-meta').first()).toHaveText('Claude · Needs you');
    await expect(group.locator('.agent-state').first()).toHaveAttribute('aria-label','blocked');
    await group.getByRole('button', { name: `Collapse ${path.basename(root)}`, exact: true }).click();
    await expect(group.locator('.workspace-children')).toBeHidden();
    await page.reload();
    const folded = page.locator('.workspace-group').filter({ has: page.locator('.project-text', { hasText: path.basename(root) }) });
    await expect(folded.locator('.workspace-children')).toBeHidden();
    await folded.getByRole('button', { name: `Expand ${path.basename(root)}`, exact: true }).click();
    await expect(folded.locator('.workspace-children')).toBeVisible();
    await folded.locator('.project-button').click();
    await page.getByRole('button',{name:'Open files',exact:true}).click();
    await page.getByRole('treeitem', { name: 'note.md', exact: true }).click();
    await page.getByRole('button', { name: 'Split', exact: true }).click();
    await expect(page.locator('#preview-content h1')).toHaveText('Clean workspace');
    await page.screenshot({ path: 'test-results/clean-hierarchy.png', fullPage: true });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});


test('sidebars resize smoothly, remember widths, reset and support keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const left = page.getByRole('separator', { name: 'Resize workspace sidebar' });
  const right = page.getByRole('separator', { name: 'Resize Files sidebar' });
  await expect(left).toBeVisible(); await expect(right).toBeVisible();
  const move = async (handle: Locator, distance: number) => {
    const box = await handle.boundingBox(); expect(box).not.toBeNull(); const x = box!.x + box!.width / 2, y = box!.y + 200;
    await page.mouse.move(x, y); await page.mouse.down();
    await expect(page.locator('#app')).toHaveClass(/resizing-panels/);
    await page.mouse.move(x + distance, y, { steps: 12 }); await page.mouse.up();
    await expect(page.locator('#app')).not.toHaveClass(/resizing-panels/);
  };
  await move(left, 74); await expect(left).toHaveAttribute('aria-valuenow', '360');
  await move(right, -60); await expect(right).toHaveAttribute('aria-valuenow', '320');
  await page.reload();
  await expect(left).toHaveAttribute('aria-valuenow', '360'); await expect(right).toHaveAttribute('aria-valuenow', '320');
  await left.focus(); await left.press('ArrowRight'); await expect(left).toHaveAttribute('aria-valuenow', '370');
  await right.dblclick(); await expect(right).toHaveAttribute('aria-valuenow', '260');
  await left.press('Home'); await expect(left).toHaveAttribute('aria-valuenow', '286');
  await move(left, 500); await expect(left).toHaveAttribute('aria-valuenow', '420');
  await page.getByRole('button', { name: 'Toggle projects sidebar', exact: true }).click(); await expect(left).not.toBeVisible();
  await page.getByRole('button', { name: 'Toggle projects sidebar', exact: true }).click(); await expect(left).toHaveAttribute('aria-valuenow', '420');
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect.poll(() => page.locator('main').evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThanOrEqual(320);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.locator('.sidebar').evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0s');
  await page.setViewportSize({ width: 800, height: 768 }); await expect(left).not.toBeVisible();
});


test('session opens output terminal with both sidebars and returns to file editor',async({page})=>{
 const agent={local:true,agent:'codex',id:'terminal-only',saved_session_id:'terminal-only',pane_id:'local:terminal-only',terminal_id:'local:terminal-only',agent_session:{value:'native-terminal'},cwd:path.resolve('.'),name:'Terminal only',agent_status:'done',sessionConnection:'ready'};
 await page.route('**/api/local-sessions',route=>route.fulfill({json:{agents:[agent],sessions:[{...agent,live:true}]}}));
 await page.route('**/api/agent-session?**',route=>route.fulfill({json:{agent,available:true,messages:[],metadata:{},terminal:'CLI output',question:null}}));
 await page.goto('/');await expect(page.locator('#new-session-panel,#agent-chat')).toHaveCount(0);await expect(page.getByRole('button',{name:/New session in/})).toHaveCount(0);await page.getByRole('button',{name:'Open Terminal only',exact:true}).click();await expect(page.locator('#agent-terminal')).toBeVisible();await expect(page.locator('#projects-sidebar')).toBeVisible();await expect(page.locator('#files-sidebar')).toBeVisible();await page.getByRole('button',{name:'Back to files'}).click();await expect(page.locator('#editor-stack')).toBeVisible();
});


test('folder drag order persists; moved local sessions show dates and newest first',async({page})=>{
 const {createApp}=await import('../../server/src/app.ts');const root=await fs.mkdtemp(path.join(os.tmpdir(),'ai-web-drag-ui-'));const folders=['Alpha','Beta','Gamma'].map(name=>path.join(root,name));for(const folder of folders)await fs.mkdir(folder);const logs=path.join(root,'.codex/sessions/2026/10/12');await fs.mkdir(logs,{recursive:true});
 for(const [index,label,date] of [[1,'Older session','2026-10-10T10:00:00Z'],[2,'Newest session','2026-10-12T10:00:00Z']]){const id=`${index}1a12b4c-fe47-7312-80a2-4b55c3540085`;await fs.writeFile(path.join(logs,id+'.jsonl'),[{type:'session_meta',payload:{id,cwd:root}},{type:'turn_context',timestamp:date,payload:{cwd:folders[0]}},{type:'response_item',timestamp:date,payload:{type:'message',role:'user',content:[{type:'input_text',text:label}]}}].map(row=>JSON.stringify(row)).join('\n')+'\n');}
 const app=await createApp({initialRoot:folders[0],stateDir:path.join(root,'state'),agentHome:root,codexEngineFactory:fakeCodexFactory()});await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${serverPort(app.server)}`;const headers={'X-AI-Web-Token':app.token,'Content-Type':'application/json'};for(const folder of folders.slice(1))await fetch(base+'/api/projects',{headers,method:'POST',body:JSON.stringify({path:folder})});
 try{await page.goto(base);const labels=page.locator('.project-text');await expect(labels).toHaveText(['Alpha','Beta','Gamma']);const gamma=page.locator('.project-button').filter({hasText:'Gamma'});const alpha=page.locator('.project-button').filter({hasText:'Alpha'});await gamma.dragTo(alpha,{targetPosition:{x:80,y:4}});await expect(labels).toHaveText(['Gamma','Alpha','Beta']);await page.reload();await expect(labels).toHaveText(['Gamma','Alpha','Beta']);await page.locator('.project-button').filter({hasText:'Gamma'}).press('Alt+ArrowDown');await expect(labels).toHaveText(['Alpha','Gamma','Beta']);
 await page.locator('.project-button').filter({hasText:'Alpha'}).click();const rows=page.locator('.project-session-list .agent-title');await expect(rows).toHaveText(['Newest session','Older session']);await expect(page.locator('.project-session-list time').first()).toContainText('12/10/2026');await expect(page.locator('.project-session-list time').last()).toContainText('10/10/2026');await page.screenshot({path:'test-results/session-dates-order.png',fullPage:true,animations:'disabled'});}
 finally{await new Promise<void>(resolve=>app.server.close(()=>resolve()));await fs.rm(root,{recursive:true,force:true});}
});
