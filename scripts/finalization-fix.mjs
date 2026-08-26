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

const inventoryChanged = patch('components/inventory-admin-pro.tsx', [
  ["if (!Number.isInteger(change)) return setError('Enter a whole-number adjustment.')\n    if (!Number.isInteger(thresholdValue) || thresholdValue < 0)", "if (!Number.isInteger(change)) return setError('Enter a whole-number adjustment.')\n    const availableNow = availability(selected).available\n    if (change < 0 && Math.abs(change) > availableNow) return setError(`You cannot reduce more than the ${availableNow} currently available units.`)\n    if (!Number.isInteger(thresholdValue) || thresholdValue < 0)"],
  ["<button type=\"button\" title=\"Remove 1\" onClick={() => openAdjust(r, -1)}><Minus size={14}/></button>", "<button type=\"button\" title={availability(r).available > 0 ? 'Remove 1' : 'No available units to remove'} onClick={() => openAdjust(r, -1)} disabled={availability(r).available <= 0}><Minus size={14}/></button>"],
  ["{[-10, -5, -1, 1, 5, 10].map(v => <button type=\"button\" key={v} className={delta === String(v) ? 'active' : ''} onClick={() => setDelta(String(v))}>{v > 0 ? `+${v}` : v}</button>)}", "{[-10, -5, -1, 1, 5, 10].map(v => <button type=\"button\" key={v} className={delta === String(v) ? 'active' : ''} disabled={v < 0 && current != null && Math.abs(v) > current.available} onClick={() => setDelta(String(v))}>{v > 0 ? `+${v}` : v}</button>)}"]
])

const checkoutChanged = patch('app/checkout/page.tsx', [["useEffect(()=>{if(enabledMethods.length && !enabledMethods.some(([value])=>value===paymentMethod)) setPaymentMethod(enabledMethods[0][0])},[enabledMethods.length,paymentMethod])", "useEffect(()=>{if(enabledMethods.length && !enabledMethods.some(([value])=>value===paymentMethod)) setPaymentMethod(enabledMethods[0][0])},[settings?.payment.cod,settings?.payment.card,settings?.payment.bank,settings?.payment.wallet,paymentMethod])"]])
const storefrontRefreshChanged = patch('components/live-storefront-sections.tsx', [
  ["const timer = window.setInterval(load, 3000)", "const timer = window.setInterval(load, 30000)"],
  ["const timer = window.setInterval(load, 15000)", "const timer = window.setInterval(load, 30000)"],
])

const ordersChanged = patch('components/orders-admin-shopify.tsx', [
  ["revenue:rows.reduce((sum,o)=>sum+Number(o.grandTotal||0),0)", "revenue:rows.reduce((sum,o)=>{if(['CANCELLED','REFUNDED'].includes(o.status))return sum;const refunded=Number(o.refundedTotal||o.refundedAmount||0);return sum+Math.max(0,Number(o.grandTotal||0)-refunded)},0)"],
  ["async function bulkStatus(status:string){if(!selected.length)return;setBusy('bulk');setError('');setNotice('');try{for(const id of selected)await api('/api/admin/orders',{method:'PATCH',body:JSON.stringify({id,status})});await refresh();setNotice(`${selected.length} order${selected.length===1?'':'s'} updated.`)}catch(e){setError(e instanceof Error?e.message:'Unable to update selected orders')}finally{setBusy(null)}}", "async function bulkStatus(status:string){if(!selected.length)return;const eligible=rows.filter(o=>selected.includes(o.id)&&canTransitionOrder(o.status,status as Parameters<typeof canTransitionOrder>[1])).map(o=>o.id);if(!eligible.length){setError(`No selected orders can move to ${status.toLowerCase()}.`);return}setBusy('bulk');setError('');setNotice('');try{for(const id of eligible)await api('/api/admin/orders',{method:'PATCH',body:JSON.stringify({id,status})});await refresh();setNotice(`${eligible.length} order${eligible.length===1?'':'s'} updated.`)}catch(e){setError(e instanceof Error?e.message:'Unable to update selected orders')}finally{setBusy(null)}}"],
  ["async function refundOrder(){if(!modal||modal.type!=='refund')return;const amount=Math.round(Number(refundAmount)*100),max=Number(modal.order.grandTotal||0);if(!Number.isInteger(amount)||amount<=0||amount>max){setError(`Refund must be between 0.01 and ${money(max,modal.order.currency)}`);return}", "async function refundOrder(){if(!modal||modal.type!=='refund')return;const amount=Math.round(Number(refundAmount)*100),alreadyRefunded=Number(modal.order.refundedTotal||modal.order.refundedAmount||0),max=Math.max(0,Number(modal.order.grandTotal||0)-alreadyRefunded);if(!Number.isInteger(amount)||amount<=0||amount>max){setError(`Refund must be between 0.01 and ${money(max,modal.order.currency)}`);return}"],
  ["Maximum refundable: <strong>{money(modal.order.grandTotal,modal.order.currency)}</strong>", "Maximum refundable: <strong>{money(Math.max(0,Number(modal.order.grandTotal||0)-Number(modal.order.refundedTotal||modal.order.refundedAmount||0),modal.order.currency)}</strong>"]
])

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

console.log(`Finalization fix: storefront=${storefrontChanged?'updated':'unchanged'} inventory=${inventoryChanged?'updated':'unchanged'} checkout=${checkoutChanged?'updated':'unchanged'} refresh=${storefrontRefreshChanged?'updated':'unchanged'} orders=${ordersChanged?'updated':'unchanged'} focal=${focalChanged?'updated':'unchanged'}`)
