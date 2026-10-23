import test from 'node:test'
import assert from 'node:assert/strict'
import { agentLabel, parseAgent } from '../lib/visitor-agent'

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  iphoneInstagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21E236 Instagram 330.0.0.10.101 (iPhone14,5; iOS 17_4; en_US; en; scale=3.00; 1170x2532; 570108220)',
  androidChrome: 'Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  androidFacebook: 'Mozilla/5.0 (Linux; Android 13; SM-S918B Build/TP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/450.0.0.38.108;]',
  androidWebview: 'Mozilla/5.0 (Linux; Android 12; moto g; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/110.0.0.0 Mobile Safari/537.36',
  androidTablet: 'Mozilla/5.0 (Linux; Android 12; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  windowsEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  firefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
  samsung: 'Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36',
  tiktok: 'Mozilla/5.0 (Linux; Android 13; Pixel 6 Build/TQ3A) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 musical_ly_2023105030 BytedanceWebview/d8a21c6',
}

test('phones, tablets and computers', () => {
  assert.equal(parseAgent(UA.iphoneSafari).device, 'mobile')
  assert.equal(parseAgent(UA.androidChrome).device, 'mobile')
  assert.equal(parseAgent(UA.androidTablet).device, 'tablet')
  assert.equal(parseAgent(UA.ipad).device, 'tablet')
  assert.equal(parseAgent(UA.windowsEdge).device, 'desktop')
  assert.equal(parseAgent(UA.macSafari).device, 'desktop')
})

test('operating systems', () => {
  assert.equal(parseAgent(UA.iphoneSafari).os, 'iOS')
  assert.equal(parseAgent(UA.ipad).os, 'iOS')
  assert.equal(parseAgent(UA.androidChrome).os, 'Android')
  assert.equal(parseAgent(UA.windowsEdge).os, 'Windows')
  assert.equal(parseAgent(UA.macChrome).os, 'macOS')
  assert.equal(parseAgent(UA.firefox).os, 'Linux')
})

test('browsers, and apps that open links inside themselves (Instagram, Facebook, TikTok) are named as such', () => {
  assert.equal(parseAgent(UA.iphoneSafari).browser, 'Safari')
  assert.equal(parseAgent(UA.macSafari).browser, 'Safari')
  assert.equal(parseAgent(UA.androidChrome).browser, 'Chrome')
  assert.equal(parseAgent(UA.macChrome).browser, 'Chrome')
  assert.equal(parseAgent(UA.windowsEdge).browser, 'Edge')
  assert.equal(parseAgent(UA.firefox).browser, 'Firefox')
  assert.equal(parseAgent(UA.samsung).browser, 'Samsung Internet')
  assert.equal(parseAgent(UA.iphoneInstagram).browser, 'Instagram app')
  assert.equal(parseAgent(UA.androidFacebook).browser, 'Facebook app')
  assert.equal(parseAgent(UA.tiktok).browser, 'TikTok app')
  assert.equal(parseAgent(UA.androidWebview).browser, 'In-app browser')
})

test('real shoppers are never mistaken for robots, including those inside social apps', () => {
  for (const [name, ua] of Object.entries(UA)) assert.equal(parseAgent(ua).bot, false, name)
})

test('robots, link checkers and tools are recognised', () => {
  const bots = [
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1) Chrome/124.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 11; moto g power) Chrome-Lighthouse',
    'curl/8.5.0', 'Wget/1.21', 'python-requests/2.31', 'node-fetch/1.0', 'UptimeRobot/2.0', 'WhatsApp/2.23.20.0', 'TelegramBot (like TwitterBot)', 'Pingdom.com_bot_version_1.4',
    '', '   ', undefined, null,
  ]
  for (const ua of bots) assert.equal(parseAgent(ua as string).bot, true, String(ua))
})

test('the report names a device in plain words', () => {
  assert.equal(agentLabel({ device: 'mobile', browser: 'Safari', os: 'iOS' }), 'iPhone, Safari')
  assert.equal(agentLabel({ device: 'tablet', browser: 'Safari', os: 'iOS' }), 'iPad, Safari')
  assert.equal(agentLabel({ device: 'mobile', browser: 'Chrome', os: 'Android' }), 'Android phone, Chrome')
  assert.equal(agentLabel({ device: 'tablet', browser: 'Chrome', os: 'Android' }), 'Android tablet, Chrome')
  assert.equal(agentLabel({ device: 'desktop', browser: 'Edge', os: 'Windows' }), 'Windows, Edge')
  assert.equal(agentLabel({ device: 'mobile', browser: 'Instagram app', os: 'iOS' }), 'iPhone, Instagram app')
  assert.equal(agentLabel({ device: 'desktop', browser: 'Other', os: 'Other' }), 'Computer')
  assert.equal(agentLabel({}), 'Computer')
})
