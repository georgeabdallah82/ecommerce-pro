import { normalizeCountry } from '@/lib/countries'

// Settings > Shipping & delivery > Countries you deliver to: the only countries checkout offers
// and accepts. Kept as ISO 3166-1 codes ("LB"); names come from the built-in country names
// (Intl.DisplayNames), in English or Arabic. Nothing saved means the store's own country only.

export const DELIVERY_COUNTRIES_KEY = 'checkout.countries'

// Every country and territory people live in (ISO 3166-1 alpha-2).
export const REGION_CODES = ('AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ '
  + 'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF '
  + 'GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ '
  + 'LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP '
  + 'NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX '
  + 'SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW').split(' ')
const REGION_SET = new Set(REGION_CODES)

const namers = new Map<string, Intl.DisplayNames | null>()
export function countryName(code: string, lang: 'en' | 'ar' = 'en') {
  if (!namers.has(lang)) { try { namers.set(lang, new Intl.DisplayNames([lang], { type: 'region' })) } catch { namers.set(lang, null) } }
  try { return namers.get(lang)?.of(code) || code } catch { return code }
}

let byName: Map<string, string> | null = null
// The code for a country as typed or saved ("Lebanon", "lb", "UAE", "United Arab Emirates"), or ''.
export function countryCode(input: string | null | undefined) {
  const value = String(input || '').trim()
  if (!value) return ''
  if (/^[A-Za-z]{2}$/.test(value)) return REGION_SET.has(value.toUpperCase()) ? value.toUpperCase() : ''
  const alias = normalizeCountry(value)
  if (REGION_SET.has(alias)) return alias
  byName ??= new Map(REGION_CODES.map(code => [countryName(code).toUpperCase(), code]))
  return byName.get(value.toUpperCase()) || ''
}

// The saved list (codes), the store's own country first; nothing saved: the store's country.
export function deliveryCountries(saved: string | null | undefined, storeCountry: string | null | undefined) {
  let raw: unknown = []
  try { raw = JSON.parse(saved || '[]') } catch { raw = [] }
  const home = countryCode(storeCountry) || 'LB'
  const list = Array.isArray(raw) ? raw.map(x => countryCode(String(x))).filter(Boolean) : []
  const unique = [...new Set(list.length ? list : [home])]
  return unique.includes(home) ? [home, ...unique.filter(c => c !== home)] : unique
}

// What checkout gets: code and English name (the name is what an order's address keeps).
export const deliveryCountryOptions = (codes: string[]) => codes.map(code => ({ code, name: countryName(code) }))
