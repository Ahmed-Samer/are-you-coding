import type { ResolvedTenant } from "@/lib/tenant.functions";
import type { Availability } from "@/lib/availability";

export type TemplateProps = {
  // Tenant & Branding
  tenant: ResolvedTenant;
  storeMeta: any;
  themeStyle: React.CSSProperties;
  accent: string | null;
  logoUrl: string | null;
  currency: string;
  announcement: string | null;
  availability: Availability;
  customDomain: string | null;

  // Catalog Data
  products: any[];
  categories: any[];
  featured: any[];
  heroSlides: { title: string; subtitle?: string; image?: string }[];

  // Filter & Pagination State
  search: string;
  activeCat: string | null;
  sort: string;
  visibleProducts: any[];
  totalFilteredCount: number;
  hasMore: boolean;
  isLoading: boolean;

  // Actions
  onSearchChange: (val: string) => void;
  onCategoryChange: (catId: string | null) => void;
  onSortChange: (sort: string) => void;
  onLoadMore: () => void;
  onSelectProduct: (p: any) => void;
  onQuickAdd: (p: any) => void;

  // Cart
  cartCount: number;
  onOpenCart: () => void;
};
