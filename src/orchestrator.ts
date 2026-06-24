import { chromium, type Browser, type BrowserContext } from 'playwright';
import type { Crawler, MenuResult, RawData } from './types.ts';
import { mapWithConcurrency } from './util/concurrency.ts';
import { todayInZurich } from './util/date.ts';

export interface OrchestratorOptions {
  /** Max number of crawlers running at once. */
  concurrency?: number;
  /** Per-restaurant timeout in milliseconds. */
  timeoutMs?: number;
  /** Inject a browser (e.g. for testing). When omitted, Chromium is launched. */
  browser?: Browser;
}

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_TIMEOUT_MS = 45_000;

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Crawl timed out after ${ms}ms`)), ms),
  );
}

/**
 * Run a single crawler in its own browser context, always resolving to a
 * MenuResult. Failures are captured as status 'error'; empty successful crawls
 * are normalized to 'no-menu'.
 */
async function runCrawler(
  browser: Browser,
  crawler: Crawler,
  timeoutMs: number,
): Promise<MenuResult> {
  const crawledAt = new Date().toISOString();
  let context: BrowserContext | undefined;
  try {
    context = await browser.newContext();
    const page = await context.newPage();
    const items = await Promise.race([crawler.crawl(page), timeout(timeoutMs)]);

    if (items.length === 0) {
      return { restaurant: crawler.config, status: 'no-menu', items: [], crawledAt };
    }
    return { restaurant: crawler.config, status: 'ok', items, crawledAt };
  } catch (err) {
    return {
      restaurant: crawler.config,
      status: 'error',
      items: [],
      error: err instanceof Error ? err.message : String(err),
      crawledAt,
    };
  } finally {
    await context?.close().catch(() => {});
  }
}

/**
 * Crawl all restaurants and assemble today's RawData. Never throws as a result
 * of an individual crawler failing; the pipeline always produces output.
 */
export async function assembleMenus(
  crawlers: readonly Crawler[],
  options: OrchestratorOptions = {},
): Promise<RawData> {
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const ownBrowser = options.browser === undefined;
  const browser = options.browser ?? (await chromium.launch({ headless: true }));

  try {
    const results = await mapWithConcurrency(crawlers, concurrency, (crawler) =>
      runCrawler(browser, crawler, timeoutMs),
    );

    return {
      date: todayInZurich(),
      generatedAt: new Date().toISOString(),
      results,
    };
  } finally {
    if (ownBrowser) {
      await browser.close().catch(() => {});
    }
  }
}
