'use client'

import {ArrowDown,ArrowLeft,ArrowUp,Check,Copy,Eye,GripVertical,Image as ImageIcon,Monitor,Palette,Plus,Redo2,Save,Search,Settings2,Smartphone,Tablet,Trash2,Undo2,X} from 'lucide-react'
import {useEffect,useMemo,useState} from 'react'
import StorefrontSections from '@/components/storefront-sections'
import {StoreNav} from '@/components/store-nav'
import {Footer} from '@/components/footer'
import {CartProvider} from '@/components/cart-provider'

type AnyMap=Record<string,any>
type NavItem={id:string;label:string;url?:string|null;parentId?:string|null;children?:NavItem[]}
type Section={id:string;type:string;enabled:boolean;settings:AnyMap;blocks?:AnyMap[]}
type Asset={id:string;name:string;url:string;alt?:string|null}
type CatalogProduct={id:string;name:string;slug:string;basePrice:number;compareAtPrice?:number|null;images?:{url:string;alt?:string|null}[];vendor?:string|null;category?:{name:string}|null;collections?:{collection:{id:string;slug:string;name:string}}[]}
type CatalogCollection={id:string;name:string;slug:string;description?:string|null;imageUrl?:string|null;products?:AnyMap[]}
type Snapshot={theme:AnyMap;templates:Record<string,Section[]>}

type Props={initial:{theme:AnyMap;sections:Section[];navigation:AnyMap[]}}

const TEMPLATES=[
  {key:'Home page',path:'/'},{key:'Products',path:'/shop'},{key:'Product',path:'/product/demo'},
  {key:'Collections',path:'/collections'},{key:'Collection',path:'/collections/demo'},{key:'Cart',path:'/cart'},
  {key:'Pages',path:'/about'},{key:'Blog',path:'/blog'}
]

const SECTION_META:Record<string,{label:string;group:string;description:string}>= {
  announcement:{label:'Announcement bar',group:'Header',description:'Shipping, promotions and store notices.'},
  header:{label:'Header',group:'Header',description:'Logo, navigation, search and customer actions.'},
  hero:{label:'Image banner',group:'Hero & media',description:'Responsive campaign banner with image, text and buttons.'},
  slideshow:{label:'Slideshow',group:'Hero & media',description:'Rotating campaign slides.'},
  video:{label:'Video',group:'Hero & media',description:'Video/poster storytelling block.'},
  image_with_text:{label:'Image with text',group:'Hero & media',description:'Editorial image and copy layout.'},
  product_grid:{label:'Featured collection',group:'Products',description:'Curated product grid with collection source.'},
  product_carousel:{label:'Product carousel',group:'Products',description:'Scrollable product merchandising.'},
  featured_product:{label:'Featured product',group:'Products',description:'Single product spotlight.'},
  product_recommendations:{label:'Product recommendations',group:'Products',description:'Related product discovery.'},
  main_product:{label:'Main product',group:'Products',description:'Product details/gallery/purchase area.'},
  collection_grid:{label:'Collection list',group:'Collections',description:'Visual collection cards with selection.'},
  collection_carousel:{label:'Collection carousel',group:'Collections',description:'Scrollable collections.'},
  main_collection_banner:{label:'Collection banner',group:'Collections',description:'Collection hero and intro.'},
  main_collection_grid:{label:'Collection products',group:'Collections',description:'Products belonging to the current collection.'},
  main_collection:{label:'Main collection',group:'Collections',description:'Collection intro plus products.'},
  multicolumn:{label:'Multicolumn',group:'Content',description:'Benefits, features or editorial cards.'},
  rich_text:{label:'Rich text',group:'Content',description:'Long-form text content.'},
  testimonials:{label:'Testimonials',group:'Content',description:'Reviews and customer proof.'},
  logo_list:{label:'Logo list',group:'Content',description:'Partners, brands or press.'},
  faq:{label:'Collapsible content',group:'Content',description:'FAQ accordion.'},
  newsletter:{label:'Email signup',group:'Content',description:'Newsletter capture.'},
  footer:{label:'Footer',group:'Footer',description:'Footer navigation and information.'},
}

const GROUPS=['Header','Hero & media','Products','Collections','Content','Footer']

function clone<T>(v:T):T{return structuredClone(v)}
function makeId(t:string){return `${t}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`}

function makeSection(type:string):Section{
  const common={spacing:72,contentWidth:1180,animation:'fade-up'}
  if(type==='announcement')return {id:makeId(type),type,enabled:true,settings:{...common,text:'Free shipping on orders over $50',link:'',background:'primary',textColor:'#ffffff',height:40},blocks:[]}
  if(type==='header')return {id:makeId(type),type,enabled:true,settings:{...common,sticky:true,logoWidth:160,style:'standard',showSearch:true,showAccount:true,showCart:true},blocks:[]}
  if(type==='hero')return {id:makeId(type),type,enabled:true,settings:{...common,eyebrow:'NEW COLLECTION',heading:'Make your store impossible to ignore.',text:'A premium storefront built for conversion.',buttonLabel:'Shop now',buttonUrl:'/shop',secondaryLabel:'Explore collections',secondaryUrl:'/collections',imageUrl:'',mobileImageUrl:'',imageAlt:'',imageHeightMode:'adapt',minHeight:640,imageFit:'cover',focalX:50,focalY:50,overlay:.24,overlayColor:'#000000',overlayStyle:'bottom-gradient',contentPosition:'center-left',contentBox:false,textAlign:'left',fullBleed:true,borderRadius:0},blocks:[]}
  if(type==='slideshow')return {id:makeId(type),type,enabled:true,settings:{...common,heading:'Featured',autoplay:true,speed:5,minHeight:560,imageHeightMode:'adapt'},blocks:[1,2].map(n=>({id:makeId('slide'),type:'slide',settings:{heading:`Slide ${n}`,text:'Campaign message',buttonLabel:'Shop now',buttonUrl:'/shop',imageUrl:'',overlay:.25}}))}
  if(type==='image_with_text')return {id:makeId(type),type,enabled:true,settings:{...common,eyebrow:'THE BRAND',heading:'Tell your story.',text:'Combine imagery, copy and a strong call to action.',buttonLabel:'Learn more',buttonUrl:'/about',imageUrl:'',layout:'image-right'},blocks:[]}
  if(type==='video')return {id:makeId(type),type,enabled:true,settings:{...common,heading:'Watch the story',text:'',imageUrl:'',minHeight:460},blocks:[]}
  if(type==='main_product')return {id:makeId(type),type,enabled:true,settings:{...common,previewProductId:'',stickyAddToCart:true,showVendor:true,showReviews:true,showWishlist:true,showShare:true},blocks:[]}
  if(type==='main_collection')return {id:makeId(type),type,enabled:true,settings:{...common,heading:'Collection',subheading:'',limit:24,columns:4},blocks:[]}
  if(type==='main_collection_banner')return {id:makeId(type),type,enabled:true,settings:{...common,heading:'Collection',subheading:'',imageUrl:''},blocks:[]}
  if(type==='main_collection_grid')return {id:makeId(type),type,enabled:true,settings:{...common,heading:'Products',limit:24,columns:4},blocks:[]}
  if(type==='collection_grid'||type==='collection_carousel')return {id:makeId(type),type,enabled:true,settings:{...common,heading:'Shop by collection',subheading:'',limit:4,columns:4,collectionIds:[]},blocks:[]}
  if(type==='product_grid'||type==='product_carousel'||type==='product_recommendations'||type==='featured_product')return {id:makeId(type),type,enabled:true,settings:{...common,heading:type==='featured_product'?'Featured product':type==='product_recommendations'?'You may also like':'Featured products',subheading:'Best sellers, new arrivals or a hand-picked edit.',limit:type==='featured_product'?1:8,columns:type==='featured_product'?1:4,showViewAll:true,collection:''},blocks:[]}
  if(type==='multicolumn')return {id:makeId(type),type,enabled:true,settings:{...common,heading:'Why shop with us?',columns:3},blocks:['Fast delivery','Secure checkout','Helpful support'].map(x=>({id:makeId('column'),type:'column',settings:{heading:x,text:'Add a benefit or feature.'}}))}
  if(type==='testimonials')return {id:makeId(type),type,enabled:true,settings:{...common,heading:'Loved by customers',columns:3},blocks:['Happy customer','Returning customer','Verified buyer'].map(x=>({id:makeId('quote'),type:'quote',settings:{quote:'Beautiful products and a premium experience.',author:x,role:'Verified buyer',rating:5}}))}
  if(type==='logo_list')return {id:makeId(type),type,enabled:true,settings:{...common,heading:'Featured in',columns:5},blocks:['Partner 1','Partner 2','Partner 3','Partner 4','Partner 5'].map(x=>({id:makeId('logo'),type:'logo',settings:{text:x,imageUrl:'',alt:x}}))}
  if(type==='faq')return {id:makeId(type),type,enabled:true,settings:{...common,heading:'Frequently asked questions'},blocks:['What is your return policy?','How fast do you ship?','How can I contact support?'].map(x=>({id:makeId('faq'),type:'faq',settings:{question:x,answer:'Add your answer here.'}}))}
  if(type==='newsletter')return {id:makeId(type),type,enabled:true,settings:{...common,heading:'Stay in the loop',text:'Get launches, drops and offers in your inbox.',buttonLabel:'Subscribe',background:'primary'},blocks:[]}
  if(type==='rich_text')return {id:makeId(type),type,enabled:true,settings:{...common,eyebrow:'ABOUT THE BRAND',heading:'Tell people what makes your brand different.',text:'Use this space for your story, mission or editorial content.'},blocks:[]}
  if(type==='footer')return {id:makeId(type),type,enabled:true,settings:{...common,showNewsletter:true,columns:4},blocks:[]}
  return {id:makeId(type),type,enabled:true,settings:common,blocks:[]}
}

function defaultTemplates(initialSections:Section[]):Record<string,Section[]>{
  return {
    'Home page':initialSections?.length?clone(initialSections):[makeSection('announcement'),makeSection('hero'),makeSection('product_grid'),makeSection('collection_grid'),makeSection('newsletter')],
    'Products':[makeSection('announcement'),makeSection('rich_text'),makeSection('product_grid'),makeSection('newsletter')],
    'Product':[makeSection('announcement'),makeSection('main_product'),makeSection('product_recommendations'),makeSection('newsletter')],
    'Collections':[makeSection('announcement'),makeSection('collection_grid'),makeSection('newsletter')],
    'Collection':[makeSection('announcement'),makeSection('main_collection_banner'),makeSection('main_collection_grid'),makeSection('newsletter')],
    'Cart':[makeSection('announcement'),makeSection('rich_text'),makeSection('newsletter')],
    'Pages':[makeSection('announcement'),makeSection('hero'),makeSection('rich_text'),makeSection('image_with_text'),makeSection('newsletter')],
    'Blog':[makeSection('announcement'),makeSection('hero'),makeSection('collection_grid'),makeSection('rich_text'),makeSection('newsletter')],
  }
}

const editorCss=`
.focalEditor{position:fixed;inset:0;z-index:9999;display:grid;grid-template-rows:64px 1fr;background:#f6f7f7;color:#202223;font-family:Inter,ui-sans-serif,system-ui,sans-serif}.focalEditor *{box-sizing:border-box}.focalTop{display:flex;align-items:center;justify-content:space-between;padding:0 14px;background:#fff;border-bottom:1px solid #e3e6e8}.focalTopLeft,.focalTopRight,.focalTemplatePicker{display:flex;align-items:center;gap:9px}.focalBack,.focalIconBtn{width:34px;height:34px;border:1px solid #dfe3e6;background:#fff;border-radius:9px;display:grid;place-items:center;cursor:pointer;color:#5c6267}.focalBrandKicker{font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#8a9096;font-weight:800}.focalBrandTitle{font-size:14px;font-weight:800}.focalTemplatePicker select{height:37px;border:1px solid #dfe3e6;border-radius:9px;background:#fff;padding:0 28px 0 11px;font-size:11px;font-weight:800}.focalDevice{display:flex;border:1px solid #dfe3e6;border-radius:9px;background:#fafbfc;padding:2px}.focalDevice button{width:29px;height:29px;border:0;background:transparent;border-radius:6px;display:grid;place-items:center;color:#6d7378;cursor:pointer}.focalDevice button.active{background:var(--focal-primary);color:#fff}.focalBtn{height:36px;padding:0 13px;border-radius:8px;border:1px solid #dfe3e6;background:#fff;display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:800;cursor:pointer}.focalBtn.primary{background:var(--focal-primary);border-color:var(--focal-primary);color:#fff}.focalBtn:disabled{opacity:.45}.focalBody{display:grid;grid-template-columns:310px minmax(0,1fr);min-height:0}.focalSidebar{background:#fff;border-right:1px solid #e3e6e8;overflow:auto}.focalSidebarTabs{display:grid;grid-template-columns:1fr 1fr;padding:8px;gap:6px;border-bottom:1px solid #e8eaec}.focalSidebarTabs button{height:34px;border:0;border-radius:7px;background:transparent;color:#747a7f;font-size:10px;font-weight:800;cursor:pointer}.focalSidebarTabs button.active{background:color-mix(in srgb,var(--focal-primary) 10%,white);color:#202223}.focalSectionHead{display:flex;align-items:center;justify-content:space-between;padding:14px 13px 10px}.focalSectionHead strong{font-size:13px}.focalSectionHead small{display:block;margin-top:3px;color:#8a9096;font-size:9px}.focalRows{padding:4px 8px 12px}.focalRow{display:flex;border:1px solid transparent;border-radius:8px;margin:3px 0}.focalRow.selected{background:color-mix(in srgb,var(--focal-primary) 9%,white);border-color:color-mix(in srgb,var(--focal-primary) 25%,#e3e6e8);box-shadow:inset 3px 0 var(--focal-primary)}.focalRowMain{display:flex;align-items:center;gap:8px;flex:1;border:0;background:transparent;padding:11px 9px;text-align:left;cursor:pointer;font-size:11px}.focalRowMain span{flex:1}.focalMainMark{font-size:8px;letter-spacing:.1em;color:#8a9096}.focalRowToggle{width:34px;border:0;background:transparent;color:#8a9096;cursor:pointer}.focalAddSection{margin:4px 12px 18px;width:calc(100% - 24px);height:38px;border:1px dashed #c9ced2;background:#fff;border-radius:8px;display:flex;align-items:center;justify-content:center;gap:7px;font-size:11px;font-weight:800;cursor:pointer}.focalSidebarFoot{padding:12px;border-top:1px solid #e8eaec;display:grid;gap:5px}.focalSidebarFoot button{border:0;background:#fff;border-radius:8px;text-align:left;padding:10px;font-size:11px;color:#61666b;display:flex;align-items:center;gap:8px;cursor:pointer}.focalCanvas{min-width:0;display:flex;flex-direction:column;overflow:hidden}.focalCanvasTop{height:44px;display:flex;align-items:center;justify-content:space-between;padding:0 16px;background:#f6f7f7;border-bottom:1px solid #e3e6e8;font-size:11px}.focalLive{display:flex;gap:6px;align-items:center;font-size:9px;font-weight:700;color:#6e7479}.focalLive i{width:6px;height:6px;border-radius:50%;background:#22a06b}.focalViewport{flex:1;overflow:auto;padding:22px}.focalPreviewFrame{margin:0 auto;min-height:100%;overflow:hidden;background:#fff;border:1px solid #dde1e3;border-radius:4px;box-shadow:0 8px 28px rgba(0,0,0,.06)}.focalDrawer{position:absolute;top:0;right:0;bottom:0;width:380px;background:#fff;border-left:1px solid #e3e6e8;z-index:40;display:flex;flex-direction:column;box-shadow:-8px 0 30px rgba(0,0,0,.08)}.focalDrawerHead{padding:16px;border-bottom:1px solid #e8eaec;display:flex;justify-content:space-between;gap:12px}.focalDrawerTitle{margin:0;font-size:16px}.focalDrawerActions{display:flex;gap:4px}.focalDrawerActions button{width:30px;height:30px;border:1px solid #dfe3e6;background:#fff;border-radius:7px;display:grid;place-items:center;cursor:pointer}.focalDrawerTabs{display:grid;grid-template-columns:repeat(3,1fr);border-bottom:1px solid #e8eaec}.focalDrawerTabs button{height:39px;border:0;background:#fff;border-bottom:2px solid transparent;font-size:10px;font-weight:800;color:#70767b;cursor:pointer}.focalDrawerTabs button.active{color:#202223;border-bottom-color:var(--focal-primary)}.focalInspector{flex:1;overflow:auto;padding:15px}.focalPanel{border:1px solid #e1e5e7;border-radius:10px;background:#fff;overflow:hidden;margin-bottom:12px}.focalPanelTitle{padding:12px 13px;border-bottom:1px solid #e8eaec;font-size:11px;font-weight:800}.focalPanelBody{padding:13px;display:grid;gap:12px}.focalField label{display:block;font-size:10px;font-weight:800;margin-bottom:5px}.focalInput,.focalSelect,.focalTextarea{width:100%;border:1px solid #dfe3e6;background:#fff;border-radius:8px;min-height:36px;padding:8px 10px;font-size:11px;outline:none}.focalTextarea{min-height:78px;resize:vertical}.focalTwo{display:grid;grid-template-columns:1fr 1fr;gap:9px}.focalThree{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.focalColor{display:grid;grid-template-columns:44px 1fr;gap:8px}.focalColor input[type=color]{width:44px;height:36px;padding:2px;border:1px solid #dfe3e6;border-radius:8px;background:#fff}.focalRange{display:grid;grid-template-columns:1fr 54px;gap:8px;align-items:center}.focalCheck{display:flex;align-items:center;gap:8px;font-size:10px}.focalCheck input{accent-color:var(--focal-primary)}.focalSelectList{display:grid;gap:5px}.focalChoice{border:1px solid #dfe3e6;background:#fff;border-radius:8px;padding:9px;text-align:left;font-size:10px;cursor:pointer}.focalChoice.active{border-color:color-mix(in srgb,var(--focal-primary) 55%,#dfe3e6);background:color-mix(in srgb,var(--focal-primary) 8%,white)}.focalModal{position:absolute;inset:0;z-index:70;background:rgba(32,34,35,.35);display:grid;place-items:center;padding:25px}.focalModalCard{width:min(640px,100%);max-height:80vh;background:#fff;border-radius:14px;box-shadow:0 20px 70px rgba(0,0,0,.2);overflow:hidden;display:flex;flex-direction:column}.focalModalHeader{padding:15px 16px;border-bottom:1px solid #e8eaec;display:flex;justify-content:space-between;align-items:center}.focalModalBody{padding:15px;overflow:auto}.focalAssetGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.focalAsset{border:1px solid #dfe3e6;background:#fff;border-radius:9px;overflow:hidden;cursor:pointer;text-align:left}.focalAsset img{display:block;width:100%;aspect-ratio:1;object-fit:cover;background:#f1f2f2}.focalAsset span{display:block;padding:7px;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@media(max-width:1050px){.focalBody{grid-template-columns:250px 1fr}.focalDrawer{width:340px}.focalAssetGrid{grid-template-columns:repeat(3,1fr)}}
@media(max-width:720px){.focalTop{padding:0 8px}.focalTopLeft{min-width:auto}.focalBrandTitle,.focalBrandKicker,.focalTop .focalTemplatePicker span,.focalTop .focalBtn.secondaryHide{display:none}.focalBody{grid-template-columns:1fr}.focalSidebar{display:none}.focalDrawer{width:100%}.focalViewport{padding:8px}}
`

function Field({label,value,onChange,placeholder,type='text'}:{label:string;value:any;onChange:(v:any)=>void;placeholder?:string;type?:string}){return <div className="focalField"><label>{label}</label><input className="focalInput" type={type} value={value??''} placeholder={placeholder} onChange={e=>onChange(type==='number'?Number(e.target.value):e.target.value)}/></div>}
function Textarea({label,value,onChange}:{label:string;value:any;onChange:(v:string)=>void}){return <div className="focalField"><label>{label}</label><textarea className="focalTextarea" value={value??''} onChange={e=>onChange(e.target.value)}/></div>}
function Select({label,value,options,onChange}:{label:string;value:string;options:{value:string;label:string}[];onChange:(v:string)=>void}){return <div className="focalField"><label>{label}</label><select className="focalSelect" value={value??''} onChange={e=>onChange(e.target.value)}>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></div>}
function Panel({title,children}:{title:string;children:any}){return <section className="focalPanel"><div className="focalPanelTitle">{title}</div><div className="focalPanelBody">{children}</div></section>}

export default function ProThemeEditor({initial}:Props){
  const base=useMemo(()=>initial.theme?.editorTemplates&&typeof initial.theme.editorTemplates==='object'?clone(initial.theme.editorTemplates):defaultTemplates(initial.sections),[initial])
  const [theme,setTheme]=useState<AnyMap>(()=>clone(initial.theme))
  const [templates,setTemplates]=useState<Record<string,Section[]>>(()=>base)
  const [page,setPage]=useState('Home page')
  const [selectedId,setSelectedId]=useState('')
  const [device,setDevice]=useState<'desktop'|'tablet'|'mobile'>('desktop')
  const [activeMainTab,setActiveMainTab]=useState<'sections'|'theme'>('sections')
  const [drawerTab,setDrawerTab]=useState<'content'|'design'|'advanced'>('content')
  const [drawer,setDrawer]=useState(false)
  const [picker,setPicker]=useState(false)
  const [assetPicker,setAssetPicker]=useState(false)
  const [assetTarget,setAssetTarget]=useState<{kind:'logo'|'favicon'|'section';sectionId?:string}|null>(null)
  const [assets,setAssets]=useState<Asset[]>([])
  const [products,setProducts]=useState<CatalogProduct[]>([])
  const [collections,setCollections]=useState<CatalogCollection[]>([])
  const [query,setQuery]=useState('')
  const [history,setHistory]=useState<Snapshot[]>([])
  const [future,setFuture]=useState<Snapshot[]>([])
  const [dirty,setDirty]=useState(false)
  const [saving,setSaving]=useState(false)
  const [notice,setNotice]=useState('')
  const [error,setError]=useState('')
  const current=templates[page]||[]
  const selectedIndex=current.findIndex(s=>s.id===selectedId)
  const selected=current[selectedIndex]||null
