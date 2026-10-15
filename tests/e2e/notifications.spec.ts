import {test,expect,type WebSocketRoute} from '@playwright/test';

test('native notification test never uses browser permissions, reports restart requirements and stays independent of UI popups',async({page})=>{
 await page.addInitScript(()=>{Object.defineProperty(window,'Notification',{value:class{constructor(){throw Error('Browser notifications must never be used');}static get permission(){throw Error('Browser permissions must never be read');}}});});
 await page.route('**/api/account-usage?**',route=>route.fulfill({json:{providers:[]}}));await page.goto('/');
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('[data-settings-page=notifications]').click();
 await page.getByLabel('Popup notifications',{exact:true}).uncheck();await page.getByLabel('Notification sounds',{exact:true}).selectOption('off');await page.getByLabel('System notifications',{exact:true}).uncheck();
 const send=page.getByRole('button',{name:'Test notification',exact:true}),feedback=page.locator('#notification-test-feedback');
 await send.click();await expect(feedback).toContainText('Pane desktop app');await expect(page.locator('.agent-notification')).toHaveCount(0);
 await page.evaluate(()=>Reflect.set(window,'paneDesktop',{notificationVersion:0,notify(){throw Error('Legacy IPC must not be invoked');}}));await send.click();await expect(feedback).toContainText('Quit Pane from the tray');await expect(feedback).not.toContainText('browser');
 await page.evaluate(()=>{
  const state={sent:[] as unknown[],mode:'sent'};Reflect.set(window,'nativeNotificationTest',state);
  Reflect.set(window,'paneDesktop',{notificationVersion:1,onNotificationClick(){},async notify(value:unknown){state.sent.push(value);if(state.mode==='missing')throw Error("No handler registered for 'pane:notify'");if(state.mode==='error')return {status:'error',message:'Windows could not show the notification.'};return {status:'sent'};}});
 });
 await send.click();await expect(feedback).toContainText('System notification sent');expect(await page.evaluate(()=>Reflect.get(window,'nativeNotificationTest').sent)).toMatchObject([{title:'Pane · Test notification',silent:true,allowFocused:true}]);await expect(page.locator('.agent-notification')).toHaveCount(0);
 await page.evaluate(()=>Reflect.get(window,'nativeNotificationTest').mode='error');await send.click();await expect(feedback).toContainText('Windows could not show');await expect(send).toBeEnabled();
 await page.evaluate(()=>Reflect.get(window,'nativeNotificationTest').mode='missing');await send.click();await expect(feedback).toContainText('Quit Pane from the tray');await expect(feedback).not.toContainText('browser');
 await page.evaluate(()=>Reflect.deleteProperty(window,'paneDesktop'));
 await page.getByLabel('Close settings').click();await page.reload();await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('[data-settings-page=notifications]').click();await expect(page.getByLabel('System notifications',{exact:true})).not.toBeChecked();await expect(page.getByLabel('Popup notifications',{exact:true})).not.toBeChecked();await expect(page.getByLabel('Notification sounds',{exact:true})).toHaveValue('off');
});

test('background agent system notifications deduplicate and clicking opens the matching session with UI popups disabled',async({page})=>{
 const workspace={id:'notifications-project',name:'Notifications',root:'C:\\work\\notifications',branch:'main'};let socket:WebSocketRoute|undefined;
 await page.addInitScript(()=>{
  document.hasFocus=()=>false;localStorage.setItem('ai-web.notifications',JSON.stringify({popup:false,sound:false,system:true}));
 });
 await page.route('**/api/projects',route=>route.fulfill({json:{projects:[workspace],defaultProject:workspace.id}}));await page.route('**/api/tree?**',route=>route.fulfill({json:{entries:[]}}));await page.route('**/api/changes?**',route=>route.fulfill({json:{available:false,files:[]}}));await page.route('**/api/account-usage?**',route=>route.fulfill({json:{providers:[]}}));await page.route('**/api/local-sessions',route=>route.fulfill({json:{agents:[],sessions:[]}}));
 await page.routeWebSocket('**/api/terminal',connection=>connection.onMessage(raw=>{if(JSON.parse(raw.toString()).type==='start'){socket=connection;connection.send(JSON.stringify({type:'ready',shell:'Test shell'}));connection.send(JSON.stringify({type:'agent',agent:'codex'}));}}));
 await page.goto('/');await page.evaluate(()=>{
  const state={notices:[] as unknown[],click:(_id:string)=>{}};Reflect.set(window,'nativeNotificationState',state);document.documentElement.dataset.windowFocused='false';
  Reflect.set(window,'paneDesktop',{notificationVersion:1,onNotificationClick(callback:(id:string)=>void){state.click=callback;},async notify(value:unknown){state.notices.push(value);return {status:'sent'};}});
 });await page.locator('#terminal-new').click();await page.locator('[data-launch=codex]').click();await expect(page.locator('.terminal-agent-card')).toBeVisible();
 const data='\x1b[2J\x1b[H\x1b]0;action required\x07Would you like to run this command?\r\n1. Yes\r\n';
 socket!.send(JSON.stringify({type:'data',data}));await expect.poll(()=>page.evaluate(()=>Reflect.get(window,'nativeNotificationState').notices.length)).toBe(1);await expect(page.locator('.agent-notification')).toHaveCount(0);
 socket!.send(JSON.stringify({type:'data',data}));await page.waitForTimeout(250);expect(await page.evaluate(()=>Reflect.get(window,'nativeNotificationState').notices.length)).toBe(1);
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.evaluate(()=>Reflect.get(window,'nativeNotificationState').click(Reflect.get(window,'nativeNotificationState').notices[0].id));await expect(page.locator('#settings-dialog')).not.toBeVisible();await expect(page.locator('.terminal-agent-card')).toHaveClass(/selected/);
});
