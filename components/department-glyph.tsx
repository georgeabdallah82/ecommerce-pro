import { createElement } from 'react'
import { Baby, Bath, BedDouble, Boxes, Briefcase, CookingPot, CupSoda, Droplets, Flame, Gift, House, Leaf, Milk, Package, PawPrint, Percent, Plug, ScrollText, Shirt, ShoppingBag, ShoppingBasket, Sofa, Sparkles, SprayCan, Star, WashingMachine, type LucideIcon } from 'lucide-react'
import { categoryGlyph, type CategoryGlyph } from '@/lib/category-glyph'

// Department line icons. lib/category-glyph.ts picks one from a category's name, so a collection without a
// photo of its own reads as a department (a pot for kitchen, a spray can for cleaning) rather than a repeated
// placeholder. Shared by the homepage's category strip, the collections page and the menus.
export const GLYPH_ICONS: Record<CategoryGlyph, LucideIcon> = { trending: Flame, featured: Star, new: Sparkles, bulk: Boxes, sale: Percent, paper: ScrollText, laundry: WashingMachine, cleaning: SprayCan, kitchen: CookingPot, drinks: CupSoda, bottles: Milk, grocery: ShoppingBasket, bath: Bath, pets: PawPrint, baby: Baby, care: Droplets, garden: Leaf, bedding: BedDouble, furniture: Sofa, electronics: Plug, office: Briefcase, fashion: Shirt, gifts: Gift, storage: Package, home: House, other: ShoppingBag }

// Decorative: the department's name is always written beside it.
export function DepartmentGlyph({ name, size = 32, strokeWidth = 1.6 }: { name: string; size?: number; strokeWidth?: number }) {
  return createElement(GLYPH_ICONS[categoryGlyph(name)], { size, strokeWidth, 'aria-hidden': true })
}
