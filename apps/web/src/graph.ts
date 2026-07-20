import {
  CODESHARE_EXCEPTIONS,
  PRODUCT_CARRIERS,
  type Airport,
  type AirportLookup,
  type FareProduct,
  type RouteEdge,
  type Snapshot,
} from '@rtw/shared';

export interface Graph {
  snapshot: Snapshot;
  airports: Map<string, Airport>;
  adjacency: Map<string, RouteEdge[]>;
  lookup: AirportLookup;
}

export async function loadGraph(): Promise<Graph> {
  // Relative path: works at the domain root and under a sub-path deployment.
  // no-cache: always revalidate with the server (ETag/304) so a freshly
  // deployed snapshot is picked up immediately — Safari otherwise serves a
  // stale cached copy for a long time.
  const res = await fetch('snapshot.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`snapshot.json missing (${res.status})`);
  const snapshot = (await res.json()) as Snapshot;
  const airports = new Map(snapshot.airports.map((a) => [a.iata, a]));
  const adjacency = new Map<string, RouteEdge[]>();
  for (const e of snapshot.routes) {
    adjacency.set(e.from, [...(adjacency.get(e.from) ?? []), e]);
  }
  const lookup: AirportLookup = (iata) => {
    const a = airports.get(iata);
    if (!a) throw new Error(`unknown airport ${iata}`);
    return a;
  };
  return { snapshot, airports, adjacency, lookup };
}

/** Carriers usable (incl. codeshare-exception carriers) per product. */
export function productCarrierMask(product: FareProduct): Set<string> {
  return new Set([
    ...PRODUCT_CARRIERS[product],
    ...Object.keys(CODESHARE_EXCEPTIONS[product]),
  ]);
}

/** Edges from `iata` flyable under `product` (≥1 eligible carrier). */
export function edgesFrom(
  graph: Graph,
  iata: string,
  product: FareProduct,
): Array<RouteEdge & { eligibleCarriers: string[] }> {
  const mask = productCarrierMask(product);
  const out: Array<RouteEdge & { eligibleCarriers: string[] }> = [];
  for (const e of graph.adjacency.get(iata) ?? []) {
    const eligible = e.carriers.filter((carrier) => mask.has(carrier));
    if (eligible.length > 0) out.push({ ...e, eligibleCarriers: eligible });
  }
  return out;
}

/** Onward-degree per airport for the product (explore-mode badge numbers). */
export function degreesFor(graph: Graph, product: FareProduct): Map<string, number> {
  const mask = productCarrierMask(product);
  const deg = new Map<string, number>();
  for (const e of graph.snapshot.routes) {
    if (e.carriers.some((carrier) => mask.has(carrier))) {
      deg.set(e.from, (deg.get(e.from) ?? 0) + 1);
    }
  }
  return deg;
}

export interface Connectivity {
  /** airport → set of destinations it can fly TO under the product. */
  out: Map<string, Set<string>>;
  /** airport → set of origins it can be flown FROM. */
  in: Map<string, Set<string>>;
}

/** In/out neighbour sets per airport (route data is directional — an airport
 *  can be reachable from fewer places than it can depart to, e.g. ALA). */
export function connectivityFor(graph: Graph, product: FareProduct): Connectivity {
  const mask = productCarrierMask(product);
  const out = new Map<string, Set<string>>();
  const inn = new Map<string, Set<string>>();
  for (const e of graph.snapshot.routes) {
    if (!e.carriers.some((carrier) => mask.has(carrier))) continue;
    if (!out.has(e.from)) out.set(e.from, new Set());
    out.get(e.from)!.add(e.to);
    if (!inn.has(e.to)) inn.set(e.to, new Set());
    inn.get(e.to)!.add(e.from);
  }
  return { out, in: inn };
}
