'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { formatAdminDateTime } from '@/lib/admin-datetime'
import ui from './admin-ui.module.css'
import styles from './admin-website-status.module.css'

const INTERVAL_MS = 60_000

// Refresh button plus a "live" switch: while on, every card re-checks its service once a minute.
// Each refresh re-runs the server checks in place (no full page reload), and the stamp shows when
// the cards were last updated, in the store's timezone.
export default function WebsiteStatusLive({ timezone }: { timezone: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [live, setLive] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<string>(() => new Date().toISOString())

  function refresh() {
    startTransition(() => {
      router.refresh()
      setUpdatedAt(new Date().toISOString())
    })
  }

  useEffect(() => {
    if (!live) return
    const timer = setInterval(() => { if (document.visibilityState === 'visible') refresh() }, INTERVAL_MS)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live])

  return <div className={styles.live}>
    <label className={styles.liveSwitch}>
      <input type="checkbox" checked={live} onChange={e => setLive(e.target.checked)} />
      <span>Live</span>
    </label>
    <span className={styles.stamp} aria-live="polite">{pending ? 'Updating…' : `Updated ${formatAdminDateTime(updatedAt, timezone)}`}</span>
    <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={refresh} disabled={pending}>
      <RefreshCw size={15} aria-hidden="true" className={pending ? styles.spin : undefined} /> Refresh
    </button>
  </div>
}
