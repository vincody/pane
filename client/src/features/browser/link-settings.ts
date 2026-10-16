import type {LinkPreferenceStore,LinkTarget} from './link-preferences.ts';
/** Adds the link rows to the settings dialog (setupSettings later moves them into the Links page). */
export function setupLinkSettings(preferences:LinkPreferenceStore){
 const container=document.createElement('div');container.id='link-settings';
 container.innerHTML=`<div class="setting-row"><div><strong>Open links</strong><small>Where web links open. Ctrl+click (Cmd+click on Mac) links in the terminal and the Markdown editor.</small></div><select aria-label="Open links"><option value="ask">Ask every time</option><option value="app">In Pane</option><option value="system">In system browser</option></select></div><div class="setting-row"><div><strong>Detect local servers</strong><small>Offer to open a server when its address appears in terminal output.</small></div><input type="checkbox" aria-label="Detect local servers"></div>`;
 const select=container.querySelector('select')!,detect=container.querySelector<HTMLInputElement>('input')!;
 const sync=()=>{const value=preferences.get();select.value=value.open;detect.checked=value.detect;};
 select.onchange=()=>preferences.set({open:select.value as LinkTarget});
 detect.onchange=()=>preferences.set({detect:detect.checked});
 preferences.subscribe(sync);sync();
 document.querySelector('.settings-footnote')!.before(container);
}
