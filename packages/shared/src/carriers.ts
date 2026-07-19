import type { FareProduct } from './types.js';

/**
 * Eligible operating carriers per fare product (27 FEB 26 editions).
 * Rule 3015 header: AA/AS/AT/AY/BA/CX/FJ/IB/JL/MH/NU/QF/QR/RJ/UL/WY
 * Rule 9701 header: + EI/GK/JQ/PG/WS
 * Rule 7889 header: AA/AS/BA/CX/FJ/JL/MH/NU/QF/QR/RJ/UL
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
]);

export const CARRIER_NAMES: Record<string, string> = {
  AA: 'American Airlines', AS: 'Alaska Airlines', AT: 'Royal Air Maroc',
  AY: 'Finnair', BA: 'British Airways', CX: 'Cathay Pacific',
  EI: 'Aer Lingus', FJ: 'Fiji Airways', GK: 'Jetstar Japan', IB: 'Iberia',
  JL: 'Japan Airlines', JQ: 'Jetstar', MH: 'Malaysia Airlines',
  NU: 'Japan Transocean Air', PG: 'Bangkok Airways', QF: 'Qantas',
  QR: 'Qatar Airways', RJ: 'Royal Jordanian', UL: 'SriLankan Airlines',
  WS: 'WestJet', WY: 'Oman Air',
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
};
