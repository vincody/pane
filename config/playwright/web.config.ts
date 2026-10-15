import { defineConfig } from '@playwright/test';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));

export default defineConfig({
  testDir: path.join(root,'tests/e2e'),
  outputDir: path.join(root,'test-results'),
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:7327', viewport: { width: 1440, height: 950 }, headless: true, screenshot: 'only-on-failure' },
  webServer: { command: 'node --import tsx server/src/index.ts', cwd:root, url: 'http://127.0.0.1:7327', env: { PORT: '7327', AI_WEB_STATE_DIR: path.join(root,'.ai-web/ui-test-state') }, reuseExistingServer: false },
});
