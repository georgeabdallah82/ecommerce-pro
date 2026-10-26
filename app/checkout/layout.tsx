import type { Metadata } from 'next'

// The checkout page is a client component, so its browser-tab title is set here.
export const metadata: Metadata = { title: 'Checkout' }

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return children
}
