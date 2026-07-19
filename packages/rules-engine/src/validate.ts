import type {
  AirportLookup,
  Continent,
  Itinerary,
  ItineraryStats,
  ValidationResult,
} from '@rtw/shared';
import { Out } from './collector.js';
import { buildContext, stopoverPoints, type Ctx } from './context.js';
import { validateCirclePacific } from './circle-pacific.js';
import { validateExplorer } from './explorer.js';
import { validateGlobalExplorer } from './global-explorer.js';
import {
  continentsCounted3015,
  cpTierFor,
  fareBasis3015,
  globTierFor,
} from './fare-basis.js';

const AMERICAS: Continent[] = ['NA', 'SA'];

function buildStats(ctx: Ctx): ItineraryStats {
  const intra: Partial<Record<Continent, number>> = {};
  ctx.segs.forEach((s) => {
    if (!s.surface && s.fromPoint.continent === s.toPoint.continent) {
      const c = s.fromPoint.continent;
      intra[c] = (intra[c] ?? 0) + 1;
    }
  });
  const stops = stopoverPoints(ctx);
  const stopsByCont: Partial<Record<Continent, number>> = {};
  stops.forEach((p) => {
    stopsByCont[p.continent] = (stopsByCont[p.continent] ?? 0) + 1;
  });
  return {
    segmentCount: ctx.segs.length,
    flightSegmentCount: ctx.segs.filter((s) => !s.surface).length,
    surfaceSegmentCount: ctx.segs.filter((s) => s.surface).length,
    flownMiles: ctx.totalMiles,
    totalMiles: ctx.totalMilesWithOpenJaw,
    continentsCounted:
      ctx.itinerary.product === 'explorer'
        ? continentsCounted3015(ctx)
        : [...new Set(ctx.points.map((p) => p.continent))],
    intraContinentFlights: intra,
    atlanticCrossings: ctx.segs.filter((s) => s.crossesAtlantic).length,
    pacificCrossings: ctx.segs.filter((s) => s.crossesPacific).length,
    northPacificCrossings: ctx.segs.filter((s) => {
      const pair = [s.fromPoint.continent, s.toPoint.continent];
      return pair.includes('AS') && pair.some((c) => AMERICAS.includes(c));
    }).length,
    southPacificCrossings: ctx.segs.filter((s) => {
      const pair = [s.fromPoint.continent, s.toPoint.continent];
      return pair.includes('SWP') && pair.some((c) => AMERICAS.includes(c));
    }).length,
    stopoverCount: stops.length,
    stopoversByContinent: stopsByCont,
  };
}

function deriveFareBasis(ctx: Ctx): string | null {
  const { product, cabin } = ctx.itinerary;
  switch (product) {
    case 'explorer':
      return fareBasis3015(ctx, cabin);
    case 'global-explorer':
      return globTierFor(cabin, ctx.totalMilesWithOpenJaw)?.code ?? null;
    case 'circle-pacific': {
      const includesSA = ctx.points.some((p) => p.continent === 'SA');
      return cpTierFor(cabin, ctx.totalMilesWithOpenJaw, includesSA)?.code ?? null;
    }
  }
}

const EMPTY_STATS: ItineraryStats = {
  segmentCount: 0,
  flightSegmentCount: 0,
  surfaceSegmentCount: 0,
  flownMiles: 0,
  totalMiles: 0,
  continentsCounted: [],
  intraContinentFlights: {},
  atlanticCrossings: 0,
  pacificCrossings: 0,
  northPacificCrossings: 0,
  southPacificCrossings: 0,
  stopoverCount: 0,
  stopoversByContinent: {},
};

export interface ValidateOptions {
  /** true = treat the itinerary as finished (todos become requirements). */
  complete?: boolean;
}

/**
 * Validate an itinerary against its fare product's rules.
 *
 * With `complete: false` (default) only monotone rules produce violations —
 * `extensible: false` means no legal completion exists. Completable rules
 * appear as `todos`; date-dependent rules as `assumptions` unless dates given.
 */
export function validate(
  itinerary: Itinerary,
  lookup: AirportLookup,
  opts: ValidateOptions = {},
): ValidationResult {
  const complete = opts.complete ?? false;

  if (itinerary.segments.length === 0) {
    return {
      valid: false,
      extensible: true,
      violations: [],
      warnings: [],
      todos: [],
      assumptions: [],
      stats: EMPTY_STATS,
      fareBasis: null,
    };
  }

  const ctx = buildContext(itinerary, lookup);
  const out = new Out();

  switch (itinerary.product) {
    case 'explorer':
      validateExplorer(ctx, out, complete);
      break;
    case 'global-explorer':
      validateGlobalExplorer(ctx, out, complete);
      break;
    case 'circle-pacific':
      validateCirclePacific(ctx, out, complete);
      break;
  }

  const anyStopoverDefaults = itinerary.segments.some(
    (s, i) => i < itinerary.segments.length - 1 && s.stopover === undefined,
  );
  if (anyStopoverDefaults) {
    out.assume(
      'Intermediate points are treated as transfers (<24h) unless marked as stopovers. Tick “stop” at each point where you will stay longer than 24 hours — the fare requires at least 2.',
    );
  }

  const todosDone = out.todos.every((t) => t.done);
  return {
    valid: complete && out.violations.length === 0 && todosDone,
    extensible: !out.monotoneViolated,
    violations: out.violations,
    warnings: out.warnings,
    todos: out.todos,
    assumptions: out.assumptions,
    stats: buildStats(ctx),
    fareBasis: deriveFareBasis(ctx),
  };
}

/**
 * Speculative next-hop check for the map: is `candidate` a legal extension
 * from the current end of the itinerary?
 */
export function canExtend(
  itinerary: Itinerary,
  lookup: AirportLookup,
  candidate: { to: string; carrier?: string; surface?: boolean },
): ValidationResult {
  const from =
    itinerary.segments.length > 0
      ? itinerary.segments[itinerary.segments.length - 1].to
      : null;
  if (!from) throw new Error('cannot extend an empty itinerary; set an origin first');
  return validate(
    {
      ...itinerary,
      segments: [...itinerary.segments, { from, ...candidate }],
    },
    lookup,
  );
}
