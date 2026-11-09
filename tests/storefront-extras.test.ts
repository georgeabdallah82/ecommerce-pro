import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cleanSearchText } from '@/lib/search-analytics'
import { cleanWholesaleInput, escapeHtml, wholesaleEmail } from '@/lib/wholesale'
import { parseStores, telHref } from '@/lib/stores'
import { parseSizeGuide } from '@/lib/size-guide'

describe('search text', () => {
  it('groups searches: lower case, single spaces, short', () => {
    assert.equal(cleanSearchText('  Soap   BAR  '), 'soap bar')
    assert.equal(cleanSearchText('x'.repeat(200)).length, 80)
  })
})

describe('wholesale form', () => {
  const good = { businessName: ' Beirut Mini Market ', contactName: 'Layla', email: 'Buyer@Shop.LB ', phone: '+961 70 123 456', city: 'Beirut', interest: 'Soap, towels', message: '' }
  it('accepts a complete inquiry and tidies it', () => {
    const r = cleanWholesaleInput(good)
    assert.ok('data' in r)
    if ('data' in r) {
      assert.equal(r.data.businessName, 'Beirut Mini Market')
      assert.equal(r.data.email, 'buyer@shop.lb')
    }
  })
  it('refuses a bad email, a bad phone and a missing business', () => {
    assert.deepEqual(cleanWholesaleInput({ ...good, email: 'nope' }), { error: 'Enter a valid email address' })
    assert.deepEqual(cleanWholesaleInput({ ...good, phone: 'call me' }), { error: 'Enter a phone number we can call or message' })
    assert.deepEqual(cleanWholesaleInput({ ...good, businessName: ' ' }), { error: 'Tell us the business name' })
    assert.ok('error' in cleanWholesaleInput(null))
  })
  it('escapes what the store email shows', () => {
    assert.equal(escapeHtml('<b>"x" & \'y\'</b>'), '&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;')
    const mail = wholesaleEmail({ ...good, businessName: '<script>x</script>', message: '' })
    assert.ok(!mail.html.includes('<script>'))
    assert.equal(mail.subject, 'Wholesale inquiry: <script>x</script>')
    assert.ok(!mail.text.includes('Message:'), 'an empty field is left out')
  })
})

describe('our stores', () => {
  it('reads one store per line and skips blanks', () => {
    const rows = parseStores('Main shop | Hamra St 12 | Mon-Sat 9-8 | +961 1 234 567\n\n  | no name\nWarehouse | Dekwaneh')
    assert.deepEqual(rows, [
      { name: 'Main shop', address: 'Hamra St 12', hours: 'Mon-Sat 9-8', phone: '+961 1 234 567' },
      { name: 'Warehouse', address: 'Dekwaneh', hours: '', phone: '' },
    ])
    assert.deepEqual(parseStores(null), [])
  })
  it('makes a phone link only from a real number', () => {
    assert.equal(telHref('+961 (1) 234-567'), 'tel:+9611234567')
    assert.equal(telHref('call us'), '')
  })
})

describe('size guide', () => {
  it('reads the header and the sizes, padding short rows', () => {
    assert.deepEqual(parseSizeGuide('Size | Chest (cm) | Length (cm)\nS | 88-92 | 68\nM | 96-100'), {
      header: ['Size', 'Chest (cm)', 'Length (cm)'],
      rows: [['S', '88-92', '68'], ['M', '96-100', '']],
    })
  })
  it('shows nothing without a header and at least one size', () => {
    assert.equal(parseSizeGuide(''), null)
    assert.equal(parseSizeGuide('Size | Chest'), null)
    assert.equal(parseSizeGuide('just text'), null)
  })
})
