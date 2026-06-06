import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useId, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { PlatformShell } from "@/components/shells/PlatformShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Mail, MessageCircle, MapPin, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { submitContactMessage } from "@/lib/contact.functions";
import { CONTACT_INFO } from "@/lib/contact-info";

const CONTACT_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "ContactPage",
  name: "Contact RentWebify",
  url: "/contact",
  description:
    "Talk to the RentWebify team — email, WhatsApp, or the contact form. We reply within one business day.",
};

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — RentWebify" },
      {
        name: "description",
        content:
          "Talk to the RentWebify team. Reach us by email, WhatsApp, or the contact form — we reply within one business day.",
      },
      { property: "og:title", content: "Contact — RentWebify" },
      {
        property: "og:description",
        content: "Get in touch by email, WhatsApp, or the contact form.",
      },
      { property: "og:url", content: "/contact" },
      { property: "og:image", content: "/og-image.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "/og-image.jpg" },
    ],
    links: [{ rel: "canonical", href: "/contact" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(CONTACT_JSON_LD),
      },
    ],
  }),
  component: ContactPage,
});

// Client-side validator. Server-side `ContactInput` remains authoritative.
const FormSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name.").max(120, "Name is too long."),
  email: z
    .string()
    .trim()
    .min(1, "Please enter your email.")
    .email("Please enter a valid email address.")
    .max(254, "Email is too long."),
  company: z.string().trim().max(160, "Company is too long.").optional(),
  message: z
    .string()
    .trim()
    .min(10, "Please write at least 10 characters.")
    .max(4000, "Message is too long."),
});

type FormValues = z.infer<typeof FormSchema>;
type FieldErrors = Partial<Record<keyof FormValues, string>>;
type Status = "idle" | "submitting" | "success" | "error";

const INITIAL_VALUES: FormValues = { name: "", email: "", company: "", message: "" };

function ContactPage() {
  const [values, setValues] = useState<FormValues>(INITIAL_VALUES);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<Status>("idle");
  const [serverError, setServerError] = useState<string | null>(null);
  const submit = useServerFn(submitContactMessage);

  const ids = {
    name: useId(),
    email: useId(),
    company: useId(),
    message: useId(),
    honeypot: useId(),
  };

  const update = useCallback(
    <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
      setValues((prev) => ({ ...prev, [key]: value }));
      setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
    },
    [],
  );

  const doSubmit = useCallback(
    async (next: FormValues) => {
      setStatus("submitting");
      setServerError(null);
      try {
        // Honeypot is read directly from the DOM at submit time.
        const honeypot =
          (document.getElementById(ids.honeypot) as HTMLInputElement | null)?.value ?? "";
        await submit({
          data: {
            name: next.name,
            email: next.email,
            company: next.company ? next.company : null,
            message: next.message,
            website: honeypot,
            referrer: typeof document !== "undefined" ? document.referrer || null : null,
            user_agent:
              typeof navigator !== "undefined" ? navigator.userAgent || null : null,
          },
        });
        setStatus("success");
        toast.success("Message sent", {
          description: "We'll get back to you within one business day.",
        });
      } catch (err) {
        const message =
          err instanceof Error && err.message
            ? err.message
            : "We couldn't send your message. Please try again.";
        setServerError(message);
        setStatus("error");
      }
    },
    [submit, ids.honeypot],
  );

  const onSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const parsed = FormSchema.safeParse(values);
      if (!parsed.success) {
        const next: FieldErrors = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path[0] as keyof FormValues | undefined;
          if (key && !next[key]) next[key] = issue.message;
        }
        setErrors(next);
        return;
      }
      setErrors({});
      await doSubmit(parsed.data);
    },
    [values, doSubmit],
  );

  const resetForm = useCallback(() => {
    setValues(INITIAL_VALUES);
    setErrors({});
    setServerError(null);
    setStatus("idle");
  }, []);

  const onRetry = useCallback(() => {
    void doSubmit(values);
  }, [doSubmit, values]);

  const sidebar = useMemo(
    () => (
      <aside className="lg:col-span-2 space-y-4">
        <ContactCard
          icon={Mail}
          title="Email"
          body={CONTACT_INFO.email}
          href={CONTACT_INFO.emailHref}
          cta="Send email"
        />
        <ContactCard
          icon={MessageCircle}
          title="WhatsApp"
          body="Fast replies during business hours."
          href={CONTACT_INFO.whatsappUrl}
          cta="Open WhatsApp"
        />
        <ContactCard icon={MapPin} title="Based in" body={CONTACT_INFO.location} />
      </aside>
    ),
    [],
  );

  return (
    <PlatformShell>
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-6 py-16">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Contact
          </span>
          <h1 className="mt-3 text-4xl sm:text-5xl font-semibold tracking-tight">
            Talk to us.
          </h1>
          <p className="mt-4 text-muted-foreground max-w-xl">
            Questions about templates, pricing, or migrating an existing store?
            We typically reply within one business day.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-12 grid lg:grid-cols-5 gap-10">
        <div className="lg:col-span-3">
          {status === "success" ? (
            <SuccessCard email={values.email} onReset={resetForm} />
          ) : (
            <form
              onSubmit={onSubmit}
              noValidate
              className="rounded-xl border border-border bg-card p-6 sm:p-8 space-y-5"
              aria-busy={status === "submitting"}
            >
              {status === "error" && serverError && (
                <Alert variant="destructive" role="alert">
                  <AlertTriangle className="size-4" />
                  <AlertTitle>Couldn't send your message</AlertTitle>
                  <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <span>{serverError}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={onRetry}
                      disabled={status === "submitting" as Status}
                    >
                      Try again
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid sm:grid-cols-2 gap-4">
                <Field
                  id={ids.name}
                  label="Name"
                  error={errors.name}
                >
                  <Input
                    id={ids.name}
                    name="name"
                    autoComplete="name"
                    placeholder="Your name"
                    value={values.name}
                    onChange={(e) => update("name", e.target.value)}
                    aria-invalid={Boolean(errors.name) || undefined}
                    aria-describedby={errors.name ? `${ids.name}-error` : undefined}
                    maxLength={120}
                  />
                </Field>
                <Field id={ids.email} label="Email" error={errors.email}>
                  <Input
                    id={ids.email}
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@company.com"
                    value={values.email}
                    onChange={(e) => update("email", e.target.value)}
                    aria-invalid={Boolean(errors.email) || undefined}
                    aria-describedby={errors.email ? `${ids.email}-error` : undefined}
                    maxLength={254}
                  />
                </Field>
              </div>

              <Field
                id={ids.company}
                label="Company (optional)"
                error={errors.company}
              >
                <Input
                  id={ids.company}
                  name="company"
                  autoComplete="organization"
                  placeholder="Acme Retail"
                  value={values.company ?? ""}
                  onChange={(e) => update("company", e.target.value)}
                  aria-invalid={Boolean(errors.company) || undefined}
                  aria-describedby={errors.company ? `${ids.company}-error` : undefined}
                  maxLength={160}
                />
              </Field>

              <Field id={ids.message} label="Message" error={errors.message}>
                <Textarea
                  id={ids.message}
                  name="message"
                  rows={6}
                  placeholder="Tell us what you're building…"
                  value={values.message}
                  onChange={(e) => update("message", e.target.value)}
                  aria-invalid={Boolean(errors.message) || undefined}
                  aria-describedby={errors.message ? `${ids.message}-error` : undefined}
                  maxLength={4000}
                />
              </Field>

              {/* Honeypot — hidden from real users and a11y tree. */}
              <div className="sr-only" aria-hidden="true">
                <label htmlFor={ids.honeypot}>Leave this field empty</label>
                <input
                  id={ids.honeypot}
                  name="website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  defaultValue=""
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <p className="text-xs text-muted-foreground">
                  We never share your details.
                </p>
                <Button
                  type="submit"
                  disabled={status === "submitting"}
                  className="h-10 px-6"
                >
                  {status === "submitting" ? "Sending…" : "Send message"}
                </Button>
              </div>
            </form>
          )}
        </div>

        {sidebar}
      </section>
    </PlatformShell>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      <p
        id={`${id}-error`}
        role={error ? "alert" : undefined}
        className="min-h-[1rem] text-xs text-destructive"
      >
        {error ?? ""}
      </p>
    </div>
  );
}

function SuccessCard({
  email,
  onReset,
}: {
  email: string;
  onReset: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-xl border border-border bg-card p-6 sm:p-8"
    >
      <div className="flex items-start gap-4">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <CheckCircle2 className="size-5" />
        </span>
        <div className="flex-1">
          <h2 className="text-xl font-semibold tracking-tight">Message received</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Thanks — we'll reply within one business day
            {email ? (
              <>
                {" "}to <span className="text-foreground">{email}</span>
              </>
            ) : null}
            . If it's urgent, ping us on WhatsApp.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" onClick={onReset}>
              Send another message
            </Button>
            <a
              href={CONTACT_INFO.whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent transition-colors"
            >
              Open WhatsApp
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function ContactCard({
  icon: Icon,
  title,
  body,
  href,
  cta,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  href?: string;
  cta?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary">
          <Icon className="size-4" />
        </span>
        <div className="flex-1">
          <h3 className="font-semibold text-sm">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{body}</p>
          {href && cta && (
            <a
              href={href}
              target={href.startsWith("http") ? "_blank" : undefined}
              rel={href.startsWith("http") ? "noreferrer" : undefined}
              className="mt-3 inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent transition-colors"
            >
              {cta}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
