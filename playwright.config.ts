import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'retain-on-failure' },
});
