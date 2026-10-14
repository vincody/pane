import {test,expect} from '@playwright/test';

const workspace={id:'react-workspace',name:'React workspace',root:'C:\\work\\pane',branch:'main'};
const nativeId='12345678-1234-1234-1234-123456789abc';
test('React settings, usage, history and sidebar preserve native terminal identity and saved preferences',async({page})=>{
 const errors:string[]=[],starts:unknown[]=[],inputs:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/projects',route=>route.fulfill({json:{projects:[workspace],defaultProject:workspace.id}}));
 await page.route('**/api/tree?**',route=>route.fulfill({json:{entries:[]}}));
 await page.route('**/api/changes?**',route=>route.fulfill({json:{available:false,files:[]}}));
 await page.route('**/api/account-usage?**',route=>route.fulfill({json:{providers:[{provider:'claude',available:true,fiveHour:{usedPercent:58},weekly:{usedPercent:30}},{provider:'codex',available:true,fiveHour:{usedPercent:10},weekly:{usedPercent:82}}]}}));
 await page.route('**/api/local-sessions',route=>route.fulfill({json:{agents:[],sessions:[{id:'history-record',agent:'codex',agent_session:{value:nativeId},cwd:workspace.root,name:'Saved conversation',updatedAt:'2026-10-14T10:00:00Z'}]}}));
 await page.routeWebSocket('**/api/terminal',socket=>socket.onMessage(raw=>{
  const message=JSON.parse(raw.toString());if(message.type==='start'){starts.push(message);socket.send(JSON.stringify({type:'ready',shell:'powershell.exe'}));socket.send(JSON.stringify({type:'agent',agent:'codex'}));}
  if(message.type==='input')inputs.push(message.data);
 }));
 await page.goto('/');
 await expect(page.locator('#projects .project-text')).toHaveText(workspace.name);
 await expect(page.locator('.project-button.active .project-text')).toHaveText(workspace.name);
 await page.getByRole('button',{name:'History',exact:true}).click();await page.getByRole('button',{name:'Resume codex: Saved conversation',exact:true}).click();
 await expect.poll(()=>starts.length).toBe(1);await expect.poll(()=>inputs.length).toBe(1);expect(inputs[0]).toContain(`codex resume ${nativeId}`);
 await expect(page.locator('.terminal-agent-card')).toHaveCount(1);await expect(page.locator('.terminal-tab-label')).toHaveText('Saved conversation');
 const terminal=await page.locator('.terminal-screen:visible').elementHandle();expect(terminal).not.toBeNull();await terminal!.evaluate(node=>(node as HTMLElement).dataset.preservationMarker='original-terminal');
 await page.locator('#settings').click();await expect(page.getByLabel('Color theme',{exact:true})).toHaveValue('light');await page.getByLabel('Color theme',{exact:true}).selectOption('dark');await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await expect.poll(()=>page.locator('html').evaluate(node=>getComputedStyle(node).colorScheme)).toBe('dark');await expect(page.locator('.terminal-screen:visible')).toHaveAttribute('data-preservation-marker','original-terminal');
 await page.locator('[data-settings-page=usage]').click();
 await page.getByLabel('Usage quota window').selectOption('both');await page.getByLabel('Show Claude usage',{exact:true}).uncheck();
 await expect(page.locator('.compact-usage-line')).toHaveCount(1);await expect(page.locator('.compact-usage-line')).toContainText('5h 90% · 7d 18%');
 await page.locator('[data-settings-page=editor]').click();await page.getByLabel('Default file view',{exact:true}).selectOption('preview');
 await page.locator('[data-settings-page=notifications]').click();await page.getByLabel('Notify while focused',{exact:true}).check();
 await page.locator('.close-dialog[aria-label="Close settings"]').click();
 await page.locator('.compact-usage-line').click();await expect(page.locator('#usage-dialog')).toBeVisible();await page.keyboard.press('Escape');
 await expect(page.locator('.terminal-screen:visible')).toHaveAttribute('data-preservation-marker','original-terminal');expect(starts).toHaveLength(1);
 await page.locator('.terminal-agent-card').click();await expect(page.locator('.terminal-tab-label')).toHaveText('Saved conversation');
 await page.getByRole('button',{name:'History',exact:true}).click();await page.getByLabel('Search history').fill('Saved');await page.getByRole('button',{name:'Resume codex: Saved conversation',exact:true}).click();expect(starts).toHaveLength(1);
 await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await page.locator('#settings').click();await expect(page.getByLabel('Color theme',{exact:true})).toHaveValue('dark');await page.getByLabel('Color theme',{exact:true}).selectOption('light');await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.locator('[data-settings-page=usage]').click();await expect(page.getByLabel('Usage quota window')).toHaveValue('both');await expect(page.getByLabel('Show Claude usage',{exact:true})).not.toBeChecked();
 await page.locator('[data-settings-page=editor]').click();await expect(page.getByLabel('Default file view',{exact:true})).toHaveValue('preview');
 await page.locator('[data-settings-page=notifications]').click();await expect(page.getByLabel('Notify while focused',{exact:true})).toBeChecked();
 await page.screenshot({path:'test-results/react-settings.png'});expect(errors).toEqual([]);
});
