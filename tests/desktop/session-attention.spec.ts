import {test,expect,type WebSocketRoute} from './app.ts';

test('folders stay expanded and shortcut opens and acknowledges the correct session',async({page})=>{
 const projects=[{id:'attention-a',name:'Workspace A',root:'C:\\work\\a',branch:'main'},{id:'attention-b',name:'Workspace B',root:'C:\\work\\b',branch:'main'}];
 const sockets=new Map<string,WebSocketRoute>();
 await page.addInitScript(()=>{document.hasFocus=()=>true;localStorage.setItem('ai-web.notifications',JSON.stringify({popup:false,sound:false}));});
 await page.route('**/api/projects',route=>route.fulfill({json:{projects,defaultProject:projects[0].id}}));
 await page.route('**/api/tree?**',route=>route.fulfill({json:{entries:[]}}));
 await page.route('**/api/changes?**',route=>route.fulfill({json:{available:false,files:[]}}));
 await page.route('**/api/account-usage?**',route=>route.fulfill({json:{providers:[]}}));
 await page.route('**/api/dev-servers?**',route=>route.fulfill({json:{available:true,rows:[]}}));
 await page.route('**/api/local-sessions',route=>route.fulfill({json:{agents:[],sessions:[]}}));
 await page.routeWebSocket('**/api/terminal',socket=>socket.onMessage(raw=>{
  const message=JSON.parse(raw.toString());if(message.type==='start'){sockets.set(message.project,socket);socket.send(JSON.stringify({type:'ready',shell:'powershell.exe'}));socket.send(JSON.stringify({type:'agent',agent:'codex'}));}
 }));
 await page.goto('/');
 for(const project of projects){await page.locator(`[data-project=${project.id}] .project-button`).click();await page.route('**/api/integrations/tools',route=>route.fulfill({json:{tools:['claude','codex'].map(id=>({id,name:id,installed:true}))}}));await page.locator('#terminal-new').click();await expect(page.locator('[data-launch=codex]')).toBeEnabled();await page.locator('[data-launch=codex]').click();await expect(page.locator(`[data-project=${project.id}] .terminal-agent-card`)).toBeVisible();}
 const first=page.locator('[data-project=attention-a]');
 sockets.get('attention-a')!.send(JSON.stringify({type:'data',data:'\x1b[2J\x1b[H\x1b]0;action required\x07Would you like to run this command?\r\n1. Yes\r\n'}));
 await expect(first.locator('.terminal-agent-card')).toHaveAttribute('data-status','blocked');
 await expect(first.locator('.terminal-agent-card')).toHaveAttribute('data-unread','true');
 await expect(first.locator('.workspace-branch')).toBeVisible();
 await expect(first.locator('.workspace-children')).toBeVisible();await expect(first.locator('.workspace-attention')).toHaveText('1 needs attention');
 await page.keyboard.press('Control+Shift+J');
 await expect(first.locator('.workspace-children')).toBeVisible();await expect(first.locator('.terminal-agent-card')).toHaveClass(/selected/);await expect(first.locator('.terminal-agent-card')).toHaveAttribute('data-unread','false');await expect(first.locator('.project-button')).toHaveAttribute('aria-current','page');
 // Reading a request does not resolve the request itself.
 await expect(first.locator('.workspace-attention')).toHaveText('1 needs attention');
 const send=(data:string)=>sockets.get('attention-a')!.send(JSON.stringify({type:'data',data}));
 send('\x1b[2J\x1b[H\x1b]0;Codex\x07› ');await expect(first.locator('.terminal-agent-card')).toHaveAttribute('data-status','idle');
 await page.keyboard.type('Do a task');await page.keyboard.press('Enter');send('\x1b[2J\x1b[H\x1b]0;⠋ Codex\x07Working (esc to interrupt)');await expect(first.locator('.terminal-agent-card')).toHaveAttribute('data-status','working');
 await page.locator('[data-project=attention-b] .terminal-agent-card').click();send('\x1b[2J\x1b[H\x1b]0;Codex\x07Worked for 1s\r\n› ');
 await expect(first.locator('.terminal-agent-card')).toHaveAttribute('data-status','done');await expect(first.locator('.terminal-agent-card')).toHaveAttribute('data-unread','true');
 await page.keyboard.press('Control+Shift+J');await expect(first.locator('.terminal-agent-card')).toHaveAttribute('data-unread','false');await expect(first.locator('.terminal-agent-card')).toHaveAttribute('data-status','done');await expect(first.locator('.workspace-attention')).toHaveCount(0);
 await expect(first.locator('.workspace-branch')).toBeVisible();await page.reload();await expect(first.locator('.workspace-branch')).toBeVisible();await expect(page.locator('.workspace-expand')).toHaveCount(0);
});
