/**
 * Cart Drawer — 4 stages: cart → checkout → review → confirmation.
 *
 * TOTAL-MATH RULE: client-side subtotal/discount/total are PREVIEW ONLY.
 * The figures actually sent to WhatsApp and persisted as the order are
 * always the server's canonical values:
 *   - `validateCartLines` re-resolves price + stock for every line before
 *     the user advances to the checkout stage, and again before review.
 *   - `createOrder` returns the canonical `subtotalCents`, `discountCents`,
 *     `promoCode`, and `currency`; those are what the WhatsApp message and
 *     the persistent confirmation screen use.
 *
 * URL STATE: opened via `?cart=open` (validated in `/` route searchSchema).
 * Closing the drawer strips the param. Browser back closes the drawer.
 */
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { isValidPhoneNumber, parsePhoneNumberFromString } from "libphonenumber-js";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowRight, Check, Copy, Minus, Phone, Plus, ShoppingBag, Trash2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useCart, formatPrice } from "@/lib/cart";
import { createOrder, validatePromo } from "@/lib/catalog.functions";
import { validateCartLines } from "@/lib/cart.functions";
import { attachCartContact } from "@/lib/abandoned-carts.functions";
import type { Availability } from "@/lib/availability";

const DELIVERY_AREAS: { id: string; name: string; feeCents: number }[] = [
  { id: "pickup", name: "Store pickup", feeCents: 0 },
  { id: "zone1", name: "Nearby (≤5km)", feeCents: 3000 },
  { id: "zone2", name: "City (5–15km)", feeCents: 5000 },
  { id: "zone3", name: "Outer (>15km)", feeCents: 8000 },
];

const checkoutSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(100),
  phone: z
    .string()
    .trim()
    .min(1, "Phone is required")
    .refine((v) => isValidPhoneNumber(v), "Enter a valid phone number with country code"),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  deliveryArea: z.string().min(1),
});
type CheckoutValues = z.infer<typeof checkoutSchema>;

type ConfirmationState = {
  orderId: string;
  shortId: string;
  subtotalCents: number;
  discountCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  currency: string;
  message: string;
  whatsappUrl: string | null;
  whatsappPhone: string | null;
  popupBlocked: boolean;
};

function lastOrderKey(tenantId: string) {
  return `cart:${tenantId}:lastOrder`;
}

export function CartDrawer({
  open,
  onOpenChange,
  tenantId,
  tenantName,
  currency,
  accent,
  tenantWhatsapp,
  availability,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tenantId: string;
  tenantName: string;
  currency: string;
  accent: string | null;
  tenantWhatsapp: string | null;
  availability?: Availability;
}) {
  const cart = useCart();
  const handleIncrement = useCallback((lineKey: string, qty: number) => cart.setQty(lineKey, qty + 1), [cart]);
  const handleDecrement = useCallback((lineKey: string, qty: number) => cart.setQty(lineKey, qty - 1), [cart]);
  const handleRemove = useCallback((lineKey: string) => cart.remove(lineKey), [cart]);
  const [stage, setStage] = useState<"cart" | "checkout" | "review" | "confirmation">("cart");
  const [confirmSend, setConfirmSend] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<{ code: string; discountCents: number } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoChecking, setPromoChecking] = useState(false);
  const [recoveryConsent, setRecoveryConsent] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [validationNotice, setValidationNotice] = useState<string | null>(null);

  // Rehydrate persistent confirmation across drawer reopens within a session.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(lastOrderKey(tenantId));
      if (raw) {
        const parsed = JSON.parse(raw) as ConfirmationState;
        setConfirmation(parsed);
        if (open) setStage("confirmation");
      }
    } catch { /* noop */ }
    // Run once per drawer-open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tenantId]);

  const form = useForm<CheckoutValues>({
    resolver: zodResolver(checkoutSchema),
    mode: "onBlur",
    defaultValues: { name: "", phone: "", address: "", notes: "", deliveryArea: "pickup" },
  });

  const { register, handleSubmit, formState, watch, setValue, getValues } = form;
  const deliveryArea = watch("deliveryArea");
  const deliveryFee = DELIVERY_AREAS.find((a) => a.id === deliveryArea)?.feeCents ?? 0;
  const discountCents = promo
    ? Math.min(promo.discountCents, cart.subtotalCents)
    : 0;
  // Client preview only — see file header.
  const totalCents = Math.max(0, cart.subtotalCents - discountCents) + deliveryFee;

  const validate = useServerFn(validatePromo);
  async function applyPromo() {
    const code = promoInput.trim();
    if (!code) return;
    setPromoChecking(true);
    setPromoError(null);
    try {
      const res = await validate({ data: { tenantId, code, subtotalCents: cart.subtotalCents } });
      if (res.ok) {
        setPromo({ code: res.code, discountCents: res.discountCents });
        setPromoError(null);
        toast.success(`Promo "${res.code}" applied`);
      } else {
        setPromo(null);
        setPromoError(res.reason);
      }
    } catch (e: any) {
      setPromo(null);
      setPromoError(e?.message ?? "Could not validate code");
    } finally {
      setPromoChecking(false);
    }
  }
  function clearPromo() {
    setPromo(null);
    setPromoInput("");
    setPromoError(null);
  }

  // -------- Server-authoritative cart validation --------
  const validateLines = useServerFn(validateCartLines);
  const validateMut = useMutation({
    mutationFn: () =>
      validateLines({
        data: {
          tenantId,
          lines: cart.items.map((i) => ({
            productId: i.productId,
            variantId: i.variantId,
            quantity: i.quantity,
          })),
        },
      }),
  });

  /**
   * Re-resolve every cart line against the server. If anything changed
   * (price, stock, availability), the local cart is corrected, the user is
   * told what happened via toast + an in-drawer `aria-live` notice, and we
   * return `false` so the caller keeps the user on the current stage.
   */
  async function revalidateOrAbort(): Promise<boolean> {
    if (cart.items.length === 0) return false;
    let res: Awaited<ReturnType<typeof validateLines>>;
    try {
      res = await validateMut.mutateAsync();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not verify your cart. Please try again.");
      return false;
    }
    if (res.valid) {
      setValidationNotice(null);
      return true;
    }

    // Apply server corrections + remove dead lines.
    const summaries: string[] = [];
    for (const issue of res.issues) {
      switch (issue.code) {
        case "product_missing":
        case "variant_missing":
        case "out_of_stock":
          cart.remove(issue.lineKey);
          summaries.push(issue.message);
          break;
        case "stock_reduced":
          cart.setQty(issue.lineKey, issue.availableQuantity);
          summaries.push(issue.message);
          break;
        case "price_changed":
          summaries.push(issue.message);
          break;
      }
    }
    // Replace cached prices/imageUrls with server-authoritative values for
    // surviving lines (no-op for lines we already removed above).
    const survivingKeys = new Set(res.items.map((i) => i.lineKey));
    const next = cart.items
      .filter((it) => survivingKeys.has(it.lineKey))
      .map((it) => {
        const fresh = res.items.find((r) => r.lineKey === it.lineKey);
        if (!fresh) return it;
        return {
          ...it,
          name: fresh.name,
          priceCents: fresh.priceCents,
          imageUrl: fresh.imageUrl ?? it.imageUrl,
          quantity: fresh.quantity,
        };
      });
    if (next.length !== cart.items.length || next.some((n, idx) => n !== cart.items[idx])) {
      cart.replaceItems(next);
    }

    const notice = summaries.join(" · ");
    setValidationNotice(notice || "Your cart was updated by the store. Please review.");
    toast.error("Your cart was updated. Please review.");
    return false;
  }

  // -------- Abandoned-cart contact attach (consent-gated) --------
  const attachContact = useServerFn(attachCartContact);
  const attachMut = useMutation({
    mutationFn: (vars: { name?: string; phoneE164: string }) =>
      attachContact({
        data: {
          tenantId,
          sessionId: cart.sessionId,
          ...(vars.name ? { customerName: vars.name } : {}),
          customerPhone: vars.phoneE164,
          consent: true as const,
        },
      }),
  });
  function maybeAttachContact() {
    if (!recoveryConsent) return;
    if (!cart.sessionId) return;
    const phoneRaw = getValues("phone")?.trim();
    if (!phoneRaw) return;
    const parsed = parsePhoneNumberFromString(phoneRaw);
    if (!parsed || !parsed.isValid()) return;
    const name = getValues("name")?.trim();
    attachMut.mutate(
      { name: name && name.length >= 2 ? name : undefined, phoneE164: parsed.number },
    );
  }

  // -------- Order creation + WhatsApp handoff --------
  const create = useServerFn(createOrder);
  const mut = useMutation({
    mutationFn: (input: any) => create({ data: input }),
    onSuccess: (res) => {
      const values = getValues();
      const phoneRaw = res.whatsappE164 ?? tenantWhatsapp ?? null;
      const phone = phoneRaw && /^\+?\d{8,15}$/.test(phoneRaw) ? phoneRaw : null;

      // Trust server totals — see file header.
      const finalDiscount = (res as any).discountCents ?? discountCents;
      const finalPromoCode = (res as any).promoCode ?? promo?.code ?? null;
      const finalTotal = Math.max(0, res.subtotalCents - finalDiscount) + deliveryFee;

      const msg = buildOrderMessage({
        storeName: tenantName,
        customerName: values.name,
        phone: values.phone,
        address: values.address ?? "",
        notes: values.notes ?? "",
        items: cart.items,
        subtotalCents: res.subtotalCents,
        deliveryFeeCents: deliveryFee,
        deliveryAreaLabel: DELIVERY_AREAS.find((a) => a.id === deliveryArea)?.name ?? "",
        totalCents: finalTotal,
        currency: res.currency,
        orderId: res.orderId,
        promoCode: finalPromoCode,
        discountCents: finalDiscount,
      });
      const whatsappUrl = phone
        ? `https://wa.me/${phone.replace(/^\+/, "")}?text=${encodeURIComponent(msg)}`
        : null;

      // Attempt popup; fall through to fallback UI if blocked or missing.
      let popupBlocked = false;
      if (whatsappUrl) {
        const handle = window.open(whatsappUrl, "_blank", "noopener,noreferrer");
        if (!handle) popupBlocked = true;
      }

      const conf: ConfirmationState = {
        orderId: res.orderId,
        shortId: res.orderId.slice(0, 8).toUpperCase(),
        subtotalCents: res.subtotalCents,
        discountCents: finalDiscount,
        deliveryFeeCents: deliveryFee,
        totalCents: finalTotal,
        currency: res.currency,
        message: msg,
        whatsappUrl,
        whatsappPhone: phone,
        popupBlocked,
      };
      try {
        sessionStorage.setItem(lastOrderKey(tenantId), JSON.stringify(conf));
      } catch { /* noop */ }
      setConfirmation(conf);
      setStage("confirmation");
      setConfirmSend(false);

      if (!whatsappUrl) {
        toast.error("This store hasn't set up WhatsApp. Copy the order details instead.");
      } else if (popupBlocked) {
        toast.error("Popup blocked — use the buttons below to open WhatsApp.");
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to place order"),
  });

  function actuallySubmit() {
    const values = getValues();
    if (cart.items.length === 0) return;
    mut.mutate({
      tenantId,
      customerName: values.name.trim(),
      customerPhone: values.phone.trim(),
      customerAddress: values.address?.trim() || null,
      notes: values.notes?.trim() || null,
      items: cart.items.map((i) => ({
        productId: i.productId,
        variantId: i.variantId,
        variantLabel: i.variantLabel,
        name: i.name,
        priceCents: i.priceCents,
        quantity: i.quantity,
      })),
      promoCode: promo?.code ?? null,
      sessionId: cart.sessionId || null,
      recoveryToken: cart.recoveryToken,
    });
    setConfirmSend(false);
  }

  const accentStyle = accent ? { background: accent, color: "#fff" } : undefined;

  // -------- Stage transitions guarded by server validation --------
  async function goToCheckout() {
    const ok = await revalidateOrAbort();
    if (ok) setStage("checkout");
  }
  const onReviewSubmit = handleSubmit(async () => {
    const ok = await revalidateOrAbort();
    if (ok) setStage("review");
  });

  function backToShopping() {
    cart.clear();
    clearPromo();
    setConfirmation(null);
    setStage("cart");
    try { sessionStorage.removeItem(lastOrderKey(tenantId)); } catch { /* noop */ }
    onOpenChange(false);
  }

  async function copyText(text: string, success = "Copied") {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(success);
    } catch {
      toast.error("Couldn't copy — please copy manually.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o && stage !== "confirmation") setStage("cart"); }}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle className="text-left">
            {stage === "cart" ? "Your cart"
              : stage === "checkout" ? "Your details"
              : stage === "review" ? "Review order"
              : "Order sent"}
          </SheetTitle>
        </SheetHeader>

        {stage === "cart" ? (
          <>
            <div className="flex-1 overflow-y-auto -mx-6 px-6 divide-y divide-border">
              {cart.items.length === 0 ? (
                <div className="py-16 text-center">
                  <ShoppingBag className="size-10 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">Your cart is empty.</p>
                  <button
                    onClick={() => onOpenChange(false)}
                    className="mt-4 inline-flex items-center gap-1 text-sm font-medium hover:underline"
                    style={accent ? { color: accent } : undefined}
                  >
                    Continue shopping <ArrowRight className="size-3.5" />
                  </button>
                </div>
              ) : (
                cart.items.map((item) => (
                  <CartLineItem
                    key={item.lineKey}
                    item={item}
                    currency={currency}
                    onIncrement={handleIncrement}
                    onDecrement={handleDecrement}
                    onRemove={handleRemove}
                  />
                ))
              )}
            </div>
            <SheetFooter className="mt-4 flex-col gap-3 sm:flex-col">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-semibold tabular-nums">{formatPrice(cart.subtotalCents, currency)}</span>
              </div>
              {validationNotice && (
                <div
                  role="status"
                  aria-live="polite"
                  className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400"
                >
                  {validationNotice}
                </div>
              )}
              {availability && !availability.isOpen && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                  {availability.reason === "paused"
                    ? "This store is not accepting orders right now."
                    : "This store is currently closed. Please check back during business hours."}
                </div>
              )}
              <Button
                className="w-full min-h-11"
                disabled={cart.items.length === 0 || validateMut.isPending || (availability ? !availability.isOpen : false)}
                onClick={goToCheckout}
                style={accentStyle}
              >
                {validateMut.isPending ? "Checking stock…" : "Checkout"}
              </Button>
            </SheetFooter>
          </>
        ) : stage === "checkout" ? (
          <form onSubmit={onReviewSubmit} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto space-y-4">
              <div>
                <Label htmlFor="cd-name">Full name</Label>
                <Input id="cd-name" autoComplete="name" {...register("name")} aria-invalid={!!formState.errors.name} />
                {formState.errors.name && <p className="mt-1 text-xs text-destructive">{formState.errors.name.message}</p>}
              </div>
              <div>
                <Label htmlFor="cd-phone">Phone</Label>
                <Input
                  id="cd-phone"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="e.g. +20 100 123 4567"
                  {...register("phone")}
                  onBlur={(e) => {
                    register("phone").onBlur(e);
                    maybeAttachContact();
                  }}
                  aria-invalid={!!formState.errors.phone}
                />
                {formState.errors.phone && <p className="mt-1 text-xs text-destructive">{formState.errors.phone.message}</p>}
                <label className="mt-2 flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
                  <Checkbox
                    checked={recoveryConsent}
                    onCheckedChange={(v) => {
                      const next = v === true;
                      setRecoveryConsent(next);
                      if (next) maybeAttachContact();
                    }}
                    aria-label="WhatsApp reminder consent"
                    className="mt-0.5"
                  />
                  <span>
                    Send me a WhatsApp reminder if I don't complete my order. You can opt out anytime.
                  </span>
                </label>
              </div>
              <div>
                <Label htmlFor="cd-address">Delivery address</Label>
                <Textarea id="cd-address" rows={3} autoComplete="street-address" {...register("address")} />
              </div>
              <div>
                <Label>Delivery area</Label>
                <Select value={deliveryArea} onValueChange={(v) => setValue("deliveryArea", v, { shouldDirty: true })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DELIVERY_AREAS.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} — {a.feeCents === 0 ? "Free" : formatPrice(a.feeCents, currency)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="cd-notes">Notes (optional)</Label>
                <Textarea id="cd-notes" rows={2} {...register("notes")} />
              </div>
              <div className="rounded-md border border-border p-3 space-y-1.5 text-sm" aria-live="polite">
                <Row label="Subtotal" value={formatPrice(cart.subtotalCents, currency)} />
                {/* Reserved-space promo row — keeps Send-CTA stationary. */}
                <div className="min-h-[1.25rem]">
                  {promo && (
                    <Row label={`Promo — ${promo.code}`} value={`− ${formatPrice(discountCents, currency)}`} />
                  )}
                </div>
                <Row label="Delivery" value={deliveryFee === 0 ? "Free" : formatPrice(deliveryFee, currency)} />
                <div className="pt-1.5 mt-1.5 border-t border-border flex items-center justify-between">
                  <span className="font-medium">Total</span>
                  <span className="font-semibold tabular-nums">{formatPrice(totalCents, currency)}</span>
                </div>
              </div>
              <div>
                <Label htmlFor="cd-promo">Promo code</Label>
                {promo ? (
                  <div className="flex items-center justify-between rounded-md border border-border p-2 mt-1">
                    <div className="text-sm">
                      <span className="font-mono font-semibold">{promo.code}</span>
                      <span className="text-muted-foreground ml-2">− {formatPrice(discountCents, currency)}</span>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={clearPromo}>Remove</Button>
                  </div>
                ) : (
                  <div className="flex gap-2 mt-1">
                    <Input
                      id="cd-promo"
                      value={promoInput}
                      onChange={(e) => { setPromoInput(e.target.value.toUpperCase().replace(/\s+/g, "")); setPromoError(null); }}
                      placeholder="Enter code"
                      autoComplete="off"
                    />
                    <Button type="button" variant="outline" onClick={applyPromo} disabled={promoChecking || !promoInput.trim()}>
                      {promoChecking ? "Checking…" : "Apply"}
                    </Button>
                  </div>
                )}
                {promoError && <p className="mt-1 text-xs text-destructive">{promoError}</p>}
              </div>
            </div>
            <SheetFooter className="mt-4 flex-col gap-2 sm:flex-col">
              <Button type="submit" className="w-full min-h-11" style={accentStyle} disabled={mut.isPending || validateMut.isPending}>
                {validateMut.isPending ? "Verifying…" : "Review order"}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setStage("cart")}>
                <X className="size-4 mr-1" /> Back to cart
              </Button>
            </SheetFooter>
          </form>
        ) : stage === "review" ? (
          <>
            <div className="flex-1 overflow-y-auto space-y-4 text-sm">
              <div className="rounded-md border border-border divide-y divide-border">
                {cart.items.map((it) => (
                  <div key={it.lineKey} className="p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium line-clamp-1">{it.name}</div>
                      {it.variantLabel && (
                        <div className="text-[11px] text-muted-foreground line-clamp-1">{it.variantLabel}</div>
                      )}
                      <div className="text-xs text-muted-foreground">× {it.quantity}</div>
                    </div>
                    <div className="tabular-nums">{formatPrice(it.priceCents * it.quantity, currency)}</div>
                  </div>
                ))}
              </div>
              <div className="rounded-md border border-border p-3 space-y-1.5" aria-live="polite">
                <Row label="Subtotal" value={formatPrice(cart.subtotalCents, currency)} />
                {/* Reserved-space rows — review block doesn't shift as promo/notice toggle. */}
                <div className="min-h-[1.25rem]">
                  {promo && (
                    <Row label={`Promo — ${promo.code}`} value={`− ${formatPrice(discountCents, currency)}`} />
                  )}
                </div>
                <Row label={`Delivery — ${DELIVERY_AREAS.find((a) => a.id === deliveryArea)?.name}`} value={deliveryFee === 0 ? "Free" : formatPrice(deliveryFee, currency)} />
                <div className="pt-1.5 mt-1.5 border-t border-border flex items-center justify-between">
                  <span className="font-medium">Total</span>
                  <span className="font-semibold tabular-nums">{formatPrice(totalCents, currency)}</span>
                </div>
                <div className="min-h-[2.5rem]">
                  {validationNotice && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 pt-1.5">{validationNotice}</p>
                  )}
                </div>
              </div>
              <div className="rounded-md border border-border p-3 space-y-1.5">
                <Row label="Name" value={getValues("name")} />
                <Row label="Phone" value={getValues("phone")} />
                {getValues("address") && <Row label="Address" value={getValues("address") ?? ""} />}
                {getValues("notes") && <Row label="Notes" value={getValues("notes") ?? ""} />}
              </div>
              <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground flex items-start gap-2">
                <Check className="size-3.5 mt-0.5 flex-shrink-0" />
                <span>You'll be handed off to WhatsApp to confirm with the store. Your order will be saved here either way.</span>
              </div>
            </div>
            <SheetFooter className="mt-4 flex-col gap-2 sm:flex-col">
              {availability && !availability.isOpen && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                  This store is currently closed or not accepting orders.
                </div>
              )}
              <Button
                className="w-full min-h-11"
                style={accentStyle}
                onClick={() => setConfirmSend(true)}
                disabled={mut.isPending || (availability ? !availability.isOpen : false)}
              >
                {mut.isPending ? "Sending…" : "Send order via WhatsApp"}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => setStage("checkout")}>
                <X className="size-4 mr-1" /> Edit details
              </Button>
            </SheetFooter>

            <ConfirmDialog
              open={confirmSend}
              onOpenChange={setConfirmSend}
              title="Send this order?"
              description={`Total ${formatPrice(totalCents, currency)} — we'll open WhatsApp so you can confirm with ${tenantName}.`}
              confirmLabel="Send via WhatsApp"
              loading={mut.isPending}
              onConfirm={actuallySubmit}
            />
          </>
        ) : (
          // ----- Confirmation stage -----
          confirmation && (
            <>
              <div className="flex-1 overflow-y-auto space-y-4 text-sm">
                <div className="rounded-md border border-border bg-muted/30 p-4 text-center">
                  <div className="mx-auto mb-2 inline-flex size-10 items-center justify-center rounded-full bg-green-500/15 text-green-600 dark:text-green-400">
                    <Check className="size-5" />
                  </div>
                  <div className="font-semibold">Order #{confirmation.shortId} saved</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Total {formatPrice(confirmation.totalCents, confirmation.currency)}
                  </div>
                </div>

                {/* WhatsApp handoff — anchor (popup-block immune) + fallback. */}
                <div className="rounded-md border border-border p-3 space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Send to {tenantName} via WhatsApp
                  </div>
                  {confirmation.whatsappUrl ? (
                    <>
                      <a
                        href={confirmation.whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex w-full items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-white"
                        style={accentStyle ?? { background: "#25D366" }}
                      >
                        Open WhatsApp <ArrowRight className="size-4" />
                      </a>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => copyText(confirmation.whatsappUrl!, "Link copied")}
                        >
                          <Copy className="size-3.5 mr-1.5" /> Copy link
                        </Button>
                        {confirmation.whatsappPhone && (
                          <a
                            href={`tel:${confirmation.whatsappPhone}`}
                            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
                          >
                            <Phone className="size-3.5 mr-1.5" /> {confirmation.whatsappPhone}
                          </a>
                        )}
                      </div>
                      {confirmation.popupBlocked && (
                        <p className="text-[11px] text-amber-700 dark:text-amber-400">
                          Your browser blocked the popup. Use the buttons above.
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        This store hasn't set up WhatsApp yet. Copy the order details and send them by your preferred channel.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => copyText(confirmation.message, "Order details copied")}
                      >
                        <Copy className="size-3.5 mr-1.5" /> Copy order details
                      </Button>
                    </div>
                  )}
                </div>

                <details className="rounded-md border border-border p-3 text-xs">
                  <summary className="cursor-pointer font-medium">Order summary</summary>
                  <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-[11px] text-muted-foreground">
                    {confirmation.message}
                  </pre>
                </details>
              </div>
              <SheetFooter className="mt-4 flex-col gap-2 sm:flex-col">
                <Button className="w-full min-h-11" onClick={backToShopping} style={accentStyle}>
                  Back to shopping
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => copyText(confirmation.message, "Order details copied")}
                >
                  <Copy className="size-4 mr-1" /> Copy order summary
                </Button>
              </SheetFooter>
            </>
          )
        )}
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums text-right">{value}</span>
    </div>
  );
}

type CartLineItemProps = {
  item: {
    lineKey: string;
    productId: string;
    variantId: string | null;
    variantLabel: string | null;
    name: string;
    priceCents: number;
    imageUrl: string | null;
    quantity: number;
  };
  currency: string;
  onIncrement: (lineKey: string, qty: number) => void;
  onDecrement: (lineKey: string, qty: number) => void;
  onRemove: (lineKey: string) => void;
};

const CartLineItem = memo(function CartLineItem({
  item,
  currency,
  onIncrement,
  onDecrement,
  onRemove,
}: CartLineItemProps) {
  return (
    <div className="py-3 flex gap-3">
      <div className="size-16 rounded-md bg-muted overflow-hidden flex items-center justify-center shrink-0">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            width={64}
            height={64}
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium text-sm line-clamp-2">{item.name}</div>
            {item.variantLabel && (
              <div className="text-[11px] text-muted-foreground line-clamp-1">{item.variantLabel}</div>
            )}
            <div className="text-xs text-muted-foreground tabular-nums mt-0.5">
              {formatPrice(item.priceCents, currency)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onRemove(item.lineKey)}
            className="text-muted-foreground hover:text-destructive p-1 -m-1"
            aria-label={`Remove ${item.name}`}
          >
            <Trash2 className="size-4" />
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <div className="inline-flex items-center rounded-md border border-border">
            <button
              type="button"
              onClick={() => onDecrement(item.lineKey, item.quantity)}
              disabled={item.quantity <= 1}
              className="size-8 inline-flex items-center justify-center hover:bg-muted disabled:opacity-40"
              aria-label="Decrease quantity"
            >
              <Minus className="size-3.5" />
            </button>
            <span className="w-8 text-center text-sm tabular-nums">{item.quantity}</span>
            <button
              type="button"
              onClick={() => onIncrement(item.lineKey, item.quantity)}
              className="size-8 inline-flex items-center justify-center hover:bg-muted"
              aria-label="Increase quantity"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          <div className="font-medium text-sm tabular-nums">
            {formatPrice(item.priceCents * item.quantity, currency)}
          </div>
        </div>
      </div>
    </div>
  );
});

function buildOrderMessage(o: {
  storeName: string; customerName: string; phone: string; address: string; notes: string;
  items: { name: string; priceCents: number; quantity: number }[];
  subtotalCents: number; deliveryFeeCents: number; deliveryAreaLabel: string;
  totalCents: number; currency: string; orderId: string;
  promoCode?: string | null; discountCents?: number;
}) {
  const lines: string[] = [];
  lines.push(`🛍️ *New order — ${o.storeName}*`);
  lines.push(`Order #${o.orderId.slice(0, 8).toUpperCase()}`);
  lines.push("");
  lines.push("*Customer*");
  lines.push(`• Name: ${o.customerName}`);
  lines.push(`• Phone: ${o.phone}`);
  if (o.address) lines.push(`• Address: ${o.address}`);
  if (o.deliveryAreaLabel) lines.push(`• Delivery: ${o.deliveryAreaLabel}`);
  if (o.notes) lines.push(`• Notes: ${o.notes}`);
  lines.push("");
  lines.push("*Items*");
  for (const it of o.items) {
    lines.push(`• ${it.quantity}× ${it.name} — ${formatPrice(it.priceCents * it.quantity, o.currency)}`);
  }
  lines.push("");
  lines.push(`Subtotal: ${formatPrice(o.subtotalCents, o.currency)}`);
  if (o.promoCode && (o.discountCents ?? 0) > 0) {
    lines.push(`Promo (${o.promoCode}): − ${formatPrice(o.discountCents ?? 0, o.currency)}`);
  }
  lines.push(`Delivery: ${o.deliveryFeeCents === 0 ? "Free" : formatPrice(o.deliveryFeeCents, o.currency)}`);
  lines.push(`*Total:* ${formatPrice(o.totalCents, o.currency)}`);
  return lines.join("\n");
}
