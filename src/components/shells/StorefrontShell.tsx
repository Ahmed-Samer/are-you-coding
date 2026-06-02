import type { ReactNode } from "react";
import type { ResolvedTenant } from "@/lib/tenant.functions";

export function StorefrontShell({
  tenant,
  children,
}: {
  tenant: ResolvedTenant;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 h-14 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="inline-block size-6 rounded-md bg-foreground" aria-hidden />
            <span>{tenant.name}</span>
          </a>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="/" className="hover:text-foreground transition-colors">Shop</a>
            <a href="/" className="hover:text-foreground transition-colors">Categories</a>
            <a href="/" className="hover:text-foreground transition-colors">About</a>
            <a href="/" className="hover:text-foreground transition-colors">Contact</a>
          </nav>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-sm hover:bg-accent transition-colors"
            >
              Order on WhatsApp
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-muted-foreground">
          © {new Date().getFullYear()} {tenant.name}. Powered by Storefront.
        </div>
      </footer>
    </div>
  );
}
