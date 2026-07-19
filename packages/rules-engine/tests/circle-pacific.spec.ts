import { describe, expect, it } from 'vitest';
import { cpTierFor, validate } from '../src/index.js';
import { itin, lookup } from './helpers.js';

const ruleIds = (r: { violations: { ruleId: string }[] }) =>
  r.violations.map((v) => v.ruleId);

describe('Circle Pacific Explorer (7889)', () => {
  it('derives tiers, forcing 29SA when South America is included', () => {
    expect(cpTierFor('economy', 21000, false)?.code).toBe('LCIR22');
    expect(cpTierFor('economy', 25000, false)?.code).toBe('LCIR26');
    expect(cpTierFor('economy', 26500, false)).toBeNull();
    expect(cpTierFor('business', 28000, true)?.code).toBe('DCIR29SA');
    expect(cpTierFor('first', 29500, true)).toBeNull();
  });

  it('accepts a classic Circle Pacific', () => {
    const r = validate(
      itin('circle-pacific', [
        ['SYD', 'HKG', { carrier: 'CX', stopover: true }],
        ['HKG', 'NRT', { carrier: 'CX', stopover: false }],
        ['NRT', 'LAX', { carrier: 'JL', stopover: true }],
        ['LAX', 'HNL', { carrier: 'AA', stopover: true }],
        ['HNL', 'SYD', { carrier: 'QF' }],
      ]),
      lookup,
      { complete: true },
    );
    expect(r.violations).toEqual([]);
    expect(r.valid).toBe(true);
    expect(r.fareBasis).toMatch(/^LCIR(22|26)$/);
  });

  it('rejects origins outside the permitted country list', () => {
    const r = validate(itin('circle-pacific', 'LHR-HKG'), lookup);
    expect(ruleIds(r)).toContain('R-CP-ORIGIN');
  });

  it('rejects travel via Central America (Panama)', () => {
    const r = validate(itin('circle-pacific', 'SYD-AKL-PTY'), lookup);
    expect(ruleIds(r)).toContain('R-CP-EXCLUSIONS');
  });

  it('rejects travel via the South Asian subcontinent (CMB unusable)', () => {
    const r = validate(itin('circle-pacific', 'SYD-CMB'), lookup);
    expect(ruleIds(r)).toContain('R-CP-EXCLUSIONS');
  });

  it('rejects points outside the four Circle Pacific continents', () => {
    const r = validate(itin('circle-pacific', 'SYD-DOH'), lookup);
    expect(ruleIds(r)).toContain('R-CP-AREA');
  });

  it('requires the two Pacific crossings to form a circle', () => {
    // Both crossings toward the Americas: NRT→LAX and SYD→LAX-ish shape.
    const r = validate(
      itin('circle-pacific', [
        ['NRT', 'LAX', {}],
        ['LAX', 'AKL', {}],
        ['AKL', 'HNL', {}],
      ]),
      lookup,
    );
    // NRT→LAX (toward Americas) + LAX→AKL (away) is a valid circle so far,
    // but AKL→HNL is a second South Pacific crossing.
    expect(ruleIds(r)).toContain('R-CP-CIRCLE');
  });

  it('rejects same-direction crossings', () => {
    const r = validate(
      itin('circle-pacific', [
        ['AKL', 'LAX', {}],
        ['LAX', 'NRT', {}],
        ['NRT', 'HKG', {}],
      ]),
      lookup,
    );
    // South Pacific crossing toward Americas + North Pacific away → this IS
    // a valid circle (AKL→LAX→NRT). Sanity-check it passes…
    expect(ruleIds(r)).not.toContain('R-CP-CIRCLE');
    // …whereas two crossings both entering the Americas fails.
    const bad = validate(
      itin('circle-pacific', [
        ['NRT', 'HNL', { stopover: false }],
        ['HNL', 'AKL', {}],
        ['AKL', 'LAX', {}],
      ]),
      lookup,
    );
    expect(ruleIds(bad)).toContain('R-CP-CIRCLE');
  });

  it('requires the QF-via-Chile corridor for South America itineraries', () => {
    const noQF = validate(
      itin('circle-pacific', [
        ['SYD', 'NRT', { carrier: 'QF' }],
        ['NRT', 'LAX', { carrier: 'JL' }],
        ['LAX', 'SCL', {}],
        ['SCL', 'AKL', {}],
        ['AKL', 'SYD', { carrier: 'QF' }],
      ]),
      lookup,
    );
    expect(ruleIds(noQF)).toContain('R-CP-CIRCLE');
    const onQF = validate(
      itin('circle-pacific', [
        ['SYD', 'NRT', { carrier: 'QF' }],
        ['NRT', 'LAX', { carrier: 'JL' }],
        ['LAX', 'SCL', {}],
        ['SCL', 'SYD', { carrier: 'QF' }],
      ]),
      lookup,
      { complete: true },
    );
    expect(ruleIds(onQF)).not.toContain('R-CP-CIRCLE');
    expect(onQF.fareBasis).toBe('LCIR29SA');
  });

  it('enforces one intercontinental departure/arrival per continent', () => {
    const r = validate(
      itin('circle-pacific', [
        ['SYD', 'AKL', {}],
        ['AKL', 'NAN', {}],
        ['NAN', 'HNL', {}],
        ['HNL', 'PPT', {}],
      ]),
      lookup,
    );
    // SWP→NA (NAN→HNL) then NA→SWP (HNL→PPT) then… two SWP departures? No:
    // NAN→HNL departs SWP once; HNL→PPT departs NA once. Craft a real double:
    const bad = validate(
      itin('circle-pacific', [
        ['SYD', 'HNL', {}],
        ['HNL', 'NAN', {}],
        ['NAN', 'LAX', {}],
      ]),
      lookup,
    );
    expect(ruleIds(r)).not.toContain('R-CP-INTERCONT');
    expect(ruleIds(bad)).toContain('R-CP-INTERCONT');
  });

  it('enforces CP mileage caps with the 29SA escape only via South America', () => {
    expect(
      validate(itin('circle-pacific', 'SYD-NRT-YVR-MEX-HNL-SYD'), lookup).stats
        .totalMiles,
    ).toBeLessThan(26000);
    // A >29k CP journey is dead regardless of South America.
    const monster = validate(
      itin('circle-pacific', 'SYD-PER-SIN-NRT-YVR-HNL-JFK-MIA-SCL-EZE-AKL-SYD'),
      lookup,
    );
    expect(monster.stats.totalMiles).toBeGreaterThan(29000);
    expect(ruleIds(monster)).toContain('R-CP-MILEAGE');
  });

  it('treats stopovers beyond the free allowance as purchasable warnings', () => {
    const r = validate(
      itin('circle-pacific', [
        ['SYD', 'BNE', { stopover: true }],
        ['BNE', 'NRT', { stopover: true }],
        ['NRT', 'HKG', { stopover: true }],
        ['HKG', 'SIN', { stopover: true }],
        ['SIN', 'MNL', { stopover: true }],
        ['MNL', 'HNL', { stopover: true }],
        ['HNL', 'AKL', { stopover: true }],
        ['AKL', 'SYD', {}],
      ]),
      lookup,
      { complete: true },
    );
    // 7 stopovers: BNE NRT HKG SIN MNL HNL AKL — Asia has 4 (2 free + 2 paid).
    expect(r.warnings.some((w) => w.message.includes('USD 150'))).toBe(true);
  });

  it('caps stopovers in the country of origin at one', () => {
    const r = validate(
      itin('circle-pacific', 'SYD-MEL-BNE-NRT'),
      lookup,
    );
    expect(ruleIds(r)).toContain('R-CP-STOPOVERS');
  });

  it('rejects ineligible CP carriers that Global Explorer accepts', () => {
    const seg = itin('circle-pacific', [['BKK', 'HKG', { carrier: 'PG' }]]);
    expect(ruleIds(validate(seg, lookup))).toContain('R-CARRIER');
    const ge = { ...seg, product: 'global-explorer' as const };
    expect(ruleIds(validate(ge, lookup))).not.toContain('R-CARRIER');
  });

  it('allows AY only on SYD–SIN/BKK sectors', () => {
    const ok = validate(
      itin('circle-pacific', [['SYD', 'SIN', { carrier: 'AY' }]]),
      lookup,
    );
    expect(ruleIds(ok)).not.toContain('R-CARRIER');
    expect(ok.warnings.some((w) => w.ruleId === 'R-CARRIER')).toBe(true);
    const bad = validate(
      itin('circle-pacific', [['SIN', 'HKG', { carrier: 'AY' }]]),
      lookup,
    );
    expect(ruleIds(bad)).toContain('R-CARRIER');
  });

  it('restricts open-jaw to origin country or USA↔Canada', () => {
    const ok = validate(itin('circle-pacific', 'YVR-NRT-HKG-SYD-HNL-LAX'), lookup, {
      complete: true,
    });
    expect(ruleIds(ok)).not.toContain('R-CP-RETURN');
    const bad = validate(itin('circle-pacific', 'SYD-NRT-LAX-HNL-AKL'), lookup, {
      complete: true,
    });
    expect(ruleIds(bad)).toContain('R-CP-RETURN');
  });

  it('applies the cabin-dependent minimum stay when dates are present', () => {
    const r = validate(
      itin('circle-pacific', [
        ['SYD', 'NRT', { date: '2026-05-01', carrier: 'QF' }],
        ['NRT', 'LAX', { date: '2026-05-03', carrier: 'JL' }],
        ['LAX', 'HNL', { date: '2026-05-05', carrier: 'AA', stopover: false }],
        ['HNL', 'SYD', { date: '2026-05-06', carrier: 'QF' }],
      ]),
      lookup,
      { complete: true },
    );
    expect(ruleIds(r)).toContain('R-CP-MINSTAY');
  });
});
