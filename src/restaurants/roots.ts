import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import type { Page } from 'playwright';
import type { Crawler, MenuItem, RestaurantConfig } from '../types.ts';

export const config: RestaurantConfig = {
  id: 'roots-kitchen',
  name: 'Roots Kitchen',
  url: 'https://rootsandfriends.com/en/food/RootsKitchen/',
  distances: { 'com-west': 'near', westpark: 'near' },
};

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function readDetail($: cheerio.CheerioAPI, el: Element): MenuItem | undefined {
  const $el = $(el);
  const paragraphs = $el
    .find('.content p')
    .map((_, p) => clean($(p).text()))
    .get()
    .filter(Boolean);

  const name = paragraphs[0];
  if (!name) return undefined;

  const price = clean($el.find('.price, ._text-right').first().text());
  const allergens = clean($el.find('.allergens').first().text());

  const item: MenuItem = { name, language: 'en' };
  const description = paragraphs.slice(1).filter((p) => p !== allergens)[0];
  if (description) item.description = description;
  if (price) item.price = price;
  return item;
}

/**
 * Pure parser for the Roots Kitchen page. Extracts today's offers from the
 * "Daily menu" and "Buffet" blocks. The page also carries a "Weekly Menu"
 * accordion listing every weekday, which is intentionally skipped so only
 * today's food is shown.
 */
export function parseRoots(html: string): MenuItem[] {
  const $ = cheerio.load(html);
  const items: MenuItem[] = [];

  $('.content-block').each((_, block) => {
    const title = clean($(block).find('.title').first().text()).toLowerCase();
    if (title.includes('weekly menu')) return;

    $(block)
      .find('.food-detail')
      .each((_, el) => {
        const item = readDetail($, el);
        if (item) items.push(item);
      });
  });

  return items;
}

export const crawler: Crawler = {
  config,
  async crawl(page: Page): Promise<MenuItem[]> {
    await page.goto(config.url, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForSelector('.food-detail', { timeout: 15_000 }).catch(() => {});
    const html = await page.content();
    return parseRoots(html);
  },
};
