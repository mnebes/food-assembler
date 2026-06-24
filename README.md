# food-assembler

The Food assembler is a community project designed to help employees based at the two locations of Digitec Galaxus HQ to have a daily overview of what's available for lunch.

How it works:
- Every morning we crawl websites of the nearby restaurants and create a summary of what's available this given day.
- For each configured restaurant we have a dedicated crawler implementation that identifies what is available on that day. (most of them probably need something that can render the page to access the information)
- The summary is deployed to github pages
- The raw data is also exposed in a json file via github pages

example lunch locations:
- https://www.westhive.com/en/eat-drink/westhive-kitchen-zurich-hardturm/
- https://rootsandfriends.com/en/food/RootsKitchen/
- https://www.zhdk.ch/campustoniareal/gastronomie
- https://www.zfv.ch/de/essen-gehen/gastronomie-im-technopark-zuerich#menu

## Development

Built with **TypeScript on [Bun](https://bun.com)** and **[Playwright](https://playwright.dev)** (headless Chromium) for crawling.

See [`docs/DESIGN.md`](docs/DESIGN.md) for the architecture and [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) for progress.

### Setup

```sh
bun install                  # install dependencies
bunx playwright install chromium   # install the headless browser
```

### Scripts

| Command           | Description                                  |
| ----------------- | -------------------------------------------- |
| `bun run build`   | Run the full crawl + render pipeline         |
| `bun run crawl`   | Crawl a single restaurant (debug)            |
| `bun run dev`     | Re-run the build on file changes             |
| `bun run smoke`   | Live smoke test for site layout drift        |
| `bun test`        | Run the test suite                           |

### Project layout

| Path                       | Purpose                                              |
| -------------------------- | ---------------------------------------------------- |
| `src/index.ts`             | CLI entry (`build` / `crawl <id>`)                   |
| `src/orchestrator.ts`      | Browser lifecycle + runs crawlers resiliently        |
| `src/restaurants/`         | One crawler module per restaurant + `registry.ts`    |
| `src/render/`              | JSON + HTML renderers                                 |
| `src/hq.ts`                | HQ locations and playful distance wording            |
| `scripts/smoke.ts`         | Live drift check (real network)                      |
| `test/fixtures/`           | Saved HTML/PDF + expected parser results             |
| `public/`                  | Generated output (`index.html`, `data.json`) + CSS   |

## Adding a restaurant

Each restaurant is an isolated module under `src/restaurants/`. Adding one is a
small, local change:

1. **Capture a fixture.** Save the rendered page markup you want to parse into
   `test/fixtures/<id>.html` (use `bun run crawl` or a quick Playwright snippet
   to grab `page.content()`). This keeps tests deterministic and offline.
2. **Write the crawler.** Create `src/restaurants/<id>.ts` exporting:
   - a `config: RestaurantConfig` (stable `id`, display `name`, `url`, optional
     `location`, and a `distances` entry for **every** HQ — the types enforce
     this);
   - a **pure parser** `parse<Name>(html: string): MenuItem[]` that extracts
     only *today's* dishes (so it can be unit-tested against the fixture);
   - a `crawler: Crawler` whose `crawl(page)` navigates, waits for the menu
     selector, and returns `parse<Name>(await page.content())`.
3. **Register it.** Add the crawler to the array in
   `src/restaurants/registry.ts` (display order = registry order).
4. **Test it.** Add `test/<id>.test.ts` asserting the parser pulls the expected
   dishes from the fixture and returns `[]` for empty input.

Resilience is handled centrally: the orchestrator gives each crawler a fresh
page with a timeout and turns failures/empty results into `error` / `no-menu`
states, so a single broken site never breaks the build.

## `data.json` schema

The build publishes `public/data.json` alongside the page as a stable contract
for downstream consumers. It is the serialized `RawData` object
(see [`src/types.ts`](src/types.ts)):

```jsonc
{
  "date": "2026-06-24",                  // YYYY-MM-DD, Europe/Zurich
  "generatedAt": "2026-06-24T05:00:00Z", // ISO 8601 build time
  "results": [
    {
      "restaurant": {
        "id": "westhive-hardturm",       // stable slug
        "name": "Westhive Kitchen",
        "url": "https://…",
        "location": "Hardturmstrasse 161, 8005 Zürich", // optional
        "distances": {                   // one entry per HQ
          "com-west": "near",            // "near" | "medium" | "far"
          "westpark": "medium"
        }
      },
      "status": "ok",                     // "ok" | "no-menu" | "error"
      "items": [                          // empty unless status === "ok"
        {
          "name": "Soup: Asparagus",      // dish name, source text as-is
          "description": "…",            // optional
          "price": "7.00 / 11.50",        // optional, raw string
          "tags": ["vegetarian"],         // optional
          "language": "en"               // "de" | "en" | "unknown"
        }
      ],
      "error": "…",                       // present only when status === "error"
      "crawledAt": "2026-06-24T05:00:01Z" // ISO 8601 per-restaurant timestamp
    }
  ]
}
```

Notes for consumers:
- `results` preserves registry (display) order.
- `status` is `ok` only when `items` is non-empty; an empty successful crawl is
  normalized to `no-menu`.
- Output is overwritten daily — there is no history (today only).

### Deployment

A scheduled GitHub Actions workflow ([`.github/workflows/daily.yml`](.github/workflows/daily.yml))
runs every weekday morning (05:00 UTC ≈ 06:00–07:00 Europe/Zurich) and can also
be triggered manually via **workflow_dispatch**. It installs Bun + headless
Chromium, runs `bun run build`, and deploys the generated `./public` directory to
GitHub Pages. Enable Pages for the repository (Settings → Pages → Source:
*GitHub Actions*) to publish; this requires a plan that supports Pages for the
repo's visibility.

