import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import type { Page } from 'playwright';
import type { Crawler, MenuItem, RestaurantConfig } from '../types.ts';

export const config: RestaurantConfig = {
  id: 'westhive-hardturm',
  name: 'Westhive Kitchen',
  url: 'https://www.westhive.com/en/eat-drink/westhive-kitchen-zurich-hardturm/',
  location: 'Hardturmstrasse 161, 8005 Zürich',
  distances: { 'com-west': 'near', westpark: 'far' },
};

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function readOffer(
  $: cheerio.CheerioAPI,
  el: Element,
  namePrefix?: string,
): MenuItem | undefined {
  const $el = $(el);
  const title = clean($el.find('.wh-menu-offer__title').first().text());
  if (!title) return undefined;

  const description = clean($el.find('.wh-menu-offer__description').first().text());
  const price = clean($el.find('.wh-menu-offer__price').first().text());

  const item: MenuItem = {
    name: namePrefix ? `${namePrefix}: ${title}` : title,
    language: 'en',
  };
  if (description) item.description = description;
  if (price) item.price = price;
  return item;
}

/**
 * Pure parser for the Westhive Kitchen page. Extracts today's daily lunch
 * (marked with the `wh-today` class on the site) plus the weekly specials,
 * which are available every weekday.
 */
export function parseWesthive(html: string): MenuItem[] {
  const $ = cheerio.load(html);
  const items: MenuItem[] = [];

  $('.wh-menu-offer.wh-today').each((_, el) => {
    const item = readOffer($, el);
    if (item) items.push(item);
  });

  // Weekly Specials section: each offer's line-1 is a category (Soup, Pasta, ...).
  $('h2.brxe-heading').each((_, heading) => {
    if (clean($(heading).text()).toLowerCase() !== 'weekly specials') return;
    const section = $(heading).parent();
    section.find('.wh-menu-offer').each((_, el) => {
      const category = clean($(el).find('.wh-menu-offer__line-1').first().text());
      const item = readOffer($, el, category || undefined);
      if (item) items.push(item);
    });
  });

  return items;
}

export const crawler: Crawler = {
  config,
  async crawl(page: Page): Promise<MenuItem[]> {
    await page.goto(config.url, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForSelector('.wh-menu-offer', { timeout: 15_000 }).catch(() => {});
    const html = await page.content();
    return parseWesthive(html);
  },
};
