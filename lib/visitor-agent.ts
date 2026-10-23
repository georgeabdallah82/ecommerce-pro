// What kind of visitor a browser is, from its User-Agent header (server side: no script needed, and a
// robot that does not run scripts never gets counted either).

export type Agent = { device: 'mobile' | 'tablet' | 'desktop'; browser: string; os: string; bot: boolean }

// Robots, link checkers and tools. Browsers that open links inside an app (Instagram, Facebook,
// TikTok) are real shoppers and are NOT in this list.
const BOT = /bot\b|bot\/|crawl|spider|slurp|headless|lighthouse|pagespeed|pingdom|uptimerobot|statuscake|gtmetrix|facebookexternalhit|facebot|whatsapp\/|telegrambot|preview|curl\/|wget\/|python-|python\/|java\/|go-http|node-fetch|undici|axios|scrapy|httpclient|postman|libwww/i

export function parseAgent(userAgent: string | null | undefined): Agent {
  const ua = String(userAgent || '').slice(0, 400)
  if (!ua.trim() || BOT.test(ua)) return { device: 'desktop', browser: 'Robot', os: 'Other', bot: true }

  const ios = /iPhone|iPad|iPod/i.test(ua)
  const android = /Android/i.test(ua)
  const os = ios ? 'iOS' : android ? 'Android' : /Windows/i.test(ua) ? 'Windows' : /CrOS/i.test(ua) ? 'ChromeOS' : /Mac OS X|Macintosh/i.test(ua) ? 'macOS' : /Linux|X11/i.test(ua) ? 'Linux' : 'Other'

  const tablet = /iPad|Tablet|PlayBook|Silk/i.test(ua) || (android && !/Mobile/i.test(ua))
  const device: Agent['device'] = tablet ? 'tablet' : /Mobi|iPhone|iPod|Android/i.test(ua) ? 'mobile' : 'desktop'

  // Apps that open links in their own browser come first: their User-Agent also says Chrome or Safari.
  const browser = /Instagram/i.test(ua) ? 'Instagram app'
    : /FBAN|FBAV|FB_IAB|FBIOS/i.test(ua) ? 'Facebook app'
    : /musical_ly|BytedanceWebview|TikTok/i.test(ua) ? 'TikTok app'
    : /Snapchat/i.test(ua) ? 'Snapchat app'
    : /EdgA?\/|EdgiOS|Edge\//i.test(ua) ? 'Edge'
    : /SamsungBrowser/i.test(ua) ? 'Samsung Internet'
    : /OPR\/|OPT\/|Opera/i.test(ua) ? 'Opera'
    : /Firefox|FxiOS/i.test(ua) ? 'Firefox'
    : /; wv\)/i.test(ua) ? 'In-app browser'
    : /Chrome|CriOS|Chromium/i.test(ua) ? 'Chrome'
    : /Safari/i.test(ua) ? 'Safari'
    : 'Other'
  return { device, browser, os, bot: false }
}

// "iPhone, Safari" style line for the report.
export function agentLabel(a: { device?: string | null; browser?: string | null; os?: string | null }) {
  const device = a.os === 'iOS' ? (a.device === 'tablet' ? 'iPad' : 'iPhone') : a.os === 'Android' ? (a.device === 'tablet' ? 'Android tablet' : 'Android phone') : a.device === 'tablet' ? 'Tablet' : a.device === 'mobile' ? 'Phone' : a.os && a.os !== 'Other' ? a.os : 'Computer'
  const browser = a.browser && a.browser !== 'Other' ? a.browser : ''
  return browser ? `${device}, ${browser}` : device
}
