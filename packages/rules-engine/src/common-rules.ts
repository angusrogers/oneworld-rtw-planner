import {
  AU_RESTRICTED_PAIRS,
  CODESHARE_EXCEPTIONS,
  CONTINENT_NAMES,
  CP_AY_SECTORS,
  HAWAII_AIRPORTS,
  PRODUCT_CARRIERS,
  US_TRANSCON_COLUMN_A,
  US_TRANSCON_COLUMN_B,
  type Continent,
  type FareProduct,
  type TC,
} from '@rtw/shared';
import type { Out } from './collector.js';
import { intermediatePoints, stopoverPoints, type Ctx, type Point } from './context.js';

const next = (t: TC): TC => ((t % 3) + 1) as TC;
const prev = (t: TC): TC => (((t + 1) % 3) + 1) as TC;

/** R-OCEAN — one Atlantic and one Pacific crossing, exactly (3015/9701 §4). */
export function ruleOceans(ctx: Ctx, out: Out) {
  const atl = ctx.segs.filter((s) => s.crossesAtlantic);
  const pac = ctx.segs.filter((s) => s.crossesPacific);
  if (atl.length > 1) {
    out.violate('R-OCEAN', 'Only one Atlantic crossing (TC1↔TC2) is permitted.', atl.map((s) => s.index));
  }
  if (pac.length > 1) {
    out.violate('R-OCEAN', 'Only one Pacific crossing (TC1↔TC3) is permitted.', pac.map((s) => s.index));
  }
  out.todo('R-OCEAN', 'Cross the Atlantic Ocean (TC1↔TC2)', atl.length >= 1);
  out.todo('R-OCEAN', 'Cross the Pacific Ocean (TC1↔TC3)', pac.length >= 1);
}

/** R-DIRECTION — continuous forward direction TC1→TC2→TC3 (wrapping). */
export function ruleDirection(ctx: Ctx, out: Out, opts: { hawaiiException: boolean }) {
  const seq: { tc: TC; segIdx: number }[] = [];
  ctx.points.forEach((p, i) => {
    if (seq.length === 0 || seq[seq.length - 1].tc !== p.tc) {
      seq.push({ tc: p.tc, segIdx: Math.max(0, i - 1) });
    }
  });
  const transitions = seq.length - 1;
  if (transitions >= 1) {
    const forward = seq[1].tc === next(seq[0].tc);
    const step = forward ? next : prev;
    for (let i = 1; i < seq.length; i++) {
      if (seq[i].tc !== step(seq[i - 1].tc)) {
        out.violate(
          'R-DIRECTION',
          'Travel must continue in one direction around the world (TC1→TC2→TC3 or the reverse); this segment backtracks across traffic conferences.',
          [seq[i].segIdx],
        );
      }
    }
    if (transitions > 3) {
      out.violate(
        'R-DIRECTION',
        'The itinerary re-enters a traffic conference it already left — more than one full circuit is not permitted.',
        [seq[4].segIdx],
      );
    }
  }

  if (opts.hawaiiException) {
    // 3015 §4(b): no backtracking between Hawaii and other points in North America.
    const crossings = ctx.segs.filter((s) => {
      if (s.fromPoint.continent !== 'NA' || s.toPoint.continent !== 'NA') return false;
      return HAWAII_AIRPORTS.has(s.fromPoint.iata) !== HAWAII_AIRPORTS.has(s.toPoint.iata);
    });
    if (crossings.length > 1) {
      out.violate(
        'R-HAWAII',
        'Backtracking between Hawaii and other points in North America is not permitted (only one Hawaii↔mainland sector allowed).',
        crossings.map((s) => s.index),
      );
    }
  }
}

/** Origin-destination surface (open-jaw) permissions, rules 3015/9701 §4(c/d). */
export function openJawAllowed(origin: Point, end: Point): boolean {
  if (origin.country === end.country) return true;
  if (origin.zone === 'ME' && end.zone === 'ME') return true;
  const pair = new Set([origin.country, end.country]);
  if (pair.has('US') && pair.has('CA')) return true;
  if (pair.has('HK') && pair.has('CN')) return true;
  if (pair.has('MY') && (origin.iata === 'SIN' || end.iata === 'SIN')) return true;
  if (origin.continent === 'AF' && end.continent === 'AF') return true;
  if (pair.has('MV') && (pair.has('LK') || pair.has('IN'))) return true;
  return false;
}

/** R-RETURN — journey must end where it began (or permitted surface open-jaw). */
export function ruleReturn(
  ctx: Ctx,
  out: Out,
  complete: boolean,
  allowed: (origin: Point, end: Point) => boolean,
) {
  const returned = ctx.current.cityCode === ctx.origin.cityCode;
  const openJaw = !returned && allowed(ctx.origin, ctx.current);
  out.todo(
    'R-RETURN',
    `Return to ${ctx.origin.cityCode} (or a permitted surface open-jaw point)`,
    ctx.segs.length > 0 && (returned || openJaw),
  );
  if (complete && !returned && !openJaw) {
    out.violate(
      'R-RETURN',
      `The journey must end at ${ctx.origin.cityCode} or a permitted open-jaw point; ${ctx.current.iata} does not qualify.`,
      [ctx.segs.length - 1],
      { monotone: false },
    );
  }
}

/** R-NOT-VIA-ORIGIN — may not pass through the origin point mid-journey. */
export function ruleNotViaOrigin(ctx: Ctx, out: Out) {
  intermediatePoints(ctx).forEach((p) => {
    if (p.cityCode === ctx.origin.cityCode) {
      out.violate(
        'R-NOT-VIA-ORIGIN',
        `Travel may not pass through the origin point (${ctx.origin.cityCode}) mid-journey.`,
        [p.arrivingSegment],
      );
    }
  });
}

/**
 * R-INTERCONT — intercontinental departures/arrivals per continent.
 * Base cap 1; two in North America; two in Asia; two in Europe/Middle East for
 * travel via Africa (9701: Africa excluding South Africa & Mauritius).
 */
export function ruleIntercont(
  ctx: Ctx,
  out: Out,
  complete: boolean,
  opts: { africaTriggerExcludesZaMu: boolean; euBothWaysZaMuCheck: boolean },
) {
  const deps = new Map<Continent, number[]>();
  const arrs = new Map<Continent, number[]>();
  ctx.segs.forEach((s) => {
    if (!s.intercontinental) return;
    deps.set(s.fromPoint.continent, [...(deps.get(s.fromPoint.continent) ?? []), s.index]);
    arrs.set(s.toPoint.continent, [...(arrs.get(s.toPoint.continent) ?? []), s.index]);
  });

  const africaVisited = ctx.points.some(
    (p) =>
      p.continent === 'AF' &&
      (!opts.africaTriggerExcludesZaMu || !['ZA', 'MU'].includes(p.country)),
  );

  const capFor = (c: Continent): number => {
    if (c === 'NA' || c === 'AS') return 2;
    if (c === 'EUME') return africaVisited ? 2 : 1;
    return 1;
  };

  for (const [kind, map] of [['departure', deps], ['arrival', arrs]] as const) {
    for (const [cont, idxs] of map) {
      const cap = capFor(cont);
      if (idxs.length > cap) {
        // A second EUME intercont may become legal once Africa is added.
        const maybeAfricaLater = cont === 'EUME' && !africaVisited && idxs.length === 2;
        if (maybeAfricaLater && !complete) {
          out.warn(
            'R-INTERCONT',
            `A second intercontinental ${kind} in Europe/Middle East is only permitted when the itinerary travels via Africa${opts.africaTriggerExcludesZaMu ? ' (other than South Africa/Mauritius)' : ''}.`,
            idxs,
          );
        } else {
          out.violate(
            'R-INTERCONT',
            `Only ${cap === 2 ? 'two' : 'one'} intercontinental ${kind}${cap === 2 ? 's are' : ' is'} permitted in ${CONTINENT_NAMES[cont]}${cont === 'EUME' && !africaVisited ? ' (two only when travelling via Africa)' : ''}.`,
            idxs,
            { monotone: idxs.length > 2 || !(cont === 'EUME' && !africaVisited) },
          );
        }
      }
    }
  }

  if (opts.euBothWaysZaMuCheck) {
    // 3015 §4(e)3: if travel is to/from Europe (not Middle East) in both
    // directions, the itinerary may not include Mauritius/South Africa.
    const zaMu = ctx.points.filter((p) => ['ZA', 'MU'].includes(p.country));
    if (zaMu.length > 0) {
      const eumeTouches = ctx.segs.filter(
        (s) => s.intercontinental && (s.fromPoint.continent === 'EUME' || s.toPoint.continent === 'EUME'),
      );
      const allViaEurope =
        eumeTouches.length >= 2 &&
        eumeTouches.every((s) => {
          const p = s.fromPoint.continent === 'EUME' ? s.fromPoint : s.toPoint;
          return p.zone === 'EU';
        });
      if (allViaEurope) {
        const msg =
          'When travel is to/from Europe in both directions, the itinerary may not include South Africa or Mauritius (route via the Middle East instead).';
        if (complete) {
          out.violate('R-INTERCONT-ZAMU', msg, zaMu.map((p) => p.arrivingSegment), { monotone: false });
        } else {
          out.warn('R-INTERCONT-ZAMU', msg, zaMu.map((p) => p.arrivingSegment));
        }
      }
    }
  }
}

/** R-ORIGIN-COUNTRY — international departures/arrivals from/to origin country. */
export function ruleOriginCountry(ctx: Ctx, out: Out, complete: boolean) {
  const oc = ctx.origin.country;
  const intlDeps = ctx.segs.filter((s) => s.international && s.fromPoint.country === oc);
  const intlArrs = ctx.segs.filter((s) => s.international && s.toPoint.country === oc);
  const cap = oc === 'US' ? 2 : 1;
  for (const [kind, list] of [['departures from', intlDeps], ['arrivals to', intlArrs]] as const) {
    if (list.length > cap) {
      out.violate(
        'R-ORIGIN-COUNTRY',
        `Only ${cap === 2 ? 'two' : 'one'} international ${kind} the country of origin ${cap === 2 ? 'are' : 'is'} permitted${oc === 'US' ? '' : ' (two only for USA origin)'}.`,
        list.map((s) => s.index),
      );
    }
  }
  if (oc === 'US' && (intlDeps.length === 2 || intlArrs.length === 2)) {
    // The extra arrival-departure must be a transfer without stopover.
    const midUsStop = intermediatePoints(ctx).filter((p) => p.country === oc && p.stopover);
    if (midUsStop.length > 0) {
      out.violate(
        'R-ORIGIN-COUNTRY',
        'A second international arrival/departure for a USA origin is only permitted when the intermediate USA visit is a transfer without stopover.',
        midUsStop.map((p) => p.arrivingSegment),
        { monotone: false },
      );
    }
  }
  ruleIntlTransfers(ctx, out, 4);
}

/** Max N international transfers from any one country (3015/9701/7889). */
export function ruleIntlTransfers(ctx: Ctx, out: Out, cap: number) {
  const byCountry = new Map<string, Point[]>();
  intermediatePoints(ctx).forEach((p) => {
    if (p.stopover) return;
    const arriving = ctx.segs[p.arrivingSegment];
    const departing = ctx.segs[p.arrivingSegment + 1];
    const intl = arriving?.international || departing?.international;
    if (intl) byCountry.set(p.country, [...(byCountry.get(p.country) ?? []), p]);
  });
  for (const [country, pts] of byCountry) {
    if (pts.length > cap) {
      out.violate(
        'R-INTL-TRANSFERS',
        `No more than ${cap} international transfers are permitted in any one country (${country} has ${pts.length}).`,
        pts.map((p) => p.arrivingSegment),
      );
    }
  }
}

/** R-SURFACE — intermediate surface sectors; transoceanic surface restricted. */
export function ruleSurface(ctx: Ctx, out: Out) {
  const transoceanic = ctx.segs.filter(
    (s) => s.surface && (s.crossesAtlantic || s.crossesPacific),
  );
  const allowance = ctx.origin.continent === 'SWP' ? 1 : 0;
  if (transoceanic.length > allowance) {
    out.violate(
      'R-SURFACE',
      allowance === 1
        ? 'Only one transoceanic surface sector (TC1↔TC2 or TC1↔TC3) is permitted for itineraries originating in the South West Pacific.'
        : 'Transoceanic surface sectors between TC1–TC2 or TC1–TC3 are not permitted (exception: one for itineraries originating in the South West Pacific).',
      transoceanic.map((s) => s.index),
    );
  }
}

/** R-SEGMENTS — 3–16 segments; optional per-continent flight caps (3015). */
export function ruleSegmentLimits(
  ctx: Ctx,
  out: Out,
  opts: { perContinentCaps?: Partial<Record<Continent, number>>; maxSegments?: number },
) {
  const max = opts.maxSegments ?? 16;
  if (ctx.segs.length > max) {
    out.violate(
      'R-SEGMENTS',
      `A maximum of ${max} segments (including surface sectors) is permitted; this itinerary has ${ctx.segs.length}.`,
      [],
    );
  }
  out.todo('R-SEGMENTS', 'Use at least 3 segments', ctx.segs.length >= 3);

  if (opts.perContinentCaps) {
    const counts = new Map<Continent, number[]>();
    ctx.segs.forEach((s) => {
      if (s.surface) return;
      if (s.fromPoint.continent === s.toPoint.continent) {
        const c = s.fromPoint.continent;
        counts.set(c, [...(counts.get(c) ?? []), s.index]);
      }
    });
    for (const [cont, idxs] of counts) {
      const cap = opts.perContinentCaps[cont];
      if (cap !== undefined && idxs.length > cap) {
        out.violate(
          'R-SEGMENTS-CONTINENT',
          `At most ${cap} flight segments are permitted within ${CONTINENT_NAMES[cont]} (this itinerary has ${idxs.length}).`,
          idxs,
        );
      }
    }
  }
}

/** R-NO-REPEAT — same city pair may not be flown twice in the same direction. */
export function ruleNoRepeat(ctx: Ctx, out: Out) {
  const seen = new Map<string, number>();
  ctx.segs.forEach((s) => {
    const key = `${s.fromPoint.cityCode}>${s.toPoint.cityCode}`;
    const first = seen.get(key);
    if (first !== undefined) {
      out.violate(
        'R-NO-REPEAT',
        `The city pair ${s.fromPoint.cityCode}–${s.toPoint.cityCode} may not be travelled more than once in the same direction.`,
        [first, s.index],
      );
    } else {
      seen.set(key, s.index);
    }
  });
}

/** R-CARRIER — every flight must be on an eligible operating carrier. */
export function ruleCarriers(ctx: Ctx, out: Out, product: FareProduct) {
  const eligible = PRODUCT_CARRIERS[product];
  const exceptions = CODESHARE_EXCEPTIONS[product];
  ctx.segs.forEach((s) => {
    if (s.surface || !s.carrier) return;
    if (eligible.has(s.carrier)) {
      if (product === 'circle-pacific' && s.carrier === 'AY') {
        // AY is not in the CP set, handled below — defensive, unreachable.
      }
      return;
    }
    if (product === 'circle-pacific' && s.carrier === 'AY') {
      const onAllowedSector = CP_AY_SECTORS.some(
        ([a, b]) =>
          (s.fromPoint.iata === a && s.toPoint.iata === b) ||
          (s.fromPoint.iata === b && s.toPoint.iata === a),
      );
      if (onAllowedSector) {
        out.warn('R-CARRIER', exceptions.AY, [s.index]);
      } else {
        out.violate('R-CARRIER', 'AY (Finnair) is only eligible on its SYD–SIN/BKK services for Circle Pacific.', [s.index]);
      }
      return;
    }
    if (exceptions[s.carrier]) {
      out.warn('R-CARRIER', exceptions[s.carrier], [s.index]);
    } else {
      out.violate(
        'R-CARRIER',
        `${s.carrier} is not an eligible carrier for this fare product.`,
        [s.index],
      );
    }
  });
}

/** R-CUBA — Cuba segments cannot coexist with AA/AS segments (US restriction). */
export function ruleCuba(ctx: Ctx, out: Out) {
  const cubaPoints = ctx.points.filter((p) => p.country === 'CU');
  const aaAs = ctx.segs.filter((s) => s.carrier && ['AA', 'AS'].includes(s.carrier));
  if (cubaPoints.length > 0 && aaAs.length > 0) {
    out.violate(
      'R-CUBA',
      'A ticket including travel to/from/via Cuba may not include American Airlines or Alaska Airlines segments (US Government restriction).',
      aaAs.map((s) => s.index),
    );
  }
}

/** R-US-TRANSCON — one US transcontinental nonstop; one flight to/from Alaska. */
export function ruleUsTranscon(ctx: Ctx, out: Out) {
  const domesticNA = ctx.segs.filter(
    (s) =>
      !s.surface &&
      ['US', 'CA'].includes(s.fromPoint.country) &&
      ['US', 'CA'].includes(s.toPoint.country),
  );
  const transcons = domesticNA.filter((s) => {
    const a = s.fromPoint.airport.region;
    const b = s.toPoint.airport.region;
    if (!a || !b || s.fromPoint.country !== 'US' || s.toPoint.country !== 'US') return false;
    return (
      (US_TRANSCON_COLUMN_A.has(a) && US_TRANSCON_COLUMN_B.has(b)) ||
      (US_TRANSCON_COLUMN_B.has(a) && US_TRANSCON_COLUMN_A.has(b))
    );
  });
  if (transcons.length > 1) {
    out.violate(
      'R-US-TRANSCON',
      'Within the USA/Canada only one transcontinental nonstop (between a Column A and a Column B state) is permitted.',
      transcons.map((s) => s.index),
    );
  }
  const toAK = domesticNA.filter((s) => s.toPoint.airport.region === 'AK');
  const fromAK = domesticNA.filter((s) => s.fromPoint.airport.region === 'AK');
  if (toAK.length > 1) {
    out.violate('R-US-TRANSCON', 'Only one flight to the State of Alaska is permitted.', toAK.map((s) => s.index));
  }
  if (fromAK.length > 1) {
    out.violate('R-US-TRANSCON', 'Only one flight from the State of Alaska is permitted.', fromAK.map((s) => s.index));
  }
}

/** R-AU-NONSTOP — one nonstop among the restricted Australian pairs. */
export function ruleAuNonstop(ctx: Ctx, out: Out) {
  const matches = ctx.segs.filter((s) => {
    if (s.surface) return false;
    return AU_RESTRICTED_PAIRS.some(
      ([a, b]) =>
        (s.fromPoint.iata === a && s.toPoint.iata === b) ||
        (s.fromPoint.iata === b && s.toPoint.iata === a),
    );
  });
  if (matches.length > 1) {
    out.violate(
      'R-AU-NONSTOP',
      'Within Australia only one nonstop flight is permitted among the restricted pairs (BME/DRW/KTA/PER to the east-coast points).',
      matches.map((s) => s.index),
    );
  }
}

/** Date-dependent min/max-stay checks (3015/9701). */
export function ruleStayLimits(ctx: Ctx, out: Out) {
  const intl = ctx.segs.filter((s) => s.international && !s.surface);
  const first = intl[0];
  const last = intl[intl.length - 1];
  if (ctx.origin.tc === 1) {
    if (first?.date && last?.date && intl.length >= 2) {
      const days = (Date.parse(last.date) - Date.parse(first.date)) / 86400000;
      if (days < 10) {
        out.violate(
          'R-MINSTAY',
          'For itineraries originating in TC1, the last international sector must depart at least 10 days after the first.',
          [last.index],
          { monotone: false },
        );
      }
    } else {
      out.assume('TC1 origin: the last international sector must depart ≥10 days after the first (attach dates to check).');
    }
  }
  if (first?.date && last?.date) {
    const months = (Date.parse(last.date) - Date.parse(first.date)) / (86400000 * 30.44);
    if (months > 12) {
      out.violate('R-MAXSTAY', 'Return travel must commence no later than 12 months after departure.', [last.index], { monotone: false });
    }
  } else {
    out.assume('Return travel from the last stopover must commence within 12 months of departure.');
  }
}
