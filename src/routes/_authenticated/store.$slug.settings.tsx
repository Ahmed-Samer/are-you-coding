import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useStore } from "./store.$slug";
import { updateTenantSettings, deleteTenant } from "@/lib/catalog.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DAY_KEYS, DAY_LABELS, DEFAULT_TIMEZONE, TIMEZONE_OPTIONS,
  defaultBusinessHours, getAvailability,
  type BusinessHours, type DayKey,
} from "@/lib/availability";

export const Route = createFileRoute("/_authenticated/store/$slug/settings")({
  component: SettingsPage,
});

const CURRENCIES = ["EGP", "USD", "EUR", "GBP", "SAR", "AED", "KWD"] as const;

function SettingsPage() {
  const { tenant } = useStore();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const update = useServerFn(updateTenantSettings);
  const remove = useServerFn(deleteTenant);

  const [phone, setPhone] = useState(tenant.whatsapp_e164 ?? "");
  const [logoUrl, setLogoUrl] = useState<string | null>((tenant as any).logo_url ?? null);
  const [accent, setAccent] = useState<string>((tenant as any).accent_color ?? "#0f172a");
  const [seoTitle, setSeoTitle] = useState((tenant as any).seo_title ?? "");
  const [seoDesc, setSeoDesc] = useState((tenant as any).seo_description ?? "");
  const [ogImage, setOgImage] = useState<string | null>((tenant as any).og_image_url ?? null);
  const [currency, setCurrency] = useState((tenant as any).currency ?? "EGP");
  const [lowStock, setLowStock] = useState<number>((tenant as any).low_stock_threshold ?? 5);
  const [timezone, setTimezone] = useState<string>((tenant as any).timezone ?? DEFAULT_TIMEZONE);
  const [acceptingOrders, setAcceptingOrders] = useState<boolean>(
    (tenant as any).is_accepting_orders !== false,
  );
  const [hours, setHours] = useState<BusinessHours>(
    ((tenant as any).business_hours as BusinessHours | null) ?? defaultBusinessHours(),
  );
  const [uploading, setUploading] = useState<null | "logo" | "og">(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteText, setDeleteText] = useState("");

  const mut = useMutation({
    mutationFn: (input: any) => update({ data: input }),
    onSuccess: () => {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["my-tenant", tenant.slug] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const delMut = useMutation({
    mutationFn: () => remove({ data: { tenantId: tenant.id, confirmSlug: deleteText } }),
    onSuccess: () => {
      toast.success("Store deleted");
      qc.invalidateQueries({ queryKey: ["my-tenants"] });
      navigate({ to: "/dashboard" });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  async function handleUpload(file: File, kind: "logo" | "og") {
    setUploading(kind);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${tenant.id}/branding/${kind}-${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("tenant-assets").upload(path, file, {
        cacheControl: "3600", upsert: false, contentType: file.type,
      });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("tenant-assets").getPublicUrl(path);
      if (kind === "logo") setLogoUrl(pub.publicUrl);
      else setOgImage(pub.publicUrl);
      toast.success(`${kind === "logo" ? "Logo" : "OG image"} uploaded`);
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Branding */}
      <Section title="Branding" description="Customize how your storefront looks.">
        <div>
          <Label>Logo</Label>
          <div className="flex items-center gap-4 flex-wrap">
            {logoUrl ? (
              <img src={logoUrl} alt="" width={64} height={64} loading="lazy" decoding="async" className="size-16 rounded-md object-cover border border-border" />
            ) : (
              <div className="size-16 rounded-md bg-muted border border-border" />
            )}
            <Input type="file" accept="image/*" disabled={uploading === "logo"}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, "logo"); }} />
            {logoUrl && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setLogoUrl(null)}>Remove</Button>
            )}
          </div>
        </div>
        <div>
          <Label htmlFor="accent">Accent color</Label>
          <div className="flex items-center gap-2">
            <input
              id="accent" type="color" value={accent}
              onChange={(e) => setAccent(e.target.value)}
              className="h-10 w-12 rounded-md border border-input bg-background cursor-pointer"
            />
            <Input
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              placeholder="#0f172a"
              className="font-mono text-sm"
            />
          </div>
        </div>
        <SaveButton
          loading={mut.isPending}
          onClick={() => mut.mutate({ tenantId: tenant.id, logoUrl, accentColor: accent || null })}
        />
      </Section>

      {/* SEO */}
      <Section title="SEO" description="How your store appears in search results and on social media.">
        <div>
          <Label htmlFor="seoTitle">Meta title</Label>
          <Input id="seoTitle" maxLength={60} value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} placeholder={tenant.name} />
          <p className="mt-1 text-xs text-muted-foreground">{seoTitle.length}/60</p>
        </div>
        <div>
          <Label htmlFor="seoDesc">Meta description</Label>
          <Textarea id="seoDesc" maxLength={160} rows={3} value={seoDesc} onChange={(e) => setSeoDesc(e.target.value)} />
          <p className="mt-1 text-xs text-muted-foreground">{seoDesc.length}/160</p>
        </div>
        <div>
          <Label>Open Graph image (1200×630)</Label>
          <div className="flex items-center gap-4 flex-wrap">
            {ogImage && <img src={ogImage} alt="" width={122} height={64} loading="lazy" decoding="async" className="h-16 rounded-md object-cover border border-border" />}
            <Input type="file" accept="image/*" disabled={uploading === "og"}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, "og"); }} />
            {ogImage && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setOgImage(null)}>Remove</Button>
            )}
          </div>
        </div>
        <SaveButton
          loading={mut.isPending}
          onClick={() => mut.mutate({
            tenantId: tenant.id,
            seoTitle: seoTitle.trim() || null,
            seoDescription: seoDesc.trim() || null,
            ogImageUrl: ogImage,
          })}
        />
      </Section>

      {/* Commerce */}
      <Section title="Commerce" description="Currency, inventory, and customer messaging.">
        <div>
          <Label>Default currency</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="lowstock">Low stock threshold</Label>
          <Input id="lowstock" type="number" min={0} value={lowStock} onChange={(e) => setLowStock(parseInt(e.target.value) || 0)} />
          <p className="mt-1 text-xs text-muted-foreground">Products at or below this stock level are flagged as low.</p>
        </div>
        <div>
          <Label>WhatsApp number for orders</Label>
          <Input
            placeholder="e.g. 201001234567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            E.164 format without the leading "+". Customers' orders will be sent to this number.
          </p>
        </div>
        <SaveButton
          loading={mut.isPending}
          onClick={() => mut.mutate({
            tenantId: tenant.id,
            currency,
            lowStockThreshold: lowStock,
            whatsappE164: phone.replace(/\D/g, "") || null,
          })}
        />
      </Section>

      {/* Availability */}
      <AvailabilitySection
        timezone={timezone}
        setTimezone={setTimezone}
        acceptingOrders={acceptingOrders}
        setAcceptingOrders={setAcceptingOrders}
        hours={hours}
        setHours={setHours}
        saving={mut.isPending}
        onSave={() => mut.mutate({
          tenantId: tenant.id,
          timezone,
          isAcceptingOrders: acceptingOrders,
          businessHours: hours,
        })}
      />



      {/* Domain */}
      <Section title="Custom domain" description="Connect your own domain to your storefront.">
        <p className="text-sm text-muted-foreground">
          Currently serving on <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{tenant.slug}.coreweb.app</code>.
        </p>
        <Link to="/store/$slug/domains" params={{ slug: tenant.slug }}>
          <Button variant="outline" size="sm">Set up custom domain</Button>
        </Link>
      </Section>

      {/* Danger zone */}
      <Section title="Danger zone" description="Irreversible and destructive actions." danger>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4">
          <div>
            <div className="font-medium text-sm">Delete this store</div>
            <p className="text-xs text-muted-foreground mt-1">
              Permanently delete <strong>{tenant.name}</strong> and all its products, categories, and orders.
            </p>
          </div>
          <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>Delete store</Button>
        </div>
      </Section>

      <Dialog open={confirmDelete} onOpenChange={(v) => { setConfirmDelete(v); if (!v) setDeleteText(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this store?</DialogTitle>
            <DialogDescription>
              This is permanent and cannot be undone. Type the store address{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{tenant.slug}</code> below to confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="del-confirm" className="text-xs">Confirm store address</Label>
            <Input
              id="del-confirm"
              autoFocus
              value={deleteText}
              onChange={(e) => setDeleteText(e.target.value)}
              placeholder={tenant.slug}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={delMut.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={delMut.isPending || deleteText.trim() !== tenant.slug}
              onClick={() => delMut.mutate()}
            >
              {delMut.isPending ? "Deleting…" : "Permanently delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({
  title, description, children, danger = false,
}: {
  title: string; description?: string; children: React.ReactNode; danger?: boolean;
}) {
  return (
    <section className={`rounded-lg border bg-card p-5 sm:p-6 space-y-4 ${danger ? "border-destructive/30" : "border-border"}`}>
      <div>
        <h3 className={`text-base font-semibold ${danger ? "text-destructive" : ""}`}>{title}</h3>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function SaveButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <div>
      <Button type="button" size="sm" disabled={loading} onClick={onClick}>
        {loading ? "Saving…" : "Save changes"}
      </Button>
    </div>
  );
}

function AvailabilitySection({
  timezone, setTimezone, acceptingOrders, setAcceptingOrders,
  hours, setHours, saving, onSave,
}: {
  timezone: string;
  setTimezone: (v: string) => void;
  acceptingOrders: boolean;
  setAcceptingOrders: (v: boolean) => void;
  hours: BusinessHours;
  setHours: (v: BusinessHours) => void;
  saving: boolean;
  onSave: () => void;
}) {
  const tenantPreview = { timezone, is_accepting_orders: acceptingOrders, business_hours: hours };
  const avail = getAvailability(tenantPreview);
  const setDay = (day: DayKey, patch: Partial<{ open: boolean; ranges: { start: string; end: string }[] }>) => {
    const cur = hours[day] ?? { open: false, ranges: [] };
    setHours({ ...hours, [day]: { ...cur, ...patch } });
  };
  const setRange = (day: DayKey, idx: number, which: "start" | "end", value: string) => {
    const cur = hours[day] ?? { open: true, ranges: [{ start: "09:00", end: "22:00" }] };
    const next = cur.ranges.map((r, i) => (i === idx ? { ...r, [which]: value } : r));
    setHours({ ...hours, [day]: { ...cur, ranges: next } });
  };

  return (
    <Section title="Availability & Business Hours" description="Control when customers can place orders.">
      {/* Manual pause override */}
      <div
        className={`rounded-md border p-4 flex items-center justify-between gap-4 ${
          acceptingOrders ? "border-border bg-card" : "border-destructive/40 bg-destructive/5"
        }`}
      >
        <div className="min-w-0">
          <div className="font-medium text-sm flex items-center gap-2">
            Pause orders
            {!acceptingOrders && (
              <span className="text-[10px] uppercase font-semibold tracking-wider text-destructive">
                Overrides schedule
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            When paused, the storefront refuses checkout regardless of business hours.
          </p>
        </div>
        <Switch
          checked={!acceptingOrders}
          onCheckedChange={(v) => setAcceptingOrders(!v)}
          aria-label="Pause orders"
        />
      </div>

      {/* Status preview */}
      <div className="flex items-center gap-2 text-sm">
        <span
          className={`inline-block size-2 rounded-full ${avail.isOpen ? "bg-emerald-500" : "bg-destructive"}`}
          aria-hidden
        />
        <span className="font-medium">
          {avail.isOpen
            ? "Currently open"
            : avail.reason === "paused"
            ? "Currently paused"
            : "Currently closed (outside hours)"}
        </span>
        <span className="text-xs text-muted-foreground">— {timezone}</span>
      </div>

      {/* Timezone */}
      <div>
        <Label>Timezone</Label>
        <Select value={timezone} onValueChange={setTimezone}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-72">
            {TIMEZONE_OPTIONS.map((tz) => (
              <SelectItem key={tz} value={tz}>{tz}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-1 text-xs text-muted-foreground">Business hours are evaluated in this timezone.</p>
      </div>

      {/* Weekly schedule */}
      <div className="space-y-2">
        <Label>Weekly schedule</Label>
        <div className="rounded-md border border-border divide-y divide-border">
          {DAY_KEYS.map((d) => {
            const day = hours[d] ?? { open: false, ranges: [{ start: "09:00", end: "22:00" }] };
            const r0 = day.ranges[0] ?? { start: "09:00", end: "22:00" };
            return (
              <div key={d} className="flex items-center gap-3 p-3 flex-wrap">
                <div className="w-24 text-sm font-medium">{DAY_LABELS[d]}</div>
                <Switch
                  checked={day.open}
                  onCheckedChange={(v) =>
                    setDay(d, {
                      open: v,
                      ranges: day.ranges.length > 0 ? day.ranges : [{ start: "09:00", end: "22:00" }],
                    })
                  }
                  aria-label={`${DAY_LABELS[d]} open`}
                />
                <span className="text-xs text-muted-foreground w-14">
                  {day.open ? "Open" : "Closed"}
                </span>
                {day.open && (
                  <div className="flex items-center gap-2 ml-auto">
                    <Input
                      type="time"
                      value={r0.start}
                      onChange={(e) => setRange(d, 0, "start", e.target.value)}
                      className="h-9 w-28"
                    />
                    <span className="text-xs text-muted-foreground">to</span>
                    <Input
                      type="time"
                      value={r0.end}
                      onChange={(e) => setRange(d, 0, "end", e.target.value)}
                      className="h-9 w-28"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          End time before start time wraps past midnight (e.g. 18:00 → 02:00).
        </p>
      </div>

      <SaveButton loading={saving} onClick={onSave} />
    </Section>
  );
}
