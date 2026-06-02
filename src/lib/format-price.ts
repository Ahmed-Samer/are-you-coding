/**
 * Format a plan's price using the plan's own currency and interval.
 *
 * This is the single shared price formatter for the Onboarding wizard
 * (Screen 17 — Plan step) and the Confirm step (Screen 18). The Marketing
 * Pricing page (Screen 04) keeps its own presentation for now but should
 * migrate here in a future pass to keep the "single canonical source"
 * promise.
 */
export type PriceShape = {
  price_usd: number;
  currency: string;
  interval: string;
};

export function intervalSuffix(interval: string): string {
  switch (interval) {
    case "monthly":
      return "/mo";
    case "quarterly":
      return "/quarter";
    case "yearly":
      return "/yr";
    default:
      return `/${interval}`;
  }
}

export function intervalLabel(interval: string): string {
  switch (interval) {
    case "monthly":
      return "Monthly";
    case "quarterly":
      return "Quarterly";
    case "yearly":
      return "Yearly";
    default:
      return interval;
  }
}

export function formatPlanPrice(plan: PriceShape): string {
  const currency = plan.currency || "USD";
  let formatted: string;
  try {
    formatted = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(plan.price_usd);
  } catch {
    // Unknown currency code → graceful fallback.
    formatted = `${currency} ${plan.price_usd}`;
  }
  return `${formatted}${intervalSuffix(plan.interval)}`;
}

/**
 * Currency-aware money formatter for the Checkout wizard. Falls back to
 * `<CODE> <amount>` if the runtime Intl data does not recognize the
 * currency code (rare on modern runtimes, but cheap to defend against).
 *
 * For EGP we default to no fractional digits to match local convention;
 * other currencies show whatever the locale considers normal.
 */
export function formatMoney(amount: number, currency: string, locale?: string): string {
  const safeCurrency = (currency || "USD").toUpperCase();
  const opts: Intl.NumberFormatOptions = {
    style: "currency",
    currency: safeCurrency,
  };
  if (safeCurrency === "EGP") opts.maximumFractionDigits = 0;
  try {
    return new Intl.NumberFormat(locale, opts).format(amount);
  } catch {
    return `${safeCurrency} ${amount.toFixed(2)}`;
  }
}
