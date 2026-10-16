import {build} from 'esbuild';
import fs from 'node:fs/promises';
await fs.mkdir('desktop-build',{recursive:true});
await build({entryPoints:['desktop/main.ts'],outfile:'desktop-build/main.mjs',bundle:true,platform:'node',format:'esm',target:'node22',packages:'external',sourcemap:true});
await fs.copyFile('desktop/preload.cjs','desktop-build/preload.cjs');
// Window, tray and installer icons are rendered from desktop/icons/pane.svg by `npm run icons:app`.
await fs.copyFile('desktop/icons/icon.png','desktop-build/icon.png');
await fs.copyFile('desktop/icons/icon.ico','desktop-build/icon.ico');
console.log('Desktop entry point, preload and icons built.');
