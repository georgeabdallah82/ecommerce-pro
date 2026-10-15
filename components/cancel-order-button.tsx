'use client'
import { useState } from 'react'
import { useI18n } from '@/components/lang-provider'
export default function CancelOrderButton({orderNumber}:{orderNumber:string}){
  const { t } = useI18n();const [busy,setBusy]=useState(false);const [error,setError]=useState('');async function cancel(){if(!confirm(t('Cancel this order?')))return;setBusy(true);setError('');try{const r=await fetch(`/api/account/orders/${encodeURIComponent(orderNumber)}/cancel`,{method:'POST'});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(t(d.error||'Unable to cancel order'));window.location.reload()}catch(e){setError(e instanceof Error?e.message:t('Unable to cancel order'));setBusy(false)}}return <div>{error&&<span className="muted" style={{display:'block',fontSize:12,marginBottom:4}}>{error}</span>}<button className="btn secondary" onClick={cancel} disabled={busy}>{busy?t('Cancelling…'):t('Cancel order')}</button></div>}
