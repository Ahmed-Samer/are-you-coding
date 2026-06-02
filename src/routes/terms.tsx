import { createFileRoute, Link } from "@tanstack/react-router";
import { PlatformShell } from "@/components/shells/PlatformShell";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — CoreWeb" },
      {
        name: "description",
        content:
          "Terms governing your use of the CoreWeb hosted storefront platform — accounts, billing, acceptable use, and liability.",
      },
      { property: "og:title", content: "Terms of Service — CoreWeb" },
      {
        property: "og:description",
        content: "Terms governing your use of the CoreWeb platform.",
      },
    ],
    links: [{ rel: "canonical", href: "/terms" }],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <PlatformShell>
      <article className="mx-auto max-w-3xl px-6 py-20 sm:py-24">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Legal
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          Terms of Service
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Draft — to be reviewed by legal counsel before production use.
        </p>

        <section className="mt-10 space-y-6 text-sm text-foreground/90 leading-relaxed">
          <div>
            <h2 className="text-xl font-semibold">1. Acceptance</h2>
            <p className="mt-2 text-muted-foreground">
              By creating an account or using CoreWeb you agree to these
              terms. If you do not agree, do not use the service.
            </p>
          </div>
          <div>
            <h2 className="text-xl font-semibold">2. Accounts</h2>
            <p className="mt-2 text-muted-foreground">
              You are responsible for your account credentials, your store
              content, and any activity that occurs under your account.
            </p>
          </div>
          <div>
            <h2 className="text-xl font-semibold">3. Acceptable use</h2>
            <p className="mt-2 text-muted-foreground">
              You may not use CoreWeb to sell illegal goods, infringe
              intellectual property, or send unsolicited messages. We may
              suspend stores that violate these rules.
            </p>
          </div>
          <div>
            <h2 className="text-xl font-semibold">4. Billing</h2>
            <p className="mt-2 text-muted-foreground">
              Paid plans renew automatically until cancelled. Fees are
              non-refundable except where required by law.
            </p>
          </div>
          <div>
            <h2 className="text-xl font-semibold">5. Liability</h2>
            <p className="mt-2 text-muted-foreground">
              The service is provided "as is". To the extent permitted by
              law, our liability is limited to the fees paid in the last 12
              months.
            </p>
          </div>
          <div>
            <h2 className="text-xl font-semibold">6. Contact</h2>
            <p className="mt-2 text-muted-foreground">
              Questions about these terms? Reach us via the
              {" "}<Link to="/contact" className="underline">contact page</Link>.
            </p>
          </div>
        </section>
      </article>
    </PlatformShell>
  );
}