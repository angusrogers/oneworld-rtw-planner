import {
  HAWAII_AIRPORTS,
  STAR_BOOKFLY_EXCLUDED_COUNTRIES,
  type TC,
} from '@rtw/shared';
import type { Out } from './collector.js';
import {
  ruleCarriers,
  ruleDirection,
  ruleNotViaOrigin,
  ruleSegmentLimits,
} from './common-rules.js';
import { starMaxCap, starTierFor } from './fare-basis.js';
import { intermediatePoints, stopoverPoints, type Ctx, type Point } from './context.js';

/**
 * Star Alliance Round the World fare — T&C of 12 JAN 22
 * (docs/rules-pdfs/Star_Alliance_RTW_TnC_12JAN22.md). Mileage-priced with
 * Normal and Special tiers; §-references below are to that document.
 */
export function validateStarRtw(ctx: Ctx, out: Out, complete: boolean) {
  const cabin = ctx.itinerary.cabin;

  ruleCarriers(ctx, out, 'star-rtw');

  // §3.1.3 one global direction, each TC entered once; §3.1.6 free within a TC.
  ruleDirection(ctx, out, { hawaiiException: false });

  // §3.1.4 — Atlantic, Pacific and Europe/Africa/ME↔Asia each crossed exactly once.
  const tcPair = (a: TC, b: TC) => `${Math.min(a, b)}-${Math.max(a, b)}`;
  const crossings = (pair: string) =>
    ctx.segs.filter((s) => tcPair(s.fromPoint.tc, s.toPoint.tc) === pair);
  for (const [pair, label] of [
    ['1-2', 'Atlantic (TC1↔TC2)'],
    ['1-3', 'Pacific (TC1↔TC3)'],
    ['2-3', 'Europe/Africa/Middle East↔Asia (TC2↔TC3)'],
  ] as const) {
    const xs = crossings(pair);
    if (xs.length > 1) {
      out.violate(
        'R-OCEAN',
        `Only one ${label} crossing is permitted.`,
        xs.map((s) => s.index),
      );
    }
    out.todo('R-OCEAN', `Cross ${label}`, xs.length >= 1);
  }

  // §3.1.5 — the first crossing between continents may not be a surface sector.
  const firstIntercont = ctx.segs.find((s) => s.intercontinental);
  if (firstIntercont?.surface) {
    out.violate(
      'R-SURFACE-FIRST',
      'The first crossing between continents may not be a surface sector.',
      [firstIntercont.index],
    );
  }

  // §3.3.1 — at most 5 surface sectors (they count as coupons and mileage).
  const surfaces = ctx.segs.filter((s) => s.surface);
  if (surfaces.length > 5) {
    out.violate(
      'R-SURFACE',
      `At most 5 surface sectors are permitted (this itinerary has ${surfaces.length}).`,
      surfaces.map((s) => s.index),
    );
  }

  // §3.2.6 — travel through the city of origin is not permitted.
  ruleNotViaOrigin(ctx, out);

  // §3.1.1 — start and end in the same country (any city in it).
  const returned =
    ctx.segs.length > 0 && ctx.current.country === ctx.origin.country;
  out.todo(
    'R-RETURN',
    `Return to ${ctx.origin.airport.countryName ?? ctx.origin.country} (the country of origin — any city)`,
    returned,
  );
  if (complete && !returned) {
    out.violate(
      'R-RETURN',
      `The journey must end in the country of origin (${ctx.origin.country}); ${ctx.current.iata} is in ${ctx.current.country}.`,
      [ctx.segs.length - 1],
      { monotone: false },
    );
  }

  // §3.4.1 — max 16 coupons incl. surface sectors.
  ruleSegmentLimits(ctx, out, {});

  // §2.1 — mileage caps. Validate against the most permissive tier for the
  // cabin (Normal 39k everywhere); the Special tiers only affect pricing.
  const miles = ctx.totalMiles;
  const maxCap = starMaxCap(cabin);
  const stops = stopoverPoints(ctx);
  const tier = starTierFor(cabin, miles, stops.length, ctx.origin.country === 'JP');
  if (miles > maxCap) {
    out.violate(
      'R-MILEAGE',
      `Total mileage ${miles.toLocaleString()} exceeds the maximum ${maxCap.toLocaleString()}-mile cap available in ${cabin} class.`,
      [],
    );
  } else if (tier && miles > tier.cap * 0.97) {
    out.warn(
      'R-MILEAGE',
      `Total mileage ${miles.toLocaleString()} is within 3% of the ${tier.cap.toLocaleString()}-mile cap — GDS ticketed-point mileage may differ from great-circle distance.`,
      [],
    );
  }
  out.assume('Mileage is great-circle distance; the fare uses IATA Ticketed Point Mileage, which typically differs by up to ~2%.');

  // §3.2.2 — Normal fares need 2+ stopovers, max 15 (Special: 3+, lower max —
  // pricing-tier detail, not a legality bound).
  out.todo('R-STOPOVERS', 'Make at least 2 stopovers (>24h; 3+ for the cheaper Special fares)', stops.length >= 2);
  if (stops.length > 15) {
    out.violate(
      'R-STOPOVERS',
      `At most 15 stopovers are permitted (this itinerary has ${stops.length}).`,
      [],
      { monotone: false },
    );
  }

  // §3.2.4 — max 1 stopover per city; max 3 per country (USA: 5).
  const byCity = groupBy(stops, (p) => p.cityCode);
  for (const [city, pts] of byCity) {
    if (pts.length > 1) {
      out.violate(
        'R-STOPOVER-CITY',
        `Only one stopover is permitted in any single city (${city} has ${pts.length}) — mark the extra visits as transfers.`,
        pts.map((p) => p.arrivingSegment),
        { monotone: false },
      );
    }
  }
  const byCountry = groupBy(stops, (p) => p.country);
  for (const [country, pts] of byCountry) {
    const cap = country === 'US' ? 5 : 3;
    if (pts.length > cap) {
      out.violate(
        'R-STOPOVER-COUNTRY',
        `At most ${cap} stopovers are permitted in ${country === 'US' ? 'the USA' : `any one country (${country})`}.`,
        pts.map((p) => p.arrivingSegment),
        { monotone: false },
      );
    }
  }

  // §3.2.5 — origin-dependent regional stopover caps.
  if (['US', 'CA'].includes(ctx.origin.country)) {
    const contUsCa = stops.filter(
      (p) => ['US', 'CA'].includes(p.country) && !HAWAII_AIRPORTS.has(p.iata),
    );
    if (contUsCa.length > 4) {
      out.violate(
        'R-STOPOVER-ORIGIN-REGION',
        'For journeys originating in USA/Canada, at most 4 stopovers are permitted in continental USA/Canada.',
        contUsCa.map((p) => p.arrivingSegment),
        { monotone: false },
      );
    }
  }
  if (ctx.origin.zone === 'EU') {
    const euStops = stops.filter((p) => p.zone === 'EU');
    if (euStops.length > 5) {
      out.violate(
        'R-STOPOVER-ORIGIN-REGION',
        'For journeys originating in Europe, at most 5 stopovers are permitted in Europe.',
        euStops.map((p) => p.arrivingSegment),
        { monotone: false },
      );
    }
  }

  // §3.2.5/§3.2.6 — transfer caps. Star has no US↔CA carve-out, so a
  // "domestic" transfer means both adjacent sectors stay within one country.
  const transfers = intermediatePoints(ctx).filter((p) => !p.stopover);
  const transfersByCity = groupBy(transfers, (p) => p.cityCode);
  for (const [city, pts] of transfersByCity) {
    if (pts.length > 3) {
      out.violate(
        'R-TRANSFERS',
        `At most 3 transfers are permitted in any one city (${city} has ${pts.length}).`,
        pts.map((p) => p.arrivingSegment),
        { monotone: false },
      );
    }
  }
  const isIntlTransfer = (p: Point) => {
    const arr = ctx.segs[p.arrivingSegment];
    const dep = ctx.segs[p.arrivingSegment + 1];
    return (
      arr.fromPoint.country !== p.country ||
      (dep !== undefined && dep.toPoint.country !== p.country)
    );
  };
  for (const [country, pts] of groupBy(transfers, (p) => p.country)) {
    const intl = pts.filter(isIntlTransfer);
    if (intl.length > 4) {
      out.violate(
        'R-TRANSFERS',
        `At most 4 international transfers are permitted in any one country (${country} has ${intl.length}).`,
        intl.map((p) => p.arrivingSegment),
        { monotone: false },
      );
    }
    if (country === ctx.origin.country) {
      const domestic = pts.filter((p) => !isIntlTransfer(p));
      if (domestic.length > 4) {
        out.violate(
          'R-TRANSFERS',
          `At most 4 domestic transfers are permitted in the country of origin (${country} has ${domestic.length}).`,
          domestic.map((p) => p.arrivingSegment),
          { monotone: false },
        );
      }
    }
  }

  // §1.3 — Cuba restrictions (US government).
  const cubaPoints = ctx.points.filter((p) => p.country === 'CU');
  if (cubaPoints.length > 0) {
    const ua = ctx.segs.filter((s) => s.carrier === 'UA');
    if (ua.length > 0) {
      out.violate(
        'R-CUBA',
        'A ticket including travel to/from/via Cuba may not include United operated or marketed flights (US Government restriction).',
        ua.map((s) => s.index),
      );
    }
    if (ctx.origin.country === 'US') {
      out.violate(
        'R-CUBA',
        'A ticket including travel to/from/via Cuba may not originate in the USA.',
        cubaPoints.map((p) => Math.max(0, p.arrivingSegment)),
      );
    }
    out.warn(
      'R-CUBA',
      'Cuba itineraries cannot be sold in the USA or to US citizens, and cannot be booked via the Star Alliance Book and Fly tool.',
      cubaPoints.map((p) => Math.max(0, p.arrivingSegment)),
    );
  }

  // §1.4 — Book & Fly cannot book these countries (agents may differ).
  const excluded = ctx.points.filter((p) =>
    STAR_BOOKFLY_EXCLUDED_COUNTRIES.has(p.country),
  );
  if (excluded.length > 0) {
    out.warn(
      'R-BOOKFLY',
      `The Star Alliance Book and Fly tool does not allow flights to/from ${[...new Set(excluded.map((p) => p.country))].join(', ')} — book via a member airline or travel agent, if possible at all.`,
      excluded.map((p) => Math.max(0, p.arrivingSegment)),
    );
  }

  // §3.4.2/§3.4.3 — min stay 10 days between first and last qualifying sector
  // (international sectors; intercontinental if the journey starts in Europe),
  // all travel within 1 year. Date-dependent.
  const europeOrigin = ctx.origin.zone === 'EU';
  const qualifying = ctx.segs.filter((s) =>
    europeOrigin
      ? s.intercontinental
      : s.fromPoint.country !== s.toPoint.country,
  );
  const first = qualifying[0];
  const last = qualifying[qualifying.length - 1];
  const sectorKind = europeOrigin ? 'intercontinental' : 'international';
  if (first?.date && last?.date && qualifying.length >= 2) {
    const days = (Date.parse(last.date) - Date.parse(first.date)) / 86400000;
    if (days < 10) {
      out.violate(
        'R-MINSTAY',
        `The last ${sectorKind} sector must depart at least 10 days after the first.`,
        [last.index],
        { monotone: false },
      );
    }
  } else {
    out.assume(`The last ${sectorKind} sector must depart at least 10 days after the first (attach dates to check).`);
  }
  const firstSeg = ctx.segs[0];
  const lastSeg = ctx.segs[ctx.segs.length - 1];
  if (firstSeg.date && lastSeg.date) {
    const days = (Date.parse(lastSeg.date) - Date.parse(firstSeg.date)) / 86400000;
    if (days > 365) {
      out.violate('R-MAXSTAY', 'All travel must be completed within 1 year of departure.', [lastSeg.index], { monotone: false });
    }
  } else {
    out.assume('All travel must be completed within 1 year after departure from the fare origin.');
  }

  // §3.4.4 — First Class sunset; §2.2 — no Special fares ex-Japan.
  if (cabin === 'first') {
    out.assume('First Class RTW tickets issued from 1 JUL 26 must be completed within 12 months of first departure or by 1 OCT 27, whichever is earlier.');
  }
  if (ctx.origin.country === 'JP') {
    out.assume('Special (cheaper) Economy/Business fares are not offered for journeys originating in Japan — Normal fare levels apply.');
  }
  if (cabin === 'first') {
    const sqFirst = ctx.segs.filter((s) => s.carrier === 'SQ');
    if (sqFirst.length > 0) {
      out.warn(
        'R-CABIN',
        'First Class on Singapore Airlines A380 services is not permitted on this fare — those sectors book into Business.',
        sqFirst.map((s) => s.index),
      );
    }
  }
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    m.set(k, [...(m.get(k) ?? []), it]);
  }
  return m;
}
