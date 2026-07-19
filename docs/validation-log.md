# Validation log — spot checks against the official tool

Per build guide §7: manually reproduce 3–5 itineraries validated by this app
in https://rtw.oneworld.com and record whether the official engine agrees.

| Date | Itinerary | Product | Our verdict | Official verdict | Notes |
|---|---|---|---|---|---|
| 2026-07-19 | SYD–HKG–LHR–JFK–LAX–SYD | Explorer (DONE4) | valid | _pending manual check_ | engine + app (demo data) |
| 2026-07-19 | SYD–DOH–LHR–JFK–LAX–SYD | Explorer (LONE4) | valid | _pending manual check_ | app with live snapshot; SYD–DOH deemed via Asia → 4 continents |
| 2026-07-19 | LHR–PER–SYD–LAX–JFK–LHR | Explorer (LONE4, via-Asia quirk) | valid | _pending manual check_ | golden test fixture |
| 2026-07-19 | SYD–NRT–LAX–SCL–SYD (QF via Chile) | Circle Pacific (LCIR29SA) | valid | _pending manual check_ | golden test fixture |

The official tool requires interactive booking-style input (and reflects live
availability, which this app deliberately does not model), so these checks
are manual by design.
