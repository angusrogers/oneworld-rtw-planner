import { describe, expect, it } from 'vitest';
import type { FareProduct, Segment } from '@rtw/shared';
import { canExtend, validate } from '../src/index.js';
import { ALL_TEST_AIRPORTS, itin, lookup, testAirport } from './helpers.js';

describe('engine mechanics', () => {
  it('returns a neutral result for an empty itinerary', () => {
    const r = validate({ product: 'explorer', cabin: 'economy', segments: [] }, lookup);
    expect(r.extensible).toBe(true);
    expect(r.valid).toBe(false);
    expect(r.stats.segmentCount).toBe(0);
  });

  it('canExtend appends a speculative segment from the current point', () => {
    const base = itin('explorer', 'SYD-HKG');
    const good = canExtend(base, lookup, { to: 'LHR' });
    expect(good.extensible).toBe(true);
    // Extending back across conferences the wrong way is filtered out.
    const afterLondon = itin('explorer', 'SYD-HKG-LHR');
    const bad = canExtend(afterLondon, lookup, { to: 'HKG' });
    expect(bad.extensible).toBe(false);
  });

  it('a fare-product switch changes the verdict for the same itinerary', () => {
    const segments: Segment[] = itin('explorer', 'SYD-DOH-LHR').segments;
    const explorer = validate({ product: 'explorer', cabin: 'economy', segments }, lookup);
    const cp = validate({ product: 'circle-pacific', cabin: 'economy', segments }, lookup);
    expect(explorer.extensible).toBe(true);
    expect(cp.extensible).toBe(false); // DOH/LHR outside CP area
  });

  it('never crashes on random walks over the test airports (property)', () => {
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    const products: FareProduct[] = ['explorer', 'global-explorer', 'circle-pacific', 'star-rtw'];
    for (let walk = 0; walk < 300; walk++) {
      const product = products[Math.floor(rand() * products.length)];
      const len = 1 + Math.floor(rand() * 12);
      const pts = [ALL_TEST_AIRPORTS[Math.floor(rand() * ALL_TEST_AIRPORTS.length)]];
      for (let i = 0; i < len; i++) {
        let nxt = ALL_TEST_AIRPORTS[Math.floor(rand() * ALL_TEST_AIRPORTS.length)];
        if (nxt === pts[pts.length - 1]) nxt = 'SYD';
        pts.push(nxt);
      }
      const segments = pts.slice(1).map((to, i) => ({
        from: pts[i],
        to,
        surface: rand() < 0.1,
        stopover: rand() < 0.5,
      }));
      for (const complete of [false, true]) {
        const r = validate({ product, cabin: 'economy', segments }, lookup, { complete });
        expect(Array.isArray(r.violations)).toBe(true);
        expect(typeof r.extensible).toBe('boolean');
      }
    }
  });

  it('itineraries passed by next-hop filtering validate clean when completed legally', () => {
    // Greedy walk: start SYD, only take extensions the filter allows, then
    // close the loop and assert the complete validation agrees.
    const base = itin('explorer', 'SYD-HKG-LHR-JFK-LAX');
    const step = canExtend(base, lookup, { to: 'SYD' });
    expect(step.extensible).toBe(true);
    const closed = itin('explorer', 'SYD-HKG-LHR-JFK-LAX-SYD');
    const final = validate(closed, lookup, { complete: true });
    expect(final.valid).toBe(true);
  });

  it('treats unmarked points as stopovers; explicit transfers are excluded', () => {
    const r = validate(
      {
        product: 'explorer',
        cabin: 'economy',
        segments: [
          { from: 'SYD', to: 'HKG' },
          { from: 'HKG', to: 'BKK', stopover: false },
          { from: 'BKK', to: 'LHR' },
        ],
      },
      lookup,
    );
    expect(r.stats.stopoverCount).toBe(1); // HKG counts, BKK is a transfer
    expect(r.assumptions.join(' ')).toMatch(/assumed to be stopovers/i);
  });

  it('exposes airport metadata needed by the UI', () => {
    const syd = testAirport('SYD');
    expect(syd.continent).toBe('SWP');
    const svx = testAirport('SVX');
    expect(svx.continent).toBe('AS'); // east of the Urals
    const svo = testAirport('SVO');
    expect(svo.continent).toBe('EUME');
    expect(testAirport('CAI').zone).toBe('ME');
    expect(testAirport('CMN').zone).toBe('EU');
  });
});
