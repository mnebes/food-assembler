import * as cheerio from 'cheerio';
import type { Page } from 'playwright';
import type { Crawler, MenuItem, RestaurantConfig } from '../types.ts';
import { todayInZurich } from '../util/date.ts';
import { extractTextItems, type TextItem } from '../util/pdf.ts';

/**
 * Topolino (Migros-Restaurant Zürich Herdern) publishes its weekly lunch as a
 * PDF whose media URL is unstable (it changes when the kitchen re-uploads). The
 * stable entry point is the landing page, which links the current week's PDF
 * under the heading "Aktuelle Wochenmenüs (PDF):". We therefore crawl the
 * landing page to resolve the live PDF URL, fetch it, and reconstruct *today's*
 * dishes from the positioned text.
 *
 * The PDF lays the week out as a grid: weekdays (Mon–Fri) as rows × dish
 * categories as columns. Two columns carry headers — "Mittags-Hit" (left) and
 * "Veggie" (right) — while an always-available special (e.g. "Crispy Poké
 * Bowls") sits, unheadered, between them and only on some days.
 */
const LANDING_URL =
  'https://www.betriebsrestaurants-migros.ch/landingpages/topolino/info-menueplan';
const ORIGIN = 'https://www.betriebsrestaurants-migros.ch';

export const config: RestaurantConfig = {
  id: 'migros-topolino',
  name: 'MIGORS Topolino',
  url: LANDING_URL,
  location: 'Pfingstweidstrasse 101, 8005 Zürich',
  distances: { 'com-west': 'far', westpark: 'medium' },
};

const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'] as const;

const MONTHS_DE: Record<string, number> = {
  Januar: 1,
  Februar: 2,
  März: 3,
  April: 4,
  Mai: 5,
  Juni: 6,
  Juli: 7,
  August: 8,
  September: 9,
  Oktober: 10,
  November: 11,
  Dezember: 12,
};

/** Items left of this x are the day-label column (weekday name + date). */
const LABEL_MAX_X = 120;
/** Vertical tolerance above a weekday label that still belongs to its row. */
const ROW_TOP_PAD = 10;

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Weekday column index for a YYYY-MM-DD date: Monday → 0 … Sunday → 6. */
function weekdayColumn(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return (day + 6) % 7;
}

/**
 * Resolve the current week's menu PDF from the landing page markup. The page
 * lists two download teasers — the current week under the heading "Aktuelle
 * Wochenmenüs (PDF):" and the following week under "Menüplan Folgewoche". We
 * scope the lookup to the figcaption of the former so a re-upload that only
 * shuffles the media slugs still resolves correctly. Returns an absolute URL,
 * or undefined when the heading/link can't be found (layout drift).
 */
export function extractMenuPdfUrl(
  html: string,
  base: string = ORIGIN,
): string | undefined {
  const $ = cheerio.load(html);
  let href: string | undefined;

  $('h5').each((_, el) => {
    if (href) return;
    if (!/^Aktuelle Wochenmen/i.test(clean($(el).text()))) return;
    const link = $(el).parent().find('a[href$=".pdf"]').first();
    const value = link.attr('href');
    if (value) href = value;
  });

  if (!href) return undefined;
  try {
    return new URL(href, base).toString();
  } catch {
    return undefined;
  }
}

/** The two header x-anchors, when both are present in the grid. */
function columnAnchors(
  items: TextItem[],
): { hitX: number; veggieX: number } | undefined {
  const hit = items.find((i) => clean(i.str) === 'Mittags-Hit');
  const veggie = items.find((i) => clean(i.str) === 'Veggie');
  if (!hit || !veggie) return undefined;
  return { hitX: hit.x, veggieX: veggie.x };
}

/** y-positions of the present weekday labels, sorted top-to-bottom (desc y). */
function weekdayLabels(items: TextItem[]): Map<string, number> {
  const labels = new Map<string, number>();
  for (const day of WEEKDAYS) {
    const label = items.find((i) => i.x < LABEL_MAX_X && clean(i.str) === day);
    if (label) labels.set(day, label.y);
  }
  return labels;
}

/**
 * The printed date of a weekday row (the "DD. Monat" cell under its label),
 * as {day, month}. Used to drop a stale (not-yet-refreshed) PDF instead of
 * serving last week's food.
 */
function rowDate(
  items: TextItem[],
  top: number,
  bottom: number,
): { day: number; month: number } | undefined {
  for (const item of items) {
    if (item.x >= LABEL_MAX_X) continue;
    if (item.y > top || item.y <= bottom) continue;
    const m = clean(item.str).match(/^(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]+)$/);
    if (!m) continue;
    const month = MONTHS_DE[m[2]!];
    if (month) return { day: Number(m[1]), month };
  }
  return undefined;
}

function buildItem(cell: TextItem[]): { name: string; description?: string; price?: string } | undefined {
  const sorted = [...cell].sort((a, b) => b.y - a.y);
  const price = sorted.find((i) => /^\d+\.\d{2}$/.test(clean(i.str)));
  const lines = sorted
    .filter((i) => i !== price)
    .map((i) => clean(i.str))
    .filter((s) => s && !/^[–-]$/.test(s));
  if (lines.length === 0) return undefined;

  const item: { name: string; description?: string; price?: string } = {
    name: lines[0]!,
  };
  const description = lines.slice(1).join(' ');
  if (description) item.description = description;
  if (price) item.price = clean(price.str);
  return item;
}

/**
 * Pure parser for the weekly Topolino PDF. Given the positioned text runs and a
 * target date, it reconstructs that weekday's row: the "Mittags-Hit", the
 * "Veggie" dish, and — listed last, without a category prefix — the
 * always-available special if present that day. Returns [] on weekends, for a
 * stale PDF (the row's printed date doesn't match the target), or when the grid
 * can't be located.
 */
export function parseTopolino(
  items: TextItem[],
  date: string = todayInZurich(),
): MenuItem[] {
  const col = weekdayColumn(date);
  if (col > 4) return [];

  const anchors = columnAnchors(items);
  const labels = weekdayLabels(items);
  const targetDay = WEEKDAYS[col]!;
  const labelY = labels.get(targetDay);
  if (!anchors || labelY === undefined) return [];

  const orderedY = [...labels.values()].sort((a, b) => b - a);
  const idx = orderedY.indexOf(labelY);
  const gap =
    orderedY.length > 1
      ? (orderedY[0]! - orderedY[orderedY.length - 1]!) / (orderedY.length - 1)
      : 120;
  const top = labelY + ROW_TOP_PAD;
  const bottom = idx < orderedY.length - 1 ? orderedY[idx + 1]! : labelY - gap;

  const target = new Date(`${date}T00:00:00Z`);
  const printed = rowDate(items, top, bottom);
  if (printed && (printed.day !== target.getUTCDate() || printed.month !== target.getUTCMonth() + 1)) {
    return [];
  }

  // Column boundaries: a quarter-span either side of the implied middle column.
  const span = anchors.veggieX - anchors.hitX;
  const hitMax = anchors.hitX + span / 4;
  const veggieMin = anchors.veggieX - span / 4;

  const hitCell: TextItem[] = [];
  const specialCell: TextItem[] = [];
  const veggieCell: TextItem[] = [];
  for (const item of items) {
    if (item.x < LABEL_MAX_X) continue;
    if (item.y > top || item.y <= bottom) continue;
    if (item.x < hitMax) hitCell.push(item);
    else if (item.x >= veggieMin) veggieCell.push(item);
    else specialCell.push(item);
  }

  const result: MenuItem[] = [];

  const hit = buildItem(hitCell);
  if (hit) {
    result.push({ name: `Mittags-Hit: ${hit.name}`, ...rest(hit), language: 'de' });
  }

  const veggie = buildItem(veggieCell);
  if (veggie) {
    result.push({
      name: `Veggie: ${veggie.name}`,
      ...rest(veggie),
      tags: ['vegetarian'],
      language: 'de',
    });
  }

  const special = buildItem(specialCell);
  if (special) {
    result.push({ name: special.name, ...rest(special), language: 'de' });
  }

  return result;
}

/** Spread helper: carry over the optional description/price of a built cell. */
function rest(item: { description?: string; price?: string }): {
  description?: string;
  price?: string;
} {
  const out: { description?: string; price?: string } = {};
  if (item.description) out.description = item.description;
  if (item.price) out.price = item.price;
  return out;
}

async function fetchMenuPdf(page: Page): Promise<Uint8Array | undefined> {
  try {
    await page.goto(LANDING_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const pdfUrl = extractMenuPdfUrl(await page.content());
    if (!pdfUrl) return undefined;
    const response = await page.request.get(pdfUrl, { timeout: 30_000 });
    if (!response.ok()) return undefined;
    return new Uint8Array(await response.body());
  } catch {
    return undefined;
  }
}

export const crawler: Crawler = {
  config,
  async crawl(page: Page): Promise<MenuItem[]> {
    const buffer = await fetchMenuPdf(page);
    if (!buffer) return [];
    const items = await extractTextItems(buffer);
    return parseTopolino(items, todayInZurich());
  },
};
