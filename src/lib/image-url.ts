// Build responsive `srcset` entries for Supabase-Storage public image URLs.
//
// Supabase's image transformation endpoint accepts `?width=&height=&format=`
// query params on `/storage/v1/render/image/public/*` URLs (and falls back
// to the original on `/storage/v1/object/public/*` paths when the project
// doesn't have transformations enabled). We do best-effort URL rewriting
// — never request-time Node image processing — so a non-Supabase URL is
// returned unchanged.

const SUPABASE_PUBLIC_OBJECT = "/storage/v1/object/public/";
const SUPABASE_PUBLIC_RENDER = "/storage/v1/render/image/public/";

function isSupabaseStorageUrl(u: URL): boolean {
  return (
    u.pathname.startsWith(SUPABASE_PUBLIC_OBJECT) ||
    u.pathname.startsWith(SUPABASE_PUBLIC_RENDER)
  );
}

function withTransform(src: string, width: number, format?: "webp" | "jpeg"): string | null {
  let u: URL;
  try {
    u = new URL(src);
  } catch {
    return null;
  }
  if (!isSupabaseStorageUrl(u)) return null;
  if (u.pathname.startsWith(SUPABASE_PUBLIC_OBJECT)) {
    u.pathname = u.pathname.replace(SUPABASE_PUBLIC_OBJECT, SUPABASE_PUBLIC_RENDER);
  }
  u.searchParams.set("width", String(width));
  if (format) u.searchParams.set("format", format);
  u.searchParams.set("resize", "contain");
  return u.toString();
}

/**
 * Build a `srcset` string for the given widths. Returns `undefined` when
 * the URL is not a Supabase Storage URL (caller should fall back to `src`
 * alone).
 */
export function buildSrcSet(
  src: string | null | undefined,
  widths: number[],
  format?: "webp" | "jpeg",
): string | undefined {
  if (!src) return undefined;
  const parts: string[] = [];
  for (const w of widths) {
    const u = withTransform(src, w, format);
    if (!u) return undefined;
    parts.push(`${u} ${w}w`);
  }
  return parts.join(", ");
}

export const HERO_WIDTHS = [640, 960, 1280, 1600];
export const CARD_WIDTHS = [320, 480, 640, 960];
