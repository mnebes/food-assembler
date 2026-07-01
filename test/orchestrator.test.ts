import { expect, test, describe } from 'bun:test';
import type { Browser } from 'playwright';
import { assembleMenus } from '../src/orchestrator.ts';
import type { Crawler, MenuItem, RestaurantConfig } from '../src/types.ts';

function makeConfig(id: string): RestaurantConfig {
  return {
    id,
    name: id,
    url: `https://example.com/${id}`,
    distances: { 'com-west': 'near', westpark: 'far' },
  };
}

/** A fake Playwright browser that hands out throwaway contexts/pages. */
function fakeBrowser(): Browser {
  const page = {} as never;
  const context = {
    newPage: async () => page,
    close: async () => {},
  };
  return {
    newContext: async () => context,
    close: async () => {},
  } as unknown as Browser;
}

function crawler(id: string, crawl: () => Promise<MenuItem[]>): Crawler {
  return { config: makeConfig(id), crawl };
}

describe('assembleMenus', () => {
  test("status 'ok' when items are returned", async () => {
    const crawlers = [
      crawler('a', async () => [{ name: 'Pasta', language: 'en' }]),
    ];
    const data = await assembleMenus(crawlers, { browser: fakeBrowser() });
    expect(data.results[0]!.status).toBe('ok');
    expect(data.results[0]!.items).toHaveLength(1);
  });

  test("empty successful crawl is normalized to 'no-menu'", async () => {
    const crawlers = [crawler('a', async () => [])];
    const data = await assembleMenus(crawlers, { browser: fakeBrowser() });
    expect(data.results[0]!.status).toBe('no-menu');
  });

  test("a menu that is entirely 'geschlossen' is normalized to 'closed'", async () => {
    const crawlers = [
      crawler('tonino', async () => [
        { name: 'Pasta Uno: geschlossen', language: 'de' },
        { name: 'Casa: Geschlossen', language: 'de' },
        { name: 'Pinsa: geschlossen', language: 'de' },
      ]),
    ];
    const data = await assembleMenus(crawlers, { browser: fakeBrowser() });
    expect(data.results[0]!.status).toBe('closed');
    // Closed results carry no items (like every non-ok status).
    expect(data.results[0]!.items).toHaveLength(0);
  });

  test("a mixed menu with real dishes stays 'ok'", async () => {
    const crawlers = [
      crawler('mixed', async () => [
        { name: 'Pasta Uno: geschlossen', language: 'de' },
        { name: 'Casa: Panzanella', language: 'de' },
      ]),
    ];
    const data = await assembleMenus(crawlers, { browser: fakeBrowser() });
    expect(data.results[0]!.status).toBe('ok');
    expect(data.results[0]!.items).toHaveLength(2);
  });

  test("'closed' is definitive and is not retried", async () => {
    let calls = 0;
    const crawlers = [
      crawler('closed', async () => {
        calls++;
        return [{ name: 'Casa: geschlossen', language: 'de' }];
      }),
    ];
    const data = await assembleMenus(crawlers, {
      browser: fakeBrowser(),
      attempts: 3,
    });
    expect(calls).toBe(1);
    expect(data.results[0]!.status).toBe('closed');
  });

  test("a throwing crawler yields status 'error' and does not break others", async () => {
    const crawlers = [
      crawler('boom', async () => {
        throw new Error('site down');
      }),
      crawler('ok', async () => [{ name: 'Salad', language: 'en' }]),
    ];
    const data = await assembleMenus(crawlers, { browser: fakeBrowser() });
    expect(data.results[0]!.status).toBe('error');
    expect(data.results[0]!.error).toBe('site down');
    expect(data.results[1]!.status).toBe('ok');
  });

  test('a slow crawler times out and is reported as error', async () => {
    const crawlers = [
      crawler('slow', () => new Promise(() => {})), // never resolves
    ];
    const data = await assembleMenus(crawlers, {
      browser: fakeBrowser(),
      timeoutMs: 20,
    });
    expect(data.results[0]!.status).toBe('error');
    expect(data.results[0]!.error).toContain('timed out');
  });

  test('results preserve crawler order and include date metadata', async () => {    const crawlers = [
      crawler('first', async () => [{ name: 'A', language: 'en' }]),
      crawler('second', async () => [{ name: 'B', language: 'en' }]),
    ];
    const data = await assembleMenus(crawlers, { browser: fakeBrowser() });
    expect(data.results.map((r) => r.restaurant.id)).toEqual(['first', 'second']);
    expect(data.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(data.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('retries a flaky crawler that first returns no menu, then succeeds', async () => {
    let calls = 0;
    const crawlers = [
      crawler('flaky', async () => {
        calls++;
        return calls === 1 ? [] : [{ name: 'Pasta', language: 'en' }];
      }),
    ];
    const data = await assembleMenus(crawlers, { browser: fakeBrowser() });
    expect(calls).toBe(2);
    expect(data.results[0]!.status).toBe('ok');
    expect(data.results[0]!.items).toHaveLength(1);
  });

  test('retries a crawler that first throws, then succeeds', async () => {
    let calls = 0;
    const crawlers = [
      crawler('flaky', async () => {
        calls++;
        if (calls === 1) throw new Error('transient');
        return [{ name: 'Salad', language: 'en' }];
      }),
    ];
    const data = await assembleMenus(crawlers, { browser: fakeBrowser() });
    expect(calls).toBe(2);
    expect(data.results[0]!.status).toBe('ok');
  });

  test('gives up after the configured number of attempts', async () => {
    let calls = 0;
    const crawlers = [
      crawler('always-empty', async () => {
        calls++;
        return [];
      }),
    ];
    const data = await assembleMenus(crawlers, {
      browser: fakeBrowser(),
      attempts: 3,
    });
    expect(calls).toBe(3);
    expect(data.results[0]!.status).toBe('no-menu');
  });

  test('attempts only once when attempts is 1', async () => {
    let calls = 0;
    const crawlers = [
      crawler('empty', async () => {
        calls++;
        return [];
      }),
    ];
    const data = await assembleMenus(crawlers, {
      browser: fakeBrowser(),
      attempts: 1,
    });
    expect(calls).toBe(1);
    expect(data.results[0]!.status).toBe('no-menu');
  });

  test('does not retry a crawler that succeeds on the first attempt', async () => {
    let calls = 0;
    const crawlers = [
      crawler('ok', async () => {
        calls++;
        return [{ name: 'Soup', language: 'en' }];
      }),
    ];
    const data = await assembleMenus(crawlers, { browser: fakeBrowser() });
    expect(calls).toBe(1);
    expect(data.results[0]!.status).toBe('ok');
  });
});
