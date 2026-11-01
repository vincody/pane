// Dev loop: rebuild the client on every save while Electron runs. Reload the window (Ctrl+R) to pick it up;
// changes to server/ or desktop/ still need a restart.
import {spawn, spawnSync} from 'node:child_process';
const sh = {shell: true, stdio: 'inherit'};
for (const step of ['npm run native:build', 'node scripts/build-desktop.mjs']) if (spawnSync(step, sh).status) process.exit(1);
const watcher = spawn('npx vite build --watch', sh);
const app = spawn('npx electron .', sh);
const stop = () => { watcher.kill(); process.exit(); };
app.on('exit', stop); process.on('SIGINT', stop);
