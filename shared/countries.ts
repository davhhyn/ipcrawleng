import { COUNTRIES, type CountryMeta } from './countries.generated'

export type { CountryMeta }
export { COUNTRIES }

/** Normalize any human/provider country string into a lookup key. */
export function normalizeCountryKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export const COUNTRY_BY_CODE: Record<string, CountryMeta> = Object.fromEntries(
  COUNTRIES.map(country => [country.code, country])
)

export const COUNTRY_BY_NUMERIC: Record<string, CountryMeta> = Object.fromEntries(
  COUNTRIES.filter(country => country.numeric).map(country => [country.numeric, country])
)

// Common spellings that providers emit but ISO metadata doesn't carry verbatim.
const ALIASES: Record<string, string> = {
  usa: 'US',
  us: 'US',
  america: 'US',
  'united states of america': 'US',
  'u s a': 'US',
  uk: 'GB',
  'great britain': 'GB',
  britain: 'GB',
  england: 'GB',
  scotland: 'GB',
  wales: 'GB',
  'northern ireland': 'GB',
  'united kingdom of great britain and northern ireland': 'GB',
  holland: 'NL',
  'the netherlands': 'NL',
  turkey: 'TR',
  turkiye: 'TR',
  'cote d ivoire': 'CI',
  'ivory coast': 'CI',
  burma: 'MM',
  'cabo verde': 'CV',
  'cape verde': 'CV',
  swaziland: 'SZ',
  macedonia: 'MK',
  'north macedonia': 'MK',
  'viet nam': 'VN',
  uae: 'AE',
  'u a e': 'AE',
  emirates: 'AE',
  'republic of korea': 'KR',
  'korea republic of': 'KR',
  'korea south': 'KR',
  'korea north': 'KP',
  'dpr korea': 'KP',
  'democratic peoples republic of korea': 'KP',
  'russian federation': 'RU',
  'czech republic': 'CZ',
  'taiwan province of china': 'TW',
  'hong kong sar': 'HK',
  macao: 'MO',
  'macau sar': 'MO',
  vatican: 'VA',
  'vatican city state': 'VA',
  'holy see': 'VA',
  kosovo: 'XK',
  'palestine state of': 'PS',
  'occupied palestinian territory': 'PS',
  'congo democratic republic of the': 'CD',
  'democratic republic of the congo': 'CD',
  'dr congo': 'CD',
  'congo republic of the': 'CG',
  'republic of the congo': 'CG',
  'congo brazzaville': 'CG',
  'lao pdr': 'LA',
  'lao peoples democratic republic': 'LA',
  'syrian arab republic': 'SY',
  'iran islamic republic of': 'IR',
  'bolivia plurinational state of': 'BO',
  'venezuela bolivarian republic of': 'VE',
  'tanzania united republic of': 'TZ',
  'moldova republic of': 'MD',
  'brunei darussalam': 'BN',
  'cape verde islands': 'CV',
  'saint martin': 'MF',
  'sint maarten': 'SX',
  'falkland islands': 'FK',
  'isla de pascua': 'CL'
}

const NAME_INDEX = new Map<string, CountryMeta>()

for (const country of COUNTRIES) {
  for (const key of [country.name, country.official, country.code, country.numeric]) {
    if (key) NAME_INDEX.set(normalizeCountryKey(key), country)
  }
}

for (const [alias, code] of Object.entries(ALIASES)) {
  const country = COUNTRY_BY_CODE[code]
  if (country && !NAME_INDEX.has(alias)) NAME_INDEX.set(alias, country)
}

/**
 * Resolve a country name, ISO code or common alias to ISO metadata.
 * Returns null when the value can't be matched (the caller should keep the raw
 * provider string rather than inventing a country).
 */
export function findCountry(value: string | null | undefined): CountryMeta | null {
  if (!value) return null
  const key = normalizeCountryKey(value)
  if (!key) return null
  return NAME_INDEX.get(key) ?? null
}

export function countryCodeOf(value: string | null | undefined): string | null {
  return findCountry(value)?.code ?? null
}

export function countryNameOf(value: string | null | undefined): string | null {
  return findCountry(value)?.name ?? (value?.trim() || null)
}

/** Regional flag emoji. Rendered only where the platform supports it. */
export function countryFlag(code: string | null | undefined): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return ''
  return String.fromCodePoint(...[...code.toUpperCase()].map(char => 127397 + char.charCodeAt(0)))
}

export function countryRegion(value: string | null | undefined): string | null {
  return findCountry(value)?.region || null
}
