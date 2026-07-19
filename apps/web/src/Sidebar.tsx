import { useMemo, useState } from 'react';
import type { CabinClass, FareProduct, ValidationResult } from '@rtw/shared';
import { CARRIER_NAMES, CONTINENT_NAMES, RULES_EDITION } from '@rtw/shared';
import { productLabel, type NextHop } from './App.tsx';
import { productCarrierMask, type Graph } from './graph.js';
import { currentPoint, usePlannerState } from './state.ts';

interface SidebarProps {
  graph: Graph;
  planner: ReturnType<typeof usePlannerState>;
  validation: ValidationResult | null;
  completeValidation: ValidationResult | null;
  nextHops: Map<string, NextHop>;
  notice: string | null;
  setNotice: (n: string | null) => void;
  surfaceMode: boolean;
  setSurfaceMode: (b: boolean) => void;
  onSelectAirport: (iata: string) => void;
}

const MILEAGE_CAPS: Record<FareProduct, Record<CabinClass, number> | null> = {
  explorer: null,
  'global-explorer': { economy: 39000, business: 34000, first: 34000 },
  'circle-pacific': { economy: 29000, business: 29000, first: 29000 },
};

export function Sidebar(props: SidebarProps) {
  const { graph, planner, validation, completeValidation, notice } = props;
  const { state, setState, undo, redo, canUndo, canRedo } = planner;
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const current = currentPoint(state);

  /**
   * Delete any leg. Removing a middle leg removes its arrival point and merges
   * the two adjacent legs into one direct leg (flight if a direct eligible
   * route exists, else a surface sector).
   */
  const deleteSegment = (i: number) => {
    const segs = state.segments;
    if (i === segs.length - 1) {
      setState((p) => ({ ...p, segments: p.segments.slice(0, -1) }));
      return;
    }
    const a = segs[i].from;
    const c = segs[i + 1].to;
    const removed = segs[i].to;
    if (a === c) {
      // A→B→A collapses to nothing.
      setState((p) => ({
        ...p,
        segments: [...p.segments.slice(0, i), ...p.segments.slice(i + 2)],
      }));
      props.setNotice(`Removed ${removed}; the out-and-back legs collapsed.`);
      return;
    }
    const mask = productCarrierMask(state.product);
    const direct = (graph.adjacency.get(a) ?? []).some(
      (e) => e.to === c && e.carriers.some((x) => mask.has(x)),
    );
    const merged = {
      from: a,
      to: c,
      ...(direct ? {} : { surface: true as const }),
      stopover: segs[i + 1].stopover,
    };
    setState((p) => ({
      ...p,
      segments: [...p.segments.slice(0, i), merged, ...p.segments.slice(i + 2)],
    }));
    props.setNotice(
      direct
        ? `Removed ${removed}; ${a} → ${c} merged into one direct leg.`
        : `Removed ${removed}. There is no direct eligible flight ${a} → ${c}, so the merged leg became a surface sector — delete it too if that is not what you want.`,
    );
  };

  const carrierOptionsFor = (i: number): string[] => {
    const s = state.segments[i];
    if (s.surface) return [];
    const mask = productCarrierMask(state.product);
    const edge = (graph.adjacency.get(s.from) ?? []).find((e) => e.to === s.to);
    const carriers = (edge?.carriers ?? []).filter((c) => mask.has(c));
    if (s.carrier && !carriers.includes(s.carrier)) carriers.push(s.carrier);
    return carriers;
  };

  const searchMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: Array<{ iata: string; label: string }> = [];
    for (const a of graph.airports.values()) {
      if (
        a.iata.toLowerCase() === q ||
        a.city.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q)
      ) {
        out.push({ iata: a.iata, label: `${a.iata} — ${a.city} (${a.name})` });
        if (out.length >= 8) break;
      }
    }
    return out;
  }, [graph, search]);

  const exportText = (): string => {
    const lines = [
      `${productLabel(state.product)} itinerary — ${state.cabin}, fare basis ${
        completeValidation?.fareBasis ?? 'n/a'
      } (rules as of ${RULES_EDITION})`,
    ];
    state.segments.forEach((s, i) => {
      lines.push(
        `${String(i + 1).padStart(2)}. ${s.from}-${s.to}${s.surface ? ' (surface)' : ''}${
          s.carrier ? ` ${s.carrier}` : ''
        }${s.stopover === false ? ' [transfer]' : ''}`,
      );
    });
    if (validation) {
      lines.push(
        `Totals: ${validation.stats.segmentCount}/16 segments, ` +
          `${validation.stats.totalMiles.toLocaleString()} mi (great-circle), ` +
          `continents: ${validation.stats.continentsCounted.join(', ')}`,
      );
    }
    lines.push(
      'Validated offline against the published fare rules. Availability and pricing NOT checked — reproduce in rtw.oneworld.com or hand to a travel agent.',
    );
    return lines.join('\n');
  };

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      props.setNotice('Clipboard unavailable — copy manually:\n' + text);
    }
  };

  const caps = MILEAGE_CAPS[state.product];
  const cap = caps?.[state.cabin] ?? null;
  const miles = validation?.stats.totalMiles ?? 0;

  return (
    <div className="sidebar">
      <header>
        <h1>oneworld RTW planner</h1>
        <div className="selectors">
          <select
            value={state.product}
            onChange={(e) =>
              setState((p) => ({ ...p, product: e.target.value as FareProduct }))
            }
          >
            <option value="explorer">oneworld Explorer (continents)</option>
            <option value="global-explorer">Global Explorer (mileage)</option>
            <option value="circle-pacific">Circle Pacific (mileage)</option>
          </select>
          <select
            value={state.cabin}
            onChange={(e) => setState((p) => ({ ...p, cabin: e.target.value as CabinClass }))}
          >
            <option value="economy">Economy</option>
            <option value="business">Business</option>
            <option value="first">First</option>
          </select>
        </div>
      </header>

      <div className="search">
        <input
          placeholder="Search airport / city…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {searchMatches.length > 0 && (
          <ul className="search-results">
            {searchMatches.map((m) => (
              <li key={m.iata}>
                <button
                  onClick={() => {
                    props.onSelectAirport(m.iata);
                    setSearch('');
                  }}
                >
                  {m.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!state.origin && state.segments.length === 0 ? (
        <p className="hint">
          <strong>Explore mode.</strong> Marker size/colour = number of onward
          destinations on eligible carriers; hollow blue-outlined markers are
          dead ends served from a single airport. Click an airport (or search)
          to set your origin and start building.
        </p>
      ) : (
        <p className="hint build">
          Building from <strong>{current}</strong> — green airports are legal next
          hops; red would break a rule (click to see why); faint ones have no
          direct eligible flight.
        </p>
      )}

      {notice && (
        <div className="notice" onClick={() => props.setNotice(null)}>
          {notice}
        </div>
      )}

      <div className="toolbar">
        <button onClick={undo} disabled={!canUndo} title="Undo">↩ Undo</button>
        <button onClick={redo} disabled={!canRedo} title="Redo">↪ Redo</button>
        <button
          className={props.surfaceMode ? 'active' : ''}
          onClick={() => props.setSurfaceMode(!props.surfaceMode)}
          disabled={!current}
          title="Next map click adds a surface sector (own arrangement)"
        >
          🚆 Surface
        </button>
        <button
          onClick={() =>
            setState(() => ({ ...state, origin: null, segments: [] }))
          }
          disabled={!state.origin && state.segments.length === 0}
        >
          ⟲ Clear
        </button>
      </div>

      <section className="segments">
        {state.origin && state.segments.length === 0 && (
          <div className="segment-row">Origin: <strong>{state.origin}</strong></div>
        )}
        {state.segments.map((s, i) => {
          const isLast = i === state.segments.length - 1;
          const options = carrierOptionsFor(i);
          return (
            <div className="segment-row" key={i}>
              <span className="seg-route">
                {i + 1}. {s.from} → {s.to} {s.surface && <em>surface</em>}
              </span>
              {!s.surface && options.length > 0 && (
                <select
                  value={s.carrier ?? ''}
                  onChange={(e) =>
                    setState((p) => ({
                      ...p,
                      segments: p.segments.map((seg, j) =>
                        j === i ? { ...seg, carrier: e.target.value || undefined } : seg,
                      ),
                    }))
                  }
                >
                  <option value="">carrier?</option>
                  {options.map((c) => (
                    <option key={c} value={c}>
                      {c} {CARRIER_NAMES[c] ? `– ${CARRIER_NAMES[c]}` : ''}
                    </option>
                  ))}
                </select>
              )}
              {!isLast && (
                <label
                  className="stopover-toggle"
                  title="Tick if this point is just a connection (layover under 24h). Unticked = stopover (staying more than 24h)."
                >
                  <input
                    type="checkbox"
                    checked={s.stopover === false}
                    onChange={(e) =>
                      setState((p) => ({
                        ...p,
                        segments: p.segments.map((seg, j) =>
                          j === i ? { ...seg, stopover: !e.target.checked } : seg,
                        ),
                      }))
                    }
                  />
                  transfer
                </label>
              )}
              <button
                className="seg-delete"
                title={
                  isLast
                    ? 'Remove this leg'
                    : `Remove ${s.to} — the adjacent legs merge into one direct leg`
                }
                onClick={() => deleteSegment(i)}
              >
                ✕
              </button>
            </div>
          );
        })}
      </section>

      {validation && (
        <>
          <section className="stats">
            <div className="fare-basis">
              Fare basis: <strong>{validation.fareBasis ?? '—'}</strong>
            </div>
            <div className="stat-line">
              Segments {validation.stats.segmentCount}/16
              <Bar value={validation.stats.segmentCount} max={16} />
            </div>
            <div className="stat-line">
              {validation.stats.flownMiles.toLocaleString()} mi
              {miles > validation.stats.flownMiles &&
                ` (+${(miles - validation.stats.flownMiles).toLocaleString()} min. to close the loop)`}
              {cap ? ` / ${cap.toLocaleString()}` : ''}
              {cap && <Bar value={miles} max={cap} />}
            </div>
            <div className="stat-line">
              Continents: {validation.stats.continentsCounted.map((c) => CONTINENT_NAMES[c]).join(', ') || '—'}
            </div>
            <div className="stat-line">
              Oceans: Atlantic {validation.stats.atlanticCrossings} · Pacific{' '}
              {validation.stats.pacificCrossings} · Stopovers {validation.stats.stopoverCount}
            </div>
          </section>

          <section className="todos">
            <h2>To finish you still need to…</h2>
            <ul>
              {validation.todos.map((t, i) => (
                <li key={i} className={t.done ? 'done' : ''}>
                  {t.done ? '✓' : '○'} {t.message}
                </li>
              ))}
            </ul>
          </section>

          {validation.violations.length > 0 && (
            <section className="violations">
              <h2>Rule violations</h2>
              <ul>
                {validation.violations.map((v, i) => (
                  <li key={i}>
                    <code>{v.ruleId}</code> {v.message}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {validation.warnings.length > 0 && (
            <section className="warnings">
              <h2>Warnings</h2>
              <ul>
                {validation.warnings.map((v, i) => (
                  <li key={i}>
                    <code>{v.ruleId}</code> {v.message}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {completeValidation && (
            <section
              className={`finish ${completeValidation.valid ? 'ok' : 'not-ok'}`}
            >
              {completeValidation.valid ? (
                <>✅ This itinerary is complete and valid as {completeValidation.fareBasis}.</>
              ) : (
                <>
                  If you finished here:{' '}
                  {completeValidation.violations.length > 0
                    ? completeValidation.violations.map((v) => v.message).join(' ')
                    : 'not all checklist items are satisfied yet.'}
                </>
              )}
            </section>
          )}

          <div className="toolbar">
            <button onClick={() => copy(exportText(), 'export')}>
              {copied === 'export' ? '✓ Copied' : '📋 Export text'}
            </button>
            <button onClick={() => copy(window.location.href, 'link')}>
              {copied === 'link' ? '✓ Copied' : '🔗 Share link'}
            </button>
          </div>

          {validation.assumptions.length > 0 && (
            <section className="assumptions">
              {validation.assumptions.map((a, i) => (
                <p key={i}>ⓘ {a}</p>
              ))}
            </section>
          )}
        </>
      )}

      <footer>
        Rules as of {RULES_EDITION} · snapshot {graph.snapshot.generatedAt.slice(0, 10)} ·
        sources: {graph.snapshot.sources.join(', ')}.
        <br />
        No availability or pricing — final check in{' '}
        <a href="https://rtw.oneworld.com" target="_blank" rel="noreferrer">
          rtw.oneworld.com
        </a>
        . Mileage is great-circle, not ticketed TPM.
      </footer>
    </div>
  );
}

function Bar({ value, max }: { value: number; max: number }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <span className="bar">
      <span
        className="bar-fill"
        style={{ width: `${pct}%`, background: pct > 97 ? '#d64545' : pct > 85 ? '#e67e22' : '#2c7fb8' }}
      />
    </span>
  );
}
