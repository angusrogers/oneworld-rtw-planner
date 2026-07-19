import { CONTINENT_NAMES, type Continent } from '@rtw/shared';
import type { Out } from './collector.js';
import {
  openJawAllowed,
  ruleCarriers,
  ruleCuba,
  ruleDirection,
  ruleIntercont,
  ruleNoRepeat,
  ruleNotViaOrigin,
  ruleOceans,
  ruleOriginCountry,
  ruleReturn,
  ruleSegmentLimits,
  ruleStayLimits,
  ruleSurface,
} from './common-rules.js';
import { globTierFor, globTiers } from './fare-basis.js';
import { stopoverPoints, type Ctx } from './context.js';

/** Global Explorer — Rule 9701 (mileage-priced). */
export function validateGlobalExplorer(ctx: Ctx, out: Out, complete: boolean) {
  const cabin = ctx.itinerary.cabin;

  ruleCarriers(ctx, out, 'global-explorer');
  ruleOceans(ctx, out);
  // 9701 §4(c) states no Hawaii exception to intra-continent backtracking.
  ruleDirection(ctx, out, { hawaiiException: false });
  ruleReturn(ctx, out, complete, openJawAllowed);
  ruleNotViaOrigin(ctx, out);
  ruleIntercont(ctx, out, complete, {
    africaTriggerExcludesZaMu: true,
    euBothWaysZaMuCheck: false,
  });
  ruleOriginCountry(ctx, out, complete);
  ruleSurface(ctx, out);
  ruleSegmentLimits(ctx, out, {});
  ruleNoRepeat(ctx, out);
  ruleCuba(ctx, out);
  ruleStayLimits(ctx, out);

  // R-MILEAGE — hard caps, no EMS. Open-jaw surface mileage counts (§4(d) note).
  const miles = ctx.totalMilesWithOpenJaw;
  const tiers = globTiers(cabin);
  const maxCap = tiers[tiers.length - 1].cap;
  const tier = globTierFor(cabin, miles);
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
  out.assume('Mileage is great-circle distance; GDS ticketed-point mileage (TPM) typically differs by up to ~2%.');

  // R-STOPOVERS-GE — caps depend on the mileage tier. For partial itineraries
  // validate against the most permissive tier still reachable (4/region), so
  // only truly unrecoverable states block the map.
  const stops = stopoverPoints(ctx);
  out.todo('R-STOPOVERS-GE', 'Make at least 2 stopovers (>24h)', stops.length >= 2);

  const is26k = tier?.cap === 26000;
  const regionCap = complete && is26k ? 2 : 4;
  const totalCap = complete && is26k ? 5 : Infinity;

  // A surface sector between two regions counts as a stopover in each region
  // but only once against the total.
  const crossRegionSurfacePairs = ctx.segs.filter(
    (s) =>
      s.surface &&
      s.fromPoint.continent !== s.toPoint.continent &&
      s.fromPoint.stopover &&
      s.toPoint.stopover,
  ).length;
  const totalStops = stops.length - crossRegionSurfacePairs;

  if (totalStops > totalCap) {
    out.violate(
      'R-STOPOVERS-GE',
      `The ${tier!.code} fare permits a maximum of ${totalCap} free stopovers (this itinerary has ${totalStops}).`,
      [],
      { monotone: false },
    );
  }
  const byRegion = new Map<Continent, number[]>();
  stops.forEach((p) => byRegion.set(p.continent, [...(byRegion.get(p.continent) ?? []), p.arrivingSegment]));
  for (const [cont, idxs] of byRegion) {
    const cap = cont === ctx.origin.continent ? 2 : regionCap;
    if (idxs.length > cap) {
      out.violate(
        'R-STOPOVERS-GE',
        cont === ctx.origin.continent
          ? `A maximum of 2 stopovers is permitted in the region of origin (${CONTINENT_NAMES[cont]}).`
          : `A maximum of ${cap} stopovers is permitted in ${CONTINENT_NAMES[cont]}${complete && is26k ? ' on 26,000-mile fares' : ''}.`,
        idxs,
        { monotone: cap === regionCap || cont === ctx.origin.continent },
      );
    } else if (!complete && idxs.length > 2 && cont !== ctx.origin.continent) {
      out.warn(
        'R-STOPOVERS-GE',
        `${idxs.length} stopovers in ${CONTINENT_NAMES[cont]} rules out the 26,000-mile fares (max 2 per region).`,
        idxs,
      );
    }
  }
}
