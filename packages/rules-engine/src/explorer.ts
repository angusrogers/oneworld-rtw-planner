import type { Continent } from '@rtw/shared';
import { CONTINENT_NAMES } from '@rtw/shared';
import type { Out } from './collector.js';
import {
  openJawAllowed,
  ruleAuNonstop,
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
  ruleUsTranscon,
} from './common-rules.js';
import { stopoverPoints, type Ctx } from './context.js';

const PER_CONTINENT_CAPS: Partial<Record<Continent, number>> = {
  AF: 4, AS: 4, EUME: 4, NA: 6, SA: 4, SWP: 4,
};

/** oneworld Explorer — Rule 3015 (continent-priced). */
export function validateExplorer(ctx: Ctx, out: Out, complete: boolean) {
  ruleCarriers(ctx, out, 'explorer');
  ruleOceans(ctx, out);
  ruleDirection(ctx, out, { hawaiiException: true });
  ruleReturn(ctx, out, complete, openJawAllowed);
  ruleNotViaOrigin(ctx, out);
  ruleIntercont(ctx, out, complete, {
    africaTriggerExcludesZaMu: false,
    euBothWaysZaMuCheck: true,
  });
  ruleOriginCountry(ctx, out, complete);
  ruleSurface(ctx, out);
  ruleSegmentLimits(ctx, out, { perContinentCaps: PER_CONTINENT_CAPS });
  ruleNoRepeat(ctx, out);
  ruleUsTranscon(ctx, out);
  ruleAuNonstop(ctx, out);
  ruleCuba(ctx, out);
  ruleStayLimits(ctx, out);

  // R-STOPOVERS: minimum 2 overall; maximum 2 in the continent of origin.
  const stops = stopoverPoints(ctx);
  out.todo('R-STOPOVERS', 'Make at least 2 stopovers (>24h)', stops.length >= 2);
  const inOrigin = stops.filter((p) => p.continent === ctx.origin.continent);
  if (inOrigin.length > 2) {
    out.violate(
      'R-STOPOVERS',
      `A maximum of 2 stopovers is permitted in the continent of origin (${CONTINENT_NAMES[ctx.origin.continent]}).`,
      inOrigin.map((p) => p.arrivingSegment),
    );
  }
}
