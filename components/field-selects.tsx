'use client'

// Dropdowns for fields that have a fixed set of answers: countries, currencies, time zones.
// Used in the admin (Settings, orders, gift cards, purchase orders, tax) and on the storefront
// (account addresses). The stored value stays the same kind of text as before (a country's English
// name such as "Lebanon", an ISO currency code such as "USD", an IANA zone such as "Asia/Beirut"),
// so existing data keeps matching. A value that isn't in the list is kept as its own option, so
// nothing saved is lost just by opening the form.
import { useMemo, type CSSProperties } from 'react'
import { REGION_CODES, countryName } from '@/lib/delivery-countries'
import styles from './field-selects.module.css'

const COUNTRY_NAMES = REGION_CODES.map(code => countryName(code)).sort((a, b) => a.localeCompare(b))

const CURRENCY_CODES: string[] = (() => {
  try {
    const list = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('currency')
    if (list?.length) return list
  } catch { /* older runtimes */ }
  return ['USD', 'EUR', 'GBP', 'LBP', 'AED', 'SAR', 'KWD', 'QAR', 'BHD', 'OMR', 'JOD', 'EGP', 'TRY', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY', 'INR']
})()

const TIME_ZONES: string[] = (() => {
  try {
    const list = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone')
    if (list?.length) return list
  } catch { /* older runtimes */ }
  return ['UTC']
})()

function withCurrent(options: string[], value: string) {
  const current = String(value || '').trim()
  return current && !options.includes(current) ? [current, ...options] : options
}

type SelectProps = {
  value: string
  onChange: (value: string) => void
  className?: string
  style?: CSSProperties
  id?: string
  name?: string
  required?: boolean
  disabled?: boolean
  placeholder?: string
  'aria-label'?: string
}

function ChoiceSelect({ value, onChange, options, placeholder, className, ...rest }: SelectProps & { options: string[] }) {
  const list = useMemo(() => withCurrent(options, value), [options, value])
  return (
    <select {...rest} className={className} value={value || ''} onChange={e => onChange(e.target.value)}>
      <option value="">{placeholder || 'Choose…'}</option>
      {list.map(item => <option key={item} value={item}>{item}</option>)}
    </select>
  )
}

export function CountrySelect(props: SelectProps) {
  return <ChoiceSelect {...props} options={COUNTRY_NAMES} placeholder={props.placeholder || 'Choose a country'} />
}

export function CurrencySelect(props: SelectProps) {
  return <ChoiceSelect {...props} options={CURRENCY_CODES} placeholder={props.placeholder || 'Choose a currency'} />
}

export function TimezoneSelect(props: SelectProps) {
  return <ChoiceSelect {...props} options={TIME_ZONES} placeholder={props.placeholder || 'Choose a time zone'} />
}

// Several countries, stored as a comma-separated text ("Germany, France"), as tax rates already are.
// "*" is the fallback rate for every country without a more specific match.
const FALLBACK = '*'
const FALLBACK_LABEL = 'All countries (fallback)'
export function CountryMultiSelect({ value, onChange, className, id, 'aria-label': ariaLabel }: { value: string; onChange: (value: string) => void; className?: string; id?: string; 'aria-label'?: string }) {
  const chosen = useMemo(() => String(value || '').split(',').map(v => v.trim()).filter(Boolean), [value])
  const isFallback = chosen.includes(FALLBACK)
  const available = COUNTRY_NAMES.filter(name => !chosen.some(c => c.toLowerCase() === name.toLowerCase()))
  const save = (list: string[]) => onChange(list.join(', '))
  const add = (item: string) => save(item === FALLBACK ? [FALLBACK] : [...chosen.filter(c => c !== FALLBACK), item])
  return (
    <div className={styles.multi}>
      {chosen.length > 0 && (
        <div className={styles.chips}>
          {chosen.map(item => (
            <span key={item} className={styles.chip}>
              {item === FALLBACK ? FALLBACK_LABEL : item}
              <button type="button" aria-label={`Remove ${item === FALLBACK ? FALLBACK_LABEL : item}`} onClick={() => save(chosen.filter(c => c !== item))}>&times;</button>
            </span>
          ))}
        </div>
      )}
      {!isFallback && (
        <select id={id} className={className} aria-label={ariaLabel} value="" onChange={e => { if (e.target.value) add(e.target.value) }}>
          <option value="">{chosen.length ? 'Add another country' : 'Choose a country'}</option>
          <option value={FALLBACK}>{FALLBACK_LABEL}</option>
          {available.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      )}
    </div>
  )
}
