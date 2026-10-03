// The wording the policy pages start with, before the merchant writes their own in
// Online Store › Policies. Client-safe (no db) so the editor can offer "Reset to our text".
export type PolicyKind = 'refund' | 'privacy' | 'terms'
export type PolicyVars = { brand: string; currency: string; country: string; phone: string; returnDays: string; refundTime: string; damageReportHours: string; returnsEnabled: boolean }

export const POLICY_TITLES: Record<PolicyKind, string> = { refund: 'Refund Policy', privacy: 'Privacy Policy', terms: 'Terms of Service' }
export const POLICY_PATHS: Record<PolicyKind, string> = { refund: '/refund-policy', privacy: '/privacy-policy', terms: '/terms-of-service' }

const esc = (s: string) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function refundHtml(v: PolicyVars) {
  const brand = esc(v.brand)
  if (!v.returnsEnabled) return `<p>At ${brand}, all sales are final. We do not accept returns or give refunds for items you have changed your mind about.</p>
<h2>Damaged or incorrect items</h2>
<p>If an item arrives damaged, defective, or different from what you ordered, contact us within ${esc(v.damageReportHours)} hours of delivery with photos of the item and your order number. We will send you a replacement at no cost.</p>
<h2>Cancellations</h2>
<p>You can cancel an order before it ships by contacting us as soon as possible. Once an order has shipped it cannot be cancelled.</p>`
  return `<p>We want you to be happy with your order from ${brand}. This policy covers returns, exchanges, and refunds.</p>
<h2>Return window</h2>
<p>You can request a return within ${esc(v.returnDays)} days of receiving your order. To be eligible, an item must be unused, in its original packaging, and in the same condition you received it.</p>
<h2>How to start a return</h2>
<p>Contact us with your order number and the reason for the return${v.phone ? ` (the fastest way is WhatsApp: ${esc(v.phone)})` : ''}, or open your order from <a href="/orders/lookup">order tracking</a> and request a return there. We'll confirm whether the item is eligible and how to send it back.</p>
<h2>Refunds</h2>
<p>Once we receive and inspect the returned item, we'll let you know whether the refund is approved. Approved refunds are issued to the original payment method (card and bank transfer orders) or as store credit (cash-on-delivery orders), usually within ${esc(v.refundTime)} depending on your bank.</p>
<p>If only part of an order is returned, only the returned items are refunded. Delivery charges are refunded only if the return is due to our error (wrong or defective item).</p>
<h2>Damaged or incorrect items</h2>
<p>If an item arrives damaged, defective, or different from what you ordered, contact us within ${esc(v.damageReportHours)} hours of delivery with photos of the item. We'll arrange a replacement or full refund at no cost to you.</p>
<h2>Non-returnable items</h2>
<p>Some items can't be returned for hygiene, safety, or made-to-order reasons. Any such exclusions are clearly marked on the product page before you order.</p>
<h2>Cancellations</h2>
<p>You can cancel an order before it ships by contacting us as soon as possible. Once an order has shipped, it follows the return process above instead.</p>`
}

function privacyHtml(v: PolicyVars) {
  const brand = esc(v.brand)
  return `<p>This Privacy Policy explains what information ${brand} collects when you visit or place an order on this website, and how that information is used.</p>
<h2>Information you give us</h2>
<p>When you place an order, create an account, or contact us, we collect the information you provide: your name, email address, phone number, and delivery address. If wallet or store-credit features are used, we also keep a record of that balance against your account.</p>
<h2>Payment information</h2>
<p>If you pay by card, your card details are entered directly with our payment processor and are never stored on our servers. We keep a record of the transaction (amount, status, and a reference from the processor) to manage your order and prevent fraud. If you choose cash on delivery or bank transfer, no card details are collected at all.</p>
<h2>Information collected automatically</h2>
<p>Like most websites, we log some technical information on every visit: your IP address, an approximate location derived from it, device type, browser, and the page you came from. This is used for order security, fraud prevention, and to understand overall site traffic.</p>
<p>We use cookies and local browser storage to remember your cart, wishlist, and login session. These are functional and don't track you across other websites.</p>
<h2>How we use your information</h2>
<ul>
<li>To process and deliver your orders, including contacting you about order status and delivery.</li>
<li>To handle customer support requests${v.returnsEnabled ? ', returns and refunds' : ''}.</li>
<li>To send order confirmations and, if you opt in, marketing updates.</li>
<li>To detect and prevent fraud or abuse of the site.</li>
<li>To improve the store based on overall, non-identifying traffic patterns.</li>
</ul>
<h2>Who we share it with</h2>
<p>We share order information only with the services needed to fulfil it: our payment processor, our email provider, and delivery partners. We do not sell your personal information.</p>
<h2>Data retention</h2>
<p>We keep order records for as long as needed for accounting and legal purposes. You can ask us to delete your account and personal data at any time, apart from records we are required to keep by law.</p>
<h2>Your rights</h2>
<p>You can ask for a copy of the personal data we hold about you, ask us to correct it, or ask us to delete it, using the contact details below.</p>
<p>This policy is governed by the laws of ${esc(v.country)}.</p>`
}

function termsHtml(v: PolicyVars) {
  const brand = esc(v.brand)
  return `<p>These terms apply whenever you browse or place an order on this website ("the Store"), operated by ${brand}. By placing an order, you agree to them.</p>
<h2>Orders and pricing</h2>
<p>Prices are shown in ${esc(v.currency)}. We reserve the right to correct pricing or listing errors, and to cancel and refund an order placed at an incorrect price before it ships.</p>
<p>Placing an order is an offer to buy; the order is confirmed once you receive an order confirmation. The payment methods available are shown at checkout.</p>
<h2>Stock and availability</h2>
<p>We make a reasonable effort to keep stock levels accurate, but availability isn't guaranteed until your order is confirmed. If an item turns out to be unavailable, we'll contact you to offer a substitute or a refund for that item.</p>
<h2>Discounts and promotions</h2>
<p>Discount codes and promotions have their own conditions (minimum spend, eligible products, expiry date) and may be changed or withdrawn before an order using them is placed.</p>
<h2>Delivery</h2>
<p>Delivery times shown on the store are estimates, not guarantees. Responsibility for the goods passes to you once they are delivered to the address you gave.</p>
<h2>Returns and refunds</h2>
<p>${v.returnsEnabled ? 'Returns and refunds are handled under our <a href="/refund-policy">Refund Policy</a>.' : 'All sales are final. See our <a href="/refund-policy">Refund Policy</a> for damaged or incorrect items.'}</p>
<h2>Accounts</h2>
<p>You're responsible for keeping your account password private and for all activity under your account. Tell us right away if you suspect someone else has used it.</p>
<h2>Acceptable use</h2>
<p>You agree not to misuse the Store, including interfering with how it works, placing fraudulent orders, or using it to break any law.</p>
<h2>Limitation of liability</h2>
<p>As far as the law allows, ${brand} isn't liable for indirect or consequential losses arising from use of the Store. Nothing in these terms limits any liability that can't legally be limited.</p>
<h2>Changes to these terms</h2>
<p>We may update these terms from time to time; the current version always applies. The "Last updated" date above shows when they last changed.</p>
<p>These terms are governed by the laws of ${esc(v.country)}.</p>`
}

export function defaultPolicyHtml(kind: PolicyKind, vars: PolicyVars) {
  return kind === 'refund' ? refundHtml(vars) : kind === 'privacy' ? privacyHtml(vars) : termsHtml(vars)
}
