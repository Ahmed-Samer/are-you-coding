import { toast } from "sonner";
import { makeLineKey, type useCart } from "@/lib/cart";

export function setMeta(name: string, content: string, property = false) {
  if (typeof document === "undefined") return;
  const attr = property ? "property" : "name";
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export function quickAdd(cart: ReturnType<typeof useCart>, p: any) {
  if (p.has_variants) { toast.info("Choose options first"); return; }
  if (p.stock <= 0) { toast.error("Out of stock"); return; }
  cart.add({
    lineKey: makeLineKey(p.id, null),
    productId: p.id,
    variantId: null,
    variantLabel: null,
    name: p.name,
    priceCents: p.price_cents,
    imageUrl: p.image_url,
  });
  toast.success(`Added ${p.name} to cart`);
}

export type StoreTheme = Record<string, any>;
