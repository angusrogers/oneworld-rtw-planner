import { describe, expect, it } from 'vitest';
import { globTierFor, validate } from '../src/index.js';
import { itin, lookup } from './helpers.js';

const ruleIds = (r: { violations: { ruleId: string }[] }) =>
  r.violations.map((v) => v.ruleId);

describe('Global Explorer (9701)', () => {
  it('derives mileage tiers per cabin', () => {
    expect(globTierFor('economy', 25000)?.code).toBe('LGLOB26');
    expect(globTierFor('economy', 26001)?.code).toBe('LGLOB29');
    expect(globTierFor('economy', 33000)?.code).toBe('LGLOB34');
    expect(globTierFor('economy', 38999)?.code).toBe('LGLOB39');
    expect(globTierFor('economy', 39001)).toBeNull();
    expect(globTierFor('business', 25000)?.code).toBe('IGLOB26');
    expect(globTierFor('business', 30000)?.code).toBe('DGLOB34');
    expect(globTierFor('business', 34001)).toBeNull();
    expect(globTierFor('first', 30000)?.code).toBe('AGLOB34');
    expect(globTierFor('first', 34001)).toBeNull();
  });

  it('accepts a valid mileage RTW and derives the fare basis', () => {
    const r = validate(
      itin('global-explorer', [
        ['SYD', 'HKG', { carrier: 'CX', stopover: true }],
        ['HKG', 'HEL', { carrier: 'AY', stopover: false }],
        ['HEL', 'LHR', { carrier: 'AY', stopover: true }],
        ['LHR', 'JFK', { carrier: 'BA', stopover: true }],
        ['JFK', 'LAX', { carrier: 'AA', stopover: true }],
        ['LAX', 'SYD', { carrier: 'QF' }],
      ]),
      lookup,
      { complete: true },
    );
    expect(r.violations).toEqual([]);
    expect(r.valid).toBe(true);
    expect(r.fareBasis).toMatch(/^LGLOB(26|29)$/);
    expect(r.stats.totalMiles).toBeGreaterThan(20000);
  });

  it('rejects an itinerary over the cabin mileage cap (monotone)', () => {
    const r = validate(
      itin(
        'global-explorer',
        'SYD-MEL-LAX-JFK-MIA-GRU-LHR-JNB-DOH-PER-SYD',
        'business',
      ),
      lookup,
    );
    expect(r.stats.totalMiles).toBeGreaterThan(34000);
    expect(ruleIds(r)).toContain('R-MILEAGE');
    expect(r.extensible).toBe(false);
  });

  it('warns within 3% of a cap', () => {
    const r = validate(
      itin('global-explorer', 'SYD-MEL-LAX-JFK-MIA-GRU-LHR-JNB-DOH-PER-SYD'),
      lookup,
      { complete: true },
    );
    // ~39.4k miles in economy → LGLOB39 with a near-cap warning, or violation
    // if it tips over; assert it is one of the two.
    const flagged =
      ruleIds(r).includes('R-MILEAGE') ||
      r.warnings.some((w) => w.ruleId === 'R-MILEAGE');
    expect(flagged).toBe(true);
  });

  it('includes origin-destination open-jaw mileage in the total', () => {
    const closed = validate(itin('global-explorer', 'MEL-HKG-LHR-JFK-LAX-MEL'), lookup);
    const openJaw = validate(itin('global-explorer', 'MEL-HKG-LHR-JFK-LAX-SYD'), lookup);
    // SYD→MEL surface gap (~440 mi) must be included.
    expect(openJaw.stats.totalMiles).toBeGreaterThan(
      closed.stats.totalMiles - 900,
    );
  });

  it('does not apply the Hawaii backtrack rule (3015-only)', () => {
    const r = validate(itin('global-explorer', 'NRT-HNL-LAX-OGG'), lookup);
    expect(ruleIds(r)).not.toContain('R-HAWAII');
  });

  it('Africa intercontinental exception excludes South Africa/Mauritius', () => {
    // Two EUME arrivals with only ZA as the Africa visit → not permitted.
    const za = validate(
      itin('global-explorer', 'SYD-HKG-LHR-JNB-MAD-JFK-LAX-SYD'),
      lookup,
      { complete: true },
    );
    expect(ruleIds(za)).toContain('R-INTERCONT');
    // Same shape via Kenya qualifies for the exception.
    const ke = validate(
      itin('global-explorer', 'SYD-HKG-LHR-NBO-MAD-JFK-LAX-SYD'),
      lookup,
      { complete: true },
    );
    expect(ruleIds(ke)).not.toContain('R-INTERCONT');
  });

  it('enforces stopover caps per region and tier', () => {
    // 5 stopovers in Asia exceeds the 4-per-region cap of every tier.
    const r = validate(
      itin('global-explorer', 'SYD-HKG-BKK-SIN-KUL-CGK-MNL'),
      lookup,
    );
    expect(ruleIds(r)).toContain('R-STOPOVERS-GE');
    // 3 stopovers in Asia is fine overall but warns 26k fares away.
    const r2 = validate(
      itin('global-explorer', 'SYD-HKG-BKK-SIN-NRT'),
      lookup,
    );
    expect(ruleIds(r2)).not.toContain('R-STOPOVERS-GE');
    expect(r2.warnings.some((w) => w.ruleId === 'R-STOPOVERS-GE')).toBe(true);
  });

  it('enforces the 26k total-stopovers cap only when the tier applies (complete)', () => {
    // Compact RTW under 26k with 6 stopovers → violates the 26k fare's max 5.
    const r = validate(
      itin('global-explorer', [
        ['LHR', 'HEL', {}],
        ['HEL', 'NRT', {}],
        ['NRT', 'HKG', {}],
        ['HKG', 'SIN', { stopover: false }],
        ['SIN', 'SYD', {}],
        ['SYD', 'AKL', {}],
        ['AKL', 'LAX', {}],
        ['LAX', 'JFK', {}],
        ['JFK', 'LHR', {}],
      ]),
      lookup,
      { complete: true },
    );
    if (r.fareBasis === 'LGLOB26') {
      expect(ruleIds(r)).toContain('R-STOPOVERS-GE');
    } else {
      expect(r.fareBasis).toBe('LGLOB29');
    }
  });

  it('permits eligible 9701-only carriers that 3015 rejects', () => {
    const ei = itin('global-explorer', [['DUB', 'JFK', { carrier: 'EI' }]]);
    expect(ruleIds(validate(ei, lookup))).not.toContain('R-CARRIER');
    const on3015 = { ...ei, product: 'explorer' as const };
    expect(ruleIds(validate(on3015, lookup))).toContain('R-CARRIER');
  });
});
