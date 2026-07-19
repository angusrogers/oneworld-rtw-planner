import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Itinerary, ValidationResult } from '@rtw/shared';
import { validate } from '@rtw/rules-engine';
import {
  connectivityFor,
  degreesFor,
  edgesFrom,
  loadGraph,
  type Graph,
} from './graph.js';
import { greatCircleArc } from './geo.js';
import { MapView } from './MapView.tsx';
import { Sidebar } from './Sidebar.tsx';
import { currentPoint, usePlannerState } from './state.ts';

export interface NextHop {
  iata: string;
  legal: boolean;
  reasons: string[];
  eligibleCarriers: string[];
}

export function App() {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const planner = usePlannerState();
  const { state, setState } = planner;
  const [surfaceMode, setSurfaceMode] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    loadGraph().then(setGraph, (e) => setLoadError(String(e.message ?? e)));
  }, []);

  const itinerary: Itinerary = useMemo(
    () => ({ product: state.product, cabin: state.cabin, segments: state.segments }),
    [state],
  );

  const current = currentPoint(state);

  const validation: ValidationResult | null = useMemo(() => {
    if (!graph || state.segments.length === 0) return null;
    try {
      return validate(itinerary, graph.lookup);
    } catch {
      return null;
    }
  }, [graph, itinerary, state.segments.length]);

  const completeValidation: ValidationResult | null = useMemo(() => {
    if (!graph || state.segments.length === 0) return null;
    try {
      return validate(itinerary, graph.lookup, { complete: true });
    } catch {
      return null;
    }
  }, [graph, itinerary, state.segments.length]);

  const degrees = useMemo(
    () => (graph ? degreesFor(graph, state.product) : new Map<string, number>()),
    [graph, state.product],
  );

  const connectivity = useMemo(
    () => (graph ? connectivityFor(graph, state.product) : null),
    [graph, state.product],
  );

  /** Notice text when an airport has few ways in or out, else null. */
  const thinConnectivityNote = useCallback(
    (iata: string): string | null => {
      if (!connectivity) return null;
      const inn = [...(connectivity.in.get(iata) ?? [])].sort();
      const out = [...(connectivity.out.get(iata) ?? [])].sort();
      if (inn.length > 1 && out.length > 1) return null;
      const list = (a: string[]) =>
        a.length === 0
          ? 'nowhere in the route data'
          : a.slice(0, 6).join(', ') + (a.length > 6 ? ` +${a.length - 6} more` : '');
      return (
        `⚠ ${iata} is thinly connected on this fare product: ` +
        `flights in from ${list(inn)}; flights out to ${list(out)}. ` +
        'Plan your routing through it carefully.'
      );
    },
    [connectivity],
  );

  /** Speculative validation of every candidate edge from the current point. */
  const nextHops = useMemo(() => {
    const hops = new Map<string, NextHop>();
    if (!graph || !current) return hops;
    for (const edge of edgesFrom(graph, current, state.product)) {
      if (!graph.airports.has(edge.to)) continue;
      try {
        const r = validate(
          { ...itinerary, segments: [...state.segments, { from: current, to: edge.to }] },
          graph.lookup,
        );
        hops.set(edge.to, {
          iata: edge.to,
          legal: r.extensible,
          reasons: r.violations.map((v) => v.message),
          eligibleCarriers: edge.eligibleCarriers,
        });
      } catch {
        // ignore malformed candidates
      }
    }
    return hops;
  }, [graph, current, itinerary, state.product, state.segments]);

  const visited = useMemo(() => {
    const set = new Set<string>();
    if (state.origin) set.add(state.origin);
    state.segments.forEach((s) => {
      set.add(s.from);
      set.add(s.to);
    });
    return set;
  }, [state]);

  const airportFeatures: GeoJSON.FeatureCollection = useMemo(() => {
    const features: GeoJSON.Feature[] = [];
    if (!graph) return { type: 'FeatureCollection', features };
    const building = current !== null;
    for (const a of graph.airports.values()) {
      const deg = degrees.get(a.iata) ?? 0;
      const inDeg = connectivity?.in.get(a.iata)?.size ?? 0;
      if (deg === 0 && inDeg === 0 && !visited.has(a.iata)) continue;
      // Union of ways in and out ≤ 1 → effectively a spur off one airport.
      const neighbours = new Set([
        ...(connectivity?.in.get(a.iata) ?? []),
        ...(connectivity?.out.get(a.iata) ?? []),
      ]);
      const deadEnd = neighbours.size <= 1;
      const size = Math.max(3, Math.min(13, 2.5 + Math.sqrt(deg) * 1.35));
      let color = degreeColor(deg);
      let opacity = 0.85;
      let stroke = '#ffffff';
      let strokeW = 0.5;
      if (deadEnd) {
        // Hollow marker in the sparse-connectivity blue: reads as "barely
        // connected", keeping red exclusively for rule violations.
        color = '#ffffff';
        stroke = '#a9cce3';
        strokeW = 1.8;
      }
      if (building) {
        const hop = nextHops.get(a.iata);
        if (a.iata === current) {
          color = '#ff8800';
          stroke = '#ff8800';
          strokeW = 2;
        } else if (surfaceMode) {
          color = '#c98f00';
          opacity = 0.8;
        } else if (hop?.legal) {
          color = deadEnd ? '#ffffff' : '#1a7f37';
          if (deadEnd) stroke = '#1a7f37';
        } else if (hop) {
          color = '#d64545';
          opacity = 0.5;
        } else if (visited.has(a.iata)) {
          color = '#4a4a68';
        } else {
          color = '#9aa2ad';
          opacity = 0.28;
          if (deadEnd) {
            stroke = '#9aa2ad';
            strokeW = 1;
          }
        }
      }
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
        properties: { iata: a.iata, degree: deg, size, color, opacity, stroke, strokeW },
      });
    }
    return { type: 'FeatureCollection', features };
  }, [graph, degrees, connectivity, nextHops, current, visited, surfaceMode]);

  const arcFeatures: GeoJSON.FeatureCollection = useMemo(() => {
    const features: GeoJSON.Feature[] = [];
    if (graph) {
      state.segments.forEach((s) => {
        const a = graph.airports.get(s.from);
        const b = graph.airports.get(s.to);
        if (!a || !b) return;
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: greatCircleArc(a, b) },
          properties: {
            color: s.surface ? '#8a8a8a' : '#2c7fb8',
            dashed: s.surface === true,
          },
        });
      });
    }
    return { type: 'FeatureCollection', features };
  }, [graph, state.segments]);

  const onClickAirport = useCallback(
    (iata: string) => {
      setNotice(null);
      if (!graph) return;
      if (!state.origin && state.segments.length === 0) {
        setState((prev) => ({ ...prev, origin: iata }));
        setNotice(thinConnectivityNote(iata));
        return;
      }
      const from = currentPoint(state);
      if (!from || iata === from) return;
      if (surfaceMode) {
        setState((prev) => ({
          ...prev,
          segments: [...prev.segments, { from, to: iata, surface: true }],
        }));
        setSurfaceMode(false);
        setNotice(thinConnectivityNote(iata));
        return;
      }
      const hop = nextHops.get(iata);
      if (!hop) {
        setNotice(
          `No direct ${productLabel(state.product)} flight in the route data from ${from} to ${iata}. ` +
            'Use “Surface sector” if you will make your own way there.',
        );
        return;
      }
      if (!hop.legal) {
        setNotice(`${from} → ${iata} would break the rules: ${hop.reasons.join(' ')}`);
        return;
      }
      setState((prev) => ({
        ...prev,
        segments: [
          ...prev.segments,
          {
            from,
            to: iata,
            carrier: hop.eligibleCarriers.length === 1 ? hop.eligibleCarriers[0] : undefined,
          },
        ],
      }));
      setNotice(thinConnectivityNote(iata));
    },
    [graph, state, setState, nextHops, surfaceMode, thinConnectivityNote],
  );

  if (loadError) {
    return (
      <div className="fullscreen-message">
        <h1>oneworld RTW Explorer Planner</h1>
        <p>
          Route snapshot not found ({loadError}). Run <code>npm run pipeline</code> at the
          repo root, then restart the dev server.
        </p>
      </div>
    );
  }
  if (!graph) {
    return <div className="fullscreen-message">Loading route data…</div>;
  }

  return (
    <div className="app">
      <MapView airports={airportFeatures} arcs={arcFeatures} onClickAirport={onClickAirport} />
      <Sidebar
        graph={graph}
        planner={planner}
        validation={validation}
        completeValidation={completeValidation}
        nextHops={nextHops}
        notice={notice}
        setNotice={setNotice}
        surfaceMode={surfaceMode}
        setSurfaceMode={setSurfaceMode}
        onSelectAirport={onClickAirport}
      />
    </div>
  );
}

function degreeColor(deg: number): string {
  if (deg >= 60) return '#c0392b';
  if (deg >= 30) return '#e67e22';
  if (deg >= 12) return '#2e86c1';
  if (deg >= 4) return '#5dade2';
  return '#a9cce3';
}

export function productLabel(p: string): string {
  return p === 'explorer'
    ? 'oneworld Explorer'
    : p === 'global-explorer'
      ? 'Global Explorer'
      : 'Circle Pacific';
}
