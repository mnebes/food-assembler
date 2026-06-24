import * as cheerio from 'cheerio';
import { extractText, getDocumentProxy } from 'unpdf';
import type { Page } from 'playwright';
import type { Crawler, MenuItem, RestaurantConfig } from '../types.ts';
import { todayInZurich } from '../util/date.ts';

/**
 * The Technopark site embeds its lunch menu via a food2050 iframe. We crawl the
 * iframe app for the dishes and the linked weekly PDF for the prices (which are
 * not shown on the overview grid).
 */
const MENU_URL =
  'https://app.food2050.ch/de/technopark/technopark/menu/mittagsmenue/weekly';
const PDF_URL =
  'https://app.food2050.ch/de/v2/zfv/technopark-zurich/technopark/mittagsverpflegung/menu/weekly.pdf';

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

/** Weekday column index for a YYYY-MM-DD date: Monday → 0 … Friday → 4. */
function weekdayColumn(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return (day + 6) % 7;
}

/**
 * Extract today's prices from the weekly menu PDF text, aligned to the dish
 * rows. The PDF lays out the menu as a category × weekday grid and lists prices
 * in reading order: for each category, one price per weekday (Mon–Fri). Given
 * the number of category rows and the weekday column, this returns the price
 * for each row in category order. Returns an empty array if the token count
 * doesn't match the expected grid, so callers degrade gracefully.
 */
export function extractTechnoparkPrices(
  pdfText: string,
  rows: number,
  weekdayCol: number,
): string[] {
  if (rows <= 0 || weekdayCol < 0 || weekdayCol > 4) return [];

  const tokens = (pdfText.match(/\b\d+\.\d{2}\b/g) ?? []).slice(-rows * 5);
  if (tokens.length !== rows * 5) return [];

  const prices: string[] = [];
  for (let r = 0; r < rows; r++) {
    prices.push(tokens[r * 5 + weekdayCol]!);
  }
  return prices;
}

/**
 * Pure parser for the food2050 weekly menu grid. Each dish is an anchor whose
 * href encodes its category and date (…/<category>/YYYY-MM-DD). We keep only
 * the dishes for the target date, in category order, and de-duplicate (the grid
 * repeats itself for responsive layouts). When the weekly PDF text is supplied,
 * prices are matched onto the dishes by category/weekday position.
 */
export function parseTechnopark(
  html: string,
  date: string = todayInZurich(),
  pdfText?: string,
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

  if (pdfText) {
    const prices = extractTechnoparkPrices(
      pdfText,
      items.length,
      weekdayColumn(date),
    );
    prices.forEach((price, i) => {
      if (price) items[i]!.price = price;
    });
  }

  return items;
}

async function fetchPdfText(page: Page): Promise<string | undefined> {
  try {
    const response = await page.request.get(PDF_URL, { timeout: 30_000 });
    if (!response.ok()) return undefined;
    const buffer = new Uint8Array(await response.body());
    const pdf = await getDocumentProxy(buffer);
    try {
      const { text } = await extractText(pdf, { mergePages: true });
      return text;
    } finally {
      await pdf.destroy();
    }
  } catch {
    return undefined;
  }
}

export const crawler: Crawler = {
  config,
  async crawl(page: Page): Promise<MenuItem[]> {
    await page.goto(MENU_URL, { waitUntil: 'networkidle', timeout: 60_000 });
    await page
      .waitForSelector('a[href*="/mittagsverpflegung"]', { timeout: 15_000 })
      .catch(() => {});
    const html = await page.content();
    const pdfText = await fetchPdfText(page);
    return parseTechnopark(html, todayInZurich(), pdfText);
  },
};
