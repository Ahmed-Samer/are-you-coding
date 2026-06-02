import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  code: string;
  onChange: (next: string) => void;
  onVerify: () => void;
  onCancel: () => void;
  busy: boolean;
  errorMessage: string | null;
};

export default function LoginMfaChallenge({
  code,
  onChange,
  onVerify,
  onCancel,
  busy,
  errorMessage,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Lightweight focus trap: keep Tab cycling within the card.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusables = node.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    node.addEventListener("keydown", handler);
    return () => node.removeEventListener("keydown", handler);
  }, []);

  return (
    <div ref={containerRef} className="mx-auto max-w-md px-6 py-16">
      <div role="status" aria-live="assertive" className="sr-only">
        Two-factor verification required.
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Two-factor verification</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Enter the 6-digit code from your authenticator app to finish signing in.
      </p>
      <div
        aria-live="polite"
        role="alert"
        className="mt-4 min-h-[2.5rem]"
      >
        {errorMessage ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {errorMessage}
          </p>
        ) : null}
      </div>
      <div className="mt-2 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="mfa">Authentication code</Label>
          <Input
            ref={inputRef}
            id="mfa"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && code.length === 6 && !busy) onVerify();
            }}
            placeholder="123456"
          />
        </div>
        <Button
          className="w-full"
          onClick={onVerify}
          disabled={busy || code.length < 6}
        >
          {busy ? "Verifying…" : "Verify"}
        </Button>
        <div className="space-y-2">
          <Button
            variant="ghost"
            className="w-full"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel and sign out
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            Cancelling will sign you out and return to the sign-in form.
          </p>
        </div>
      </div>
    </div>
  );
}