import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  haversineMiles,
  RULES_EDITION,
  type Airport,
  type RouteEdge,
  type Snapshot,
} from '@rtw/shared';
import { AeroDataBoxProvider } from './aerodatabox-provider.js';
import { loadAirports } from './ourairports.js';
import type { RawRoute, RouteDataProvider } from './provider.js';
import { WikipediaProvider } from './wikipedia-provider.js';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../../..');
const CACHE_DIR = path.join(ROOT, 'data/cache');
const SNAPSHOT_DIR = path.join(ROOT, 'data/snapshot');

/** Hub seeds per eligible carrier — the crawl expands from here. */
const SEEDS = [
  // oneworld
  // QF/JQ           AA                          AS
  'SYD', 'MEL', 'BNE', 'PER', 'DFW', 'CLT', 'ORD', 'PHL', 'PHX', 'MIA',
  'JFK', 'LAX', 'DCA', 'SEA', 'PDX', 'SFO', 'ANC',
  // BA/IB/EI/AY     AT     CX     FJ     GK/JL/NU
  'LHR', 'LGW', 'MAD', 'DUB', 'HEL', 'CMN', 'HKG', 'NAN', 'NRT', 'HND',
  'KIX', 'OKA',
  // MH     PG     QR     RJ     UL     WS            WY
  'KUL', 'BKK', 'DOH', 'AMM', 'CMB', 'YYC', 'YYZ', 'MCT',
  // Star Alliance
  // LH/LX/OS/SN         A3     TP            AZ     OU     LO     TK
  'FRA', 'MUC', 'ZRH', 'GVA', 'VIE', 'BRU', 'ATH', 'LIS', 'OPO', 'FCO',
  'ZAG', 'WAW', 'IST',
  // MS     ET     SA     AC            UA (rest are oneworld seeds too)
  'CAI', 'ADD', 'JNB', 'YVR', 'YUL', 'EWR', 'IAD', 'DEN', 'IAH',
  // CM     AV            NZ     SQ     OZ     BR     CA/ZH         AI
  'PTY', 'BOG', 'SAL', 'AKL', 'SIN', 'ICN', 'TPE', 'PEK', 'PVG', 'SZX',
  'DEL', 'BOM',
];

const MAX_AIRPORTS = 2600;

interface EdgeAccum {
  carriers: Map<string, Set<string>>; // carrier → set of source directions seen
  notes: Set<string>;
}

async function main() {
  const t0 = Date.now();
  const index = await loadAirports(CACHE_DIR);

  const wikipedia = new WikipediaProvider(index, path.join(CACHE_DIR, 'wiki'));
  const aerodatabox = AeroDataBoxProvider.fromEnv(index);
  const provider: RouteDataProvider = aerodatabox ?? wikipedia;
  console.log(`Route provider: ${provider.name}${aerodatabox ? '' : ' (set AERODATABOX_API_KEY to use AeroDataBox instead)'}`);

  const queue = [...SEEDS];
  const visited = new Set<string>();
  const noData: string[] = [];
  /** key "A>B" (directional). */
  const rawEdges = new Map<string, EdgeAccum>();

  while (queue.length > 0 && visited.size < MAX_AIRPORTS) {
    const iata = queue.shift()!;
    if (visited.has(iata)) continue;
    visited.add(iata);
    const routes = await provider.routesFrom(iata).catch((err) => {
      console.warn(`  ${iata}: unexpected error, will retry at end (${err?.message ?? err})`);
      return null;
    });
    if (routes === null) {
      noData.push(iata);
      continue;
    }
    process.stdout.write(
      `\r[${visited.size}] ${iata}: ${routes.length} carrier-routes, queue ${queue.length}   `,
    );
    for (const r of routes) {
      addEdge(rawEdges, r);
      if (!visited.has(r.to) && !queue.includes(r.to)) queue.push(r.to);
    }
  }
  console.log('\nCrawl complete.');

  // Second, more patient pass over airports whose page fetch failed (rate
  // limits) — losing a hub's page would zero out its outbound degree.
  const failed = [...noData];
  noData.length = 0;
  for (const iata of failed) {
    await new Promise((r) => setTimeout(r, 3000));
    const routes = await provider.routesFrom(iata).catch(() => null);
    if (routes === null) {
      noData.push(iata);
      continue;
    }
    console.log(`retry ${iata}: ${routes.length} carrier-routes`);
    for (const r of routes) addEdge(rawEdges, r);
  }

  // Merge directions: an edge A→B is confirmed ('both') when B's page also
  // lists A→B... i.e. we saw the reverse listing B→A? No — pages list
  // departures, so A→B from A's page and B→A from B's page are different
  // directed routes. Airlines fly almost all city pairs in both directions,
  // so we use the reverse listing as the cross-check for confidence.
  const edges: RouteEdge[] = [];
  const usedAirports = new Set<string>();
  for (const [key, acc] of rawEdges) {
    const [from, to] = key.split('>');
    const a = index.byIata.get(from);
    const b = index.byIata.get(to);
    if (!a || !b) continue;
    const reverse = rawEdges.get(`${to}>${from}`);
    const carriers = [...acc.carriers.keys()].sort();
    const confirmed =
      reverse !== undefined &&
      carriers.some((c) => reverse.carriers.has(c));
    edges.push({
      from,
      to,
      carriers,
      distanceMi: haversineMiles(a.lat, a.lon, b.lat, b.lon),
      confidence: confirmed ? 'both' : 'single',
      notes: acc.notes.size ? [...acc.notes] : undefined,
    });
    usedAirports.add(from);
    usedAirports.add(to);
  }

  const airports: Airport[] = [...usedAirports]
    .map((iata) => index.byIata.get(iata)!)
    .map(({ wikipediaTitle, type, scheduledService, ...a }) => a)
    .sort((a, b) => a.iata.localeCompare(b.iata));

  const snapshot: Snapshot = {
    generatedAt: new Date().toISOString(),
    rulesEdition: RULES_EDITION,
    sources: [provider.name, 'ourairports.com'],
    airports,
    routes: edges.sort((a, b) => `${a.from}${a.to}`.localeCompare(`${b.from}${b.to}`)),
  };

  await mkdir(SNAPSHOT_DIR, { recursive: true });
  await writeFile(
    path.join(SNAPSHOT_DIR, 'snapshot.json'),
    JSON.stringify(snapshot),
  );

  const unresolved =
    provider === wikipedia
      ? [...wikipedia.unresolved.entries()].sort((x, y) => y[1] - x[1])
      : [];
  await writeFile(
    path.join(SNAPSHOT_DIR, 'report.json'),
    JSON.stringify(
      {
        generatedAt: snapshot.generatedAt,
        airports: airports.length,
        edges: edges.length,
        singleSourceEdges: edges.filter((e) => e.confidence === 'single').length,
        airportsWithoutData: noData,
        unresolvedDestinations: unresolved.slice(0, 200),
        elapsedSeconds: Math.round((Date.now() - t0) / 1000),
      },
      null,
      2,
    ),
  );

  console.log(
    `Snapshot: ${airports.length} airports, ${edges.length} directed edges ` +
      `(${edges.filter((e) => e.confidence === 'both').length} confirmed both ways), ` +
      `${unresolved.length} unresolved destination labels → data/snapshot/`,
  );

  // Sanity checks from the build guide (§9 step 3).
  const degree = new Map<string, number>();
  for (const e of edges) degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
  for (const probe of ['SYD', 'DOH', 'LHR', 'TSE']) {
    console.log(`  degree(${probe}) = ${degree.get(probe) ?? 0}`);
  }
}

function addEdge(map: Map<string, EdgeAccum>, r: RawRoute) {
  const key = `${r.from}>${r.to}`;
  let acc = map.get(key);
  if (!acc) {
    acc = { carriers: new Map(), notes: new Set() };
    map.set(key, acc);
  }
  if (!acc.carriers.has(r.carrier)) acc.carriers.set(r.carrier, new Set());
  for (const n of r.notes ?? []) acc.notes.add(`${r.carrier}: ${n}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
