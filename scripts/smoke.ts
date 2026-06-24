/**
 * Smoke test: run the real crawlers against the live restaurant sites and report
 * which ones returned a menu. Unlike the unit tests (which parse saved
 * fixtures), this hits the network and is meant to catch *site layout drift* —
 * when a restaurant changes its markup, its crawler silently starts returning
 * zero items and shows up here as `no-menu`.
 *
 * Usage:
 *   bun run smoke              # crawl all restaurants
 *   bun run smoke <id> [...]   # crawl only the given restaurant id(s)
 *
 * Exit code is non-zero if any crawled restaurant did not return items, so it
 * can gate a manual/optional CI job. Weekends are expected to be empty, so a
 * `no-menu` result is reported but only fails the run on weekdays.
 */
import { assembleMenus } from '../src/orchestrator.ts';
import { crawlers } from '../src/restaurants/registry.ts';
import { todayInZurich, weekdayInZurich } from '../src/util/date.ts';

const ICON = { ok: '✅', 'no-menu': '➖', error: '❌' } as const;

const requested = process.argv.slice(2);
const selected =
  requested.length > 0
    ? crawlers.filter((c) => requested.includes(c.config.id))
    : crawlers;

if (selected.length === 0) {
  console.error(
    `No matching restaurants. Available: ${crawlers.map((c) => c.config.id).join(', ')}`,
  );
  process.exit(1);
}

const zurichDay = new Date().getDay();
const isWeekend = zurichDay === 0 || zurichDay === 6;

console.log(
  `[smoke] ${todayInZurich()} (${weekdayInZurich()}) — crawling ${selected.length} restaurant(s) live...\n`,
);

const data = await assembleMenus(selected);

let problems = 0;
for (const r of data.results) {
  const detail =
    r.status === 'ok'
      ? `${r.items.length} item(s)`
      : r.status === 'error'
        ? `error: ${r.error ?? 'unknown'}`
        : 'no items returned';
  console.log(`  ${ICON[r.status]} ${r.restaurant.id.padEnd(20)} ${detail}`);

  if (r.status === 'ok') continue;
  // On weekdays, anything other than a populated menu is suspicious (likely
  // layout drift or an outage). On weekends, empty menus are expected.
  if (!isWeekend) problems++;
}

console.log('');
if (problems > 0) {
  console.error(
    `[smoke] ${problems} restaurant(s) returned no menu on a weekday — possible layout drift. Inspect the crawlers and refresh fixtures.`,
  );
  process.exit(1);
}

console.log(
  isWeekend
    ? '[smoke] weekend run — empty menus are expected, not failing.'
    : '[smoke] all crawled restaurants returned a menu.',
);
