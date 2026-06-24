import { assembleMenus } from './orchestrator.ts';
import { writeSite } from './render/index.ts';
import { crawlers } from './restaurants/registry.ts';
import type { Crawler } from './types.ts';

const OUT_DIR = 'public';

function statusLine(id: string, status: string, count: number): string {
  const icon = status === 'ok' ? '✅' : status === 'no-menu' ? '➖' : '❌';
  const detail = status === 'ok' ? `${count} item(s)` : status;
  return `  ${icon} ${id} — ${detail}`;
}

async function build(): Promise<void> {
  console.log(`[food-assembler] crawling ${crawlers.length} restaurant(s)...`);
  const data = await assembleMenus(crawlers);
  for (const r of data.results) {
    console.log(statusLine(r.restaurant.id, r.status, r.items.length));
  }
  await writeSite(data, OUT_DIR);
  console.log(`[food-assembler] wrote ${OUT_DIR}/index.html and ${OUT_DIR}/data.json`);
}

async function crawlOne(id: string): Promise<void> {
  const target: Crawler | undefined = crawlers.find((c) => c.config.id === id);
  if (!target) {
    console.error(`Unknown restaurant: ${id}`);
    console.error(`Available: ${crawlers.map((c) => c.config.id).join(', ')}`);
    process.exit(1);
  }
  const data = await assembleMenus([target]);
  console.log(JSON.stringify(data.results[0], null, 2));
}

const command = process.argv[2] ?? 'build';

switch (command) {
  case 'build':
    await build();
    break;
  case 'crawl': {
    const id = process.argv[3];
    if (!id) {
      console.error('Usage: bun run crawl <restaurant-id>');
      process.exit(1);
    }
    await crawlOne(id);
    break;
  }
  default:
    console.error(`Unknown command: ${command}`);
    process.exit(1);
}
