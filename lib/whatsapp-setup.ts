// The WhatsApp setup guide (Admin › Settings › WhatsApp setup guide, app/admin/settings/whatsapp): the steps in Meta
// and in the store, each ticked from the store's own settings where the store can tell. No server imports: shared
// with the tests. Docs: docs/whatsapp-setup-guide-2026-11.md.

export type WhatsAppSetupFacts = {
  // "Send automatic WhatsApp messages" is on (Settings › Email & messaging).
  enabled: boolean
  phoneNumberId: boolean
  tokenSaved: boolean
  // The saved key can still be opened (it can't once the store's secret key changed).
  tokenReadable: boolean
  // How many of the three order messages have a template name.
  orderTemplates: number
  refillTemplate: boolean
  loginTemplate: boolean
  // The last "Send a test" (activity log), if any.
  lastTest: { ok: boolean; error?: string } | null
}

export type StepStatus = 'done' | 'todo' | 'problem'
export type SetupStep = { id: 'meta' | 'number' | 'key' | 'templates' | 'test'; title: string; status: StepStatus; summary: string }

export const connectedNow = (f: WhatsAppSetupFacts) => f.phoneNumberId && f.tokenSaved && f.tokenReadable

export function whatsappSetupSteps(f: WhatsAppSetupFacts): SetupStep[] {
  const templates = [`order updates ${f.orderTemplates} of 3`, `"Running low?" ${f.refillTemplate ? 'set' : 'not set'}`, `sign-in code ${f.loginTemplate ? 'set' : 'not set'}`].join(', ')
  return [
    {
      id: 'meta', title: 'Your number on WhatsApp, in Meta',
      // The store can't see Meta; the number's ID saved means this was done.
      status: f.phoneNumberId ? 'done' : 'todo',
      summary: f.phoneNumberId ? 'Done: your number is on WhatsApp\'s Cloud API.' : 'A Meta app with WhatsApp, your number added and a payment method.',
    },
    { id: 'number', title: 'The phone number ID, in the store', status: f.phoneNumberId ? 'done' : 'todo', summary: f.phoneNumberId ? 'Saved.' : 'Not saved yet.' },
    {
      id: 'key', title: 'A permanent access key, in the store',
      status: !f.tokenSaved ? 'todo' : f.tokenReadable ? 'done' : 'problem',
      summary: !f.tokenSaved ? 'Not saved yet.' : f.tokenReadable ? 'Saved, kept sealed.' : 'Saved, but it can no longer be read (the store\'s secret key changed). Paste it again.',
    },
    { id: 'templates', title: 'The message templates', status: f.orderTemplates || f.refillTemplate || f.loginTemplate ? 'done' : 'todo', summary: `Names saved: ${templates}.` },
    {
      id: 'test', title: 'Switched on, and a test received',
      status: !f.enabled ? 'todo' : f.lastTest?.ok ? 'done' : f.lastTest ? 'problem' : 'todo',
      summary: !f.enabled ? 'Automatic WhatsApp messages are off.' : f.lastTest?.ok ? 'On, and the last test was sent.' : f.lastTest ? `On, but the last test failed: ${f.lastTest.error || 'WhatsApp did not take it'}.` : 'On. Send a test to your own number.',
    },
  ]
}

// What customers get now: each needs WhatsApp on and connected, and its own template.
export function whatsappOffers(f: WhatsAppSetupFacts) {
  const on = f.enabled && connectedNow(f)
  return { orderUpdates: on && f.orderTemplates > 0, reminders: on && f.refillTemplate, signIn: on && f.loginTemplate }
}
