// Drivers: the plain rules shared by the admin pages, the driver's own page and tests (the
// database side is lib/drivers.ts).

export const PROBLEM_REASONS = [
  { value: 'no-answer', label: 'Customer not answering' },
  { value: 'refused', label: 'Customer refused the parcel' },
  { value: 'later', label: 'Customer asked for another day' },
  { value: 'address', label: 'Wrong or unclear address' },
  { value: 'other', label: 'Other problem' },
] as const

export type ProblemReason = typeof PROBLEM_REASONS[number]['value']

export const problemLabel = (value: string) => PROBLEM_REASONS.find(r => r.value === value)?.label || 'Other problem'

export const driverLink = (siteUrl: string, token: string) => `${siteUrl.replace(/\/$/, '')}/driver/${token}`

// The first message to a driver (Admin > Orders > Drivers, "Send the link"). English, like the
// other admin messages; staff can edit it in WhatsApp.
export function driverWelcomeMessage(input: { storeName: string; name: string; link: string }) {
  return [
    `Hi ${input.name.split(/\s+/)[0] || ''}! This is your delivery list for ${input.storeName || 'the store'}.`.replace('Hi !', 'Hi!'),
    '',
    'Open it whenever you go out: it shows your orders, the address, the phone and the cash to collect. Tap "Delivered" when the customer has the parcel.',
    '',
    input.link,
    '',
    'Keep this link private: it is only for you.',
  ].join('\n')
}

export type CashOrder = { cashCollected: number | null; cashSettledAt: string | Date | null; currency: string }

// The cash a driver collected and has not handed to the store yet.
export function cashToHandOver(orders: CashOrder[]) {
  const open = orders.filter(o => (o.cashCollected || 0) > 0 && !o.cashSettledAt)
  return { orders: open.length, amount: open.reduce((sum, o) => sum + (o.cashCollected || 0), 0) }
}
