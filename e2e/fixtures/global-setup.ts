import { chromium, expect, test as setup } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { hydrateContextWithSession, signInProgrammatic } from "./auth";
import { RUN_ID } from "./run-id";

const STORAGE_DIR = path.join(__dirname, "../storage");

setup("authenticate admin and prepare run", async () => {
  await fs.mkdir(STORAGE_DIR, { recursive: true });

  const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
  const adminEmail = process.env.E2E_ADMIN_EMAIL;
  const adminPassword = process.env.E2E_ADMIN_PASSWORD;

  expect(adminEmail, "E2E_ADMIN_EMAIL must be set").toBeTruthy();
  expect(adminPassword, "E2E_ADMIN_PASSWORD must be set").toBeTruthy();

  const session = await signInProgrammatic(adminEmail!, adminPassword!);

  const browser = await chromium.launch();
  const context = await browser.newContext();
  await hydrateContextWithSession(context, baseURL, session);
  await context.storageState({ path: path.join(STORAGE_DIR, "admin.json") });
  await context.close();
  await browser.close();

  // Tenant-owner storage is created on demand by specs that sign up a fresh owner.
  // Write an empty state so the project config can reference it without erroring.
  const tenantPath = path.join(STORAGE_DIR, "tenant-owner.json");
  try {
    await fs.access(tenantPath);
  } catch {
    await fs.writeFile(tenantPath, JSON.stringify({ cookies: [], origins: [] }));
  }

  console.log(`[e2e] RUN_ID=${RUN_ID}`);
});
