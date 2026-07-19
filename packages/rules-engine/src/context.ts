import {
  airportToCityCode,
  CONTINENT_TO_TC,
  haversineMiles,
  type Airport,
  type AirportLookup,
  type Continent,
  type Itinerary,
  type Segment,
  type TC,
  type Zone,
} from '@rtw/shared';

export interface Point {
  iata: string;
  airport: Airport;
  cityCode: string;
  country: string;
  continent: Continent;
  zone?: Zone;
  tc: TC;
  /** Is this point a stopover (>24h)? Origin & terminus are never stopovers. */
  stopover: boolean;
  /** Index of the arriving segment (-1 for the origin point). */
  arrivingSegment: number;
}

export interface EnrichedSegment extends Segment {
  index: number;
  fromPoint: Point;
  toPoint: Point;
  miles: number;
  intercontinental: boolean;
  /** International in the fare-rule sense (US↔CA is NOT international). */
  international: boolean;
  crossesAtlantic: boolean;
  crossesPacific: boolean;
}

export interface Ctx {
  itinerary: Itinerary;
  segs: EnrichedSegment[];
  /** points[0] = origin; points[i] = arrival point of segment i-1. */
  points: Point[];
  origin: Point;
  /** Last point reached so far (== origin when no segments). */
  current: Point;
  /** Total miles incl. an origin-destination open-jaw surface gap (9701/7889). */
  totalMilesWithOpenJaw: number;
  totalMiles: number;
}

/** US↔Canada does not count as international (rules 3015/9701 §4). */
export function isInternational(a: Airport, b: Airport): boolean {
  if (a.country === b.country) return false;
  const pair = new Set([a.country, b.country]);
  if (pair.has('US') && pair.has('CA')) return false;
  return true;
}

export function buildContext(itinerary: Itinerary, lookup: AirportLookup): Ctx {
  const { segments } = itinerary;
  if (segments.length === 0) throw new Error('empty itinerary');

  const mkPoint = (iata: string, arrivingSegment: number): Point => {
    const airport = lookup(iata);
    return {
      iata,
      airport,
      cityCode: airportToCityCode(iata),
      country: airport.country,
      continent: airport.continent,
      zone: airport.zone,
      tc: CONTINENT_TO_TC[airport.continent],
      stopover: false,
      arrivingSegment,
    };
  };

  const points: Point[] = [mkPoint(segments[0].from, -1)];
  segments.forEach((s, i) => {
    if (s.from !== points[i].iata) {
      throw new Error(
        `segment ${i} departs ${s.from} but previous point is ${points[i].iata}`,
      );
    }
    points.push(mkPoint(s.to, i));
  });

  // Stopover flags: intermediate points only. Default is a stopover (>24h);
  // the user marks quick connections (<24h layovers) as transfers.
  for (let i = 1; i < points.length - 1; i++) {
    points[i].stopover = segments[i - 1].stopover ?? true;
  }

  const segs: EnrichedSegment[] = segments.map((s, i) => {
    const fromPoint = points[i];
    const toPoint = points[i + 1];
    const a = fromPoint.airport;
    const b = toPoint.airport;
    const tcPair = `${Math.min(fromPoint.tc, toPoint.tc)}-${Math.max(fromPoint.tc, toPoint.tc)}`;
    return {
      ...s,
      index: i,
      fromPoint,
      toPoint,
      miles: haversineMiles(a.lat, a.lon, b.lat, b.lon),
      intercontinental: fromPoint.continent !== toPoint.continent,
      international: isInternational(a, b),
      crossesAtlantic: tcPair === '1-2',
      crossesPacific: tcPair === '1-3',
    };
  });

  const totalMiles = segs.reduce((sum, s) => sum + s.miles, 0);
  const origin = points[0];
  const current = points[points.length - 1];
  let openJawMiles = 0;
  if (current.cityCode !== origin.cityCode) {
    const a = current.airport;
    const b = origin.airport;
    openJawMiles = haversineMiles(a.lat, a.lon, b.lat, b.lon);
  }

  return {
    itinerary,
    segs,
    points,
    origin,
    current,
    totalMiles,
    totalMilesWithOpenJaw: totalMiles + openJawMiles,
  };
}

/** Intermediate points (arrival points excluding the final terminus). */
export function intermediatePoints(ctx: Ctx): Point[] {
  return ctx.points.slice(1, -1);
}

/** Stopover points so far (intermediate points flagged as stopovers). */
export function stopoverPoints(ctx: Ctx): Point[] {
  return intermediatePoints(ctx).filter((p) => p.stopover);
}
