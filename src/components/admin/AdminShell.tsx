import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  LayoutDashboard,
  Receipt,
  Building2,
  Wallet,
  CircleDollarSign,
  Tags,
  Flag,
  ScrollText,
  AlertTriangle,
  Shield,
  LogOut,
  ChevronRight,
  BarChart3,
  AlarmClock,
  Webhook,
} from "lucide-react";
import { useSession, useUser } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; badge?: number };

const groups: { label: string; items: NavItem[] }[] = [
  {
    label: "Operations",
    items: [
      { to: "/admin", label: "Overview", icon: LayoutDashboard },
      { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
      { to: "/admin/payments", label: "Payment proofs", icon: Receipt, badge: 3 },
      { to: "/admin/tenants", label: "Tenants", icon: Building2 },
      { to: "/admin/billing/dunning", label: "Dunning", icon: AlarmClock },
      { to: "/admin/webhooks", label: "Webhooks", icon: Webhook },
    ],
  },
  {
    label: "Configuration",
    items: [
      { to: "/admin/payment-methods", label: "Payment methods", icon: Wallet },
      { to: "/admin/fx-rates", label: "FX rates", icon: CircleDollarSign },
      { to: "/admin/plans", label: "Plans", icon: Tags },
      { to: "/admin/flags", label: "Feature flags", icon: Flag },
    ],
  },
  {
    label: "Observability",
    items: [
      { to: "/admin/audit", label: "Audit log", icon: ScrollText },
      { to: "/admin/errors", label: "Errors", icon: AlertTriangle },
    ],
  },
];

export function AdminShell({
  children,
  title,
  description,
  actions,
  breadcrumbs,
}: {
  children: ReactNode;
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumbs?: { label: string; to?: string }[];
}) {
  const user = useUser();
  const { signOut } = useSession();
  const router = useRouter();
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen bg-muted/30 text-foreground">
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-border bg-card">
          <div className="h-14 px-5 flex items-center gap-2 border-b border-border">
            <div className="size-7 rounded-md bg-foreground text-background grid place-items-center">
              <Shield className="size-4" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold tracking-tight">RentWebify</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Admin Console</span>
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
            {groups.map((g) => (
              <div key={g.label}>
                <div className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {g.label}
                </div>
                <ul className="space-y-0.5">
                  {g.items.map((it) => {
                    const active = path === it.to || (it.to !== "/admin" && path.startsWith(it.to));
                    const Icon = it.icon;
                    return (
                      <li key={it.to}>
                        <Link
                          to={it.to}
                          className={cn(
                            "group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                            active
                              ? "bg-foreground text-background"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted",
                          )}
                        >
                          <Icon className="size-4 shrink-0" />
                          <span className="flex-1 truncate">{it.label}</span>
                          {it.badge != null && (
                            <span
                              className={cn(
                                "rounded-full px-1.5 py-0 text-[10px] font-semibold leading-4",
                                active
                                  ? "bg-background/20 text-background"
                                  : "bg-foreground text-background",
                              )}
                            >
                              {it.badge}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
          <div className="border-t border-border p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-start gap-2 px-2 text-sm">
                  <div className="size-6 rounded-full bg-muted grid place-items-center text-[10px] font-semibold">
                    {user?.email?.[0]?.toUpperCase() ?? "A"}
                  </div>
                  <span className="truncate flex-1 text-left">{user?.email ?? "Admin"}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Signed in</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.navigate({ to: "/dashboard" })}>
                  Back to tenant dashboard
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    await signOut();
                    router.navigate({ to: "/" });
                  }}
                >
                  <LogOut className="mr-2 size-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 min-w-0 flex flex-col">
          <header className="h-14 shrink-0 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-30">
            <div className="h-full px-6 flex items-center justify-between gap-4">
              <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Link to="/admin" className="hover:text-foreground">Admin</Link>
                {breadcrumbs?.map((b, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    <ChevronRight className="size-3.5" />
                    {b.to ? (
                      <Link to={b.to} className="hover:text-foreground">{b.label}</Link>
                    ) : (
                      <span className="text-foreground">{b.label}</span>
                    )}
                  </span>
                ))}
              </nav>
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium">
                  <span className="size-1.5 rounded-full bg-emerald-500" /> Production
                </span>
              </div>
            </div>
          </header>

          <main className="flex-1 min-w-0">
            <div className="mx-auto max-w-7xl px-6 py-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
                  {description && (
                    <p className="mt-1 text-sm text-muted-foreground max-w-2xl">{description}</p>
                  )}
                </div>
                {actions && <div className="flex items-center gap-2">{actions}</div>}
              </div>
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}