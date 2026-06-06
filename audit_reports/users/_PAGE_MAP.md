# User / Merchant Page Map

Mirrors `user-pages/USER_PAGES_INVENTORY.md` (33 distinct screens).

## Marketing / Public
1. Landing Page — `src/routes/index.tsx`
2. About — `src/routes/about.tsx`
3. Contact — `src/routes/contact.tsx`
4. Pricing — `src/routes/pricing.tsx`
5. Templates — `src/routes/templates.tsx`

## Authentication
6. Login — `src/routes/login.tsx`
7. Signup — `src/routes/signup.tsx`
8. Forgot Password — `src/routes/forgot-password.tsx`
9. Reset Password — `src/routes/reset-password.tsx`
10. Auth Callback — `src/routes/auth.callback.tsx`
11. Invite Accept — `src/routes/invite.accept.tsx`

## Public Storefront (Tenant-facing)
12. Storefront Home — `src/routes/index.tsx` (tenant-resolved) +
    `src/components/storefront/Storefront.tsx`  **[audited — 03]**
13. Product Detail Drawer — `src/components/storefront/ProductDrawer.tsx`
14. Cart Drawer — `src/components/storefront/CartDrawer.tsx`

## Tenant Onboarding Wizard
15. Onboarding — Plan
16. Onboarding — Confirm
    Both rendered by `src/routes/_authenticated/onboarding.tsx`  **[audited — 02]**

_(Wizard was collapsed from 4 steps to 2; the live wizard now only has
`plan` and `confirm` steps. The inventory keeps the historical 4-step
count for parity.)_

## Subscription Checkout Wizard — `src/routes/_authenticated/checkout.$subscriptionId.tsx`
19. Checkout — Review
20. Checkout — Bank Instructions
21. Checkout — Upload Proof   **[audited — 01]**
22. Checkout — Pending Approval

## Tenant Store Admin & Account
23. Dashboard (Store List) — `src/routes/_authenticated/dashboard.index.tsx`
24. Store Overview — `src/routes/_authenticated/store.$slug.overview.tsx`
25. Products — `src/routes/_authenticated/store.$slug.products.tsx`
26. Categories — `src/routes/_authenticated/store.$slug.categories.tsx`
27. Orders — `src/routes/_authenticated/store.$slug.orders.tsx`
28. Recovery — `src/routes/_authenticated/store.$slug.recovery.tsx`
29. Promos — `src/routes/_authenticated/store.$slug.promos.tsx`
30. Domains — `src/routes/_authenticated/store.$slug.domains.tsx`
31. Team — `src/routes/_authenticated/store.$slug.team.tsx`
32. Settings — `src/routes/_authenticated/store.$slug.settings.tsx`
33. Account Security — `src/routes/_authenticated/account.security.tsx`

---

**This round audits screens 21 (Checkout — Upload Proof), 15+16
(Onboarding wizard), and 12 (Storefront Home).** The remaining 30 user
screens are queued for future passes.