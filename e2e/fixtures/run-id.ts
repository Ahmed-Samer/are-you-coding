import { randomBytes } from "node:crypto";

// Single RUN_ID per process. All fixtures, seeds, and teardown use this prefix
// to keep rows created by this test run isolated and safe to delete.
export const RUN_ID =
  process.env.E2E_RUN_ID ??
  `e2e-${randomBytes(4).toString("hex")}-${Date.now().toString(36)}`;

export const RUN_PREFIX = RUN_ID;

export function tag(name: string): string {
  return `${RUN_PREFIX}-${name}`;
}
