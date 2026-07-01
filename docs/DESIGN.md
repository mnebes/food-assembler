# Food Assembler — Design Document

## 1. Overview

Food Assembler is a community project that gives Digitec Galaxus HQ employees (across
the two HQ locations) a daily, at-a-glance overview of what's available for lunch at
nearby restaurants.

Every morning an automated job crawls the websites of configured restaurants, extracts
the dishes available **that day**, builds a human-readable summary page, and publishes
both the summary and the raw data to GitHub Pages.

The two HQ locations are close together, so **every restaurant is relevant to both**.
They differ only in *how far you have to walk* from each HQ. Each restaurant therefore
carries a **distance category per HQ location** (e.g. `near` / `medium` / `far`), which
the summary can surface later in playful wording.

## 2. Goals & Non-Goals

### Goals
- Daily automated crawl of a configurable set of nearby restaurants.
- Per-restaurant crawler implementations (most sites need a real browser to render).
- Per-restaurant, **per-HQ distance category** so each location knows how far each
  restaurant is.
- A static summary page deployed to GitHub Pages.
- Raw machine-readable JSON exposed alongside the page.
- Resilient: one restaurant failing must not break the others.
- Easy to add new restaurants.

### Non-Goals (v1)
- No historical archive — only **today's** menu is shown; output is overwritten daily.
- No translation — source text is shown as-is, tagged with its language.
- No user accounts, ratings, ordering, or interactivity.
- No mobile app.

## 3. Tech Stack

| Concern            | Choice                                  | Rationale                                       |
| ------------------ | --------------------------------------- | ----------------------------------------------- |
| Language / runtime | **TypeScript on Bun**                   | Fast, batteries-included (test runner, bundler). |
| Page rendering     | **Playwright (Chromium, headless)**     | All crawlers render JS-heavy pages reliably.     |
| HTML parsing       | Playwright locators + optional `cheerio`| DOM queries on rendered content.                 |
| Output             | Hand-rolled static HTML + minimal CSS   | No framework overhead; full control.             |
| Scheduling         | GitHub Actions (cron)                   | Free, lives next to the repo.                    |
| Hosting            | GitHub Pages                            | Simple static hosting from the repo.             |
| Testing            | `bun test`                              | Built into the runtime.                          |

## 4. High-Level Architecture

```
                ┌─────────────────────────────────────────────┐
                │            GitHub Actions (cron)            │
                │              every morning, CET             │
                └───────────────────────┬─────────────────────┘
                                        │ runs
                                        ▼
        ┌───────────────────────────────────────────────────────┐
        │                     Orchestrator                      │
        │  1. load restaurant registry                          │
        │  2. launch shared Playwright browser                  │
        │  3. run each crawler (isolated, with timeout)         │
        │  4. collect results + per-restaurant status           │
        │  5. assemble RawData (today only)                     │
        │  6. render JSON + HTML into ./public                  │
        └───────────────┬───────────────────────────┬───────────┘
                        │                           │
         ┌──────────────▼─────────────┐   ┌─────────▼───────────┐
         │   Crawlers (one per resto) │   │   Renderers         │
         │   westhive, roots, zhdk,   │   │   - json renderer   │
         │   technopark, ...          │   │   - html renderer   │
         └──────────────┬─────────────┘   └─────────┬───────────┘
                        │                           │
                        ▼                           ▼
                 normalized MenuResult        ./public/index.html
                                              ./public/data.json
                                                      │
                                                      ▼
                                            Deployed to GitHub Pages
```

## 5. Core Domain Model

```ts
type Language = 'de' | 'en' | 'unknown';

// The two HQ locations. Extend this union if more sites are added.
type HqLocation = 'com-west' | 'westpark';

// How far a restaurant is from a given HQ. Ordered near -> far.
type DistanceCategory = 'near' | 'medium' | 'far';

interface MenuItem {
  name: string;            // dish name, source text as-is
  description?: string;    // optional longer text
  price?: string;          // raw price string, e.g. "CHF 18.50"
  tags?: string[];         // e.g. "vegetarian", "vegan" if cheaply detectable
  language: Language;      // language of this item's text
}

interface RestaurantConfig {
  id: string;              // stable slug, e.g. "westhive-hardturm"
  name: string;            // display name
  url: string;             // page to crawl
  location?: string;       // address hint / human-readable location
  // Distance category from each HQ. Every HQ should have an entry.
  distances: Record<HqLocation, DistanceCategory>;
}

type CrawlStatus = 'ok' | 'no-menu' | 'closed' | 'error';

interface MenuResult {
  restaurant: RestaurantConfig;
  status: CrawlStatus;
  items: MenuItem[];       // empty unless status === 'ok'
  error?: string;          // present when status === 'error'
  crawledAt: string;       // ISO timestamp
}

interface RawData {
  date: string;            // YYYY-MM-DD (Europe/Zurich)
  generatedAt: string;     // ISO timestamp
  results: MenuResult[];
}
```

## 6. Crawler Contract

Each restaurant has a dedicated crawler implementing a small interface:

```ts
interface Crawler {
  readonly config: RestaurantConfig;
  // Given a fresh Playwright page, return today's menu items.
  crawl(page: Page): Promise<MenuItem[]>;
}
```

- The orchestrator owns the browser lifecycle and hands each crawler a fresh page.
- Crawlers only contain site-specific extraction logic.
- A registry array lists all active crawlers, making "add a restaurant" a one-line change.

## 7. Orchestration & Resilience

- A **shared Chromium browser** is launched once; each crawler gets its own page/context.
- Each crawl runs with a **per-restaurant timeout** (e.g. 45s) and try/catch.
- Failure handling (per user decision):
  - `error` → restaurant still appears on the page with an **"unavailable today"** note.
  - `no-menu` → restaurant appears with a "no menu published today" note.
  - `ok` with empty items is treated as `no-menu`.
  - `closed` → a menu whose every dish is just a closed-marker (e.g. "geschlossen"
    during a summer break) is treated as `closed` and shown with a "closed" note.
- Crawls run with limited concurrency (e.g. 2–3 at a time) to bound resource use.
- The build **always succeeds** as long as the pipeline runs, even if every crawler fails.

## 8. Output

Generated into `./public` (the GitHub Pages publish directory):

- **`data.json`** — the `RawData` object. Stable, documented schema for consumers.
- **`index.html`** — static summary page:
  - Header with the date (Europe/Zurich) and "last updated" time.
  - One card/section per restaurant, in registry order.
  - Each restaurant shows its **distance from both HQs**, rendered in playful wording
    (e.g. near = "around the corner", medium = "a nice stroll", far = "a proper hike"),
    with both HQ labels visible.
  - Each dish shows name, optional description/price, and a small language badge
    (e.g. `DE`) since output is English-only but source text is shown as-is.
  - Clear visual state for "unavailable today" / "no menu today".
- **`styles.css`** — minimal hand-written CSS (mobile-friendly, no framework).

Output is overwritten on every run (today-only, no history).

## 9. Scheduling & Deployment

- **GitHub Actions** workflow:
  - `schedule` cron each morning (account for UTC vs Europe/Zurich; document the offset).
  - Also `workflow_dispatch` for manual runs.
  - Steps: checkout → setup Bun → `bun install` → install Playwright Chromium →
    `bun run build` → upload `./public` as a Pages artifact → deploy.
- **GitHub Pages** serves the `./public` artifact.

## 10. Configuration

- Restaurant registry lives in code (`src/restaurants/registry.ts`) for type safety,
  importing each crawler. Per-restaurant static metadata (name/url/location and the
  `distances` map) lives in the crawler module next to its logic.
- The two HQ locations are defined centrally (`src/hq.ts`): their ids (`com-west`,
  `westpark`), display names (**com.West**, **Westpark**), and the playful wording for
  each `DistanceCategory`. This keeps the HQ set and distance vocabulary in one place
  and decoupled from individual restaurants.
- Type safety guarantees every restaurant provides a distance for **every** HQ.

## 11. Initial Restaurants (v1)

From the README:
1. Westhive Kitchen Zurich Hardturm — https://www.westhive.com/en/eat-drink/westhive-kitchen-zurich-hardturm/
2. Roots Kitchen — https://rootsandfriends.com/en/food/RootsKitchen/
3. ZHdK Campus Toni-Areal gastronomy — https://www.zhdk.ch/campustoniareal/gastronomie
4. ZFV Technopark Zürich — https://www.zfv.ch/de/essen-gehen/gastronomie-im-technopark-zuerich#menu

The design must make adding a 5th+ restaurant a small, isolated change.

## 12. Testing Strategy

- **Unit tests** for renderers (JSON + HTML) using fixture `RawData`.
- **Parser tests** per crawler against saved HTML fixtures (no live network in CI tests),
  so site markup is captured and extraction logic is verified deterministically.
- A lightweight **smoke script** (manual / optional CI job) that runs real crawls to
  detect site layout drift.

## 13. Project Structure (proposed)

```
food-assembler/
├─ README.md
├─ docs/
│  ├─ DESIGN.md
│  └─ IMPLEMENTATION_PLAN.md
├─ package.json
├─ tsconfig.json
├─ src/
│  ├─ index.ts                 # CLI entry: runs the build
│  ├─ types.ts                 # domain model
│  ├─ hq.ts                    # HQ locations + distance wording
│  ├─ orchestrator.ts          # browser lifecycle + run crawlers
│  ├─ restaurants/
│  │  ├─ registry.ts           # list of active crawlers
│  │  ├─ westhive.ts
│  │  ├─ roots.ts
│  │  ├─ zhdk.ts
│  │  └─ technopark.ts
│  ├─ render/
│  │  ├─ json.ts
│  │  └─ html.ts
│  └─ util/
│     ├─ date.ts               # Europe/Zurich date helpers
│     └─ concurrency.ts
├─ test/
│  ├─ fixtures/                # saved HTML + expected results
│  ├─ render.test.ts
│  └─ <restaurant>.test.ts
├─ public/                     # generated output (gitignored except maybe .nojekyll)
└─ .github/workflows/daily.yml
```

## 14. Open Questions / Future Work

- Add a Slack/Teams post or RSS feed of the daily summary.
- Optional translation pass (German → English) if demand appears.
- Historical archive + "what's been served lately" view.
- Dietary tag normalization (vegan/vegetarian/halal) across restaurants.
