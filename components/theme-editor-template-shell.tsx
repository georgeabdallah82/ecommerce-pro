'use client'

import { useMemo, useState } from 'react'
import ShopifyThemeEditor from '@/components/shopify-theme-editor'

type Section = { id:string; type:string; enabled:boolean; settings:Record<string,any>; blocks?:any[] }
type Theme = Record<string,any>

const TEMPLATES = ['Home page','Products','Product','Collections','Collection','Cart','Pages','Blog']

export default function ThemeEditorTemplateShell({ initial }:{ initial:{ theme:Theme; sections:Section[]; navigation:any[] } }) {
  const templateMap = useMemo(() => {
    const source = initial.theme?.editorTemplates && typeof initial.theme.editorTemplates === 'object' ? initial.theme.editorTemplates : {}
    return Object.fromEntries(TEMPLATES.map(name => [name, Array.isArray(source[name]) ? source[name] : name === 'Home page' ? initial.sections : []])) as Record<string,Section[]>
  }, [initial.theme, initial.sections])
  const [template, setTemplate] = useState('Home page')

  const activeInitial = useMemo(() => ({
    ...initial,
    theme: { ...initial.theme, editorTemplates: templateMap, editorTemplateKey: template },
    sections: templateMap[template] || [],
  }), [initial, template, templateMap])

  return <div className="themeEditorShell">
    <style>{`
      .themeEditorTemplatePicker{position:fixed;z-index:10020;top:12px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:9px;padding:5px 7px 5px 12px;border:1px solid #dfe3e6;border-radius:10px;background:#fff;box-shadow:0 3px 14px rgba(0,0,0,.10);font:700 11px Inter,system-ui,sans-serif;color:#202223}
      .themeEditorTemplatePicker span{font-size:9px;color:#6d7175;text-transform:uppercase;letter-spacing:.06em}
      .themeEditorTemplatePicker select{border:0;outline:0;background:#fff;color:#202223;font:800 11px Inter,system-ui,sans-serif;min-width:145px;cursor:pointer}
      .themeEditorTemplatePicker select:focus{outline:0}
      @media(max-width:720px){.themeEditorTemplatePicker{left:58%;top:10px;transform:translateX(-50%);max-width:180px}.themeEditorTemplatePicker span{display:none}.themeEditorTemplatePicker select{min-width:125px}}
    `}</style>
    <div className="themeEditorTemplatePicker" aria-label="Theme template selector">
      <span>Template</span>
      <select value={template} onChange={e => setTemplate(e.target.value)}>
        {TEMPLATES.map(name => <option key={name} value={name}>{name}</option>)}
      </select>
    </div>
    <ShopifyThemeEditor key={template} initial={activeInitial}/>
  </div>
}
