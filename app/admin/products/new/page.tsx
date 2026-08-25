import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import ProductEditorV2 from '@/components/product-editor-v2'
import ProductEditorUiShell from '@/components/product-editor-ui-shell'

export default async function NewProduct(){
  await requirePermission('products.manage')
  const [categories,definitions]=await Promise.all([db.category.findMany({orderBy:[{sortOrder:'asc'},{name:'asc'}]}),db.metafieldDefinition.findMany({where:{ownerType:'PRODUCT'},orderBy:[{namespace:'asc'},{key:'asc'}]})])
  const initial={name:'',slug:'',description:'',shortDescription:'',brand:'',vendor:'',productType:'',basePrice:0,compareAtPrice:null,costPrice:null,sku:'',barcode:'',status:'DRAFT',featured:false,seoTitle:'',seoDescription:'',seoImageUrl:'',weight:null,weightUnit:'kg',requiresShipping:true,taxable:true,trackInventory:true,continueSellingWhenOutOfStock:false,giftCard:false,productTemplate:'product',categoryId:null,publishedAt:null,images:[],variants:[],inventory:[{quantity:0,reserved:0,lowStockThreshold:5,location:'Main'}],tags:[],metafields:[],sharedInventory:false} as any
  return <ProductEditorUiShell><ProductEditorV2 initial={initial} creating categories={categories} definitions={definitions}/></ProductEditorUiShell>
}
