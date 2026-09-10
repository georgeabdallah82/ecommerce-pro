'use client'

import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'admin.theme'

type Theme = 'light' | 'dark'

function applyTheme(theme: Theme) {
  document.documentElement.dataset.adminTheme = theme
  document.documentElement.style.colorScheme = theme
}

export default function AdminThemeToggle({ compact }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    const initial: Theme = saved === 'dark' ? 'dark' : 'light'
    setTheme(initial)
    applyTheme(initial)
    const sync = () => {
      const next: Theme = window.localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light'
      setTheme(next)
      applyTheme(next)
    }
    const onStorage = (event: StorageEvent) => { if (event.key === STORAGE_KEY) sync() }
    window.addEventListener('storage', onStorage)
    window.addEventListener('admin-theme-change', sync)
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener('admin-theme-change', sync) }
  }, [])

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    window.localStorage.setItem(STORAGE_KEY, next)
    applyTheme(next)
    window.dispatchEvent(new Event('admin-theme-change'))
  }

  return (
    <>
      <style jsx global>{`
        /* ---------- Dark theme ----------
           Core chrome (the shell box, headings, .muted, .pill) and the nav bar
           itself (components/admin-nav.module.css, driven entirely by the same
           --admin-* custom properties) both flip automatically under this same
           [data-admin-theme='dark'] selector - no need to duplicate it here.
           Same goes for every page migrated onto a CSS Module (components/admin-
           *.module.css): those consume the --admin-* tokens directly via var(),
           so they need no entry in this file either. .opsCard, .healthCheck and
           .healthHero/.healthTimestamp/.opsLoading used to need hardcoded patches
           here because they were still bare, unmigrated classnames when this file
           was written; #74 has since moved them onto admin-operations-hub.module.css
           and admin-system-health.module.css, so those entries were removed. */

        /* Shared surfaces */
        html[data-admin-theme='dark'] body:has(.adminShell) .card,
        html[data-admin-theme='dark'] body:has(.adminShell) .productTableCard,
        html[data-admin-theme='dark'] body:has(.adminShell) .statCard,
        html[data-admin-theme='dark'] body:has(.adminShell) .orderCard,
        html[data-admin-theme='dark'] body:has(.adminShell) .summaryCard,
        html[data-admin-theme='dark'] body:has(.adminShell) .successCard,
        html[data-admin-theme='dark'] body:has(.adminShell) .adminPanel{background:#191c1a!important;border-color:#2b302c!important;color:#e9edea!important;box-shadow:0 10px 28px rgba(0,0,0,.22)!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .table,
        html[data-admin-theme='dark'] body:has(.adminShell) .catalogPagination{background:#191c1a!important;color:#e9edea!important;border-color:#2b302c!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .table th{background:#202421!important;color:#9ea8a1!important;border-color:#303631!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .table td{color:#e1e6e2!important;border-color:#2b302c!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .table tbody tr:hover{background:#202421!important}

        /* Forms */
        html[data-admin-theme='dark'] body:has(.adminShell) .input,
        html[data-admin-theme='dark'] body:has(.adminShell) .textarea,
        html[data-admin-theme='dark'] body:has(.adminShell) select,
        html[data-admin-theme='dark'] body:has(.adminShell) .productSearch{background:#151817!important;color:#eef2ef!important;border-color:#343a36!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .input::placeholder,
        html[data-admin-theme='dark'] body:has(.adminShell) .textarea::placeholder{color:#707a73!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .input:focus,
        html[data-admin-theme='dark'] body:has(.adminShell) .textarea:focus,
        html[data-admin-theme='dark'] body:has(.adminShell) select:focus{border-color:#6d8878!important;box-shadow:0 0 0 3px rgba(102,194,146,.12)!important}

        /* Product / orders / inventory */
        html[data-admin-theme='dark'] body:has(.adminShell) .opsTabs button.active{background:#f0f3f1!important;color:#171918!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .orderViews button{color:#e7ece8!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .orderViews button:hover{background:#262b28!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .confirmBox{background:#202421!important;border-color:#343a36!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .orderViews button.active{background:#f0f3f1!important;color:#171918!important}

        /* Empty/error states and live map */
        html[data-admin-theme='dark'] body:has(.adminShell) .empty{background:#191c1a!important;border-color:#3a413c!important;color:#9fa8a1!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .empty strong{color:#eef2ef!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .leaflet-control-attribution{background:rgba(25,28,26,.9)!important;color:#c7cec9!important}
      `}</style>
      <button type="button" className="adminThemeToggle" data-compact={compact ? 'true' : undefined} onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
      </button>
      <style jsx>{`
        .adminThemeToggle{width:100%;display:flex;align-items:center;gap:9px;height:40px;padding:0 11px;border:1px solid var(--admin-border);border-radius:10px;background:var(--admin-surface);color:var(--admin-ink-soft);font-size:12px;font-weight:800;cursor:pointer;transition:.16s ease;box-sizing:border-box}
        .adminThemeToggle:hover{background:var(--admin-border-soft);color:var(--admin-ink)}
        .adminThemeToggle[data-compact='true']{width:38px;min-width:38px;height:38px;padding:0;justify-content:center;gap:0}
        .adminThemeToggle[data-compact='true'] span{display:none}
        @media(max-width:560px){.adminThemeToggle[data-compact='true']{width:36px;min-width:36px;height:36px}}
      `}</style>
    </>
  )
}
