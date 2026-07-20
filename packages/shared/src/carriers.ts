import type { Alliance, FareProduct } from './types.js';

/**
 * Star Alliance members per the RTW T&C §1.1 (12 JAN 22): Aegean, Air Canada,
 * Air China, Air India, Air New Zealand, ANA, Asiana, Austrian, Avianca,
 * Brussels, Copa, Croatia, Ethiopian, EVA, EGYPTAIR, ITA, LOT, Lufthansa,
 * Singapore, Shenzhen, South African, Swiss, TAP, THAI, Turkish, United.
 */
const STAR_MEMBERS = [
  'A3', 'AC', 'CA', 'AI', 'NZ', 'NH', 'OZ', 'OS', 'AV', 'SN', 'CM', 'OU',
  'ET', 'BR', 'MS', 'AZ', 'LO', 'LH', 'SQ', 'ZH', 'SA', 'LX', 'TP', 'TG',
  'TK', 'UA',
] as const;

/**
 * Eligible operating carriers per fare product.
 * oneworld (27 FEB 26 editions):
 *  Rule 3015 header: AA/AS/AT/AY/BA/CX/FJ/IB/JL/MH/NU/QF/QR/RJ/UL/WY
 *  Rule 9701 header: + EI/GK/JQ/PG/WS
 *  Rule 7889 header: AA/AS/BA/CX/FJ/JL/MH/NU/QF/QR/RJ/UL
 * Star Alliance RTW (12 JAN 22): the member list above; codeshares and
 * regional partners are generally included (T&C §1.2).
 */
export const PRODUCT_CARRIERS: Record<FareProduct, ReadonlySet<string>> = {
  explorer: new Set([
    'AA', 'AS', 'AT', 'AY', 'BA', 'CX', 'FJ', 'IB', 'JL', 'MH', 'NU', 'QF',
    'QR', 'RJ', 'UL', 'WY',
  ]),
  'global-explorer': new Set([
    'AA', 'AS', 'AT', 'AY', 'BA', 'CX', 'EI', 'FJ', 'GK', 'IB', 'JL', 'JQ',
    'MH', 'NU', 'PG', 'QF', 'QR', 'RJ', 'UL', 'WS', 'WY',
  ]),
  'circle-pacific': new Set([
    'AA', 'AS', 'BA', 'CX', 'FJ', 'JL', 'MH', 'NU', 'QF', 'QR', 'RJ', 'UL',
  ]),
  'star-rtw': new Set(STAR_MEMBERS),
};

export const PRODUCT_ALLIANCE: Record<FareProduct, Alliance> = {
  explorer: 'oneworld',
  'global-explorer': 'oneworld',
  'circle-pacific': 'oneworld',
  'star-rtw': 'star',
};

/**
 * Carriers permitted only under a named codeshare exception. We usually lack
 * marketing-carrier data, so the engine emits a warning, not a violation.
 */
export const CODESHARE_EXCEPTIONS: Record<FareProduct, Record<string, string>> = {
  explorer: {
    JQ: 'JQ (Jetstar) flights count only when marketed as QF codeshares.',
    QQ: 'QQ (Alliance Airlines) flights count only when operated for QF.',
  },
  'global-explorer': {
    TN: 'TN (Air Tahiti Nui) flights count only when marketed as QF codeshares.',
    QQ: 'QQ (Alliance Airlines) flights count only when operated for QF.',
  },
  'circle-pacific': {
    JQ: 'JQ (Jetstar) flights count only when marketed as QF codeshares.',
    QQ: 'QQ (Alliance Airlines) flights count only when operated for QF.',
    AY: 'AY (Finnair) counts only on its SYD–SIN/BKK services.',
    WY: 'WY (Oman Air) flights count only when operated for QR codeshares.',
  },
  // Star RTW T&C §1.2: codeshares/regional partners are generally included.
  'star-rtw': {},
};

/** Circle Pacific: AY only valid on these sectors (either direction). */
export const CP_AY_SECTORS: ReadonlyArray<readonly [string, string]> = [
  ['SYD', 'SIN'],
  ['SYD', 'BKK'],
];

/** All carriers relevant to any product — drives data-pipeline filtering. */
export const ALL_CARRIERS = new Set([
  ...PRODUCT_CARRIERS.explorer,
  ...PRODUCT_CARRIERS['global-explorer'],
  ...PRODUCT_CARRIERS['circle-pacific'],
  ...PRODUCT_CARRIERS['star-rtw'],
]);

export const CARRIER_NAMES: Record<string, string> = {
  AA: 'American Airlines', AS: 'Alaska Airlines', AT: 'Royal Air Maroc',
  AY: 'Finnair', BA: 'British Airways', CX: 'Cathay Pacific',
  EI: 'Aer Lingus', FJ: 'Fiji Airways', GK: 'Jetstar Japan', IB: 'Iberia',
  JL: 'Japan Airlines', JQ: 'Jetstar', MH: 'Malaysia Airlines',
  NU: 'Japan Transocean Air', PG: 'Bangkok Airways', QF: 'Qantas',
  QR: 'Qatar Airways', RJ: 'Royal Jordanian', UL: 'SriLankan Airlines',
  WS: 'WestJet', WY: 'Oman Air',
  A3: 'Aegean Airlines', AC: 'Air Canada', CA: 'Air China', AI: 'Air India',
  NZ: 'Air New Zealand', NH: 'ANA', OZ: 'Asiana Airlines', OS: 'Austrian',
  AV: 'Avianca', SN: 'Brussels Airlines', CM: 'Copa Airlines',
  OU: 'Croatia Airlines', ET: 'Ethiopian Airlines', BR: 'EVA Air',
  MS: 'EGYPTAIR', AZ: 'ITA Airways', LO: 'LOT Polish Airlines',
  LH: 'Lufthansa', SQ: 'Singapore Airlines', ZH: 'Shenzhen Airlines',
  SA: 'South African Airways', LX: 'Swiss', TP: 'TAP Air Portugal',
  TG: 'THAI', TK: 'Turkish Airlines', UA: 'United',
};

/**
 * Affiliate brands → parent operating carrier, used when ingesting route data
 * (Wikipedia "Airlines and destinations" rows use brand names).
 * WestJet Encore counts only where WS itself is eligible (Global Explorer).
 */
export const AFFILIATE_BRANDS: Record<string, string> = {
  'american eagle': 'AA',
  envoy: 'AA', 'psa airlines': 'AA', 'piedmont airlines': 'AA',
  'republic airways': 'AA',
  horizon: 'AS', 'horizon air': 'AS', skywest: 'AS',
  'ba cityflyer': 'BA', 'ba euroflyer': 'BA', cityflyer: 'BA', euroflyer: 'BA',
  'fiji link': 'FJ', 'fijilink': 'FJ',
  'nordic regional airlines': 'AY', norra: 'AY',
  'air nostrum': 'IB', 'iberia express': 'IB', 'iberia regional': 'IB',
  'j-air': 'JL', 'hokkaido air system': 'JL', 'japan air commuter': 'JL',
  // NB: bare "Airlink" is deliberately NOT mapped — South African Airlink
  // (JNB) would false-match; the QantasLink brand name covers the QF case.
  qantaslink: 'QF', 'qantas link': 'QF', 'eastern australia airlines': 'QF',
  'sunstate airlines': 'QF', 'national jet systems': 'QF',
  'network aviation': 'QF',
  'royal air maroc express': 'AT', 'ram express': 'AT',
  'westjet encore': 'WS',
  'jetstar japan': 'GK',
  // Star Alliance regional/affiliate brands (RTW T&C §1.2 includes them).
  'air canada express': 'AC', 'air canada rouge': 'AC', 'jazz aviation': 'AC',
  'united express': 'UA',
  'lufthansa cityline': 'LH', 'lufthansa city airlines': 'LH',
  'air dolomiti': 'LH',
  'ana wings': 'NH', 'air japan': 'NH',
  'austrian airlines': 'OS',
  'brussels airlines': 'SN',
  'swiss international air lines': 'LX', 'helvetic airways': 'LX',
  'tap express': 'TP', 'portugalia': 'TP',
  'lot polish airlines': 'LO',
  'thai smile': 'TG',
  'avianca costa rica': 'AV', 'avianca ecuador': 'AV', 'avianca el salvador': 'AV',
  'olympic air': 'A3',
};
