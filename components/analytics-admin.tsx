'use client'

import { useEffect, useMemo, useState } from 'react'
import { BarChart3, CalendarDays, RefreshCw, TrendingDown, TrendingUp, Package, Users, ShoppingBag, DollarSign } from 'lucide-react'
import { money } from '@/lib/config'

type Analytics = { periodDays:number; compareDays:number; kpis:any; series:{date:string;revenue:number;orders:number}[]; topProducts:any[]; lowStock:any[] }

const ranges = [{label:'Today',days:1},{label:'7 days',days:7},{label:'30 days',days:30},{label:'90 days',days:90},{label:'12 months',days:365}]

export default function AnalyticsAdmin(){
  const [days,setDays]=useState(30)
  const [data,setData]=useState<Analytics|null>(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const load=async()=>{setLoading(true);setError('');try{const r=await fetch(`/api/admin/analytics?days=${days}&compare=${days}`,{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.error||'Unable to load analytics');setData(d)}catch(e){setError(e instanceof Error?e.message:'Unable to load analytics')}finally{setLoading(false)}}
  useEffect(()=>{load()},[days])
  const maxRevenue=useMemo(()=>Math.max(1,...(data?.series||[]).map(x=>x.revenue)),[data])
  return <div className="analyticsPage">
    <div className="sectionHead catalogHead"><div><span className="muted">ANALYTICS</span><h1 className="h2">Analytics</h1><p className="muted">Understand sales, customers and inventory at a glance.</p></div><div className="inline"><div className="rangeBar">{ranges.map(r=><button key={r.days} className={days===r.days?'active':''} onClick={()=>setDays(r.days)}>{r.label}</button>)}</div><button className="btn secondary" onClick={load} disabled={loading}><RefreshCw size={15}/> Refresh</button></div></div>
    {error&&<div className="alert danger">{error}</div>}
    {loading&&!data?<div className="analyticsLoading"><div className="card skeleton"/><div className="card skeleton"/><div className="card skeleton"/></div>:data&&<>
      <div className="analyticsKpis">
        <Metric icon={<DollarSign size={18}/>} label="Net sales" value={money(data.kpis.revenue)} change={data.kpis.revenueChange}/>
        <Metric icon={<ShoppingBag size={18}/>} label="Orders" value={data.kpis.orders} />
        <Metric icon={<BarChart3 size={18}/>} label="Average order" value={money(data.kpis.averageOrderValue)} />
        <Metric icon={<Package size={18}/>} label="Items sold" value={data.kpis.itemsSold} />
        <Metric icon={<Users size={18}/>} label="New customers" value={data.kpis.newCustomers} />
      </div>
      <div className="analyticsGrid">
        <section className="card analyticsCard"><div className="analyticsCardHead"><div><h3>Sales overview</h3><p className="muted">Revenue by day</p></div><span className="pill">Last {days} days</span></div><div className="chart"><div className="chartBars">{data.series.map(x=><div className="barCol" key={x.date} title={`${x.date}: ${money(x.revenue)}`}><div className="bar" style={{height:`${Math.max(3,Math.round((x.revenue/maxRevenue)*100))}%`}}/><span>{days<=7?x.date.slice(5):''}</span></div>)}</div></div></section>
        <section className="card analyticsCard"><div className="analyticsCardHead"><div><h3>Top products</h3><p className="muted">Best performers by sales</p></div></div><div className="rankList">{!data.topProducts.length?<div className="emptyInline">No sales in this period.</div>:data.topProducts.map((p,i)=><div className="rankRow" key={p.productId}><span className="rank">{i+1}</span><div className="rankInfo"><strong>{p.name}</strong><span className="muted">{p.quantity} units</span></div><strong>{money(p.sales)}</strong></div>)}</div></section>
      </div>
      <div className="analyticsGrid bottom">
        <section className="card analyticsCard"><div className="analyticsCardHead"><div><h3>Inventory watch</h3><p className="muted">Products that need attention</p></div><a className="textLink" href="/admin/inventory">View inventory</a></div>{!data.lowStock.length?<div className="emptyInline">Inventory looks healthy.</div>:<div className="rankList">{data.lowStock.map(x=><div className="rankRow" key={x.id}><div className="rankInfo"><strong>{x.product}</strong><span className="muted">{x.sku}{x.variant?` · ${x.variant}`:''}</span></div><span className={x.available<=0?'statusPill danger':'statusPill warning'}>{x.available} available</span></div>)}</div>}</section>
        <section className="card analyticsCard"><div className="analyticsCardHead"><div><h3>Quick insights</h3><p className="muted">Useful operational signals</p></div></div><div className="insightList"><div><strong>{data.kpis.revenueChange >= 0 ? 'Sales are trending up' : 'Sales are trending down'}</strong><span className="muted">{Math.abs(data.kpis.revenueChange)}% vs previous period</span></div><div><strong>{data.kpis.orders ? Math.round(data.kpis.itemsSold/data.kpis.orders*10)/10 : 0} items</strong><span className="muted">Average items per order</span></div><div><strong>{data.lowStock.length}</strong><span className="muted">Low-stock items to review</span></div></div></section>
      </div>
    </>}
  </div>
}

function Metric({icon,label,value,change}:{icon:React.ReactNode;label:string;value:React.ReactNode;change?:number}){return <div className="card metricCard"><div className="metricIcon">{icon}</div><span className="muted">{label}</span><strong>{value}</strong>{typeof change==='number'&&<small className={change>=0?'metricUp':'metricDown'}>{change>=0?<TrendingUp size={13}/>:<TrendingDown size={13}/>} {Math.abs(change)}% vs previous</small>}</div>}
