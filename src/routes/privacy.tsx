import { createFileRoute, Link } from "@tanstack/react-router";
import { PlatformShell } from "@/components/shells/PlatformShell";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — CoreWeb" },
      {
        name: "description",
        content:
          "How CoreWeb collects, uses, and protects your data — clear, plain-language privacy practices for our hosted storefront platform.",
      },
      { property: "og:title", content: "Privacy Policy — CoreWeb" },
      {
        property: "og:description",
        content: "Plain-language privacy practices for the CoreWeb platform.",
      },
    ],
    links: [{ rel: "canonical", href: "/privacy" }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <PlatformShell>
      <article className="mx-auto max-w-3xl px-6 py-20 sm:py-24">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Legal
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Draft — to be reviewed by legal counsel before production use.
        </p>

        <section className="mt-10 space-y-6 text-sm text-foreground/90 leading-relaxed">
          <div>
            <h2 className="text-xl font-semibold">1. Data we collect</h2>
            <p className="mt-2 text-muted-foreground">
              We collect the information you give us directly (account email,
              store content) and basic usage telemetry needed to run the
              service (IP address hashed for abuse prevention, browser type,
              referrer).
            </p>
          </div>
          <div>
            <h2 className="text-xl font-semibold">2. How we use it</h2>
            <p className="mt-2 text-muted-foreground">
              To deliver the service, authenticate you, process payments,
              prevent fraud, send transactional emails, and improve product
              reliability. We do not sell personal data.
            </p>
          </div>
          <div>
            <h2 className="text-xl font-semibold">3. Lead capture</h2>
            <p className="mt-2 text-muted-foreground">
              When you submit your email through one of our forms (e.g. the
              launch playbook capture), we store your address, the source of
              the submission, and a hashed IP for rate limiting. You can
              unsubscribe at any time from any email we send.
            </p>
          </div>
          <div>
            <h2 className="text-xl font-semibold">4. Cookies</h2>
            <p className="mt-2 text-muted-foreground">
              We use strictly necessary cookies for authentication and a
              session flag to avoid re-showing the same dialog within a visit.
            </p>
          </div>
          <div>
            <h2 className="text-xl font-semibold">5. Your rights</h2>
            <p className="mt-2 text-muted-foreground">
              You can request access, correction, or deletion of your data by
              contacting us via the <Link to="/contact" className="underline">contact page</Link>.
            </p>
          </div>
          <div>
            <h2 className="text-xl font-semibold">6. Contact</h2>
            <p className="mt-2 text-muted-foreground">
              Questions about this policy? Reach us at privacy@coreweb.app.
            </p>
          </div>
        </section>
      </article>
    </PlatformShell>
  );
}