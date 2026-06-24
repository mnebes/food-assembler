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
| `bun test`        | Run the test suite                           |

