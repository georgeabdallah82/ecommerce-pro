// The department glyph a category gets when it has no photo, picked from its name, so the category strip shows
// a kitchen pot for "Kitchen" and a spray can for "Cleaning" instead of one placeholder for everything.
// The storefront maps each glyph to a line icon. The first rule that matches wins, so specific departments come
// before broad words such as "home" or "essentials". Anything unrecognised gets a shopping bag.
//
// Each rule has English words (a regular expression) and Arabic words (strings, matched with includes()). The
// Arabic is written as \u escapes inside strings: a raw Arabic letter in a regular expression stays raw in the
// server bundle and doubles its memory on Cloudflare (scripts/check-worker-charset.mjs). The comment on each rule
// gives the Arabic words in English.

export type CategoryGlyph =
  | 'trending' | 'featured' | 'new' | 'bulk' | 'sale' | 'pets' | 'baby' | 'paper' | 'laundry' | 'cleaning'
  | 'kitchen' | 'drinks' | 'bottles' | 'grocery' | 'bath' | 'care' | 'garden' | 'bedding' | 'furniture'
  | 'electronics' | 'office' | 'fashion' | 'gifts' | 'storage' | 'home' | 'other'

const RULES: [RegExp, string[], CategoryGlyph][] = [
  [/best ?sell|popular|trending|top rated/i, ['\u0627\u0644\u0623\u0643\u062b\u0631 \u0645\u0628\u064a\u0639'], 'trending'], // best selling
  [/featur|staff pick|editor/i, ['\u0645\u0645\u064a\u0632'], 'featured'], // featured
  [/\bnew\b|arrival|just in|latest/i, ['\u062c\u062f\u064a\u062f'], 'new'], // new
  [/bulk|wholesale|\bpacks?\b|bundle/i, ['\u062c\u0645\u0644\u0629'], 'bulk'], // wholesale
  [/\bsales?\b|deal|offer|discount|clearance|promo/i, ['\u0639\u0631\u0648\u0636', '\u062a\u062e\u0641\u064a\u0636'], 'sale'], // offers, discount
  [/\bpets?\b|\bdogs?\b|\bcats?\b/i, ['\u062d\u064a\u0648\u0627\u0646'], 'pets'], // animal
  [/baby|\bkids?\b|child|diaper|nappy/i, ['\u0623\u0637\u0641\u0627\u0644', '\u0637\u0641\u0644'], 'baby'], // children, child
  [/tissue|paper|napkin|\brolls?\b|toilet|wipes/i, ['\u0645\u0646\u0627\u062f\u064a\u0644', '\u0645\u062d\u0627\u0631\u0645'], 'paper'], // tissues, napkins
  [/laundry|detergent/i, ['\u063a\u0633\u064a\u0644'], 'laundry'], // laundry
  [/clean|disinfect|hygien|sanit/i, ['\u062a\u0646\u0638\u064a\u0641', '\u0645\u0646\u0638\u0641'], 'cleaning'], // cleaning, cleaner
  [/kitchen|cook|bakeware|\bpans?\b|\bpots?\b|dining|tableware|cutlery/i, ['\u0645\u0637\u0628\u062e'], 'kitchen'], // kitchen
  [/drink|beverage|water|juice|soda|coffee|\btea\b/i, ['\u0645\u0634\u0631\u0648\u0628'], 'drinks'], // drink
  [/bottle|container|\bjars?\b/i, ['\u0639\u0628\u0648\u0627\u062a', '\u0642\u0646\u0627\u0646\u064a'], 'bottles'], // containers, bottles
  [/food|grocer|pantry|snack|bakery|bread/i, ['\u0628\u0642\u0627\u0644\u0629', '\u0637\u0639\u0627\u0645'], 'grocery'], // grocery, food
  [/\bbath|shower|towel/i, ['\u062d\u0645\u0627\u0645'], 'bath'], // bathroom
  [/care|beauty|skin|cosmetic|personal|\bhair/i, ['\u0639\u0646\u0627\u064a\u0629', '\u062a\u062c\u0645\u064a\u0644'], 'care'], // care, beauty
  [/garden|plant|outdoor/i, ['\u062d\u062f\u064a\u0642\u0629'], 'garden'], // garden
  [/\bbed|pillow|sleep/i, ['\u0646\u0648\u0645'], 'bedding'], // sleep
  [/sofa|furniture|living|decor|\blamps?\b|lighting/i, ['\u0623\u062b\u0627\u062b', '\u062f\u064a\u0643\u0648\u0631'], 'furniture'], // furniture, decor
  [/electr|appliance|phone|gadget|\btech/i, ['\u0623\u062c\u0647\u0632\u0629', '\u0625\u0644\u0643\u062a\u0631\u0648\u0646'], 'electronics'], // appliances, electronics
  [/office|stationer|school|\bdesk/i, ['\u0645\u0643\u062a\u0628', '\u0642\u0631\u0637\u0627\u0633\u064a\u0629'], 'office'], // office, stationery
  [/fashion|cloth|apparel|shirt|wear\b/i, ['\u0623\u0632\u064a\u0627\u0621', '\u0645\u0644\u0627\u0628\u0633'], 'fashion'], // fashion, clothes
  [/gift/i, ['\u0647\u062f\u0627\u064a\u0627', '\u0647\u062f\u064a\u0629'], 'gifts'], // gifts, gift
  [/storage|organi[sz]/i, ['\u062a\u062e\u0632\u064a\u0646'], 'storage'], // storage
  [/home|house|household|essential/i, ['\u0645\u0646\u0632\u0644', '\u0628\u064a\u062a'], 'home'], // home, house
]

export function categoryGlyph(name: unknown): CategoryGlyph {
  const text = String(name ?? '')
  return RULES.find(([english, arabic]) => english.test(text) || arabic.some(word => text.includes(word)))?.[2] ?? 'other'
}
