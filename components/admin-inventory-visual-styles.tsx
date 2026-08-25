'use client'

export default function AdminInventoryVisualStyles() {
  return (
    <style jsx global>{`
      .inventoryPage{min-height:calc(100vh - 100px);padding:4px 0 40px;color:#1f1f1b}
      .inventoryHead{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:24px}
      .inventoryHead .h2{font-size:38px;line-height:1.05;letter-spacing:-.045em}
      .inventoryLive{display:inline-flex;align-items:center;gap:8px;padding:9px 13px;border:1px solid #e3e6e0;background:#fbfcfa;border-radius:999px;font-size:12px;font-weight:800;color:#486451;white-space:nowrap}
      .inventoryLiveDot{width:8px;height:8px;border-radius:50%;background:#31a66a;box-shadow:0 0 0 4px rgba(49,166,106,.12)}
      .inventoryStatsPro{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:16px}
      .inventoryStat{min-height:112px;padding:18px 20px;border:1px solid #e2e2dc;border-radius:14px;background:#fff;display:flex;flex-direction:column;justify-content:space-between;box-shadow:0 1px 2px rgba(0,0,0,.02)}
      button.inventoryStat{font:inherit;text-align:left;cursor:pointer}
      .inventoryStat.clickable:hover{border-color:#b8b8b0;transform:translateY(-1px);box-shadow:0 10px 24px rgba(0,0,0,.05)}
      .inventoryStat.active{border-color:#1d1d1a;box-shadow:0 0 0 1px #1d1d1a inset}
      .inventoryStat.warning.active{border-color:#b77908;box-shadow:0 0 0 1px #b77908 inset}
      .inventoryStat.danger.active{border-color:#b53a32;box-shadow:0 0 0 1px #b53a32 inset}
      .inventoryStat span{font-size:11px;font-weight:800;color:#76766e;text-transform:uppercase;letter-spacing:.06em}
      .inventoryStat strong{font-size:28px;line-height:1;letter-spacing:-.04em}
      .inventoryStat small{font-size:11px;color:#8a8a83}
      .inventoryControlBar{padding:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;background:#fff}
      .inventorySearchBox{height:44px;min-width:320px;flex:1;display:flex;align-items:center;gap:9px;padding:0 12px;border:1px solid #deded8;border-radius:10px;background:#fff;color:#777770}
      .inventorySearchBox input{border:0;outline:0;min-width:0;flex:1;background:transparent;color:#1d1d19;font-size:13px}
      .inventorySearchClear{width:28px;height:28px;border:0;border-radius:7px;background:#f2f2ee;color:#777770;display:grid;place-items:center;cursor:pointer}
      .inventoryControlGroup{display:flex;gap:9px}
      .inventorySelect{height:44px;display:flex;align-items:center;gap:8px;padding:0 11px;border:1px solid #deded8;border-radius:10px;background:#fff;color:#62625b}
      .inventorySelect select{appearance:none;border:0;outline:0;background:transparent;color:#262621;min-width:130px;font-size:13px;font-weight:700;cursor:pointer}
      .inventoryTableShell{overflow:hidden;background:#fff}
      .inventoryTableHeader{min-height:58px;padding:0 18px;display:flex;align-items:center;justify-content:space-between;gap:14px;border-bottom:1px solid #e7e7e1;font-size:12px}
      .inventoryTableHeader strong{font-size:13px}
      .tableWrap{overflow:auto}
      .inventoryTablePro{min-width:900px;border-collapse:separate;border-spacing:0}
      .inventoryTablePro th{background:#fafaf7;color:#77776f;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.06em;padding:12px 14px;border-bottom:1px solid #e7e7e1;white-space:nowrap}
      .inventoryTablePro td{padding:14px;border-bottom:1px solid #efeee9;font-size:13px;vertical-align:middle}
      .inventoryTablePro tbody tr:last-child td{border-bottom:0}
      .inventoryRow{cursor:pointer;transition:background .15s ease}
      .inventoryRow:hover{background:#fcfcf9}
      .num{text-align:right!important;font-variant-numeric:tabular-nums}
      .actionsCol{text-align:right!important}
      .inventoryProductCell{display:flex;align-items:center;gap:11px;min-width:260px}
      .inventoryThumb{width:42px;height:42px;flex:0 0 42px;border:1px solid #e4e4de;border-radius:9px;background:#f5f5f1;display:grid;place-items:center;overflow:hidden;color:#8b8b83}
      .inventoryThumb img{width:100%;height:100%;object-fit:cover}
      .inventoryProductCell strong{display:block;font-size:13px;line-height:1.25}
      .inventoryProductCell .muted{margin-top:4px;font-size:11px}
      .inventoryLocation{display:inline-flex;align-items:center;gap:5px;white-space:nowrap;font-size:12px;font-weight:700}
      .reservedValue{font-variant-numeric:tabular-nums;color:#6d6d66}
      .inventoryQty{font-variant-numeric:tabular-nums}
      .warningText{color:#a26a00}
      .dangerText{color:#b13730}
      .inventoryStatus{display:inline-flex;align-items:center;gap:5px;padding:5px 9px;border-radius:999px;font-size:11px;font-weight:850;white-space:nowrap}
      .inventoryStatus.success{background:#eaf7ee;color:#1f7540}
      .inventoryStatus.warning{background:#fff5dc;color:#8b6100}
      .inventoryStatus.danger{background:#fff0ef;color:#a52f29}
      .inventoryQuick{display:inline-flex;gap:6px}
      .inventoryQuick button{width:30px;height:30px;border:1px solid #deded8;background:#fff;border-radius:8px;display:grid;place-items:center;color:#474741;cursor:pointer}
      .inventoryQuick button:hover{background:#f5f5f1;border-color:#c8c8c0}
      .inventoryEmpty{padding:64px 20px;text-align:center;color:#77776f}
      .inventoryEmpty h3{margin:10px 0 5px;color:#262621}
      .inventoryEmpty.compact{padding:44px 20px}
      .inventoryNotice{display:flex;align-items:center;gap:8px;margin-bottom:14px;background:#edf8f1;border-color:#ccebd7;color:#216b3c}
      .inventoryDrawerOverlay{position:fixed;inset:0;z-index:90;background:rgba(24,24,20,.26);backdrop-filter:blur(4px);display:flex;justify-content:flex-end}
      .inventoryDrawer{width:min(520px,100vw);height:100%;background:#fff;box-shadow:-18px 0 55px rgba(0,0,0,.18);display:flex;flex-direction:column;animation:inventoryDrawerIn .24s ease-out}
      @keyframes inventoryDrawerIn{from{transform:translateX(18px);opacity:.5}to{transform:translateX(0);opacity:1}}
      .inventoryDrawerHeader{padding:20px 20px 16px;border-bottom:1px solid #e6e6e0;display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
      .inventoryDrawerHeader h2{margin:3px 0 0;font-size:18px;letter-spacing:-.025em}
      .inventoryClose{width:34px;height:34px;border:1px solid #dfdfd9;background:#fff;border-radius:9px;display:grid;place-items:center;color:#55554f;cursor:pointer}
      .inventoryDrawerStats{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;padding:14px 20px;border-bottom:1px solid #ededE8}
      .inventoryDrawerStats div{padding:11px 12px;border:1px solid #e7e7e1;border-radius:10px;background:#fbfbf8}
      .inventoryDrawerStats span{display:block;color:#7d7d75;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}
      .inventoryDrawerStats strong{display:block;margin-top:6px;font-size:21px;letter-spacing:-.04em}
      .inventoryDrawerStatus{padding:10px 20px 14px;display:flex;justify-content:space-between;align-items:center;gap:12px}
      .inventoryDrawerTabs{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #e5e5df}
      .inventoryDrawerTabs button{height:44px;border:0;background:#fff;border-bottom:2px solid transparent;color:#77776f;font-size:12px;font-weight:850;cursor:pointer}
      .inventoryDrawerTabs button.active{color:#1d1d19;border-bottom-color:#1d1d19}
      .inventoryDrawerBody,.inventoryHistoryList{padding:20px;overflow:auto;display:grid;gap:18px}
      .inventoryAmountBlock{padding:14px;border:1px solid #e3e3dd;border-radius:12px;background:#fbfbf8}
      .inventoryFieldLabel{display:grid;gap:7px}
      .inventoryFieldLabel>span{font-size:11px;font-weight:850;color:#5f5f58;text-transform:uppercase;letter-spacing:.05em}
      .inventoryFieldLabel small{font-size:11px;color:#85857e}
      .inventoryQuickAmounts{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin:12px 0}
      .inventoryQuickAmounts button{height:34px;border:1px solid #deded8;background:#fff;border-radius:8px;font-size:11px;font-weight:800;cursor:pointer;color:#4d4d46}
      .inventoryQuickAmounts button.active{border-color:#1d1d19;background:#1d1d19;color:#fff}
      .inventoryAmountInput{height:46px;width:100%;border:1px solid #dcdcd6;border-radius:10px;padding:0 12px;outline:0;font-size:18px;font-weight:800;background:#fff}
      .inventoryAmountInput:focus{border-color:#1d1d19;box-shadow:0 0 0 3px rgba(29,29,25,.07)}
      .inventoryTwoFields{display:grid;grid-template-columns:1.4fr 1fr;gap:10px}
      .inventoryPreview{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:12px;border-radius:11px;background:#f5f5f0;border:1px solid #e8e8e2}
      .inventoryPreview div{display:flex;justify-content:space-between;gap:10px;font-size:12px}
      .inventoryPreview strong{font-variant-numeric:tabular-nums}
      .inventoryDrawerActions{display:flex;justify-content:flex-end;gap:8px;margin-top:4px;padding-top:8px;border-top:1px solid #ededE8}
      .inventoryHistoryItem{display:grid;grid-template-columns:34px 1fr;gap:10px;align-items:start;padding:12px 0;border-bottom:1px solid #ededE8}
      .inventoryHistoryItem:last-child{border-bottom:0}
      .historyIcon{width:34px;height:34px;border-radius:9px;background:#f4f4ef;display:grid;place-items:center;color:#676760}
      .inventoryHistoryItem strong{display:block;font-size:12px}
      .inventoryHistoryItem .muted{margin-top:4px;font-size:11px}
      @media(max-width:1050px){.inventoryStatsPro{grid-template-columns:repeat(3,1fr)}.inventoryControlBar{align-items:stretch;flex-direction:column}.inventorySearchBox{min-width:0}.inventoryControlGroup{display:flex}.inventoryControlGroup>*{flex:1}}
      @media(max-width:720px){.inventoryPage{padding-top:0}.inventoryHead{align-items:flex-start;flex-direction:column}.inventoryLive{align-self:flex-start}.inventoryStatsPro{grid-template-columns:1fr 1fr}.inventoryStat{min-height:96px}.inventoryControlGroup{flex-direction:column}.inventoryDrawer{width:100vw}.inventoryDrawerStats{grid-template-columns:1fr 1fr 1fr}.inventoryQuickAmounts{grid-template-columns:repeat(3,1fr)}}
    `}</style>
  )
}
