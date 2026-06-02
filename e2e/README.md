# E2E — Playwright

Smoke suite for critical user flows. Targets either a local `bun run dev` server
or a deployed preview URL via `E2E_BASE_URL`.

## Setup

```bash
cp e2e/.env.example e2e/.env   # fill in values, then export them or use dotenv
bun add -d @playwright/test
bun run e2e:install            # installs Chromium
```

Required env (CI reads these from GitHub Actions secrets):

| Var                          | Purpose                                              |
| ---------------------------- | ---------------------------------------------------- |
| `E2E_BASE_URL`               | App URL. Omit to spin up `bun run dev` automatically |
| `SUPABASE_URL`               | Used by fixtures + teardown                          |
| `SUPABASE_PUBLISHABLE_KEY`   | Programmatic anon sign-in                            |
| `SUPABASE_SERVICE_ROLE_KEY`  | Teardown + signup email confirmation                 |
| `E2E_ADMIN_EMAIL` / `_PASSWORD` | Pre-seeded admin (see `docs/seed_admin.sql`)      |
| `E2E_RUN_ID` (optional)      | Override the per-run isolation prefix                |

## Data isolation

Every fixture row created by a run is tagged with `RUN_ID`
(`e2e-<random>-<timestamp>`). `global-teardown.ts` deletes rows matching
`RUN_ID%` across `tenants`, `products`, `categories`, `payment_proofs`,
`subscriptions`, `orders` at the end of the run. Standing accounts (admin)
are reused, never deleted.

## Scripts

```bash
bun run e2e            # headless run
bun run e2e:ui         # Playwright UI mode
bun run e2e:install    # install browsers
```
