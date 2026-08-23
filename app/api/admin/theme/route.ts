import {db} from '@/lib/prisma'; import {requirePermission} from '@/lib/auth'; import {audit} from '@/lib/audit'; import {json} from '@/lib/utils'; import {defaultNavigation,defaultSections,defaultTheme} from '@/lib/theme'

function normalizeSections(input:any[]){
  return (Array.isArray(input)?input:defaultSections).filter(Boolean).map((s:any)=>{
    const type=s.type==='image_banner'?'hero':s.type
    const settings={...(s.settings||{})}
    if(type==='hero') settings.imageUrl=settings.imageUrl||settings.desktopImageUrl||settings.mobileImageUrl||''
    return {...s,type,enabled:s.enabled!==false,settings,blocks:Array.isArray(s.blocks)?s.blocks:[]}
  })
}

export async function GET(){try{await requirePermission('content.view');const [theme,sections,navigation]=await Promise.all([db.setting.findUnique({where:{key:'theme.config'}}),db.setting.findUnique({where:{key:'theme.sections'}}),db.setting.findUnique({where:{key:'navigation.main'}})]);const rawTheme=theme?JSON.parse(theme.value):defaultTheme;const normalized=normalizeSections(sections?JSON.parse(sections.value):defaultSections);return json({theme:rawTheme,sections:normalized,navigation:navigation?JSON.parse(navigation.value):defaultNavigation},{headers:{'cache-control':'no-store'}})}catch(e){return json({error:e instanceof Error?e.message:'Forbidden'},{status:403})}}

export async function PATCH(req:Request){try{const actor=await requirePermission('content.manage');const b=await req.json();const incomingTheme=b.theme||defaultTheme;const sections=normalizeSections(b.sections||defaultSections);const navigation=b.navigation||defaultNavigation;const theme={...incomingTheme,editorTemplates:{...(incomingTheme.editorTemplates||{}),'Home page':sections}};await db.$transaction([db.setting.upsert({where:{key:'theme.config'},create:{key:'theme.config',value:JSON.stringify(theme)},update:{value:JSON.stringify(theme)}}),db.setting.upsert({where:{key:'theme.sections'},create:{key:'theme.sections',value:JSON.stringify(sections)},update:{value:JSON.stringify(sections)}}),db.setting.upsert({where:{key:'navigation.main'},create:{key:'navigation.main',value:JSON.stringify(navigation)},update:{value:JSON.stringify(navigation)}})]);await audit(actor.id,'theme.updated','Theme','theme.config',{sections:sections.length,navigation:navigation.length,preset:theme?.presets?.active||null});return json({theme,sections,navigation},{headers:{'cache-control':'no-store'}})}catch(e){return json({error:e instanceof Error?e.message:'Unable to save theme'},{status:400})}}
