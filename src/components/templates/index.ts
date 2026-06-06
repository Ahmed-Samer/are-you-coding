import { ClassicTemplate } from "./classic/ClassicTemplate";
import { MinimalTemplate } from "./minimal/MinimalTemplate";
import { BoutiqueTemplate } from "./boutique/BoutiqueTemplate";
import { MarketTemplate } from "./market/MarketTemplate";
import { LuxeTemplate } from "./luxe/LuxeTemplate";
import { SportTemplate } from "./sport/SportTemplate";
import { TemplateSlug } from "@/lib/templates";

export const TemplateComponents: Record<TemplateSlug, React.ComponentType<any>> = {
  classic: ClassicTemplate,
  minimal: MinimalTemplate,
  boutique: BoutiqueTemplate,
  market: MarketTemplate,
  luxe: LuxeTemplate,
  sport: SportTemplate,
};
