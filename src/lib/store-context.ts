import { createContext, useContext } from "react";

export type Tenant = {
  id: string;
  slug: string;
  name: string;
  template?: string | null;
  whatsapp_e164: string | null;
  status: string;
  logo_url?: string | null;
  accent_color?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  og_image_url?: string | null;
  currency?: string | null;
  low_stock_threshold?: number | null;
};

export type StoreCtx = { tenant: Tenant };
export const StoreContext = createContext<StoreCtx | null>(null);

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("StoreContext missing");
  return ctx;
}
