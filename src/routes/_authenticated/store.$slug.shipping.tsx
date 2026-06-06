import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronLeft } from "lucide-react";
import { useStore } from "@/lib/store-context";
import { updateTenantSettings } from "@/lib/catalog.functions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ARAB_COUNTRIES } from "@/lib/countries";

export const Route = createFileRoute("/_authenticated/store/$slug/shipping")({
  component: ShippingSettingsPage,
});

function ShippingSettingsPage() {
  const { tenant } = useStore();
  const qc = useQueryClient();
  const update = useServerFn(updateTenantSettings);

  // Initialize from DB. Fallback to empty object if not set.
  const initialZones = (tenant as any).shipping_zones || {};
  const [zones, setZones] = useState<any>(initialZones);

  const mut = useMutation({
    mutationFn: (input: any) => update({ data: input }),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["my-tenant", tenant.slug] });
      const prev = qc.getQueryData<any>(["my-tenant", tenant.slug]);
      qc.setQueryData(["my-tenant", tenant.slug], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          tenant: { ...old.tenant, shipping_zones: input.shippingZones },
        };
      });
      toast.success("Shipping zones saved");
      return { prev };
    },
    onError: (e: any, _v, ctx: any) => {
      if (ctx?.prev) qc.setQueryData(["my-tenant", tenant.slug], ctx.prev);
      toast.error(e.message ?? "Failed to save shipping zones");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["my-tenant", tenant.slug] });
    },
  });

  const handleCountryToggle = (countryId: string, active: boolean) => {
    setZones((prev: any) => {
      const next = { ...prev };
      if (!next[countryId]) {
        next[countryId] = { active, states: {} };
      } else {
        next[countryId].active = active;
      }
      return next;
    });
  };

  const handleStateToggle = (countryId: string, stateId: string, active: boolean) => {
    setZones((prev: any) => {
      const next = { ...prev };
      if (!next[countryId]) {
        next[countryId] = { active: true, states: {} };
      }
      if (!next[countryId].states) {
        next[countryId].states = {};
      }
      if (!next[countryId].states[stateId]) {
        next[countryId].states[stateId] = { active, feeCents: 10000 }; // default 100
      } else {
        next[countryId].states[stateId].active = active;
      }
      return next;
    });
  };

  const handleFeeChange = (countryId: string, stateId: string, value: string) => {
    const numeric = parseInt(value, 10);
    if (isNaN(numeric)) return;
    setZones((prev: any) => {
      const next = { ...prev };
      if (next[countryId] && next[countryId].states && next[countryId].states[stateId]) {
        next[countryId].states[stateId].feeCents = numeric;
      }
      return next;
    });
  };

  const handleSave = () => {
    mut.mutate({
      tenantId: tenant.id,
      shippingZones: zones,
    });
  };

  return (
    <div className="max-w-3xl space-y-6 pb-20">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/store/$slug/settings" params={{ slug: tenant.slug }}>
          <Button variant="ghost" size="icon" className="size-8">
            <ChevronLeft className="size-4" />
          </Button>
        </Link>
        <div>
          <h2 className="text-xl font-semibold">Dynamic Shipping Zones</h2>
          <p className="text-sm text-muted-foreground">
            Configure delivery fees by country and state. Only selected areas will be shown to customers during checkout.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {ARAB_COUNTRIES.map((country) => {
          const isCountryActive = !!zones[country.id]?.active;
          return (
            <div key={country.id} className="rounded-lg border border-border bg-card overflow-hidden">
              {/* Country Header */}
              <div className="flex items-center justify-between p-4 bg-muted/50 border-b border-border">
                <div className="font-semibold">{country.name}</div>
                <Switch
                  checked={isCountryActive}
                  onCheckedChange={(v) => handleCountryToggle(country.id, v)}
                  aria-label={`Enable shipping to ${country.name}`}
                />
              </div>

              {/* States List */}
              {isCountryActive && (
                <div className="p-4 divide-y divide-border">
                  {country.states.map((state) => {
                    const stateData = zones[country.id]?.states?.[state.id];
                    const isStateActive = !!stateData?.active;
                    const feeValue = stateData ? Math.floor((stateData.feeCents || 0) / 100).toString() : "100";

                    return (
                      <div key={state.id} className="flex items-center justify-between py-3 flex-wrap gap-4">
                        <div className="flex items-center gap-3">
                          <Switch
                            checked={isStateActive}
                            onCheckedChange={(v) => handleStateToggle(country.id, state.id, v)}
                            aria-label={`Enable shipping to ${state.name}`}
                          />
                          <Label className="text-sm font-medium leading-none cursor-pointer">
                            {state.name}
                          </Label>
                        </div>
                        
                        {isStateActive && (
                          <div className="flex items-center gap-2">
                            <Label className="text-xs text-muted-foreground">Fee:</Label>
                            <div className="relative w-32">
                              <Input
                                type="number"
                                min="0"
                                value={feeValue}
                                onChange={(e) => handleFeeChange(country.id, state.id, (parseInt(e.target.value) * 100).toString())}
                                className="pr-10 h-8"
                              />
                              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                {(tenant as any).currency || "EGP"}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border flex justify-end z-10 lg:pl-56">
        <div className="max-w-6xl w-full mx-auto flex justify-end">
          <Button disabled={mut.isPending} onClick={handleSave} size="lg">
            {mut.isPending ? "Saving..." : "Save Shipping Zones"}
          </Button>
        </div>
      </div>
    </div>
  );
}
