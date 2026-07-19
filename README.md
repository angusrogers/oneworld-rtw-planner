# oneworld RTW Explorer Planner

Plan **oneworld round-the-world itineraries** on a clickable map with live
fare-rule validation — a friendlier alternative to the official planner that
tells you *why* something is illegal and *where you can actually go next*.

Covers the three multi-stop fare products (27 FEB 26 rule editions, PDFs in
`docs/rules-pdfs/`):

| Product | Rule | Priced by |
|---|---|---|
| oneworld Explorer | 3015 | Continents visited (3–6) → `LONE4`, `DONE5`… |
| Global Explorer | 9701 | Mileage (26/29/34/39k) → `LGLOB34`… |
| Circle Pacific Explorer | 7889 | Mileage (22/26/29kSA) → `LCIR26`… |

**New here? Read the [user guide](docs/user-guide.md)** — startup/shutdown,
how to build an itinerary, and what the colours mean.

## Quick start (Apple Silicon macOS)

Requires Node ≥ 20 (`brew install node`).

```bash
npm install

# 1. Run the rules-engine test suite (62 tests)
npm test

# 2. Build the route snapshot (~20 min first run; crawls Wikipedia airport
#    pages politely and caches them under data/cache/)
npm run pipeline

# 3. Launch the app
npm run dev            # → http://localhost:5173
```

## Using the app

1. **Explore mode** — every airport served by an eligible carrier is on the
   map; marker size/colour = number of onward destinations under the selected
   fare product ("where should I even try from here?").
2. Click an airport (or use search) to set your **origin**.
3. **Build mode** — green airports are *legal next hops* (each candidate edge
   is validated speculatively against the full rules engine); red ones break a
   rule — click to see exactly which; faint ones have no direct eligible
   flight. The sidebar tracks segments/16, mileage vs cap, continents, ocean
   crossings, stopovers, the derived fare basis, and a "to finish you still
   need to…" checklist.
4. Points are **stopovers by default** (staying >24h) — tick "transfer" at
   points where you just connect (a layover under 24h). The fare needs at
   least 2 stopovers, and stopover caps are separate from the 16-segment
   limit. Pick the operating carrier per segment, add
   **surface sectors** (🚆), undo/redo, and delete any leg with ✕ — removing
   a middle leg drops that point and merges the neighbours into one direct
   leg (or a surface sector if no direct flight exists). Switch fare product
   live (a Global Explorer itinerary may bust Explorer's per-continent caps —
   instantly visible), **share** the itinerary as a URL, and **export** a text
   summary for rtw.oneworld.com or a travel agent.

## Architecture

```
packages/
  shared/         types + geography tables (continents/TCs, Russia–Urals split,
                  Hawaii set, US transcon columns, AU restricted pairs,
                  per-product carrier masks, metro city codes)
  rules-engine/   pure TS validators for 3015 / 9701 / 7889; zero deps;
                  returns {valid, extensible, violations, warnings, todos,
                  assumptions, stats, fareBasis}; 62 unit + golden +
                  property tests
  data-pipeline/  ourairports.com airport metadata + route crawl → 
                  data/snapshot/snapshot.json (+ report.json)
apps/
  web/            Vite + React + MapLibre GL (no map token needed)
data/
  snapshot/       generated route graph (committed artifact, weekly refresh)
  cache/          downloaded source data (safe to delete)
docs/
  rules-pdfs/     canonical fare-rule PDFs + extracted text
```

The rules engine classifies every rule as **monotone** (once broken, always
broken → next-hop filtered off the map), **completable-only-if** (fine now,
must hold at the end → checklist), or **date-dependent** (validated only when
dates are attached; otherwise listed as assumptions).

### Route data providers

`RouteDataProvider` is swappable (build guide §4.2):

- **Wikipedia provider (default, no API key)** — crawls each airport's
  "Airlines and destinations" table via the MediaWiki API from carrier-hub
  seeds, maps affiliate brands (QantasLink → QF, American Eagle → AA, …),
  strips cargo rows, resolves destination links through ourairports metadata,
  and marks an edge `confidence: "both"` when the reverse page confirms it.
- **AeroDataBox provider** — the build guide's primary recommendation; used
  automatically when `AERODATABOX_API_KEY` (RapidAPI) is set. The free/cheap
  tiers cover a weekly refresh.

Re-run `npm run pipeline` weekly-ish; the snapshot embeds `generatedAt`,
sources, and per-edge confidence, and `report.json` logs unresolved
destination labels and airports without data for maintainer review.

## Known limitations (also surfaced in the UI)

1. **No availability or pricing.** A legal route ≠ bookable L/D/A/I inventory.
   Always finish in [rtw.oneworld.com](https://rtw.oneworld.com) or with an
   agent.
2. **Mileage is great-circle**, not GDS ticketed-point mileage (TPM, typically
   ≤2% different). The app warns within 3% of any cap.
3. **Stopover vs transfer needs dwell times.** Without dates every point is
   assumed a stopover (>24h); tick "transfer" where you'll just connect. The
   engine surfaces this as an assumption until dates exist.
4. **Codeshare nuances are warnings, not data.** JQ/QQ/TN/WY exceptions need
   marketing-carrier data we don't have; the engine warns instead of failing.
5. **Rules and membership change.** Carrier lists and rule editions are config
   (`packages/shared/src/carriers.ts`, `geography.ts`); re-fetch the PDFs when
   oneworld publishes new editions. The rules edition and snapshot date are in
   the app footer.
6. **Route data is best-effort** (community-maintained sources); single-source
   edges are tagged in the snapshot. Schedules-with-dates lookups (build guide
   §4 layer 2) need a paid schedules API key and are not wired up.
7. **Direct flights with intermediate stops** (one flight number, one coupon —
   e.g. a one-stop "single plane service") count as **one segment** under the
   fare rules, and the route data already includes them where Wikipedia lists
   the through-destination. Caveat: mileage for such an edge is the
   end-to-end great circle, which understates the flown TPM via the stop —
   another reason to mind the 3% cap warning.

## Development

```bash
npm test                                  # rules-engine suite
npx tsc -p packages/rules-engine/tsconfig.json   # typechecks
npm run pipeline                          # refresh snapshot (cached, resumable)
npm run dev                               # web app dev server
npm run build                             # production build (apps/web/dist)
```
