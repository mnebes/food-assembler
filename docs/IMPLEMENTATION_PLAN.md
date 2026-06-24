# Food Assembler — Implementation Plan

Work through these phases top-to-bottom. Each item is independently checkable.
See [`DESIGN.md`](./DESIGN.md) for rationale.

## Phase 0 — Project scaffolding
- [ ] Initialize Bun + TypeScript project (`bun init`, `package.json`, `tsconfig.json`)
- [ ] Add `.gitignore` (node_modules, `public/` output, Playwright caches)
- [ ] Add Playwright as a dependency and document Chromium install
- [ ] Define npm/bun scripts: `build`, `test`, `crawl` (single restaurant), `dev`
- [ ] Add `cheerio` (optional) for ergonomic DOM parsing

## Phase 1 — Domain model & utilities
- [ ] Create `src/types.ts` (MenuItem, RestaurantConfig, MenuResult, RawData, Crawler, HqLocation, DistanceCategory)
- [ ] Add `distances: Record<HqLocation, DistanceCategory>` to RestaurantConfig
- [ ] Create `src/hq.ts` (HQ ids + display names + playful wording per distance category)
- [ ] Create `src/util/date.ts` (Europe/Zurich date + "today" YYYY-MM-DD)
- [ ] Create `src/util/concurrency.ts` (run N crawlers with limited concurrency)
- [ ] Add unit tests for date + concurrency helpers

## Phase 2 — Orchestrator
- [ ] Implement shared Playwright browser launch/teardown
- [ ] Run each crawler with a fresh context/page and a per-restaurant timeout
- [ ] Wrap each crawl in try/catch → produce `MenuResult` with `ok | no-menu | error`
- [ ] Treat empty `ok` results as `no-menu`
- [ ] Assemble `RawData` (today only) from all results
- [ ] Ensure the pipeline never throws even if every crawler fails

## Phase 3 — Renderers
- [ ] Implement `src/render/json.ts` → writes `public/data.json`
- [ ] Implement `src/render/html.ts` → writes `public/index.html`
- [ ] Add minimal `public/styles.css` (mobile-friendly, no framework)
- [ ] Show per-restaurant states: menu / "no menu today" / "unavailable today"
- [ ] Show each restaurant's distance from both HQs in playful wording (both labels visible)
- [ ] Show language badge per item; header shows date + last-updated time
- [ ] Add `public/.nojekyll`
- [ ] Unit-test renderers against a fixture `RawData`

## Phase 4 — Restaurant registry & first crawler
- [ ] Create `src/restaurants/registry.ts` (array of active crawlers)
- [ ] Implement first crawler end-to-end (e.g. **Westhive Hardturm**), incl. its `distances` map
- [ ] Save an HTML fixture + write a parser test for it
- [ ] Verify full pipeline locally produces `index.html` + `data.json`

## Phase 5 — Remaining v1 crawlers
- [ ] Implement **Roots Kitchen** crawler + fixture test (+ `distances` map)
- [ ] Implement **ZHdK Toni-Areal** crawler + fixture test (+ `distances` map)
- [ ] Implement **ZFV Technopark** crawler + fixture test (+ `distances` map)
- [ ] Confirm each is registered and resilient to layout changes/failures
- [ ] Set real HQ names + actual distance categories for all restaurants

## Phase 6 — CLI entry
- [ ] Implement `src/index.ts` (`bun run build`) running the full pipeline
- [ ] Add a single-restaurant debug mode (`crawl <id>`) printing JSON to stdout
- [ ] Log a concise per-restaurant status summary at the end of a run

## Phase 7 — CI/CD & GitHub Pages
- [ ] Add `.github/workflows/daily.yml` with `schedule` (morning, Europe/Zurich) + `workflow_dispatch`
- [ ] Steps: checkout → setup Bun → `bun install` → install Playwright Chromium → `bun run build`
- [ ] Upload `./public` as a Pages artifact and deploy
- [ ] Enable GitHub Pages for the repo and verify a successful published run
- [ ] Document the cron UTC↔CET offset in the workflow

## Phase 8 — Docs & polish
- [ ] Update `README.md` with setup, local run, and "how to add a restaurant" guide
- [ ] Document the `data.json` schema for downstream consumers
- [ ] Add a manual smoke-test job/script for detecting site layout drift
- [ ] Final review against `DESIGN.md` goals

## Future (post-v1, not scheduled)
- [ ] Slack/Teams notification or RSS feed
- [ ] Optional German→English translation pass
- [ ] Historical archive + weekly view
- [ ] Cross-restaurant dietary tag normalization
