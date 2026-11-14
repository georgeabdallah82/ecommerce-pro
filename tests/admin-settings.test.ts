import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Admin > Settings and the pages beside it in the sidebar: Shipping, Tax, Users & roles, the launch checklist
// (docs/admin-settings-2026-11.md).

const read = (path: string) => readFileSync(path, 'utf8')
const settings = read('components/settings-center-pro.tsx')
const shipping = read('components/shipping-admin-pro.tsx')
const tax = read('components/tax-admin-pro.tsx')
const users = read('components/users-roles-admin.tsx')

test('Settings shows the saved delivery countries, so adding one keeps the others', () => {
  // The list was never read into the page: the card showed the store's own country only, and adding a country saved
  // [store country, new one] over the saved list.
  assert.match(read('app/admin/settings/page.tsx'), /'checkout\.countries',/)
  assert.match(settings, /'checkout\.countries': map\.get\('checkout\.countries'\) \|\| '',/)
  assert.match(settings, /<DeliveryCountriesCard value=\{values\['checkout\.countries'\]\}/)
})

test('Settings knows what is unsaved by comparing with what was saved', () => {
  // Any typing marked the page unsaved (the search box, the Section list on phones, the blocked-number box), while the
  // switches, the country buttons and the share image did not, so their changes were lost without a warning.
  assert.doesNotMatch(settings, /onChangeCapture|setDirty/)
  assert.match(settings, /const \[saved, setSaved\] = useState\(\(\) => \(\{ values, flags \}\)\)/)
  assert.match(settings, /Object\.keys\(values\)\.some\(key => \(values\[key\] \|\| ''\) !== \(saved\.values\[key\] \|\| ''\)\)/)
  assert.match(settings, /Object\.keys\(flags\)\.some\(key => flags\[key\] !== saved\.flags\[key\]\)/)
  assert.match(settings, /setSaved\(\{ values, flags \}\)\n\s+setNotice\('All settings saved'\)/)
  // Discard reloads once, without the leave warning asking again (components/use-leave-guard.ts).
  assert.match(settings, /allowLeave\(\)\n\s+window\.location\.reload\(\)/)
  assert.match(settings, /useLeaveGuard\(dirty\)/)
})

test('the payment provider is saved from any tab, and the Online card switch is written once', () => {
  // Loaded once; it was loaded again over what was typed each time Payments was opened.
  assert.match(settings, /if \(tab !== 'Payments' \|\| paymentRequested\.current\) return/)
  // Saved whichever tab is open; it was saved only while Payments was open.
  assert.doesNotMatch(settings, /tab === 'Payments' \? api\('\/api\/admin\/payment-provider'/)
  assert.match(settings, /const sendPayment = !!paymentSaved && \(paymentChanged \|\| flags\['payment\.card'\] !== saved\.flags\['payment\.card'\]\)/)
  // Both saves wrote payment.card at once; the provider save, with its checks, now writes it with the switch's value.
  assert.match(settings, /if \(sendPayment\) delete settings\['payment\.card'\]/)
  assert.match(settings, /JSON\.stringify\(\{ \.\.\.paymentConfig, enabled: flags\['payment\.card'\] \}\)/)
  assert.match(read('app/api/admin/payment-provider/route.ts'), /enabled: 'payment\.card',/)
})

test('a failed Settings save says why where it is seen', () => {
  assert.match(settings, /setSaveError\(e instanceof Error \? e\.message : 'Unable to save settings'\)/)
  assert.match(settings, /<UnsavedBar dirty=\{dirty \|\| !!saveError\} saving=\{saving\} onDiscard=\{discardChanges\} onSave=\{save\} error=\{saveError\} \/>/)
  const bar = read('components/admin-unsaved-bar.tsx')
  assert.match(bar, /\{error \? <span className=\{`\$\{styles\.label\} \$\{styles\.error\}`\} role="alert">Not saved: \{error\}<\/span>/)
  assert.match(read('components/admin-unsaved-bar.module.css'), /\.error \{ color: var\(--admin-danger\); \}/)
  assert.match(settings, /\{notice && <div className=\{ui\.alert\} role="status"/)
})

test('Settings: one main landmark, the open section marked, named boxes, phone keyboards', () => {
  assert.doesNotMatch(settings, /<main |<\/main>|<aside /)
  assert.match(settings, /<nav className=\{styles\.nav\} aria-label="Settings sections">/)
  assert.match(settings, /aria-current=\{tab === g\.key \? 'true' : undefined\}/)
  assert.match(settings, /No section matches your search\./)
  assert.match(settings, /aria-label="Phone number to block"/)
  assert.match(settings, /readOnly onFocus=\{e => e\.currentTarget\.select\(\)\} aria-label="Feed address"/)
  for (const label of ['Store email', 'Send the email to', 'Sender address']) assert.match(settings, new RegExp(`<Field label="${label}" type="email"`), label)
  assert.match(settings, /<Field label="Phone \/ WhatsApp" type="tel"/)
  for (const label of ['Return window \\(days\\)', 'Show after \\(seconds\\)', 'Thank-you code valid for \\(days\\)']) assert.match(settings, new RegExp(`<Field label="${label}" inputMode="numeric"`), label)
  assert.match(settings, /<Field label="Free shipping threshold" inputMode="decimal"/)
  assert.match(settings, /<input className=\{ui\.input\} type=\{type\} inputMode=\{inputMode\}/)
})

test('Shipping and Tax: real dialogs that keep their errors, named controls', () => {
  for (const [name, source] of [['shipping', shipping], ['tax', tax]] as const) {
    assert.doesNotMatch(source, /modalOverlay/, name)
    assert.equal((source.match(/<AdminFormDialog open=/g) || []).length, 2, name)
    assert.equal((source.match(/<DialogError error=\{dialogError\}\/>/g) || []).length, 2, name)
    assert.equal((source.match(/required data-autofocus value=/g) || []).length, 2, name)
    assert.match(source, /<span className=\{s\.srOnly\}>Actions<\/span><\/th>/, name)
    assert.match(source, /<AdminScrollArea label=/, name)
    assert.match(source, /<button type="button" className="searchClear" aria-label="Clear search"/, name)
  }
  assert.match(shipping, /setDialogError\(e instanceof Error \? e\.message : 'Unable to create shipping zone'\)/)
  assert.match(shipping, /setDialogError\(e instanceof Error \? e\.message : 'Unable to update zone details'\)/)
  assert.match(shipping, /aria-label="Search zones"/)
  assert.match(shipping, /aria-label="Show zones"/)
  assert.match(shipping, /aria-label=\{`Edit \$\{zone\.name\}`\}/)
  assert.match(shipping, /aria-label=\{`Delete \$\{zone\.name\}`\}/)
  assert.match(shipping, /aria-expanded=\{open === zone\.id\}/)
  assert.match(shipping, /<h2>No shipping zones<\/h2>/)
  // A rate's inline form says why its save failed in the form (it was said at the top of the page).
  assert.equal((shipping.match(/\{formError && <div className=\{`\$\{ui\.alert\} \$\{ui\.alertDanger\}`\} role="alert">\{formError\}<\/div>\}/g) || []).length, 2)
  assert.match(tax, /setDialogError\(e instanceof Error \? e\.message : 'Unable to create tax rate'\)/)
  assert.match(tax, /aria-label="Search tax rates"/)
  assert.match(tax, /aria-label="Show tax rates"/)
  assert.match(tax, /aria-label=\{`Edit \$\{row\.name\}`\}/)
  assert.match(tax, /<h2>No tax rates<\/h2>/)
  // The empty state's heading keeps the size it had as an h3.
  assert.match(read('components/admin-ui.module.css'), /\.empty h2 \{ font-size: 1\.17em; margin: 1em 0; \}/)
  // The shared dialog can carry a line under its title.
  assert.match(read('components/admin-form-dialog.tsx'), /aria-describedby=\{description \? `\$\{id\}-desc` : undefined\}/)
})

test('Users & roles: dialogs keep Tab inside, close on Escape and say why a save failed', () => {
  assert.match(users, /function Modal[\s\S]*?useModalFocus\(ref, true, onClose\)/)
  assert.match(users, /role="dialog" aria-modal="true" aria-label=\{title\} tabIndex=\{-1\}>/)
  assert.match(users, /<div className=\{s\.modalBody\}>\{children\}<DialogError error=\{error\} \/><\/div>/)
  // autoFocus moved focus before the dialog could note the button that opened it; data-autofocus is read by the hook.
  assert.doesNotMatch(users, /autoFocus=\{autoFocus\}|name: e\.target\.value \}\)\} autoFocus|Delivery coordinator" autoFocus/)
  assert.equal((users.match(/data-autofocus/g) || []).length, 3)
  assert.match(users, /\{!modalOpen && \(error \|\| notice\) && <div/)
  assert.match(users, /<label className=\{ui\.fieldLabel\}>New password<PasswordInput label="New password"/)
})

test('the owner pill and the launch checklist labels are readable', () => {
  assert.match(read('components/admin-users.module.css'), /\.ownerPill \{[^}]*color: var\(--admin-accent-strong, var\(--admin-ink\)\) !important;/)
  const checklist = read('components/admin-launch-checklist.module.css')
  assert.doesNotMatch(checklist, /color: #b7791f/)
  assert.match(checklist, /\.countOk \{ background: var\(--admin-success-soft\); color: var\(--admin-success-strong\); \}/)
  assert.match(checklist, /\.countWarn \{ background: var\(--admin-warning-soft\); color: #854d0e; \}/)
  assert.match(checklist, /\.warn \.state \{ color: #854d0e; \}/)
})
