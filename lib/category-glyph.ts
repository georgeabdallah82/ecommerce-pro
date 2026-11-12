// The department glyph a category gets when it has no photo, picked from its name, so the category strip shows
// a kitchen pot for "Kitchen" and a spray can for "Cleaning" instead of one placeholder for everything.
// The storefront maps each glyph to a line icon. The first rule that matches wins, so specific departments come
// before broad words such as "home" or "essentials". Anything unrecognised gets a shopping bag.

export type CategoryGlyph =
  | 'trending' | 'featured' | 'new' | 'bulk' | 'sale' | 'paper' | 'laundry' | 'cleaning' | 'kitchen' | 'drinks'
  | 'bottles' | 'grocery' | 'bath' | 'pets' | 'baby' | 'care' | 'garden' | 'bedding' | 'furniture' | 'electronics'
  | 'office' | 'fashion' | 'gifts' | 'storage' | 'home' | 'other'

const RULES: [RegExp, CategoryGlyph][] = [
  [/best ?sell|popular|trending|top rated|الأكثر مبيع/i, 'trending'],
  [/featur|staff pick|editor|مميز/i, 'featured'],
  [/\bnew\b|arrival|just in|latest|جديد/i, 'new'],
  [/bulk|wholesale|\bpacks?\b|bundle|جملة/i, 'bulk'],
  [/\bsales?\b|deal|offer|discount|clearance|promo|عروض|تخفيض/i, 'sale'],
  [/\bpets?\b|\bdogs?\b|\bcats?\b|حيوان/i, 'pets'],
  [/baby|\bkids?\b|child|diaper|nappy|أطفال|طفل/i, 'baby'],
  [/tissue|paper|napkin|\brolls?\b|toilet|wipes|مناديل|محارم/i, 'paper'],
  [/laundry|detergent|غسيل/i, 'laundry'],
  [/clean|disinfect|hygien|sanit|تنظيف|منظف/i, 'cleaning'],
  [/kitchen|cook|bakeware|\bpans?\b|\bpots?\b|dining|tableware|cutlery|مطبخ/i, 'kitchen'],
  [/drink|beverage|water|juice|soda|coffee|\btea\b|مشروب/i, 'drinks'],
  [/bottle|container|\bjars?\b|عبوات|قناني/i, 'bottles'],
  [/food|grocer|pantry|snack|bakery|bread|بقالة|طعام/i, 'grocery'],
  [/\bbath|shower|towel|حمام/i, 'bath'],
  [/care|beauty|skin|cosmetic|personal|\bhair|عناية|تجميل/i, 'care'],
  [/garden|plant|outdoor|حديقة/i, 'garden'],
  [/\bbed|pillow|sleep|نوم/i, 'bedding'],
  [/sofa|furniture|living|decor|\blamps?\b|lighting|أثاث|ديكور/i, 'furniture'],
  [/electr|appliance|phone|gadget|\btech|أجهزة|إلكترون/i, 'electronics'],
  [/office|stationer|school|\bdesk|مكتب|قرطاسية/i, 'office'],
  [/fashion|cloth|apparel|shirt|wear\b|أزياء|ملابس/i, 'fashion'],
  [/gift|هدايا|هدية/i, 'gifts'],
  [/storage|organi[sz]|تخزين/i, 'storage'],
  [/home|house|household|essential|منزل|بيت/i, 'home'],
]

export function categoryGlyph(name: unknown): CategoryGlyph {
  const text = String(name ?? '')
  return RULES.find(([pattern]) => pattern.test(text))?.[1] ?? 'other'
}
