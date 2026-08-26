import fs from 'node:fs'

function patch(file, replacements) {
  if (!fs.existsSync(file)) return false
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
  ["const quickAdd=(e:React.MouseEvent)=>{e.preventDefault();e.stopPropagation();addItem({productId:p.id,variantId:null,name:p.name,sku:p.sku||p.slug,price,image:img(image),quantity:1})};", "const quickAdd=(e:React.MouseEvent)=>{e.preventDefault();e.stopPropagation();if(Array.isArray(p.variants)&&p.variants.length>0){onQuickView(p);return}addItem({productId:p.id,variantId:null,name:p.name,sku:p.sku||p.slug,price,image:img(image),quantity:1)};"],
  ["const [selectedVariantId,setSelectedVariantId]=useState<string|null>(product?.variants?.[0]?.id||null);const [qty,setQty]=useState(1);", "const [selectedVariantId,setSelectedVariantId]=useState<string|null>(product?.variants?.[0]?.id||null);const [qty,setQty]=useState(1);useEffect(()=>{setSelectedVariantId(product?.variants?.[0]?.id||null);setQty(1)},[product?.id]);"],
  ["const [variantId,setVariantId]=useState<string|null>(product.variants?.[0]?.id||null);", "const [variantId,setVariantId]=useState<string|null>(product.variants?.[0]?.id||null);useEffect(()=>{setVariantId(product.variants?.[0]?.id||null);setQty(1)},[product?.id]);"],
  ["const [wishlist,setWishlist]=useState<Record<string,boolean>>({});", "const [wishlist,setWishlist]=useState<Record<string,boolean>>({});useEffect(()=>{let alive=true;(async()=>{try{const response=await fetch('/api/wishlist',{cache:'no-store'});if(!response.ok)return;const data=await response.json();const next:Record<string,boolean>={};for(const item of Array.isArray(data.items)?data.items:[])if(item?.productId)next[item.productId]=true;if(alive)setWishlist(next)}catch{}})();return()=>{alive=false}},[]);"],
  ["const toggleWish=(id:string)=>setWishlist(w=>({...w,[id]:!w[id]}));", "const toggleWish=async(id:string)=>{const previous=Boolean(wishlist[id]);setWishlist(w=>({...w,[id]:!previous}));try{const response=await fetch('/api/wishlist',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({productId:id})});if(!response.ok){setWishlist(w=>({...w,[id]:previous}))}}catch{setWishlist(w=>({...w,[id]:previous}))}};"]
])

const inventoryChanged = patch('components/inventory-admin-pro.tsx', [])
const checkoutChanged = patch('app/checkout/page.tsx', [["useEffect(()=>{if(enabledMethods.length && !enabledMethods.some(([value])=>value===paymentMethod)) setPaymentMethod(enabledMethods[0][0])},[enabledMethods.length,paymentMethod])", "useEffect(()=>{if(enabledMethods.length && !enabledMethods.some(([value])=>value===paymentMethod)) setPaymentMethod(enabledMethods[0][0])},[settings?.payment.cod,settings?.payment.card,settings?.payment.bank,settings?.payment.wallet,paymentMethod])"]])
const storefrontRefreshChanged = patch('components/live-storefront-sections.tsx', [["const timer = window.setInterval(load, 3000)", "const timer = window.setInterval(load, 15000)"]])

let focalChanged = false
if (fs.existsSync('components/focal-theme-editor.tsx')) {
  let source = fs.readFileSync('components/focal-theme-editor.tsx', 'utf8')
  const declaration = "const changePage = (nextPage:string) => { if (nextPage === page) return; if (dirty && typeof window !== 'undefined' && !window.confirm('You have unsaved changes. Switch templates anyway?')) return; setPage(nextPage); setSelectedId(''); setDrawer(false) }"
  let count = source.split(declaration).length - 1
  if (count === 0) {
    const marker = '  const save = async () => {'
    if (source.includes(marker)) {
      source = source.replace(marker, `  ${declaration}\n${marker}`)
      focalChanged = true
      count = 1
    }
  }
  while (count > 1) {
    const first = source.indexOf(declaration)
    const second = source.indexOf(declaration, first + declaration.length)
    if (second < 0) break
    source = source.slice(0, second) + source.slice(second + declaration.length)
    count -= 1
    focalChanged = true
  }
  const next = source
    .replace("onChange={event => { setPage(event.target.value); setSelectedId(''); setDrawer(false) }}", "onChange={event => changePage(event.target.value)}")
    .replace("Object.entries(META).filter(([key]) => !['announcement','header','footer'].includes(key))", "Object.entries(META).filter(([key]) => !['announcement','header'].includes(key))")
  if (next !== source) focalChanged = true
  fs.writeFileSync('components/focal-theme-editor.tsx', next)
}

console.log(`Finalization fix: storefront=${storefrontChanged?'updated':'unchanged'} inventory=${inventoryChanged?'updated':'unchanged'} checkout=${checkoutChanged?'updated':'unchanged'} refresh=${storefrontRefreshChanged?'updated':'unchanged'} focal=${focalChanged?'updated':'unchanged'}`)
