import { defineConfig } from "@playwright/test";

/** Port used by the local Next.js server started for Playwright. */
const PLAYWRIGHT_PORT = 3000;

/** Base URL used by the Playwright browser sessions. */
const PLAYWRIGHT_BASE_URL = `http://127.0.0.1:${PLAYWRIGHT_PORT}`;

/** Shared Playwright configuration for the MVP end-to-end suite. */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  timeout: 30_000,
  use: {
    baseURL: PLAYWRIGHT_BASE_URL,
    browserName: "chromium",
    headless: true,
    trace: "on-first-retry",
  },
  webServer: {
    command: `npm run start -- --hostname 127.0.0.1 --port ${PLAYWRIGHT_PORT}`,
    env: {
      ...process.env,
      HOSTNAME: "127.0.0.1",
      OPENAI_API_KEY: "",
      PORT: String(PLAYWRIGHT_PORT),
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: PLAYWRIGHT_BASE_URL,
  },
});
