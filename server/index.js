import { createApp } from './app.js';

const port = Number(process.env.PORT || 7317);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');
const { server, closeSessions } = await createApp({ initialRoot: process.env.AI_WEB_PROJECT || undefined, stateDir: process.env.AI_WEB_STATE_DIR || undefined });
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Set PORT to use another port.` : error.message);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => console.log(`AI Web is ready at http://localhost:${port}\nPress Ctrl+C to stop.`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { void closeSessions().finally(() => server.close(() => process.exit(0))); });
