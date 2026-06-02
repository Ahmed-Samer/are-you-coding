import { useEffect, useId, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLeadCapture } from "@/lib/use-lead-capture";

type Source = "exit_intent" | "inline_hero" | "sticky_cta";

export interface LeadCaptureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: Source;
  eyebrow?: string;
  title?: string;
  description?: string;
  cta?: string;
}

export function LeadCaptureModal({
  open,
  onOpenChange,
  source,
  eyebrow = "Before you go",
  title = "Get the retail launch playbook — free.",
  description = "A short PDF on launching a profitable WhatsApp-first store. No spam, unsubscribe anytime.",
  cta = "Send me the PDF",
}: LeadCaptureModalProps) {
  const [email, setEmail] = useState("");
  const inputId = useId();
  const { status, error, capture, reset } = useLeadCapture();

  // Reset internal state when reopened.
  useEffect(() => {
    if (open) {
      reset();
      setEmail("");
    }
  }, [open, reset]);

  const pending = status === "pending" || status === "validating";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {status === "success" ? (
          <>
            <DialogHeader>
              <DialogTitle>You're on the list.</DialogTitle>
              <DialogDescription>
                We just sent the retail launch playbook to your inbox.
              </DialogDescription>
            </DialogHeader>
            <Button className="mt-2 w-full" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </>
        ) : (
          <>
            <DialogHeader>
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {eyebrow}
              </span>
              <DialogTitle className="mt-2">{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await capture(email, source);
              }}
              className="mt-3"
              noValidate
            >
              <label htmlFor={inputId} className="sr-only">
                Email address
              </label>
              <div className="flex gap-2">
                <input
                  id={inputId}
                  type="email"
                  autoComplete="email"
                  required
                  disabled={pending}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  aria-invalid={status === "error"}
                  aria-describedby={status === "error" ? `${inputId}-err` : undefined}
                  className="flex-1 h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
                />
                <Button type="submit" className="h-10" disabled={pending}>
                  {pending ? <Loader2 className="size-4 animate-spin" /> : cta}
                </Button>
              </div>
              {status === "error" && error && (
                <p
                  id={`${inputId}-err`}
                  role="alert"
                  className="mt-2 text-sm text-destructive"
                >
                  {error}
                </p>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                We'll only email you the playbook and occasional product updates.
              </p>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}