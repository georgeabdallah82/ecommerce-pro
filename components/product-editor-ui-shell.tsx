import type { ReactNode } from 'react'

const css = `
.productEditorFrame{min-width:0;padding:4px 0 34px}
.productEditorFrame .productEditor{max-width:1480px;margin:0 auto;background:#f6f6f4;color:#171717}
.productEditorFrame .editorTopbar{position:sticky;top:0;z-index:45;display:flex;align-items:center;justify-content:space-between;gap:18px;padding:14px 0 16px;margin:0 0 14px;background:rgba(246,246,244,.96);backdrop-filter:blur(14px);border-bottom:1px solid #e6e6e2}
.productEditorFrame .editorTopLeft,.productEditorFrame .editorTopActions{display:flex;align-items:center;gap:10px;min-width:0}
.productEditorFrame .editorTopLeft>div:last-child{min-width:0}
.productEditorFrame .editorTitle{margin:2px 0 0;font-size:28px;line-height:1.15;letter-spacing:-.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:min(52vw,720px)}
.productEditorFrame .editorTopActions{justify-content:flex-end;flex-wrap:wrap}
.productEditorFrame .editorTopActions .btn{min-height:40px}
.productEditorFrame .editorTabs{position:sticky;top:78px;z-index:40;display:flex;gap:3px;overflow:auto;padding:5px;margin-bottom:14px;border:1px solid #e1e1db;background:#fff;border-radius:12px;scrollbar-width:thin}
.productEditorFrame .editorTabs button{flex:0 0 auto;border:0;background:transparent;color:#66665f;font:inherit;font-size:13px;font-weight:650;padding:9px 13px;border-radius:8px;white-space:nowrap;cursor:pointer}
.productEditorFrame .editorTabs button:hover{background:#f3f3ef;color:#171717}
.productEditorFrame .editorTabs button.active{background:#171717;color:#fff}
.productEditorFrame .editorBody{display:grid;grid-template-columns:minmax(0,1fr);gap:16px}
.productEditorFrame .editorMain{min-width:0;display:grid;gap:14px}
.productEditorFrame .editorMain>div{min-width:0}
.productEditorFrame .card{border:1px solid #e1e1db;border-radius:14px;box-shadow:0 1px 2px rgba(0,0,0,.03);background:#fff}
.productEditorFrame .cardHeader,.productEditorFrame .card>div:first-child{min-width:0}
.productEditorFrame .input,.productEditorFrame .textarea,.productEditorFrame select{min-height:40px;border-radius:9px;border-color:#d8d8d2;background:#fff}
.productEditorFrame .textarea{line-height:1.55;resize:vertical}
.productEditorFrame .input:focus,.productEditorFrame .textarea:focus,.productEditorFrame select:focus{outline:0;border-color:#8d8d84;box-shadow:0 0 0 3px rgba(23,23,23,.06)}
.productEditorFrame .twoColFields,.productEditorFrame .threeColFields{display:grid;gap:12px}
.productEditorFrame .twoColFields{grid-template-columns:repeat(2,minmax(0,1fr))}
.productEditorFrame .threeColFields{grid-template-columns:repeat(3,minmax(0,1fr))}
.productEditorFrame .checkGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.productEditorFrame .tagRow{display:flex;flex-wrap:wrap;gap:7px;align-items:center}
.productEditorFrame .tagRow .input{flex:1 1 190px}
.productEditorFrame .mediaEditorGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.productEditorFrame .mediaEditItem{min-width:0;display:grid;grid-template-columns:18px minmax(120px,180px) minmax(0,1fr);gap:10px;align-items:start;padding:10px;border:1px solid #e5e5df;border-radius:12px;background:#fbfbf9}
.productEditorFrame .mediaEditItem>img,.productEditorFrame .mediaPlaceholder{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:10px;background:#efefea}
.productEditorFrame .mediaPlaceholder{display:grid;place-items:center;color:#8a8a82;font-size:12px}
.productEditorFrame .mediaEditControls{display:grid;gap:8px;min-width:0}
.productEditorFrame .mediaEditControls .inline{flex-wrap:wrap}
.productEditorFrame .mediaAdd{min-height:110px;border:1px dashed #cfcfc8;border-radius:12px;background:#fcfcfa;color:#62625c;font:inherit;font-weight:650;cursor:pointer}
.productEditorFrame .mediaAdd:hover{background:#f4f4f0;border-color:#a9a9a0;color:#171717}
.productEditorFrame .optionList{display:grid;gap:8px;margin-bottom:10px}
.productEditorFrame .optionRow{display:grid;grid-template-columns:minmax(150px,.8fr) minmax(0,1.5fr) auto;gap:8px;align-items:center}
.productEditorFrame .variantHead,.productEditorFrame .variantRow{display:grid;grid-template-columns:minmax(170px,1.5fr) minmax(130px,1fr) minmax(100px,.7fr) minmax(90px,.6fr) 40px;gap:8px;align-items:center}
.productEditorFrame .variantHead{padding:0 2px 7px;color:#77776f;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}
.productEditorFrame .variantRow{padding:8px 0;border-top:1px solid #ededeb}
.productEditorFrame .variantRow .input{min-width:0}
.productEditorFrame .editorNotice,.productEditorFrame .pricingPreview{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 13px;border:1px solid #e2e2dc;border-radius:10px;background:#fafaf8}
.productEditorFrame .editorNotice span{font-size:12px;color:#75756e}
.productEditorFrame .pricingPreview{margin-top:12px}
.productEditorFrame .pricingPreview strong{font-size:20px}
.productEditorFrame .alert{border-radius:10px}
.productEditorFrame .smallBtn{min-width:36px}
.productEditorFrame .editorTopbar+.alert{margin-top:0}
.productEditorFrame img{max-width:100%}
@media(max-width:950px){
 .productEditorFrame .editorTopbar{align-items:flex-start}
 .productEditorFrame .editorTitle{max-width:46vw;font-size:24px}
 .productEditorFrame .editorTabs{top:76px}
 .productEditorFrame .mediaEditorGrid{grid-template-columns:1fr}
 .productEditorFrame .checkGrid{grid-template-columns:1fr}
 .productEditorFrame .twoColFields,.productEditorFrame .threeColFields{grid-template-columns:1fr}
}
@media(max-width:700px){
 .productEditorFrame{padding-top:0}
 .productEditorFrame .editorTopbar{position:relative;top:auto;flex-direction:column;gap:12px;padding:10px 0 12px}
 .productEditorFrame .editorTopLeft,.productEditorFrame .editorTopActions{width:100%}
 .productEditorFrame .editorTopActions{justify-content:stretch}
 .productEditorFrame .editorTopActions .btn{flex:1}
 .productEditorFrame .editorTitle{font-size:22px;max-width:72vw}
 .productEditorFrame .editorTabs{position:sticky;top:0;z-index:35}
 .productEditorFrame .editorTabs button{padding:9px 12px}
 .productEditorFrame .mediaEditItem{grid-template-columns:1fr;}
 .productEditorFrame .mediaEditItem>.dragHandle{display:none}
 .productEditorFrame .mediaEditItem>img,.productEditorFrame .mediaPlaceholder{max-width:220px}
 .productEditorFrame .optionRow{grid-template-columns:1fr;}
 .productEditorFrame .variantHead{display:none}
 .productEditorFrame .variantRow{grid-template-columns:1fr 1fr;align-items:stretch}
 .productEditorFrame .variantRow .iconBtn{grid-column:2;justify-self:end}
}
@media(max-width:480px){
 .productEditorFrame .editorTopActions{display:grid;grid-template-columns:1fr 1fr}
 .productEditorFrame .editorTopActions .btn:last-child{grid-column:1 / -1}
 .productEditorFrame .card{border-radius:12px}
 .productEditorFrame .editorTabs{margin-bottom:10px}
}
`

export default function ProductEditorUiShell({ children }: { children: ReactNode }) {
  return <div className="productEditorFrame"><style dangerouslySetInnerHTML={{ __html: css }} />{children}</div>
}
