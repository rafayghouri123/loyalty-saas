import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: 'http://127.0.0.1:3100', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run build && npm run start -- --port 3100', url: 'http://127.0.0.1:3100', reuseExistingServer: false, timeout: 180_000,
    env: { APP_ENV:'test', PRODUCT_NAME:'', NEXT_PUBLIC_SUPABASE_URL:'', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'' },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 360, height: 800 } } },
  ],
});
