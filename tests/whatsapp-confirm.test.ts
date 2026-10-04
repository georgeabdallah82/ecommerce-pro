import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { internationalPhone } from '@/lib/phone'
import { whatsappConfirmLink, whatsappConfirmMessage } from '@/lib/whatsapp-confirm'

const fmt = (cents: number, currency: string) => `${currency === 'USD' ? '$' : ''}${(cents / 100).toFixed(2)}`

describe('internationalPhone', () => {
  it('normalises the ways Lebanese numbers are typed', () => {
    for (const typed of ['70 123 456', '070123456', '+961 70 123 456', '00961 70123456', '961 070 123456']) assert.equal(internationalPhone(typed, 'Lebanon'), '96170123456', typed)
    assert.equal(internationalPhone('03/123456', 'Lebanon'), '9613123456')
  })
  it('leaves foreign numbers alone and rejects junk', () => {
    assert.equal(internationalPhone('+33 6 12 34 56 78', 'Lebanon'), '33612345678')
    assert.equal(internationalPhone('12', 'Lebanon'), '')
    assert.equal(internationalPhone('', 'Lebanon'), '')
    assert.equal(internationalPhone('612345678', 'France'), '612345678')
  })
})

describe('WhatsApp order confirmation', () => {
  const order = {
    orderNumber: 'ORD-123', phone: '70 123 456', grandTotal: 5000, currency: 'USD', paymentMethod: 'COD',
    shippingAddressJson: JSON.stringify({ firstName: 'Maya', line1: 'Hamra St', city: 'Beirut' }),
    items: [{ name: 'Baloo tissues', quantity: 2, variant: { name: 'Default Title' } }, { name: 'Soap', quantity: 1, variant: { name: 'Lavender' } }],
  }
  it('writes a ready-to-send message', () => {
    assert.equal(whatsappConfirmMessage(order, 'Yalla Haul', fmt), [
      'Hi Maya, this is Yalla Haul. We received your order #ORD-123:',
      '• 2 × Baloo tissues',
      '• 1 × Soap (Lavender)',
      'Total: $50.00 (cash on delivery)',
      'Delivery to: Hamra St, Beirut',
      '',
      'Can you please confirm the order? Reply YES and we will send it out. Thank you!',
    ].join('\n'))
  })
  it('links to the customer on WhatsApp, or nothing without a phone', () => {
    const link = whatsappConfirmLink(order, 'Yalla Haul', 'Lebanon', fmt)
    assert.ok(link.startsWith('https://wa.me/96170123456?text=Hi%20Maya'))
    assert.equal(whatsappConfirmLink({ ...order, phone: '' }, 'Yalla Haul', 'Lebanon', fmt), '')
  })
})
