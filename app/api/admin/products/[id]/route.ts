import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json, slugify } from '@/lib/utils'
import { dispatchWebhookEvent } from '@/lib/webhooks'

async function getProduct(id:string){
  const product=await db.product.findUnique({where:{id},include:{category:true,images:{orderBy:{sortOrder:'asc'}},variants:{include:{inventory:{include:{location:true}}}},inventory:{where:{variantId:null},include:{location:true}},tags:true,collections:{include:{collection:true}},metafields:{include:{definition:true}}}})
  if(!product)return null
  const sharedInventory=product.variants.length>0&&product.variants.every(v=>v.inventory.length===0)&&product.inventory.some(x=>x.quantity>0||x.reserved>0)
  return {...product,sharedInventory}
}

export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){try{await requirePermission('products.view');const {id}=await params;const product=await getProduct(id);if(!product)return json({error:'Product not found'},{status:404});return json({product})}catch(e){return json({error:e instanceof Error?e.message:'Forbidden'},{status:403})}}

export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await requirePermission('products.manage');const {id}=await params;const b=await req.json()
    const existing=await db.product.findUnique({where:{id},include:{variants:{include:{inventory:true,orderItems:true}},images:true,inventory:{where:{variantId:null}},tags:true}})
    if(!existing)return json({error:'Product not found'},{status:404})
    const existingSharedPool=existing.variants.length>0&&existing.variants.every(v=>v.inventory.length===0)&&existing.inventory.some(x=>x.quantity>0||x.reserved>0)
    const slug=b.slug!==undefined?(slugify(String(b.slug||b.name||existing.name))||`product-${Date.now()}`):undefined
    const data:any={};const textFields=['name','brand','vendor','productType','description','shortDescription','seoTitle','seoDescription','seoImageUrl','weightUnit','productTemplate','salesChannelsJson']
    for(const k of textFields)if(b[k]!==undefined)data[k]=b[k]===null?'':String(b[k])
    if(b.slug!==undefined)data.slug=slug
    for(const k of ['basePrice','compareAtPrice','costPrice'])if(b[k]!==undefined)data[k]=b[k]===null||b[k]===''?null:Math.max(0,Math.trunc(Number(b[k])))
    if(b.weight!==undefined)data.weight=b.weight===null||b.weight===''?null:Number(b.weight)
    for(const k of ['featured','requiresShipping','taxable','trackInventory','continueSellingWhenOutOfStock','giftCard'])if(b[k]!==undefined)data[k]=Boolean(b[k])
    if(b.status!==undefined)data.status=b.status;if(b.categoryId!==undefined)data.categoryId=b.categoryId||null;if(b.publishedAt!==undefined)data.publishedAt=b.publishedAt?new Date(b.publishedAt):null

    if(Array.isArray(b.variants)){
      const incomingIds=new Set(b.variants.filter((v:any)=>v.id).map((v:any)=>String(v.id)))
      const removed=existing.variants.filter(v=>!incomingIds.has(v.id))
      const blocked=removed.find(v=>v.orderItems.length>0)
      if(blocked)return json({error:`Variant "${blocked.name}" cannot be deleted because it is referenced by existing orders. Archive it by removing it from the active product instead.`},{status:409})
      const incomingSkus=new Set<string>()
      const incomingBarcodes=new Set<string>()
      for(const v of b.variants){
        const sku=String(v.sku||'').trim();if(!sku)return json({error:'Every variant needs a SKU'},{status:400});if(incomingSkus.has(sku))return json({error:`Duplicate variant SKU: ${sku}`},{status:400});incomingSkus.add(sku)
        const barcode=v.barcode?String(v.barcode).trim():'';if(barcode){if(incomingBarcodes.has(barcode))return json({error:`Duplicate variant barcode: ${barcode}`},{status:400});incomingBarcodes.add(barcode)}
      }
    }

    const product=await db.$transaction(async tx=>{
      const p=await tx.product.update({where:{id},data})
      if(Array.isArray(b.images)){const images=b.images.slice(0,20);const keptIds=images.filter((x:any)=>x.id).map((x:any)=>String(x.id));if(keptIds.length)await tx.productImage.deleteMany({where:{productId:id,id:{notIn:keptIds}}});else await tx.productImage.deleteMany({where:{productId:id}});const existingImageById=new Map(existing.images.map(img=>[img.id,img]));for(let i=0;i<images.length;i++){const x=images[i];const url=String(x.url||'').trim();if(!url)continue;if(x.id){const alt=x.alt?String(x.alt):null;const cur=existingImageById.get(String(x.id));if(cur&&cur.url===url&&cur.alt===alt&&cur.sortOrder===i)continue;await tx.productImage.update({where:{id:String(x.id)},data:{url,alt,sortOrder:i}})}else await tx.productImage.create({data:{productId:id,url,alt:x.alt?String(x.alt):null,sortOrder:i}})}}
      if(Array.isArray(b.tags)){await tx.productTag.deleteMany({where:{productId:id}});const tags:string[]=Array.from(new Set<string>(b.tags.map((t:unknown)=>String(t).trim()).filter((t:string)=>t.length>0)));if(tags.length)await tx.productTag.createMany({data:tags.map((value:string)=>({productId:id,value}))})}
      // Only ever true auto-write when stock lives at zero or one location -- a real split
      // across 2+ locations (Purchase Order receiving, an Inventory Transfer) can't be
      // represented by this editor's single blended quantity/location field, and picking an
      // arbitrary row here would silently overwrite one location with a number that actually
      // summed all of them. The product editor UI hides these fields once split, so this only
      // ever runs when the request could actually mean it; a stale request from before a split
      // happened elsewhere is a no-op rather than corrupting whichever row is found first.
      if(b.quantity!==undefined||b.lowStockThreshold!==undefined||b.locationId!==undefined){const rows=await tx.inventoryItem.findMany({where:{productId:id,variantId:null}});if(rows.length<=1){const row=rows[0];const requested=b.quantity!==undefined?Math.max(0,Math.trunc(Number(b.quantity))):row?.quantity??0;if(row)await tx.inventoryItem.update({where:{id:row.id},data:{quantity:Math.max(row.reserved,requested),lowStockThreshold:b.lowStockThreshold!==undefined?Math.max(0,Math.trunc(Number(b.lowStockThreshold))):row.lowStockThreshold,locationId:b.locationId!==undefined?(b.locationId?String(b.locationId):null):row.locationId}});else await tx.inventoryItem.create({data:{productId:id,quantity:requested,lowStockThreshold:Math.max(0,Math.trunc(Number(b.lowStockThreshold)||5)),locationId:b.locationId?String(b.locationId):null}})}}
      if(Array.isArray(b.metafields)){await tx.metafieldValue.deleteMany({where:{ownerType:'PRODUCT',ownerId:id}});const vals=b.metafields.filter((m:any)=>m.definitionId&&m.value!==undefined&&String(m.value)!=='').map((m:any)=>({definitionId:String(m.definitionId),ownerType:'PRODUCT',ownerId:id,value:typeof m.value==='string'?m.value:JSON.stringify(m.value)}));if(vals.length)await tx.metafieldValue.createMany({data:vals})}
      if(Array.isArray(b.variants)){
        const sharedPool=b.sharedInventory===true||(b.sharedInventory===undefined&&existingSharedPool)
        const incomingIds=new Set(b.variants.filter((v:any)=>v.id).map((v:any)=>String(v.id)))
        const removed=existing.variants.filter(v=>!incomingIds.has(v.id))
        for(const oldVariant of removed){for(const inv of oldVariant.inventory){await tx.inventoryMovement.create({data:{inventoryId:inv.id,type:'ADJUSTMENT',quantity:-inv.quantity,reason:'Variant removed from product editor',referenceId:id}});await tx.inventoryItem.delete({where:{id:inv.id}})}await tx.productVariant.delete({where:{id:oldVariant.id}})}
        const existingVariantById=new Map(existing.variants.map(v=>[v.id,v]))
        for(const v of b.variants){
          const variantId=v.id?String(v.id):null
          const vd:any={name:String(v.name||'Default Title'),sku:String(v.sku||`${existing.sku}-${Date.now()}`),barcode:v.barcode?String(v.barcode):null,optionJson:typeof v.optionJson==='string'?v.optionJson:JSON.stringify(v.options||{}),price:v.price===''||v.price==null?null:Math.trunc(Number(v.price)),compareAtPrice:v.compareAtPrice===''||v.compareAtPrice==null?null:Math.trunc(Number(v.compareAtPrice)),weight:v.weight===''||v.weight==null?null:Number(v.weight),weightUnit:v.weightUnit?String(v.weightUnit):null}
          const existingVariant=variantId?existingVariantById.get(variantId):undefined
          // Skip the write entirely when nothing about this variant actually changed -- the
          // editor re-submits every variant on every save, and each write here is a full
          // round trip through Prisma Accelerate (the HTTPS proxy Workers must use in front of
          // MongoDB), so unconditionally rewriting untouched variants was the dominant cost of
          // saving a product with more than a couple of variants.
          const unchanged=!!existingVariant&&existingVariant.name===vd.name&&existingVariant.sku===vd.sku&&existingVariant.barcode===vd.barcode&&existingVariant.optionJson===vd.optionJson&&existingVariant.price===vd.price&&existingVariant.compareAtPrice===vd.compareAtPrice&&existingVariant.weight===vd.weight&&existingVariant.weightUnit===vd.weightUnit
          const variant=unchanged?existingVariant!:variantId?await tx.productVariant.update({where:{id:variantId},data:vd}):await tx.productVariant.create({data:{productId:id,...vd}})
          const qty=v.quantity===undefined?null:Math.max(0,Math.trunc(Number(v.quantity)||0))
          if(qty===null&&!sharedPool)continue
          const invRows=await tx.inventoryItem.findMany({where:{variantId:variant.id}})
          if(sharedPool){for(const row of invRows)await tx.inventoryItem.delete({where:{id:row.id}})}
          // Same multi-location guard as the product-level write above: a variant split
          // across 2+ location rows can't be safely collapsed into one quantity/location pair,
          // so this only writes when there's zero or one row to begin with.
          else if(qty!==null&&invRows.length<=1){const inv=invRows[0];if(inv)await tx.inventoryItem.update({where:{id:inv.id},data:{quantity:Math.max(inv.reserved,qty),lowStockThreshold:Math.max(0,Math.trunc(Number(v.lowStockThreshold)||inv.lowStockThreshold)),locationId:v.locationId!==undefined?(v.locationId?String(v.locationId):null):inv.locationId}});else await tx.inventoryItem.create({data:{productId:id,variantId:variant.id,quantity:qty,lowStockThreshold:Math.max(0,Math.trunc(Number(v.lowStockThreshold)||5)),locationId:v.locationId?String(v.locationId):null}})}
        }
      }
      return p
    })
    await audit(actor.id,'product.updated','Product',id,{fields:Object.keys(data),images:Array.isArray(b.images)?b.images.length:undefined,variants:Array.isArray(b.variants)?b.variants.length:undefined,sharedInventory:b.sharedInventory})
    void dispatchWebhookEvent('product.updated',{id:product.id,name:product.name,slug:product.slug,status:product.status}).catch(error=>console.error('[webhook] product.updated dispatch failed',error))
    return json({product:await getProduct(id)})
  }catch(e){
    const message=e instanceof Error?e.message:'Unable to update product'
    if(typeof message==='string'&&message.includes('Unique constraint'))return json({error:'A product, SKU or barcode with the same unique value already exists.'},{status:409})
    return json({error:message},{status:400})
  }
}

export async function DELETE(_req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await requirePermission('products.manage')
    const {id}=await params
    const existing=await db.product.findUnique({where:{id},include:{orderItems:{select:{id:true}},inventory:true}})
    if(!existing)return json({error:'Product not found'},{status:404})
    if(existing.orderItems.length>0)return json({error:'This product appears in past orders and cannot be deleted. Archive it instead to hide it from the storefront while keeping order history intact.'},{status:409})
    await db.$transaction(async tx=>{
      // No hard foreign keys under MongoDB, so every dependent collection is cleared explicitly
      // (same manual-cascade approach the variant-removal code above already uses) rather than
      // relying on Prisma's declared onDelete: Cascade, which MongoDB doesn't enforce.
      for(const inv of existing.inventory)if(inv.quantity>0)await tx.inventoryMovement.create({data:{inventoryId:inv.id,type:'ADJUSTMENT',quantity:-inv.quantity,reason:'Product deleted',referenceId:id}})
      await tx.inventoryItem.deleteMany({where:{productId:id}})
      await tx.productImage.deleteMany({where:{productId:id}})
      await tx.productVariant.deleteMany({where:{productId:id}})
      await tx.productTag.deleteMany({where:{productId:id}})
      await tx.metafieldValue.deleteMany({where:{ownerType:'PRODUCT',ownerId:id}})
      await tx.collectionProduct.deleteMany({where:{productId:id}})
      await tx.review.deleteMany({where:{productId:id}})
      await tx.wishlistItem.deleteMany({where:{productId:id}})
      await tx.product.delete({where:{id}})
    })
    await audit(actor.id,'product.deleted','Product',id,{name:existing.name,sku:existing.sku})
    return json({ok:true})
  }catch(e){
    return json({error:e instanceof Error?e.message:'Unable to delete product'},{status:400})
  }
}
