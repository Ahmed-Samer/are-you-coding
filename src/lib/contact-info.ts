// Centralized contact details. Override via VITE_CONTACT_* env vars if needed.

const env = import.meta.env as Record<string, string | undefined>;

const EMAIL = env.VITE_CONTACT_EMAIL ?? "hello@storefront.app";
const WHATSAPP_E164 = env.VITE_CONTACT_WHATSAPP ?? "+201000000000";
const LOCATION = env.VITE_CONTACT_LOCATION ?? "Cairo, Egypt — serving the MENA region.";

function digitsOnly(value: string): string {
  return value.replace(/[^\d]/g, "");
}

export function whatsappHref(e164: string = WHATSAPP_E164): string {
  return `https://wa.me/${digitsOnly(e164)}`;
}

export const CONTACT_INFO = {
  email: EMAIL,
  emailHref: `mailto:${EMAIL}`,
  whatsappE164: WHATSAPP_E164,
  whatsappDisplay: WHATSAPP_E164,
  whatsappUrl: whatsappHref(WHATSAPP_E164),
  location: LOCATION,
} as const;

export type ContactInfo = typeof CONTACT_INFO;