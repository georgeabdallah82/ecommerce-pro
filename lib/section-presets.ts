// Ready-made groups of sections for the theme studio's Add section dialog: one click adds
// a designed block (e.g. a banner + three promo cards) instead of assembling it section by
// section. They are plain data built only from section types the storefront already
// renders; the studio fills in each type's own defaults and then applies these overrides.

export type PresetBlock = { type: string; settings: Record<string, any> }
export type PresetItem = { type: string; settings?: Record<string, any>; blocks?: PresetBlock[] }
export type SectionPreset = { id: string; label: string; description: string; items: PresetItem[] }

const promo = (heading: string, text: string): PresetBlock => ({ type: 'promo', settings: { heading, text, imageUrl: '', url: '/shop' } })
const quote = (text: string, author: string, role: string): PresetBlock => ({ type: 'quote', settings: { quote: text, author, role, rating: 5 } })
const question = (q: string, a: string): PresetBlock => ({ type: 'question', settings: { question: q, answer: a, heading: q, text: a } })

export const SECTION_PRESETS: SectionPreset[] = [
  {
    id: 'banner-promos',
    label: 'Banner + 3 promo cards',
    description: 'A big opening banner followed by three clickable feature cards.',
    items: [
      { type: 'hero', settings: { eyebrow: 'NEW SEASON', heading: 'Fresh picks for the season', text: 'Discover what everyone is talking about.', buttonLabel: 'Shop now', buttonUrl: '/shop' } },
      { type: 'promo_grid', settings: { eyebrow: 'FEATURED', heading: 'Shop the edit', columns: 3 }, blocks: [promo('New arrivals', 'Just landed this week'), promo('Best sellers', 'Customer favourites'), promo('On sale', 'Limited-time offers')] },
    ],
  },
  {
    id: 'best-sellers',
    label: 'Best sellers row',
    description: 'A clean row of your products under a heading.',
    items: [{ type: 'product_grid', settings: { eyebrow: 'BEST SELLERS', heading: 'Customer favourites', limit: 8, columns: 4, showViewAll: true } }],
  },
  {
    id: 'collections-showcase',
    label: 'Shop by collection',
    description: 'Your collections as tiles, followed by a few featured products.',
    items: [
      { type: 'collection_grid', settings: { heading: 'Shop by collection', limit: 4, columns: 4 } },
      { type: 'product_grid', settings: { heading: 'Featured products', limit: 4, columns: 4, showViewAll: true } },
    ],
  },
  {
    id: 'brand-story',
    label: 'Brand story + trust badges',
    description: 'Tell your story beside an image, then reassure buyers.',
    items: [
      { type: 'image_with_text', settings: { eyebrow: 'OUR STORY', heading: 'Made with care, delivered with love', text: 'Share what makes your store different: where your products come from and why you started.', buttonLabel: 'Learn more', buttonUrl: '/about' } },
      { type: 'trust_badges' },
    ],
  },
  {
    id: 'social-proof',
    label: 'Numbers + testimonials',
    description: 'Key figures and three customer quotes to build trust.',
    items: [
      { type: 'stats' },
      { type: 'testimonials', settings: { eyebrow: 'REVIEWS', heading: 'Loved by customers', columns: 3 }, blocks: [
        quote('Fast delivery and exactly as described. Will order again.', 'Sara M.', 'Verified buyer'),
        quote('Great quality for the price. The packaging was lovely too.', 'Karim A.', 'Verified buyer'),
        quote('Customer service answered within minutes. Highly recommend.', 'Lina H.', 'Verified buyer'),
      ] },
    ],
  },
  {
    id: 'faq-signup',
    label: 'FAQ + email signup',
    description: 'Answer common questions, then invite visitors to subscribe.',
    items: [
      { type: 'faq', settings: { eyebrow: 'FAQ', heading: 'Frequently asked questions' }, blocks: [
        question('How long does delivery take?', 'Most orders arrive within 3 to 7 business days.'),
        question('Can I return an item?', 'Yes. Returns are accepted within 30 days of delivery.'),
        question('Which payment methods do you accept?', 'We accept major cards and cash on delivery where available.'),
      ] },
      { type: 'newsletter', settings: { heading: 'Stay in the loop', text: 'Get launches, drops and offers in your inbox.' } },
    ],
  },
  {
    id: 'landing-page',
    label: 'Full landing page',
    description: 'Banner, products, testimonials, FAQ and signup: a complete page in one click.',
    items: [
      { type: 'hero', settings: { eyebrow: 'LIMITED TIME', heading: 'Your big announcement here', text: 'A short line that makes people want to keep scrolling.', buttonLabel: 'Shop the collection', buttonUrl: '/shop' } },
      { type: 'product_grid', settings: { eyebrow: 'FEATURED', heading: 'Featured products', limit: 8, columns: 4, showViewAll: true } },
      { type: 'testimonials', settings: { eyebrow: 'REVIEWS', heading: 'What customers say', columns: 3 }, blocks: [
        quote('Exactly what I was looking for.', 'Sara M.', 'Verified buyer'),
        quote('Quality is excellent and delivery was quick.', 'Karim A.', 'Verified buyer'),
        quote('Will definitely order again.', 'Lina H.', 'Verified buyer'),
      ] },
      { type: 'faq', settings: { eyebrow: 'FAQ', heading: 'Questions? Answers.' }, blocks: [
        question('How long does delivery take?', 'Most orders arrive within 3 to 7 business days.'),
        question('Can I return an item?', 'Yes. Returns are accepted within 30 days of delivery.'),
      ] },
      { type: 'newsletter', settings: { heading: 'Stay in the loop', text: 'Get launches, drops and offers in your inbox.' } },
    ],
  },
]
