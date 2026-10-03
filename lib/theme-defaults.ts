import { MARKET_COLORS, marketHomeSections } from './storefront-market'

export const defaultTheme={
  brandName:process.env.NEXT_PUBLIC_BRAND_NAME||'YOUR BRAND',
  logoUrl:'',logoUrlDark:'',faviconUrl:'',
  colors:{...MARKET_COLORS},
  typography:{heading:'dmSans',body:'dmSans',scale:'100',headingWeight:'800',bodyWeight:'400',letterSpacing:'normal',lineHeight:'1.5'},
  layout:{maxWidth:1360,sectionSpacing:76,productColumns:4,cardGap:16,contentWidth:'wide',pageGutter:28},
  buttons:{radius:10,style:'solid',hover:'lift',height:'46',uppercase:false,shadow:'none'},
  cards:{radius:14,shadow:'sm',hover:'lift',imageRatio:'square',showQuickAdd:true,showWishlist:true,showBadge:true},
  productCard:{titleLines:2,showVendor:false,showComparePrice:true,showReviews:true,showSwatches:true,hoverImage:true,showQuickView:true,showQuickBuy:true},
  productPage:{gallery:'left',stickyInfo:true,stickyAddToCart:true,showBreadcrumbs:true,showVendor:true,showReviews:true,showShare:true,showWishlist:true,showShippingAccordion:true,shippingText:'Free standard delivery is automatically applied to orders over $50. Tracked shipping worldwide.',showDescription:true,showSpecs:true,showRelated:true,relatedLimit:12,showTrustBadges:true,showStockCounter:true,showQuantity:true},
  collectionPage:{showBreadcrumbs:true,showDescription:true,showImage:true,showSort:true,showFilters:true,columns:4,cardStyle:'cards',showCollectionNavigation:true},
  discovery:{predictiveSearch:true,quickView:true,quickBuy:true,recentlyViewed:true,enhancedSearch:true,megaMenu:true,swatchFilters:true,productFiltering:true,productSorting:true},
  cart:{drawer:true,notes:true,stickyCheckout:true,freeShippingBar:true,recommendations:true},
  header:{style:'market',sticky:true,transparentHome:false,showSearch:true,showAccount:true,showCart:true,showWishlist:false,showAnnouncement:true,megaMenu:true,logoWidth:160,navUppercase:false,navSpacing:24},
  announcement:{enabled:true,text:'Free shipping on orders over $50',link:'',dismissible:true,autoplay:true,speed:6,position:'above',height:40,showIcon:false,icon:'spark',uppercase:false},
  footer:{showNewsletter:true,text:'',columns:4},
  social:{instagram:'',facebook:'',tiktok:'',twitter:'',youtube:''},
  animations:{enabled:true,preset:'smooth',reveal:'fade-up',hover:'lift',duration:420,easing:'cubic-bezier(.22,.8,.26,1)',marquee:true,slideshowAutoplay:true,slideshowSpeed:5,reducedMotionRespect:true},
  accessibility:{focusRing:true,highContrast:false},
  // Bar under the header: where the customer is having their order delivered and when.
  // areas is one "Area | delivery time" per line; the chosen area is pre-filled at checkout.
  delivery:{enabled:true,areas:'Beirut | Tomorrow\nMetn | Tomorrow\nKeserwan | Within 24–48 hours\nJbeil | Within 48 hours\nNorth | Within 48 hours\nSouth | Within 48 hours\nBekaa | Within 48 hours',note:'Cash on delivery'},
  // Floating WhatsApp button. Empty number uses the store's contact phone (Settings).
  whatsapp:{enabled:false,number:'',message:'Hi! I would like to order.',position:'right',label:'',showOnMobile:true},
  // Product cards: the small line under the price.
  productCardMarket:{deliveryText:'Cash on delivery',showAddToCart:true},
  customCss:'',
  presets:{active:'Quiet Minimal'}
}

export const defaultSections=[
  {id:'announcement',type:'announcement',enabled:true,settings:{height:40,speed:6,autoplay:true,dismissible:true,position:'above'},blocks:[{id:'announcement-msg-1',type:'message',settings:{text:'Free delivery on orders over $50 · Cash on delivery',link:''}}]},
  {id:'header',type:'header',enabled:true,settings:{},blocks:[]},
  ...marketHomeSections(),
  {id:'footer',type:'footer',enabled:true,settings:{},blocks:[]}
]

export const defaultNavigation=[{id:'shop',label:'Shop',type:'custom',url:'/shop',children:[]},{id:'collections',label:'Collections',type:'custom',url:'/collections',children:[]},{id:'about',label:'About',type:'custom',url:'/#about',children:[]}]
