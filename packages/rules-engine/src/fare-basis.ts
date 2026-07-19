import type { CabinClass, Continent } from '@rtw/shared';
import type { Ctx } from './context.js';

const CABIN_LETTER: Record<CabinClass, string> = {
  economy: 'L',
  business: 'D',
  first: 'A',
};

/**
 * Continents counted for 3015 pricing: every continent visited or transited,
 * plus the quirk that a single flight/surface sector between SWP and
 * Europe/Middle East is deemed to travel via Asia (3015 §0).
 */
export function continentsCounted3015(ctx: Ctx): Continent[] {
  const set = new Set<Continent>(ctx.points.map((p) => p.continent));
  for (const s of ctx.segs) {
    const pair = new Set([s.fromPoint.continent, s.toPoint.continent]);
    if (pair.has('SWP') && pair.has('EUME')) set.add('AS');
  }
  return [...set];
}

export function fareBasis3015(ctx: Ctx, cabin: CabinClass): string {
  const n = Math.min(6, Math.max(3, continentsCounted3015(ctx).length));
  return `${CABIN_LETTER[cabin]}ONE${n}`;
}

export interface MileageTier {
  code: string;
  cap: number;
}

/** Global Explorer (9701) mileage tiers by cabin. */
export function globTiers(cabin: CabinClass): MileageTier[] {
  switch (cabin) {
    case 'economy':
      return [
        { code: 'LGLOB26', cap: 26000 },
        { code: 'LGLOB29', cap: 29000 },
        { code: 'LGLOB34', cap: 34000 },
        { code: 'LGLOB39', cap: 39000 },
      ];
    case 'business':
      return [
        { code: 'IGLOB26', cap: 26000 },
        { code: 'DGLOB34', cap: 34000 },
      ];
    case 'first':
      return [{ code: 'AGLOB34', cap: 34000 }];
  }
}

export function globTierFor(cabin: CabinClass, miles: number): MileageTier | null {
  return globTiers(cabin).find((t) => miles <= t.cap) ?? null;
}

/** Circle Pacific (7889) tier: 29SA is mandatory iff South America included. */
export function cpTierFor(
  cabin: CabinClass,
  miles: number,
  includesSouthAmerica: boolean,
): MileageTier | null {
  const letter = CABIN_LETTER[cabin];
  if (includesSouthAmerica) {
    return miles <= 29000 ? { code: `${letter}CIR29SA`, cap: 29000 } : null;
  }
  if (miles <= 22000) return { code: `${letter}CIR22`, cap: 22000 };
  if (miles <= 26000) return { code: `${letter}CIR26`, cap: 26000 };
  return null;
}
