'use client'

export default function AdminInventoryVisualStyles() {
  return (
    <style jsx global>{`
      .inventoryPage{min-height:calc(100vh - 100px);padding:4px 0 40px;color:var(--admin-ink)}
      .inventoryHead{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:24px}
      .inventoryHead .h2{font-size:38px;line-height:1.05;letter-spacing:-.045em}
      .inventoryLive{display:inline-flex;align-items:center;gap:8px;padding:9px 13px;border:1px solid var(--admin-border);background:var(--admin-accent-soft);border-radius:999px;font-size:12px;font-weight:800;color:var(--admin-accent-strong);white-space:nowrap}
      .inventoryLiveDot{width:8px;height:8px;border-radius:50%;background:var(--admin-accent);box-shadow:0 0 0 4px var(--admin-accent-soft)}
      .inventoryStatsPro{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:16px}
      .inventoryStat{min-height:112px;padding:18px 20px;border:1px solid var(--admin-border);border-radius:14px;background:var(--admin-surface);display:flex;flex-direction:column;justify-content:space-between;box-shadow:var(--admin-shadow-sm);color:var(--admin-ink)}
      button.inventoryStat{font:inherit;text-align:left;cursor:pointer}
      .inventoryStat.clickable:hover{border-color:var(--admin-muted-soft);transform:translateY(-1px);box-shadow:var(--admin-shadow-md)}
      .inventoryStat.active{border-color:var(--admin-ink);box-shadow:0 0 0 1px var(--admin-ink) inset}
      .inventoryStat.warning.active{border-color:var(--admin-warning);box-shadow:0 0 0 1px var(--admin-warning) inset}
      .inventoryStat.danger.active{border-color:var(--admin-danger);box-shadow:0 0 0 1px var(--admin-danger) inset}
      .inventoryStat span{font-size:11px;font-weight:800;color:var(--admin-muted);text-transform:uppercase;letter-spacing:.06em}
      .inventoryStat strong{font-size:28px;line-height:1;letter-spacing:-.04em;color:var(--admin-ink)}
      .inventoryStat small{font-size:11px;color:var(--admin-muted)}
      .inventoryControlBar{padding:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;background:var(--admin-surface)}
      .inventorySearchBox{height:44px;min-width:320px;flex:1;display:flex;align-items:center;gap:9px;padding:0 12px;border:1px solid var(--admin-border);border-radius:10px;background:var(--admin-surface);color:var(--admin-muted)}
      .inventorySearchBox input{border:0;outline:0;min-width:0;flex:1;background:transparent;color:var(--admin-ink);font-size:13px}
      .inventorySearchClear{width:28px;height:28px;border:0;border-radius:7px;background:var(--admin-border-soft);color:var(--admin-muted);display:grid;place-items:center;cursor:pointer}
      .inventoryControlGroup{display:flex;gap:9px}
      .inventorySelect{height:44px;display:flex;align-items:center;gap:8px;padding:0 11px;border:1px solid var(--admin-border);border-radius:10px;background:var(--admin-surface);color:var(--admin-muted)}
      .inventorySelect select{appearance:none;border:0;outline:0;background:transparent;color:var(--admin-ink);min-width:130px;font-size:13px;font-weight:700;cursor:pointer}
      .inventoryTableShell{overflow:hidden;background:var(--admin-surface)}
      .inventoryTableHeader{min-height:58px;padding:0 18px;display:flex;align-items:center;justify-content:space-between;gap:14px;border-bottom:1px solid var(--admin-border);font-size:12px}
      .inventoryTableHeader strong{font-size:13px;color:var(--admin-ink)}
      .tableWrap{overflow:auto}
      .inventoryTablePro{min-width:900px;border-collapse:separate;border-spacing:0}
      .inventoryTablePro th{background:var(--admin-border-soft);color:var(--admin-muted);font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.06em;padding:12px 14px;border-bottom:1px solid var(--admin-border);white-space:nowrap}
      .inventoryTablePro td{padding:14px;border-bottom:1px solid var(--admin-border-soft);font-size:13px;vertical-align:middle;color:var(--admin-ink)}
      .inventoryTablePro tbody tr:last-child td{border-bottom:0}
      .inventoryRow{cursor:pointer;transition:background .15s ease}
      .inventoryRow:hover{background:var(--admin-border-soft)}
      .num{text-align:right!important;font-variant-numeric:tabular-nums}
      .actionsCol{text-align:right!important}
      .inventoryProductCell{display:flex;align-items:center;gap:11px;min-width:260px}
      .inventoryThumb{width:42px;height:42px;flex:0 0 42px;border:1px solid var(--admin-border);border-radius:9px;background:var(--admin-border-soft);display:grid;place-items:center;overflow:hidden;color:var(--admin-muted)}
      .inventoryThumb img{width:100%;height:100%;object-fit:cover}
      .inventoryProductCell strong{display:block;font-size:13px;line-height:1.25;color:var(--admin-ink)}
      .inventoryProductCell .muted{margin-top:4px;font-size:11px}
      .inventoryLocation{display:inline-flex;align-items:center;gap:5px;white-space:nowrap;font-size:12px;font-weight:700;color:var(--admin-ink-soft)}
      .reservedValue{font-variant-numeric:tabular-nums;color:var(--admin-muted)}
      .inventoryQty{font-variant-numeric:tabular-nums}
      .warningText{color:var(--admin-warning)}
      .dangerText{color:var(--admin-danger)}
      .inventoryStatus{display:inline-flex;align-items:center;gap:5px;padding:5px 9px;border-radius:999px;font-size:11px;font-weight:850;white-space:nowrap}
      .inventoryStatus.success{background:var(--admin-accent-soft);color:var(--admin-accent-strong)}
      .inventoryStatus.warning{background:var(--admin-warning-soft);color:var(--admin-warning)}
      .inventoryStatus.danger{background:var(--admin-danger-soft);color:var(--admin-danger)}
      .inventoryQuick{display:inline-flex;gap:6px}
      .inventoryQuick button{width:30px;height:30px;border:1px solid var(--admin-border);background:var(--admin-surface);border-radius:8px;display:grid;place-items:center;color:var(--admin-ink-soft);cursor:pointer}
      .inventoryQuick button:hover{background:var(--admin-border-soft);border-color:var(--admin-muted-soft)}
      .inventoryQuick button:disabled{opacity:.4;cursor:not-allowed}
      .inventoryEmpty{padding:64px 20px;text-align:center;color:var(--admin-muted)}
      .inventoryEmpty h3{margin:10px 0 5px;color:var(--admin-ink)}
      .inventoryEmpty.compact{padding:44px 20px}
      .inventoryNotice{display:flex;align-items:center;gap:8px;margin-bottom:14px;background:var(--admin-accent-soft);border-color:var(--admin-border);color:var(--admin-accent-strong)}
      .inventoryDrawerOverlay{position:fixed;inset:0;z-index:90;background:rgba(24,24,20,.26);backdrop-filter:blur(4px);display:flex;justify-content:flex-end}
      .inventoryDrawer{width:min(520px,100vw);height:100%;background:var(--admin-surface);box-shadow:-18px 0 55px rgba(0,0,0,.18);display:flex;flex-direction:column;animation:inventoryDrawerIn .24s ease-out;color:var(--admin-ink)}
      @keyframes inventoryDrawerIn{from{transform:translateX(18px);opacity:.5}to{transform:translateX(0);opacity:1}}
      .inventoryDrawerHeader{padding:20px 20px 16px;border-bottom:1px solid var(--admin-border);display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
      .inventoryDrawerHeader h2{margin:3px 0 0;font-size:18px;letter-spacing:-.025em;color:var(--admin-ink)}
      .inventoryClose{width:34px;height:34px;border:1px solid var(--admin-border);background:var(--admin-surface);border-radius:9px;display:grid;place-items:center;color:var(--admin-ink-soft);cursor:pointer}
      .inventoryDrawerStats{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;padding:14px 20px;border-bottom:1px solid var(--admin-border)}
      .inventoryDrawerStats div{padding:11px 12px;border:1px solid var(--admin-border);border-radius:10px;background:var(--admin-border-soft)}
      .inventoryDrawerStats span{display:block;color:var(--admin-muted);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}
      .inventoryDrawerStats strong{display:block;margin-top:6px;font-size:21px;letter-spacing:-.04em;color:var(--admin-ink)}
      .inventoryDrawerStatus{padding:10px 20px 14px;display:flex;justify-content:space-between;align-items:center;gap:12px}
      .inventoryDrawerTabs{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid var(--admin-border)}
      .inventoryDrawerTabs button{height:44px;border:0;background:var(--admin-surface);border-bottom:2px solid transparent;color:var(--admin-muted);font-size:12px;font-weight:850;cursor:pointer}
      .inventoryDrawerTabs button.active{color:var(--admin-ink);border-bottom-color:var(--admin-ink)}
      .inventoryDrawerBody,.inventoryHistoryList{padding:20px;overflow:auto;display:grid;gap:18px}
      .inventoryAmountBlock{padding:14px;border:1px solid var(--admin-border);border-radius:12px;background:var(--admin-border-soft)}
      .inventoryFieldLabel{display:grid;gap:7px}
      .inventoryFieldLabel>span{font-size:11px;font-weight:850;color:var(--admin-muted);text-transform:uppercase;letter-spacing:.05em}
      .inventoryFieldLabel small{font-size:11px;color:var(--admin-muted)}
      .inventoryQuickAmounts{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin:12px 0}
      .inventoryQuickAmounts button{height:34px;border:1px solid var(--admin-border);background:var(--admin-surface);border-radius:8px;font-size:11px;font-weight:800;cursor:pointer;color:var(--admin-ink-soft)}
      .inventoryQuickAmounts button.active{border-color:var(--admin-ink);background:var(--admin-ink);color:var(--admin-bg)}
      .inventoryQuickAmounts button:disabled{opacity:.4;cursor:not-allowed}
      .inventoryAmountInput{height:46px;width:100%;border:1px solid var(--admin-border);border-radius:10px;padding:0 12px;outline:0;font-size:18px;font-weight:800;background:var(--admin-surface);color:var(--admin-ink)}
      .inventoryAmountInput:focus{border-color:var(--admin-accent);box-shadow:0 0 0 3px var(--admin-focus)}
      .inventoryTwoFields{display:grid;grid-template-columns:1.4fr 1fr;gap:10px}
      .inventoryPreview{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:12px;border-radius:11px;background:var(--admin-border-soft);border:1px solid var(--admin-border)}
      .inventoryPreview div{display:flex;justify-content:space-between;gap:10px;font-size:12px}
      .inventoryPreview strong{font-variant-numeric:tabular-nums;color:var(--admin-ink)}
      .inventoryDrawerActions{display:flex;justify-content:flex-end;gap:8px;margin-top:4px;padding-top:8px;border-top:1px solid var(--admin-border)}
      .inventoryHistoryItem{display:grid;grid-template-columns:34px 1fr;gap:10px;align-items:start;padding:12px 0;border-bottom:1px solid var(--admin-border-soft)}
      .inventoryHistoryItem:last-child{border-bottom:0}
      .historyIcon{width:34px;height:34px;border-radius:9px;background:var(--admin-border-soft);display:grid;place-items:center;color:var(--admin-muted)}
      .inventoryHistoryItem strong{display:block;font-size:12px;color:var(--admin-ink)}
      .inventoryHistoryItem .muted{margin-top:4px;font-size:11px}
      @media(max-width:1050px){.inventoryStatsPro{grid-template-columns:repeat(3,1fr)}.inventoryControlBar{align-items:stretch;flex-direction:column}.inventorySearchBox{min-width:0}.inventoryControlGroup{display:flex}.inventoryControlGroup>*{flex:1}}
      @media(max-width:720px){.inventoryPage{padding-top:0}.inventoryHead{align-items:flex-start;flex-direction:column}.inventoryLive{align-self:flex-start}.inventoryStatsPro{grid-template-columns:1fr 1fr}.inventoryStat{min-height:96px}.inventoryControlGroup{flex-direction:column}.inventoryDrawer{width:100vw}.inventoryDrawerStats{grid-template-columns:1fr 1fr 1fr}.inventoryQuickAmounts{grid-template-columns:repeat(3,1fr)}}
    `}</style>
  )
}
