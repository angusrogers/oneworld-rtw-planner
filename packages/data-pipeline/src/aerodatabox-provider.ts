import { AFFILIATE_BRANDS, ALL_CARRIERS, CARRIER_NAMES } from '@rtw/shared';
import type { AirportIndex } from './ourairports.js';
import type { RawRoute, RouteDataProvider } from './provider.js';

/**
 * AeroDataBox "airport destination statistics" provider (build guide §4.2's
 * primary recommendation). Requires a RapidAPI key in AERODATABOX_API_KEY —
 * without one the pipeline falls back to the Wikipedia provider.
 *
 * Endpoint: GET /airports/iata/{code}/stats/routes/daily
 * returns [{ destination: { iata, … }, operators: [{ name }], … }].
 */
export class AeroDataBoxProvider implements RouteDataProvider {
  name = 'aerodatabox';

  constructor(
    private index: AirportIndex,
    private apiKey: string,
    private host = 'aerodatabox.p.rapidapi.com',
  ) {}

  static fromEnv(index: AirportIndex): AeroDataBoxProvider | null {
    const key = process.env.AERODATABOX_API_KEY;
    return key ? new AeroDataBoxProvider(index, key) : null;
  }

  private matchOperator(name: string): string | null {
    const n = name.toLowerCase().trim();
    for (const [code, carrierName] of Object.entries(CARRIER_NAMES)) {
      if (ALL_CARRIERS.has(code) && n.includes(carrierName.toLowerCase())) return code;
    }
    for (const [brand, code] of Object.entries(AFFILIATE_BRANDS)) {
      if (n.includes(brand)) return code;
    }
    return null;
  }

  async routesFrom(iata: string): Promise<RawRoute[] | null> {
    const res = await fetch(
      `https://${this.host}/airports/iata/${iata}/stats/routes/daily`,
      {
        headers: {
          'X-RapidAPI-Key': this.apiKey,
          'X-RapidAPI-Host': this.host,
        },
      },
    );
    if (res.status === 404) return [];
    if (!res.ok) {
      console.warn(`  aerodatabox ${res.status} for ${iata}`);
      return null;
    }
    const data = (await res.json()) as any;
    const routes: RawRoute[] = [];
    for (const route of data?.routes ?? []) {
      const to = route?.destination?.iata;
      if (!to || !this.index.byIata.has(to)) continue;
      for (const op of route?.operators ?? []) {
        const carrier = this.matchOperator(op?.name ?? '');
        if (carrier) routes.push({ from: iata, to, carrier });
      }
    }
    return routes;
  }
}
