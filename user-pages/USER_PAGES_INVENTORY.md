# User Pages Inventory

A complete inventory of every screen, view, and distinct state that a standard user/tenant (non-admin) can land on. Multi-step wizard views are counted as separate screens.

> Stack: Supabase (DB/Auth/backend logic) · Deployed on Cloudflare Pages.

## Marketing / Public

1. **Landing Page** — Public homepage shown on the platform root domain with hero, features, and calls to action.
2. **About** — Company/product information page.
3. **Contact** — Contact form and details page.
4. **Pricing** — Subscription plan comparison and pricing page.
5. **Templates** — Gallery of available storefront templates a tenant can preview.

## Authentication

6. **Login** — Email/password and Google sign-in screen.
7. **Signup** — New account registration screen.
8. **Forgot Password** — Request a password reset email.
9. **Reset Password** — Set a new password from the reset link.
10. **Auth Callback** — Transient processing screen that finalizes OAuth/email sign-in and redirects.
11. **Invite Accept** — Accept a team invitation and join a tenant store.

## Public Storefront (Tenant-facing sites)

12. **Storefront Home** — Public tenant store with the browsable product grid.
13. **Product Detail Drawer** — Slide-over view of a single product with images, variants, and add-to-cart.
14. **Cart Drawer** — Slide-over cart summary and WhatsApp checkout handoff.

## Tenant Onboarding Wizard

15. **Onboarding — Basics** — Step 1: store name, slug, and core details.
16. **Onboarding — Template** — Step 2: choose a storefront template.
17. **Onboarding — Plan** — Step 3: select a subscription plan.
18. **Onboarding — Confirm** — Step 4: review and create the store.

## Subscription Checkout Wizard

19. **Checkout — Review** — Step 1: review the selected subscription before paying.
20. **Checkout — Bank Instructions** — Step 2: bank transfer / payment instructions.
21. **Checkout — Upload Proof** — Step 3: upload proof of payment.
22. **Checkout — Pending Approval** — Step 4: awaiting admin verification state.

## Tenant Store Admin & Account

23. **Dashboard (Store List)** — Lists the tenant's stores and entry point to manage each.
24. **Store Overview** — Per-store KPIs and summary dashboard.
25. **Products** — Manage store products, galleries, variants, and CSV import.
26. **Categories** — Manage product categories.
27. **Orders** — View and manage store orders.
28. **Recovery** — Abandoned-cart recovery stats, settings, and WhatsApp follow-ups.
29. **Promos** — Create and manage promotional codes/discounts.
30. **Domains** — Connect and verify custom domains for the store.
31. **Team** — Invite and manage store team members.
32. **Settings** — Store branding, SEO, currency, and configuration.
33. **Account Security** — Manage personal account password and security settings.

---

**Total distinct user-facing screens/states: 33** (including 4 onboarding wizard steps and 4 checkout wizard steps counted separately).
