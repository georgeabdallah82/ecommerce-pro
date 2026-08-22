export const defaultTheme={
  brandName:process.env.NEXT_PUBLIC_BRAND_NAME||'YOUR BRAND',
  logoUrl:'',faviconUrl:'',
  colors:{
    background:'#fffaf6',surface:'#ffffff',text:'#191512',muted:'#746b64',primary:'#ff5a1f',secondary:'#fff0e8',buttonText:'#ffffff',border:'#eaded4',announcementBg:'#191512',announcementText:'#ffffff',accent:'#2a8b63',sale:'#d92d20',success:'#16805b',warning:'#b7791f'
  },
  typography:{heading:'Inter',body:'Inter',scale:'100',headingWeight:'750',bodyWeight:'450',letterSpacing:'tight',lineHeight:'1.45'},
  layout:{maxWidth:1360,sectionSpacing:84,productColumns:4,cardGap:20,contentWidth:'wide',pageGutter:28},
  buttons:{radius:12,style:'solid',hover:'lift',height:'48',uppercase:false,shadow:'soft'},
  cards:{radius:20,shadow:'soft',hover:'lift',imageRatio:'square',showQuickAdd:true,showWishlist:true,showBadge:true},
  productCard:{titleLines:2,showVendor:false,showComparePrice:true,showReviews:true,showSwatches:true,hoverImage:true},
  productPage:{gallery:'left',stickyInfo:true,showBreadcrumbs:true,showVendor:true,showReviews:true,showShare:true,showWishlist:true,showShippingAccordion:true,showDescription:true,showSpecs:true,showRelated:true,relatedLimit:4},
  collectionPage:{showBreadcrumbs:true,showDescription:true,showImage:false,showSort:true,showFilters:true,columns:4,cardStyle:'cards'},
  header:{style:'split',sticky:true,transparentHome:false,showSearch:true,showAccount:true,showCart:true,showWishlist:false,showAnnouncement:true,megaMenu:true,logoWidth:160,navUppercase:false,navSpacing:24},
  announcement:{enabled:true,text:'Free shipping on orders over $50',link:'',dismissible:true,autoplay:true,speed:6,position:'above',height:40,showIcon:false,icon:'spark',uppercase:false},
  footer:{showNewsletter:true,text:'',columns:4},
  animations:{enabled:true,preset:'smooth',reveal:'fade-up',hover:'lift',duration:420,easing:'cubic-bezier(.22,.8,.26,1)',marquee:true,slideshowAutoplay:true,slideshowSpeed:5,reducedMotionRespect:true},
  accessibility:{focusRing:true,highContrast:false},
  customCss:'',
  presets:{active:'Vibrant'}
}
export const defaultSections=[
  {id:'announcement',type:'announcement',enabled:true,settings:{},blocks:[]},
  {id:'header',type:'header',enabled:true,settings:{},blocks:[]},
  {id:'hero',type:'hero',enabled:true,settings:{eyebrow:'NEW COLLECTION',heading:'Make your store impossible to ignore.',text:'A storefront that feels alive, sells clearly, and stays fully editable from your admin.',buttonLabel:'Shop now',buttonUrl:'/shop',secondaryLabel:'Explore collections',secondaryUrl:'/collections',imageUrl:'',desktopImageUrl:'',mobileImageUrl:'',imageAlt:'',focalX:50,focalY:50,mobileFocalX:50,mobileFocalY:50,imageFit:'cover',overlay:0.24,overlayColor:'#000000',overlayStyle:'solid',contentPosition:'center-left',textAlign:'left',contentWidth:620,contentBox:false,fullBleed:true,heightMode:'large',minHeight:640,customHeight:640,borderRadius:0,parallax:false,animation:'fade-up'},blocks:[]},
  {id:'featured',type:'product_grid',enabled:true,settings:{heading:'Featured products',subheading:'Best sellers, new arrivals or a hand-picked edit.',limit:8,collection:'',columns:4,style:'cards',showViewAll:true},blocks:[]},
  {id:'collections',type:'collection_grid',enabled:true,settings:{heading:'Shop by collection',subheading:'Build a visual path through your catalog.',limit:4,columns:4,style:'image-card'},blocks:[]},
  {id:'image-text',type:'image_with_text',enabled:true,settings:{eyebrow:'THE BRAND',heading:'Tell people why your store is different.',text:'Combine imagery, copy and a strong call to action in a section you can reorder anywhere.',buttonLabel:'Learn more',buttonUrl:'/about',imageUrl:'',layout:'image-right',background:'secondary',minHeight:420},blocks:[]},
  {id:'promo',type:'promo_grid',enabled:true,settings:{heading:'Shop the edit',columns:3},blocks:[{id:'promo1',type:'promo',settings:{heading:'Everyday essentials',text:'Simple products that work.',imageUrl:'',url:'/shop'}},{id:'promo2',type:'promo',settings:{heading:'New in',text:'Fresh additions to the store.',imageUrl:'',url:'/shop'}},{id:'promo3',type:'promo',settings:{heading:'Under $25',text:'Smart picks at a better price.',imageUrl:'',url:'/shop'}}]},
  {id:'testimonials',type:'testimonials',enabled:true,settings:{heading:'Loved by customers',subheading:'Real feedback makes the store feel real.',autoplay:true},blocks:[{id:'t1',type:'quote',settings:{quote:'Beautiful products, fast delivery and an experience that feels premium.',author:'Happy customer',role:'Verified buyer',rating:5}},{id:'t2',type:'quote',settings:{quote:'The site was so easy to use and the order arrived exactly when promised.',author:'Returning customer',role:'Verified buyer',rating:5}}]},
  {id:'newsletter',type:'newsletter',enabled:true,settings:{heading:'Stay in the loop',text:'Get launches, drops and offers in your inbox.',buttonLabel:'Subscribe',background:'primary'},blocks:[]},
  {id:'footer',type:'footer',enabled:true,settings:{},blocks:[]}
]
export const defaultNavigation=[{id:'shop',label:'Shop',type:'custom',url:'/shop',children:[]},{id:'collections',label:'Collections',type:'custom',url:'/collections',children:[]},{id:'about',label:'About',type:'custom',url:'/#about',children:[]}]
