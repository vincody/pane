import {test,expect} from '@playwright/test';

test('one titlebar contains tabs while preserving rename, maximize and file access',async({page})=>{
 await page.setViewportSize({width:1920,height:1080});
 const project={id:'compact-tabs',name:'Compact workspace',root:'C:\\work\\compact',branch:'main'};
 await page.route('**/api/projects',route=>route.fulfill({json:{projects:[project],defaultProject:project.id}}));
 await page.route('**/api/tree?**',route=>route.fulfill({json:{entries:[{name:'README.md',path:'README.md',type:'file',image:false}]}}));
 await page.route('**/api/file?**',route=>route.fulfill({json:{kind:'text',content:'# Example\n',version:'version-one',bom:false,size:10}}));
 await page.route('**/api/changes?**',route=>route.fulfill({json:{available:false,files:[]}}));
 await page.route('**/api/account-usage?**',route=>route.fulfill({json:{providers:[]}}));
 await page.route('**/api/dev-servers?**',route=>route.fulfill({json:{available:true,scannedAt:new Date().toISOString(),rows:[]}}));
 await page.route('**/api/local-sessions',route=>route.fulfill({json:{agents:[],sessions:[]}}));
 await page.routeWebSocket('**/api/terminal',socket=>socket.onMessage(raw=>{if(JSON.parse(raw.toString()).type==='start')socket.send(JSON.stringify({type:'ready',shell:'Test shell'}));}));
 await page.goto('/');
 for(let i=0;i<2;i++){await page.locator('#terminal-new').click();await page.locator('[data-launch=shell]').click();}
 const panes=page.locator('.terminal-screen:visible'),tabs=page.locator('#unified-tabs');
 await expect(panes).toHaveCount(2);await expect(tabs).toBeVisible();
 const focusedHeaderMatchesBody=()=>panes.evaluateAll(nodes=>nodes.every(node=>{
  const header=getComputedStyle(node.querySelector('.terminal-pane-header')!).backgroundColor,body=getComputedStyle(node).backgroundColor;
  return node.classList.contains('pane-focused')?header===body:header!==body;
 }));
 await expect.poll(focusedHeaderMatchesBody).toBe(true);
 await panes.first().locator('.terminal-pane-body').click();await expect(panes.first()).toHaveClass(/pane-focused/);await expect(panes.nth(1)).not.toHaveClass(/pane-focused/);await expect.poll(focusedHeaderMatchesBody).toBe(true);
 await panes.nth(1).locator('.terminal-pane-body').click();await expect(panes.nth(1)).toHaveClass(/pane-focused/);await expect.poll(focusedHeaderMatchesBody).toBe(true);
 const terminalOverflow=()=>panes.evaluateAll(nodes=>Math.max(...nodes.map(node=>{
  const body=node.querySelector('.terminal-pane-body')!.getBoundingClientRect(),screen=node.querySelector('.xterm-screen')!.getBoundingClientRect();
  return Math.max(screen.bottom-(body.bottom-10),screen.right-(body.right-12));
 })));
 await expect.poll(terminalOverflow).toBeLessThanOrEqual(1);
 await expect.poll(()=>panes.evaluateAll(nodes=>nodes.every(node=>{
  const background=getComputedStyle(node).backgroundColor;
  return ['.xterm','.xterm-viewport'].every(selector=>getComputedStyle(node.querySelector(selector)!).backgroundColor===background);
 }))).toBe(true);
 await page.setViewportSize({width:1280,height:720});await expect.poll(terminalOverflow).toBeLessThanOrEqual(1);
 await page.setViewportSize({width:1920,height:1080});await expect.poll(terminalOverflow).toBeLessThanOrEqual(1);
 await expect(page.locator('.topbar > #unified-tabs')).toHaveCount(1);
 await expect(page.locator('main > #unified-tabs')).toHaveCount(0);
 await expect(page.locator('.titlebar-trail')).toHaveCount(0);
 await expect(page.locator('.project-button.active .project-text')).toHaveText(project.name);
 await expect(page.locator('.workspace-branch')).toContainText('main');
 const right=panes.nth(1);await right.locator('.terminal-pane-title').dblclick();
 const rename=page.getByRole('textbox',{name:'Terminal tab name',exact:true});await expect(rename).toBeVisible();
 await rename.fill('Build server');await rename.press('Enter');
 await expect(right.locator('.terminal-pane-title')).toHaveText('Build server');await expect(tabs).toBeVisible();
 await right.getByRole('button',{name:'Maximize terminal pane',exact:true}).click();
 await expect(panes).toHaveCount(1);await expect(tabs).toBeVisible();
 await panes.getByRole('button',{name:'Restore terminal pane',exact:true}).click();
 await expect(panes).toHaveCount(2);await expect(tabs).toBeVisible();
 await page.getByRole('treeitem',{name:'README.md',exact:true}).click();
 await expect(tabs).toBeVisible();
 await page.locator('#terminal-tabs .terminal-tab').first().click();
 await expect(panes).toHaveCount(2);await expect(tabs).toBeVisible();
 await page.getByRole('button',{name:'Close README.md',exact:true}).click();
 await expect(tabs).toBeVisible();await expect(panes).toHaveCount(2);
 await page.screenshot({path:'test-results/compact-terminal-tabs.png'});
 await panes.nth(1).getByRole('button',{name:'Close terminal pane',exact:true}).click();
 await expect(panes).toHaveCount(1);await expect(tabs).toBeVisible();
});
