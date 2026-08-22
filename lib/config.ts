export const config = {
  brand: process.env.NEXT_PUBLIC_BRAND_NAME || 'YOUR BRAND',
  currency: process.env.NEXT_PUBLIC_CURRENCY || 'USD',
  whatsapp: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '',
  country: process.env.NEXT_PUBLIC_COUNTRY || 'Lebanon',
  locale: process.env.NEXT_PUBLIC_LOCALE || 'en-US'
}

export const money = (cents: number, currency = config.currency) => new Intl.NumberFormat(config.locale, { style: 'currency', currency }).format(cents / 100)
