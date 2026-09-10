export default function ThemeInspectorStyles() {
  return <style dangerouslySetInnerHTML={{__html:`
.themeInspector{padding:14px;display:grid;gap:10px;background:#fbfbf9}.themeInspectorPanel{border:1px solid #e2e1dc;border-radius:11px;background:#fff;overflow:hidden}.themeInspectorPanel>summary{list-style:none;cursor:pointer;padding:13px 14px;font-size:12px;font-weight:850;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid transparent}.themeInspectorPanel[open]>summary{border-bottom-color:#ecebe7}.themeInspectorPanel>summary::-webkit-details-marker{display:none}.themeInspectorPanel>div{padding:14px;display:grid;gap:12px}.themeInspectorField{display:grid;gap:5px}.themeInspectorField>span,.themeInspectorRange span{font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#77766f}.themeInspectorField input,.themeInspectorField textarea,.themeInspectorField select{width:100%;box-sizing:border-box;border:1px solid #dddcd5;border-radius:8px;background:#fff;color:#262620;padding:9px 10px;font:inherit;font-size:12px;outline:none}.themeInspectorField textarea{min-height:82px;resize:vertical}.themeInspectorField input:focus,.themeInspectorField textarea:focus,.themeInspectorField select:focus{border-color:#9b9a92;box-shadow:0 0 0 3px rgba(30,30,24,.05)}.themeInspectorGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.themeInspectorToggle{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;font-size:12px;font-weight:700;color:#383832}.themeInspectorToggle button{width:38px;height:22px;border:0;border-radius:999px;background:#d7d7d0;padding:3px;cursor:pointer;display:flex;align-items:center;justify-content:flex-start;transition:.15s}.themeInspectorToggle button i{width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.15);transition:.15s}.themeInspectorToggle button.on{background:#1e1e1a;justify-content:flex-end}.themeInspectorRange{display:grid;gap:6px}.themeInspectorRange>div{display:flex;justify-content:space-between;gap:8px}.themeInspectorRange b{font-size:10px;color:#4d4c45}.themeInspectorRange input{width:100%;accent-color:#1e1e1a}.themeInspectorMeta{display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#77766f}.themeInspectorMeta strong{color:#2b2b26}.themeBlockList{display:grid;gap:9px}.themeBlock{border:1px solid #e5e4de;border-radius:10px;background:#fff;overflow:hidden}.themeBlockHeader{display:flex;align-items:center;gap:8px;padding:9px 10px;border-bottom:1px solid #ecebe7;font-size:11px;color:#6d6c65}.themeBlockHeader strong{flex:1;color:#2a2a25}.themeBlockHeader button{width:28px;height:28px;border:0;border-radius:7px;background:transparent;color:#77766f;cursor:pointer}.themeBlockHeader button:hover{background:#f4f4ef;color:#b33e32}.themeBlockFields{padding:10px;display:grid;gap:10px}.themeAddBlock{height:38px;border:1px dashed #c8c6bd;border-radius:9px;background:#fafaf7;font:inherit;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;gap:6px;cursor:pointer}.themeAddBlock:hover{border-color:#1e1e1a;background:#fff}@media(max-width:560px){.themeInspector{padding:10px}.themeInspectorGrid{grid-template-columns:1fr}.themeInspectorPanel>div{padding:12px}}
/* This whole panel (the section-settings inspector inside the theme editor's
   drawer) had zero dark-mode handling before -- every rule above is
   light-mode-only hex with no html[data-admin-theme='dark'] counterpart
   anywhere. Added here using the same hand-maintained hex-pair convention
   already used by admin-dashboard-styles.tsx and admin-route-state-styles.tsx. */
html[data-admin-theme='dark'] .themeInspector{background:#151817}
html[data-admin-theme='dark'] .themeInspectorPanel{border-color:#303631;background:#191d1b}
html[data-admin-theme='dark'] .themeInspectorPanel[open]>summary{border-bottom-color:#2c332e}
html[data-admin-theme='dark'] .themeInspectorField>span,html[data-admin-theme='dark'] .themeInspectorRange span{color:#9da69f}
html[data-admin-theme='dark'] .themeInspectorField input,html[data-admin-theme='dark'] .themeInspectorField textarea,html[data-admin-theme='dark'] .themeInspectorField select{border-color:#343b36;background:#191d1b;color:#eef2ef}
html[data-admin-theme='dark'] .themeInspectorField input:focus,html[data-admin-theme='dark'] .themeInspectorField textarea:focus,html[data-admin-theme='dark'] .themeInspectorField select:focus{border-color:#8a9891;box-shadow:0 0 0 3px rgba(238,242,239,.08)}
html[data-admin-theme='dark'] .themeInspectorToggle{color:#dce3de}
html[data-admin-theme='dark'] .themeInspectorToggle button{background:#2c332e}
html[data-admin-theme='dark'] .themeInspectorToggle button i{background:#eef2ef}
html[data-admin-theme='dark'] .themeInspectorToggle button.on{background:#4fd18b}
html[data-admin-theme='dark'] .themeInspectorRange b{color:#9da69f}
html[data-admin-theme='dark'] .themeInspectorRange input{accent-color:#4fd18b}
html[data-admin-theme='dark'] .themeInspectorMeta{color:#9da69f}
html[data-admin-theme='dark'] .themeInspectorMeta strong{color:#eef2ef}
html[data-admin-theme='dark'] .themeBlock{border-color:#303631;background:#191d1b}
html[data-admin-theme='dark'] .themeBlockHeader{border-bottom-color:#2c332e;color:#9da69f}
html[data-admin-theme='dark'] .themeBlockHeader strong{color:#eef2ef}
html[data-admin-theme='dark'] .themeBlockHeader button{color:#9da69f}
html[data-admin-theme='dark'] .themeBlockHeader button:hover{background:#33201c;color:#f0776a}
html[data-admin-theme='dark'] .themeAddBlock{border-color:#3a4238;background:#191d1b;color:#9da69f}
html[data-admin-theme='dark'] .themeAddBlock:hover{border-color:#eef2ef;background:#191d1b}
`}}/>
}
