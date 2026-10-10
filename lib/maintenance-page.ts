// The maintenance page as one self-contained HTML document: the store's name or logo, its main
// colour, the owner's headline and message, an optional "expected back" note, and WhatsApp /
// email buttons. Plain HTML with inline styles and no scripts, so it works whatever else is
// broken, and it's served with 503 + Retry-After so search engines treat the closure as temporary.

export type MaintenancePageContent = {
  brand: string
  logoUrl?: string
  color?: string
  headline: string
  message: string
  backBy?: string
  whatsappUrl?: string
  email?: string
  preview?: boolean
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
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px;background:#faf7f4;color:#171717;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans Arabic",sans-serif}
main{width:100%;max-width:520px;background:#fff;border-radius:22px;padding:40px 28px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.06)}
.brand{display:flex;justify-content:center;align-items:center;min-height:44px;margin-bottom:26px;font-weight:900;font-size:22px;letter-spacing:.04em;text-transform:uppercase;color:${color}}
.brand img{max-height:52px;max-width:220px;width:auto;height:auto}
.icon{width:64px;height:64px;margin:0 auto 18px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:${color}14;color:${color}}
h1{font-size:clamp(26px,6vw,34px);line-height:1.15;letter-spacing:-.02em;margin:0 0 12px}
p{font-size:16px;line-height:1.6;color:#52525b;margin:0 auto 22px;max-width:420px}
.back{display:inline-block;margin:0 0 26px;padding:8px 14px;border-radius:999px;background:${color}14;color:${color};font-weight:700;font-size:14px}
.btns{display:flex;flex-direction:column;gap:10px;align-items:center}
.btn{display:inline-flex;justify-content:center;width:100%;max-width:300px;padding:13px 20px;border-radius:12px;background:${color};color:#fff;text-decoration:none;font-weight:700;font-size:15px}
.btn.ghost{background:transparent;color:#171717;border:1.5px solid #e4e4e7;font-weight:600;word-break:break-all}
.preview{position:fixed;top:0;left:0;right:0;padding:8px 12px;background:#171717;color:#fff;font-size:13px;text-align:center}
</style>
</head>
<body>
${content.preview ? '<div class="preview">Preview: maintenance mode is off, customers see your store.</div>' : ''}
<main>
<div class="brand">${logo ? `<img src="${escapeHtml(logo)}" alt="${brand}">` : brand}</div>
<div class="icon" aria-hidden="true"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg></div>
<h1 dir="auto">${escapeHtml(content.headline)}</h1>
<p dir="auto">${escapeHtml(content.message)}</p>
${content.backBy ? `<div class="back" dir="auto">${escapeHtml(content.backBy)}</div>` : ''}
${buttons ? `<div class="btns">${buttons}</div>` : ''}
</main>
</body>
</html>`
}
