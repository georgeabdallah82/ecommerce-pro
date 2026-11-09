import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cleanTrackingIds } from '@/lib/tracking'

describe('cleanTrackingIds', () => {
  it('keeps plain IDs', () => {
    assert.deepEqual(cleanTrackingIds({ metaPixelId: ' 123456789012345 ', gaMeasurementId: 'g-abc123xyz', tiktokPixelId: 'cq1abcdefgh2ijklmno0' }), {
      metaPixelId: '123456789012345', gaMeasurementId: 'G-ABC123XYZ', tiktokPixelId: 'CQ1ABCDEFGH2IJKLMNO0', googleAdsId: '', googleAdsPurchaseLabel: '',
    })
  })

  it('keeps the Google Ads tag and picks the conversion label out of Google\'s send_to', () => {
    assert.deepEqual(cleanTrackingIds({ googleAdsId: ' aw-123456789 ', googleAdsPurchaseLabel: 'AW-123456789/AbC-dEf_123' }), {
      metaPixelId: '', gaMeasurementId: '', tiktokPixelId: '', googleAdsId: 'AW-123456789', googleAdsPurchaseLabel: 'AbC-dEf_123',
    })
    assert.equal(cleanTrackingIds({ googleAdsId: 'AW-123456789', googleAdsPurchaseLabel: "x');alert(1)//" }).googleAdsPurchaseLabel, '')
  })

  it('picks the ID out of a pasted install snippet', () => {
    const meta = `<script>!function(f,b,e,v,n,t,s){...}(window, document,'script','https://connect.facebook.net/en_US/fbevents.js');\nfbq('init', '987654321098765');\nfbq('track', 'PageView');</script>`
    const ga = `<script async src="https://www.googletagmanager.com/gtag/js?id=G-Q1W2E3R4T5"></script><script>gtag('config', 'G-Q1W2E3R4T5');</script>`
    const tiktok = `<script>!function (w, d, t) { ... ttq.load('CABC123DEF456GHI789J'); ttq.page(); }(window, document, 'ttq');</script>`
    assert.deepEqual(cleanTrackingIds({ metaPixelId: meta, gaMeasurementId: ga, tiktokPixelId: tiktok }), {
      metaPixelId: '987654321098765', gaMeasurementId: 'G-Q1W2E3R4T5', tiktokPixelId: 'CABC123DEF456GHI789J', googleAdsId: '', googleAdsPurchaseLabel: '',
    })
  })

  it('drops anything that could break out of the script', () => {
    assert.deepEqual(cleanTrackingIds({ metaPixelId: "123');alert(1);//", gaMeasurementId: "x');alert(1)//", tiktokPixelId: "A1B2C3D4'+alert(1)+'" }), {
      metaPixelId: '', gaMeasurementId: '', tiktokPixelId: '', googleAdsId: '', googleAdsPurchaseLabel: '',
    })
  })
})
