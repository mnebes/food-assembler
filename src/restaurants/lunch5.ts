import type { Page } from 'playwright';
import type { Crawler, MenuItem, RestaurantConfig } from '../types.ts';
import { todayInZurich } from '../util/date.ts';
import { extractTextItems, type TextItem } from '../util/pdf.ts';

/**
 * Lunch 5 publishes a single weekly menu PDF (no HTML menu). The PDF lays the
 * week out as a grid: three changing categories (Vegi, Lunch I, Lunch II) as
 * rows × the five weekdays (Mon–Fri) as columns. We fetch the PDF, read the
 * positioned text, and reconstruct only *today's* column.
 */
const PDF_URL = 'http://www.lunch-5.ch/uploads/menuplan.pdf';

export const config: RestaurantConfig = {
  id: 'lunch-5',
  name: 'Lunch 5',
  url: 'http://www.lunch-5.ch',
  location: 'Förrlibuckstrasse 62, 8005 Zürich',
  distances: { 'com-west': 'near', westpark: 'medium' },
};

const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'] as const;

/** The three daily, changing categories, top-to-bottom in the grid. */
const CATEGORIES = ['Vegi', 'Lunch I', 'Lunch II'] as const;

/** Horizontal padding (PDF units) applied when deriving column boundaries. */
const COLUMN_PAD = 15;
/** Vertical window that contains the three daily-category rows. */
const ROW_MIN_Y = 175;
const ROW_MAX_Y = 408;

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Weekday column index for a YYYY-MM-DD date: Monday → 0 … Sunday → 6. */
function weekdayColumn(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return (day + 6) % 7;
}

/**
 * Read every non-empty positioned text run from the first page of the PDF.
 * Kept as a named re-export so the parser tests can build their input; the
 * implementation is shared across the PDF-grid crawlers.
 */
export const extractLunch5Items = extractTextItems;

/**
 * The Monday–Friday range the PDF is valid for, parsed from its
 * "Woche: dd.mm.dd.mm.yyyy" header. Used to ignore a stale (not-yet-refreshed)
 * PDF rather than serve last week's food.
 */
export function parseWeekRange(
  items: TextItem[],
): { start: string; end: string } | undefined {
  const text = items.map((i) => i.str).join(' ');
  const m = text.match(/Woche:\s*(\d{2})\.(\d{2})\.\s*(\d{2})\.(\d{2})\.(\d{4})/);
  if (!m) return undefined;

  const [, sd, sm, ed, em, year] = m;
  const endYear = Number(year);
  // A week can straddle a year boundary (e.g. late December into January).
  const startYear = Number(sm) > Number(em) ? endYear - 1 : endYear;
  return {
    start: `${startYear}-${sm}-${sd}`,
    end: `${endYear}-${em}-${ed}`,
  };
}

/**
 * Derive the x-range of each weekday column from the weekday header row. Each
 * column starts a little left of its header and ends just before the next one;
 * the last column is open-ended. Returns undefined if the header row is missing.
 */
function columnRanges(items: TextItem[]): Array<{ lo: number; hi: number }> | undefined {
  const headerXs: number[] = [];
  for (const day of WEEKDAYS) {
    const header = items.find((i) => clean(i.str) === day);
    if (!header) return undefined;
    headerXs.push(header.x);
  }
  return headerXs.map((x, i) => ({
    lo: x - COLUMN_PAD,
    hi: i < headerXs.length - 1 ? headerXs[i + 1]! - COLUMN_PAD : Infinity,
  }));
}

/** y-position of each category's left-hand label, keyed by category name. */
function categoryLabels(items: TextItem[]): Map<string, number> | undefined {
  const labels = new Map<string, number>();
  for (const cat of CATEGORIES) {
    const label = items.find((i) => i.x < 80 && clean(i.str) === cat);
    if (!label) return undefined;
    labels.set(cat, label.y);
  }
  return labels;
}

/** The category whose label is vertically closest to the given y. */
function nearestCategory(y: number, labels: Map<string, number>): string {
  let best = '';
  let bestDist = Infinity;
  for (const [name, labelY] of labels) {
    const dist = Math.abs(y - labelY);
    if (dist < bestDist) {
      bestDist = dist;
      best = name;
    }
  }
  return best;
}

/**
 * Pure parser for the weekly Lunch 5 PDF. Given the positioned text runs and a
 * target date, it reconstructs the three daily dishes (Vegi, Lunch I, Lunch II)
 * for that weekday's column. Cells are assembled top-to-bottom: the first line
 * is the dish name, the remaining lines its description, and the lone
 * "dd.dd" price token its price. Returns [] on weekends, for a stale PDF (the
 * date falls outside the printed week), or when the grid can't be located.
 */
export function parseLunch5(items: TextItem[], date: string = todayInZurich()): MenuItem[] {
  const col = weekdayColumn(date);
  if (col > 4) return [];

  const week = parseWeekRange(items);
  if (week && (date < week.start || date > week.end)) return [];

  const ranges = columnRanges(items);
  const labels = categoryLabels(items);
  if (!ranges || !labels) return [];

  const range = ranges[col]!;
  const cells = new Map<string, TextItem[]>(CATEGORIES.map((c) => [c, []]));

  for (const item of items) {
    if (item.x < range.lo || item.x >= range.hi) continue;
    if (item.y <= ROW_MIN_Y || item.y >= ROW_MAX_Y) continue;
    cells.get(nearestCategory(item.y, labels))!.push(item);
  }

  const result: MenuItem[] = [];
  for (const category of CATEGORIES) {
    const cell = cells.get(category)!.sort((a, b) => b.y - a.y);
    const price = cell.find((i) => /^\d+\.\d{2}$/.test(clean(i.str)));
    const lines = cell
      .filter((i) => i !== price)
      .map((i) => clean(i.str))
      .filter(Boolean);
    if (lines.length === 0) continue;

    const item: MenuItem = { name: `${category}: ${lines[0]}`, language: 'de' };
    const description = lines.slice(1).join(' ');
    if (description) item.description = description;
    if (price) item.price = clean(price.str);
    result.push(item);
  }

  return result;
}

async function fetchPdf(page: Page): Promise<Uint8Array | undefined> {
  try {
    const response = await page.request.get(PDF_URL, { timeout: 30_000 });
    if (!response.ok()) return undefined;
    return new Uint8Array(await response.body());
  } catch {
    return undefined;
  }
}

export const crawler: Crawler = {
  config,
  async crawl(page: Page): Promise<MenuItem[]> {
    const buffer = await fetchPdf(page);
    if (!buffer) return [];
    const items = await extractLunch5Items(buffer);
    return parseLunch5(items, todayInZurich());
  },
};
