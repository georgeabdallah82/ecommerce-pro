export const defaultTheme={
  brandName:process.env.NEXT_PUBLIC_BRAND_NAME||'YOUR BRAND',
  logoUrl:'',faviconUrl:'',
  colors:{background:'#f7f7f8',surface:'#ffffff',text:'#1a1a1a',muted:'#68707a',primary:'#d42a2a',secondary:'#fff1e6',buttonText:'#ffffff',border:'#e7e7ea',announcementBg:'#1a1a1a',announcementText:'#ffffff',accent:'#ff7a1a',sale:'#e11d2e',success:'#16a34a',warning:'#f59e0b'},
  typography:{heading:'poppins',body:'inter',scale:'100',headingWeight:'700',bodyWeight:'500',letterSpacing:'normal',lineHeight:'1.5'},
  layout:{maxWidth:1360,sectionSpacing:76,productColumns:4,cardGap:16,contentWidth:'wide',pageGutter:28},
  buttons:{radius:32,style:'solid',hover:'lift',height:'48',uppercase:true,shadow:'none'},
  cards:{radius:14,shadow:'sm',hover:'lift',imageRatio:'square',showQuickAdd:true,showWishlist:true,showBadge:true},
  productCard:{titleLines:2,showVendor:false,showComparePrice:true,showReviews:true,showSwatches:true,hoverImage:true,showQuickView:true,showQuickBuy:true},
  productPage:{gallery:'left',stickyInfo:true,stickyAddToCart:true,showBreadcrumbs:true,showVendor:true,showReviews:true,showShare:true,showWishlist:true,showShippingAccordion:true,showDescription:true,showSpecs:true,showRelated:true,relatedLimit:4,showTrustBadges:true,showStockCounter:true,showQuantity:true},
  collectionPage:{showBreadcrumbs:true,showDescription:true,showImage:false,showSort:true,showFilters:true,columns:4,cardStyle:'cards',showCollectionNavigation:true},
  discovery:{predictiveSearch:true,quickView:true,quickBuy:true,recentlyViewed:true,enhancedSearch:true,megaMenu:true,swatchFilters:true,productFiltering:true,productSorting:true},
  cart:{drawer:true,notes:true,stickyCheckout:true,freeShippingBar:true,recommendations:true},
  header:{style:'split',sticky:true,transparentHome:false,showSearch:true,showAccount:true,showCart:true,showWishlist:false,showAnnouncement:true,megaMenu:true,logoWidth:160,navUppercase:false,navSpacing:24},
  announcement:{enabled:true,text:'Free shipping on orders over $50',link:'',dismissible:true,autoplay:true,speed:6,position:'above',height:40,showIcon:false,icon:'spark',uppercase:false},
  footer:{showNewsletter:true,text:'',columns:4},
  social:{instagram:'',facebook:'',tiktok:'',twitter:'',youtube:''},
  animations:{enabled:true,preset:'smooth',reveal:'fade-up',hover:'lift',duration:420,easing:'cubic-bezier(.22,.8,.26,1)',marquee:true,slideshowAutoplay:true,slideshowSpeed:5,reducedMotionRespect:true},
  accessibility:{focusRing:true,highContrast:false},
  customCss:'',
  presets:{active:'Quiet Minimal'}
}

export const defaultSections=[
  {id:'announcement',type:'announcement',enabled:true,settings:{height:40,speed:6,autoplay:true,dismissible:true,position:'above'},blocks:[{id:'announcement-msg-1',type:'message',settings:{text:'Free shipping on orders over $50',link:''}}]},
  {id:'header',type:'header',enabled:true,settings:{},blocks:[]},
  {id:'hero',type:'hero',enabled:true,settings:{eyebrow:'NEW COLLECTION',heading:'Make your store impossible to ignore.',text:'A storefront that feels alive, sells clearly, and stays fully editable from your admin.',buttonLabel:'Shop now',buttonUrl:'/shop',secondaryLabel:'Explore collections',secondaryUrl:'/collections',imageUrl:'',desktopImageUrl:'',mobileImageUrl:'',imageAlt:'',focalX:50,focalY:50,mobileFocalX:50,mobileFocalY:50,imageFit:'cover',overlay:0.24,overlayColor:'#000000',overlayStyle:'bottom-gradient',contentPosition:'center-left',textAlign:'left',contentWidth:620,contentBox:false,fullBleed:true,heightMode:'adapt',imageHeightMode:'adapt',minHeight:640,customHeight:640,borderRadius:0,parallax:false,animation:'fade-up'},blocks:[]},
  {id:'featured',type:'product_grid',enabled:true,settings:{heading:'Featured products',subheading:'Best sellers, new arrivals or a hand-picked edit.',limit:8,collection:'',columns:4,style:'cards',showViewAll:true},blocks:[]},
  {id:'collections',type:'collection_grid',enabled:true,settings:{heading:'Shop by collection',subheading:'Build a visual path through your catalog.',limit:4,columns:4,style:'image-card',collectionIds:[]},blocks:[]},
  {id:'image-text',type:'image_with_text',enabled:true,settings:{eyebrow:'THE BRAND',heading:'Tell people why your store is different.',text:'Combine imagery, copy and a strong call to action in a section you can reorder anywhere.',buttonLabel:'Learn more',buttonUrl:'/about',imageUrl:'',layout:'image-right',background:'secondary',minHeight:420},blocks:[]},
  {id:'promo',type:'promo_grid',enabled:true,settings:{heading:'Shop the edit',columns:3},blocks:[{id:'promo1',type:'promo',settings:{heading:'Everyday essentials',text:'Simple products that work.',imageUrl:'',url:'/shop'}},{id:'promo2',type:'promo',settings:{heading:'New in',text:'Fresh additions to the store.',imageUrl:'',url:'/shop'}},{id:'promo3',type:'promo',settings:{heading:'Under $25',text:'Smart picks at a better price.',imageUrl:'',url:'/shop'}}]},
  {id:'testimonials',type:'testimonials',enabled:true,settings:{heading:'Loved by customers',subheading:'Real feedback makes the store feel real.',autoplay:true,columns:3},blocks:[{id:'t1',type:'quote',settings:{quote:'Beautiful products, fast delivery and an experience that feels premium.',author:'Happy customer',role:'Verified buyer',rating:5}},{id:'t2',type:'quote',settings:{quote:'The site was so easy to use and the order arrived exactly when promised.',author:'Returning customer',role:'Verified buyer',rating:5}}]},
  {id:'newsletter',type:'newsletter',enabled:true,settings:{heading:'Stay in the loop',text:'Get launches, drops and offers in your inbox.',buttonLabel:'Subscribe',background:'primary'},blocks:[]},
  {id:'footer',type:'footer',enabled:true,settings:{},blocks:[]}
]

export const defaultNavigation=[{id:'shop',label:'Shop',type:'custom',url:'/shop',children:[]},{id:'collections',label:'Collections',type:'custom',url:'/collections',children:[]},{id:'about',label:'About',type:'custom',url:'/#about',children:[]}]
