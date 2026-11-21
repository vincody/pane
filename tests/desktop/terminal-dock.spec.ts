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

test('the terminal dock is hidden by default and opens a plain shell from its button',async({page})=>{
 const starts:any[]=[];await mockApp(page,starts);
 const dock=page.locator('#terminal-dock'),toggle=page.getByRole('button',{name:'Toggle terminal'});
 await expect(dock).toBeHidden();
 await toggle.click();
 await expect(dock).toBeVisible();await expect(toggle).toHaveAttribute('aria-pressed','true');
 await expect(dock.getByRole('tab',{name:/Terminal 1/})).toBeVisible();
 await expect(dock.locator('.xterm-rows')).toContainText('DOCK_SHELL_READY');
 expect(starts[0]).toMatchObject({type:'start',project:project.id,detachable:true});
 await page.keyboard.press('Control+`');await expect(dock).toBeHidden();
 await page.keyboard.press('Control+`');await expect(dock).toBeVisible();
 await expect(dock.getByRole('tab')).toHaveCount(1);
});

test('choosing Terminal in the launcher opens the dock instead of the main area, and tabs can be added and closed',async({page})=>{
 const starts:any[]=[];await mockApp(page,starts);
 await page.locator('#terminal-new').click();await page.locator('[data-launch=shell]').click();
 const dock=page.locator('#terminal-dock');await expect(dock).toBeVisible();
 await expect(page.locator('#terminal-panel')).toBeHidden();
 await dock.getByRole('button',{name:'New terminal'}).click();
 await expect(dock.getByRole('tab')).toHaveCount(2);
 await dock.getByRole('button',{name:'Close Terminal 2'}).click();
 await expect(dock.getByRole('tab')).toHaveCount(1);
 await dock.getByRole('button',{name:'Hide terminal'}).click();await expect(dock).toBeHidden();
});

test('Settings can keep the original terminal forms for Claude and for shells',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('ai-web.claude-mode','terminal'));
 const starts:any[]=[];await mockApp(page,starts,'main');
 await page.locator('#terminal-new').click();await page.locator('[data-launch=claude]').click();
 await expect(page.locator('#terminal-panel')).toBeVisible();
 await expect(page.locator('.chat-pane')).toHaveCount(0);
 await page.locator('#terminal-new').click();await page.locator('[data-launch=shell]').click();
 await expect(page.locator('#terminal-dock')).toBeHidden();
 await expect(page.locator('#terminal-panel .xterm')).toHaveCount(2);
 // The choices are listed in Settings.
 await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByRole('dialog',{name:'Settings',exact:true}).getByRole('button',{name:'Terminal',exact:true}).click();
 await expect(page.getByLabel('New terminal opens in')).toHaveValue('main');
 await page.getByRole('dialog',{name:'Settings',exact:true}).getByRole('button',{name:'Chat',exact:true}).click();
 await expect(page.getByLabel('Use native chat')).not.toBeChecked();
});

test('the terminal can be maximized over the workspace and restored to its slot',async({page})=>{
 const starts:any[]=[];await mockApp(page,starts);
 await page.getByRole('button',{name:'Toggle terminal'}).click();
 const dock=page.locator('#terminal-dock');await expect(dock).toBeVisible();
 const before=(await dock.boundingBox())!,view={width:await page.evaluate(()=>innerWidth)};
 await dock.getByRole('button',{name:'Maximize terminal'}).click();
 await expect(dock).toHaveClass(/maximized/);
 const full=(await dock.boundingBox())!;
 const main=(await page.locator('main').boundingBox())!,side=(await page.locator('.sidebar').boundingBox())!;
 expect(view.width).toBeGreaterThan(0);
 expect(Math.abs(full.x-main.x)).toBeLessThan(2);expect(Math.abs(full.width-main.width)).toBeLessThan(2);expect(full.x).toBeGreaterThanOrEqual(side.x+side.width-1);
 expect(full.y).toBeGreaterThanOrEqual(main.y-1);expect(Math.abs(full.y+full.height-main.y-main.height)).toBeLessThan(2);
 await expect(dock.locator('.xterm-rows')).toBeVisible();
 await dock.getByRole('button',{name:'Restore terminal'}).click();
 await expect(dock).not.toHaveClass(/maximized/);
 const after=(await dock.boundingBox())!;
 expect(Math.round(after.x)).toBe(Math.round(before.x));expect(Math.round(after.width)).toBe(Math.round(before.width));
 await dock.getByRole('button',{name:'Maximize terminal'}).click();
 await dock.getByRole('button',{name:'Hide terminal'}).click();
 await page.getByRole('button',{name:'Toggle terminal'}).click();
 await expect(dock).not.toHaveClass(/maximized/);
});

test('with many terminals the tabs shrink, scroll sideways, and keep the active one in view',async({page})=>{
 const starts:any[]=[];await mockApp(page,starts);
 await page.getByRole('button',{name:'Toggle terminal'}).click();
 const dock=page.locator('#terminal-dock');await expect(dock).toBeVisible();
 for(let i=0;i<7;i++)await dock.getByRole('button',{name:'New terminal'}).click();
 await expect(dock.getByRole('tab')).toHaveCount(8);
 const inside=async(selector:string)=>page.evaluate(sel=>{const row=document.querySelector('#terminal-dock .dock-tabs')!.getBoundingClientRect(),node=document.querySelector(sel)!.getBoundingClientRect();return node.left>=row.left-1&&node.right<=row.right+1;},selector);
 await expect.poll(()=>inside('#terminal-dock [role=tab][aria-selected=true]')).toBe(true);
 const buttons=await dock.getByRole('button',{name:'Hide terminal'}).boundingBox(),head=await dock.locator('.dock-head').boundingBox();
 expect(buttons!.x+buttons!.width).toBeLessThanOrEqual(head!.x+head!.width+1);
 await dock.getByRole('tab').first().click();
 await expect.poll(()=>inside('#terminal-dock [role=tab][aria-selected=true]')).toBe(true);
 await page.screenshot({path:'tmp-tabs.png',clip:{x:head!.x,y:head!.y,width:head!.width,height:head!.height}});
});

test('the dock sits below the chat by default, spans its width, and can move to the right from Settings',async({page})=>{
 await mockApp(page,[]);
 const dock=page.locator('#terminal-dock');
 await page.getByRole('button',{name:'Toggle terminal'}).click();await expect(dock).toBeVisible();
 await expect(dock).toHaveAttribute('data-position','bottom');
 const below=async()=>{const [d,w]=await Promise.all([dock.boundingBox(),page.locator('#workspace').boundingBox()]);return {d:d!,w:w!};};
 let {d,w}=await below();
 expect(d.y).toBeGreaterThanOrEqual(w.y+w.height-2);expect(d.width).toBeGreaterThan(w.width-4);
 await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByRole('dialog',{name:'Settings',exact:true}).getByRole('button',{name:'Chat',exact:true}).click();
 await page.getByLabel('Terminal dock position').selectOption('right');
 await expect(dock).toHaveAttribute('data-position','right');
 ({d,w}=await below());expect(d.x).toBeGreaterThanOrEqual(w.x+w.width-2);
});
