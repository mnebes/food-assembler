import { chromium, type Browser, type BrowserContext } from 'playwright';
import type { Crawler, MenuResult, RawData } from './types.ts';
import { mapWithConcurrency } from './util/concurrency.ts';
import { todayInZurich } from './util/date.ts';
import { isClosedMenu } from './util/menu.ts';

export interface OrchestratorOptions {
  /** Max number of crawlers running at once. */
  concurrency?: number;
  /** Per-restaurant timeout in milliseconds. */
  timeoutMs?: number;
  /**
   * Total attempts per restaurant before giving up. Crawls are flaky, so a
   * result of 'no-menu' or 'error' triggers another attempt. Must be >= 1.
   */
  attempts?: number;
  /** Inject a browser (e.g. for testing). When omitted, Chromium is launched. */
  browser?: Browser;
}

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_ATTEMPTS = 2;

interface Timeout {
  /** Rejects once the deadline passes. */
  promise: Promise<never>;
  /** Cancels the pending timer so it can't keep the event loop alive. */
  cancel: () => void;
}

function timeout(ms: number): Timeout {
  let handle: ReturnType<typeof setTimeout>;
  const promise = new Promise<never>((_, reject) => {
    handle = setTimeout(
      () => reject(new Error(`Crawl timed out after ${ms}ms`)),
      ms,
    );
  });
  return { promise, cancel: () => clearTimeout(handle) };
}

/**
 * Run a single crawl attempt in its own browser context, always resolving to a
 * MenuResult. Failures are captured as status 'error'; empty successful crawls
 * are normalized to 'no-menu'; a menu that is entirely "geschlossen" markers is
 * normalized to 'closed' (the venue publishes its grid but isn't serving).
 */
async function attemptCrawl(
  browser: Browser,
  crawler: Crawler,
  timeoutMs: number,
): Promise<MenuResult> {
  const crawledAt = new Date().toISOString();
  let context: BrowserContext | undefined;
  const deadline = timeout(timeoutMs);
  try {
    context = await browser.newContext();
    const page = await context.newPage();
    const items = await Promise.race([crawler.crawl(page), deadline.promise]);

    if (items.length === 0) {
      return { restaurant: crawler.config, status: 'no-menu', items: [], crawledAt };
    }
    if (isClosedMenu(items)) {
      return { restaurant: crawler.config, status: 'closed', items: [], crawledAt };
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
    deadline.cancel();
    await context?.close().catch(() => {});
  }
}

/**
 * Run a crawler, retrying when an attempt yields no usable menu. Crawls are
 * flaky (a restaurant may transiently report no menu or fail to load), so we
 * try again before settling for a 'no-menu'/'error' result. An 'ok' or 'closed'
 * result is definitive and returned immediately; otherwise we return the last
 * attempt's result.
 */
async function runCrawler(
  browser: Browser,
  crawler: Crawler,
  timeoutMs: number,
  attempts: number,
): Promise<MenuResult> {
  const settled = (status: MenuResult['status']) =>
    status === 'ok' || status === 'closed';
  let result = await attemptCrawl(browser, crawler, timeoutMs);
  for (let attempt = 1; attempt < attempts && !settled(result.status); attempt++) {
    result = await attemptCrawl(browser, crawler, timeoutMs);
  }
  return result;
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
  const attempts = Math.max(1, options.attempts ?? DEFAULT_ATTEMPTS);

  const ownBrowser = options.browser === undefined;
  const browser = options.browser ?? (await chromium.launch({ headless: true }));

  try {
    const results = await mapWithConcurrency(crawlers, concurrency, (crawler) =>
      runCrawler(browser, crawler, timeoutMs, attempts),
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
