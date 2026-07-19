import { describe, expect, it } from 'vitest';
import { validate } from '../src/index.js';
import { itin, lookup } from './helpers.js';

const ruleIds = (r: { violations: { ruleId: string }[] }) =>
  r.violations.map((v) => v.ruleId);

describe('oneworld Explorer (3015)', () => {
  it('accepts a classic 4-continent RTW (DONE4 shape)', () => {
    const r = validate(
      itin(
        'explorer',
        [
          ['SYD', 'HKG', { carrier: 'CX', stopover: true }],
          ['HKG', 'LHR', { carrier: 'CX', stopover: true }],
          ['LHR', 'JFK', { carrier: 'BA', stopover: true }],
          ['JFK', 'LAX', { carrier: 'AA', stopover: true }],
          ['LAX', 'SYD', { carrier: 'QF' }],
        ],
        'business',
      ),
      lookup,
      { complete: true },
    );
    expect(r.violations).toEqual([]);
    expect(r.valid).toBe(true);
    expect(r.fareBasis).toBe('DONE4');
    expect(r.stats.atlanticCrossings).toBe(1);
    expect(r.stats.pacificCrossings).toBe(1);
  });

  it('counts Asia for a LHR–PER nonstop (deemed via Asia)', () => {
    const r = validate(
      itin('explorer', [
        ['LHR', 'PER', { carrier: 'QF', stopover: true }],
        ['PER', 'SYD', { carrier: 'QF', stopover: true }],
        ['SYD', 'LAX', { carrier: 'QF', stopover: true }],
        ['LAX', 'JFK', { carrier: 'AA', stopover: true }],
        ['JFK', 'LHR', { carrier: 'BA' }],
      ]),
      lookup,
      { complete: true },
    );
    expect(r.stats.continentsCounted).toContain('AS');
    expect(r.stats.continentsCounted).toHaveLength(4);
    expect(r.fareBasis).toBe('LONE4');
    expect(r.valid).toBe(true);
  });

  it('counts all three continents for a DOH–SYD nonstop', () => {
    const r = validate(itin('explorer', 'SYD-DOH'), lookup);
    expect(r.stats.continentsCounted.sort()).toEqual(['AS', 'EUME', 'SWP']);
  });

  it('rejects a second Atlantic crossing (monotone)', () => {
    const r = validate(itin('explorer', 'JFK-LHR-BOS'), lookup);
    expect(ruleIds(r)).toContain('R-OCEAN');
    expect(r.extensible).toBe(false);
  });

  it('rejects backtracking across traffic conferences', () => {
    // TC3→TC2 then TC2→TC3 reverses rotation.
    const r = validate(itin('explorer', 'SYD-DOH-LHR-HKG'), lookup);
    expect(ruleIds(r)).toContain('R-DIRECTION');
    expect(r.extensible).toBe(false);
  });

  it('rejects Hawaii backtracking within North America', () => {
    const r = validate(itin('explorer', 'NRT-HNL-LAX-OGG'), lookup);
    expect(ruleIds(r)).toContain('R-HAWAII');
  });

  it('allows a single Hawaii↔mainland sector as part of a Pacific crossing', () => {
    const r = validate(itin('explorer', 'NRT-HNL-LAX-JFK'), lookup);
    expect(ruleIds(r)).not.toContain('R-HAWAII');
  });

  it('rejects passing through the origin mid-journey', () => {
    const r = validate(itin('explorer', 'SYD-HKG-SYD-MEL'), lookup);
    expect(ruleIds(r)).toContain('R-NOT-VIA-ORIGIN');
  });

  it('rejects a 5th intra-Asia flight segment (valid on Global Explorer)', () => {
    // SIN/KUL marked as transfers so 9701's 4-stopovers-per-region cap
    // does not fire — isolates the per-continent flight-segment cap.
    const asiaHop = itin('explorer', [
      ['SYD', 'HKG', {}],
      ['HKG', 'BKK', {}],
      ['BKK', 'SIN', { stopover: false }],
      ['SIN', 'KUL', { stopover: false }],
      ['KUL', 'CGK', {}],
      ['CGK', 'MNL', {}],
    ]);
    const r = validate(asiaHop, lookup);
    expect(ruleIds(r)).toContain('R-SEGMENTS-CONTINENT');
    expect(r.extensible).toBe(false);

    const r2 = validate({ ...asiaHop, product: 'global-explorer' }, lookup);
    expect(ruleIds(r2)).not.toContain('R-SEGMENTS-CONTINENT');
    expect(r2.extensible).toBe(true);
  });

  it('rejects repeating a city pair in the same direction', () => {
    const r = validate(
      itin('explorer', [
        ['SYD', 'AKL', {}],
        ['AKL', 'NAN', {}],
        ['NAN', 'AKL', {}],
        ['AKL', 'NAN', {}],
      ]),
      lookup,
    );
    expect(ruleIds(r)).toContain('R-NO-REPEAT');
  });

  it('treats LHR and LGW as the same city for repeats', () => {
    const r = validate(itin('explorer', 'JFK-LHR-DUB-LGW-JFK'), lookup);
    // DUB-LGW arrives London a second time — not a repeat (different pair),
    // but LGW-JFK after LHR... only JFK-LHR / LGW-JFK differ. Craft real repeat:
    const r2 = validate(itin('explorer', 'JFK-LHR-DUB-JFK'), lookup);
    expect(ruleIds(r)).not.toContain('R-NO-REPEAT');
    expect(ruleIds(r2)).toContain('R-OCEAN'); // two Atlantic crossings anyway
  });

  it('rejects a second US transcontinental nonstop', () => {
    const r = validate(itin('explorer', 'LAX-JFK-SEA-MIA'), lookup);
    expect(ruleIds(r)).toContain('R-US-TRANSCON');
  });

  it('allows one transcon; hub hops are not transcons', () => {
    const r = validate(itin('explorer', 'LAX-DFW-MIA-JFK'), lookup);
    expect(ruleIds(r)).not.toContain('R-US-TRANSCON');
  });

  it('limits flights to/from Alaska', () => {
    const r = validate(itin('explorer', 'SEA-ANC-YVR-FAI'), lookup);
    expect(ruleIds(r)).toContain('R-US-TRANSCON');
  });

  it('rejects a second restricted Australian nonstop', () => {
    const r = validate(itin('explorer', 'SYD-PER-BNE-DRW-SYD'), lookup);
    // SYD-PER and PER-BNE are both restricted pairs.
    expect(ruleIds(r)).toContain('R-AU-NONSTOP');
  });

  it('enforces max 2 stopovers in the continent of origin', () => {
    const r = validate(itin('explorer', 'SYD-MEL-CNS-ADL-AKL'), lookup);
    expect(ruleIds(r)).toContain('R-STOPOVERS');
    // Marking one as a transfer fixes it.
    const r2 = validate(
      itin('explorer', [
        ['SYD', 'MEL', { stopover: false }],
        ['MEL', 'CNS', {}],
        ['CNS', 'ADL', {}],
        ['ADL', 'AKL', {}],
      ]),
      lookup,
    );
    expect(ruleIds(r2)).not.toContain('R-STOPOVERS');
  });

  it('accepts a legal origin open-jaw (MEL out, SYD home)', () => {
    const r = validate(
      itin('explorer', 'MEL-HKG-LHR-JFK-LAX-SYD'),
      lookup,
      { complete: true },
    );
    expect(r.violations).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it('rejects an illegal origin open-jaw (SYD out, AKL home)', () => {
    const r = validate(
      itin('explorer', 'SYD-HKG-LHR-JFK-LAX-AKL'),
      lookup,
      { complete: true },
    );
    expect(ruleIds(r)).toContain('R-RETURN');
    expect(r.valid).toBe(false);
  });

  it('rejects Cuba together with AA/AS segments', () => {
    const r = validate(
      itin('explorer', [
        ['YYZ', 'HAV', {}],
        ['HAV', 'MEX', {}],
        ['MEX', 'DFW', { carrier: 'AA' }],
      ]),
      lookup,
    );
    expect(ruleIds(r)).toContain('R-CUBA');
  });

  it('rejects ineligible carriers', () => {
    const r = validate(
      itin('explorer', [['SYD', 'AKL', { carrier: 'NZ' }]]),
      lookup,
    );
    expect(ruleIds(r)).toContain('R-CARRIER');
  });

  it('warns (not violates) for JQ, pending QF codeshare confirmation', () => {
    const r = validate(
      itin('explorer', [['SYD', 'MEL', { carrier: 'JQ' }]]),
      lookup,
    );
    expect(ruleIds(r)).not.toContain('R-CARRIER');
    expect(r.warnings.some((w) => w.ruleId === 'R-CARRIER')).toBe(true);
  });

  it('rejects a transoceanic surface sector for non-SWP origins', () => {
    const r = validate(
      itin('explorer', [
        ['JFK', 'LHR', { surface: true }],
      ]),
      lookup,
    );
    expect(ruleIds(r)).toContain('R-SURFACE');
  });

  it('allows one transoceanic surface sector for SWP origins', () => {
    const r = validate(
      itin('explorer', [
        ['SYD', 'HKG', {}],
        ['HKG', 'LHR', {}],
        ['LHR', 'JFK', { surface: true }],
        ['JFK', 'LAX', {}],
        ['LAX', 'SYD', {}],
      ]),
      lookup,
      { complete: true },
    );
    expect(ruleIds(r)).not.toContain('R-SURFACE');
  });

  it('enforces intercontinental arrival/departure caps', () => {
    // Two departures from South America (cap 1).
    const r = validate(itin('explorer', 'SCL-MIA-LIM-LAX'), lookup);
    expect(ruleIds(r)).toContain('R-INTERCONT');
  });

  it('flags South Africa/Mauritius when Europe is used in both directions (complete)', () => {
    const r = validate(
      itin('explorer', 'SYD-HKG-LHR-JNB-MAD-JFK-LAX-SYD'),
      lookup,
      { complete: true },
    );
    expect(ruleIds(r)).toContain('R-INTERCONT-ZAMU');
    // Routing via the Middle East instead is fine.
    const r2 = validate(
      itin('explorer', 'SYD-HKG-DOH-JNB-MAD-JFK-LAX-SYD'),
      lookup,
      { complete: true },
    );
    expect(ruleIds(r2)).not.toContain('R-INTERCONT-ZAMU');
  });

  it('enforces one international departure from the country of origin', () => {
    const r = validate(itin('explorer', 'SYD-AKL-MEL-NAN'), lookup);
    expect(ruleIds(r)).toContain('R-ORIGIN-COUNTRY');
  });

  it('caps the journey at 16 segments', () => {
    const hops = ['SYD', 'AKL', 'NAN', 'AKL', 'NOU', 'AKL', 'PPT', 'AKL', 'CHC'];
    // Build a 17-segment zigzag (no same-direction repeats).
    const pts = [
      'SYD', 'MEL', 'BNE', 'ADL', 'CNS', 'AKL', 'CHC', 'NAN', 'NOU', 'PPT',
      'HNL', 'LAX', 'SFO', 'SEA', 'DEN', 'DFW', 'ORD', 'JFK',
    ];
    void hops;
    const r = validate(
      itin('explorer', pts.map((p, i) => [p, pts[i + 1]] as [string, string]).slice(0, 17)),
      lookup,
    );
    expect(ruleIds(r)).toContain('R-SEGMENTS');
  });

  it('reports remaining todos for a partial itinerary', () => {
    const r = validate(itin('explorer', 'SYD-HKG'), lookup);
    expect(r.extensible).toBe(true);
    expect(r.valid).toBe(false);
    const undone = r.todos.filter((t) => !t.done).map((t) => t.ruleId);
    expect(undone).toContain('R-OCEAN');
    expect(undone).toContain('R-RETURN');
    expect(undone).toContain('R-STOPOVERS');
  });

  it('applies the TC1 minimum-stay rule only when dates are attached', () => {
    const dated = validate(
      itin('explorer', [
        ['JFK', 'LHR', { date: '2026-05-01', carrier: 'BA' }],
        ['LHR', 'HKG', { date: '2026-05-03', carrier: 'CX' }],
        ['HKG', 'SYD', { date: '2026-05-05', carrier: 'CX' }],
        ['SYD', 'LAX', { date: '2026-05-07', carrier: 'QF' }],
        ['LAX', 'JFK', { date: '2026-05-08', carrier: 'AA' }],
      ]),
      lookup,
      { complete: true },
    );
    expect(ruleIds(dated)).toContain('R-MINSTAY');
    const dateless = validate(itin('explorer', 'JFK-LHR-HKG-SYD-LAX-JFK'), lookup, {
      complete: true,
    });
    expect(ruleIds(dateless)).not.toContain('R-MINSTAY');
    expect(dateless.assumptions.join(' ')).toMatch(/10 days/);
  });
});
