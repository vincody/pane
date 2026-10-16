import {test,expect,type WebSocketRoute} from '@playwright/test';
test('in the regular web app links open in a new tab without any prompt and the Links settings stay hidden',async({page,context})=>{
 const project={id:'links-web',name:'Links web',root:'C:\work\links',branch:'main'};let socket:WebSocketRoute|undefined;
 await page.addInitScript(()=>{document.hasFocus=()=>true;});
 await context.route('http://example.com/**',route=>route.fulfill({contentType:'text/html',body:'<title>Example</title>'}));
 await page.route('**/api/projects',route=>route.fulfill({json:{projects:[project],defaultProject:project.id}}));await page.route('**/api/tree?**',route=>route.fulfill({json:{entries:[]}}));await page.route('**/api/changes?**',route=>route.fulfill({json:{available:false,files:[]}}));await page.route('**/api/account-usage?**',route=>route.fulfill({json:{providers:[]}}));await page.route('**/api/dev-servers?**',route=>route.fulfill({json:{available:true,rows:[]}}));await page.route('**/api/local-sessions',route=>route.fulfill({json:{agents:[],sessions:[]}}));
 await page.routeWebSocket('**/api/terminal',connection=>connection.onMessage(raw=>{if(JSON.parse(raw.toString()).type==='start'){socket=connection;connection.send(JSON.stringify({type:'ready',shell:'Test shell'}));}}));
 await page.goto('/');
 await page.getByRole('button',{name:'Settings',exact:true}).click();await expect(page.locator('[data-settings-page=notifications]')).toBeVisible();await expect(page.locator('[data-settings-page=links]')).toHaveCount(0);await page.getByLabel('Close settings').click();
 await page.locator('#terminal-new').click();await page.locator('[data-launch=shell]').click();await expect.poll(()=>Boolean(socket)).toBe(true);
 socket!.send(JSON.stringify({type:'data',data:'  Local:   http://localhost:5173/\r\ndocs: http://example.com/page\r\n'}));
 await expect(page.locator('.xterm-rows').filter({hasText:'example.com/page'}).first()).toBeVisible();
 await page.waitForTimeout(300);await expect(page.locator('#link-prompts')).toHaveCount(0);
 const spot=await page.evaluate(()=>{const walker=document.createTreeWalker(document.querySelector('.xterm-rows')!,NodeFilter.SHOW_TEXT);for(let node=walker.nextNode();node;node=walker.nextNode()){const text=node.textContent||'',index=text.indexOf('example.com/page');if(index>=0){const range=document.createRange();range.setStart(node,index+2);range.setEnd(node,index+8);const rect=range.getBoundingClientRect();return {x:rect.x+rect.width/2,y:rect.y+rect.height/2};}}return null;});
 expect(spot).not.toBeNull();
 await page.mouse.move(spot!.x,spot!.y);await page.mouse.move(spot!.x+1,spot!.y);
 // A plain click selects text and opens nothing; Ctrl+click opens the link.
 await page.mouse.down();await page.mouse.up();await page.waitForTimeout(300);expect(context.pages()).toHaveLength(1);
 const opened=context.waitForEvent('page');
 await page.keyboard.down('Control');await page.mouse.down();await page.mouse.up();await page.keyboard.up('Control');
 const tab=await opened;await expect.poll(()=>tab.url()).toBe('http://example.com/page');await expect(page.locator('#link-choice')).toHaveCount(0);
});
