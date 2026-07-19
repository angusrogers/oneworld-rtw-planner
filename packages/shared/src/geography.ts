import type { Continent, TC, Zone } from './types.js';

/**
 * Country (ISO-3166 alpha-2) → rule continent, per rules 3015/9701 §0:
 *  - North America includes the Caribbean, Central America, Panama, Mexico, Bermuda.
 *  - Europe zone includes Algeria, Morocco, Tunisia, Russia west of the Urals.
 *  - Middle East zone includes Egypt, Libya, Sudan.
 *  - Asia includes the Central Asian republics and Russia east of the Urals
 *    (Russia is split by airport — see RUSSIA_EAST_OF_URALS).
 * Micronesia (GU/MP/FM/MH/PW) sits in IATA's South East Asia sub-area → Asia.
 */
const COUNTRY_TO_CONTINENT: Record<string, Continent> = {
  // North America — USA, Canada, Mexico, Greenland, St-Pierre
  US: 'NA', CA: 'NA', MX: 'NA', GL: 'NA', PM: 'NA', BM: 'NA',
  // Central America + Panama
  BZ: 'NA', CR: 'NA', SV: 'NA', GT: 'NA', HN: 'NA', NI: 'NA', PA: 'NA',
  // Caribbean
  AG: 'NA', AI: 'NA', AW: 'NA', BB: 'NA', BL: 'NA', BQ: 'NA', BS: 'NA',
  CU: 'NA', CW: 'NA', DM: 'NA', DO: 'NA', GD: 'NA', GP: 'NA', HT: 'NA',
  JM: 'NA', KN: 'NA', KY: 'NA', LC: 'NA', MF: 'NA', MQ: 'NA', MS: 'NA',
  PR: 'NA', SX: 'NA', TC: 'NA', TT: 'NA', VC: 'NA', VG: 'NA', VI: 'NA',
  // South America
  AR: 'SA', BO: 'SA', BR: 'SA', CL: 'SA', CO: 'SA', EC: 'SA', FK: 'SA',
  GF: 'SA', GY: 'SA', PE: 'SA', PY: 'SA', SR: 'SA', UY: 'SA', VE: 'SA',
  // Europe (zone EU) — incl. Turkey, Caucasus, and the North-African trio
  AD: 'EUME', AL: 'EUME', AT: 'EUME', AX: 'EUME', BA: 'EUME', BE: 'EUME',
  BG: 'EUME', BY: 'EUME', CH: 'EUME', CY: 'EUME', CZ: 'EUME', DE: 'EUME',
  DK: 'EUME', EE: 'EUME', ES: 'EUME', FI: 'EUME', FO: 'EUME', FR: 'EUME',
  GB: 'EUME', GG: 'EUME', GI: 'EUME', GR: 'EUME', HR: 'EUME', HU: 'EUME',
  IE: 'EUME', IM: 'EUME', IS: 'EUME', IT: 'EUME', JE: 'EUME', LI: 'EUME',
  LT: 'EUME', LU: 'EUME', LV: 'EUME', MC: 'EUME', MD: 'EUME', ME: 'EUME',
  MK: 'EUME', MT: 'EUME', NL: 'EUME', NO: 'EUME', PL: 'EUME', PT: 'EUME',
  RO: 'EUME', RS: 'EUME', SE: 'EUME', SI: 'EUME', SJ: 'EUME', SK: 'EUME',
  SM: 'EUME', UA: 'EUME', VA: 'EUME', XK: 'EUME', TR: 'EUME', GE: 'EUME',
  AM: 'EUME', AZ: 'EUME', RU: 'EUME',
  DZ: 'EUME', MA: 'EUME', TN: 'EUME',
  // Middle East (zone ME) — incl. Egypt, Libya, Sudan
  AE: 'EUME', BH: 'EUME', EG: 'EUME', IL: 'EUME', IQ: 'EUME', IR: 'EUME',
  JO: 'EUME', KW: 'EUME', LB: 'EUME', LY: 'EUME', OM: 'EUME', PS: 'EUME',
  QA: 'EUME', SA: 'EUME', SD: 'EUME', SY: 'EUME', YE: 'EUME',
  // Africa
  AO: 'AF', BF: 'AF', BI: 'AF', BJ: 'AF', BW: 'AF', CD: 'AF', CF: 'AF',
  CG: 'AF', CI: 'AF', CM: 'AF', CV: 'AF', DJ: 'AF', ER: 'AF', ET: 'AF',
  GA: 'AF', GH: 'AF', GM: 'AF', GN: 'AF', GQ: 'AF', GW: 'AF', KE: 'AF',
  KM: 'AF', LR: 'AF', LS: 'AF', MG: 'AF', ML: 'AF', MR: 'AF', MU: 'AF',
  MW: 'AF', MZ: 'AF', NA: 'AF', NE: 'AF', NG: 'AF', RE: 'AF', RW: 'AF',
  SC: 'AF', SH: 'AF', SL: 'AF', SN: 'AF', SO: 'AF', SS: 'AF', ST: 'AF',
  SZ: 'AF', TD: 'AF', TG: 'AF', TZ: 'AF', UG: 'AF', YT: 'AF', ZA: 'AF',
  ZM: 'AF', ZW: 'AF', EH: 'AF',
  // Asia — incl. Central Asian republics, Micronesia
  AF_: 'AS', BD: 'AS', BN: 'AS', BT: 'AS', CN: 'AS', HK: 'AS', ID: 'AS',
  IN: 'AS', JP: 'AS', KG: 'AS', KH: 'AS', KP: 'AS', KR: 'AS', KZ: 'AS',
  LA: 'AS', LK: 'AS', MM: 'AS', MN: 'AS', MO: 'AS', MV: 'AS', MY: 'AS',
  NP: 'AS', PH: 'AS', PK: 'AS', SG: 'AS', TH: 'AS', TJ: 'AS', TL: 'AS',
  TM: 'AS', TW: 'AS', UZ: 'AS', VN: 'AS',
  GU: 'AS', MP: 'AS', FM: 'AS', MH_: 'AS', PW: 'AS',
  // South West Pacific
  AU: 'SWP', NZ: 'SWP', FJ: 'SWP', PG: 'SWP', NC: 'SWP', PF: 'SWP',
  VU: 'SWP', SB: 'SWP', WS: 'SWP', TO: 'SWP', TV: 'SWP', KI: 'SWP',
  NR: 'SWP', CK: 'SWP', NU_: 'SWP', WF: 'SWP', AS_: 'SWP', NF: 'SWP',
  TK: 'SWP',
};

/**
 * ISO codes that collide with other keys above are stored with a trailing "_":
 * AF (Afghanistan), MH (Marshall Is.), NU (Niue), AS (American Samoa).
 */
const UNDERSCORED = new Set(['AF', 'MH', 'NU', 'AS']);

export function countryToContinent(iso2: string): Continent | undefined {
  const key = UNDERSCORED.has(iso2) ? `${iso2}_` : iso2;
  return COUNTRY_TO_CONTINENT[key];
}

/** Middle East zone countries (everything else in EUME is zone EU). */
export const MIDDLE_EAST_COUNTRIES = new Set([
  'AE', 'BH', 'EG', 'IL', 'IQ', 'IR', 'JO', 'KW', 'LB', 'LY', 'OM', 'PS',
  'QA', 'SA', 'SD', 'SY', 'YE',
]);

export function countryToZone(iso2: string): Zone | undefined {
  const cont = countryToContinent(iso2);
  if (cont !== 'EUME') return undefined;
  return MIDDLE_EAST_COUNTRIES.has(iso2) ? 'ME' : 'EU';
}

/**
 * Russian airports east of the Urals → Asia (airport-level override; the
 * country default for RU is Europe). Hand-maintained list of the airports a
 * scheduled carrier could plausibly serve.
 */
export const RUSSIA_EAST_OF_URALS = new Set([
  'SVX', 'CEK', 'MQF', 'TJM', 'SGC', 'NJC', 'NUX', 'NYM', 'SLY', 'HMA',
  'OMS', 'TOF', 'NOZ', 'KEJ', 'OVB', 'BAX', 'KJA', 'ABA', 'KYZ', 'IKT',
  'UUD', 'YKS', 'MJZ', 'CYX', 'VVO', 'KHV', 'UUS', 'GDX', 'PKC', 'DYR',
  'BQS', 'HTA', 'NER', 'OHO', 'BTK', 'KGP', 'NSK',
]);

export const CONTINENT_TO_TC: Record<Continent, TC> = {
  NA: 1, SA: 1, EUME: 2, AF: 2, AS: 3, SWP: 3,
};

export const CONTINENT_NAMES: Record<Continent, string> = {
  NA: 'North America',
  SA: 'South America',
  EUME: 'Europe/Middle East',
  AF: 'Africa',
  AS: 'Asia',
  SWP: 'South West Pacific',
};

/** Hawaii airports for the 3015 Hawaii-backtrack exception. */
export const HAWAII_AIRPORTS = new Set([
  'HNL', 'OGG', 'KOA', 'LIH', 'ITO', 'MKK', 'LNY', 'JHM', 'HNM', 'MUE', 'UPP',
]);

/** Rule 3015 (k): US transcontinental state columns. */
export const US_TRANSCON_COLUMN_A = new Set(['AZ', 'CA', 'NV', 'OR', 'WA']);
export const US_TRANSCON_COLUMN_B = new Set([
  'CT', 'FL', 'GA', 'IN', 'MD', 'MA', 'NJ', 'NY', 'NC', 'OH', 'PA', 'MI',
  'SC', 'TN', 'VA', 'DC', 'KY',
]);

/** Rule 3015 (l): Australian restricted nonstop pairs (only one flight total). */
export const AU_RESTRICTED_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['BME', 'BNE'], ['BME', 'MEL'], ['BME', 'SYD'],
  ['DRW', 'CBR'], ['DRW', 'MEL'], ['DRW', 'SYD'],
  ['KTA', 'BNE'], ['KTA', 'MEL'], ['KTA', 'SYD'],
  ['PER', 'BNE'], ['PER', 'CBR'], ['PER', 'CNS'], ['PER', 'SYD'], ['PER', 'MEL'],
];

/** Metro city codes: airport → city code (for no-repeat / not-via-origin). */
export const METRO_AIRPORTS: Record<string, string> = {
  LHR: 'LON', LGW: 'LON', LCY: 'LON', STN: 'LON', LTN: 'LON', SEN: 'LON',
  JFK: 'NYC', EWR: 'NYC', LGA: 'NYC',
  NRT: 'TYO', HND: 'TYO',
  CDG: 'PAR', ORY: 'PAR',
  MXP: 'MIL', LIN: 'MIL', BGY: 'MIL',
  FCO: 'ROM', CIA: 'ROM',
  ORD: 'CHI', MDW: 'CHI',
  IAD: 'WAS', DCA: 'WAS', BWI: 'WAS',
  GRU: 'SAO', CGH: 'SAO', VCP: 'SAO',
  GIG: 'RIO', SDU: 'RIO',
  EZE: 'BUE', AEP: 'BUE',
  KIX: 'OSA', ITM: 'OSA', UKB: 'OSA',
  ICN: 'SEL', GMP: 'SEL',
  DMK: 'BKK',
  CGK: 'JKT', HLP: 'JKT',
  SVO: 'MOW', DME: 'MOW', VKO: 'MOW',
  ARN: 'STO', BMA: 'STO',
  PEK: 'BJS', PKX: 'BJS',
  PVG: 'SHA',
  IST: 'IST', SAW: 'IST',
  NLU: 'MEX',
  AVV: 'MEL',
  YYZ: 'YTO', YTZ: 'YTO',
  DWC: 'DXB',
  HHN: 'FRA',
  BSL: 'EAP', MLH: 'EAP',
};

export function airportToCityCode(iata: string): string {
  return METRO_AIRPORTS[iata] ?? iata;
}

/** Circle Pacific (7889): permitted origin/terminus countries. */
export const CP_ORIGIN_COUNTRIES = new Set([
  'AU', 'BN', 'KH', 'CA', 'CN', 'HK', 'ID', 'JP', 'MY', 'MX', 'MM', 'NZ',
  'PH', 'SG', 'KR', 'TW', 'TH', 'US', 'VN',
  // + any South America country
  'AR', 'BO', 'BR', 'CL', 'CO', 'EC', 'FK', 'GF', 'GY', 'PE', 'PY', 'SR',
  'UY', 'VE',
]);

/** Circle Pacific: South Asian subcontinent — travel via these not permitted. */
export const SOUTH_ASIAN_SUBCONTINENT = new Set([
  'IN', 'PK', 'BD', 'LK', 'NP', 'BT', 'MV',
]);

/** Circle Pacific: Caribbean / Bermuda / Central America — not permitted. */
export const CP_EXCLUDED_NA_COUNTRIES = new Set([
  'BM', 'BZ', 'CR', 'SV', 'GT', 'HN', 'NI', 'PA',
  'AG', 'AI', 'AW', 'BB', 'BL', 'BQ', 'BS', 'CU', 'CW', 'DM', 'DO', 'GD',
  'GP', 'HT', 'JM', 'KN', 'KY', 'LC', 'MF', 'MQ', 'MS', 'PR', 'SX', 'TC',
  'TT', 'VC', 'VG', 'VI',
]);

/** Rule edition surfaced in the UI footer. */
export const RULES_EDITION = '27 FEB 26';
