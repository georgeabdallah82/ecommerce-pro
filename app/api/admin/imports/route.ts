import { NextResponse } from 'next/server'
import { db } from '@/lib/prisma'
import { getCurrentUser, requirePermission } from '@/lib/auth'

function parseCsv(text: string) {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false
  for (let i=0;i<text.length;i++) { const ch=text[i]; if (quoted) { if (ch==='"' && text[i+1]==='"') { cell+='"'; i++ } else if (ch==='"') quoted=false; else cell+=ch } else if (ch==='"' && cell==='') quoted=true; else if (ch===',') { row.push(cell); cell='' } else if (ch==='\n') { row.push(cell.replace(/\r$/,'')); rows.push(row); row=[]; cell='' } else cell+=ch }
  if (cell!=='' || row.length) { row.push(cell.replace(/\r$/,'')); rows.push(row) }
  if (!rows.length) return []
  const headers=rows.shift()!.map(h=>h.trim()); return rows.filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i] ?? ''])))
}
const bool=(v:string, fallback=false)=>v===''?fallback:['true','1','yes'].includes(v.toLowerCase())
const num=(v:string, fallback=0)=>{const n=Number(v); return Number.isFinite(n)?n:fallback}
const slugify=(v:string)=>v.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,120)
const cleanSlug=(v:string,fallback:string)=>slugify(v)||slugify(fallback)||`item-${Date.now()}`

export async function POST(request: Request) {
  try {
    const actor=await requirePermission('products.manage')
    const url=new URL(request.url); const type=url.searchParams.get('type')||'products'; const mode=url.searchParams.get('mode')||'apply'
    const form=await request.formData(); const file=form.get('file'); if (!(file instanceof File)) return NextResponse.json({error:'CSV file is required'},{status:400})
    if (file.size>2*1024*1024) return NextResponse.json({error:'CSV exceeds 2 MB limit'},{status:413})
    const rows=parseCsv(await file.text()); if (rows.length>500) return NextResponse.json({error:'Maximum 500 rows per import'},{status:413})
    const errors:string[]=[]; const preview:any[]=[]
    for (let i=0;i<rows.length;i++) { const r=rows[i] as Record<string,string>; if (type==='products' && (!r.sku || !r.name)) errors.push(`Row ${i+2}: sku and name are required`); if ((type==='categories'||type==='collections')&&!r.name) errors.push(`Row ${i+2}: name is required`); preview.push({row:i+2,action:'validated',name:r.name||'',sku:r.sku||''}) }
    if (mode==='preview') return NextResponse.json({ok:!errors.length,rows:preview,errors})
    if (errors.length) return NextResponse.json({error:'Import validation failed',errors},{status:422})
    let created=0,updated=0
    await db.$transaction(async tx=>{
      if(type==='categories'){
        for(const r of rows as Record<string,string>[]){const slug=cleanSlug(r.slug,r.name); const existing=await tx.category.findUnique({where:{slug}}); const parent=r.parentSlug?await tx.category.findUnique({where:{slug:r.parentSlug}}):null; const data={name:r.name,slug,description:r.description||null,imageUrl:r.imageUrl||null,isActive:bool(r.isActive,true),sortOrder:num(r.sortOrder)}; if(existing){await tx.category.update({where:{id:existing.id},data:{...data,parentId:parent?.id||null}});updated++}else{await tx.category.create({data:{...data,parentId:parent?.id||null}});created++}}
      } else if(type==='collections'){
        for(const r of rows as Record<string,string>[]){const slug=cleanSlug(r.slug,r.name); const existing=await tx.collection.findUnique({where:{slug}}); const data={name:r.name,slug,description:r.description||null,imageUrl:r.imageUrl||null,isActive:bool(r.isActive,true),sortOrder:num(r.sortOrder)}; if(existing){await tx.collection.update({where:{id:existing.id},data});updated++}else{await tx.collection.create({data});created++}}
      } else if(type==='products'){
        for(const r of rows as Record<string,string>[]){const existing=await tx.product.findUnique({where:{sku:r.sku}}); const slug=cleanSlug(r.slug,r.name); const category=r.categorySlug?await tx.category.findUnique({where:{slug:r.categorySlug}}):null; const data={name:r.name,slug,description:r.description||null,shortDescription:r.shortDescription||null,brand:r.brand||null,vendor:r.vendor||null,productType:r.productType||null,basePrice:num(r.basePrice),compareAtPrice:r.compareAtPrice?num(r.compareAtPrice):null,costPrice:r.costPrice?num(r.costPrice):null,barcode:r.barcode||null,status:(r.status||'DRAFT') as 'DRAFT'|'ACTIVE'|'ARCHIVED',featured:bool(r.featured),seoTitle:r.seoTitle||null,seoDescription:r.seoDescription||null,seoImageUrl:r.seoImageUrl||null,weight:r.weight?num(r.weight):null,weightUnit:r.weightUnit||null,requiresShipping:bool(r.requiresShipping,true),taxable:bool(r.taxable,true),trackInventory:bool(r.trackInventory,true),continueSellingWhenOutOfStock:bool(r.continueSellingWhenOutOfStock),giftCard:bool(r.giftCard),categoryId:category?.id||null}; let product; if(existing){product=await tx.product.update({where:{id:existing.id},data});updated++}else{product=await tx.product.create({data:{...data,sku:r.sku}});created++}
          await tx.productTag.deleteMany({where:{productId:product.id}}); const tags=(r.tags||'').split('|').map(x=>x.trim()).filter(Boolean); if(tags.length) await tx.productTag.createMany({data:tags.map(value=>({productId:product.id,value})),skipDuplicates:true})
          await tx.collectionProduct.deleteMany({where:{productId:product.id}}); const slugs=(r.collectionSlugs||'').split('|').map(x=>x.trim()).filter(Boolean); for(const collectionSlug of slugs){const c=await tx.collection.findUnique({where:{slug:collectionSlug}}); if(c) await tx.collectionProduct.create({data:{collectionId:c.id,productId:product.id}})}
        }
      } else throw new Error('Unsupported import type')
    })
    await db.auditLog.create({data:{actorId:actor.id,action:'ADMIN_IMPORT',entity:type,metadataJson:JSON.stringify({filename:file.name,rowCount:rows.length,created,updated})}})
    return NextResponse.json({ok:true,created,updated,errors:[]})
  } catch(error){const message=error instanceof Error?error.message:'Import failed'; const status=message==='FORBIDDEN'?403:message==='UNAUTHORIZED'?401:400; return NextResponse.json({error:status===403?'Forbidden':status===401?'Unauthorized':message},{status})}
}
