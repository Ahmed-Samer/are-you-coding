# Screen 31 — Team Members

Stack: Supabase (DB/Auth) + Cloudflare Pages (Workers/Edge). Phase 04, screen 31 of 33. Privilege-escalation surface — role checks must be server-enforced via `has_role`, never client-trusted.

## UX & Core Features

- [ ] Header with "Invite member" CTA and seat counter ("X of Y seats used")
- [ ] Two segmented sections: Active members, Pending invites
- [ ] Active row columns: name, email, role, last active, joined date
- [ ] Pending row columns: email, role, invited by, invited at, "Resend" / "Revoke" actions
- [ ] Role-change dropdown disabled for self and for the last admin
- [ ] Remove-member confirmation modal listing owned resources (orders created by, products created by) with reassign picker
- [ ] Invite dialog: email input, role select, optional note
- [ ] Invite link copy-to-clipboard fallback when email send fails
- [ ] Empty state: "no team members yet" (only owner exists)
- [ ] Loading skeleton matching row geometry
- [ ] Error state with retry
- [ ] Toasts on invite / role change / remove / resend; inline validation errors

## Performance & Speed

Team list is small — single server fn, no pagination needed. Resend-invite has its own rate limit independent of initial-send. Avatar images served from Supabase Storage with explicit dimensions.

## Backend & Cloudflare/Supabase Compliance

RLS on `tenant_members` and `tenant_invites` — only tenant admins can read or mutate; non-admin members can read only their own row. Invite tokens are single-use, signed, and TTL-bounded; the server fn that consumes the token (Screen 11) validates the email matches the invitee. Role list is the server-side `app_role` enum — never accept arbitrary role strings from the client. **Owner role cannot be removed and last admin cannot be demoted** — enforced inside the role-change/remove server fn with an explicit count check. Seat cap read from the live subscription on every invite (not cached). Resend-invite uses an idempotency key per `(tenant_id, email, day)` to prevent flooding. Remove-member runs in a single transaction: optionally reassign owned resources, then delete the membership row. Audit log entry on invite / accept / role change / remove / revoke. Edge-safe.

## Actionable Steps

1. - [ ] Confirm RLS on `tenant_members` allows admin read/write and member self-read only
2. - [ ] Confirm RLS on `tenant_invites` allows admin read/write only
3. - [ ] Implement list server fn returning active + pending in one call
4. - [ ] Implement invite server fn that re-reads subscription seat cap and rejects over-cap
5. - [ ] Implement resend-invite server fn with idempotency key per `(tenant_id, email, day)`
6. - [ ] Implement revoke-invite server fn (admin only)
7. - [ ] Implement role-change server fn that rejects last-admin demotion and self-promotion bypass
8. - [ ] Implement remove-member server fn with reassign-owned-resources transaction
9. - [ ] Validate role values against the `app_role` enum server-side
10. - [ ] Generate single-use, signed, TTL-bounded invite tokens; validate on consume in Screen 11
11. - [ ] Add audit log entry on invite / accept / role change / remove / revoke
12. - [ ] Wire TanStack Query invalidation for `["tenant-team"]` and `["my-tenants-stats"]` on every write
13. - [ ] Add error boundary with retry
14. - [ ] Add skeleton matching row geometry
15. - [ ] Add e2e test: non-admin cannot read or mutate team
16. - [ ] Add e2e test: last admin cannot be demoted or removed
17. - [ ] Add e2e test: invite over seat cap rejected
18. - [ ] Add e2e test: expired or reused invite token rejected