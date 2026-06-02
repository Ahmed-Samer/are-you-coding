import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { listFeatureFlags, toggleFeatureFlag } from "@/lib/admin.functions";

const flagsQuery = queryOptions({
  queryKey: ["admin", "flags"],
  queryFn: () => listFeatureFlags(),
});

export const Route = createFileRoute("/_authenticated/admin/flags")({
  head: () => ({ meta: [{ title: "Admin — Feature flags" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(flagsQuery),
  component: FlagsPage,
});

type Flag = { key: string; description: string | null; enabled: boolean; rollout_percent: number };

export function FlagsPage() {
  const { data } = useSuspenseQuery(flagsQuery);
  const qc = useQueryClient();
  const toggleFn = useServerFn(toggleFeatureFlag);

  const mutate = useMutation({
    mutationFn: (input: { key: string; enabled: boolean; rolloutPercent?: number; description?: string }) =>
      toggleFn({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "flags"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const flags = (data.flags ?? []) as Flag[];

  return (
    <AdminShell
      title="Feature flags"
      description="Gradually roll out experimental features to all tenants."
      breadcrumbs={[{ label: "Feature flags" }]}
    >
      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        {flags.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">No feature flags yet.</div>
        )}
        {flags.map((f) => (
          <div key={f.key} className="p-5 flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <code className="text-sm font-mono font-semibold">{f.key}</code>
              <p className="mt-1 text-sm text-muted-foreground">{f.description ?? "—"}</p>
              <div className="mt-3 flex items-center gap-3 max-w-md">
                <Slider
                  value={[f.rollout_percent ?? 0]}
                  max={100}
                  step={5}
                  disabled={!f.enabled}
                  onValueCommit={([v]) =>
                    mutate.mutate({ key: f.key, enabled: f.enabled, rolloutPercent: v })
                  }
                />
                <span className="text-xs font-medium tabular-nums w-10 text-right">
                  {f.rollout_percent ?? 0}%
                </span>
              </div>
            </div>
            <Switch
              checked={f.enabled}
              onCheckedChange={(v) => {
                mutate.mutate({ key: f.key, enabled: v, rolloutPercent: f.rollout_percent });
                toast.success(`${f.key} ${v ? "enabled" : "disabled"}`);
              }}
            />
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
