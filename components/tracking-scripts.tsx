'use client'

import Script from 'next/script'
import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useRef } from 'react'
import type { TrackingConfig } from '@/lib/tracking'

function RouteChangePageViews({ config }: { config: TrackingConfig }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const firstRender = useRef(true)

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    try { window.fbq?.('track', 'PageView') } catch {}
    try { window.gtag?.('event', 'page_view', { page_path: `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}` }) } catch {}
    try { window.ttq?.page?.() } catch {}
  }, [pathname, searchParams, config])

  return null
}

export function TrackingScripts({ config }: { config: TrackingConfig }) {
  const { metaPixelId, gaMeasurementId, tiktokPixelId } = config
  const anyConfigured = !!(metaPixelId || gaMeasurementId || tiktokPixelId)
  return <>
    {anyConfigured && <Suspense fallback={null}><RouteChangePageViews config={config} /></Suspense>}
    {metaPixelId && <Script id="meta-pixel" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: `
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${metaPixelId}');
fbq('track','PageView');
` }} />}

    {gaMeasurementId && <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`} strategy="afterInteractive" />
      <Script id="ga4" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: `
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}
gtag('js',new Date());
gtag('config','${gaMeasurementId}');
` }} />
    </>}

    {tiktokPixelId && <Script id="tiktok-pixel" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: `
!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var a=d.createElement("script");a.type="text/javascript",a.async=!0,a.src=i+"?sdkid="+e+"&lib="+t;var s=d.getElementsByTagName("script")[0];s.parentNode.insertBefore(a,s)};
ttq.load('${tiktokPixelId}');
ttq.page();
}(window,document,'ttq');
` }} />}
  </>
}
