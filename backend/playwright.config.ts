import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  projects: [{ name: 'regression', testMatch: '**/*.test.mjs', workers: 1 }],
});
