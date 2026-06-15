import { defineConfig, devices } from '@playwright/test';

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './frontend/e2e/tests',
  outputDir: './frontend/e2e/reports/test-results',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html', { outputFolder: './frontend/e2e/reports/html-report' }],
    ['json', { outputFile: './frontend/e2e/reports/results.json' }],
    process.env.CI ? ['github'] : ['list']
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:5173',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Take screenshot on failure */
    screenshot: 'only-on-failure',

    /* Record video on failure */
    video: 'retain-on-failure',

    /* Ignore HTTPS errors */
    ignoreHTTPSErrors: true,

    /* Enable HAR recording for network debugging */
    harRecord: process.env.RECORD_HAR ? {
      mode: 'full',
      path: './frontend/e2e/reports/network.har',
      urlFilter: '**/api/**',
      content: 'attach'
    } : undefined,
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Increase viewport height for better debugging visibility of long pages
        viewport: { width: 1280, height: 1200 },
      },
    },

    // Temporarily disabled - uncomment to test other browsers
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },

    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  webServer: [
    {
      command: 'NODE_ENV=test npm run dev:backend',
      url: 'http://localhost:3001/health',
      reuseExistingServer: !process.env.CI, // Use existing servers in dev, fresh in CI
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        NODE_ENV: 'test'
      }
    },
    {
      command: 'npm run dev:frontend',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI, // Use existing servers in dev, fresh in CI
      stdout: 'pipe',
      stderr: 'pipe',
    }
  ],

  /* Global setup and teardown */
  globalSetup: './frontend/e2e/utils/test-setup.js',
  globalTeardown: './frontend/e2e/utils/test-teardown.js',

  /* Test timeout */
  timeout: 30 * 1000,
  expect: {
    timeout: 5 * 1000
  },
});