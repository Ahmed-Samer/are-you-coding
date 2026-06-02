import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const USE_LOCAL_SERVER = !process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./specs",
  outputDir: "./.artifacts/results",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["list"],
    ["html", { outputFolder: "./.artifacts/report", open: "never" }],
    ...(process.env.CI ? [["github"] as const] : []),
  ],
  globalTeardown: path.join(__dirname, "./fixtures/global-teardown.ts"),
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "setup",
      testDir: "./fixtures",
      testMatch: /global-setup\.ts/,
    },
    {
      name: "chromium-anon",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
    {
      name: "chromium-admin",
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.join(__dirname, "./storage/admin.json"),
      },
      dependencies: ["setup"],
    },
    {
      name: "chromium-tenant",
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.join(__dirname, "./storage/tenant-owner.json"),
      },
      dependencies: ["setup"],
    },
  ],
  webServer: USE_LOCAL_SERVER
    ? {
        command: "bun run dev",
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
});
