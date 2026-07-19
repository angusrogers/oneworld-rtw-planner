import {
  airportToCityCode,
  countryToContinent,
  countryToZone,
  RUSSIA_EAST_OF_URALS,
  type Airport,
  type AirportLookup,
  type CabinClass,
  type FareProduct,
  type Itinerary,
  type Segment,
} from '@rtw/shared';

/** [country, lat, lon, region?] — coordinates approximate, ample for tests. */
const A: Record<string, [string, number, number, string?]> = {
  // South West Pacific
  SYD: ['AU', -33.95, 151.18], MEL: ['AU', -37.67, 144.84], BNE: ['AU', -27.38, 153.12],
  PER: ['AU', -31.94, 115.97], ADL: ['AU', -34.94, 138.53], CBR: ['AU', -35.31, 149.19],
  CNS: ['AU', -16.88, 145.75], DRW: ['AU', -12.41, 130.88], BME: ['AU', -17.95, 122.23],
  KTA: ['AU', -20.71, 116.77],
  AKL: ['NZ', -37.01, 174.79], CHC: ['NZ', -43.49, 172.53],
  NAN: ['FJ', -17.76, 177.44], PPT: ['PF', -17.55, -149.61], NOU: ['NC', -22.01, 166.21],
  // Asia
  HKG: ['HK', 22.31, 113.91], SIN: ['SG', 1.36, 103.99], BKK: ['TH', 13.69, 100.75],
  KUL: ['MY', 2.75, 101.71], CGK: ['ID', -6.13, 106.66], DPS: ['ID', -8.75, 115.17],
  MNL: ['PH', 14.51, 121.02], SGN: ['VN', 10.82, 106.65], PNH: ['KH', 11.55, 104.84],
  NRT: ['JP', 35.76, 140.39], HND: ['JP', 35.55, 139.78], KIX: ['JP', 34.43, 135.24],
  OKA: ['JP', 26.2, 127.65], ICN: ['KR', 37.46, 126.44], TPE: ['TW', 25.08, 121.23],
  PEK: ['CN', 40.08, 116.58], PVG: ['CN', 31.14, 121.81],
  CMB: ['LK', 7.18, 79.88], MLE: ['MV', 4.19, 73.53], DEL: ['IN', 28.57, 77.1],
  BOM: ['IN', 19.09, 72.87], DAC: ['BD', 23.84, 90.4],
  TSE: ['KZ', 51.02, 71.47], ALA: ['KZ', 43.35, 77.04],
  SVX: ['RU', 56.74, 60.8], IKT: ['RU', 52.27, 104.39],
  // Europe / Middle East
  LHR: ['GB', 51.47, -0.45], LGW: ['GB', 51.15, -0.19], MAN: ['GB', 53.35, -2.27],
  DUB: ['IE', 53.42, -6.27], CDG: ['FR', 49.01, 2.55], MAD: ['ES', 40.47, -3.56],
  BCN: ['ES', 41.3, 2.08], FCO: ['IT', 41.8, 12.25], FRA: ['DE', 50.03, 8.56],
  AMS: ['NL', 52.31, 4.76], HEL: ['FI', 60.32, 24.96], ARN: ['SE', 59.65, 17.92],
  IST: ['TR', 41.28, 28.75], SVO: ['RU', 55.97, 37.41], LED: ['RU', 59.8, 30.26],
  CMN: ['MA', 33.37, -7.59], ALG: ['DZ', 36.69, 3.21], TUN: ['TN', 36.85, 10.23],
  CAI: ['EG', 30.12, 31.41], AMM: ['JO', 31.72, 35.99], DOH: ['QA', 25.27, 51.61],
  DXB: ['AE', 25.25, 55.36], MCT: ['OM', 23.59, 58.28], RUH: ['SA', 24.96, 46.7],
  JED: ['SA', 21.68, 39.16], KWI: ['KW', 29.24, 47.97], BAH: ['BH', 26.27, 50.63],
  // Africa
  JNB: ['ZA', -26.14, 28.25], CPT: ['ZA', -33.96, 18.6], NBO: ['KE', -1.32, 36.93],
  ADD: ['ET', 8.98, 38.8], LOS: ['NG', 6.58, 3.32], DKR: ['SN', 14.74, -17.49],
  MRU: ['MU', -20.43, 57.68], SEZ: ['SC', -4.67, 55.52], TNR: ['MG', -18.8, 47.48],
  ACC: ['GH', 5.61, -0.17],
  // North America
  LAX: ['US', 33.94, -118.41, 'CA'], SFO: ['US', 37.62, -122.38, 'CA'],
  SEA: ['US', 47.45, -122.31, 'WA'], PDX: ['US', 45.59, -122.6, 'OR'],
  LAS: ['US', 36.08, -115.15, 'NV'], PHX: ['US', 33.43, -112.01, 'AZ'],
  DEN: ['US', 39.86, -104.67, 'CO'], DFW: ['US', 32.9, -97.04, 'TX'],
  IAH: ['US', 29.98, -95.34, 'TX'], ORD: ['US', 41.98, -87.9, 'IL'],
  JFK: ['US', 40.64, -73.78, 'NY'], EWR: ['US', 40.69, -74.17, 'NJ'],
  BOS: ['US', 42.36, -71.01, 'MA'], PHL: ['US', 39.87, -75.24, 'PA'],
  MIA: ['US', 25.79, -80.29, 'FL'], MCO: ['US', 28.43, -81.31, 'FL'],
  ATL: ['US', 33.64, -84.43, 'GA'], CLT: ['US', 35.21, -80.94, 'NC'],
  IAD: ['US', 38.95, -77.46, 'VA'], DCA: ['US', 38.85, -77.04, 'VA'],
  ANC: ['US', 61.17, -149.98, 'AK'], FAI: ['US', 64.82, -147.86, 'AK'],
  HNL: ['US', 21.32, -157.92, 'HI'], OGG: ['US', 20.9, -156.43, 'HI'],
  KOA: ['US', 19.74, -156.05, 'HI'],
  YVR: ['CA', 49.19, -123.18, 'BC'], YYZ: ['CA', 43.68, -79.63, 'ON'],
  YYC: ['CA', 51.13, -114.01, 'AB'], YUL: ['CA', 45.47, -73.74, 'QC'],
  MEX: ['MX', 19.44, -99.07], CUN: ['MX', 21.04, -86.87],
  PTY: ['PA', 9.07, -79.38], SJO: ['CR', 9.99, -84.2], HAV: ['CU', 22.99, -82.41],
  KIN: ['JM', 17.94, -76.79], BGI: ['BB', 13.07, -59.49],
  // South America
  SCL: ['CL', -33.39, -70.79], EZE: ['AR', -34.82, -58.53], AEP: ['AR', -34.56, -58.42],
  GRU: ['BR', -23.43, -46.47], GIG: ['BR', -22.81, -43.25], LIM: ['PE', -12.02, -77.11],
  BOG: ['CO', 4.7, -74.15], UIO: ['EC', -0.13, -78.36], MVD: ['UY', -34.84, -56.03],
};

export function testAirport(iata: string): Airport {
  const row = A[iata];
  if (!row) throw new Error(`unknown test airport ${iata}`);
  const [country, lat, lon, region] = row;
  const continent = RUSSIA_EAST_OF_URALS.has(iata)
    ? 'AS'
    : countryToContinent(country);
  if (!continent) throw new Error(`no continent for ${country}`);
  return {
    iata,
    name: iata,
    city: iata,
    cityCode: airportToCityCode(iata),
    country,
    continent,
    zone: continent === 'EUME' ? countryToZone(country) : undefined,
    region,
    lat,
    lon,
  };
}

export const lookup: AirportLookup = testAirport;

/**
 * "SYD-HKG-LHR" or array of [from,to,opts] tuples → Itinerary.
 * String form marks every intermediate point as a stopover (the historical
 * default); use the tuple form to control stopover/transfer per point — the
 * engine default for an unset flag is a transfer.
 */
export function itin(
  product: FareProduct,
  route: string | Array<[string, string, Partial<Segment>?]>,
  cabin: CabinClass = 'economy',
): Itinerary {
  let segments: Segment[];
  if (typeof route === 'string') {
    const pts = route.split('-');
    segments = pts.slice(1).map((to, i) => ({
      from: pts[i],
      to,
      ...(i < pts.length - 2 ? { stopover: true } : {}),
    }));
  } else {
    segments = route.map(([from, to, opts]) => ({ from, to, ...opts }));
  }
  return { product, cabin, segments };
}

export const ALL_TEST_AIRPORTS = Object.keys(A);
