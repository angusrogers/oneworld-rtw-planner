# Build Guide: oneworld RTW Explorer Route Planner

**Audience:** Claude (Fable 5) agent with full Claude Code capabilities.
**Goal:** Build a web application that makes planning oneworld round-the-world (RTW) itineraries dramatically easier than the official tool, by combining a clickable world map, live reachability hints, and a rules engine that validates itineraries against the three official fare products in real time.

---

## 1. What we're building and why

oneworld sells three multi-stop fare products, each governed by a published fare rule:

| Product | Rule # | Pricing basis | Rules PDF (fetch these — they are the source of truth) |
|---|---|---|---|
| oneworld Explorer | 3015 | Number of continents (3–6) | https://assets.ctfassets.net/m9ph4qvas97u/58dSxVDQ0kjLFD2Dsxpo6m/0ae0e100a274267777529778cbe91473/oneworld_Explorer_27_FEB_26.pdf |
| Global Explorer | 9701 | Total mileage (26k/29k/34k/39k) | https://assets.ctfassets.net/m9ph4qvas97u/2pqmhTK95sqIsn5UP02lz/a55a65324e4eff966e9d520216b6c307/Global_Explorer_27_FEB_26.pdf |
| oneworld Circle Pacific Explorer | 7889 | Total mileage (22k/26k/29kSA) | https://assets.ctfassets.net/m9ph4qvas97u/6VhKtZXpVik8bJewl10hro/e1c4b20f9dad53f15325b25972c3c17e/oneworld_Circle_Pacific_Explorer_27_FEB_26.pdf |

The official planner is widely reported (FlyerTalk, Australian Frequent Flyer) as buggy and frustrating: it tells you an itinerary is invalid without explaining *why*, and gives no help discovering *where you can actually go*. Our app fixes both problems:

1. **Clickable world map** of every airport served by eligible carriers.
2. **Reachability badges** — each airport shows how many onward destinations are directly reachable from it on eligible metal (Sydney: dozens; Astana: a handful). This is the "where should I even try?" affordance.
3. **Live rule validation** — as the user builds an itinerary click by click, the app filters/annotates the map to show only *legal next hops* under the selected fare product, and explains every violated rule in plain language.

**Explicit non-goals (v1):** pricing, fare-class (RBD) availability, and booking. Those require GDS-grade data. The app's output is a validated itinerary the user then reproduces in oneworld's booking engine (rtw.oneworld.com) or hands to a travel agent. Make this limitation visible in the UI.

**Important process note:** Fetch and re-parse the three PDFs above at the start of the build. The rule summaries in §3 below were extracted from the 27-FEB-26 editions and are believed accurate, but the PDFs are canonical. If a URL has rotated, the current versions are linked from https://www.oneworld.com/round-the-world. Fare rules are re-issued periodically — store the edition date in config and surface it in the UI footer ("Rules as of 27 FEB 26").

---

## 2. Eligible carriers (they differ per product — this matters)

Build the carrier list as **per-product config, not a single global constant.**

| IATA | Airline | Explorer (3015) | Global Explorer (9701) | Circle Pacific (7889) |
|---|---|---|---|---|
| AA | American Airlines | ✅ | ✅ | ✅ |
| AS | Alaska Airlines | ✅ | ✅ | ✅ |
| AT | Royal Air Maroc | ✅ | ✅ | ❌ |
| AY | Finnair | ✅ | ✅ | ❌ (except AY-operated SYD–SIN/BKK codeshares) |
| BA | British Airways | ✅ | ✅ | ✅ |
| CX | Cathay Pacific | ✅ | ✅ | ✅ |
| EI | Aer Lingus | ❌ | ✅ | ❌ |
| FJ | Fiji Airways | ✅ | ✅ | ✅ |
| GK | Jetstar Japan | ❌ | ✅ (but JL-marketed-GK-operated NOT permitted) | ❌ |
| IB | Iberia | ✅ | ✅ | ❌ |
| JL | Japan Airlines | ✅ | ✅ | ✅ |
| JQ | Jetstar | ❌ (only as QF codeshare) | ✅ | ❌ (only as QF codeshare) |
| MH | Malaysia Airlines | ✅ | ✅ | ✅ |
| NU | Japan Transocean Air | ✅ | ✅ | ✅ |
| PG | Bangkok Airways | ❌ | ✅ | ❌ |
| QF | Qantas | ✅ | ✅ | ✅ |
| QR | Qatar Airways | ✅ | ✅ | ✅ |
| RJ | Royal Jordanian | ✅ | ✅ | ✅ |
| UL | SriLankan Airlines | ✅ | ✅ | ✅ |
| WS | WestJet | ❌ | ✅ | ❌ |
| WY | Oman Air | ✅ | ✅ | ❌ (except WY-operated QR codeshares) |

**Codeshare policy (all products):** only codeshares both marketed *and* operated by eligible carriers count, with named exceptions:
- Explorer: + QF codeshares operated by Jetstar (JQ) and QF services operated by Alliance Airlines (QQ).
- Global Explorer: + QF codeshares operated by Air Tahiti Nui (TN), QF operated by QQ; JL flights operated by GK are excluded.
- Circle Pacific: + JQ-operated QF codeshares, AY-operated SYD–SIN/BKK, QQ-operated QF, WY-operated QR.

**Affiliates count as their parent** (American Eagle → AA, QantasLink → QF, BA CityFlyer/Euroflyer → BA, Fiji Link → FJ, J-Air/HAC/JAC → JL, Nordic Regional → AY, Air Nostrum/Iberia Express → IB, Horizon/SkyWest → AS, RAM Express → AT, WestJet Encore → WS on Global Explorer only). When ingesting route data, map affiliate operating-carrier codes to the parent.

**Edge cases to encode:** Cuba segments cannot coexist with AA/AS segments on one ticket (US restriction). BA/QF ground-transport "flights" (bus/rail with flight numbers) are excluded — filter out anything the schedule data flags as non-aircraft equipment (train = equipment code TRN, bus = BUS).

---

## 3. The rules engine — canonical rule encoding

This is the heart of the app. Implement it as a **pure, framework-free TypeScript library** (`packages/rules-engine`) with exhaustive unit tests, taking an itinerary + fare product and returning `{ valid, violations: [{ruleId, message, segments}] , warnings: []}`. Every rule below gets a stable `ruleId` so the UI can link to a human explanation.

### 3.1 Geography model (shared by 3015 and 9701)

Six "continents" grouped into three IATA traffic conferences:

- **TC1** = North America (**includes Caribbean, Central America, Panama**) + South America
- **TC2** = Europe/Middle East + Africa
- **TC3** = Asia + South West Pacific (SWP)

Non-obvious country→continent assignments (encode as an override table on top of a standard country→continent mapping):

| Country/region | Assigned to |
|---|---|
| Algeria, Morocco, Tunisia | Europe (Europe/Middle East) |
| Egypt, Libya, Sudan | Middle East (Europe/Middle East) |
| Russia west of Urals | Europe; **Russia east of Urals → Asia** (split by airport, not country — maintain an airport-level override list for Russian airports) |
| Kazakhstan, Kyrgyzstan, Tajikistan, Turkmenistan, Uzbekistan | Asia |
| Caribbean, Central America, Panama, Mexico | North America |

Europe/Middle East has two internal *zones* (Europe; Middle East) — needed because surface sectors "within the Middle East" are a named exception, and the QR A-class exception applies "within the Middle East".

Circle Pacific uses only four continents: Asia, North America, South America, South West Pacific.

**Special quirk (3015):** a single-flight or surface connection between SWP and Europe/Middle East (e.g. QF LHR–PER nonstop, or DOH–SYD) is *deemed to travel via Asia* — all three continents (SWP, Asia, EU/ME) must be counted for continent-based pricing. Encode as a post-processing step on continent counting.

### 3.2 oneworld Explorer (Rule 3015) — continent-based

- **Fare basis:** `{class}ONE{n}` where class ∈ L (economy), D (business, + IONE3 in select markets), A (first); n = continents visited (3–6), *counting origin continent and continents merely transited*.
- **R-OCEAN:** Must cross both the Atlantic and the Pacific, exactly one crossing of each. (Detect ocean crossings from segment endpoint continents: TC1↔TC2 over the Atlantic, TC1↔TC3 over the Pacific. A TC2↔TC3 flight crosses neither.)
- **R-DIRECTION:** Continuous forward direction across conferences TC1→TC2→TC3 (in either rotational direction, wrapping). Backtracking *within* a continent is permitted, **except no backtracking between Hawaii and other North America** (i.e. once you've flown HNL→mainland you can't return, and vice versa; maintain a Hawaii airport set).
- **R-RETURN:** Journey starts and ends at the same point. Origin-destination open-jaw by surface allowed only: within country of origin; within Middle East; USA↔Canada; HKG↔mainland China; Malaysia↔SIN; within Africa; Maldives↔Sri Lanka/India.
- **R-NOT-VIA-ORIGIN:** Itinerary may not pass through the origin point mid-journey.
- **R-INTERCONT:** Max one intercontinental departure and one intercontinental arrival per continent, except: two in North America; two in Asia; two in Europe/Middle East when travel is to/from/via Africa. If travel goes to/from Europe in both directions, itinerary may not include Mauritius or South Africa.
- **R-ORIGIN-COUNTRY:** Only one international departure and one international arrival to/from the country of origin (two for USA origin when one arrival/departure is a transfer without stopover). USA↔Canada doesn't count as international. Max 4 international transfers from any one country.
- **R-SURFACE:** Intermediate surface sectors allowed (count as segments). Transoceanic surface between TC1–TC2 or TC1–TC3 forbidden, except one permitted for SWP-originating itineraries.
- **R-SEGMENTS:** 3–16 segments total including surface. Per-continent *flight* segment caps: Africa 4, Asia 4, EU/ME 4, North America 6, South America 4, SWP 4.
- **R-NO-REPEAT:** Same city pair may not be flown more than once in the same direction.
- **R-US-TRANSCON:** Within USA/Canada, only one nonstop/single-plane transcontinental flight, defined as travel between Column A states {AZ, CA, NV, OR, WA} and Column B states {CT, FL, GA, IN, MD, MA, NJ, NY, NC, OH, PA, MI, SC, TN, VA, DC, KY}. Also max one flight *to* Alaska (state) and one *from* it.
- **R-AU-NONSTOP:** Within Australia only one nonstop permitted between: BME–BNE/MEL/SYD; DRW–CBR/MEL/SYD; KTA–BNE/MEL/SYD; PER–BNE/CBR/CNS/SYD/MEL.
- **R-STOPOVERS:** Minimum 2 stopovers overall; max 2 stopovers in continent of origin. (A stopover = >24h at a point; connections are transfers. You'll need dwell-time input, or in date-less exploration mode treat every named point as a stopover and flag it as an assumption.)
- **R-MINSTAY:** TC1-origin itineraries: last international sector must depart ≥10 days after the first international sector. **R-MAXSTAY:** return travel from last stopover within 12 months of departure.

### 3.3 Global Explorer (Rule 9701) — mileage-based

Same geography, ocean, direction (backtracking within a continent permitted — no Hawaii exception stated), return/open-jaw list, not-via-origin, intercontinental limits (Africa exception here *excludes* South Africa and Mauritius from the "via Africa" trigger), origin-country limits, surface-sector rules, 3–16 segments, and no-repeat rule as 3015. Differences:

- **R-MILEAGE:** Sum of TPM (ticketed point mileage; approximate with great-circle distance — flag as approximation, real TPMs come from GDS) over all segments **including origin-destination surface** must not exceed the cap: LGLOB26/IGLOB26 = 26,000 mi (Y & J only); LGLOB29 = 29,000 (Y only); L/D/AGLOB34 = 34,000 (all classes); LGLOB39 = 39,000 (Y only). No extra-mileage surcharge escape hatch — hard caps.
- **No per-continent segment caps.**
- **R-STOPOVERS-GE:** 26k: min 2, max 5 free stopovers, ≤2 per region. 29k/34k/39k: min 2, ≤4 per region. Max 2 in region of origin. A surface sector spanning two regions counts as a stopover in each region but one against the total.

### 3.4 Circle Pacific Explorer (Rule 7889) — Pacific circle, mileage-based

Materially different shape — model it as its own validator sharing primitives:

- **R-CP-ORIGIN:** Origin/terminus country must be in: Australia, Brunei, Cambodia, Canada, China, Hong Kong, Indonesia, Japan, Malaysia, Mexico, Myanmar, New Zealand, Philippines, Singapore, South America (any), South Korea, Taiwan, Thailand, USA, Vietnam.
- **R-CP-MILEAGE:** Caps: xCIR22 = 22,000; xCIR26 = 26,000; xCIR29SA = 29,000. Max 16 segments.
- **R-CP-CIRCLE:** For CIR22/26: cross the North/Central Pacific (Asia↔Americas) in one direction and the South Pacific (Americas↔Australia/NZ) in the other; one crossing each; South America not permitted. For CIR29SA: must originate in or include South America; North/Central Pacific one way, and the other way via **Chile to/from SWP on QF services** (i.e. the SCL–SYD/AKL corridor).
- **R-CP-INTERCONT:** One intercontinental departure + one arrival per continent (Asia, NA, SA, SWP). Max 4 international transfers per country. **Max 3 transfers at any one city.**
- **R-CP-EXCLUSIONS:** No travel via Caribbean, Bermuda, or Central America. No travel via the South Asian subcontinent (India, Pakistan, Bangladesh, Sri Lanka, Nepal, Bhutan, Maldives) — so UL is on the carrier list but its Colombo hub is unusable; only e.g. its regional tag flights outside the subcontinent could ever apply, which in practice means UL rarely appears. Handle gracefully.
- **R-CP-RETURN:** Same origin/terminus; open-jaw only within country of origin or USA↔Canada.
- **R-CP-STOPOVERS:** Free: 22k min 2/max 4; 26k min 2/max 5; 29k min 2/max 6. Max one stopover at any point; two required outside country of origin; max one in country of origin; max two free per region. Additional stopovers purchasable at USD 150 (max +2/region, none in country of origin) — model purchasable stopovers as warnings with cost, not violations.
- **R-CP-MINSTAY:** 5 days (First/Business) or 10 days (Economy) from day after first international departure to earliest return from last stopover outside origin country. Max stay 12 months.

### 3.5 Validation UX contract

The engine must support **partial itineraries** ("is this prefix still extensible to a legal itinerary?") not just complete ones. Rules fall into three classes; tag each:

1. **Monotone violations** (once broken, always broken): repeated city pair same direction, exceeded segment/continent caps, exceeded mileage, second ocean crossing, backtrack across conferences, Hawaii backtrack, second US transcon. → filter these next-hops off the map entirely.
2. **Completable-only-if rules** (fine now, must be satisfied by the end): return to origin, min 2 stopovers, both oceans crossed, min 3 continents. → show as a "to-do" checklist panel, and grey out "finish" until satisfied.
3. **Date-dependent rules** (min/max stay, ticketing deadlines): validate only when dates are attached; otherwise list as assumptions.

For next-hop filtering, run the validator speculatively over every candidate edge from the current point (cheap: rules are O(segments)). Precompute nothing fancy until profiling says otherwise.

---

## 4. Data: which APIs, and the collect-vs-poll decision

### 4.1 The decision: hybrid, weighted heavily toward bulk snapshot

The user asked whether to (a) collect all route data at launch, or (b) continuously poll per-date ("can I fly X→Y within ±7 days of my chosen date?"). **Do both, in two layers, but the snapshot does 95% of the work:**

**Layer 1 — bulk route graph, refreshed weekly (the default the whole UI runs on).**
Rationale:
- The map and reachability badges need the *entire* graph in memory at once; you cannot render "Sydney has 78 onward destinations" by polling on demand.
- Airline route networks change on a seasonal cadence (IATA summer/winter schedule changes, late March / late October), not daily. Weekly refresh is generous.
- Cost/rate-limits: ~800–1,000 airports × 21 carriers polled continuously would burn any API budget for data that didn't change.
- Crucially, schedule-derived route data **already contains temporal validity** — operating days-of-week and effective from/until dates. Capture those in the snapshot and you can answer "does this route operate within ±7 days of 12 May?" *offline*, no polling needed, for the vast majority of cases.

**Layer 2 — on-demand, per-date schedule lookup (lazy, cached).**
Only when the user pins a date to a specific segment, hit the schedules endpoint for that origin+date(±window), to confirm the flight operates that week and show flight numbers/times. Cache by (airport, date) with ~24h TTL. This is dozens of calls per user session, not thousands, and only for segments the user actually cares about.

**Explicitly do not:** continuously poll the whole network, or fetch seat/fare availability (schedule APIs don't have RBD inventory; that's GDS territory — out of scope, see §8).

### 4.2 API evaluation

Evaluate in this order; build a thin `RouteDataProvider` interface so sources are swappable, because this market shifts.

| Source | What it gives | Cost | Verdict |
|---|---|---|---|
| **AeroDataBox** (via RapidAPI or API.market) | Airport departures/arrivals by date window (FIDS/schedules endpoint), airport "destination statistics" endpoint (direct route list per airport with carriers — almost exactly our Layer-1 need), airport metadata with coordinates. Free tier ~600 units/mo; paid tiers cheap ($5–$160/mo). | Low | **Primary recommendation** for both layers. The destination-stats endpoint per airport × ~1,000 oneworld airports fits comfortably in a low paid tier for a weekly batch. Best-effort data quality — cross-check (below). |
| **Amadeus Self-Service — Airport Routes API** | Exactly "all destinations from airport X" with airline filter. Free monthly quota historically. | Free/low | Good fit **but**: industry reporting flags a shutdown/forced migration of Amadeus Self-Service around mid-2026. **Verify current status before building on it.** If alive, use as the cross-check source; if dead, skip. |
| **Wikipedia "Airline destinations" pages** (e.g. "Qantas destinations") | Human-curated route lists per airline, including begins/ends dates. ~21 pages to parse via the MediaWiki API. | Free | **Secondary/cross-check source.** Surprisingly current for major carriers. Parse tables defensively; formats vary per page. Great for catching AeroDataBox gaps and for seasonal/announced routes. |
| **OpenFlights / ourairports.com** | Static airport database (IATA, ICAO, lat/lon, country) and a routes dump. | Free | Use **ourairports.com for airport metadata** (canonical, maintained CSV). Ignore the OpenFlights *routes* dump — frozen since ~2014. |
| **oneworld's own RTW tool** (rtw.oneworld.com) | The internal API behind the official planner necessarily encodes bookable city pairs and fare validity. | Free | **Inspect but don't depend on.** Open dev tools, map the JSON endpoints, and document them in `docs/oneworld-internal-api.md` as a validation oracle for spot tests. It's undocumented, unversioned, and their ToS likely prohibits systematic scraping — do not make it a build-time dependency, and keep any use to low-volume manual verification. |
| **Duffel** | Booking-grade offers/search API. | Free dev tier, per-search costs | Overkill for v1 (it answers "what can I book," per O&D query — wrong shape for graph-building). Note as the v2 path if fare availability is ever added. |
| **OAG / Cirium** | Gold-standard full schedules feed. | Enterprise $$$ | Note in docs as the "if this were a funded product" option. Skip. |
| **Scraping airline websites** | — | High effort | **Rejected.** Bot-protection, ToS, fragility; and everything needed exists in structured sources above. |

**Data quality strategy:** ingest AeroDataBox as primary, Wikipedia as secondary; where they disagree, keep the edge but tag `confidence: single-source` and render it slightly muted on the map with a tooltip ("reported by one source — verify before relying on it"). Log disagreements to a report the maintainer can review.

**Practical ingestion notes:**
- Seed the airport list from ourairports.com filtered to airports served by the 21 carriers (derive served-airport set from the carriers' route lists themselves, iteratively).
- Filter routes to **operating carrier ∈ eligible set for at least one fare product** (store the operating and marketing carriers per edge; the per-product carrier mask from §2 is applied at query time, since an edge may be valid for Global Explorer but not Circle Pacific).
- Strip ground-transport segments (equipment TRN/BUS/LCH) — BA/QF ground services are explicitly excluded from the fares.
- Store per-edge: distance (compute great-circle with haversine from airport coords — this also powers mileage validation), carriers[], days-of-week bitmask, effective-from/to dates, confidence, last-verified timestamp.
- Respect API ToS and rate limits; batch runs with backoff; make the refresh job idempotent and resumable.

---

## 5. Architecture

```
oneworld-rtw-planner/
├── packages/
│   ├── rules-engine/        # pure TS library, zero deps, exhaustively tested (§3)
│   ├── data-pipeline/       # Node scripts: fetch → normalize → validate → emit snapshot
│   └── shared/              # types: Airport, RouteEdge, Itinerary, FareProduct, geography tables
├── apps/
│   └── web/                 # Vite + React + TypeScript, MapLibre GL
├── data/
│   ├── snapshot/            # routes.json (or SQLite), airports.json, generated weekly
│   └── overrides/           # hand-maintained: continent overrides, Russia Ural split,
│                            # Hawaii set, US state columns, AU restricted pairs, carrier masks
└── docs/
```

- **No backend for v1.** The weekly snapshot (~1,000 airports, ~5–10k edges) gzips to well under 1 MB of JSON — ship it as a static asset, do all graph work and validation client-side. Layer-2 date lookups can go through a tiny serverless function that holds the API key and caches (never expose the key client-side).
- The data pipeline runs locally or on a scheduled GitHub Action; commit the snapshot artifact (gives free history/diffing of network changes — a nice changelog feature later: "new route this week: PER–JNB").
- Snapshot format: include `generatedAt`, source versions, and per-edge provenance.

## 6. Map UI

- **MapLibre GL JS** (open-source Mapbox fork; no token needed with a free style like OpenFreeMap/Carto) + **deck.gl** ArcLayer for great-circle route arcs if you want the pretty curves; plain GeoJSON lines are fine for v1.
- **Reachability badges:** cluster airports at low zoom; each marker shows its **onward-degree under the currently selected fare product and current itinerary state**. Two modes:
  - *Explore mode* (no itinerary yet): degree = count of direct destinations on eligible carriers. Scale marker size/color by degree so hubs pop visually (SYD big and warm, TSE/Astana small and cool). This directly answers "where should I try from here?"
  - *Build mode* (itinerary in progress): degree = count of *legal* next hops (speculative validation, §3.5). Illegal airports grey out with a tap-to-see-why explaining the specific rule.
- Clicking an airport in build mode appends the segment; an itinerary sidebar shows segments, running totals (segments used /16, per-continent counts, mileage vs cap with a progress bar, continents touched, oceans crossed, stopovers), the "to finish you still need to…" checklist, and the derived fare basis (e.g. `DONE5`, `LGLOB34`, `LCIR26`).
- Fare-product switcher (Explorer / Global Explorer / Circle Pacific) re-masks carriers and re-runs validation live — a great way for users to discover, e.g., that their itinerary fits Global Explorer but busts Explorer's Asia segment cap.
- Surface-sector button ("I'll make my own way from A to B") — surface sectors count against the 16 and against mileage on 9701/7889, and have their own legality rules; support them from day one.
- Support undo/redo, shareable itinerary via URL hash, and export (text summary with fare basis + segment list formatted for pasting into the oneworld tool or emailing an agent).
- Date attachment is optional per segment; attaching a date triggers the Layer-2 lookup and shows operating days ("this route runs Tue/Thu/Sat; nearest operating days to your pick: 11, 13 May").

## 7. Testing (do not skimp — the rules engine is the product)

- Unit-test every ruleId with minimal fixtures, both passing and violating.
- **Golden itineraries** in `tests/fixtures/`: build ~15 realistic itineraries and assert exact validation output. Include at minimum:
  - Classic DONE4: SYD–HKG–LHR / LHR–JFK–LAX / LAX–SYD-ish shapes (valid).
  - The LHR–PER nonstop trap: LON…PER on QF must count Asia → forces a 3-continent floor of SWP+Asia+EU/ME (validate continent counting).
  - Hawaii backtrack violation; second Atlantic crossing violation; Asia 5-flight-segments violation (3015 only — same itinerary valid on 9701); a 34,001-mile GLOB34 failure; a CIR26 itinerary touching Panama (violation: Central America excluded); a CIR29SA missing the QF-via-Chile leg.
  - Origin open-jaw cases: legal (MEL out / SYD home) vs illegal (SYD out / AKL home).
- Property tests: random walks over the real graph must never produce a validator crash; any itinerary the "legal next hop" filter permitted must validate clean when completed legally.
- Spot-check 3–5 itineraries against the official rtw.oneworld.com tool manually and record results in `docs/validation-log.md`.

## 8. Known limitations to document in the README and UI

1. **No availability:** a legal route ≠ bookable L/D/A/I inventory on your dates. Final check always happens in oneworld's engine.
2. **Mileage is great-circle, not TPM:** GDS ticketed-point mileage differs slightly (typically ≤2%). Show a buffer warning within 3% of a cap.
3. **Stopover vs transfer needs dwell times:** without dates, assume all points are stopovers and say so.
4. **Rules and membership change:** carrier list and rule editions are config; re-fetch PDFs when oneworld publishes new editions (the URLs embed the edition date).
5. **Data is best-effort:** weekly snapshot + confidence tags; show snapshot date in the footer.

## 9. Suggested build order

1. `shared` types + geography tables + overrides files (get the Russia/Urals, EU-ME zone, Hawaii, US-transcon tables right first — everything depends on them).
2. `rules-engine` for 3015 with full test suite → then 9701 (mostly shared) → then 7889.
3. `data-pipeline`: airports from ourairports → AeroDataBox destination-stats per airport → Wikipedia cross-check → snapshot emit. Run it; sanity-check degree numbers (SYD should be high-tens across QF+partners; small CIS airports low single digits).
4. Map explore mode (render graph + degree badges).
5. Build mode (itinerary state + speculative validation + next-hop filtering + checklist panel).
6. Layer-2 date lookups via serverless proxy.
7. Polish: share links, export, fare-product comparison, route-change changelog.

Ship after step 5 — that's already better than the official tool.
