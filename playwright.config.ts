import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  reporter: "line",
  use: { baseURL: "http://127.0.0.1:8080", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium", viewport: { width: 390, height: 844 } } }
  ],
  webServer: {
    command: "npm run build && PORT=8080 STATIC_DIR=dist cargo run",
    url: "http://127.0.0.1:8080/health",
    reuseExistingServer: true,
    timeout: 120_000
  }
});
