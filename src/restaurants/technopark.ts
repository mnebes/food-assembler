import * as cheerio from 'cheerio';
import type { Page } from 'playwright';
import type { Crawler, MenuItem, RestaurantConfig } from '../types.ts';
import { todayInZurich } from '../util/date.ts';

/**
 * The Technopark site embeds its lunch menu via a food2050 iframe. We crawl the
 * iframe app directly, which renders the full week's menu grid.
 */
const MENU_URL =
  'https://app.food2050.ch/de/technopark/technopark/menu/mittagsmenue/weekly';

export const config: RestaurantConfig = {
  id: 'zfv-technopark',
  name: 'ZFV Technopark',
  url: 'https://www.zfv.ch/de/essen-gehen/gastronomie-im-technopark-zuerich#menu',
  location: 'Technoparkstrasse 1, 8005 Zürich',
  distances: { 'com-west': 'far', westpark: 'medium' },
};

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function categoryFromHref(href: string): string | undefined {
  const path = href.split('/').slice(-2, -1)[0] ?? '';
  const segment = path.split(',').pop() ?? '';
  if (!segment) return undefined;
  return segment
    .split('-')
    .map((word, idx) => {
      if (/^i+$/i.test(word)) return word.toUpperCase();
      return idx === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word;
    })
    .reduce((acc, word) => (/^I+$/.test(word) ? `${acc} ${word}` : `${acc}-${word}`));
}

/**
 * Pure parser for the food2050 weekly menu grid. Each dish is an anchor whose
 * href encodes its category and date (…/<category>/YYYY-MM-DD). We keep only
 * the dishes for the target date and de-duplicate (the grid repeats itself for
 * responsive layouts).
 */
export function parseTechnopark(
  html: string,
  date: string = todayInZurich(),
): MenuItem[] {
  const $ = cheerio.load(html);
  const items: MenuItem[] = [];
  const seen = new Set<string>();

  $(`a[href*="/${date}"]`).each((_, a) => {
    const href = $(a).attr('href') ?? '';
    if (!href.endsWith(`/${date}`)) return;

    const name = clean($(a).find('p').first().text());
    if (!name || seen.has(name)) return;
    seen.add(name);

    const item: MenuItem = { name, language: 'de' };
    const category = categoryFromHref(href);
    if (category) {
      item.name = `${category}: ${name}`;
    }
    items.push(item);
  });

  return items;
}

export const crawler: Crawler = {
  config,
  async crawl(page: Page): Promise<MenuItem[]> {
    await page.goto(MENU_URL, { waitUntil: 'networkidle', timeout: 60_000 });
    await page
      .waitForSelector('a[href*="/mittagsverpflegung"]', { timeout: 15_000 })
      .catch(() => {});
    const html = await page.content();
    return parseTechnopark(html);
  },
};
