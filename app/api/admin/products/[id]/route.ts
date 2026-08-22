import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json, slugify } from '@/lib/utils'

async function getProduct(id:string){
  return db.product.findUnique({where:{id},include:{category:true,images:{orderBy:{sortOrder:'asc'}},variants:{include:{inventory:true}},inventory:{where:{variantId:null}},tags:true,collections:{include:{collection:true}},metafields:{include:{definition:true}}}})
}

export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){
  try { await requirePermission('products.view'); const {id}=await params; const product=await getProduct(id); if(!product)return json({error:'Product not found'},{status:404}); return json({product}) }
  catch(e){ return json({error:e instanceof Error?e.message:'Forbidden'},{status:403}) }
}

export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
  try {
    const actor=await requirePermission('products.manage'); const {id}=await params; const b=await req.json()
    const existing=await db.product.findUnique({where:{id},include:{variants:true,images:true,inventory:{where:{variantId:null}},tags:true}})
    if(!existing)return json({error:'Product not found'},{status:404})
    const slug = b.slug!==undefined ? (slugify(String(b.slug||b.name||existing.name)) || `product-${Date.now()}`) : undefined
    const data:any={}
    const textFields=['name','brand','vendor','productType','description','shortDescription','seoTitle','seoDescription','seoImageUrl','weightUnit','productTemplate','salesChannelsJson']
    for(const k of textFields) if(b[k]!==undefined) data[k]=b[k]===null?'':String(b[k])
    if(b.slug!==undefined)data.slug=slug
    for(const k of ['basePrice','compareAtPrice','costPrice']) if(b[k]!==undefined) data[k]=b[k]===null||b[k]===''?null:Math.max(0,Math.trunc(Number(b[k])))
    for(const k of ['weight']) if(b[k]!==undefined)data[k]=b[k]===null||b[k]===''?null:Number(b[k])
    for(const k of ['featured','requiresShipping','taxable','trackInventory','continueSellingWhenOutOfStock','giftCard']) if(b[k]!==undefined)data[k]=Boolean(b[k])
    if(b.status!==undefined)data.status=b.status
    if(b.categoryId!==undefined)data.categoryId=b.categoryId||null
    if(b.publishedAt!==undefined)data.publishedAt=b.publishedAt?new Date(b.publishedAt):null

    const product=await db.$transaction(async tx=>{
      const p=await tx.product.update({where:{id},data})
      if(Array.isArray(b.images)){
        const keptIds=b.images.filter((x:any)=>x.id).map((x:any)=>String(x.id))
        if(keptIds.length) await tx.productImage.deleteMany({where:{productId:id,id:{notIn:keptIds}}})
        else await tx.productImage.deleteMany({where:{productId:id}})
        for(let i=0;i<b.images.length;i++){
          const x=b.images[i]
          if(x.id){ await tx.productImage.update({where:{id:String(x.id)},data:{url:String(x.url),alt:x.alt?String(x.alt):null,sortOrder:i}}) }
          else { await tx.productImage.create({data:{productId:id,url:String(x.url),alt:x.alt?String(x.alt):null,sortOrder:i}}) }
        }
      }
      if(Array.isArray(b.tags)){
        await tx.productTag.deleteMany({where:{productId:id}})
        const tags: string[] = Array.from(
  new Set<string>(
    b.tags
      .map((t: unknown) => String(t).trim())
      .filter((t: string) => t.length > 0)
  )
)

if (tags.length > 0) {
  await tx.productTag.createMany({
    data: tags.map((value: string) => ({
      productId: id,
      value,
    })),
  })
}
        if(tags.length)await tx.productTag.createMany({data:tags.map(value=>({productId:id,value}))})
      }
      if(b.quantity!==undefined || b.lowStockThreshold!==undefined || b.location!==undefined){
        const row=await tx.inventoryItem.findFirst({where:{productId:id,variantId:null}})
        if(row) await tx.inventoryItem.update({where:{id:row.id},data:{quantity:Math.max(row.reserved,Math.trunc(Number(b.quantity ?? row.quantity))),lowStockThreshold:b.lowStockThreshold!==undefined?Math.max(0,Math.trunc(Number(b.lowStockThreshold))):row.lowStockThreshold,location:b.location!==undefined?String(b.location||''):row.location}})
        else await tx.inventoryItem.create({data:{productId:id,quantity:Math.max(0,Math.trunc(Number(b.quantity)||0)),lowStockThreshold:Math.max(0,Math.trunc(Number(b.lowStockThreshold)||5)),location:String(b.location||'Main')}})
      }
      if(Array.isArray(b.metafields)){
        await tx.metafieldValue.deleteMany({where:{ownerType:'PRODUCT',ownerId:id}})
        const vals=b.metafields.filter((m:any)=>m.definitionId&&m.value!==undefined&&String(m.value)!=='').map((m:any)=>({definitionId:String(m.definitionId),ownerType:'PRODUCT',ownerId:id,value:typeof m.value==='string'?m.value:JSON.stringify(m.value)}))
        if(vals.length) await tx.metafieldValue.createMany({data:vals})
      }
      if(Array.isArray(b.variants)){
        for(const v of b.variants){
          const variantId=v.id?String(v.id):null
          const vd:any={name:String(v.name||'Default Title'),sku:String(v.sku||`${existing.sku}-${Date.now()}`),barcode:v.barcode?String(v.barcode):null,optionJson:typeof v.optionJson==='string'?v.optionJson:JSON.stringify(v.options||{}),price:v.price===''||v.price==null?null:Math.trunc(Number(v.price)),compareAtPrice:v.compareAtPrice===''||v.compareAtPrice==null?null:Math.trunc(Number(v.compareAtPrice)),weight:v.weight===''||v.weight==null?null:Number(v.weight),weightUnit:v.weightUnit?String(v.weightUnit):null}
          let variant
          if(variantId) variant=await tx.productVariant.update({where:{id:variantId},data:vd})
          else variant=await tx.productVariant.create({data:{productId:id,...vd}})
          const qty=v.quantity===undefined?null:Math.max(0,Math.trunc(Number(v.quantity)||0))
          if(qty!==null){
            const inv=await tx.inventoryItem.findFirst({where:{variantId:variant.id}})
            if(inv) await tx.inventoryItem.update({where:{id:inv.id},data:{quantity:Math.max(inv.reserved,qty),lowStockThreshold:Math.max(0,Math.trunc(Number(v.lowStockThreshold)||inv.lowStockThreshold)),location:String(v.location||inv.location||'Main')}})
            else await tx.inventoryItem.create({data:{productId:id,variantId:variant.id,quantity:qty,lowStockThreshold:Math.max(0,Math.trunc(Number(v.lowStockThreshold)||5)),location:String(v.location||'Main')}})
          }
        }
      }
      return p
    })
    await audit(actor.id,'product.updated','Product',id,{fields:Object.keys(data),images:Array.isArray(b.images)?b.images.length:undefined,variants:Array.isArray(b.variants)?b.variants.length:undefined})
    return json({product:await getProduct(id)})
  } catch(e){ return json({error:e instanceof Error?e.message:'Unable to update product'},{status:400}) }
}
