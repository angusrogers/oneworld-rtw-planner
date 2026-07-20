/** Six "continents" per the oneworld fare rules (rules 3015 / 9701). */
export type Continent = 'NA' | 'SA' | 'EUME' | 'AF' | 'AS' | 'SWP';

/** Europe/Middle East internal zones (rule 3015 §0). */
export type Zone = 'EU' | 'ME';

/** IATA traffic conference. */
export type TC = 1 | 2 | 3;

export interface Airport {
  iata: string;
  name: string;
  city: string;
  /** Metro city code where one exists (LON, NYC, TYO…), else same as iata. */
  cityCode: string;
  /** ISO-3166 alpha-2 country code. */
  country: string;
  countryName?: string;
  continent: Continent;
  /** Only set for EUME airports. */
  zone?: Zone;
  /** US state / CA province code, e.g. "CA", "NY" — for the transcon rule. */
  region?: string;
  lat: number;
  lon: number;
}

export interface RouteEdge {
  from: string;
  to: string;
  /** Operating carriers (affiliates already mapped to parent), e.g. ["QF","CX"]. */
  carriers: string[];
  distanceMi: number;
  /** 'both' = confirmed by both endpoints' source pages; 'single' = one source only. */
  confidence: 'both' | 'single';
  notes?: string[];
}

export type FareProduct =
  | 'explorer'
  | 'global-explorer'
  | 'circle-pacific'
  | 'star-rtw';
export type Alliance = 'oneworld' | 'star';
/** Premium economy exists only on the Star Alliance RTW fare. */
export type CabinClass = 'economy' | 'premium-economy' | 'business' | 'first';

export interface Segment {
  from: string;
  to: string;
  /** true = passenger travels by surface (own arrangement); counts as a segment. */
  surface?: boolean;
  /** Operating carrier IATA code, when known. */
  carrier?: string;
  /**
   * Is the arrival point a stopover (>24h)? Default true — points are
   * stopovers unless marked as transfers (<24h layovers). The final arrival
   * back at the origin is never a stopover.
   */
  stopover?: boolean;
  /** Optional ISO date of departure, enables date-dependent rules. */
  date?: string;
}

export interface Itinerary {
  product: FareProduct;
  cabin: CabinClass;
  segments: Segment[];
}

export type RuleClass = 'monotone' | 'completable' | 'date';

export interface Violation {
  ruleId: string;
  message: string;
  /** Indices into segments[] implicated in the violation ([] = whole journey). */
  segments: number[];
}

export interface Todo {
  ruleId: string;
  message: string;
  done: boolean;
}

export interface ItineraryStats {
  segmentCount: number;
  flightSegmentCount: number;
  surfaceSegmentCount: number;
  /** Miles actually travelled over the segments so far. */
  flownMiles: number;
  /**
   * flownMiles plus the great-circle gap back to the origin while the loop is
   * open — the minimum possible final mileage, used for cap checks (the 9701/
   * 7889 open-jaw rule also counts the origin-destination surface distance).
   */
  totalMiles: number;
  /** Continents counted for pricing (incl. the 3015 "deemed via Asia" quirk). */
  continentsCounted: Continent[];
  /** Intra-continent flight segments per continent (3015 caps). */
  intraContinentFlights: Partial<Record<Continent, number>>;
  atlanticCrossings: number;
  pacificCrossings: number;
  /** Circle Pacific: N/Central Pacific + South Pacific crossings. */
  northPacificCrossings?: number;
  southPacificCrossings?: number;
  stopoverCount: number;
  stopoversByContinent: Partial<Record<Continent, number>>;
}

export interface ValidationResult {
  /** Complete-itinerary legality (todos all done, no violations). */
  valid: boolean;
  /**
   * Can this (possibly partial) itinerary still be extended into a legal one?
   * false iff any monotone rule is violated.
   */
  extensible: boolean;
  violations: Violation[];
  warnings: Violation[];
  /** Completable-only-if rules — the "to finish you still need to…" checklist. */
  todos: Todo[];
  /** Date-dependent rules validated only when dates present; else assumptions. */
  assumptions: string[];
  stats: ItineraryStats;
  /** Derived fare basis, e.g. DONE5 / LGLOB34 / LCIR26 (null if not derivable). */
  fareBasis: string | null;
}

export interface Snapshot {
  generatedAt: string;
  rulesEdition: string;
  sources: string[];
  airports: Airport[];
  routes: RouteEdge[];
}

/** Lookup used by the rules engine; throws on unknown IATA code. */
export type AirportLookup = (iata: string) => Airport;
