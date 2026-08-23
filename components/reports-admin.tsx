'use client'

import { useEffect, useState } from 'react'
import { money } from '@/lib/config'

export default function ReportsAdmin() {
  const [r, setR] = useState<any>(null)
  const [e, setE] = useState('')

  useEffect(() => {
    fetch('/api/admin/reports?days=30').then(x => x.json()).then(x => x.error ? setE(x.error) : setR(x)).catch(() => setE('Unable to load reports'))
  }, [])

  return <div>
    <div className="sectionHead"><div><span className="muted">ANALYTICS</span><h1 className="h2">Reports</h1><p className="muted">Last {r?.periodDays || 30} days</p></div></div>
    {e && <div className="alert danger">{e}</div>}
    {r && <>
      <div className="grid stats">
        <div className="card stat"><span className="muted">Revenue</span><strong>{money(r.revenue)}</strong></div>
        <div className="card stat"><span className="muted">Orders</span><strong>{r.orders}</strong></div>
        <div className="card stat"><span className="muted">Avg. order</span><strong>{money(r.averageOrderValue)}</strong></div>
        <div className="card stat"><span className="muted">New customers</span><strong>{r.newCustomers}</strong></div>
      </div>
      <div className="grid" style={{ marginTop: 16 }}>
        <div className="card adminPanel"><h3>Sales</h3><p className="muted">Items sold: {r.itemsSold}</p><p className="muted">Sales value: {money(r.salesValue)}</p></div>
        <div className="card adminPanel"><h3>Low stock</h3>{r.lowStock.length === 0 ? <p className="muted">No low-stock items.</p> : <table className="table"><thead><tr><th>Product</th><th>Available</th><th>Threshold</th></tr></thead><tbody>{r.lowStock.slice(0, 20).map((p:any) => <tr key={`${p.productId}:${p.variant || ''}`}><td>{p.product}{p.variant ? ` — ${p.variant}` : ''}</td><td>{p.available}</td><td>{p.threshold}</td></tr>)}</tbody></table>}</div>
      </div>
    </>}
  </div>
}
