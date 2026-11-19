'use client'

import Script from 'next/script'
import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useRef } from 'react'
import type { TrackingConfig } from '@/lib/tracking'
import { trackPageView } from '@/lib/tracking-events'

function RouteChangePageViews({ config }: { config: TrackingConfig }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // The pixel snippets already count the page they load on, so only a change of address is
  // reported -- comparing addresses (not "first render") keeps this right even when React runs
  // the effect twice.
  const lastPage = useRef<string | null>(null)

  useEffect(() => {
    const page = `${pathname}?${searchParams.toString()}`
    if (lastPage.current === null || lastPage.current === page) { lastPage.current = page; return }
    lastPage.current = page
    // TikTok and Meta are told about in-site page changes here; GA4 (enhanced measurement) counts them on its own.
    // Meta's own counting of address changes is off (fbq.disablePushState), so each page change is sent once, with
    // an id its server copy shares and Meta matches (lib/tracking-events.ts).
    try { window.ttq?.page?.() } catch {}
    trackPageView()
  }, [pathname, searchParams, config])

  return null
}

export function TrackingScripts({ config, nonce }: { config: TrackingConfig; nonce?: string }) {
  const { metaPixelId, gaMeasurementId, tiktokPixelId, googleAdsId, googleAdsPurchaseLabel } = config
  const anyConfigured = !!(metaPixelId || gaMeasurementId || tiktokPixelId || googleAdsId)
  // The purchase conversion target (AW-id/label), read by trackPurchase in lib/tracking-events.ts.
  const adsSendTo = googleAdsId && googleAdsPurchaseLabel ? `${googleAdsId}/${googleAdsPurchaseLabel}` : ''
  return <>
    {anyConfigured && <Suspense fallback={null}><RouteChangePageViews config={config} /></Suspense>}
    {metaPixelId && <Script id="meta-pixel" strategy="afterInteractive" nonce={nonce} dangerouslySetInnerHTML={{ __html: `
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
window.__metaPixelId='${metaPixelId}';
fbq.disablePushState=true;
fbq('init','${metaPixelId}');
var pv='pageview-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
fbq('track','PageView',{},{eventID:pv});
try{fetch('/api/analytics/meta',{method:'POST',headers:{'content-type':'application/json'},keepalive:true,body:JSON.stringify({name:'PageView',eventId:pv,url:location.href})})}catch(e){}
` }} />}

    {(gaMeasurementId || googleAdsId) && <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId || googleAdsId}`} strategy="afterInteractive" nonce={nonce} />
      <Script id="ga4" strategy="afterInteractive" nonce={nonce} dangerouslySetInnerHTML={{ __html: `
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}
gtag('js',new Date());
${gaMeasurementId ? `gtag('config','${gaMeasurementId}');` : ''}
${googleAdsId ? `gtag('config','${googleAdsId}');` : ''}
${adsSendTo ? `window.__googleAdsSendTo='${adsSendTo}';` : ''}
` }} />
    </>}

    {tiktokPixelId && <Script id="tiktok-pixel" strategy="afterInteractive" nonce={nonce} dangerouslySetInnerHTML={{ __html: `
!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var a=d.createElement("script");a.type="text/javascript",a.async=!0,a.src=i+"?sdkid="+e+"&lib="+t;var s=d.getElementsByTagName("script")[0];s.parentNode.insertBefore(a,s)};
ttq.load('${tiktokPixelId}');
ttq.page();
}(window,document,'ttq');
` }} />}
  </>
}
