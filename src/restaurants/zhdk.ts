import * as cheerio from 'cheerio';
import type { Page } from 'playwright';
import type { Crawler, MenuItem, RestaurantConfig } from '../types.ts';
import { weekdayInZurich } from '../util/date.ts';

export const config: RestaurantConfig = {
  id: 'zhdk-toni-areal',
  name: 'ZHdK Campus Toni-Areal',
  url: 'https://www.zhdk.ch/campustoniareal/gastronomie',
  location: 'Pfingstweidstrasse 96, 8005 Zürich',
  distances: { 'com-west': 'medium', westpark: 'far' },
};

const GERMAN_WEEKDAYS = [
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
  'Sonntag',
];

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Pure parser for the ZHdK Toni-Areal gastronomy page. The page lists the
 * rotating food trucks per weekday in an accordion (German weekday headings).
 * Given the current weekday it returns the trucks present that day. Weekends
 * have no entry and yield no items.
 */
export function parseZhdk(
  html: string,
  weekday: string = weekdayInZurich(new Date(), 'de-DE'),
): MenuItem[] {
  const $ = cheerio.load(html);
  const target = clean(weekday).toLowerCase();
  if (!GERMAN_WEEKDAYS.map((d) => d.toLowerCase()).includes(target)) return [];

  const items: MenuItem[] = [];

  $('.accordion--item').each((_, item) => {
    const heading = clean($(item).find('.accordion--item--trigger').first().text());
    if (heading.toLowerCase() !== target) return;

    $(item)
      .find('.richtext h4')
      .each((_, h4) => {
        const name = clean($(h4).text());
        if (!name) return;

        const menuItem: MenuItem = { name, language: 'de' };
        const description = clean($(h4).nextAll('p').first().text());
        if (description) menuItem.description = description;
        items.push(menuItem);
      });
  });

  return items;
}

export const crawler: Crawler = {
  config,
  async crawl(page: Page): Promise<MenuItem[]> {
    await page.goto(config.url, { waitUntil: 'networkidle', timeout: 60_000 });
    await page
      .waitForSelector('.accordion--item', { timeout: 15_000 })
      .catch(() => {});
    const html = await page.content();
    return parseZhdk(html);
  },
};
