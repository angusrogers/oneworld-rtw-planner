/**
 * Swappable route-data source (build guide §4.2). The Wikipedia provider is
 * the default because it needs no API key; AeroDataBox slots in when
 * AERODATABOX_API_KEY is set.
 */
export interface RawRoute {
  from: string;
  to: string;
  /** Operating carrier (parent code after affiliate mapping). */
  carrier: string;
  /** e.g. "seasonal", "begins 26 October 2026". */
  notes?: string[];
}

export interface RouteDataProvider {
  name: string;
  /**
   * Direct destinations served from `iata` on eligible carriers.
   * Returns null when the provider has no data for this airport.
   */
  routesFrom(iata: string): Promise<RawRoute[] | null>;
}
