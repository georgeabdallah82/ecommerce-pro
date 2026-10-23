import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const read = (path: string) => readFileSync(path, 'utf8')
const KEYS = ['payment.bank.label', 'payment.bank.name', 'payment.bank.accountName', 'payment.bank.iban', 'payment.bank.instructions']

// The owner found no place to type their Whish account: the Payments tab only had switches.
describe('payment details the owner can type', () => {
  it('has a field for each detail on the Payments tab, loaded and saved with the other settings', () => {
    const ui = read('components/settings-center-pro.tsx')
    const page = read('app/admin/settings/page.tsx')
    for (const key of KEYS) {
      assert.ok(page.includes(`'${key}'`), `${key} is loaded by the Settings page`)
      assert.ok(ui.includes(`'${key}': map.get('${key}')`), `${key} starts with its saved value`)
      assert.ok(ui.includes(`set('${key}'`), `${key} has a field`)
    }
    assert.match(ui, /Bank transfer, Whish or OMT details/)
    assert.match(ui, /Account number, IBAN or phone number/)
  })
  it('says plainly that the Wallet switch is the customers\' store balance, not Whish', () => {
    assert.match(read('components/settings-center-pro.tsx'), /Store wallet \(signed-in customers pay from their balance\)/)
  })
  it('shows customers the name and details the owner typed, without empty rows', () => {
    const checkout = read('app/checkout/page.tsx')
    assert.match(checkout, /settings\.payment\.details\.bank\?\.label \|\| t\('Bank transfer'\)/)
    assert.match(checkout, /bankDetails\.bankName && <>/)
    assert.match(checkout, /t\('Account number:'\)/)
    assert.match(checkout, /t\('Send the payment to the account below; we ship once it arrives\.'\)/)
    assert.doesNotMatch(checkout, /IBAN: <span/)
    const thanks = read('components/payment-instructions.tsx')
    assert.match(thanks, /t\('Pay \{amount\} with \{provider\}', \{ amount, provider: bank\.label \}\)/)
    assert.match(thanks, /t\('Account number'\)/)
    assert.match(read('lib/payment-methods-public.ts'), /label: \(m\.get\('payment\.bank\.label'\) \|\| ''\)\.trim\(\)/)
  })
})
