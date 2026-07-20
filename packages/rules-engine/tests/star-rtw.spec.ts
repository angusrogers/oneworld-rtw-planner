import { describe, expect, it } from 'vitest';
import type { Segment } from '@rtw/shared';
import { starTierFor, starTiers, validate } from '../src/index.js';
import { itin, lookup } from './helpers.js';

const star = (route: Parameters<typeof itin>[1], cabin: Parameters<typeof itin>[2] = 'economy') =>
  itin('star-rtw', route, cabin);

describe('Star Alliance RTW — carriers and cabins', () => {
  it('accepts Star members and rejects oneworld carriers', () => {
    const ok = validate(
      star([
        ['FRA', 'SIN', { carrier: 'LH', stopover: true }],
        ['SIN', 'SYD', { carrier: 'SQ', stopover: true }],
        ['SYD', 'LAX', { carrier: 'UA', stopover: true }],
        ['LAX', 'FRA', { carrier: 'LH' }],
      ]),
      lookup,
      { complete: true },
    );
    expect(ok.valid).toBe(true);
    expect(ok.violations).toEqual([]);

    const bad = validate(
      star([['FRA', 'SIN', { carrier: 'QF' }]]),
      lookup,
    );
    expect(bad.violations.some((v) => v.ruleId === 'R-CARRIER')).toBe(true);
    expect(bad.extensible).toBe(false);
  });

  it('premium economy is valid on star-rtw but not on oneworld products', () => {
    const starPe = validate(star('FRA-SIN-SYD-LAX-FRA', 'premium-economy'), lookup, { complete: true });
    expect(starPe.violations).toEqual([]);
    expect(starPe.fareBasis).toMatch(/^WSTAR/);

    const owPe = validate(itin('global-explorer', 'SYD-HKG-LHR', 'premium-economy'), lookup);
    expect(owPe.violations.some((v) => v.ruleId === 'R-CABIN')).toBe(true);
    expect(owPe.fareBasis).toBeNull();
  });
});

describe('Star Alliance RTW — routing', () => {
  it('permits ending in a different city of the origin country', () => {
    // JFK out, LAX home — same country, different city (T&C §3.1.1).
    const r = validate(star('JFK-LHR-BKK-SYD-LAX'), lookup, { complete: true });
    expect(r.violations).toEqual([]);
    expect(r.todos.find((t) => t.ruleId === 'R-RETURN')?.done).toBe(true);
  });

  it('rejects ending outside the origin country', () => {
    const r = validate(star('JFK-LHR-BKK-SYD-AKL'), lookup, { complete: true });
    expect(r.violations.some((v) => v.ruleId === 'R-RETURN')).toBe(true);
    // Not monotone: the itinerary could continue to a US point.
    expect(r.extensible).toBe(true);
  });

  it('limits each TC boundary to one crossing', () => {
    // FRA→JFK (Atlantic), JFK→NRT (Pacific), NRT→DOH (TC3→TC2), DOH→BKK re-crosses TC2↔TC3.
    const r = validate(star('FRA-JFK-NRT-DOH-BKK'), lookup);
    expect(
      r.violations.some((v) => v.ruleId === 'R-OCEAN' && v.message.includes('Asia')),
    ).toBe(true);
    expect(r.extensible).toBe(false);
  });

  it('requires all three TC-boundary crossings to finish', () => {
    const r = validate(star('FRA-SIN'), lookup);
    const oceanTodos = r.todos.filter((t) => t.ruleId === 'R-OCEAN');
    expect(oceanTodos).toHaveLength(3);
    expect(oceanTodos.filter((t) => t.done)).toHaveLength(1); // TC2↔TC3 done
  });

  it('forbids a surface sector as the first intercontinental crossing', () => {
    const r = validate(
      star([
        ['SYD', 'MEL', {}],
        ['MEL', 'SIN', { surface: true }],
      ]),
      lookup,
    );
    expect(r.violations.some((v) => v.ruleId === 'R-SURFACE-FIRST')).toBe(true);
    expect(r.extensible).toBe(false);
  });

  it('allows at most 5 surface sectors', () => {
    const hops: Array<[string, string, Partial<Segment>?]> = [
      ['SYD', 'MEL', { surface: true }],
      ['MEL', 'ADL', { surface: true }],
      ['ADL', 'PER', { surface: true }],
      ['PER', 'BNE', { surface: true }],
      ['BNE', 'CNS', { surface: true }],
      ['CNS', 'DRW', { surface: true }],
    ];
    const r = validate(star(hops), lookup);
    expect(r.violations.some((v) => v.ruleId === 'R-SURFACE')).toBe(true);
  });

  it('travel through the city of origin is not permitted', () => {
    const r = validate(star('SIN-HKG-SIN-BKK'), lookup);
    expect(r.violations.some((v) => v.ruleId === 'R-NOT-VIA-ORIGIN')).toBe(true);
  });
});

describe('Star Alliance RTW — stopovers and transfers', () => {
  it('caps stopovers at one per city', () => {
    const r = validate(star('SYD-BKK-DEL-BKK-LHR'), lookup);
    const v = r.violations.find((x) => x.ruleId === 'R-STOPOVER-CITY');
    expect(v).toBeDefined();
    expect(r.extensible).toBe(true); // fixable by marking one visit a transfer
  });

  it('caps stopovers at three per country (five for the USA)', () => {
    // Origin PER + 4 AU stopovers (ADL/MEL/SYD/BNE).
    const au = validate(star('PER-ADL-MEL-SYD-BNE-SIN'), lookup);
    expect(au.violations.some((v) => v.ruleId === 'R-STOPOVER-COUNTRY')).toBe(true);

    // 4 US stopovers is fine country-wise (cap 5)…
    const us = validate(star('LHR-BOS-ORD-DEN-SFO-LAX-NRT'), lookup);
    expect(us.violations.some((v) => v.ruleId === 'R-STOPOVER-COUNTRY')).toBe(false);
  });

  it('origin USA/Canada: max 4 stopovers in continental USA/Canada', () => {
    const r = validate(star('JFK-BOS-ORD-DEN-SEA-YVR-NRT'), lookup);
    expect(
      r.violations.some((v) => v.ruleId === 'R-STOPOVER-ORIGIN-REGION'),
    ).toBe(true);
  });

  it('origin Europe: max 5 stopovers in Europe', () => {
    const r = validate(star('LHR-DUB-CDG-MAD-FCO-FRA-HEL-BKK'), lookup);
    expect(
      r.violations.some((v) => v.ruleId === 'R-STOPOVER-ORIGIN-REGION'),
    ).toBe(true);
  });

  it('unmarked points default to stopovers; transfers are excluded', () => {
    const r = validate(
      star([
        ['FRA', 'SIN', { stopover: false }],
        ['SIN', 'SYD', {}],
        ['SYD', 'LAX', {}],
        ['LAX', 'FRA', {}],
      ]),
      lookup,
    );
    expect(r.stats.stopoverCount).toBe(2); // SYD + LAX; SIN is a transfer
  });
});

describe('Star Alliance RTW — mileage tiers and fare basis', () => {
  it('tier table matches the T&C §2 table', () => {
    expect(starTiers('economy').map((t) => t.code)).toEqual([
      'YSTAR26SP', 'YSTAR29SP', 'YSTAR29', 'YSTAR34SP', 'YSTAR34',
      'YSTAR39SP', 'YSTAR39',
    ]);
    expect(starTiers('business').map((t) => t.code)).toEqual([
      'CSTAR26SP', 'CSTAR29', 'CSTAR34', 'CSTAR39',
    ]);
    expect(starTiers('first').map((t) => t.code)).toEqual([
      'FSTAR29', 'FSTAR34', 'FSTAR39',
    ]);
  });

  it('special tiers need 3+ stopovers, respect stopover ceilings, and are not sold ex-Japan', () => {
    expect(starTierFor('economy', 25000, 3, false)?.code).toBe('YSTAR26SP');
    expect(starTierFor('economy', 25000, 2, false)?.code).toBe('YSTAR29');
    expect(starTierFor('economy', 25000, 6, false)?.code).toBe('YSTAR29SP');
    expect(starTierFor('economy', 25000, 3, true)?.code).toBe('YSTAR29');
    expect(starTierFor('economy', 40000, 3, false)).toBeNull();
    expect(starTierFor('business', 25000, 4, false)?.code).toBe('CSTAR26SP');
  });

  it('derives the fare basis for an itinerary', () => {
    const r = validate(star('FRA-SIN-SYD-LAX-FRA'), lookup, { complete: true });
    expect(r.fareBasis).toBe('YSTAR26SP'); // ~24.4k great-circle miles, 3 stopovers
  });

  it('rejects itineraries over the 39,000-mile ceiling', () => {
    const r = validate(
      star('PER-SYD-AKL-PPT-SCL-JFK-LAX-MIA-LHR-JNB-DOH-SIN-HKG-NRT-SYD'),
      lookup,
    );
    expect(r.violations.some((v) => v.ruleId === 'R-MILEAGE')).toBe(true);
    expect(r.extensible).toBe(false);
  });
});

describe('Star Alliance RTW — restrictions', () => {
  it('Cuba may not be combined with United or a US origin', () => {
    const r = validate(
      star([
        ['JFK', 'HAV', { carrier: 'CM', stopover: true }],
        ['HAV', 'PTY', { carrier: 'CM' }],
      ]),
      lookup,
    );
    expect(r.violations.some((v) => v.ruleId === 'R-CUBA')).toBe(true);

    const ua = validate(
      star([
        ['MEX', 'HAV', { carrier: 'CM', stopover: true }],
        ['HAV', 'PTY', { carrier: 'UA' }],
      ]),
      lookup,
    );
    expect(ua.violations.some((v) => v.ruleId === 'R-CUBA')).toBe(true);
  });

  it('warns for Book & Fly excluded countries', () => {
    const r = validate(star('FRA-IST-SVO-BKK'), lookup);
    expect(r.warnings.some((v) => v.ruleId === 'R-BOOKFLY')).toBe(true);
  });
});
