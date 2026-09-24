// Shipping zones and tax rates match a destination country against a free-text field an admin
// typed ("Lebanon", "US", "United States"...) -- the tax admin's own help text tells admins to
// use ISO codes while the shipping admin's tells them to type a name, so the same store could
// easily end up with one zone keyed by code and another by name. Without normalizing both sides
// to the same canonical value, a country typed differently from how a zone was configured
// silently falls through to the flat default rate/tax instead of matching -- this maps the
// common name variants a store realistically deals with to their ISO 3166-1 alpha-2 code so
// "US" and "United States" (or "Lebanon" and "LB") are always treated as the same country.
const COMMON_COUNTRY_ALIASES: Record<string, string> = {
  'UNITED STATES': 'US', 'UNITED STATES OF AMERICA': 'US', 'USA': 'US', 'U.S.A.': 'US', 'U.S.': 'US',
  'UNITED KINGDOM': 'GB', 'UK': 'GB', 'GREAT BRITAIN': 'GB', 'BRITAIN': 'GB',
  'UNITED ARAB EMIRATES': 'AE', 'UAE': 'AE',
  'LEBANON': 'LB',
  'SAUDI ARABIA': 'SA', 'KINGDOM OF SAUDI ARABIA': 'SA',
  'CANADA': 'CA',
  'FRANCE': 'FR',
  'GERMANY': 'DE',
  'ITALY': 'IT',
  'SPAIN': 'ES',
  'PORTUGAL': 'PT',
  'NETHERLANDS': 'NL', 'THE NETHERLANDS': 'NL', 'HOLLAND': 'NL',
  'BELGIUM': 'BE',
  'SWITZERLAND': 'CH',
  'AUSTRIA': 'AT',
  'IRELAND': 'IE',
  'SWEDEN': 'SE',
  'NORWAY': 'NO',
  'DENMARK': 'DK',
  'FINLAND': 'FI',
  'POLAND': 'PL',
  'GREECE': 'GR',
  'TURKEY': 'TR', 'TÜRKIYE': 'TR', 'TURKIYE': 'TR',
  'EGYPT': 'EG',
  'JORDAN': 'JO',
  'IRAQ': 'IQ',
  'SYRIA': 'SY',
  'KUWAIT': 'KW',
  'QATAR': 'QA',
  'BAHRAIN': 'BH',
  'OMAN': 'OM',
  'ISRAEL': 'IL',
  'CYPRUS': 'CY',
  'MOROCCO': 'MA',
  'TUNISIA': 'TN',
  'ALGERIA': 'DZ',
  'AUSTRALIA': 'AU',
  'NEW ZEALAND': 'NZ',
  'CHINA': 'CN',
  'JAPAN': 'JP',
  'SOUTH KOREA': 'KR', 'KOREA': 'KR', 'REPUBLIC OF KOREA': 'KR',
  'INDIA': 'IN',
  'PAKISTAN': 'PK',
  'SINGAPORE': 'SG',
  'MALAYSIA': 'MY',
  'INDONESIA': 'ID',
  'PHILIPPINES': 'PH',
  'THAILAND': 'TH',
  'VIETNAM': 'VN',
  'BRAZIL': 'BR',
  'MEXICO': 'MX',
  'ARGENTINA': 'AR',
  'CHILE': 'CL',
  'COLOMBIA': 'CO',
  'SOUTH AFRICA': 'ZA',
  'NIGERIA': 'NG',
  'KENYA': 'KE',
  'RUSSIA': 'RU', 'RUSSIAN FEDERATION': 'RU',
  'UKRAINE': 'UA',
  'CZECH REPUBLIC': 'CZ', 'CZECHIA': 'CZ',
  'ROMANIA': 'RO',
  'HUNGARY': 'HU',
}

// Every code this alias table maps *to* is itself a valid input too (an admin who already
// typed "US" shouldn't have it second-guessed), so anything already two letters is trusted as
// a code as-is rather than requiring it to appear as some alias's value.
export function normalizeCountry(input: string): string {
  const trimmed = input.trim().toUpperCase()
  if (!trimmed) return trimmed
  if (trimmed.length === 2) return trimmed
  return COMMON_COUNTRY_ALIASES[trimmed] || trimmed
}
