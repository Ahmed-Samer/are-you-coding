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
      "1 Storefront included",
      "Up to 50 products",
      "Free RentWebify subdomain",
      "WhatsApp checkout flow",
      "Local EGP payment methods",
      "Standard email support",
    ],
    highlight: false,
    sort_order: 10,
  },
  {
    slug: "growth-monthly",
    name: "Growth",
    description: "For scaling brands with growing catalogs and steady ad traffic.",
    price_usd: 39,
    currency: "USD",
    interval: "monthly",
    features: [
      "Up to 3 Storefronts",
      "Unlimited products",
      "Custom domain (yourname.com)",
      "Sales analytics engine",
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
      "Up to 10 Storefronts",
      "Everything in Growth",
      "Free Custom Domain per store",
      "Up to 10 team seats",
      "Promo codes & marketing tools",
      "Advanced export reporting",
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
      "1 Storefront included",
      "Up to 50 products",
      "Free RentWebify subdomain",
      "WhatsApp checkout flow",
      "Local EGP payment methods",
      "Standard email support",
    ],
    highlight: false,
    sort_order: 11,
  },
  {
    slug: "growth-quarterly",
    name: "Growth",
    description: "For scaling brands with growing catalogs and steady ad traffic.",
    price_usd: 105,
    currency: "USD",
    interval: "quarterly",
    features: [
      "Up to 3 Storefronts",
      "Unlimited products",
      "Custom domain (yourname.com)",
      "Sales analytics engine",
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
      "Up to 10 Storefronts",
      "Everything in Growth",
      "Free Custom Domain per store",
      "Up to 10 team seats",
      "Promo codes & marketing tools",
      "Advanced export reporting",
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
    label: "Storefronts",
    values: { Starter: "1 Store", Growth: "Up to 3", Scale: "Up to 10" },
  },
  {
    label: "Products Catalog",
    values: { Starter: "Up to 50", Growth: "Unlimited", Scale: "Unlimited" },
  },
  {
    label: "Custom Domain",
    values: { Starter: "—", Growth: "Included", Scale: "Free per store" },
  },
  {
    label: "Analytics Dashboard",
    values: { Starter: "Basic", Growth: "Full Reporting", Scale: "Advanced Insights" },
  },
  {
    label: "Abandoned-Cart Recovery",
    values: { Starter: "—", Growth: "Automated", Scale: "Automated" },
  },
  {
    label: "Promo Codes System",
    values: { Starter: "—", Growth: "—", Scale: "Included" },
  },
  {
    label: "Team Seats (Admins)",
    values: { Starter: "1 Seat", Growth: "3 Seats", Scale: "10 Seats" },
  },
  {
    label: "WhatsApp Integration",
    values: { Starter: "Included", Growth: "Included", Scale: "Included" },
  },
  {
    label: "Dedicated Support",
    values: { Starter: "Email", Growth: "Priority Email", Scale: "Priority WhatsApp" },
  },
];

// ---------- FAQ ----------

export type FaqEntry = { question: string; answer: string };

export const PRICING_FAQ: FaqEntry[] = [
  {
    question: "How do I pay in Egypt?",
    answer:
      "We accept all local payment methods: InstaPay, Vodafone Cash, and direct bank transfers. Simply select your preferred method at checkout, upload the payment screenshot, and your store will be activated instantly upon verification.",
  },
  {
    question: "Am I charged in USD or EGP?",
    answer:
      "Our infrastructure costs are tied to USD for stability, but you pay the exact equivalent in EGP using the live market exchange rate at the time of checkout. No hidden currency fees.",
  },
  {
    question: "Can I upgrade my plan later if my traffic spikes?",
    answer:
      "Absolutely. RentWebify is built for scale. You can upgrade to the Growth or Scale plan at any time from your dashboard, and the changes apply immediately without any downtime to your store.",
  },
  {
    question: "What counts as a single product?",
    answer:
      "One product equals one main listing in your catalog. Variants (like different colors or sizes of the same T-shirt) do not count as separate products. Starter plans cap at 50 main listings; Growth and Scale are completely unlimited.",
  },
  {
    question: "Are there any hidden setup fees or commissions?",
    answer:
      "Zero. No setup fees, no hidden contracts, and most importantly, we take 0% commission on your sales. You keep 100% of your profits; you only pay the flat subscription rate.",
  },
];