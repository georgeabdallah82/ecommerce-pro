import { Fragment } from 'react'
import { whatsappUrl } from '@/lib/links'
import { getThemeState } from '@/lib/theme'
import { config } from '@/lib/config'
import { getContactInfo, getPolicyInfo } from '@/lib/store-contact'
import { getPolicyHtml, getPolicyVars } from '@/lib/policies'
import { POLICY_TITLES, type PolicyKind } from '@/lib/policy-templates'
import { sanitizeRichHtml } from '@/lib/sanitize-html'
import { Footer } from '@/components/footer'

type Contact = { email: string; phone: string; country: string; address: string }

// "Contact us" block shared by the policy pages. Only details the merchant has filled in
// (Settings > General) are shown; nothing renders as a bracketed placeholder.
export function LegalContact({ brand, contact }: { brand: string; contact: Contact }) {
  const wa = whatsappUrl(contact.phone, contact.country)
  const lines = [
    contact.address,
    contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>,
    contact.phone && <>WhatsApp: {wa ? <a href={wa} target="_blank" rel="noopener noreferrer">{contact.phone}</a> : contact.phone}</>,
  ].filter(Boolean)
  return (
    <p>
      {brand}
      {lines.map((line, i) => <Fragment key={i}><br/>{line}</Fragment>)}
      {!contact.email && !contact.phone && <><br/>Use <a href="/orders/lookup">order tracking</a> to reach us about an order.</>}
    </p>
  )
}

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="focalStorefront">
      <div className="aliContainer aliLegalPage">
        <h1>{title}</h1>
        <p className="aliLegalUpdated">Last updated: {updated}</p>
        {children}
      </div>
    </div>
  )
}

// A whole policy page: the merchant's text (Online Store › Policies) or our default wording,
// then the store's contact details, which always come from Settings.
export async function PolicyPage({ kind }: { kind: PolicyKind }) {
  const [{ theme }, contact, policy] = await Promise.all([getThemeState(), getContactInfo(), getPolicyInfo()])
  const brand = theme.brandName || config.brand
  const { html } = await getPolicyHtml(kind, await getPolicyVars(brand, theme.currency))
  return <>
    <LegalPage title={POLICY_TITLES[kind]} updated={policy.updated}>
      <div dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(html) }} />
      <h2>Contact us</h2>
      <LegalContact brand={brand} contact={contact}/>
    </LegalPage>
    <Footer theme={theme}/>
  </>
}
