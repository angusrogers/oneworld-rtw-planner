# RTW Explorer Planner

**Plan round-the-world airline itineraries on a clickable map, with the fare
rules checked live as you build.**

### ✈ [Open the planner → angusrogers.github.io/oneworld-rtw-planner](https://angusrogers.github.io/oneworld-rtw-planner/)

A friendlier alternative to the official planners that tells you *why*
something is illegal and *where you can actually go next*. Covers both
alliances' multi-stop fare products — switch with the toggle in the top
right:

| Alliance | Product | Rules | Priced by |
|---|---|---|---|
| oneworld | oneworld Explorer | Rule 3015, 27 FEB 26 | Continents visited (3–6) → `LONE4`, `DONE5`… |
| oneworld | Global Explorer | Rule 9701, 27 FEB 26 | Mileage (26/29/34/39k) → `LGLOB34`… |
| oneworld | Circle Pacific Explorer | Rule 7889, 27 FEB 26 | Mileage (22/26/29kSA) → `LCIR26`… |
| Star Alliance | Round the World | T&C 12 JAN 22 | Mileage (26/29/34/39k), Normal/Special tiers |

The canonical rule texts live in `docs/rules-pdfs/`.

## Using the site

1. **Explore** — every airport served by an eligible carrier is on the map;
   marker size/colour = number of onward destinations for the selected fare
   product ("where should I even try from here?"). Hollow blue-outlined
   markers are dead ends served from a single airport.
2. Click an airport (or search) to set your **origin**.
3. **Build** — green airports are *legal next hops* (each candidate edge is
   validated speculatively against the full rules engine); red ones break a
   rule — click to see exactly which; faint ones have no direct eligible
   flight (add a 🚆 **surface sector** if you'll make your own way). The
   sidebar tracks segments, mileage vs cap, continents, ocean crossings,
   stopovers, the derived fare basis, and a "to finish you still need to…"
   checklist.
4. Points are **stopovers by default** (staying >24h) — tick "transfer" at
   points where you just connect. Pick the operating carrier per leg where
   it matters, delete any leg with ✕, undo/redo freely.
5. Switch fare product or alliance at any time — the same itinerary is
   re-validated instantly. **Share** your route as a URL, or **export** a
   text summary for the official tool or a travel agent.

**No availability or pricing, by design.** A legal route ≠ bookable seats.
Finish in [rtw.oneworld.com](https://rtw.oneworld.com) or the
[Star Alliance Book and Fly tool](https://www.staralliance.com/en/round-the-world),
or hand the export to a travel agent.

## Architecture

npm-workspaces monorepo, deployed as a static site to GitHub Pages on every
push to `main` (`.github/workflows/deploy.yml`: test → build → publish).

```
packages/
  shared/         types + geography tables (continents/TCs, Russia–Urals split,
                  Hawaii set, US transcon columns, AU restricted pairs,
                  per-product carrier masks, metro city codes)
  rules-engine/   pure TS validators for 3015 / 9701 / 7889 / Star RTW; zero
                  deps; returns {valid, extensible, violations, warnings,
                  todos, assumptions, stats, fareBasis}; 83 unit + golden +
                  property tests
  data-pipeline/  ourairports.com airport metadata + route crawl →
                  data/snapshot/snapshot.json (+ report.json)
apps/
  web/            Vite + React + MapLibre GL (no map token needed)
data/
  snapshot/       generated route graph (committed artifact)
  cache/          downloaded source data (safe to delete)
docs/
  rules-pdfs/     canonical fare-rule texts (oneworld PDFs + Star T&C)
```

The rules engine classifies every rule as **monotone** (once broken, always
broken → next-hop filtered off the map), **completable-only-if** (fine now,
must hold at the end → checklist), or **date-dependent** (validated only when
dates are attached; otherwise listed as assumptions).

### Route data

`RouteDataProvider` is swappable:

- **Wikipedia provider (default, no API key)** — crawls each airport's
  "Airlines and destinations" table via the MediaWiki API from carrier-hub
  seeds, maps affiliate brands (QantasLink → QF, United Express → UA, …),
  strips cargo rows, resolves destination links through ourairports metadata,
  and marks an edge `confidence: "both"` when the reverse page confirms it.
- **AeroDataBox provider** — used automatically when `AERODATABOX_API_KEY`
  (RapidAPI) is set.

The current snapshot covers **1,512 airports and 15,610 directed edges**
across both alliances; its generation date and rules editions are shown in
the app footer.

## Known limitations (also surfaced in the UI)

1. **No availability or pricing** — see above.
2. **Mileage is great-circle**, not GDS ticketed-point mileage (TPM, typically
   ≤2% different). The app warns within 3% of any cap.
3. **Stopover vs transfer needs dwell times.** Without dates every point is
   assumed a stopover; the engine surfaces this as an assumption.
4. **Codeshare nuances are warnings, not data** (e.g. Jetstar-operated QF
   codeshares) — verify those legs when booking.
5. **Rules and membership change.** Carrier lists and rule editions are
   config (`packages/shared/src/carriers.ts`, `geography.ts`); re-fetch the
   source rules when the alliances publish new editions.
6. **Route data is best-effort** (community-maintained sources); a missing
   route ≠ the flight doesn't exist. Single-source edges are tagged in the
   snapshot.
7. **Direct flights with intermediate stops** (one flight number, one coupon)
   count as one segment; their mileage is the end-to-end great circle, which
   understates the flown TPM via the stop.

## Development

```bash
npm install
npm test              # rules-engine suite (83 tests)
npm run dev           # local dev server → http://localhost:5173
npm run build         # production build (apps/web/dist)
npm run pipeline      # rebuild data/snapshot/snapshot.json (cached, resumable)
```

Pushing to `main` deploys automatically. See the
[user guide](docs/user-guide.md) for a walkthrough of the app itself.
