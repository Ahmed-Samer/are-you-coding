import { createFileRoute, Link, Outlet, redirect, useParams, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PlatformShell } from "@/components/shells/PlatformShell";
import { getMyTenantBySlug } from "@/lib/catalog.functions";
import { createContext, useContext, useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronRight,
  LayoutDashboard,
  Package,
  FolderTree,
  ShoppingBag,
  Tag,
  Globe,
  Settings as SettingsIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Users,
  MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { StoreContext } from "@/lib/store-context";
import { getStorefrontUrl } from "@/lib/branding";

export const Route = createFileRoute("/_authenticated/store/$slug")({
  head: ({ params }) => ({ meta: [{ title: `${params.slug} — Store admin` }] }),
  beforeLoad: async ({ params }: { params: { slug: string } }) => {
    if (!params.slug) throw redirect({ to: "/dashboard" });
    return;
  },
  component: StoreLayout,
});

const NAV = [
  { to: "/store/$slug/overview", label: "Overview", icon: LayoutDashboard },
  { to: "/store/$slug/products", label: "Products", icon: Package },
  { to: "/store/$slug/categories", label: "Categories", icon: FolderTree },
  { to: "/store/$slug/orders", label: "Orders", icon: ShoppingBag },
  { to: "/store/$slug/recovery", label: "Recovery", icon: MessageCircle },
  { to: "/store/$slug/promos", label: "Promos", icon: Tag },
  { to: "/store/$slug/domains", label: "Domains", icon: Globe },
  { to: "/store/$slug/team", label: "Team", icon: Users },
  { to: "/store/$slug/settings", label: "Settings", icon: SettingsIcon },
] as const;

const SIDEBAR_KEY = "rentwebify:store:sidebar-collapsed";

function StoreLayout() {
  const { slug } = useParams({ from: "/_authenticated/store/$slug" });
  const fetcher = useServerFn(getMyTenantBySlug);
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-tenant", slug],
    queryFn: () => fetcher({ data: { slug } }),
  });
  const path = useRouterState({ select: (s) => s.location.pathname });
  const currentTab = NAV.find((t) => path.includes(t.to.replace("$slug", slug)))?.label ?? "Overview";

  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      const v = localStorage.getItem(SIDEBAR_KEY);
      if (v === "1") setCollapsed(true);
    } catch {}
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0"); } catch {}
      return next;
    });
  };

  return (
    <PlatformShell>
      {isLoading ? (
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8">
          <Skeleton className="h-4 w-48 mb-4" />
          <Skeleton className="h-8 w-64 mb-6" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : error || !data ? (
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8 text-sm text-destructive">Store not found.</div>
      ) : (
        <StoreContext.Provider value={{ tenant: data.tenant as any }}>
          <div className="flex">
            {/* Desktop sidebar */}
            <aside
              className={cn(
                "hidden lg:flex flex-col border-r border-border bg-background/60 sticky top-14 self-start shrink-0 transition-[width] duration-200",
                collapsed ? "w-14" : "w-56",
              )}
              style={{ height: "calc(100vh - 3.5rem)" }}
            >
              <div className="flex items-center gap-2 px-3 py-3 border-b border-border min-w-0">
                {(data.tenant as any).logo_url ? (
                  <img
                    src={(data.tenant as any).logo_url}
                    alt=""
                    width={32}
                    height={32}
                    decoding="async"
                    className="size-8 rounded-md object-cover border border-border shrink-0"
                  />
                ) : (
                  <div className="size-8 rounded-md bg-muted shrink-0" />
                )}
                {!collapsed && (
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Store</p>
                    <p className="text-sm font-semibold truncate">{data.tenant.name}</p>
                  </div>
                )}
              </div>
              <nav className="flex-1 overflow-y-auto py-2">
                {NAV.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.to}
                      to={item.to as any}
                      params={{ slug } as any}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "flex items-center gap-3 mx-2 my-0.5 px-2.5 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors",
                        collapsed && "justify-center",
                      )}
                      activeProps={{
                        className: cn(
                          "flex items-center gap-3 mx-2 my-0.5 px-2.5 py-2 rounded-md text-sm bg-accent text-foreground font-medium",
                          collapsed && "justify-center",
                        ),
                      }}
                    >
                      <Icon className="size-4 shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </nav>
              <div className="border-t border-border p-2">
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  className="w-full flex items-center justify-center gap-2 px-2 py-2 rounded-md text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                  {collapsed ? <PanelLeftOpen className="size-4" /> : (
                    <>
                      <PanelLeftClose className="size-4" />
                      <span>Collapse</span>
                    </>
                  )}
                </button>
              </div>
            </aside>

            <div className="flex-1 min-w-0">
              <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8">
                {/* Breadcrumb */}
                <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Link to="/dashboard" className="hover:text-foreground transition-colors">Dashboard</Link>
                  <ChevronRight className="size-3" />
                  <span className="truncate max-w-[140px]">{data.tenant.name}</span>
                  <ChevronRight className="size-3" />
                  <span className="text-foreground">{currentTab}</span>
                </nav>
                <header className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {(data.tenant as any).logo_url && (
                      <img
                        src={(data.tenant as any).logo_url}
                        alt=""
                        width={40}
                        height={40}
                        decoding="async"
                        className="size-10 rounded-md object-cover border border-border shrink-0 lg:hidden"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Store</p>
                      <h1 className="text-xl sm:text-2xl font-semibold tracking-tight truncate">{data.tenant.name}</h1>
                    </div>
                  </div>
                  {(() => {
                    const previewUrl = getStorefrontUrl(data.tenant.slug);
                    return (
                      <a
                        href={previewUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm hover:bg-accent shrink-0"
                      >
                        View storefront ↗
                      </a>
                    );
                  })()}
                </header>
                {/* Mobile/tablet tabs */}
                <nav className="mb-6 flex gap-1 border-b border-border overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 lg:hidden">
                  {NAV.map((t) => (
                    <TabLink key={t.to} to={t.to} slug={slug}>{t.label}</TabLink>
                  ))}
                </nav>
                <Outlet />
              </div>
            </div>
          </div>
        </StoreContext.Provider>
      )}
    </PlatformShell>
  );
}

function TabLink({ to, slug, children }: { to: string; slug: string; children: React.ReactNode }) {
  return (
    <Link
      to={to as any}
      params={{ slug } as any}
      className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border-b-2 border-transparent -mb-px transition-colors whitespace-nowrap"
      activeProps={{ className: "px-4 py-2 text-sm text-foreground border-b-2 border-foreground -mb-px font-medium whitespace-nowrap" }}
    >
      {children}
    </Link>
  );
}
