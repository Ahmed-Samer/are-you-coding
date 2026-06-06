# Account-Billing Regressions — Audit & Fix

## 0. Can Lovable execute SQL directly against your Supabase?

**No** — not with your raw credentials. Pasting a service-role key or `postgres://`
URI into chat would leak it into message history, and this project is **not**
enrolled in Lovable Cloud, so there is no managed migration tool wired into the
session.

Two safe paths exist:

1. **Preferred** — enable Lovable Cloud. That activates a managed migration
   tool I can call without seeing any secret.
2. **Current path** — you run the SQL blocks below manually in the
   **Supabase SQL Editor**. I deliver them ready to copy-paste; you execute.

TypeScript changes are landed by me directly in this commit; SQL is yours to run.

---

## 1. Diagnoses

### Issue 1 — Legacy Foreign Key Crash

- `src/lib/billing-admin.functions.ts:38-68` — `insertAdjustment` writes
  `subscription_id = accountSubscriptionId` into `public.billing_adjustments`.
- Comment at line 33 confirms the column **semantics** changed (now stores an
  *account* subscription id), but the **FK** still references the legacy
  `public.subscriptions` table.
- Every code path funnels through `insertAdjustment` (`extendSubscription`,
  `applyCredit`, `compExtension`, `changePlan`, `refund`, `upgradeAccountPlan`),
  so any admin-side adjustment for an upgraded user crashes with
  `billing_adjustments_subscription_id_fkey`.
- Root cause: migration dropped `NOT NULL` but forgot to re-point the FK.

### Issue 2 — Destructive "Cancel and choose plan" (Nuke Bug)

- The server guard in `cancelPendingSubscription`
  (`src/lib/billing.functions.ts:827-849`) checks
  `status IN ('pending_payment','pending_review')` only **after** loading the
  row, and it sources the row by the **id passed by the caller** — so a
  buggy/stale id from the UI can still hit the wrong row.
- Call sites pass the wrong id:
  - `src/routes/_authenticated/onboarding.tsx:184` uses
    `accountSub.id` from `getMyAccountSubscription`, which returns the **latest**
    subscription regardless of status. Under a race (upgrade
    just-created a new pending row, query still cached), the id can resolve to
    the active subscription.
  - `src/routes/_authenticated/dashboard.index.tsx:347` and
    `src/routes/_authenticated/checkout.$subscriptionId.tsx:504` likewise have
    no guarantee they're targeting a pending row.
- Compound risk: there is **no per-user invariant** preventing two non-terminal
  `account_subscriptions` from coexisting, so the UI cannot deterministically
  identify "the pending one".
- The damage on a wrong id: the active subscription flips to `cancelled`,
  taking tenants with it (once the kill-switch lands — see Issue 3).

### Issue 3 — Missing Kill-Switch

- No code path propagates `account_subscriptions.status → cancelled / expired`
  to owned `tenants`. Cancelled accounts keep serving storefronts.
- Needs a deterministic, idempotent DB trigger plus an admin-callable server fn
  for manual recovery / historical backfill.

---

## 2. Raw SQL — run in Supabase SQL Editor

Run each block top-to-bottom. All statements are idempotent and safe to re-run.

### 2.0 — Tenants kill-switch columns (only if missing)

```sql
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS suspended_at      timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_reason  text;
```

### 2.1 — Fix Issue 1: re-point the FK

```sql
ALTER TABLE public.billing_adjustments
  DROP CONSTRAINT IF EXISTS billing_adjustments_subscription_id_fkey;

ALTER TABLE public.billing_adjustments
  ADD  CONSTRAINT billing_adjustments_subscription_id_fkey
  FOREIGN KEY (subscription_id)
  REFERENCES public.account_subscriptions(id)
  ON DELETE SET NULL;
```

### 2.2 — Fix Issue 2: enforce one pending sub per user

```sql
CREATE UNIQUE INDEX IF NOT EXISTS account_subscriptions_one_pending_per_user
  ON public.account_subscriptions (user_id)
  WHERE status IN ('pending_payment','pending_review');
```

### 2.3 — Fix Issue 3: kill-switch trigger

```sql
CREATE OR REPLACE FUNCTION public.suspend_account_tenants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only react to a transition INTO a terminal state.
  IF NEW.status IN ('cancelled','expired')
     AND (OLD.status IS DISTINCT FROM NEW.status)
     AND NOT EXISTS (
       SELECT 1
         FROM public.account_subscriptions s
        WHERE s.user_id = NEW.user_id
          AND s.id     <> NEW.id
          AND s.status  = 'active'
     )
  THEN
    UPDATE public.tenants
       SET status            = 'suspended',
           suspended_at      = now(),
           suspended_reason  = 'account_subscription_' || NEW.status
     WHERE owner_id = NEW.user_id
       AND status   = 'active';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_suspend_account_tenants
  ON public.account_subscriptions;

CREATE TRIGGER trg_suspend_account_tenants
  AFTER UPDATE OF status ON public.account_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.suspend_account_tenants();
```

---

## 3. TypeScript changes landed in this commit

| File | Change |
|---|---|
| `src/lib/billing.functions.ts` | **Hardened** `cancelPendingSubscription`: status filter moved into the UPDATE's WHERE clause (atomic), returns `{ ok, cancelled }`, throws if 0 rows affected. **Added** `getMyPendingSubscription` returning only `pending_payment`/`pending_review` rows. **Added** `suspendAccountTenants` server fn for manual recovery (mirrors trigger). |
| `src/lib/billing-admin.functions.ts` | `insertAdjustment` now pre-validates the supplied `accountSubscriptionId` exists in `account_subscriptions` — fails fast with a readable error instead of an opaque FK explosion. |
| `src/lib/admin.functions.ts` | New `runKillSwitchBackfill` admin fn: scans cancelled/expired account subs and suspends their orphaned active tenants. |
| `src/routes/_authenticated/onboarding.tsx` | Cancel button now sources id from `getMyPendingSubscription`; never trusts `accountSub.id`. |
| `src/routes/_authenticated/dashboard.index.tsx` | Same: cancel mutation uses pending-only id from `getMyPendingSubscription`. |
| `src/routes/_authenticated/checkout.$subscriptionId.tsx` | Pre-cancel client assert that the route subscription is actually pending; clear error otherwise. |

The DB trigger handles the automatic kill-switch on `cancelled`/`expired`.
`suspendAccountTenants` + `runKillSwitchBackfill` are the manual escape hatches
for already-dead accounts.

---

## 4. Smoke tests after SQL runs

1. **Issue 1** — Trigger an admin extension/refund/upgrade on an existing
   user. `billing_adjustments` row inserts without FK error.
2. **Issue 2** — As a user with an active subscription, start an upgrade →
   click "Cancel and choose plan" in onboarding. Active subscription remains
   `active`; pending row flips to `cancelled`. Verify via:
   ```sql
   SELECT id, status, created_at
     FROM account_subscriptions
    WHERE user_id = '<uid>'
    ORDER BY created_at DESC;
   ```
3. **Issue 3** — Manually flip an `active` account subscription to
   `cancelled`. All owned `tenants` flip to `suspended` with `suspended_reason
   = 'account_subscription_cancelled'`.
4. **Backfill** — From the admin dashboard, call `runKillSwitchBackfill`
   once to suspend historically orphaned tenants.

---

## 5. Rollback notes

- Section 2.1 — to revert, restore the original FK target. Keep a snapshot of
  the live FK definition before running.
- Section 2.2 — `DROP INDEX IF EXISTS account_subscriptions_one_pending_per_user;`
- Section 2.3 — `DROP TRIGGER IF EXISTS trg_suspend_account_tenants ON public.account_subscriptions;`
  then `DROP FUNCTION IF EXISTS public.suspend_account_tenants();`
