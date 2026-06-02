import { Link } from "@tanstack/react-router";

/**
 * Storefront not-found / suspended / pending page. Replaces the previous
 * silent fail-soft fallback to the marketing shell when an unknown,
 * suspended, or pending storefront slug is requested.
 *
 * The route's <head> sets `robots: noindex,nofollow`, so this page is
 * never indexed and never leaks the slug to crawlers.
 */
export function StoreNotFound({
  reason,
  host,
}: {
  reason: "unknown" | "suspended" | "pending";
  host: string;
}) {
  const copy = (() => {
    switch (reason) {
      case "suspended":
        return {
          title: "This store is currently unavailable",
          body: "The store at this address has been temporarily suspended. Please check back later or contact the store owner.",
        };
      case "pending":
        return {
          title: "This store isn't open yet",
          body: "The owner is still setting things up. Please check back soon.",
        };
      default:
        return {
          title: "Store not found",
          body: "We couldn't find a store at this address. Double-check the link, or visit our marketing site to learn more.",
        };
    }
  })();

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-background text-foreground px-6">
      <div className="max-w-md text-center">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {host || "Storefront"}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{copy.title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{copy.body}</p>
        <div className="mt-8">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go to homepage
          </Link>
        </div>
      </div>
    </div>
  );
}
