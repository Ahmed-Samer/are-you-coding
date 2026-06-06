# RentWebify — Codebase & UX Audit

This directory holds the rolling audit of the RentWebify product. It is the
source of truth for known defects, the production-ready fixes proposed for
them, and any SQL the operator needs to run.

## Layout

```
audit_reports/
  README.md                       ← you are here
  SQL_TO_RUN.md                   ← only present when DB changes are required
  users/
    _PAGE_MAP.md                  ← inventory of all user/merchant screens
    01-checkout-upload-proof.md   ← deep audit
    02-onboarding-wizard.md       ← deep audit
    03-storefront-home.md         ← deep audit
    fixes/                        ← production-ready replacement files,
                                    mirroring real project paths
  admin/
    _PAGE_MAP.md                  ← inventory of all admin screens (deep
                                    audits queued for the next round)
```

## How to use this round

1. Read the three deep-audit markdown files under `users/`.
2. Every Critical and High finding has a fix written into the matching file
   under `users/fixes/`. The fixes have already been applied to the live
   `src/` tree in the same change-set, so the running app already benefits.
3. There is **no SQL** required for this round; no `SQL_TO_RUN.md` is
   produced. The kill-switch SQL from the previous round remains in
   `../fixing_issues/Audit.md` for reference.
4. Admin deep dives are intentionally deferred — `admin/_PAGE_MAP.md`
   exists so the next pass has a clear queue.

## Constraints honoured

- No database column, table, enum, RLS, or storage-bucket identifier was
  renamed. All fixes are TypeScript/React only.
- No partial snippets in `fixes/` — every file is a complete, production-
  ready replacement of the project file at the same relative path.