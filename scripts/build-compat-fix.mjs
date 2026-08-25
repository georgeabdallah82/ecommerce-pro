import fs from 'node:fs'

function fixFile(path, replacements) {
  if (!fs.existsSync(path)) return false
  let source = fs.readFileSync(path, 'utf8')
  let changed = false
  for (const [bad, good] of replacements) {
    if (source.includes(bad)) {
      source = source.replace(bad, good)
      changed = true
    }
  }
  if (changed) fs.writeFileSync(path, source)
  return changed
}

const themeChanged = fixFile('components/pro-theme-editor.tsx', [
  ['<DesignInspector section={selected} theme={theme} patch={patch}/>', '<DesignInspector section={selected} patch={patch}/>'],
])
console.log(themeChanged ? 'Applied DesignInspector prop compatibility fix' : 'No DesignInspector compatibility fix needed')

const navigationChanged = fixFile('components/store-nav.tsx', [
  [
    '.focalNavInner{height:76px;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:28px}',
    '.focalNavInner{height:76px;display:grid;grid-template-columns:auto auto 1fr;align-items:center;gap:38px}'
  ],
  [
    '.focalNavLinks{display:flex;justify-content:center;gap:24px;height:100%}',
    '.focalNavLinks{display:flex;justify-content:flex-start;gap:30px;height:100%;animation:focalLinksIn .7s cubic-bezier(.22,1,.36,1) .12s both}'
  ],
  [
    '.focalLogo{font-size:22px;font-weight:900;letter-spacing:-.045em;display:flex;align-items:center;background:transparent!important;border:0!important;box-shadow:none!important;padding:0!important}',
    '.focalLogo{font-size:22px;font-weight:900;letter-spacing:-.045em;display:flex;align-items:center;background:transparent!important;border:0!important;box-shadow:none!important;padding:0!important;animation:focalLogoIn .72s cubic-bezier(.22,1,.36,1) .06s both;transition:transform .25s ease,opacity .25s ease}.focalLogo:hover{transform:translateY(-1px) scale(1.015);opacity:.9}'
  ],
  [
    '.focalNav{z-index:50;border-bottom:1px solid var(--focal-line);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}',
    '.focalNav{z-index:50;border-bottom:1px solid var(--focal-line);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);animation:focalNavIn .62s cubic-bezier(.22,1,.36,1) both;transition:background .35s ease,border-color .35s ease,box-shadow .35s ease}'
  ],
  [
    '.focalNavLinks>a,.focalNavItem>a,.focalNavLinkButton{border:0;background:transparent;color:inherit;font-size:13px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:5px;height:100%;padding:0}',
    '.focalNavLinks>a,.focalNavItem>a,.focalNavLinkButton{position:relative;border:0;background:transparent;color:inherit;font-size:13px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:5px;height:100%;padding:0;transition:color .22s ease,transform .22s ease}.focalNavLinks>a:after,.focalNavItem>a:after,.focalNavLinkButton:after{content:"";position:absolute;left:0;right:0;bottom:20px;height:2px;border-radius:99px;background:currentColor;transform:scaleX(0);transform-origin:center;transition:transform .28s cubic-bezier(.22,1,.36,1)}.focalNavLinks>a:hover,.focalNavItem>a:hover,.focalNavLinkButton:hover{transform:translateY(-1px)}.focalNavLinks>a:hover:after,.focalNavItem>a:hover:after,.focalNavLinkButton:hover:after{transform:scaleX(1)}'
  ],
  [
    '.focalMega{position:absolute;top:100%;left:50%;transform:translateX(-50%);width:620px',
    '.focalMega{position:absolute;top:calc(100% + 10px);left:50%;transform:translateX(-50%) translateY(-8px) scale(.98);transform-origin:top center;width:620px'
  ],
  [
    '.focalNavIcon{width:42px;height:42px;border:1px solid var(--focal-line);background:var(--focal-surface);color:var(--focal-ink);border-radius:12px;display:grid;place-items:center;position:relative;cursor:pointer}',
    '.focalNavIcon{width:42px;height:42px;border:1px solid var(--focal-line);background:var(--focal-surface);color:var(--focal-ink);border-radius:12px;display:grid;place-items:center;position:relative;cursor:pointer;transition:transform .22s ease,box-shadow .22s ease,background .22s ease,border-color .22s ease}.focalNavIcon:hover{transform:translateY(-2px) scale(1.025);box-shadow:0 8px 22px rgba(25,21,18,.10)}.focalNavIcon:active{transform:scale(.94)}'
  ],
  [
    '.focalAnnouncementGlobal{background:var(--focal-primary);color:#fff}',
    '.focalAnnouncementGlobal{background:var(--focal-primary);color:#fff;animation:focalAnnouncementIn .55s cubic-bezier(.22,1,.36,1) both}'
  ],
  [
    '.focalSearchOverlay,.focalMobileOverlay,.focalCartOverlay{position:fixed;inset:0;z-index:100;background:rgba(25,21,18,.28);backdrop-filter:blur(8px)}',
    '.focalSearchOverlay,.focalMobileOverlay,.focalCartOverlay{position:fixed;inset:0;z-index:100;background:rgba(25,21,18,.28);backdrop-filter:blur(8px);animation:focalOverlayIn .25s ease both}'
  ],
  [
    '.focalSearchCard{width:min(760px,calc(100% - 24px));margin-top:80px;background:#fff;border-radius:18px;box-shadow:0 28px 80px rgba(0,0,0,.2);padding:20px}',
    '.focalSearchCard{width:min(760px,calc(100% - 24px));margin-top:80px;background:#fff;border-radius:18px;box-shadow:0 28px 80px rgba(0,0,0,.2);padding:20px;animation:focalSearchIn .42s cubic-bezier(.22,1,.36,1) both}'
  ],
  [
    '.focalMobilePanel{margin-left:auto;width:min(390px,88%);height:100%;background:#fff;padding:20px;overflow:auto}',
    '.focalMobilePanel{margin-left:auto;width:min(390px,88%);height:100%;background:#fff;padding:20px;overflow:auto;animation:focalDrawerIn .38s cubic-bezier(.22,1,.36,1) both}'
  ],
  [
    '.focalCartDrawer{width:min(440px,100%);height:100%;background:#fff;display:flex;flex-direction:column;box-shadow:-20px 0 60px rgba(0,0,0,.18)}',
    '.focalCartDrawer{width:min(440px,100%);height:100%;background:#fff;display:flex;flex-direction:column;box-shadow:-20px 0 60px rgba(0,0,0,.18);animation:focalDrawerIn .38s cubic-bezier(.22,1,.36,1) both}'
  ],
  [
    '@media(max-width:600px){.focalNavInner{height:66px}.focalNavIcon{width:38px;height:38px}.focalLogo{font-size:18px}.focalAnnouncementGlobalInner{font-size:11px;min-height:38px}.focalSearchForm{grid-template-columns:1fr}.focalCartItem{grid-template-columns:64px 1fr auto}.focalCartItem img{width:64px;height:76px}}`',
    '@media(max-width:600px){.focalNavInner{height:66px}.focalNavIcon{width:38px;height:38px}.focalLogo{font-size:18px}.focalAnnouncementGlobalInner{font-size:11px;min-height:38px}.focalSearchForm{grid-template-columns:1fr}.focalCartItem{grid-template-columns:64px 1fr auto}.focalCartItem img{width:64px;height:76px}}@keyframes focalAnnouncementIn{from{opacity:0;transform:translateY(-100%)}to{opacity:1;transform:translateY(0)}}@keyframes focalNavIn{from{opacity:0;transform:translateY(-14px)}to{opacity:1;transform:translateY(0)}}@keyframes focalLogoIn{from{opacity:0;transform:translateX(-14px) scale(.98)}to{opacity:1;transform:translateX(0) scale(1)}}@keyframes focalLinksIn{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:translateX(0)}}@keyframes focalOverlayIn{from{opacity:0}to{opacity:1}}@keyframes focalSearchIn{from{opacity:0;transform:translateY(-18px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}@keyframes focalDrawerIn{from{opacity:0;transform:translateX(100%)}to{opacity:1;transform:translateX(0)}}@keyframes focalMegaIn{from{opacity:0;transform:translateX(-50%) translateY(-8px) scale(.98)}to{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}}@media(prefers-reduced-motion:reduce){.focalNav,.focalLogo,.focalNavLinks,.focalAnnouncementGlobal,.focalSearchOverlay,.focalSearchCard,.focalMobilePanel,.focalCartDrawer{animation:none!important}.focalNavLinks>a,.focalNavItem>a,.focalNavLinkButton,.focalNavIcon,.focalLogo{transition:none!important}}`'
  ]
])
console.log(navigationChanged ? 'Applied storefront navigation layout and animation polish' : 'No storefront navigation polish needed')
