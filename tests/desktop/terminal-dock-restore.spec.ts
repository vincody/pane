import {test,expect} from './app.ts';
import type {Page} from './app.ts';

const project={id:'dock-test',name:'Dock test',root:'C:\work\dock'};
async function mockApp(page:Page,starts:any[],shell:'dock'|'main'='dock'){
 await page.addInitScript(mode=>localStorage.setItem('ai-web.shell-mode',mode),shell);
 await page.route('**/api/projects',route=>route.fulfill({json:{projects:[project],defaultProject:project.id}}));
 await page.route('**/api/tree?**',route=>route.fulfill({json:{entries:[]}}));
 await page.route('**/api/changes?**',route=>route.fulfill({json:{available:false,files:[]}}));
 await page.route('**/api/account-usage?**',route=>route.fulfill({json:{providers:[]}}));
 await page.route('**/api/local-sessions',route=>route.fulfill({json:{agents:[],sessions:[]}}));
 await page.route('**/api/integrations/tools',route=>route.fulfill({json:{tools:[]}}));
 await page.routeWebSocket('**/api/terminal',socket=>socket.onMessage(raw=>{
  const message=JSON.parse(raw.toString());
  if(message.type==='start'||message.type==='attach'){starts.push(message);socket.send(JSON.stringify({type:'ready',shell:'Test shell',project:project.name,sessionId:message.sessionId,attached:message.type==='attach'}));socket.send(JSON.stringify({type:'data',data:'DOCK_SHELL_READY\r\n'}));}
 }));
 await page.goto('/');
}

// Kept in its own file: the shared fixture's per-test storage reset would otherwise also run on this test's reload.
test('the dock keeps its shells across a reload and reattaches them',async({page})=>{
 const starts:any[]=[];await mockApp(page,starts);
 await page.getByRole('button',{name:'Toggle terminal'}).click();
 await expect(page.locator('#terminal-dock .xterm-rows')).toContainText('DOCK_SHELL_READY');
  await page.reload();
 await expect(page.locator('#terminal-dock')).toBeVisible();
 await expect.poll(()=>starts.some(message=>message.type==='attach')).toBe(true);
});
