'use client'

import { useState } from 'react'
import { GripVertical, ImagePlus, Plus, Trash2, X } from 'lucide-react'
import MediaPicker from './media-picker'

type Section = { id: string; type: string; enabled?: boolean; settings?: Record<string, any>; blocks?: any[] }

type Props = {
  section: Section
  products: any[]
  collections: any[]
  onUpdate: (patch: Record<string, any>) => void
  onUpdateBlocks: (blocks: any[]) => void
}

function Field({ label, value, onChange, placeholder }: { label: string; value: any; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="themeInspectorField"><span>{label}</span><input value={value ?? ''} placeholder={placeholder} onChange={event => onChange(event.target.value)} /></label>
}
function ImageField({ label, value, onChange }: { label: string; value: any; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const url = value ? String(value) : ''
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
      <MediaPicker open={open} onClose={() => setOpen(false)} onAdd={images => { if (images[0]) onChange(images[0].url); setOpen(false) }} />
    </div>
  )
}
function TextArea({ label, value, onChange, placeholder }: { label: string; value: any; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="themeInspectorField"><span>{label}</span><textarea value={value ?? ''} placeholder={placeholder} onChange={event => onChange(event.target.value)} /></label>
}
function Select({ label, value, options, onChange }: { label: string; value: any; options: Array<{value:string;label:string}> | string[]; onChange: (value: string) => void }) {
  const normalized = options.map(option => typeof option === 'string' ? { value: option, label: option } : option)
  return <label className="themeInspectorField"><span>{label}</span><select value={String(value ?? '')} onChange={event => onChange(event.target.value)}>{normalized.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
}
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return <label className="themeInspectorToggle"><span>{label}</span><button type="button" className={value ? 'on' : ''} aria-pressed={value} onClick={() => onChange(!value)}><i /></button></label>
}
function Range({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  return <label className="themeInspectorRange"><div><span>{label}</span><b>{value}</b></div><input type="range" value={Number.isFinite(value) ? value : min} min={min} max={max} step={step} onChange={event => onChange(Number(event.target.value))} /></label>
}
function SectionPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return <details className="themeInspectorPanel" open><summary>{title}</summary><div>{children}</div></details>
}

function BlocksEditor({ section, type, onUpdateBlocks }: { section: Section; type: string; onUpdateBlocks: (blocks: any[]) => void }) {
  const blocks = Array.isArray(section.blocks) ? section.blocks : []
  const labels: Record<string,string> = { promo: 'Promo card', quote: 'Testimonial', column: 'Column', item: 'Item', question: 'FAQ item', slide: 'Slide', logo: 'Logo', badge: 'Trust badge', stat: 'Stat', photo: 'Photo', message: 'Message' }
  const label = labels[type] || 'Block'
  const add = () => onUpdateBlocks([...blocks, { id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, type, settings: {} }])
  const update = (index: number, patch: Record<string,any>) => onUpdateBlocks(blocks.map((block,index2) => index===index2 ? {...block,settings:{...(block.settings||{}),...patch}} : block))
  const remove = (index: number) => onUpdateBlocks(blocks.filter((_,index2)=>index!==index2))
  return <div className="themeBlockList">{blocks.map((block,index)=><div className="themeBlock" key={block.id || index}><div className="themeBlockHeader"><GripVertical size={14}/><strong>{labels[block.type] || label} {index+1}</strong><button type="button" className="themeBlockDelete" onClick={()=>remove(index)} aria-label={`Delete ${label}`}><Trash2 size={14}/></button></div><div className="themeBlockFields">{type==='promo'&&<><Field label="Heading" value={block.settings?.heading} onChange={value=>update(index,{heading:value})}/><TextArea label="Text" value={block.settings?.text} onChange={value=>update(index,{text:value})}/><ImageField label="Image" value={block.settings?.imageUrl} onChange={value=>update(index,{imageUrl:value})}/><Field label="Link URL" value={block.settings?.url} onChange={value=>update(index,{url:value})}/></>}{type==='quote'&&<><TextArea label="Quote" value={block.settings?.quote} onChange={value=>update(index,{quote:value})}/><Field label="Author" value={block.settings?.author} onChange={value=>update(index,{author:value})}/><Field label="Role" value={block.settings?.role} onChange={value=>update(index,{role:value})}/><Select label="Rating" value={block.settings?.rating??5} options={['1','2','3','4','5']} onChange={value=>update(index,{rating:Number(value)})}/></>}{type==='column'&&<><Field label="Heading" value={block.settings?.heading} onChange={value=>update(index,{heading:value})}/><TextArea label="Text" value={block.settings?.text} onChange={value=>update(index,{text:value})}/><ImageField label="Icon / image" value={block.settings?.imageUrl} onChange={value=>update(index,{imageUrl:value})}/></>}{type==='question'&&<><Field label="Question" value={block.settings?.question||block.settings?.heading} onChange={value=>update(index,{question:value,heading:value})}/><TextArea label="Answer" value={block.settings?.answer||block.settings?.text} onChange={value=>update(index,{answer:value,text:value})}/></>}{type==='slide'&&<><Field label="Eyebrow" value={block.settings?.eyebrow} onChange={value=>update(index,{eyebrow:value})}/><Field label="Heading" value={block.settings?.heading} onChange={value=>update(index,{heading:value})}/><TextArea label="Text" value={block.settings?.text} onChange={value=>update(index,{text:value})}/><ImageField label="Image" value={block.settings?.imageUrl} onChange={value=>update(index,{imageUrl:value})}/><Field label="Button URL" value={block.settings?.buttonUrl} onChange={value=>update(index,{buttonUrl:value})}/></>}{type==='logo'&&<><ImageField label="Logo" value={block.settings?.imageUrl} onChange={value=>update(index,{imageUrl:value})}/><Field label="Alt text" value={block.settings?.alt} onChange={value=>update(index,{alt:value})}/><Field label="Link URL" value={block.settings?.url} onChange={value=>update(index,{url:value})}/></>}{type==='badge'&&<><Select label="Icon" value={block.settings?.icon||'shield'} options={[{value:'truck',label:'Shipping'},{value:'shield',label:'Secure'},{value:'return',label:'Returns'},{value:'lock',label:'Payment'},{value:'support',label:'Support'},{value:'award',label:'Quality'}]} onChange={value=>update(index,{icon:value})}/><Field label="Heading" value={block.settings?.heading} onChange={value=>update(index,{heading:value})}/><Field label="Text" value={block.settings?.text} onChange={value=>update(index,{text:value})}/></>}{type==='stat'&&<><Field label="Value" value={block.settings?.value} onChange={value=>update(index,{value:value})}/><Field label="Label" value={block.settings?.label} onChange={value=>update(index,{label:value})}/></>}{type==='photo'&&<><ImageField label="Image" value={block.settings?.imageUrl} onChange={value=>update(index,{imageUrl:value})}/><Field label="Link URL" value={block.settings?.url} onChange={value=>update(index,{url:value})}/></>}{type==='message'&&<><Field label="Text" value={block.settings?.text} onChange={value=>update(index,{text:value})}/><Field label="Link URL" value={block.settings?.link} onChange={value=>update(index,{link:value})}/></>}</div></div>)}<button type="button" className="themeAddBlock" onClick={add}><Plus size={14}/> Add {label}</button></div>
}

// ---- Declarative field schema ----
// Every section type below maps to a list of panels; each panel is a list of
// fields (or arrays of fields, rendered together in one themeInspectorGrid
// row, matching the original inline-JSX grouping). Each field's get/set pair
// is a literal transcription of that field's old inline value/onChange
// closure -- this is a structural refactor, not a behavior change.
type SettingsMap = Record<string, any>
type FieldCtx = { s: SettingsMap; products: any[]; collections: any[] }
type OptionList = Array<{ value: string; label: string }> | string[]
type OptionsSource = OptionList | ((ctx: FieldCtx) => OptionList)

type FieldSchema =
  | { kind: 'text'; label: string; placeholder?: string; get: (s: SettingsMap) => any; set: (value: string) => Record<string, any> }
  | { kind: 'image'; label: string; get: (s: SettingsMap) => any; set: (value: string) => Record<string, any> }
  | { kind: 'textarea'; label: string; placeholder?: string; get: (s: SettingsMap) => any; set: (value: string) => Record<string, any> }
  | { kind: 'select'; label: string; options: OptionsSource; get: (s: SettingsMap) => any; set: (value: string) => Record<string, any> }
  | { kind: 'toggle'; label: string; get: (s: SettingsMap) => boolean; set: (value: boolean) => Record<string, any> }
  | { kind: 'range'; label: string; min: number; max: number; step?: number; get: (s: SettingsMap) => number; set: (value: number) => Record<string, any> }
  | { kind: 'blocks'; label: string; blockType: string }

type PanelSchema = { title: string; fields: Array<FieldSchema | FieldSchema[]> }

const text = (label: string, name: string, placeholder?: string): FieldSchema =>
  ({ kind: 'text', label, placeholder, get: s => s[name], set: value => ({ [name]: value }) })
const image = (label: string, name: string): FieldSchema =>
  ({ kind: 'image', label, get: s => s[name], set: value => ({ [name]: value }) })
const textarea = (label: string, name: string, placeholder?: string): FieldSchema =>
  ({ kind: 'textarea', label, placeholder, get: s => s[name], set: value => ({ [name]: value }) })
const select = (label: string, name: string, options: OptionsSource, fallback = ''): FieldSchema =>
  ({ kind: 'select', label, options, get: s => s[name] || fallback, set: value => ({ [name]: value }) })
const toggle = (label: string, name: string, defaultTrue: boolean): FieldSchema =>
  ({ kind: 'toggle', label, get: s => defaultTrue ? s[name] !== false : Boolean(s[name]), set: value => ({ [name]: value }) })
const range = (label: string, name: string, min: number, max: number, fallback: number, step?: number): FieldSchema =>
  ({ kind: 'range', label, min, max, step, get: s => Number(s[name] ?? fallback), set: value => ({ [name]: value }) })
const blocks = (label: string, blockType: string): FieldSchema => ({ kind: 'blocks', label, blockType })

const commonLayoutPanel: PanelSchema = {
  title: 'Layout & appearance',
  fields: [[
    { kind: 'select', label: 'Background', options: ['default','surface','secondary','dark','primary','gradient'], get: s => s.background || 'default', set: value => ({ background: value === 'default' ? '' : value }) },
    select('Text alignment', 'textAlign', ['left','center','right'], 'left'),
    range('Spacing', 'spacing', 0, 160, 72),
    range('Columns', 'columns', 2, 6, 4),
  ]],
}

function productTypePanels(featured: boolean): PanelSchema[] {
  const selectionField: FieldSchema = featured
    ? { kind: 'select', label: 'Product', options: ({ products }) => products.map(p => ({ value: p.id, label: p.name })), get: s => s.productId || '', set: value => ({ productId: value }) }
    : { kind: 'select', label: 'Collection', options: ({ collections }) => [{ value: '', label: 'All products' }, ...collections.map(c => ({ value: c.slug || c.id, label: c.name }))], get: s => s.collection || '', set: value => ({ collection: value }) }
  return [
    { title: 'Content', fields: [
      text('Heading', 'heading'),
      textarea('Subheading', 'subheading'),
      selectionField,
      [range('Product limit', 'limit', 1, 48, 8), range('Columns', 'columns', 2, 6, 4)],
      toggle('Show View all', 'showViewAll', true),
    ] },
    { title: 'Card display', fields: [
      [select('Card style', 'style', ['cards','minimal','editorial'], 'cards'), select('Image ratio', 'imageRatio', ['square','portrait','landscape'], 'square')],
    ] },
  ]
}

function collectionTypePanels(): PanelSchema[] {
  return [
    { title: 'Content', fields: [
      text('Heading', 'heading'),
      textarea('Subheading', 'subheading'),
      range('Collections shown', 'limit', 1, 24, 4),
      range('Columns', 'columns', 2, 6, 4),
    ] },
    { title: 'Collection selection', fields: [
      { kind: 'select', label: 'Collection', options: ({ collections }) => [{ value: '', label: 'Automatic' }, ...collections.map(c => ({ value: c.id, label: c.name }))], get: s => (Array.isArray(s.collectionIds) ? s.collectionIds[0] : '') || '', set: value => ({ collectionIds: value ? [value] : [] }) },
    ] },
  ]
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

function mediaPanels(type: 'video' | 'slideshow'): PanelSchema[] {
  const mediaKey = type === 'video' ? 'videoUrl' : 'imageUrl'
  const posterKey = type === 'video' ? 'posterUrl' : 'imageUrl'
  const fields: Array<FieldSchema | FieldSchema[]> = [
    type === 'video'
      ? { kind: 'text', label: 'Video URL', get: s => s.imageUrl || s.videoUrl, set: value => ({ [mediaKey]: value }) }
      : { kind: 'image', label: 'Image', get: s => s.imageUrl || s.videoUrl, set: value => ({ [mediaKey]: value }) },
    { kind: 'image', label: 'Poster image', get: s => s.posterUrl || s.imageUrl, set: value => ({ [posterKey]: value }) },
  ]
  if (type === 'slideshow') fields.push(blocks('Slides', 'slide'))
  fields.push(toggle('Autoplay', 'autoplay', true))
  fields.push(range('Height', 'minHeight', 320, 860, 560))
  return [{ title: type === 'video' ? 'Video' : 'Slideshow', fields }]
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
      text('Eyebrow', 'eyebrow'),
      text('Heading', 'heading'),
      textarea('Text', 'text'),
      [text('Button label', 'buttonLabel'), text('Button URL', 'buttonUrl'), text('Secondary label', 'secondaryLabel'), text('Secondary URL', 'secondaryUrl')],
    ] },
    { title: 'Media', fields: [
      { kind: 'image', label: 'Desktop image', get: s => s.desktopImageUrl || s.imageUrl, set: value => ({ desktopImageUrl: value }) },
      image('Mobile image', 'mobileImageUrl'),
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
      toggle('Full bleed', 'fullBleed', true),
      toggle('Content box', 'contentBox', false),
    ] },
  ],
  product_grid: () => productTypePanels(false),
  product_carousel: () => productTypePanels(false),
  featured_product: () => productTypePanels(true),
  product_recommendations: () => productTypePanels(false),
  collection_grid: () => collectionTypePanels(),
  collection_carousel: () => collectionTypePanels(),
  image_with_text: () => [
    { title: 'Content', fields: [
      text('Eyebrow', 'eyebrow'),
      text('Heading', 'heading'),
      textarea('Text', 'text'),
      [text('Button label', 'buttonLabel'), text('Button URL', 'buttonUrl')],
    ] },
    { title: 'Media & layout', fields: [
      image('Image', 'imageUrl'),
      select('Image position', 'layout', ['image-left','image-right'], 'image-right'),
      select('Background', 'background', ['default','secondary','surface','dark'], 'secondary'),
      range('Min height', 'minHeight', 260, 700, 420),
    ] },
  ],
  promo_grid: () => [
    { title: 'Content', fields: [text('Heading', 'heading'), range('Columns', 'columns', 2, 4, 3)] },
    { title: 'Promo cards', fields: [blocks('Promo cards', 'promo')] },
  ],
  testimonials: () => [
    { title: 'Content', fields: [text('Heading', 'heading'), textarea('Subheading', 'subheading'), range('Columns', 'columns', 1, 4, 3), toggle('Autoplay', 'autoplay', true)] },
    { title: 'Testimonials', fields: [blocks('Testimonials', 'quote')] },
  ],
  newsletter: () => [
    { title: 'Content', fields: [text('Heading', 'heading'), textarea('Text', 'text'), text('Button label', 'buttonLabel')] },
    { title: 'Appearance', fields: [select('Background', 'background', ['primary','secondary','surface','dark'], 'primary')] },
  ],
  rich_text: () => richTextPanels(),
  main_collection_banner: () => richTextPanels(),
  trust_badges: () => [
    { title: 'Badges', fields: [blocks('Badges', 'badge')] },
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
    { title: 'Content', fields: [text('Heading', 'heading'), range('Columns', 'columns', 2, 6, 4)] },
    { title: 'Stats', fields: [blocks('Stats', 'stat')] },
  ],
  social_grid: () => [
    { title: 'Content', fields: [text('Heading', 'heading'), text('Handle / label', 'handle'), range('Columns', 'columns', 3, 6, 5)] },
    { title: 'Photos', fields: [blocks('Photos', 'photo')] },
  ],
  multicolumn: () => [
    { title: 'Content', fields: [text('Heading', 'heading'), textarea('Subheading', 'subheading'), range('Columns', 'columns', 2, 4, 3)] },
    { title: 'Columns', fields: [blocks('Columns', 'column')] },
  ],
  faq: () => [
    { title: 'Content', fields: [text('Heading', 'heading'), textarea('Subheading', 'subheading')] },
    { title: 'Questions', fields: [blocks('Questions', 'question')] },
  ],
  logo_list: () => [
    { title: 'Content', fields: [text('Heading', 'heading'), range('Columns', 'columns', 2, 6, 4)] },
    { title: 'Logos', fields: [blocks('Logos', 'logo')] },
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
  header: () => [
    { title: 'Header', fields: [
      select('Style', 'style', ['split','centered','minimal'], 'split'),
      toggle('Sticky', 'sticky', true),
      toggle('Search', 'showSearch', true),
      toggle('Account', 'showAccount', true),
      toggle('Cart', 'showCart', true),
      toggle('Mega menu', 'megaMenu', true),
      range('Logo width', 'logoWidth', 80, 260, 160),
      range('Navigation spacing', 'navSpacing', 8, 56, 24),
    ] },
  ],
  footer: () => [
    { title: 'Footer', fields: [toggle('Newsletter', 'showNewsletter', true), textarea('Footer text', 'text'), range('Columns', 'columns', 2, 5, 4)] },
  ],
  video: () => mediaPanels('video'),
  slideshow: () => mediaPanels('slideshow'),
  main_product: () => mainProductPanel(),
  main_collection_grid: () => mainCollectionGridPanel(),
}

function renderField(schema: FieldSchema, ctx: FieldCtx, set: (patch: Record<string, any>) => void): React.ReactNode {
  const { s } = ctx
  switch (schema.kind) {
    case 'text':
      return <Field key={schema.label} label={schema.label} placeholder={schema.placeholder} value={schema.get(s)} onChange={value => set(schema.set(value))} />
    case 'image':
      return <ImageField key={schema.label} label={schema.label} value={schema.get(s)} onChange={value => set(schema.set(value))} />
    case 'textarea':
      return <TextArea key={schema.label} label={schema.label} placeholder={schema.placeholder} value={schema.get(s)} onChange={value => set(schema.set(value))} />
    case 'select': {
      const options = typeof schema.options === 'function' ? schema.options(ctx) : schema.options
      return <Select key={schema.label} label={schema.label} value={schema.get(s)} options={options} onChange={value => set(schema.set(value))} />
    }
    case 'toggle':
      return <Toggle key={schema.label} label={schema.label} value={schema.get(s)} onChange={value => set(schema.set(value))} />
    case 'range':
      return <Range key={schema.label} label={schema.label} min={schema.min} max={schema.max} step={schema.step} value={schema.get(s)} onChange={value => set(schema.set(value))} />
    case 'blocks':
      return null
  }
}

function renderPanel(panel: PanelSchema, ctx: FieldCtx, set: (patch: Record<string, any>) => void, section: Section, onUpdateBlocks: (blocks: any[]) => void) {
  return (
    <SectionPanel key={panel.title} title={panel.title}>
      {panel.fields.map((entry, index) => {
        if (Array.isArray(entry)) {
          return <div className="themeInspectorGrid" key={index}>{entry.map(field => renderField(field, ctx, set))}</div>
        }
        if (entry.kind === 'blocks') {
          return <BlocksEditor key={entry.label} section={section} type={entry.blockType} onUpdateBlocks={onUpdateBlocks} />
        }
        return renderField(entry, ctx, set)
      })}
    </SectionPanel>
  )
}

export default function ShopifyThemeInspector({ section, products, collections, onUpdate, onUpdateBlocks }: Props) {
  const s = section.settings || {}
  const ctx: FieldCtx = { s, products, collections }
  const set = (patch: Record<string, any>) => onUpdate(patch)
  const panels = (SECTION_PANELS[section.type] || (() => [commonLayoutPanel]))()
  return (
    <div className="themeInspector">
      <SectionPanel title="General">
        <Toggle label="Section enabled" value={section.enabled !== false} onChange={value => onUpdate({ enabled: value })} />
        <Field label="Section ID" value={section.id} onChange={() => {}} />
      </SectionPanel>
      {panels.map(panel => renderPanel(panel, ctx, set, section, onUpdateBlocks))}
    </div>
  )
}
