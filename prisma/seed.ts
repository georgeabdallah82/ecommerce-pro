import { PrismaClient, Role, DiscountType, ProductStatus } from '@prisma/client'
import bcrypt from 'bcryptjs'
import {defaultTheme,defaultSections,defaultNavigation} from '../lib/theme-defaults'
const db=new PrismaClient()
async function main(){
 const adminPassword=process.env.SEED_ADMIN_PASSWORD||'ChangeMe123!'; const passwordHash=await bcrypt.hash(adminPassword,12)
 const admin=await db.user.upsert({where:{email:'admin@example.com'},update:{role:Role.SUPER_ADMIN,isActive:true,passwordHash,name:'Store Admin'},create:{name:'Store Admin',email:'admin@example.com',passwordHash,role:Role.SUPER_ADMIN}})
 const customerHash=await bcrypt.hash('Customer123!',12)
 await db.user.upsert({where:{email:'customer@example.com'},update:{passwordHash:customerHash},create:{name:'Demo Customer',email:'customer@example.com',passwordHash:customerHash,role:Role.CUSTOMER}})
 const featured=await db.category.upsert({where:{slug:'featured'},update:{},create:{name:'Featured',slug:'featured',description:'Curated products',sortOrder:0}})
 const home=await db.category.upsert({where:{slug:'home-essentials'},update:{},create:{name:'Home Essentials',slug:'home-essentials',description:'Practical everyday products',sortOrder:1}})
 const products=[['Essential Starter Kit','essential-starter-kit',3900,'SKU-001',true],['Everyday Home Set','everyday-home-set',5900,'SKU-002',true],['Premium Care Bundle','premium-care-bundle',7900,'SKU-003',false],['Smart Organizer','smart-organizer',2900,'SKU-004',false],['Daily Essentials Pack','daily-essentials-pack',4500,'SKU-005',true],['Signature Value Box','signature-value-box',9900,'SKU-006',false]] as const
 for(const [name,slug,price,sku,feat] of products){const p=await db.product.upsert({where:{slug},update:{basePrice:price,status:ProductStatus.ACTIVE,featured:feat},create:{name,slug,basePrice:price,sku,status:ProductStatus.ACTIVE,featured:feat,shortDescription:'Thoughtfully selected essentials with a clean, premium presentation.',categoryId:sku==='SKU-004'?home.id:featured.id,images:{create:{url:'/placeholder-product.svg',alt:name}},inventory:{create:{quantity:24,lowStockThreshold:5,location:'Main'}}}});await db.product.update({where:{id:p.id},data:{categoryId:sku==='SKU-004'?home.id:featured.id}})}
 const collection=await db.collection.upsert({where:{slug:'best-sellers'},update:{},create:{name:'Best Sellers',slug:'best-sellers',description:'Our most popular essentials',sortOrder:0,imageUrl:'/placeholder-product.svg'}})
 const best=await db.product.findMany({where:{featured:true},select:{id:true}});await db.collectionProduct.deleteMany({where:{collectionId:collection.id}});if(best.length)await db.collectionProduct.createMany({data:best.map((x,i)=>({collectionId:collection.id,productId:x.id,sortOrder:i}))})
 await db.setting.upsert({where:{key:'store.name'},update:{value:process.env.NEXT_PUBLIC_BRAND_NAME||'Your Brand'},create:{key:'store.name',value:process.env.NEXT_PUBLIC_BRAND_NAME||'Your Brand'}})
 for(const [key,value] of [['store.currency',process.env.NEXT_PUBLIC_CURRENCY||'USD'],['store.country',process.env.NEXT_PUBLIC_COUNTRY||'Lebanon'],['checkout.freeShippingThreshold','100'],['checkout.taxRatePercent','0'],['storefront_note','Free delivery on qualifying orders.']]) await db.setting.upsert({where:{key},update:{value},create:{key,value}})
 await db.coupon.upsert({where:{code:'WELCOME10'},update:{value:10,type:DiscountType.PERCENTAGE,isActive:true},create:{code:'WELCOME10',type:DiscountType.PERCENTAGE,value:10,maxUses:100,isActive:true,firstOrderOnly:true}})
 let zone=await db.shippingZone.findFirst({where:{name:'Lebanon'}});if(!zone)zone=await db.shippingZone.create({data:{name:'Lebanon',countries:'LB,LEBANON',rates:{create:{name:'Standard delivery',price:500,freeAbove:10000,estimatedDays:2,isActive:true}}}})
 await db.homepageBlock.deleteMany({});await db.homepageBlock.createMany({data:[{type:'announcement',title:'Free delivery on qualifying orders.',contentJson:JSON.stringify({text:'Free delivery on qualifying orders.'}),sortOrder:0},{type:'trust',title:'Built for a better everyday',subtitle:'Fast delivery, simple checkout, helpful support.',contentJson:JSON.stringify({}),sortOrder:1}]})
 await db.setting.upsert({where:{key:'theme.config'},update:{value:JSON.stringify(defaultTheme)},create:{key:'theme.config',value:JSON.stringify(defaultTheme)}})
 await db.setting.upsert({where:{key:'theme.sections'},update:{value:JSON.stringify(defaultSections)},create:{key:'theme.sections',value:JSON.stringify(defaultSections)}})
 await db.setting.upsert({where:{key:'navigation.main'},update:{value:JSON.stringify(defaultNavigation)},create:{key:'navigation.main',value:JSON.stringify(defaultNavigation)}})
 console.log(`Seeded ${admin.email}. Admin password comes from SEED_ADMIN_PASSWORD or defaults to ChangeMe123!`)
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>db.$disconnect())
