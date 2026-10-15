import {defineConfig} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
export default defineConfig({testDir:path.join(root,'tests/desktop'),outputDir:path.join(root,'test-results'),workers:1,timeout:60000,use:{screenshot:'only-on-failure'},reporter:'list'});
