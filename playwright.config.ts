import { defineConfig } from '@playwright/test';
import path from 'node:path';

export default defineConfig({
  testDir: './test/ui',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:7327', viewport: { width: 1440, height: 950 }, headless: true, screenshot: 'only-on-failure' },
  webServer: { command: 'node --import tsx server/index.ts', url: 'http://127.0.0.1:7327', env: { PORT: '7327', AI_WEB_STATE_DIR: path.resolve('.ai-web/ui-test-state') }, reuseExistingServer: false },
});
