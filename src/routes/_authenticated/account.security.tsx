import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PlatformShell } from "@/components/shells/PlatformShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { mapAuthError } from "@/lib/auth-errors";
import { recordMfaEnroll, recordMfaVerify } from "@/lib/auth-throttle.functions";
import { toast } from "sonner";
import { ShieldCheck, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/account/security")({
  head: () => ({ meta: [{ title: "Security — CoreWeb" }] }),
  component: SecurityPage,
});

type Factor = { id: string; friendly_name?: string | null; factor_type: string; status: string; created_at?: string };

export function SecurityPage() {
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollment, setEnrollment] = useState<{ factorId: string; qr: string; secret: string; uri: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [friendlyName, setFriendlyName] = useState("Authenticator");
  const [busy, setBusy] = useState(false);
  const recordEnroll = useServerFn(recordMfaEnroll);
  const recordVerify = useServerFn(recordMfaVerify);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) toast.error(error.message);
    const all = [...(data?.totp ?? [])] as Factor[];
    setFactors(all);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const startEnroll = async () => {
    setBusy(true);
    try {
      await recordEnroll();
    } catch (e) {
      setBusy(false);
      toast.error(mapAuthError(e));
      return;
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: friendlyName || `Authenticator ${Date.now()}`,
    });
    setBusy(false);
    if (error) { toast.error(mapAuthError(error)); return; }
    setEnrollment({
      factorId: data.id,
      qr: data.totp.qr_code,
      secret: data.totp.secret,
      uri: data.totp.uri,
    });
    setEnrollOpen(true);
  };

  const cancelEnroll = async () => {
    if (enrollment) {
      await supabase.auth.mfa.unenroll({ factorId: enrollment.factorId });
    }
    setEnrollment(null);
    setEnrollOpen(false);
    setVerifyCode("");
    void load();
  };

  const verifyEnroll = async () => {
    if (!enrollment) return;
    setBusy(true);
    try {
      await recordVerify();
    } catch (e) {
      setBusy(false);
      toast.error(mapAuthError(e));
      return;
    }
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: enrollment.factorId });
    if (chErr || !ch) { setBusy(false); toast.error(chErr?.message ?? "Could not start challenge"); return; }
    const { error } = await supabase.auth.mfa.verify({
      factorId: enrollment.factorId,
      challengeId: ch.id,
      code: verifyCode.trim(),
    });
    setBusy(false);
    if (error) { toast.error(mapAuthError(error)); return; }
    toast.success("Two-factor authentication enabled");
    setEnrollment(null);
    setEnrollOpen(false);
    setVerifyCode("");
    void load();
  };

  const unenroll = async (factorId: string) => {
    if (!confirm("Remove this two-factor method?")) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) { toast.error(error.message); return; }
    toast.success("Two-factor method removed");
    void load();
  };

  return (
    <PlatformShell>
      <div className="mx-auto max-w-2xl px-6 py-10">
        <nav className="text-xs text-muted-foreground mb-3">
          <Link to="/dashboard" className="hover:text-foreground">Dashboard</Link>
          <span className="mx-1.5">/</span>
          <span className="text-foreground">Security</span>
        </nav>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <ShieldCheck className="size-6" /> Account security
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add an authenticator app (TOTP) for an extra layer of protection at sign-in.
        </p>

        <section className="mt-8 rounded-lg border border-border p-5">
          <h2 className="text-base font-semibold">Two-factor authentication</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Use apps like 1Password, Authy, or Google Authenticator to generate one-time codes.
          </p>

          <div className="mt-5">
            {loading ? (
              <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
            ) : factors && factors.length > 0 ? (
              <ul className="divide-y divide-border border border-border rounded-md">
                {factors.map((f) => (
                  <li key={f.id} className="flex items-center justify-between px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{f.friendly_name || "Authenticator"}</p>
                      <p className="text-xs text-muted-foreground">
                        {f.factor_type.toUpperCase()} · {f.status}
                        {f.created_at ? ` · added ${new Date(f.created_at).toLocaleDateString()}` : ""}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => unenroll(f.id)} aria-label="Remove">
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No two-factor methods enrolled yet.</p>
            )}
          </div>

          {!enrollOpen && (
            <div className="mt-5 flex items-center gap-3">
              <div className="flex-1">
                <Label htmlFor="fname" className="text-xs">Device name</Label>
                <Input id="fname" value={friendlyName} onChange={(e) => setFriendlyName(e.target.value)} placeholder="My phone" />
              </div>
              <Button onClick={startEnroll} disabled={busy} className="self-end">
                {busy ? "Starting…" : "Add authenticator"}
              </Button>
            </div>
          )}

          {enrollOpen && enrollment && (
            <div className="mt-6 rounded-md border border-border p-4 bg-muted/30">
              <p className="text-sm font-medium mb-2">Scan this QR code with your authenticator app</p>
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                <img src={enrollment.qr} alt="TOTP QR code" width={160} height={160} decoding="async" className="size-40 rounded bg-white p-2 border border-border" />
                <div className="text-xs text-muted-foreground space-y-2 break-all">
                  <p>Or enter this secret manually:</p>
                  <code className="block rounded bg-background border border-border px-2 py-1 font-mono">{enrollment.secret}</code>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <Label htmlFor="code">Enter the 6-digit code</Label>
                <Input id="code" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                  value={verifyCode} onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456" />
              </div>
              <div className="mt-4 flex gap-2">
                <Button onClick={verifyEnroll} disabled={busy || verifyCode.length < 6}>
                  {busy ? "Verifying…" : "Verify & enable"}
                </Button>
                <Button variant="ghost" onClick={cancelEnroll} disabled={busy}>Cancel</Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </PlatformShell>
  );
}
