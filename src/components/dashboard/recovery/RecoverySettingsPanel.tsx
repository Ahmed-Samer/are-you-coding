import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { updateCartRecoverySettings } from "@/lib/abandoned-carts.functions";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const DEFAULT_TEMPLATE =
  "Hi {{customer_name}}, you left items in your {{store_name}} cart. " +
  "Tap to complete your order: {{recovery_link}}";

const DELAYS: { value: 30 | 60 | 120 | 360; label: string }[] = [
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 360, label: "6 hours" },
];

export function RecoverySettingsPanel({
  tenantId,
  tenantSlug,
  storeName,
  initialEnabled,
  initialDelayMinutes,
  initialMessageTemplate,
}: {
  tenantId: string;
  tenantSlug: string;
  storeName: string;
  initialEnabled: boolean;
  initialDelayMinutes: 30 | 60 | 120 | 360;
  initialMessageTemplate: string | null;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [delay, setDelay] = useState<30 | 60 | 120 | 360>(initialDelayMinutes);
  const [template, setTemplate] = useState<string>(initialMessageTemplate ?? "");

  const queryClient = useQueryClient();
  const save = useServerFn(updateCartRecoverySettings);
  const mut = useMutation({
    mutationFn: () =>
      save({
        data: {
          tenantId,
          enabled,
          delayMinutes: delay,
          messageTemplate: template.trim() ? template.trim() : null,
        },
      }),
    onSuccess: () => {
      toast.success("Recovery settings saved");
      queryClient.invalidateQueries({ queryKey: ["my-tenant", tenantSlug] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  const previewBody = useMemo(() => {
    const body = template.trim() || DEFAULT_TEMPLATE;
    return body
      .replace(/\{\{\s*store_name\s*\}\}/g, storeName)
      .replace(/\{\{\s*customer_name\s*\}\}/g, "Sarah")
      .replace(/\{\{\s*recovery_link\s*\}\}/g, "https://yourstore.com/?recover=…");
  }, [template, storeName]);

  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-5 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">WhatsApp cart recovery</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Send a one-time WhatsApp nudge after a customer abandons their cart.
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
          aria-label="Enable cart recovery"
        />
      </div>

      <div className={enabled ? "space-y-5" : "space-y-5 opacity-60"}>
        <div>
          <Label className="text-xs">Wait time before sending</Label>
          <Select value={String(delay)} onValueChange={(v) => setDelay(Number(v) as 30 | 60 | 120 | 360)}>
            <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DELAYS.map((d) => (
                <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="recovery-template" className="text-xs">Message template</Label>
          <Textarea
            id="recovery-template"
            rows={4}
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            placeholder={DEFAULT_TEMPLATE}
            className="mt-1 font-mono text-xs"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Tokens: <code>{"{{store_name}}"}</code>, <code>{"{{customer_name}}"}</code>, <code>{"{{recovery_link}}"}</code>
          </p>
        </div>

        <div>
          <Label className="text-xs">Preview</Label>
          <div className="mt-1 rounded-md border border-border bg-muted/30 p-3 text-xs whitespace-pre-wrap">
            {previewBody}
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </div>
  );
}