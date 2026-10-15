import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/desktop',workers:1,timeout:60000,use:{screenshot:'only-on-failure'},reporter:'list'});
