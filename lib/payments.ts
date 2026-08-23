export type PaymentCreateInput = {
  orderId: string
  amount: number
  currency: string
  email?: string
  returnUrl?: string
}

export type PaymentCreateResult = {
  provider: string
  externalId?: string
  checkoutUrl?: string
  status: 'created' | 'pending' | 'paid' | 'failed'
}

export interface PaymentProvider {
  readonly name: string
  createPayment(input: PaymentCreateInput): Promise<PaymentCreateResult>
  refund?(externalId: string, amount: number, currency: string): Promise<void>
}

export const manualPaymentProvider: PaymentProvider = {
  name: 'manual',
  async createPayment() {
    return { provider: 'manual', status: 'created' }
  },
}

export function getPaymentProvider(): PaymentProvider {
  const name = (process.env.PAYMENT_PROVIDER || 'manual').toLowerCase()
  if (name === 'manual') return manualPaymentProvider
  throw new Error(`Payment provider ${name} is not configured`)
}
