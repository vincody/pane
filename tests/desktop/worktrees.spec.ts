import {test,expect} from './app.ts';
import type {Workspace} from '../../shared/contracts.ts';

test('Local and worktrees own their sessions and remember the selected working folder',async({page})=>{
 const parent:Workspace={id:'task-parent',name:'ai-web',root:'C:\\work\\ai-web',branch:'dev'};
 const child:Workspace={id:'task-ssh',name:'SSH support',root:'C:\\worktrees\\ssh',branch:'feat/ssh',parentId:parent.id,note:'SSH notes'};
 const projects=[parent],starts:Record<string,unknown>[]=[],attaches:string[]=[],creations:Record<string,unknown>[]=[],inputs:{project:string;data:string}[]=[],errors:string[]=[];
 const owners=new Map<string,string>();page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/projects',route=>route.fulfill({json:{projects,defaultProject:parent.id}}));
 await page.route('**/api/sub-workspaces?**',async route=>{
  if(route.request().method()==='POST'&&route.request().postDataJSON().mode==='open'){await route.fulfill({json:parent});}
  else if(route.request().method()==='POST'){creations.push(route.request().postDataJSON());projects.push(child);await route.fulfill({status:201,json:child});}
  else await route.fulfill({json:{current:'dev',local:['dev','fix/available'],bases:['dev','fix/available','refs/remotes/origin/main'],checkedOut:['dev']}});
 });
 await page.route('**/api/tree?**',route=>route.fulfill({json:{entries:[{name:new URL(route.request().url()).searchParams.get('project')===child.id?'child.txt':'local.txt',path:'source.txt',type:'file',image:false}]}}));
 await page.route('**/api/changes?**',route=>route.fulfill({json:{available:true,files:[]}}));
 await page.route('**/api/dev-servers?**',route=>route.fulfill({json:{available:true,rows:[]}}));
 await page.route('**/api/account-usage?**',route=>route.fulfill({json:{providers:[]}}));
 await page.route('**/api/local-sessions',route=>route.fulfill({json:{agents:[],sessions:[]}}));
 await page.routeWebSocket('**/api/terminal',socket=>{
  let owner='';socket.onMessage(raw=>{
   const message=JSON.parse(raw.toString());
   if(message.type==='start'){starts.push(message);owner=message.project;owners.set(message.sessionId,owner);socket.send(JSON.stringify({type:'ready',shell:'powershell.exe',sessionId:message.sessionId}));socket.send(JSON.stringify({type:'data',data:`${owner}> `}));}
   if(message.type==='attach'){attaches.push(message.sessionId);owner=owners.get(message.sessionId)||'';socket.send(JSON.stringify({type:'ready',shell:'powershell.exe',sessionId:message.sessionId,attached:true}));socket.send(JSON.stringify({type:'data',data:`${owner}> `,replay:true}));}
   if(message.type==='input')inputs.push({project:owner,data:message.data});
  });
 });
 await page.goto('/');
 const local=page.locator(`[data-context=${parent.id}]`),task=page.locator(`[data-context=${child.id}]`);
 await expect(local.locator('.workspace-context-name')).toHaveCount(0);await expect(local.locator('.workspace-branch')).toHaveText('dev');
 await page.getByRole('button',{name:'New session',exact:true}).click();await page.locator('[data-launch=shell]').click();await expect(local.locator('.terminal-agent-card')).toHaveCount(1);
 await expect.poll(()=>starts.length).toBe(1);await page.locator('.terminal-screen:visible').evaluate(node=>(node as HTMLElement).dataset.sessionMarker='local-session');
 await page.getByRole('button',{name:'New worktree in ai-web',exact:true}).click();await expect(page.getByLabel('Worktree project')).toHaveValue(parent.id);await expect(page.getByLabel('Starting branch')).toHaveValue('dev');await expect(page.getByRole('button',{name:/^Create worktree/})).toBeEnabled();
 await expect(page.locator('.composer-preview')).toBeHidden();await expect(page.locator('.composer-source-hint')).toBeEmpty();await expect(page.getByLabel('Worktree location')).toHaveValue('');
 await expect(page.getByRole('listbox',{name:'Available branches'})).toBeVisible();await expect(page.getByRole('option',{name:'origin/main Remote',exact:true})).toBeVisible();await page.screenshot({path:'test-results/branch-popup-light.png'});await page.evaluate(()=>document.documentElement.dataset.theme='dark');await page.screenshot({path:'test-results/branch-popup-dark.png'});await page.evaluate(()=>document.documentElement.dataset.theme='light');
 await page.getByLabel('Create From',{exact:true}).fill('origin');await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(1);await page.getByLabel('Create From',{exact:true}).press('ArrowDown');await page.getByLabel('Create From',{exact:true}).press('Enter');await expect(page.getByLabel('Create From',{exact:true})).toHaveValue('origin/main');await expect(page.getByRole('listbox')).toBeHidden();expect(creations).toHaveLength(0);
 await page.getByLabel('Create From',{exact:true}).fill('');await page.getByLabel('Create From',{exact:true}).press('Escape');await expect(page.getByRole('dialog',{name:'Create worktree'})).toBeVisible();await expect(page.getByRole('listbox')).toBeHidden();
 await page.getByLabel('Create From',{exact:true}).fill('Temporary task');await expect(page.locator('.composer-preview')).toContainText('Branch: temporary-task');await page.getByLabel('Create From',{exact:true}).fill('');await expect(page.locator('.composer-preview')).toBeHidden();await expect(page.getByLabel('Worktree location')).toHaveValue('');
 await page.getByLabel('Create From',{exact:true}).fill('dev');await expect(page.getByRole('button',{name:'Open existing worktree',exact:true})).toBeVisible();await page.getByRole('button',{name:'Open existing worktree',exact:true}).click();await expect(local.locator('.workspace-context-button')).toHaveAttribute('aria-current','page');expect(starts).toHaveLength(1);
 await page.getByRole('button',{name:'New worktree in ai-web',exact:true}).click();await page.getByLabel('Create From',{exact:true}).fill('fix/available');await expect(page.getByLabel('Reuse branch')).toBeChecked();await expect(page.getByLabel('Starting branch')).not.toBeVisible();
 await page.getByLabel('Create From',{exact:true}).fill('SSH support');await expect(page.getByLabel('Reuse branch')).not.toBeVisible();const agentPicker=page.getByLabel('Worktree agent',{exact:true});await expect(agentPicker).toHaveAttribute('role','combobox');await agentPicker.click();await expect(agentPicker).toContainText('Blank terminal');await expect(page.locator('.worktree-agent-menu:popover-open')).toHaveCount(1);await page.screenshot({path:'test-results/worktree-agent-picker-light.png',animations:'disabled'});await page.evaluate(()=>document.documentElement.dataset.theme='dark');await page.screenshot({path:'test-results/worktree-agent-picker-dark.png',animations:'disabled'});await page.evaluate(()=>document.documentElement.dataset.theme='light');await page.getByRole('option',{name:'No session',exact:true}).click();await expect(agentPicker).toContainText('No session');await expect(page.locator('.worktree-agent-menu:popover-open')).toHaveCount(0);await agentPicker.focus();await page.keyboard.press('Space');await expect(page.locator('.worktree-agent-menu:popover-open')).toHaveCount(1);await page.keyboard.press('Escape');await expect(agentPicker).toContainText('No session');await page.locator('.composer-advanced summary').click();
 await expect(page.getByLabel('Worktree location')).toHaveValue('C:\\work\\ai-web-worktrees\\ssh-support');await page.getByLabel('Worktree location').fill('C:\\custom folder\\my-tree');await page.getByLabel('Create From',{exact:true}).fill('Renamed task');await expect(page.getByLabel('Worktree location')).toHaveValue('C:\\custom folder\\my-tree');await page.getByLabel('Create From',{exact:true}).fill('SSH support');
 await page.getByLabel('Worktree branch').fill('feat/ssh');await page.getByLabel('Worktree note').fill('SSH notes');await expect(page.getByRole('button',{name:'Create worktree',exact:true})).not.toContainText('Ctrl');await page.keyboard.press('Control+Enter');expect(creations).toHaveLength(0);await page.getByRole('button',{name:'Create worktree',exact:true}).click();
 await expect(task.locator('.workspace-context-button')).toHaveAttribute('aria-current','page');await expect(task.locator('.workspace-branch')).toHaveText('feat/ssh');await expect(local.locator('.workspace-branch')).toHaveText('dev');
 expect(creations).toEqual([{mode:'compose',name:'SSH support',source:'dev',reuseBranch:false,branchName:'feat/ssh',destination:'C:\\custom folder\\my-tree',note:'SSH notes'}]);await expect(task.locator('.workspace-context-name')).toHaveText('SSH support');await expect(task.locator('.workspace-context-note')).toHaveText('SSH notes');await expect(page.locator('#tree')).toContainText('child.txt');
 await expect(page.locator('.terminal-tab:visible')).toHaveCount(0);
 await page.getByRole('button',{name:'New session',exact:true}).click();await page.locator('[data-launch=shell]').click();await expect(task.locator('.terminal-agent-card')).toHaveCount(1);await expect.poll(()=>starts.length).toBe(2);expect(starts[1].project).toBe(child.id);
 await page.locator('.terminal-screen:visible').evaluate(node=>(node as HTMLElement).dataset.sessionMarker='task-session');
 await page.getByRole('button',{name:'Open dev in ai-web',exact:true}).click();await expect(page.locator('.terminal-screen:visible')).toHaveAttribute('data-session-marker','local-session');await expect(page.locator('#tree')).toContainText('local.txt');await expect(page.locator('.terminal-tab:visible')).toHaveCount(1);
 await page.keyboard.type('local command');await expect.poll(()=>inputs.some(input=>input.project===parent.id&&input.data.includes('l'))).toBe(true);
 await page.getByRole('button',{name:'Open SSH support in ai-web',exact:true}).click();await expect(page.locator('.terminal-screen:visible')).toHaveAttribute('data-session-marker','task-session');expect(starts).toHaveLength(2);
 await page.screenshot({path:'test-results/sub-workspaces-light.png'});
 await page.locator('#settings').click();await page.getByLabel('Color theme',{exact:true}).selectOption('dark');await page.locator('.close-dialog[aria-label="Close settings"]').click();await page.screenshot({path:'test-results/sub-workspaces-dark.png'});
 await page.reload();await expect(task.locator('.workspace-context-button')).toHaveAttribute('aria-current','page');await expect.poll(()=>attaches.length).toBe(2);expect(starts).toHaveLength(2);await expect(page.locator('.terminal-tab:visible')).toHaveCount(1);await expect(local.locator('.terminal-agent-card')).toHaveCount(1);await expect(task.locator('.terminal-agent-card')).toHaveCount(1);
 await page.getByRole('button',{name:'Close terminal pane',exact:true}).click();await expect(task.locator('.workspace-context-button')).toHaveAttribute('aria-current','page');await expect(page.locator('.terminal-tab:visible')).toHaveCount(0);await expect(local.locator('.terminal-agent-card')).toHaveCount(1);
 await page.getByRole('button',{name:'Open dev in ai-web',exact:true}).click();await expect(page.locator('.terminal-screen:visible')).toHaveCount(1);expect(starts).toHaveLength(2);
 await page.getByRole('button',{name:'New worktree in ai-web',exact:true}).click();await page.getByLabel('Worktree agent').click();await page.getByRole('option',{name:'Codex',exact:true}).click();await page.getByRole('button',{name:/^Create worktree/}).click();await expect.poll(()=>starts.length).toBe(3);expect(creations[1].name).toMatch(/^[A-Za-z]+(?:-\d+)?$/);await expect.poll(()=>inputs.some(input=>input.project===child.id&&input.data==='codex\r')).toBe(true);expect(errors).toEqual([]);
});
