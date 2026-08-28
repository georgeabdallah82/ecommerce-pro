import { db } from '@/lib/prisma'

const KEYS = [
  'payment.cod', 'payment.card', 'payment.bank', 'payment.wallet',
  'payment.bank.name', 'payment.bank.accountName', 'payment.bank.iban', 'payment.bank.instructions',
  'payment.wallet.provider', 'payment.wallet.accountName', 'payment.wallet.accountNumber', 'payment.wallet.instructions',
]

export async function getPublicPaymentMethods() {
  const rows = await db.setting.findMany({ where: { key: { in: KEYS } }, select: { key: true, value: true } })
  const m = new Map(rows.map(r => [r.key, r.value]))
  return {
    cod: m.get('payment.cod') !== 'false',
    card: m.get('payment.card') === 'true',
    bank: m.get('payment.bank') === 'true' ? {
      bankName: m.get('payment.bank.name') || '',
      accountName: m.get('payment.bank.accountName') || '',
      iban: m.get('payment.bank.iban') || '',
      instructions: m.get('payment.bank.instructions') || '',
    } : null,
    wallet: m.get('payment.wallet') === 'true' ? {
      provider: m.get('payment.wallet.provider') || '',
      accountName: m.get('payment.wallet.accountName') || '',
      accountNumber: m.get('payment.wallet.accountNumber') || '',
      instructions: m.get('payment.wallet.instructions') || '',
    } : null,
  }
}
