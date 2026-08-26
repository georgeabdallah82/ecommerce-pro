import fs from 'node:fs'

function patch(file, replacements) {
  let source = fs.readFileSync(file, 'utf8')
  let changed = false
  for (const [from, to] of replacements) {
    if (!source.includes(from)) continue
    const next = source.replace(from, to)
    if (next !== source) changed = true
    source = next
  }
  if (changed) fs.writeFileSync(file, source)
  return changed
}

const storefrontChanged = patch('components/storefront-sections.tsx', [
  [
    "const quickAdd=(e:React.MouseEvent)=>{e.preventDefault();e.stopPropagation();addItem({productId:p.id,variantId:null,name:p.name,sku:p.sku||p.slug,price,image:img(image),quantity:1})};",
    "const quickAdd=(e:React.MouseEvent)=>{e.preventDefault();e.stopPropagation();if(Array.isArray(p.variants)&&p.variants.length>0){onQuickView(p);return}addItem({productId:p.id,variantId:null,name:p.name,sku:p.sku||p.slug,price,image:img(image),quantity:1})};"
  ],
  [
    "function MainProductSection({section,theme,product,preview,selected,onSelect,wishlist,toggleWish}:{section:AnyMap;theme:AnyMap;product:AnyMap|null;preview?:boolean;selected?:boolean;onSelect?:(id:string)=>void;wishlist:Record<string,boolean>;toggleWish:(id:string)=>void}){const {addItem}=useCart();const [selectedVariantId,setSelectedVariantId]=useState<string|null>(product?.variants?.[0]?.id||null);const [qty,setQty]=useState(1);",
    "function MainProductSection({section,theme,product,preview,selected,onSelect,wishlist,toggleWish}:{section:AnyMap;theme:AnyMap;product:AnyMap|null;preview?:boolean;selected?:boolean;onSelect?:(id:string)=>void;wishlist:Record<string,boolean>;toggleWish:(id:string)=>void}){const {addItem}=useCart();const [selectedVariantId,setSelectedVariantId]=useState<string|null>(product?.variants?.[0]?.id||null);const [qty,setQty]=useState(1);useEffect(()=>{setSelectedVariantId(product?.variants?.[0]?.id||null);setQty(1)},[product?.id]);"
  ],
  [
    "function QuickView({product,theme,onClose}:{product:AnyMap;theme:AnyMap;onClose:()=>void}){const {addItem}=useCart();const [qty,setQty]=useState(1);const [variantId,setVariantId]=useState<string|null>(product.variants?.[0]?.id||null);",
    "function QuickView({product,theme,onClose}:{product:AnyMap;theme:AnyMap;onClose:()=>void}){const {addItem}=useCart();const [qty,setQty]=useState(1);const [variantId,setVariantId]=useState<string|null>(product.variants?.[0]?.id||null);useEffect(()=>{setVariantId(product.variants?.[0]?.id||null);setQty(1)},[product?.id]);"
  ],
  [
    "const [wishlist,setWishlist]=useState<Record<string,boolean>>({});const activeProduct=product||products[0]||null;",
    "const [wishlist,setWishlist]=useState<Record<string,boolean>>({});const activeProduct=product||products[0]||null;useEffect(()=>{let alive=true;(async()=>{try{const response=await fetch('/api/wishlist',{cache:'no-store'});if(!response.ok)return;const data=await response.json();const next:Record<string,boolean>={};for(const item of Array.isArray(data.items)?data.items:[])if(item?.productId)next[item.productId]=true;if(alive)setWishlist(next)}catch{}})();return()=>{alive=false}},[]);"
  ],
  [
    "const toggleWish=(id:string)=>setWishlist(w=>({...w,[id]:!w[id]}));",
    "const toggleWish=async(id:string)=>{const previous=Boolean(wishlist[id]);setWishlist(w=>({...w,[id]:!previous}));try{const response=await fetch('/api/wishlist',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({productId:id})});if(!response.ok){setWishlist(w=>({...w,[id]:previous}))}}catch{setWishlist(w=>({...w,[id]:previous}))}};"
  ]
])

const inventoryChanged = patch('components/inventory-admin-pro.tsx', [
  [
    "if (!Number.isInteger(thresholdValue) || thresholdValue < 0) return setError('Low-stock threshold must be a non-negative whole number.')",
    "if (!Number.isInteger(thresholdValue) || thresholdValue < 0) return setError('Low-stock threshold must be a non-negative whole number.')\n    const availableBefore = selected ? availability(selected).available : 0\n    if (change < -availableBefore) return setError(`Cannot reduce stock by ${Math.abs(change)}. Only ${availableBefore} units are available after reservations.`)"
  ],
  [
    "{[-10, -5, -1, 1, 5, 10].map(v => <button type=\"button\" key={v} className={delta === String(v) ? 'active' : ''} onClick={() => setDelta(String(v))}>{v > 0 ? `+${v}` : v}</button>)}",
    "{[-10, -5, -1, 1, 5, 10].map(v => <button type=\"button\" key={v} className={delta === String(v) ? 'active' : ''} disabled={v < 0 && !!current && current.available + v < 0} onClick={() => setDelta(String(v))}>{v > 0 ? `+${v}` : v}</button>)}"
  ],
  [
    "<td className=\"actionsCol\" onClick={e => e.stopPropagation()}><div className=\"inventoryQuick\"><button type=\"button\" title=\"Add 1\" onClick={() => openAdjust(r, 1)}><Plus size={14}/></button><button type=\"button\" title=\"Remove 1\" onClick={() => openAdjust(r, -1)}><Minus size={14}/></button></div></td>",
    "<td className=\"actionsCol\" onClick={e => e.stopPropagation()}><div className=\"inventoryQuick\"><button type=\"button\" title=\"Add 1\" onClick={() => openAdjust(r, 1)}><Plus size={14}/></button><button type=\"button\" title=\"Remove 1\" onClick={() => openAdjust(r, -1)} disabled={availability(r).available <= 0}><Minus size={14}/></button></div></td>"
  ]
])

const checkoutChanged = patch('app/checkout/page.tsx', [
  [
    "useEffect(()=>{if(enabledMethods.length && !enabledMethods.some(([value])=>value===paymentMethod)) setPaymentMethod(enabledMethods[0][0])},[enabledMethods.length,paymentMethod])",
    "useEffect(()=>{if(enabledMethods.length && !enabledMethods.some(([value])=>value===paymentMethod)) setPaymentMethod(enabledMethods[0][0])},[settings?.payment.cod,settings?.payment.card,settings?.payment.bank,settings?.payment.wallet,paymentMethod])"
  ]
])

const storefrontRefreshChanged = patch('components/live-storefront-sections.tsx', [
  ["const timer = window.setInterval(load, 3000)", "const timer = window.setInterval(load, 15000)"]
])

console.log(`Finalization fix: storefront=${storefrontChanged?'updated':'unchanged'} inventory=${inventoryChanged?'updated':'unchanged'} checkout=${checkoutChanged?'updated':'unchanged'} refresh=${storefrontRefreshChanged?'updated':'unchanged'}`)
