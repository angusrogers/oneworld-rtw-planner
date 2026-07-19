# User guide — oneworld RTW Explorer Planner

Plan a oneworld round-the-world itinerary on a map, with the fare rules
checked live as you click. Everything runs locally on your Mac; nothing is
installed as a background service.

## Starting the app

From the project folder (`oneworld-rtw-planner`), in Terminal:

```bash
npm install        # first time only
npm run pipeline   # first time only, or to refresh route data (~20 min fresh,
                   #   seconds when re-run thanks to the local cache)
npm run dev        # starts the app
```

Then open **http://localhost:5173** in your browser.

## Stopping the app

Press **Ctrl+C** in the Terminal window running `npm run dev`. That's it —
the app only exists while that command runs; nothing keeps running in the
background afterwards.

If you've lost the terminal window and want to be sure nothing is still
listening: `lsof -i :5173` shows any leftover process, and
`kill <PID>` stops it.

The `npm run pipeline` data refresh is a one-shot job that exits by itself
(it's also safe to interrupt — re-running resumes from its cache).

## Using it

### 1. Explore — "where can I even go?"

The map opens showing every airport served by carriers eligible for the
selected fare product:

- **Marker size and colour = onward destinations**: big warm (orange/red)
  markers are hubs like LHR, DOH, DFW; small blue markers have only a few
  routes.
- **Hollow blue-outlined markers are dead ends** — all their service comes
  from one single airport. Fine to visit, awkward to route through.
- Pick your fare product (top left) and cabin before you start — the map
  re-filters to that product's carriers:
  - **oneworld Explorer** — priced by continents visited (3–6)
  - **Global Explorer** — priced by total mileage (26/29/34/39k)
  - **Circle Pacific** — Pacific circle, mileage-priced (22/26/29k)

### 2. Build — click your way around the world

Click any airport (or use the search box) to set your **origin**, then keep
clicking:

- **Green** = legal next hop. **Red** = a direct flight exists but taking it
  would break a rule — click it and the app tells you *which rule and why*.
  **Faint grey** = no direct eligible flight (use a surface sector if you'll
  make your own way). Clicking a thinly-connected airport also warns you,
  e.g. *"ALA: flights in from DOH; flights out to DOH, HKG"*.
- **Tick "stop"** on each point where you'll stay more than 24 hours.
  Points are transfers by default; the fares require **at least 2 stopovers**
  and cap how many you may make per region — stopovers are separate from the
  16-segment limit.
- **Pick the carrier** per leg from the dropdown when it matters (some rules
  are carrier-specific, e.g. Circle Pacific's QF-via-Chile requirement).
- **🚆 Surface** arms a surface sector: the next airport you click is reached
  by your own arrangement (it still counts as a segment and toward mileage).
- **✕ on any leg** removes it. Removing a middle leg drops that point and
  merges the neighbours into one direct leg — or a surface sector if no
  direct flight exists (the app tells you which happened).
- **Undo / Redo / Clear** in the toolbar; the URL updates as you build, so
  **🔗 Share link** gives anyone your exact itinerary.

### 3. Finish — is it bookable?

The sidebar keeps a running scorecard:

- **Fare basis** (e.g. `DONE4`, `LGLOB34`, `LCIR26`) derived live.
- **Segments /16**, **mileage vs cap** with a progress bar (red near the
  cap — great-circle mileage understates ticketed mileage by up to ~2%),
  continents, ocean crossings, stopovers.
- **"To finish you still need to…"** — the checklist of rules that must be
  true by the end (cross both oceans, return to origin, ≥2 stopovers…).
- A green **"✅ complete and valid"** box appears when everything passes.
- **📋 Export text** copies a summary to paste into rtw.oneworld.com or send
  to a travel agent.

## Why use this instead of rtw.oneworld.com?

| | Official tool | This app |
|---|---|---|
| Tells you *why* an itinerary is invalid | ✗ (generic errors) | ✅ names the exact rule, in plain language |
| Shows where you *can* go next | ✗ | ✅ legal next hops highlighted on the map |
| Discovering well-connected hubs | ✗ | ✅ reachability sizing/colours |
| Comparing fare products | Re-enter everything | ✅ one dropdown, instant re-validation |
| Trying variations | Slow, stateful, crash-prone | ✅ instant, with undo and shareable links |
| Availability & pricing | ✅ | ✗ — by design |

That last row is the deal: this app validates **routing legality only**. A
legal route is not a guarantee of bookable seats or a price. When you're
happy with an itinerary, reproduce it in [rtw.oneworld.com](https://rtw.oneworld.com)
(or hand the export to a travel agent) for the final availability check and
booking.

## Good to know

- Rules edition and route-data snapshot date are in the sidebar footer.
  Fare rules are encoded from the official rule PDFs (27 FEB 26 edition) in
  `docs/rules-pdfs/`.
- Route data comes from public sources, refreshed by `npm run pipeline`;
  it's best-effort. A missing route ≠ the flight doesn't exist.
- Direct flights with an intermediate stop (one flight number) count as one
  segment and appear as ordinary edges where the data lists them.
- Codeshare subtleties (Jetstar-operated QF codeshares etc.) appear as
  warnings rather than hard failures — verify those legs when booking.
