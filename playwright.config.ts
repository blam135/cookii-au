import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  webServer:
    process.env.PLAYWRIGHT_START_SERVER === 'true'
      ? {
          command:
            'python3 -m http.server 3000 --bind 127.0.0.1 --directory out',
          url: 'http://127.0.0.1:3000',
          reuseExistingServer: !process.env.CI,
          timeout: 10000,
        }
      : undefined,
  projects: [
    {
      name: 'regression',
      testMatch: '**/*.test.mjs',
      // Node regression tests do not launch browsers or require browser downloads.
      workers: 1,
    },
    {
      name: 'chromium',
      testMatch: '**/*.e2e.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
        trace: 'retain-on-failure',
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
          : undefined,
      },
    },
  ],
});
