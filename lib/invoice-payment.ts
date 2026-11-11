// The start of an invoice's online payment. The store writes its own payment record first, then asks the gateway for a
// session, then saves the session on that record. So a payment the gateway takes for this order always has a local record
// to match. If the start fails it is undone: the order is cancelled and the invoice reopened. A record whose session the
// gateway already created stays pending, so a payment on it is still matched, and because the order is cancelled, staff
// are told to refund it or re-open the order (lib/payment-outcome.ts).

export type InvoicePaymentSession = {
  provider: string
  externalId?: string | null
  status: string
  clientCheckout?: { type?: string; merchantId?: string; sessionId?: string; successIndicator?: string } | null
}

export type InvoicePaymentSteps = {
  recordPending: () => Promise<{ id: string }>
  createSession: () => Promise<InvoicePaymentSession>
  saveSession: (paymentId: string, session: InvoicePaymentSession) => Promise<void>
  undo: (state: { paymentId: string | null; sessionCreated: boolean }) => Promise<void>
}

export async function startInvoicePayment(steps: InvoicePaymentSteps): Promise<InvoicePaymentSession> {
  let paymentId: string | null = null
  let sessionCreated = false
  try {
    paymentId = (await steps.recordPending()).id
    const session = await steps.createSession()
    sessionCreated = true
    await steps.saveSession(paymentId, session)
    return session
  } catch (error) {
    // An undo that also fails is logged. It does not replace the error that started the undo.
    await steps.undo({ paymentId, sessionCreated }).catch(undoError => console.error('[invoice] could not undo a failed payment start', undoError))
    throw error
  }
}
