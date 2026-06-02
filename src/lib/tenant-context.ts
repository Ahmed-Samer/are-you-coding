import { createContext, useContext } from "react";
import type { TenantResolution } from "./tenant.functions";

export const TenantContext = createContext<TenantResolution | null>(null);

export function useTenant(): TenantResolution {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    // Default to platform when the provider hasn't mounted yet (e.g. error boundary).
    return { tenant: null, host: "", origin: "", isPlatform: true };
  }
  return ctx;
}
