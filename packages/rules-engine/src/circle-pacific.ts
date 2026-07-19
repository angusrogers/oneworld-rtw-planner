import {
  CONTINENT_NAMES,
  CP_EXCLUDED_NA_COUNTRIES,
  CP_ORIGIN_COUNTRIES,
  SOUTH_ASIAN_SUBCONTINENT,
  type Continent,
} from '@rtw/shared';
import type { Out } from './collector.js';
import {
  ruleCarriers,
  ruleIntlTransfers,
  ruleNoRepeat,
  ruleNotViaOrigin,
  ruleSegmentLimits,
} from './common-rules.js';
import { cpTierFor } from './fare-basis.js';
import { intermediatePoints, stopoverPoints, type Ctx, type Point } from './context.js';

const AMERICAS: Continent[] = ['NA', 'SA'];

function cpOpenJawAllowed(origin: Point, end: Point): boolean {
  if (origin.country === end.country) return true;
  const pair = new Set([origin.country, end.country]);
  return pair.has('US') && pair.has('CA');
}

/** oneworld Circle Pacific Explorer — Rule 7889. */
export function validateCirclePacific(ctx: Ctx, out: Out, complete: boolean) {
  const cabin = ctx.itinerary.cabin;

  // R-CP-AREA / R-CP-EXCLUSIONS — the fare covers Asia / North America /
  // South America / South West Pacific only; several regions are excluded.
  ctx.points.forEach((p) => {
    if (p.continent === 'EUME' || p.continent === 'AF') {
      out.violate(
        'R-CP-AREA',
        `${p.iata} is in ${CONTINENT_NAMES[p.continent]} — Circle Pacific covers only Asia, North America, South America and the South West Pacific.`,
        p.arrivingSegment >= 0 ? [p.arrivingSegment] : [0],
      );
    }
    if (SOUTH_ASIAN_SUBCONTINENT.has(p.country)) {
      out.violate(
        'R-CP-EXCLUSIONS',
        `Travel via the South Asian subcontinent is not permitted (${p.iata}).`,
        p.arrivingSegment >= 0 ? [p.arrivingSegment] : [0],
      );
    }
    if (CP_EXCLUDED_NA_COUNTRIES.has(p.country)) {
      out.violate(
        'R-CP-EXCLUSIONS',
        `Travel via the Caribbean, Bermuda or Central America is not permitted (${p.iata}).`,
        p.arrivingSegment >= 0 ? [p.arrivingSegment] : [0],
      );
    }
  });

  // R-CP-ORIGIN
  if (!CP_ORIGIN_COUNTRIES.has(ctx.origin.country)) {
    out.violate(
      'R-CP-ORIGIN',
      `Circle Pacific itineraries must originate in one of the listed Pacific-rim countries or South America; ${ctx.origin.iata} (${ctx.origin.country}) does not qualify.`,
      [0],
    );
  }

  ruleCarriers(ctx, out, 'circle-pacific');
  ruleNotViaOrigin(ctx, out);
  ruleNoRepeat(ctx, out);
  ruleSegmentLimits(ctx, out, {});
  ruleIntlTransfers(ctx, out, 4);

  // R-CP-CIRCLE — one North/Central Pacific crossing (Asia↔Americas) and one
  // South Pacific crossing (Americas↔SWP), in opposite directions.
  const includesSA = ctx.points.some((p) => p.continent === 'SA');
  const nPac = ctx.segs.filter((s) => {
    const pair = [s.fromPoint.continent, s.toPoint.continent];
    return pair.includes('AS') && pair.some((c) => AMERICAS.includes(c));
  });
  const sPac = ctx.segs.filter((s) => {
    const pair = [s.fromPoint.continent, s.toPoint.continent];
    return pair.includes('SWP') && pair.some((c) => AMERICAS.includes(c));
  });
  if (nPac.length > 1) {
    out.violate('R-CP-CIRCLE', 'Only one North/Central Pacific crossing (Asia↔Americas) is permitted.', nPac.map((s) => s.index));
  }
  if (sPac.length > 1) {
    out.violate('R-CP-CIRCLE', 'Only one South Pacific crossing (Americas↔South West Pacific) is permitted.', sPac.map((s) => s.index));
  }
  out.todo('R-CP-CIRCLE', 'Cross the North/Central Pacific (Asia↔Americas)', nPac.length >= 1);
  out.todo('R-CP-CIRCLE', 'Cross the South Pacific (Americas↔South West Pacific)', sPac.length >= 1);
  if (nPac.length === 1 && sPac.length === 1) {
    const nTowardAmericas = AMERICAS.includes(nPac[0].toPoint.continent);
    const sTowardAmericas = AMERICAS.includes(sPac[0].toPoint.continent);
    if (nTowardAmericas === sTowardAmericas) {
      out.violate(
        'R-CP-CIRCLE',
        'The two Pacific crossings must form a circle: one toward the Americas and one away.',
        [nPac[0].index, sPac[0].index],
      );
    }
  }

  // -CIR29SA: South America itineraries must route the South Pacific crossing
  // via Chile to/from the SWP on QF services (the SCL–SYD/AKL corridor).
  if (includesSA) {
    sPac.forEach((s) => {
      const viaChileOnQF =
        (s.fromPoint.country === 'CL' || s.toPoint.country === 'CL') && s.carrier === 'QF';
      if (!viaChileOnQF) {
        out.violate(
          'R-CP-CIRCLE',
          'Itineraries including South America (–CIR29SA) must cross the South Pacific via Chile to/from the South West Pacific on QF services.',
          [s.index],
        );
      }
    });
  }

  // R-CP-INTERCONT — one intercontinental departure and arrival per continent.
  const deps = new Map<Continent, number[]>();
  const arrs = new Map<Continent, number[]>();
  ctx.segs.forEach((s) => {
    if (!s.intercontinental) return;
    deps.set(s.fromPoint.continent, [...(deps.get(s.fromPoint.continent) ?? []), s.index]);
    arrs.set(s.toPoint.continent, [...(arrs.get(s.toPoint.continent) ?? []), s.index]);
  });
  for (const [kind, map] of [['departure', deps], ['arrival', arrs]] as const) {
    for (const [cont, idxs] of map) {
      if (idxs.length > 1) {
        out.violate(
          'R-CP-INTERCONT',
          `Only one intercontinental ${kind} is permitted in ${CONTINENT_NAMES[cont]}.`,
          idxs,
        );
      }
    }
  }

  // Max three transfers at any one city.
  const visits = new Map<string, number[]>();
  intermediatePoints(ctx).forEach((p) => {
    visits.set(p.cityCode, [...(visits.get(p.cityCode) ?? []), p.arrivingSegment]);
  });
  for (const [city, idxs] of visits) {
    if (idxs.length > 3) {
      out.violate('R-CP-TRANSFERS', `Not more than three transfers are permitted at any one city (${city}).`, idxs);
    }
  }

  // R-CP-RETURN
  const returned = ctx.current.cityCode === ctx.origin.cityCode;
  const openJaw = !returned && cpOpenJawAllowed(ctx.origin, ctx.current);
  out.todo('R-CP-RETURN', `Return to ${ctx.origin.cityCode} (open-jaw only within the origin country or USA↔Canada)`, ctx.segs.length > 0 && (returned || openJaw));
  if (complete && !returned && !openJaw) {
    out.violate(
      'R-CP-RETURN',
      `The journey must end at ${ctx.origin.cityCode}; open-jaw is only permitted within the country of origin or between USA and Canada.`,
      [ctx.segs.length - 1],
      { monotone: false },
    );
  }

  // R-CP-MILEAGE — 22k / 26k / 29k(SA); open-jaw surface mileage counts.
  const miles = ctx.totalMilesWithOpenJaw;
  const tier = cpTierFor(cabin, miles, includesSA);
  if (miles > 29000) {
    out.violate('R-CP-MILEAGE', `Total mileage ${miles.toLocaleString()} exceeds the maximum 29,000-mile Circle Pacific cap.`, []);
  } else if (!tier) {
    // >26k without South America: only recoverable by adding South America.
    const msg = `Total mileage ${miles.toLocaleString()} exceeds the 26,000-mile cap; only the –CIR29SA fare (which must include South America) allows up to 29,000 miles.`;
    if (complete) out.violate('R-CP-MILEAGE', msg, [], { monotone: false });
    else out.warn('R-CP-MILEAGE', msg, []);
  } else if (miles > tier.cap * 0.97) {
    out.warn(
      'R-CP-MILEAGE',
      `Total mileage ${miles.toLocaleString()} is within 3% of the ${tier.cap.toLocaleString()}-mile cap — GDS ticketed-point mileage may differ.`,
      [],
    );
  }
  out.assume('Mileage is great-circle distance; GDS ticketed-point mileage (TPM) typically differs by up to ~2%.');

  // R-CP-STOPOVERS
  const stops = stopoverPoints(ctx);
  const freeCap = tier ? { 22000: 4, 26000: 5, 29000: 6 }[tier.cap]! : 6;
  out.todo('R-CP-STOPOVERS', 'Make at least 2 stopovers (>24h)', stops.length >= 2);
  out.todo(
    'R-CP-STOPOVERS',
    'Make at least 2 stopovers outside the country of origin',
    stops.filter((p) => p.country !== ctx.origin.country).length >= 2,
  );

  // Only one stopover permitted at any point.
  const stopCities = new Map<string, number[]>();
  stops.forEach((p) => stopCities.set(p.cityCode, [...(stopCities.get(p.cityCode) ?? []), p.arrivingSegment]));
  for (const [city, idxs] of stopCities) {
    if (idxs.length > 1) {
      out.violate('R-CP-STOPOVERS', `Only one stopover is permitted at any point (${city} has ${idxs.length}).`, idxs);
    }
  }

  const inOrigin = stops.filter((p) => p.country === ctx.origin.country);
  if (inOrigin.length > 1) {
    out.violate(
      'R-CP-STOPOVERS',
      'A maximum of one stopover is permitted in the country of origin (additional purchased stopovers are not permitted there either).',
      inOrigin.map((p) => p.arrivingSegment),
    );
  }

  const byRegion = new Map<Continent, number[]>();
  stops.forEach((p) => byRegion.set(p.continent, [...(byRegion.get(p.continent) ?? []), p.arrivingSegment]));
  for (const [cont, idxs] of byRegion) {
    if (idxs.length > 4) {
      out.violate(
        'R-CP-STOPOVERS',
        `A maximum of 2 free + 2 additional stopovers is permitted per region (${CONTINENT_NAMES[cont]} has ${idxs.length}).`,
        idxs,
      );
    } else if (idxs.length > 2) {
      out.warn(
        'R-CP-STOPOVERS',
        `${CONTINENT_NAMES[cont]} has ${idxs.length} stopovers; beyond 2 per region each costs USD 150 (max 2 additional).`,
        idxs,
      );
    }
  }

  if (stops.length > freeCap + 4) {
    out.violate('R-CP-STOPOVERS', `Too many stopovers (${stops.length}); the fare allows ${freeCap} free plus limited USD 150 additional stopovers.`, [], { monotone: false });
  } else if (stops.length > freeCap) {
    out.warn(
      'R-CP-STOPOVERS',
      `${stops.length - freeCap} stopover(s) beyond the ${freeCap} free permitted will cost USD 150 each.`,
      [],
    );
  }

  // R-CP-MINSTAY — date-dependent.
  const intl = ctx.segs.filter((s) => s.international && !s.surface);
  const minDays = cabin === 'economy' ? 10 : 5;
  const first = intl[0];
  const last = intl[intl.length - 1];
  if (first?.date && last?.date && intl.length >= 2) {
    const days = (Date.parse(last.date) - Date.parse(first.date)) / 86400000;
    if (days < minDays) {
      out.violate('R-CP-MINSTAY', `Minimum stay is ${minDays} days for ${cabin} class before return travel may commence.`, [last.index], { monotone: false });
    }
  } else {
    out.assume(`Minimum stay: ${minDays} days (${cabin} class) from the day after the first international departure (attach dates to check). Maximum stay 12 months.`);
  }
}
