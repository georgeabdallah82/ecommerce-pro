import { db } from '@/lib/prisma'

export type PaymentMethodConfig = {
  cod: { enabled: boolean }
  card: { enabled: boolean; provider: string }
  bank: { enabled: boolean; bankName: string; accountName: string; iban: string; instructions: string }
  wallet: { enabled: boolean; provider: string; accountName: string; accountNumber: string; instructions: string }
}

const KEYS = [
  'payment.cod', 'payment.card', 'payment.bank', 'payment.wallet', 'payment.provider',
  'payment.bank.name', 'payment.bank.accountName', 'payment.bank.iban', 'payment.bank.instructions',
  'payment.wallet.provider', 'payment.wallet.accountName', 'payment.wallet.accountNumber', 'payment.wallet.instructions',
]

const bool = (v: string | undefined, fallback = false) => v == null ? fallback : v === 'true'

export async function getPaymentMethodConfig(): Promise<PaymentMethodConfig> {
  const rows = await db.setting.findMany({ where: { key: { in: KEYS } } })
  const m = new Map(rows.map(r => [r.key, r.value]))
  return {
    cod: { enabled: bool(m.get('payment.cod'), true) },
    card: { enabled: bool(m.get('payment.card')), provider: m.get('payment.provider') || 'manual' },
    bank: {
      enabled: bool(m.get('payment.bank')),
      bankName: m.get('payment.bank.name') || '',
      accountName: m.get('payment.bank.accountName') || '',
      iban: m.get('payment.bank.iban') || '',
      instructions: m.get('payment.bank.instructions') || '',
    },
    wallet: {
      enabled: bool(m.get('payment.wallet')),
      provider: m.get('payment.wallet.provider') || '',
      accountName: m.get('payment.wallet.accountName') || '',
      accountNumber: m.get('payment.wallet.accountNumber') || '',
      instructions: m.get('payment.wallet.instructions') || '',
    },
  }
}
