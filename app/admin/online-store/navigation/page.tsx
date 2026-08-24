import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { getThemeState } from '@/lib/theme'
import NavigationEditorPro from '@/components/navigation-editor-pro'

const css = `.navProPage{max-width:1480px;margin:0 auto}.navProLayout{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(320px,.75fr);gap:16px}.navProBuilder{padding:0;overflow:hidden}.navProToolbar{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:18px;border-bottom:1px solid #ecece8}.navProRows{padding:14px}.navProRow{display:grid;grid-template-columns:34px minmax(140px,1.15fr) 120px minmax(160px,1fr) 34px 34px 34px;gap:8px;align-items:center;padding:8px;border:1px solid #e7e7e2;border-radius:10px;background:#fff;margin-bottom:8px}.navProType{min-width:0}.navProUrl{min-width:0}.navProRow .iconBtn{height:34px;width:34px}.navProHint{margin:0 14px 14px;padding:12px;border-radius:10px;background:#f8f8f5;display:flex;gap:10px;font-size:12px}.navProPreview{padding:0;overflow:hidden}.navProPreviewHead{display:flex;justify-content:space-between;padding:16px;border-bottom:1px solid #ecece8}.navPreviewPro{min-height:420px;background:#fff}.navBrand{font-weight:800;font-size:15px;padding:20px;border-bottom:1px solid #ecece8}.navMenu{display:flex;gap:4px;padding:8px 14px;border-bottom:1px solid #ecece8}.navMenuItem{padding:9px 11px;border-radius:8px;font-size:12px;font-weight:700;display:flex;gap:4px;align-items:center}.navMenuItem:hover{background:#f3f3ef}.navDropdown{margin:14px;border:1px solid #e5e5df;border-radius:10px;padding:12px;box-shadow:0 8px 24px rgba(0,0,0,.06)}.navDropdown strong{display:block;margin-bottom:8px}.navDropdown div{display:flex;gap:6px;align-items:center;padding:8px;border-radius:8px;font-size:12px}.navDropdown div:hover{background:#f7f7f4}@media(max-width:1000px){.navProLayout{grid-template-columns:1fr}.navProRow{grid-template-columns:34px minmax(120px,1fr) 110px minmax(120px,1fr) 34px 34px 34px}}@media(max-width:700px){.navProToolbar{align-items:flex-start;flex-direction:column}.navProRow{grid-template-columns:34px 1fr 34px 34px 34px}.navProType,.navProUrl{grid-column:2 / -1}.navProPreview{min-height:300px}}`

export default async function Navigation(){
  await requirePermission('content.view')
  const [{navigation}, categories, collections] = await Promise.all([
    getThemeState(),
    db.category.findMany({where:{isActive:true},orderBy:{sortOrder:'asc'}}),
    db.collection.findMany({orderBy:{name:'asc'}}),
  ])
  return <><style dangerouslySetInnerHTML={{__html:css}}/><NavigationEditorPro initial={JSON.parse(JSON.stringify(navigation))} categories={JSON.parse(JSON.stringify(categories))} collections={JSON.parse(JSON.stringify(collections))}/></>
}
