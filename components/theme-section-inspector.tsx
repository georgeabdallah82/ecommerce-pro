'use client'

import { useEffect, useState } from 'react'
import { GripVertical, ImagePlus, Plus, Trash2, X } from 'lucide-react'
import MediaPicker from './media-picker'

type Section = { id: string; type: string; enabled?: boolean; settings?: Record<string, any>; blocks?: any[] }

type Props = {
  section: Section
  products: any[]
  collections: any[]
  loadError?: string
  onUpdate: (patch: Record<string, any>) => void
  onUpdateBlocks: (blocks: any[]) => void
}

export function Field({ label, value, onChange, placeholder }: { label: string; value: any; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="themeInspectorField"><span>{label}</span><input value={value ?? ''} placeholder={placeholder} onChange={event => onChange(event.target.value)} /></label>
}
// Natural size of an already-uploaded image, so the merchant can see what they actually
// uploaded and be warned before a small file looks blurry on a large screen.
function useImageSize(url: string) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    setSize(null)
    if (!url) return
    let cancelled = false
    const image = new window.Image()
    image.onload = () => { if (!cancelled && image.naturalWidth) setSize({ w: image.naturalWidth, h: image.naturalHeight }) }
    image.src = url
    return () => { cancelled = true }
  }, [url])
  return size
}

export type ImageRecommendation = { w: number; h: number; note?: string }

export function ImageField({ label, value, onChange, recommended }: { label: string; value: any; onChange: (value: string) => void; recommended?: ImageRecommendation }) {
  const [open, setOpen] = useState(false)
  const url = value ? String(value) : ''
  const size = useImageSize(url)
  const lowRes = !!(size && recommended && size.w < recommended.w * 0.7)
  const wrongShape = !!(size && recommended && Math.abs(size.w / size.h - recommended.w / recommended.h) / (recommended.w / recommended.h) > 0.3)
  return (
    // A plain div, not a <label> -- there's no native form control here for a
    // <label> to legitimately point to, only a custom button-driven widget and
    // a full-screen MediaPicker modal. Wrapping those in <label> triggered the
    // browser's implicit label click-forwarding: any click on non-button
    // content inside it (the modal's own backdrop included, since the modal
    // renders as a descendant) synthesized an extra click on the field's
    // first button ("Change"/"Upload image"), reopening the picker in the
    // same tick it was told to close -- so the modal never visibly closed.
    <div className="themeInspectorField themeImageField">
      <span>{label}</span>
      {url ? (
        <div className="themeImagePreview">
          <img className="themeImageThumb" src={url} alt="" />
          <div className="themeImageActions">
            <button type="button" onClick={() => setOpen(true)}>Change</button>
            <button type="button" className="themeImageRemove" onClick={() => onChange('')} aria-label={`Remove ${label.toLowerCase()}`}><X size={13} /></button>
          </div>
        </div>
      ) : (
        <button type="button" className="themeImageEmpty" onClick={() => setOpen(true)}><ImagePlus size={16} /> Upload image</button>
      )}
      {recommended && (
        <small className="themeImageHint">
          {size ? <b>Your image: {size.w} × {size.h} px. </b> : null}
          Recommended {recommended.w} × {recommended.h} px{recommended.note ? ` — ${recommended.note}` : ''}.
          {lowRes && <span className="themeImageWarn"> Low resolution: this may look blurry on large screens.</span>}
          {!lowRes && wrongShape && <span className="themeImageWarn"> Different shape than recommended: the edges may be cropped.</span>}
        </small>
      )}
      <MediaPicker open={open} onClose={() => setOpen(false)} onAdd={images => { if (images[0]) onChange(images[0].url); setOpen(false) }} />
    </div>
  )
}
export function TextArea({ label, value, onChange, placeholder }: { label: string; value: any; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="themeInspectorField"><span>{label}</span><textarea value={value ?? ''} placeholder={placeholder} onChange={event => onChange(event.target.value)} /></label>
}
export function Select({ label, value, options, onChange }: { label: string; value: any; options: Array<{value:string;label:string}> | string[]; onChange: (value: string) => void }) {
  const normalized = options.map(option => typeof option === 'string' ? { value: option, label: option } : option)
  return <label className="themeInspectorField"><span>{label}</span><select value={String(value ?? '')} onChange={event => onChange(event.target.value)}>{normalized.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
}
export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return <label className="themeInspectorToggle"><span>{label}</span><button type="button" className={value ? 'on' : ''} aria-pressed={value} onClick={() => onChange(!value)}><i /></button></label>
}
export function Range({ label, value, min, max, step = 1, unit = '', onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (value: number) => void }) {
  return <label className="themeInspectorRange"><div><span>{label}</span><b>{value}{unit}</b></div><input type="range" value={Number.isFinite(value) ? value : min} min={min} max={max} step={step} onChange={event => onChange(Number(event.target.value))} /></label>
}
const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [text, setText] = useState(value ?? '')
  return (
    <label className="themeInspectorField themeColorField">
      <span>{label}</span>
      <div className="themeColorRow">
        <input type="color" value={HEX_RE.test(value) && value.length === 7 ? value : '#000000'} onChange={event => { setText(event.target.value); onChange(event.target.value) }} aria-label={`${label} swatch`} />
        <input type="text" value={text} onChange={event => { setText(event.target.value); if (HEX_RE.test(event.target.value)) onChange(event.target.value) }} placeholder="#000000" />
      </div>
    </label>
  )
}
export function SectionPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return <details className="themeInspectorPanel" open><summary>{title}</summary><div>{children}</div></details>
}

function BlocksEditor({ section, type, onUpdateBlocks }: { section: Section; type: string; onUpdateBlocks: (blocks: any[]) => void }) {
  const blocks = Array.isArray(section.blocks) ? section.blocks : []
  const labels: Record<string,string> = { promo: 'Promo card', quote: 'Testimonial', column: 'Column', item: 'Item', question: 'FAQ item', slide: 'Slide', logo: 'Logo', badge: 'Trust badge', trust_item: 'Trust item', stat: 'Stat', photo: 'Photo', message: 'Message' }
  const label = labels[type] || 'Block'
  const add = () => onUpdateBlocks([...blocks, { id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, type, settings: {} }])
  const update = (index: number, patch: Record<string,any>) => onUpdateBlocks(blocks.map((block,index2) => index===index2 ? {...block,settings:{...(block.settings||{}),...patch}} : block))
  const remove = (index: number) => onUpdateBlocks(blocks.filter((_,index2)=>index!==index2))
  return <div className="themeBlockList">{blocks.map((block,index)=><div className="themeBlock" key={block.id || index}><div className="themeBlockHeader"><GripVertical size={14}/><strong>{labels[block.type] || label} {index+1}</strong><button type="button" className="themeBlockDelete" onClick={()=>remove(index)} aria-label={`Delete ${label}`}><Trash2 size={14}/></button></div><div className="themeBlockFields">{type==='promo'&&<><Field label="Heading" value={block.settings?.heading} onChange={value=>update(index,{heading:value})}/><TextArea label="Text" value={block.settings?.text} onChange={value=>update(index,{text:value})}/><ImageField label="Image" value={block.settings?.imageUrl} onChange={value=>update(index,{imageUrl:value})}/><Field label="Link URL" value={block.settings?.url} onChange={value=>update(index,{url:value})}/></>}{type==='quote'&&<><TextArea label="Quote" value={block.settings?.quote} onChange={value=>update(index,{quote:value})}/><Field label="Author" value={block.settings?.author} onChange={value=>update(index,{author:value})}/><Field label="Role" value={block.settings?.role} onChange={value=>update(index,{role:value})}/><Select label="Rating" value={block.settings?.rating??5} options={['1','2','3','4','5']} onChange={value=>update(index,{rating:Number(value)})}/></>}{type==='column'&&<><Field label="Heading" value={block.settings?.heading} onChange={value=>update(index,{heading:value})}/><TextArea label="Text" value={block.settings?.text} onChange={value=>update(index,{text:value})}/><ImageField label="Icon / image" value={block.settings?.imageUrl} onChange={value=>update(index,{imageUrl:value})}/></>}{type==='question'&&<><Field label="Question" value={block.settings?.question||block.settings?.heading} onChange={value=>update(index,{question:value,heading:value})}/><TextArea label="Answer" value={block.settings?.answer||block.settings?.text} onChange={value=>update(index,{answer:value,text:value})}/></>}{type==='slide'&&<><Field label="Eyebrow" value={block.settings?.eyebrow} onChange={value=>update(index,{eyebrow:value})}/><Field label="Heading" value={block.settings?.heading} onChange={value=>update(index,{heading:value})}/><TextArea label="Text" value={block.settings?.text} onChange={value=>update(index,{text:value})}/><ImageField label="Image" value={block.settings?.imageUrl} onChange={value=>update(index,{imageUrl:value})}/><Field label="Button URL" value={block.settings?.buttonUrl} onChange={value=>update(index,{buttonUrl:value})}/></>}{type==='logo'&&<><ImageField label="Logo" value={block.settings?.imageUrl} onChange={value=>update(index,{imageUrl:value})}/><Field label="Text (shown if no logo image)" value={block.settings?.text} onChange={value=>update(index,{text:value})}/><Field label="Alt text" value={block.settings?.alt} onChange={value=>update(index,{alt:value})}/><Field label="Link URL" value={block.settings?.url} onChange={value=>update(index,{url:value})}/></>}{type==='badge'&&<><Select label="Icon" value={block.settings?.icon||'shield'} options={[{value:'truck',label:'Shipping'},{value:'shield',label:'Secure'},{value:'return',label:'Returns'},{value:'lock',label:'Payment'},{value:'support',label:'Support'},{value:'award',label:'Quality'}]} onChange={value=>update(index,{icon:value})}/><Field label="Heading" value={block.settings?.heading} onChange={value=>update(index,{heading:value})}/><Field label="Text" value={block.settings?.text} onChange={value=>update(index,{text:value})}/></>}{type==='trust_item'&&<><Field label="Heading" value={block.settings?.heading} onChange={value=>update(index,{heading:value})}/><Field label="Text" value={block.settings?.text} onChange={value=>update(index,{text:value})}/></>}{type==='stat'&&<><Field label="Value" value={block.settings?.value} onChange={value=>update(index,{value:value})}/><Field label="Label" value={block.settings?.label} onChange={value=>update(index,{label:value})}/></>}{type==='photo'&&<><ImageField label="Image" value={block.settings?.imageUrl} onChange={value=>update(index,{imageUrl:value})}/><Field label="Link URL" value={block.settings?.url} onChange={value=>update(index,{url:value})}/></>}{type==='message'&&<><Field label="Text" value={block.settings?.text} onChange={value=>update(index,{text:value})}/><Field label="Link URL" value={block.settings?.link} onChange={value=>update(index,{link:value})}/></>}</div></div>)}<button type="button" className="themeAddBlock" onClick={add}><Plus size={14}/> Add {label}</button></div>
}

// ---- Declarative field schema ----
// Every section type below maps to a list of panels; each panel is a list of
// fields (or arrays of fields, rendered together in one themeInspectorGrid
// row). Each field's get/set pair is a literal transcription of that field's
// old inline value/onChange closure -- this is a structural refactor, not a
// behavior change. Exported so theme-studio.tsx can reuse the exact same
// schema/render pipeline for the Theme-settings drawer (a "virtual section"
// whose settings live on theme[group] instead of section.settings), instead
// of maintaining a second, differently-styled field system for it.
export type SettingsMap = Record<string, any>
export type FieldCtx = { s: SettingsMap; products: any[]; collections: any[]; loadError?: string }
export type OptionList = Array<{ value: string; label: string }> | string[]
export type OptionsSource = OptionList | ((ctx: FieldCtx) => OptionList)

export type FieldSchema =
  | { kind: 'text'; label: string; placeholder?: string; get: (s: SettingsMap) => any; set: (value: string) => Record<string, any> }
  | { kind: 'image'; label: string; recommended?: ImageRecommendation; get: (s: SettingsMap) => any; set: (value: string) => Record<string, any> }
  | { kind: 'textarea'; label: string; placeholder?: string; get: (s: SettingsMap) => any; set: (value: string) => Record<string, any> }
  | { kind: 'select'; label: string; options: OptionsSource; get: (s: SettingsMap) => any; set: (value: string) => Record<string, any> }
  | { kind: 'toggle'; label: string; get: (s: SettingsMap) => boolean; set: (value: boolean) => Record<string, any> }
  | { kind: 'range'; label: string; min: number; max: number; step?: number; unit?: string; get: (s: SettingsMap) => number; set: (value: number) => Record<string, any> }
  | { kind: 'color'; label: string; get: (s: SettingsMap) => string; set: (value: string) => Record<string, any> }
  | { kind: 'picker'; label: string; source: 'products' | 'collections'; hint?: string; get: (s: SettingsMap) => string[]; set: (ids: string[]) => Record<string, any> }
  | { kind: 'blocks'; label: string; blockType: string }

export type PanelSchema = { title: string; fields: Array<FieldSchema | FieldSchema[]> }

export const text = (label: string, name: string, placeholder?: string): FieldSchema =>
  ({ kind: 'text', label, placeholder, get: s => s[name], set: value => ({ [name]: value }) })
export const image = (label: string, name: string, recommended?: ImageRecommendation): FieldSchema =>
  ({ kind: 'image', label, recommended, get: s => s[name], set: value => ({ [name]: value }) })
export const textarea = (label: string, name: string, placeholder?: string): FieldSchema =>
  ({ kind: 'textarea', label, placeholder, get: s => s[name], set: value => ({ [name]: value }) })
export const select = (label: string, name: string, options: OptionsSource, fallback = ''): FieldSchema =>
  ({ kind: 'select', label, options, get: s => s[name] || fallback, set: value => ({ [name]: value }) })
export const toggle = (label: string, name: string, defaultTrue: boolean): FieldSchema =>
  ({ kind: 'toggle', label, get: s => defaultTrue ? s[name] !== false : Boolean(s[name]), set: value => ({ [name]: value }) })
export const range = (label: string, name: string, min: number, max: number, fallback: number, step?: number, unit?: string): FieldSchema =>
  ({ kind: 'range', label, min, max, step, unit, get: s => Number(s[name] ?? fallback), set: value => ({ [name]: value }) })
export const color = (label: string, name: string, fallback: string): FieldSchema =>
  ({ kind: 'color', label, get: s => s[name] || fallback, set: value => ({ [name]: value }) })
export const blocks = (label: string, blockType: string): FieldSchema => ({ kind: 'blocks', label, blockType })

export const commonLayoutPanel: PanelSchema = {
  title: 'Layout & appearance',
  fields: [[
    { kind: 'select', label: 'Background', options: ['default','surface','secondary','dark','primary','gradient'], get: s => s.background || 'default', set: value => ({ background: value === 'default' ? '' : value }) },
    select('Text alignment', 'textAlign', ['left','center','right'], 'left'),
    range('Spacing', 'spacing', 0, 160, 72),
  ]],
}

// Every product-list section (grid, carousel, featured, recommendations) renders the
// same grid of products from an optional collection. An earlier version of this panel
// offered a "Product" picker for featured_product and Card style / Image ratio
// selects, none of which the renderer ever read.
function productTypePanels(): PanelSchema[] {
  return [
    { title: 'Content', fields: [
      text('Eyebrow', 'eyebrow', 'SHOP / CURATED'),
      text('Heading', 'heading'),
      textarea('Subheading', 'subheading'),
      [range('Products shown (automatic)', 'limit', 1, 48, 8), range('Columns', 'columns', 2, 6, 4)],
      toggle('Show View all', 'showViewAll', true),
    ] },
    { title: 'Products', fields: [
      { kind: 'select', label: 'Show products from', options: ({ collections }) => [{ value: '', label: 'All products' }, ...collections.map(c => ({ value: c.slug || c.id, label: c.name }))], get: s => s.collection || '', set: value => ({ collection: value }) },
      { kind: 'picker', label: 'Or hand-pick products', source: 'products', hint: 'Hand-picked products show in this order and replace the choice above. The product limit applies to the automatic choice only.', get: s => (Array.isArray(s.productIds) ? s.productIds : []), set: ids => ({ productIds: ids }) },
    ] },
    commonLayoutPanel,
  ]
}

function collectionTypePanels(): PanelSchema[] {
  return [
    { title: 'Content', fields: [
      text('Eyebrow', 'eyebrow', 'COLLECTIONS'),
      text('Heading', 'heading'),
      textarea('Subheading', 'subheading'),
      range('Collections shown (automatic)', 'limit', 1, 24, 4),
      range('Columns', 'columns', 2, 5, 4),
    ] },
    { title: 'Collections', fields: [
      { kind: 'picker', label: 'Choose collections', source: 'collections', hint: 'Pick which collections to show and their order. Leave empty to show them automatically. A collection\'s picture is set on the collection itself (Collections in the admin).', get: s => (Array.isArray(s.collectionIds) ? s.collectionIds : []), set: ids => ({ collectionIds: ids, sourceCollection: '' }) },
    ] },
    commonLayoutPanel,
  ]
}

// New arrivals / best sellers: heading, item count and the View all link are the
// settings those blocks read (their layout is fixed AliExpress-style markup).
function homeGridPanel(defaultHeading: string): PanelSchema[] {
  return [{ title: 'Content', fields: [text('Heading', 'heading', defaultHeading), range('Products shown', 'limit', 4, 20, 12), toggle('Show View all', 'showViewAll', true), select('Text alignment', 'textAlign', ['left','center','right'], 'left')] }]
}

function richTextPanels(): PanelSchema[] {
  return [
    { title: 'Content', fields: [
      text('Eyebrow', 'eyebrow'),
      text('Heading', 'heading'),
      textarea('Text', 'text'),
      text('Button label', 'buttonLabel'),
      text('Button URL', 'buttonUrl'),
    ] },
    commonLayoutPanel,
  ]
}

// Video has no real player -- the storefront only ever shows a static background
// image behind a decorative play icon -- and slideshow only ever displays its
// first Slide block's own image, never a top-level one. Video therefore offers
// exactly what it renders (eyebrow, heading, text, background image); an earlier
// version also showed Autoplay and Height controls that its renderer never read.
// Slideshow's real, working image editing lives in its Slides blocks.
function mediaPanels(type: 'video' | 'slideshow'): PanelSchema[] {
  if (type === 'video') {
    return [
      { title: 'Video', fields: [text('Eyebrow', 'eyebrow', 'VIDEO'), text('Heading', 'heading'), textarea('Text', 'text'), image('Background image', 'imageUrl', { w: 1600, h: 900, note: '16:9' })] },
      commonLayoutPanel,
    ]
  }
  return [
    { title: 'Slideshow', fields: [blocks('Slides', 'slide'), toggle('Autoplay', 'autoplay', true), range('Height', 'minHeight', 320, 860, 560)] },
    commonLayoutPanel,
  ]
}

// main_product and main_collection_grid used to share this panel, but they
// render completely different settings: MainProductSection (storefront-
// sections.tsx) only ever reads settings.shippingText, while the
// main_collection_grid branch there reads heading/columns/limit/showFilters
// -- neither reads showShipping, which is what this panel used to expose.
function mainProductPanel(): PanelSchema[] {
  return [{ title: 'Product page', fields: [
    textarea('Shipping & returns text', 'shippingText', 'Free standard delivery is automatically applied to orders over $50. Tracked shipping worldwide.'),
  ] }]
}
function mainCollectionGridPanel(): PanelSchema[] {
  return [{ title: 'Template section', fields: [
    text('Heading', 'heading'),
    range('Columns', 'columns', 2, 6, 4),
    range('Product limit', 'limit', 1, 48, 24),
    toggle('Show filters', 'showFilters', true),
  ] }]
}

const SECTION_PANELS: Record<string, () => PanelSchema[]> = {
  hero: () => [
    { title: 'Content', fields: [
      toggle('Show text overlay', 'showContent', true),
      text('Eyebrow', 'eyebrow'),
      text('Heading', 'heading'),
      textarea('Text', 'text'),
      [text('Button label', 'buttonLabel'), text('Button URL', 'buttonUrl'), text('Secondary label', 'secondaryLabel'), text('Secondary URL', 'secondaryUrl')],
    ] },
    { title: 'Media', fields: [
      { kind: 'image', label: 'Desktop image', recommended: { w: 1920, h: 840, note: 'wide banner, shown on screens wider than 750 px' }, get: s => s.desktopImageUrl || s.imageUrl, set: value => ({ desktopImageUrl: value }) },
      image('Mobile image', 'mobileImageUrl', { w: 800, h: 1000, note: 'portrait, shown on phones. If empty, the desktop image is used and may be cropped' }),
      text('Alt text', 'imageAlt'),
      [
        select('Image fit', 'imageFit', ['cover','contain','fill'], 'cover'),
        select('Overlay style', 'overlayStyle', ['none','solid','bottom-gradient','full-gradient'], 'bottom-gradient'),
        { kind: 'range', label: 'Overlay', min: 0, max: 100, get: s => Math.round(Number(s.overlay ?? .24) * 100), set: value => ({ overlay: value / 100 }) },
        text('Overlay color', 'overlayColor'),
      ],
      [range('Focal X', 'focalX', 0, 100, 50), range('Focal Y', 'focalY', 0, 100, 50)],
    ] },
    { title: 'Position & size', fields: [
      [
        select('Content position', 'contentPosition', ['top-left','top-center','top-right','center-left','center','center-right','bottom-left','bottom-center','bottom-right'], 'center-left'),
        select('Text alignment', 'textAlign', ['left','center','right'], 'left'),
        range('Content width', 'contentWidth', 320, 900, 620),
        range('Height', 'minHeight', 360, 900, 640),
      ],
      // heightMode and imageHeightMode both default to "adapt" (the section sizes
      // itself to the image's own proportions) -- the Height field above only has
      // an effect once both are switched to "fixed", so expose that as one toggle
      // instead of two separate, easy-to-mismatch raw fields.
      { kind: 'toggle', label: 'Fixed height', get: s => s.heightMode === 'fixed', set: value => ({ heightMode: value ? 'fixed' : 'adapt', imageHeightMode: value ? 'fixed' : 'adapt' }) },
      toggle('Full bleed', 'fullBleed', true),
      toggle('Content box', 'contentBox', false),
      range('Corner radius', 'borderRadius', 0, 60, 0),
    ] },
  ],
  product_grid: () => productTypePanels(),
  product_carousel: () => productTypePanels(),
  featured_product: () => productTypePanels(),
  product_recommendations: () => productTypePanels(),
  collection_grid: () => collectionTypePanels(),
  collection_carousel: () => collectionTypePanels(),
  category_strip: () => [{ title: 'Content', fields: [range('Collections shown', 'limit', 4, 16, 12), select('Text alignment', 'textAlign', ['left','center','right'], 'left')] }, { title: 'Collections', fields: [
    { kind: 'picker', label: 'Choose collections', source: 'collections', hint: 'Leave empty to show collections automatically.', get: s => (Array.isArray(s.collectionIds) ? s.collectionIds : []), set: ids => ({ collectionIds: ids }) },
  ] }],
  flash_deals: () => [
    { title: 'Content', fields: [text('Heading', 'heading', 'Flash Deals'), range('Products shown', 'limit', 4, 20, 12), toggle('Show View all', 'showViewAll', true), select('Text alignment', 'textAlign', ['left','center','right'], 'left')] },
    { title: 'Countdown', fields: [
      toggle('Show countdown', 'showCountdown', true),
      text('Timer label', 'countdownLabel', 'Ends in'),
      select('Timer runs until', 'countdownMode', [{ value: 'daily', label: 'Midnight, every day' }, { value: 'date', label: 'A specific date & time' }], 'daily'),
      text('End date & time', 'endDate', 'YYYY-MM-DDTHH:mm, e.g. 2026-12-31T23:59'),
    ] },
  ],
  new_arrivals: () => homeGridPanel('New Arrivals'),
  best_sellers: () => homeGridPanel('Best Sellers'),
  image_with_text: () => [
    { title: 'Content', fields: [
      text('Eyebrow', 'eyebrow'),
      text('Heading', 'heading'),
      textarea('Text', 'text'),
      [text('Button label', 'buttonLabel'), text('Button URL', 'buttonUrl')],
    ] },
    { title: 'Media & layout', fields: [
      image('Image', 'imageUrl', { w: 1200, h: 1000, note: 'shown beside the text' }),
      text('Image alt text', 'imageAlt'),
      select('Image position', 'layout', ['image-left','image-right'], 'image-right'),
    ] },
    commonLayoutPanel,
  ],
  promo_grid: () => [
    { title: 'Content', fields: [text('Eyebrow', 'eyebrow', 'FEATURED'), text('Heading', 'heading'), range('Columns', 'columns', 2, 4, 3)] },
    { title: 'Promo cards', fields: [blocks('Promo cards', 'promo')] },
    commonLayoutPanel,
  ],
  testimonials: () => [
    { title: 'Content', fields: [text('Eyebrow', 'eyebrow', 'REVIEWS'), text('Heading', 'heading'), textarea('Subheading', 'subheading'), range('Columns', 'columns', 1, 3, 3)] },
    { title: 'Testimonials', fields: [blocks('Testimonials', 'quote')] },
    commonLayoutPanel,
  ],
  newsletter: () => [
    { title: 'Content', fields: [text('Eyebrow', 'eyebrow', 'NEWSLETTER'), text('Heading', 'heading'), textarea('Text', 'text'), text('Button label', 'buttonLabel'), text('Email placeholder', 'placeholder', 'Email address'), text('Success message', 'successMessage', 'Thanks for subscribing!')] },
    { title: 'Appearance', fields: [select('Background', 'background', ['primary','secondary','surface','dark'], 'primary'), select('Text alignment', 'textAlign', ['left','center','right'], 'left'), range('Spacing', 'spacing', 0, 160, 72)] },
  ],
  rich_text: () => richTextPanels(),
  // Not richTextPanels() -- that panel's Button label/URL fields are dead here:
  // storefront-sections.tsx's main_collection_banner branch never renders a
  // button, only heading/text/image.
  main_collection_banner: () => [
    { title: 'Content', fields: [text('Eyebrow', 'eyebrow'), text('Heading', 'heading'), textarea('Text', 'text')] },
    { title: 'Media', fields: [image('Image', 'imageUrl', { w: 1920, h: 600, note: 'wide banner' })] },
  ],
  announcement_strip: () => [
    { title: 'Messages', fields: [blocks('Messages', 'message')] },
    { title: 'Colors', fields: [[color('Background', 'backgroundColor', '#191512'), color('Text', 'textColor', '#ffffff')]] },
    { title: 'Layout', fields: [select('Text alignment', 'textAlign', ['center','left','right'], 'center')] },
  ],
  trust_strip: () => [
    { title: 'Items', fields: [blocks('Items', 'trust_item')] },
    { title: 'Layout', fields: [select('Text alignment', 'textAlign', ['center','left','right'], 'center')] },
  ],
  trust_badges: () => [
    { title: 'Badges', fields: [blocks('Badges', 'badge')] },
    commonLayoutPanel,
  ],
  countdown: () => [
    { title: 'Content', fields: [
      text('Eyebrow', 'eyebrow'),
      text('Heading', 'heading'),
      textarea('Text', 'text'),
      [text('Button label', 'buttonLabel'), text('Button URL', 'buttonUrl')],
    ] },
    { title: 'Countdown', fields: [
      text('End date & time', 'endDate', 'YYYY-MM-DDTHH:mm, e.g. 2026-12-31T23:59'),
    ] },
    { title: 'Deal products (optional)', fields: [
      { kind: 'select', label: 'Collection', options: ({ collections }) => [{ value: '', label: 'All products' }, ...collections.map(c => ({ value: c.slug || c.id, label: c.name }))], get: s => s.collection || '', set: value => ({ collection: value }) },
      range('Number of products', 'limit', 0, 12, 0),
    ] },
    commonLayoutPanel,
  ],
  stats: () => [
    { title: 'Content', fields: [text('Eyebrow', 'eyebrow', 'BY THE NUMBERS'), text('Heading', 'heading'), range('Columns', 'columns', 2, 6, 4)] },
    { title: 'Stats', fields: [blocks('Stats', 'stat')] },
    commonLayoutPanel,
  ],
  social_grid: () => [
    { title: 'Content', fields: [text('Heading', 'heading'), text('Handle / label', 'handle'), range('Columns', 'columns', 3, 6, 5)] },
    { title: 'Photos', fields: [blocks('Photos', 'photo')] },
    commonLayoutPanel,
  ],
  multicolumn: () => [
    { title: 'Content', fields: [text('Eyebrow', 'eyebrow', 'BENEFITS'), text('Heading', 'heading'), range('Columns', 'columns', 2, 4, 3)] },
    { title: 'Columns', fields: [blocks('Columns', 'column')] },
    commonLayoutPanel,
  ],
  faq: () => [
    { title: 'Content', fields: [text('Eyebrow', 'eyebrow', 'FAQ'), text('Heading', 'heading')] },
    { title: 'Questions', fields: [blocks('Questions', 'question')] },
    commonLayoutPanel,
  ],
  logo_list: () => [
    { title: 'Logos', fields: [blocks('Logos', 'logo')] },
    commonLayoutPanel,
  ],
  announcement: () => [
    { title: 'Announcement', fields: [
      toggle('Enabled', 'enabled', true),
      select('Position', 'position', ['above','below'], 'above'),
      [range('Height', 'height', 28, 72, 40), range('Rotation speed (sec)', 'speed', 1, 15, 6)],
      [toggle('Autoplay', 'autoplay', true), toggle('Dismissible', 'dismissible', true)],
      [toggle('Show icon', 'showIcon', false), select('Icon', 'icon', ['spark','truck','tag','gift','clock','megaphone'], 'spark')],
      toggle('Uppercase', 'uppercase', false),
    ] },
    { title: 'Messages', fields: [blocks('Messages', 'message')] },
  ],
  // Style, Mega menu and Navigation spacing used to live here too, but
  // components/store-nav-fixed.tsx (the actual live header) never reads
  // style/megaMenu/navSpacing at all. Wishlist/transparency toggles that ARE
  // read live are on the Theme settings -> Header category instead, since
  // they're global header behavior (theme.header), not per-template.
  header: () => [
    { title: 'Header', fields: [
      toggle('Sticky', 'sticky', true),
      toggle('Search', 'showSearch', true),
      toggle('Account', 'showAccount', true),
      toggle('Cart', 'showCart', true),
      range('Logo width', 'logoWidth', 80, 260, 160),
    ] },
  ],
  // Empty, not omitted: omitting the key here falls back to commonLayoutPanel,
  // which is just as dead for footer as a dedicated panel would be --
  // components/footer.tsx has its own fixed dark background. Footer's real
  // controls live on the Theme settings -> Footer category (theme.footer).
  footer: () => [],
  video: () => mediaPanels('video'),
  slideshow: () => mediaPanels('slideshow'),
  main_product: () => mainProductPanel(),
  main_collection_grid: () => mainCollectionGridPanel(),
}

// Choose specific products or collections, in the order they should appear. Empty means
// "automatic" (the section picks for itself), so existing sections keep working unchanged.
type PickerItem = { id: string; label: string; sub?: string; image?: string; editHref?: string }
function pickerItems(source: 'products' | 'collections', ctx: FieldCtx): PickerItem[] {
  if (source === 'products') {
    return ctx.products.map((p: any) => ({ id: String(p.id), label: p.name || 'Product', sub: p.sku || undefined, image: (p.images || [])[0]?.url || '', editHref: p.id ? `/admin/products/${p.id}` : undefined }))
  }
  return ctx.collections.map((c: any) => ({ id: String(c.id), label: c.name || 'Collection', sub: (() => { const count = c._count?.products ?? (Array.isArray(c.products) ? c.products.length : undefined); return count === undefined ? undefined : `${count} product${count === 1 ? '' : 's'}` })(), image: c.imageUrl || '', editHref: c.id ? `/admin/collections/${c.id}` : undefined }))
}
export function ItemPicker({ label, hint, source, items, value, onChange, loadError }: { label: string; hint?: string; source: 'products' | 'collections'; items: PickerItem[]; value: string[]; onChange: (ids: string[]) => void; loadError?: string }) {
  const [query, setQuery] = useState('')
  const noun = source === 'products' ? 'product' : 'collection'
  const byId = new Map(items.map(item => [item.id, item]))
  // Ids that no longer exist (a deleted collection) are dropped from the view; they are
  // cleared the next time the merchant changes the selection.
  const chosen = value.map(id => byId.get(id)).filter((item): item is PickerItem => !!item)
  const available = items.filter(item => !value.includes(item.id) && (!query.trim() || `${item.label} ${item.sub || ''}`.toLowerCase().includes(query.trim().toLowerCase())))
  const move = (index: number, delta: number) => {
    const next = chosen.map(item => item.id)
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }
  const thumb = (item: PickerItem) => (item.image ? <img src={item.image} alt="" loading="lazy" /> : <span className="themePickerNoImage" title="No image yet">{noun === 'collection' ? '?' : ''}</span>)
  return (
    <div className="themeInspectorField themePicker">
      <span>{label}</span>
      {hint && <small className="themePickerHint">{hint}</small>}
      {chosen.length === 0 ? (
        <div className="themePickerAuto">Automatic: the section chooses {noun}s for you. Add some below to pick them yourself.</div>
      ) : (
        <ul className="themePickerChosen">
          {chosen.map((item, index) => (
            <li key={item.id}>
              {thumb(item)}
              <div><strong>{item.label}</strong>{item.sub && <em>{item.sub}</em>}{!item.image && noun === 'collection' && item.editHref && <a href={item.editHref} target="_blank" rel="noreferrer">No image: add one</a>}</div>
              <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
              <button type="button" aria-label="Move down" disabled={index === chosen.length - 1} onClick={() => move(index, 1)}>↓</button>
              <button type="button" aria-label={`Remove ${item.label}`} onClick={() => onChange(chosen.filter(other => other.id !== item.id).map(other => other.id))}><X size={13} /></button>
            </li>
          ))}
        </ul>
      )}
      {chosen.length > 0 && <button type="button" className="themePickerClear" onClick={() => onChange([])}>Clear selection (back to automatic)</button>}
      {items.length === 0 ? (
        loadError ? (
          <div className="themePickerAuto themePickerError">Couldn't load your {noun}s ({loadError}). Reload the editor to try again. {value.length > 0 && 'Your current selection is kept.'}</div>
        ) : (
          <div className="themePickerAuto">No active {noun}s yet. Add some in the admin first.</div>
        )
      ) : (
        <>
          {items.length > 6 && <input type="search" placeholder={`Search ${noun}s…`} value={query} onChange={event => setQuery(event.target.value)} />}
          <ul className="themePickerList">
            {available.slice(0, 40).map(item => (
              <li key={item.id}>
                <button type="button" onClick={() => onChange([...chosen.map(other => other.id), item.id])}>
                  {thumb(item)}
                  <div><strong>{item.label}</strong>{item.sub && <em>{item.sub}</em>}</div>
                  <Plus size={14} />
                </button>
              </li>
            ))}
            {available.length === 0 && <li className="themePickerEmpty">{value.length ? `All ${noun}s are selected.` : `No ${noun}s match.`}</li>}
          </ul>
        </>
      )}
    </div>
  )
}

export function renderField(schema: FieldSchema, ctx: FieldCtx, set: (patch: Record<string, any>) => void): React.ReactNode {
  const { s } = ctx
  switch (schema.kind) {
    case 'text':
      return <Field key={schema.label} label={schema.label} placeholder={schema.placeholder} value={schema.get(s)} onChange={value => set(schema.set(value))} />
    case 'image':
      return <ImageField key={schema.label} label={schema.label} value={schema.get(s)} recommended={schema.recommended} onChange={value => set(schema.set(value))} />
    case 'textarea':
      return <TextArea key={schema.label} label={schema.label} placeholder={schema.placeholder} value={schema.get(s)} onChange={value => set(schema.set(value))} />
    case 'select': {
      const options = typeof schema.options === 'function' ? schema.options(ctx) : schema.options
      return <Select key={schema.label} label={schema.label} value={schema.get(s)} options={options} onChange={value => set(schema.set(value))} />
    }
    case 'toggle':
      return <Toggle key={schema.label} label={schema.label} value={schema.get(s)} onChange={value => set(schema.set(value))} />
    case 'range':
      return <Range key={schema.label} label={schema.label} min={schema.min} max={schema.max} step={schema.step} unit={schema.unit} value={schema.get(s)} onChange={value => set(schema.set(value))} />
    case 'color':
      return <ColorField key={schema.label} label={schema.label} value={schema.get(s)} onChange={value => set(schema.set(value))} />
    case 'picker':
      return <ItemPicker key={schema.label} label={schema.label} hint={schema.hint} source={schema.source} items={pickerItems(schema.source, ctx)} value={schema.get(s)} onChange={ids => set(schema.set(ids))} loadError={ctx.loadError} />
    case 'blocks':
      return null
  }
}

export function renderPanel(panel: PanelSchema, ctx: FieldCtx, set: (patch: Record<string, any>) => void, section?: Section, onUpdateBlocks?: (blocks: any[]) => void) {
  return (
    <SectionPanel key={panel.title} title={panel.title}>
      {panel.fields.map((entry, index) => {
        if (Array.isArray(entry)) {
          return <div className="themeInspectorGrid" key={index}>{entry.map(field => renderField(field, ctx, set))}</div>
        }
        if (entry.kind === 'blocks') {
          return section && onUpdateBlocks ? <BlocksEditor key={entry.label} section={section} type={entry.blockType} onUpdateBlocks={onUpdateBlocks} /> : null
        }
        return renderField(entry, ctx, set)
      })}
    </SectionPanel>
  )
}

export default function SectionInspector({ section, products, collections, loadError, onUpdate, onUpdateBlocks }: Props) {
  const s = section.settings || {}
  const ctx: FieldCtx = { s, products, collections, loadError }
  const set = (patch: Record<string, any>) => onUpdate(patch)
  const panels = (SECTION_PANELS[section.type] || (() => [commonLayoutPanel]))()
  return (
    <div className="themeInspector">
      {panels.map(panel => renderPanel(panel, ctx, set, section, onUpdateBlocks))}
    </div>
  )
}
