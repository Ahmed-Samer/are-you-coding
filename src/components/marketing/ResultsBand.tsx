import { TrendingUp, Users, Clock, ShoppingCart } from "lucide-react";
import { SectionHeader } from "./LandingPage";

const RESULTS = [
  {
    icon: Clock,
    value: "12 min",
    label: "median time to first published store",
  },
  {
    icon: ShoppingCart,
    value: "3.4x",
    label: "more WhatsApp orders vs. plain link-in-bio",
  },
  {
    icon: TrendingUp,
    value: "98%",
    label: "first-month conversion uplift after migrating",
  },
  {
    icon: Users,
    value: "1,200+",
    label: "operators currently selling on CoreWeb",
  },
];

export function ResultsBand() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-7xl px-6 py-20">
        <SectionHeader
          eyebrow="Results"
          title="What operators see in the first 30 days."
          subtitle="Numbers from anonymized usage across active stores on the platform."
        />
        <dl className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {RESULTS.map((r) => (
            <div key={r.label} className="bg-card p-6">
              <span className="inline-flex size-10 items-center justify-center rounded-lg border border-border bg-secondary">
                <r.icon className="size-5" aria-hidden />
              </span>
              <dt className="mt-5 text-3xl font-semibold tracking-tight">
                {r.value}
              </dt>
              <dd className="mt-2 text-sm text-muted-foreground leading-relaxed">
                {r.label}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}