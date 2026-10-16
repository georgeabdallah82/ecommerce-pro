import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { customerOrderMessage, whatsappMessageLink } from '@/lib/order-whatsapp'
import { translate } from '@/lib/i18n'

const order = { storeName: 'Yalla Haul', orderNumber: '1001', items: [{ name: 'Tissue box', quantity: 2 }, { name: 'Soap', quantity: 1 }], total: '$14.50', paymentLabel: 'cash on delivery', name: 'Rana Haddad', place: 'Beirut, Hamra' }
const en = (text: string, vars?: Record<string, string | number>) => translate('en', text, vars)

describe('"Send my order on WhatsApp" message', () => {
  it('says which order, what is in it, the total and where it goes', () => {
    assert.equal(customerOrderMessage(order, en), [
      'Hello Yalla Haul! I just placed order #1001.', '', '• 2 × Tissue box', '• 1 × Soap', '',
      'Total: $14.50 (cash on delivery)', 'Name: Rana Haddad', 'Delivery to: Beirut, Hamra',
    ].join('\n'))
  })
  it('keeps long orders short and is sent to the store number', () => {
    const many = { ...order, items: Array.from({ length: 20 }, (_, i) => ({ name: `Item ${i}`, quantity: 1 })) }
    assert.match(customerOrderMessage(many, en), /\+ 5 more/)
    assert.equal(whatsappMessageLink('96170123456', 'Hi #1001'), 'https://wa.me/96170123456?text=Hi%20%231001')
    assert.equal(whatsappMessageLink('', 'Hi'), '')
  })
  it('is written in Arabic for Arabic shoppers', () => {
    const ar = (text: string, vars?: Record<string, string | number>) => translate('ar', text, vars)
    assert.match(customerOrderMessage(order, ar), /^مرحباً Yalla Haul! /)
  })
})
