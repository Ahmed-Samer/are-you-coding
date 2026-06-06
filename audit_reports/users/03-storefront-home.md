# Audit 03 — Storefront Home

## Scope

- Component: `src/components/storefront/Storefront.tsx` (342 lines)
- Cart context: `src/lib/cart.tsx` (196 lines) +
  `src/lib/cart-session.ts` (35 lines)
- Sync hook: `src/lib/use-abandoned-cart-sync.ts` (96 lines)
- Drawers: `ProductDrawer`, `CartDrawer` (lazy-loaded)
- Server fns: `getStorefront`, `getRecoveredCart`, `syncAbandonedCart`

The storefront is the public revenue surface and is exposed without
authentication. It drives SEO (loader-fed head() in `__root.tsx`),
deep-linkable product/cart drawers (`?product=`, `?cart=open`,
`?recover=`), and the abandoned-cart pipeline. Hardest user-facing
surface to QA manually.

## Edge cases exercised

- Safari private browsing — `localStorage.setItem` throws
  `QuotaExceededError` on any write
- `crypto.randomUUID` unavailable (old iOS Safari)
- `?recover=<token>` with mismatched tenant (must reject, must strip)
- `?recover=<token>` with expired token (must show toast, must strip)
- Cart mutation immediately after recovery hydration (must not race the
  hydrator)
- Two open tabs of the same storefront mutating the cart
- Tab without `crypto.subtle` (very old browsers — out of support)
- Search query with regex meta-characters
- Cyrillic / RTL product names (sort/locale)
- Empty `featured_ids` array vs missing `theme.featured_ids`
- `accent` containing CSS-injection patterns (set via React style prop —
  safe)

## Findings

### Critical

#### C-01 — `localStorage.setItem` write loop is not guarded; Safari private mode crashes the storefront

- **Symptom:** `cart.tsx` line 128 writes the entire cart blob on every
  `items` change with no try/catch:

  ```tsx
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(storageKey, JSON.stringify(items));
  }, [items, storageKey]);
  ```

  In Safari/iOS private mode, `setItem` throws `QuotaExceededError` on
  the **first** write (private mode quota is 0). React 18 surfaces the
  exception out of the effect and the storefront component crashes —
  the entire public store goes blank for that shopper.
- **Root cause:** the read at line 95 is wrapped in try/catch but the
  write at line 128 is not. Same gap applies to the `getCartSessionId`
  fallback (which is correctly guarded — that one is fine).
- **Impact:** the storefront is unusable in Safari private browsing.
  This is a high-traffic mobile audience in Egypt; the conversion hit
  is measurable.
- **Fix:** wrap the write in `try/catch` (matches the read guard) and
  silently degrade to in-memory state. Items still survive within a
  session; they just don't persist across reloads — which is the
  correct behaviour for private mode.
- **Verification:** open the storefront in a Safari Private window, add
  items to cart, reload — store renders, cart is empty after reload
  (as expected). No console error.

#### C-02 — Doc comment in `cart.tsx` references the wrong storage key

- **Symptom:** the file header says "persists to `localStorage` under
  `cart-session:<tid>`" but `cart-session.ts` actually uses the prefix
  `cart:session:` (note the second colon). The runtime code is fine —
  both the writer in `cart-session.ts` and the isolation guard in
  `cart.tsx` use `cart:session:`. The risk is purely that a future fix
  written against the doc will read the wrong key and break tenant
  isolation.
- **Fix:** correct the comment so it matches the implementation.
- **Verification:** `rg "cart-session:" src` returns no hits other than
  this audit doc; `rg "cart:session:" src` returns the two intended
  call sites.

### High

#### H-01 — `useAbandonedCartSync` dependency array contains both `cart` and its sliced fields

- **Symptom:** `use-abandoned-cart-sync.ts` deps include
  `cart.sessionId`, `cart.items`, `cart.subtotalCents`,
  `cart.recoveryCartId` **and** the whole `cart` object. `cart` is a
  freshly memoized object on every mutation (its `useMemo` depends on
  `items`), so including it as a dep is harmless but redundant — and
  it tricks the React linter into thinking the effect is exhaustive
  when in fact `cart.adoptSessionId` / `cart.setRecoveryCartId`
  reference identity is what was actually being guarded.
- **Fix:** drop the bare `cart` dep, keep the destructured fields.
  Also drop the trailing eslint-disable on consumers of this hook
  (none in this file currently).
- **Verification:** ESLint exhaustive-deps clean; cart mutations still
  trigger a single debounced sync.

### Medium

#### M-01 — `productImages` and `categories` typed as `any[]`

- The `getStorefront` server fn already returns typed rows. Tightening
  the types here would catch a future schema drift at compile time.
  Out of scope for the bug-fix round; flagged.

#### M-02 — Filter `Set` rebuilt on every filter recomputation

- The descendant-set computation for `activeCat` walks the entire
  category list on every keystroke in the search box. Negligible for
  the current catalog sizes; flag for the storefront-perf epic.

### Low

- `customDomain` regex is permissive enough; consider centralising the
  "is-lovable-host" check.
- The 5-minute `staleTime` on the storefront query is deliberate;
  documented inline.

## Fix manifest

- `users/fixes/src/lib/cart.tsx`
- `users/fixes/src/lib/use-abandoned-cart-sync.ts`

## SQL

None required.