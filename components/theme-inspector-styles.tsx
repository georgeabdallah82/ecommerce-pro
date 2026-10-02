export default function ThemeInspectorStyles() {
  return <style dangerouslySetInnerHTML={{__html:`
.themeInspector{padding:14px;display:grid;gap:12px;background:var(--admin-bg)}
.themeInspectorPanel{border:1px solid var(--admin-border);border-radius:var(--admin-radius-md);background:var(--admin-surface);box-shadow:var(--admin-shadow-sm);overflow:hidden}
.themeInspectorPanel>summary{list-style:none;cursor:pointer;padding:13px 14px;font-size:12px;font-weight:850;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid transparent;color:var(--admin-ink)}
.themeInspectorPanel[open]>summary{border-bottom-color:var(--admin-border-soft)}
.themeInspectorPanel>summary::-webkit-details-marker{display:none}
.themeInspectorPanel>div{padding:16px;display:grid;gap:14px}
.themeInspectorField{display:grid;gap:6px}
.themeInspectorField>span,.themeInspectorRange span{font-size:11px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;color:var(--admin-muted)}
.themeInspectorField input,.themeInspectorField textarea,.themeInspectorField select{width:100%;box-sizing:border-box;border:1px solid var(--admin-border);border-radius:var(--admin-radius-sm);background:var(--admin-surface);color:var(--admin-ink);padding:9px 10px;font:inherit;font-size:12px;outline:none}
.themeInspectorField textarea{min-height:82px;resize:vertical}
.themeInspectorField input:focus,.themeInspectorField textarea:focus,.themeInspectorField select:focus{border-color:var(--admin-accent);box-shadow:0 0 0 3px var(--admin-accent-soft)}
.themeInspectorGrid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.themeInspectorToggle{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;font-size:12px;font-weight:700;color:var(--admin-ink-soft)}
.themeInspectorToggle button{width:38px;height:22px;border:0;border-radius:var(--admin-radius-pill);background:var(--admin-muted-soft);padding:3px;cursor:pointer;display:flex;align-items:center;justify-content:flex-start;transition:.15s}
.themeInspectorToggle button i{width:16px;height:16px;border-radius:50%;background:var(--admin-surface);box-shadow:var(--admin-shadow-sm);transition:.15s}
.themeInspectorToggle button.on{background:var(--admin-accent);justify-content:flex-end}
.themeInspectorRange{display:grid;gap:6px}
.themeInspectorRange>div{display:flex;justify-content:space-between;gap:8px}
.themeInspectorRange b{font-size:10px;color:var(--admin-ink-soft)}
.themeInspectorRange input{width:100%;accent-color:var(--admin-accent)}
.themeInspectorMeta{display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--admin-muted)}
.themeInspectorMeta strong{color:var(--admin-ink)}
.themeBlockList{display:grid;gap:9px}
.themeBlock{border:1px solid var(--admin-border);border-radius:var(--admin-radius-sm);background:var(--admin-surface);box-shadow:var(--admin-shadow-sm);overflow:hidden}
.themeBlockHeader{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--admin-border-soft);font-size:11px;color:var(--admin-muted)}
.themeBlockHeader strong{flex:1;font-size:12.5px;font-weight:700;color:var(--admin-ink)}
.themeBlockHeader button{width:28px;height:28px;border:0;border-radius:7px;background:transparent;color:var(--admin-muted);cursor:pointer}
.themeBlockHeader button:hover{background:var(--admin-danger-soft);color:var(--admin-danger)}
.themeBlockFields{padding:12px;display:grid;gap:12px}
.themeAddBlock{height:38px;border:1px dashed var(--admin-border);border-radius:var(--admin-radius-sm);background:var(--admin-bg);font:inherit;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;color:var(--admin-ink)}
.themeAddBlock:hover{border-color:var(--admin-accent);background:var(--admin-surface)}
.themeImagePreview{display:flex;align-items:center;gap:10px}
.pageSeo{border:1px solid var(--admin-border);border-radius:var(--admin-radius-sm);background:var(--admin-surface)}.pageSeo>summary{cursor:pointer;padding:9px 12px;font-size:12px;font-weight:800;color:var(--admin-ink)}.pageSeoBody{display:grid;gap:10px;padding:2px 12px 12px}.pageSeoBody label{display:grid;gap:4px;font-size:11px;font-weight:800;color:var(--admin-muted)}.pageSeoBody input,.pageSeoBody textarea{width:100%;border:1px solid var(--admin-border);border-radius:var(--admin-radius-sm);background:var(--admin-bg);color:var(--admin-ink);font:inherit;font-size:12.5px;font-weight:500;padding:7px 9px}.pageSeoBody textarea{resize:vertical}.pageSeoBody small{font-size:10.5px;font-weight:600;color:var(--admin-muted)}.pageSeoWarn{color:var(--admin-warning,#b54708)!important}.pageSeoUrl{display:flex;align-items:center;border:1px solid var(--admin-border);border-radius:var(--admin-radius-sm);background:var(--admin-bg);padding-left:9px}.pageSeoUrl i{font-style:normal;color:var(--admin-muted);font-weight:700}.pageSeoUrl input{border:0!important;background:transparent!important}.pageSeoSnippet{border:1px solid var(--admin-border);border-radius:var(--admin-radius-sm);padding:10px 12px;background:#fff;display:grid;gap:2px}.pageSeoSnippet span{font-size:11px;color:#3c6e47;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pageSeoSnippet strong{font-size:14.5px;font-weight:500;color:#1a0dab;line-height:1.3}.pageSeoSnippet p{margin:0;font-size:11.5px;line-height:1.45;color:#4d5156}.pageSeoActions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.pageSeoActions button{height:32px;padding:0 14px;border:0;border-radius:var(--admin-radius-sm);background:var(--admin-accent);color:#fff;font:inherit;font-size:12px;font-weight:800;cursor:pointer}.pageSeoActions button:disabled{opacity:.5;cursor:default}
.themeImageHint{display:block;margin-top:6px;font-size:11px;line-height:1.5;color:var(--admin-muted)}.themeImageHint b{color:var(--admin-ink);font-weight:700}.themeImageWarn{color:var(--admin-warning,#b54708);font-weight:700}
.themeImageThumb{width:64px;height:64px;border-radius:var(--admin-radius-sm);object-fit:cover;border:1px solid var(--admin-border);background:var(--admin-bg);flex:0 0 auto}
.themeImageActions{display:flex;gap:6px;flex-wrap:wrap}
.themeImageActions button{height:30px;padding:0 11px;border:1px solid var(--admin-border);border-radius:7px;background:var(--admin-surface);font:inherit;font-size:11px;font-weight:800;color:var(--admin-ink-soft);cursor:pointer}
.themeImageActions button:hover{border-color:var(--admin-accent)}
.themeImageRemove{color:var(--admin-danger)!important}
.themeImageEmpty{height:64px;width:100%;border:1px dashed var(--admin-border);border-radius:var(--admin-radius-sm);background:var(--admin-bg);display:flex;align-items:center;justify-content:center;gap:8px;font:inherit;font-size:11px;font-weight:800;color:var(--admin-muted);cursor:pointer}
.themeImageEmpty:hover{border-color:var(--admin-accent);background:var(--admin-surface);color:var(--admin-ink)}
.themeColorRow{display:flex;gap:8px;align-items:center}
.themeColorRow input[type=color]{width:38px;height:38px;padding:2px;border:1px solid var(--admin-border);border-radius:var(--admin-radius-sm);background:var(--admin-surface);cursor:pointer;flex:0 0 auto}
.themeColorRow input[type=text]{flex:1}
@media(max-width:560px){.themeInspector{padding:10px}.themeInspectorGrid{grid-template-columns:1fr}.themeInspectorPanel>div{padding:12px}}

.themePicker{gap:8px}
.themePickerHint{font-size:11px;line-height:1.45;color:var(--admin-muted)}
.themePickerAuto{padding:10px 12px;border:1px dashed var(--admin-border);border-radius:var(--admin-radius-sm);font-size:11.5px;line-height:1.45;color:var(--admin-muted)}
.themePickerError{border-style:solid;border-color:var(--admin-danger);color:var(--admin-danger)}
.themePickerChosen,.themePickerList{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.themePickerList{max-height:220px;overflow:auto;border:1px solid var(--admin-border-soft);border-radius:var(--admin-radius-sm);padding:4px;background:var(--admin-bg)}
.themePickerChosen li{display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--admin-border);border-radius:var(--admin-radius-sm);background:var(--admin-surface)}
.themePickerChosen li>div,.themePickerList li button>div{flex:1;min-width:0;display:grid;gap:1px;text-align:left}
.themePickerChosen strong,.themePickerList strong{font-size:12px;font-weight:700;color:var(--admin-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.themePickerChosen em,.themePickerList em{font-size:10.5px;font-style:normal;color:var(--admin-muted)}
.themePickerChosen a{font-size:10.5px;color:var(--admin-accent-strong);text-decoration:underline}
.themePickerChosen li>button{width:26px;height:26px;border:0;border-radius:6px;background:transparent;color:var(--admin-muted);cursor:pointer;display:grid;place-items:center;font-size:13px}
.themePickerChosen li>button:hover:not(:disabled){background:var(--admin-bg);color:var(--admin-ink)}
.themePickerChosen li>button:disabled{opacity:.3;cursor:default}
.themePicker img,.themePickerNoImage{width:34px;height:34px;flex:0 0 34px;border-radius:7px;object-fit:cover;background:var(--admin-bg);border:1px solid var(--admin-border-soft)}
.themePickerNoImage{display:grid;place-items:center;font-size:12px;color:var(--admin-muted)}
.themePickerList li button{width:100%;display:flex;align-items:center;gap:8px;padding:6px 8px;border:0;border-radius:6px;background:transparent;color:var(--admin-ink);cursor:pointer;text-align:left}
.themePickerList li button:hover{background:var(--admin-surface)}
.themePickerEmpty{padding:8px;font-size:11.5px;color:var(--admin-muted)}
.themePickerClear{justify-self:start;border:0;background:transparent;padding:0;font-size:11px;font-weight:700;color:var(--admin-muted);text-decoration:underline;cursor:pointer}
`}}/>
}
