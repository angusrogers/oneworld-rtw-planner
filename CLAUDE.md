# oneworld-rtw-planner

npm-workspaces monorepo. See README.md for the full picture.

- `npm test` — rules-engine vitest suite (the rules engine is the product; keep
  it pure TS with zero runtime deps and exhaustive tests).
- `npm run pipeline` — rebuild `data/snapshot/snapshot.json` (Wikipedia crawl,
  cached under `data/cache/`; set `AERODATABOX_API_KEY` to use AeroDataBox).
- `npm run dev` — web app on :5173 (copies the snapshot into `apps/web/public`
  first via the `predev` script).

Fare rules are encoded from the 27 FEB 26 rule PDFs in `docs/rules-pdfs/`
(kept in-repo, canonical). When rules change: update
`packages/shared/src/{geography,carriers}.ts` and the validators in
`packages/rules-engine/src/`, and bump `RULES_EDITION`.

Rule classes matter: `monotone` violations gate next-hop filtering
(`extensible`), completable rules surface as todos, date-dependent rules as
assumptions. New rules must declare a class (see §3.5 of
`oneworld-rtw-planner-build-guide.md`).
