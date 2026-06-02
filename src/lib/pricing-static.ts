/**
 * Pricing — SSR-safe static mirror of the Supabase `plans` table.
 *
 * `head()` in TanStack Start runs without loader data, so JSON-LD generated
 * inside `head()` cannot reach the live plans query. To avoid divergence
 * between SEO markup and the rendered UI, this module mirrors the DB seed in
 * `PENDING_SQL_COMMANDS.sql`. **Anytime you change the plans seed (price,
 * slug, tier name), update this file in the same commit.**
 *
 * It also owns the cross-tier comparison matrix and the pricing FAQ — both
 * pure presentation data shared with JSON-LD generation.
 */

export type StaticInterval = "monthly" | "quarterly";

export type StaticPlan = {
  slug: string;
  name: "Starter" | "Growth" | "Scale";
  description: string;
  price_usd: number;
  currency: "USD";
  interval: StaticInterval;
  features: string[];
  highlight: boolean;
  sort_order: number;
};

export const STATIC_PLANS: StaticPlan[] = [
  {
    slug: "starter-monthly",
    name: "Starter",
    description: "For new shops launching their first online store.",
    price_usd: 15,
    currency: "USD",
    interval: "monthly",
    features: [
      "Up to 50 products",
      "Free subdomain",
      "WhatsApp ordering",
      "Local payment methods",
      "Email support",
    ],
    highlight: false,
    sort_order: 10,
  },
  {
    slug: "growth-monthly",
    name: "Growth",
    description: "For shops with a growing catalog and steady traffic.",
    price_usd: 39,
    currency: "USD",
    interval: "monthly",
    features: [
      "Unlimited products",
      "Custom domain",
      "Analytics dashboard",
      "Abandoned-cart recovery",
      "Priority email support",
    ],
    highlight: true,
    sort_order: 20,
  },
  {
    slug: "scale-monthly",
    name: "Scale",
    description: "For multi-channel sellers and high-volume operations.",
    price_usd: 89,
    currency: "USD",
    interval: "monthly",
    features: [
      "Everything in Growth",
      "Up to 10 team seats",
      "Promo codes & campaigns",
      "Advanced reporting",
      "Priority WhatsApp support",
    ],
    highlight: false,
    sort_order: 30,
  },
  {
    slug: "starter-quarterly",
    name: "Starter",
    description: "For new shops launching their first online store.",
    price_usd: 40,
    currency: "USD",
    interval: "quarterly",
    features: [
      "Up to 50 products",
      "Free subdomain",
      "WhatsApp ordering",
      "Local payment methods",
      "Email support",
    ],
    highlight: false,
    sort_order: 11,
  },
  {
    slug: "growth-quarterly",
    name: "Growth",
    description: "For shops with a growing catalog and steady traffic.",
    price_usd: 105,
    currency: "USD",
    interval: "quarterly",
    features: [
      "Unlimited products",
      "Custom domain",
      "Analytics dashboard",
      "Abandoned-cart recovery",
      "Priority email support",
    ],
    highlight: true,
    sort_order: 21,
  },
  {
    slug: "scale-quarterly",
    name: "Scale",
    description: "For multi-channel sellers and high-volume operations.",
    price_usd: 240,
    currency: "USD",
    interval: "quarterly",
    features: [
      "Everything in Growth",
      "Up to 10 team seats",
      "Promo codes & campaigns",
      "Advanced reporting",
      "Priority WhatsApp support",
    ],
    highlight: false,
    sort_order: 31,
  },
];

export const TIER_ORDER: StaticPlan["name"][] = ["Starter", "Growth", "Scale"];

/** Quarterly savings vs paying monthly for 3 months, per tier. */
export function quarterlySavingsPct(tier: StaticPlan["name"]): number {
  const m = STATIC_PLANS.find((p) => p.name === tier && p.interval === "monthly");
  const q = STATIC_PLANS.find((p) => p.name === tier && p.interval === "quarterly");
  if (!m || !q) return 0;
  const monthlyOverThreeMonths = m.price_usd * 3;
  if (monthlyOverThreeMonths === 0) return 0;
  return Math.round(((monthlyOverThreeMonths - q.price_usd) / monthlyOverThreeMonths) * 100);
}

// ---------- Comparison matrix ----------

export type ComparisonRow = {
  label: string;
  values: Record<StaticPlan["name"], string>;
};

export const COMPARISON_MATRIX: ComparisonRow[] = [
  {
    label: "Products",
    values: { Starter: "Up to 50", Growth: "Unlimited", Scale: "Unlimited" },
  },
  {
    label: "Custom domain",
    values: { Starter: "—", Growth: "Included", Scale: "Included" },
  },
  {
    label: "Analytics dashboard",
    values: { Starter: "Basic", Growth: "Full", Scale: "Advanced" },
  },
  {
    label: "Abandoned-cart recovery",
    values: { Starter: "—", Growth: "Included", Scale: "Included" },
  },
  {
    label: "Promo codes & campaigns",
    values: { Starter: "—", Growth: "—", Scale: "Included" },
  },
  {
    label: "Team seats",
    values: { Starter: "1", Growth: "3", Scale: "10" },
  },
  {
    label: "WhatsApp ordering",
    values: { Starter: "Included", Growth: "Included", Scale: "Included" },
  },
  {
    label: "Support",
    values: { Starter: "Email", Growth: "Priority email", Scale: "Priority WhatsApp" },
  },
];

// ---------- FAQ ----------

export type FaqEntry = { question: string; answer: string };

export const PRICING_FAQ: FaqEntry[] = [
  {
    question: "How do I pay?",
    answer:
      "We accept InstaPay, Vodafone Cash, and direct bank transfer. After choosing a plan you'll see step-by-step instructions and upload a payment proof — your store activates as soon as it's verified.",
  },
  {
    question: "Am I charged in USD or EGP?",
    answer:
      "Plans are priced in USD for clarity, and you pay the equivalent in EGP using the live exchange rate at checkout. The exact EGP amount is shown before you confirm.",
  },
  {
    question: "Can I switch plans later?",
    answer:
      "Yes. You can upgrade or downgrade between Starter, Growth, and Scale, or switch between monthly and quarterly billing from your dashboard. Changes apply at the start of your next billing cycle.",
  },
  {
    question: "Do you offer refunds?",
    answer:
      "If something isn't right within the first 14 days of a new subscription, contact us and we'll refund the most recent payment in full. After that, you can cancel at any time and won't be charged again.",
  },
  {
    question: "What counts as a product?",
    answer:
      "One product = one item listing in your catalog. Variants (size, color, etc.) of the same listing do not count separately. The Starter cap is 50 listings; Growth and Scale are unlimited.",
  },
  {
    question: "Is there a setup fee?",
    answer:
      "No. There are no setup fees, contracts, or hidden charges — you pay only for your monthly or quarterly subscription.",
  },
];