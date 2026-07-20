import type { CabinClass, Continent } from '@rtw/shared';
import type { Ctx } from './context.js';

const CABIN_LETTER: Record<CabinClass, string> = {
  economy: 'L',
  'premium-economy': 'W', // not offered on any oneworld product; W is defensive
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
    case 'premium-economy':
      return []; // not offered on Global Explorer
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
  if (cabin === 'premium-economy') return null; // not offered on Circle Pacific
  const letter = CABIN_LETTER[cabin];
  if (includesSouthAmerica) {
    return miles <= 29000 ? { code: `${letter}CIR29SA`, cap: 29000 } : null;
  }
  if (miles <= 22000) return { code: `${letter}CIR22`, cap: 22000 };
  if (miles <= 26000) return { code: `${letter}CIR26`, cap: 26000 };
  return null;
}

/**
 * Star Alliance RTW tier (T&C §2.1/§2.2 table). `special` fares have tighter
 * stopover bands and are cheaper; Normal fares always allow 2–15 stopovers.
 * Codes are descriptive (the T&C publishes no GDS fare-basis codes).
 */
export interface StarTier extends MileageTier {
  special: boolean;
  minStops: number;
  maxStops: number;
}

const STAR_CABIN_LETTER: Record<CabinClass, string> = {
  economy: 'Y',
  'premium-economy': 'W',
  business: 'C',
  first: 'F',
};

export function starTiers(cabin: CabinClass): StarTier[] {
  const L = STAR_CABIN_LETTER[cabin];
  const normal = (cap: number): StarTier => ({
    code: `${L}STAR${cap / 1000}`,
    cap,
    special: false,
    minStops: 2,
    maxStops: 15,
  });
  const special = (cap: number, maxStops: number): StarTier => ({
    code: `${L}STAR${cap / 1000}SP`,
    cap,
    special: true,
    minStops: 3,
    maxStops,
  });
  switch (cabin) {
    case 'economy':
      // Ordered cheapest-first at each cap: Special undercuts Normal.
      return [
        special(26000, 5),
        special(29000, 7), normal(29000),
        special(34000, 10), normal(34000),
        special(39000, 12), normal(39000),
      ];
    case 'business':
      return [special(26000, 15), normal(29000), normal(34000), normal(39000)];
    case 'premium-economy':
    case 'first':
      return [normal(29000), normal(34000), normal(39000)];
  }
}

/**
 * Lowest applicable Star tier for display. Special fares require ≥3 stopovers,
 * respect the tier's stopover ceiling, and are not offered ex-Japan (§2.2).
 */
export function starTierFor(
  cabin: CabinClass,
  miles: number,
  stopovers: number,
  originJapan: boolean,
): StarTier | null {
  return (
    starTiers(cabin).find(
      (t) =>
        miles <= t.cap &&
        stopovers <= t.maxStops &&
        (!t.special || (stopovers >= t.minStops && !originJapan)),
    ) ?? null
  );
}

/** The legality envelope for Star RTW: the most permissive tier per cabin. */
export function starMaxCap(cabin: CabinClass): number {
  return Math.max(...starTiers(cabin).map((t) => t.cap));
}
