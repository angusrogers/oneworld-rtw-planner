# oneworld RTW tool internal API (validation oracle)

The official planner at https://rtw.oneworld.com is backed by an undocumented
internal JSON API that necessarily encodes bookable city pairs and fare
validity. Per the build guide (§4.2) we **inspect but do not depend on** it:
it is unversioned, and systematic scraping likely violates the site ToS. Use
it only for low-volume, manual spot checks of itineraries this app validates
(record results in `docs/validation-log.md`).

## How to map the endpoints

1. Open https://rtw.oneworld.com in a browser with dev tools → Network (XHR).
2. Build a small itinerary in the official tool.
3. Note the JSON endpoints called when adding a segment / validating; document
   request/response shapes here with a captured example each.

## Findings

_None recorded yet — populate when running the §7 spot checks._
