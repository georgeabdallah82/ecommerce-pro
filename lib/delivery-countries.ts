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

// The English names, fixed. They came from Intl.DisplayNames, whose names differ from one engine
// (and version) to the next: on the server (Node) HK was "Hong Kong SAR China" and PS "Palestinian
// Territories", in Chrome "Hong Kong" and "Palestine". A country list rendered on the server then
// didn't match the one the browser rendered, and React threw the page's HTML away (a hydration error
// on Admin > Orders > New order, Settings and checkout's country list). One table everywhere, made
// from Node's names (ICU 78) with the short forms customers use for HK, MO, PS and FK. The names
// engines give (and older saved addresses carry) still count when reading a country back.
// Arabic names still come from Intl.DisplayNames.
const EN_NAMES: Record<string, string> = {
  AD: "Andorra", AE: "United Arab Emirates", AF: "Afghanistan", AG: "Antigua & Barbuda", AI: "Anguilla",
  AL: "Albania", AM: "Armenia", AO: "Angola", AR: "Argentina", AS: "American Samoa", AT: "Austria", AU: "Australia",
  AW: "Aruba", AX: "Åland Islands", AZ: "Azerbaijan", BA: "Bosnia & Herzegovina", BB: "Barbados", BD: "Bangladesh",
  BE: "Belgium", BF: "Burkina Faso", BG: "Bulgaria", BH: "Bahrain", BI: "Burundi", BJ: "Benin", BL: "St. Barthélemy",
  BM: "Bermuda", BN: "Brunei", BO: "Bolivia", BQ: "Caribbean Netherlands", BR: "Brazil", BS: "Bahamas", BT: "Bhutan",
  BW: "Botswana", BY: "Belarus", BZ: "Belize", CA: "Canada", CC: "Cocos (Keeling) Islands", CD: "Congo - Kinshasa",
  CF: "Central African Republic", CG: "Congo - Brazzaville", CH: "Switzerland", CI: "Côte d\u2019Ivoire",
  CK: "Cook Islands", CL: "Chile", CM: "Cameroon", CN: "China", CO: "Colombia", CR: "Costa Rica", CU: "Cuba",
  CV: "Cape Verde", CW: "Curaçao", CX: "Christmas Island", CY: "Cyprus", CZ: "Czechia", DE: "Germany",
  DJ: "Djibouti", DK: "Denmark", DM: "Dominica", DO: "Dominican Republic", DZ: "Algeria", EC: "Ecuador",
  EE: "Estonia", EG: "Egypt", EH: "Western Sahara", ER: "Eritrea", ES: "Spain", ET: "Ethiopia", FI: "Finland",
  FJ: "Fiji", FK: "Falkland Islands", FM: "Micronesia", FO: "Faroe Islands", FR: "France", GA: "Gabon",
  GB: "United Kingdom", GD: "Grenada", GE: "Georgia", GF: "French Guiana", GG: "Guernsey", GH: "Ghana",
  GI: "Gibraltar", GL: "Greenland", GM: "Gambia", GN: "Guinea", GP: "Guadeloupe", GQ: "Equatorial Guinea",
  GR: "Greece", GT: "Guatemala", GU: "Guam", GW: "Guinea-Bissau", GY: "Guyana", HK: "Hong Kong", HN: "Honduras",
  HR: "Croatia", HT: "Haiti", HU: "Hungary", ID: "Indonesia", IE: "Ireland", IL: "Israel", IM: "Isle of Man",
  IN: "India", IO: "British Indian Ocean Territory", IQ: "Iraq", IR: "Iran", IS: "Iceland", IT: "Italy",
  JE: "Jersey", JM: "Jamaica", JO: "Jordan", JP: "Japan", KE: "Kenya", KG: "Kyrgyzstan", KH: "Cambodia",
  KI: "Kiribati", KM: "Comoros", KN: "St. Kitts & Nevis", KP: "North Korea", KR: "South Korea", KW: "Kuwait",
  KY: "Cayman Islands", KZ: "Kazakhstan", LA: "Laos", LB: "Lebanon", LC: "St. Lucia", LI: "Liechtenstein",
  LK: "Sri Lanka", LR: "Liberia", LS: "Lesotho", LT: "Lithuania", LU: "Luxembourg", LV: "Latvia", LY: "Libya",
  MA: "Morocco", MC: "Monaco", MD: "Moldova", ME: "Montenegro", MF: "St. Martin", MG: "Madagascar",
  MH: "Marshall Islands", MK: "North Macedonia", ML: "Mali", MM: "Myanmar (Burma)", MN: "Mongolia", MO: "Macao",
  MP: "Northern Mariana Islands", MQ: "Martinique", MR: "Mauritania", MS: "Montserrat", MT: "Malta", MU: "Mauritius",
  MV: "Maldives", MW: "Malawi", MX: "Mexico", MY: "Malaysia", MZ: "Mozambique", NA: "Namibia", NC: "New Caledonia",
  NE: "Niger", NF: "Norfolk Island", NG: "Nigeria", NI: "Nicaragua", NL: "Netherlands", NO: "Norway", NP: "Nepal",
  NR: "Nauru", NU: "Niue", NZ: "New Zealand", OM: "Oman", PA: "Panama", PE: "Peru", PF: "French Polynesia",
  PG: "Papua New Guinea", PH: "Philippines", PK: "Pakistan", PL: "Poland", PM: "St. Pierre & Miquelon",
  PN: "Pitcairn Islands", PR: "Puerto Rico", PS: "Palestine", PT: "Portugal", PW: "Palau", PY: "Paraguay",
  QA: "Qatar", RE: "Réunion", RO: "Romania", RS: "Serbia", RU: "Russia", RW: "Rwanda", SA: "Saudi Arabia",
  SB: "Solomon Islands", SC: "Seychelles", SD: "Sudan", SE: "Sweden", SG: "Singapore", SH: "St. Helena",
  SI: "Slovenia", SJ: "Svalbard & Jan Mayen", SK: "Slovakia", SL: "Sierra Leone", SM: "San Marino", SN: "Senegal",
  SO: "Somalia", SR: "Suriname", SS: "South Sudan", ST: "São Tomé & Príncipe", SV: "El Salvador", SX: "Sint Maarten",
  SY: "Syria", SZ: "Eswatini", TC: "Turks & Caicos Islands", TD: "Chad", TG: "Togo", TH: "Thailand",
  TJ: "Tajikistan", TK: "Tokelau", TL: "Timor-Leste", TM: "Turkmenistan", TN: "Tunisia", TO: "Tonga", TR: "Türkiye",
  TT: "Trinidad & Tobago", TV: "Tuvalu", TW: "Taiwan", TZ: "Tanzania", UA: "Ukraine", UG: "Uganda",
  US: "United States", UY: "Uruguay", UZ: "Uzbekistan", VA: "Vatican City", VC: "St. Vincent & Grenadines",
  VE: "Venezuela", VG: "British Virgin Islands", VI: "U.S. Virgin Islands", VN: "Vietnam", VU: "Vanuatu",
  WF: "Wallis & Futuna", WS: "Samoa", YE: "Yemen", YT: "Mayotte", ZA: "South Africa", ZM: "Zambia", ZW: "Zimbabwe"
}

const namers = new Map<string, Intl.DisplayNames | null>()
function displayName(code: string, lang: 'en' | 'ar') {
  if (!namers.has(lang)) { try { namers.set(lang, new Intl.DisplayNames([lang], { type: 'region' })) } catch { namers.set(lang, null) } }
  try { return namers.get(lang)?.of(code) || code } catch { return code }
}
export function countryName(code: string, lang: 'en' | 'ar' = 'en') {
  return (lang === 'en' && EN_NAMES[code]) || displayName(code, lang)
}

let byName: Map<string, string> | null = null
// The code for a country as typed or saved ("Lebanon", "lb", "UAE", "United Arab Emirates", or the
// engine's own name such as "Hong Kong SAR China"), or ''.
export function countryCode(input: string | null | undefined) {
  const value = String(input || '').trim()
  if (!value) return ''
  if (/^[A-Za-z]{2}$/.test(value)) return REGION_SET.has(value.toUpperCase()) ? value.toUpperCase() : ''
  const alias = normalizeCountry(value)
  if (REGION_SET.has(alias)) return alias
  byName ??= new Map(REGION_CODES.flatMap(code => [[displayName(code, 'en').toUpperCase(), code], [countryName(code).toUpperCase(), code]] as Array<[string, string]>))
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
