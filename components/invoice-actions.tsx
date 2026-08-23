'use client'

import { useState } from 'react'

export default function InvoiceActions({ orderNumber }: { orderNumber: string }) {
  const [note, setNote] = useState('')
  return <>
    <style dangerouslySetInnerHTML={{ __html: `
      .invoicePage{min-height:100vh;background:#f4f5f5;padding:28px;color:#202223}
      .invoiceToolbar{width:min(900px,100%);margin:0 auto 16px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap}
      .invoiceToolbarActions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .invoiceToolbar button,.invoiceToolbar a{border:1px solid #dfe3e6;background:#fff;border-radius:8px;padding:10px 14px;font:700 12px system-ui;cursor:pointer;text-decoration:none;color:#202223}
      .invoiceNoteInput{width:min(340px,70vw);min-height:38px;border:1px solid #dfe3e6;border-radius:8px;padding:9px 11px;font:500 12px system-ui;background:#fff}
      .invoiceSheet{width:min(900px,100%);margin:0 auto;background:#fff;padding:48px;box-shadow:0 12px 40px rgba(0,0,0,.08);font:14px/1.5 system-ui;color:#202223}
      .invoiceHeader{display:flex;justify-content:space-between;gap:30px;padding-bottom:28px;border-bottom:2px solid #202223}
      .invoiceBrand{font-size:24px;font-weight:900}.invoiceBrand img{max-width:180px;max-height:58px;object-fit:contain}
      .invoiceMuted,.invoiceHeader span,.invoiceMeta span,.invoiceAddresses small,.invoiceNotes small{color:#6d7175;font-size:11px}
      .invoiceMeta{display:grid;grid-template-columns:repeat(3,auto);gap:26px;text-align:right}.invoiceMeta div{display:grid;gap:4px}
      .invoiceAddresses{display:grid;grid-template-columns:1fr 1fr;gap:40px;padding:28px 0}.invoiceAddresses p{white-space:pre-wrap;color:#53575b;margin:6px 0 0}
      .invoiceTable{width:100%;border-collapse:collapse}.invoiceTable th,.invoiceTable td{text-align:left;border-bottom:1px solid #e5e7e9;padding:12px 8px}.invoiceTable th{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#6d7175}.invoiceTable .num{text-align:right}
      .invoiceBottom{display:grid;grid-template-columns:1fr 320px;gap:50px;padding-top:28px}.invoiceNotes{white-space:pre-wrap}.invoiceNotes p{margin:4px 0 18px;color:#53575b}
      .invoiceManualNote{display:none;margin-top:12px;padding-top:12px;border-top:1px solid #e5e7e9;white-space:pre-wrap}.invoiceManualNote.hasNote{display:block}
      .invoiceTotals{display:grid;gap:9px}.invoiceTotals>div{display:flex;justify-content:space-between}.invoiceTotals .grand{border-top:2px solid #202223;padding-top:14px;margin-top:8px;font-size:18px}
      .invoiceFooter{margin-top:45px;padding-top:18px;border-top:1px solid #e5e7e9;display:flex;justify-content:space-between;color:#6d7175;font-size:11px}
      @media(max-width:700px){.invoicePage{padding:10px}.invoiceSheet{padding:24px 18px}.invoiceHeader,.invoiceAddresses,.invoiceBottom{grid-template-columns:1fr;display:grid}.invoiceMeta{text-align:left;grid-template-columns:1fr 1fr}.invoiceTable{font-size:11px}.invoiceTable th:nth-child(2),.invoiceTable td:nth-child(2){display:none}.invoiceFooter{display:grid;gap:6px}.invoiceNoteInput{width:100%;flex:1}}
      @media print{
        @page{size:A4;margin:12mm}
        html,body{background:#fff!important;margin:0!important;padding:0!important}
        body>*:not(.invoicePage){display:none!important}
        .invoicePage{display:block!important;padding:0!important;background:#fff!important;min-height:auto!important}
        .invoiceToolbar{display:none!important}
        .invoiceSheet{width:auto!important;box-shadow:none!important;margin:0!important;padding:0!important}
        .invoiceHeader{border-bottom:2px solid #000}.invoicePage{color:#000!important}
        .invoiceFooter{break-inside:avoid}.invoiceTable tr{break-inside:avoid}.invoiceBottom{break-inside:avoid}
        a{color:inherit!important;text-decoration:none!important}
      }
    ` }} />
    <div className="invoiceToolbar">
      <a href="/admin/orders">← Orders</a>
      <div className="invoiceToolbarActions">
        <input className="invoiceNoteInput" aria-label="Optional invoice note" placeholder="Optional note for this printout…" value={note} onChange={e => {
          const value = e.target.value
          setNote(value)
          const el = document.getElementById('invoiceManualNote')
          if (el) { el.textContent = value.trim() ? `Note\n${value.trim()}` : ''; el.classList.toggle('hasNote', Boolean(value.trim())) }
        }} />
        <button onClick={() => window.print()}>Print / Save PDF</button>
      </div>
    </div>
  </>
}
