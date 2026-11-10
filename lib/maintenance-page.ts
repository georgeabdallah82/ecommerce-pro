// The maintenance page as one self-contained HTML document: the store's name or logo, its main
// colour, one of four modes (maintenance, under construction, coming soon, updating), the owner's
// headline and message, an optional "expected back" note, and WhatsApp / email buttons. Plain HTML
// with inline styles and no scripts, so it works whatever else is broken. It's served with
// 503 + Retry-After so search engines treat the closure as temporary.
import { MAINTENANCE_MODE_INFO, maintenanceMode, type MaintenanceMode } from './maintenance-defaults'

export type MaintenancePageContent = {
  brand: string
  mode?: MaintenanceMode
  logoUrl?: string
  color?: string
  headline: string
  message: string
  backBy?: string
  whatsappUrl?: string
  email?: string
  preview?: boolean
}

// Icons (stroke icons in the style of Lucide, ISC licence), one per mode.
const ICONS: Record<MaintenanceMode, string> = {
  maintenance: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  under_construction: '<path d="m15 12-8.373 8.373a1 1 0 1 1-3-3L12 9"/><path d="m18 15 4-4"/><path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172V7l-2.26-2.26a6 6 0 0 0-4.202-1.756L9 2.96l.92.82A6.18 6.18 0 0 1 12 8.4V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5"/>',
  coming_soon: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  updating: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

function safeColor(value: unknown): string {
  return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : '#d42a2a'
}

function safeUrl(value: unknown, allow: RegExp): string {
  const url = String(value || '').trim()
  return allow.test(url) ? url : ''
}

export function renderMaintenancePage(content: MaintenancePageContent): string {
  const mode = maintenanceMode(content.mode)
  const info = MAINTENANCE_MODE_INFO[mode]
  const color = safeColor(content.color)
  const logo = safeUrl(content.logoUrl, /^(https:\/\/|\/(?!\/))/i)
  const whatsapp = safeUrl(content.whatsappUrl, /^https:\/\/wa\.me\/\d+$/)
  const email = /^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$/.test(String(content.email || '').trim()) ? String(content.email).trim() : ''
  const brand = escapeHtml(content.brand)
  const buttons = [
    whatsapp && `<a class="btn" href="${escapeHtml(whatsapp)}" target="_blank" rel="noopener noreferrer">Message us on WhatsApp</a>`,
    email && `<a class="btn ghost" href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>`,
  ].filter(Boolean).join('')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${brand} | ${escapeHtml(content.headline)}</title>
${logo ? `<link rel="icon" href="${escapeHtml(logo)}">` : ''}
<style>
:root{--accent:${color};--accent-soft:color-mix(in srgb,${color} 12%,transparent);--bg:#f6f4f1;--card:#ffffff;--ink:#111827;--muted:#5b6472;--line:#e7e5e4;--shadow:0 24px 60px rgba(17,24,39,.08)}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0e0f12;--card:#17181c;--ink:#f5f5f4;--muted:#a1a1aa;--line:#2a2b30;--shadow:0 24px 60px rgba(0,0,0,.45)}}
:root[data-theme="dark"]{--bg:#0e0f12;--card:#17181c;--ink:#f5f5f4;--muted:#a1a1aa;--line:#2a2b30;--shadow:0 24px 60px rgba(0,0,0,.45)}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px 16px;background:radial-gradient(900px 500px at 50% -10%,var(--accent-soft),transparent 70%),var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans Arabic",sans-serif;-webkit-font-smoothing:antialiased}
main{width:100%;max-width:560px;background:var(--card);border:1px solid var(--line);border-radius:24px;padding:48px 32px 40px;text-align:center;box-shadow:var(--shadow)}
.brand{display:flex;justify-content:center;align-items:center;min-height:40px;margin-bottom:28px;font-weight:800;font-size:15px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
.brand img{max-height:48px;max-width:220px;width:auto;height:auto}
.badge{display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:999px;background:var(--accent-soft);color:var(--accent);font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:22px}
.dot{width:7px;height:7px;border-radius:50%;background:var(--accent)}
@media (prefers-reduced-motion:no-preference){.dot{animation:pulse 1.8s ease-in-out infinite}@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.8)}}}
.icon{width:72px;height:72px;margin:0 auto 22px;border-radius:20px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--accent-soft),transparent);color:var(--accent);border:1px solid var(--line)}
h1{font-size:clamp(28px,6vw,38px);line-height:1.12;letter-spacing:-.025em;font-weight:800;margin:0 0 14px}
p.msg{font-size:16px;line-height:1.65;color:var(--muted);margin:0 auto 24px;max-width:440px}
.back{display:inline-block;margin:0 0 28px;padding:9px 16px;border-radius:12px;background:var(--bg);border:1px solid var(--line);color:var(--ink);font-weight:600;font-size:14px}
.divider{height:1px;background:var(--line);margin:0 0 26px}
.btns{display:flex;flex-direction:column;gap:10px;align-items:center}
.btn{display:inline-flex;justify-content:center;align-items:center;width:100%;max-width:320px;padding:14px 20px;border-radius:14px;background:var(--accent);color:#fff;text-decoration:none;font-weight:700;font-size:15px;transition:filter .15s ease}
.btn:hover{filter:brightness(1.06)}
.btn.ghost{background:transparent;color:var(--ink);border:1.5px solid var(--line);font-weight:600;word-break:break-all}
.btn.ghost:hover{border-color:var(--accent)}
.foot{margin-top:28px;font-size:13px;color:var(--muted)}
.preview{position:fixed;top:0;left:0;right:0;padding:8px 12px;background:#111827;color:#fff;font-size:13px;text-align:center;z-index:2}
@media (max-width:480px){main{padding:40px 22px 32px;border-radius:20px}}
</style>
</head>
<body>
${content.preview ? '<div class="preview">Preview: maintenance mode is off, customers see your store.</div>' : ''}
<main>
<div class="brand">${logo ? `<img src="${escapeHtml(logo)}" alt="${brand}">` : brand}</div>
<div class="badge"><span class="dot" aria-hidden="true"></span>${escapeHtml(info.badge)}</div>
<div class="icon" aria-hidden="true"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICONS[mode]}</svg></div>
<h1 dir="auto">${escapeHtml(content.headline)}</h1>
<p class="msg" dir="auto">${escapeHtml(content.message)}</p>
${content.backBy ? `<div class="back" dir="auto">${escapeHtml(content.backBy)}</div>` : ''}
${buttons ? `<div class="divider"></div><div class="btns">${buttons}</div>` : ''}
</main>
</body>
</html>`
}
