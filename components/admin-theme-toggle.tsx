'use client'

import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'admin.theme'

type Theme = 'light' | 'dark'

function applyTheme(theme: Theme) {
  document.documentElement.dataset.adminTheme = theme
  document.documentElement.style.colorScheme = theme
}

export default function AdminThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    const initial: Theme = saved === 'dark' ? 'dark' : 'light'
    setTheme(initial)
    applyTheme(initial)
  }, [])

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    window.localStorage.setItem(STORAGE_KEY, next)
    applyTheme(next)
  }

  return (
    <>
      <style jsx global>{`
        /* Admin dark theme */
        html[data-admin-theme='dark'] body:has(.adminShell){background:#101211!important;color:#f2f5f3!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .adminShell{background:#101211!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .adminSide{background:#161918!important;border-color:#292e2b!important;color:#f2f4f2!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .adminMain{color:#f2f4f2!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .adminTopbar{background:rgba(16,18,17,.9)!important;border-color:#2a2f2c!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .adminTopbar strong,
        html[data-admin-theme='dark'] body:has(.adminShell) .sectionHead .h2,
        html[data-admin-theme='dark'] body:has(.adminShell) .catalogHead .h2,
        html[data-admin-theme='dark'] body:has(.adminShell) .shopifyTitle{color:#f5f7f5!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .muted,
        html[data-admin-theme='dark'] body:has(.adminShell) .tiny,
        html[data-admin-theme='dark'] body:has(.adminShell) .fieldHelp,
        html[data-admin-theme='dark'] body:has(.adminShell) .healthTimestamp{color:#9ba49e!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .pill{background:#202421!important;border-color:#343a36!important;color:#dfe5e1!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .adminNavGroupButton{color:#9fa8a1!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .adminNavGroupButton:hover{background:#202321!important;color:#f4f6f4!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .adminNavGroupButton.active{background:#252a27!important;color:#f4f6f4!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .adminNavItem{color:#aeb6b0!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .adminNavItem:hover{background:#202321!important;color:#f5f7f5!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .adminNavItem.active{background:#2b302d!important;color:#fff!important;box-shadow:inset 3px 0 0 #8fe0b2!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .adminNavSearchWrap{background:#1c201e!important;border-color:#303631!important;color:#9ea8a1!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .adminNavSearchWrap input{color:#eef2ef!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .adminNavSearchWrap input::placeholder{color:#78817a!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .adminNavSearchWrap kbd{background:#232825!important;border-color:#343a36!important;color:#99a29b!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .adminSideBottom a,
        html[data-admin-theme='dark'] body:has(.adminShell) .sideButton{color:#afb7b1!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .adminSideBottom a:hover,
        html[data-admin-theme='dark'] body:has(.adminShell) .sideButton:hover{background:#202321!important;color:#fff!important}

        /* Shared surfaces and workspace containers */
        html[data-admin-theme='dark'] body:has(.adminShell) .card,
        html[data-admin-theme='dark'] body:has(.adminShell) .editorCard,
        html[data-admin-theme='dark'] body:has(.adminShell) .productTableCard,
        html[data-admin-theme='dark'] body:has(.adminShell) .lv-side,
        html[data-admin-theme='dark'] body:has(.adminShell) .lv-detail,
        html[data-admin-theme='dark'] body:has(.adminShell) .lv-stat,
        html[data-admin-theme='dark'] body:has(.adminShell) .opsCard,
        html[data-admin-theme='dark'] body:has(.adminShell) .healthCheck,
        html[data-admin-theme='dark'] body:has(.adminShell) .miniAlert,
        html[data-admin-theme='dark'] body:has(.adminShell) .analyticsCard,
        html[data-admin-theme='dark'] body:has(.adminShell) .settingsCard,
        html[data-admin-theme='dark'] body:has(.adminShell) .statCard,
        html[data-admin-theme='dark'] body:has(.adminShell) .orderCard,
        html[data-admin-theme='dark'] body:has(.adminShell) .summaryCard,
        html[data-admin-theme='dark'] body:has(.adminShell) .metricCard,
        html[data-admin-theme='dark'] body:has(.adminShell) .rangeBar,
        html[data-admin-theme='dark'] body:has(.adminShell) .chart,
        html[data-admin-theme='dark'] body:has(.adminShell) .healthHero,
        html[data-admin-theme='dark'] body:has(.adminShell) .successCard,
        html[data-admin-theme='dark'] body:has(.adminShell) .adminPanel,
        html[data-admin-theme='dark'] body:has(.adminShell) .shopifyViewBar,
        html[data-admin-theme='dark'] body:has(.adminShell) .shopifyFilterBar,
        html[data-admin-theme='dark'] body:has(.adminShell) .shopifyBulkBar,
        html[data-admin-theme='dark'] body:has(.adminShell) .shopifyTableCard,
        html[data-admin-theme='dark'] body:has(.adminShell) .shopifyMenu,
        html[data-admin-theme='dark'] body:has(.adminShell) .shopifyActionMenu,
        html[data-admin-theme='dark'] body:has(.adminShell) .shopifyChannel{background:#191c1a!important;border-color:#2b302c!important;color:#e9edea!important;box-shadow:0 10px 28px rgba(0,0,0,.22)!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .table,
        html[data-admin-theme='dark'] body:has(.adminShell) .tableTopline,
        html[data-admin-theme='dark'] body:has(.adminShell) .catalogPagination,
        html[data-admin-theme='dark'] body:has(.adminShell) .editorTopbar,
        html[data-admin-theme='dark'] body:has(.adminShell) .editorTabs,
        html[data-admin-theme='dark'] body:has(.adminShell) .editorCardHead,
        html[data-admin-theme='dark'] body:has(.adminShell) .editorCardBody{background:#191c1a!important;color:#e9edea!important;border-color:#2b302c!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .table th{background:#202421!important;color:#9ea8a1!important;border-color:#303631!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .table td{color:#e1e6e2!important;border-color:#2b302c!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .table tbody tr:hover{background:#202421!important}

        /* Forms and controls */
        html[data-admin-theme='dark'] body:has(.adminShell) .input,
        html[data-admin-theme='dark'] body:has(.adminShell) .textarea,
        html[data-admin-theme='dark'] body:has(.adminShell) select,
        html[data-admin-theme='dark'] body:has(.adminShell) .productSearch,
        html[data-admin-theme='dark'] body:has(.adminShell) .shopifySearch,
        html[data-admin-theme='dark'] body:has(.adminShell) .lv-search input{background:#151817!important;color:#eef2ef!important;border-color:#343a36!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .input::placeholder,
        html[data-admin-theme='dark'] body:has(.adminShell) .textarea::placeholder,
        html[data-admin-theme='dark'] body:has(.adminShell) .shopifySearch input::placeholder{color:#707a73!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .input:focus,
        html[data-admin-theme='dark'] body:has(.adminShell) .textarea:focus,
        html[data-admin-theme='dark'] body:has(.adminShell) select:focus,
        html[data-admin-theme='dark'] body:has(.adminShell) .shopifySearch:focus-within{border-color:#6d8878!important;box-shadow:0 0 0 3px rgba(102,194,146,.12)!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .btn.secondary,
        html[data-admin-theme='dark'] body:has(.adminShell) .btn.ghost,
        html[data-admin-theme='dark'] body:has(.adminShell) .iconBtn,
        html[data-admin-theme='dark'] body:has(.adminShell) .lv-btn,
        html[data-admin-theme='dark'] body:has(.adminShell) .lv-primary{background:#232724!important;color:#eef2ef!important;border-color:#3b423d!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .iconBtn:hover,
        html[data-admin-theme='dark'] body:has(.adminShell) .lv-btn:hover{background:#2a2f2b!important}

        /* Product catalog */
        html[data-admin-theme='dark'] body:has(.adminShell) .shopifyEyebrow,
        html[data-admin-theme='dark'] body:has(.adminShell) .shopifyCountPill,
        html[data-admin-theme='dark'] body:has(.adminShell) .shopifyView,
        html[data-admin-theme='dark'] body:has(.adminShell) .shopifyProductCell span,
        html[data-admin-theme='dark'] body:has(.adminShell) .shopifyStock span,
        html[data-admin-theme='dark'] body:has(.adminShell) .shopifyTableMeta,
        html[data-admin-theme='dark'] body:has(.adminShell) .shopifyEyebrow{color:#9ca59f!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .shopifyView.active{background:#f0f3f1!important;color:#171918!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .shopifyView.active small{color:#636c66!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .shopifyMenu button{color:#e7ece8!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .shopifyMenu button:hover{background:#262b28!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .shopifyProductCell strong{color:#f1f4f2!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .shopifyThumb{background:#242926!important;color:#9fa8a1!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .shopifyStatus.active{background:#173524!important;color:#a8e5bd!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .shopifyStatus.draft{background:#30312b!important;color:#d6d9d2!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .shopifyStatus.archived{background:#292c2a!important;color:#adb5af!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .shopifyProductTable th{background:#202421!important;color:#9ea8a1!important;border-color:#303631!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .shopifyProductTable td{border-color:#2b302c!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .shopifyProductTable tbody tr:hover{background:#202421!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .shopifyProductTable tbody tr.selectedRow{background:#292e2a!important}

        /* Status and special states */
        html[data-admin-theme='dark'] body:has(.adminShell) .statusPill.active{background:#173524!important;color:#a8e5bd!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .statusPill.draft{background:#3a3118!important;color:#f1d88d!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .statusPill.archived{background:#292c2a!important;color:#adb5af!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .opsTabs,
        html[data-admin-theme='dark'] body:has(.adminShell) .opsTabs button{background:#191c1a!important;color:#adb5af!important;border-color:#2b302c!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .opsTabs button.active{background:#f1f4f2!important;color:#151715!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .empty,
        html[data-admin-theme='dark'] body:has(.adminShell) .opsLoading{background:#191c1a!important;border-color:#3a413c!important;color:#9fa8a1!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .empty strong{color:#eef2ef!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .leaflet-control-attribution{background:rgba(25,28,26,.9)!important;color:#c7cec9!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .lv-map-overlay,
        html[data-admin-theme='dark'] body:has(.adminShell) .lv-map-btn,
        html[data-admin-theme='dark'] body:has(.adminShell) .lv-tooltip{background:rgba(25,28,26,.96)!important;color:#eef2ef!important;border-color:#363d38!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .lv-row{background:#191c1a!important;border-color:#2b302c!important;color:#e7ebe8!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .lv-row:hover{background:#202421!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .lv-row.selected{background:#292e2a!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .lv-avatar,
        html[data-admin-theme='dark'] body:has(.adminShell) .lv-detail-avatar,
        html[data-admin-theme='dark'] body:has(.adminShell) .lv-detail-item{background:#232724!important;color:#eef2ef!important}

        /* Common page-specific areas */
        html[data-admin-theme='dark'] body:has(.adminShell) .filterBar,
        html[data-admin-theme='dark'] body:has(.adminShell) .productToolbar,
        html[data-admin-theme='dark'] body:has(.adminShell) .checkoutForm,
        html[data-admin-theme='dark'] body:has(.adminShell) .reviewForm,
        html[data-admin-theme='dark'] body:has(.adminShell) .purchaseBox{background:#191c1a!important;color:#e9edea!important;border-color:#2b302c!important}
        html[data-admin-theme='dark'] body:has(.adminShell) .orderCard>div,
        html[data-admin-theme='dark'] body:has(.adminShell) .timelineItem,
        html[data-admin-theme='dark'] body:has(.adminShell) .summaryLine{color:#e2e7e3!important;border-color:#2b302c!important}
      `}</style>
      <button type="button" className="adminThemeToggle" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
      </button>
      <style jsx>{`
        .adminThemeToggle{width:100%;display:flex;align-items:center;gap:9px;height:40px;padding:0 11px;border:1px solid #e3e3dd;border-radius:10px;background:#fff;color:#4d4d48;font-size:12px;font-weight:800;cursor:pointer;transition:.16s ease}
        .adminThemeToggle:hover{background:#f4f4f0;color:#171717}
        html[data-admin-theme='dark'] .adminThemeToggle{background:#1f2320;border-color:#343b36;color:#e6ebe7}
        html[data-admin-theme='dark'] .adminThemeToggle:hover{background:#292f2b;color:#fff}
      `}</style>
    </>
  )
}
