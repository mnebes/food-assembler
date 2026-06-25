import type { MenuItem } from '../types.ts';
import { todayInZurich } from '../util/date.ts';
import type { TextItem } from '../util/pdf.ts';

/**
 * Shared parser for the weekly lunch PDFs produced by food2050.ch (the platform
 * behind several ZFV canteens, e.g. Technopark and Bistro Tonino). Every such
 * PDF lays the week out as the same grid: changing menu *categories* as rows
 * (their names printed down the left margin) × the five weekdays Mon–Fri as
 * columns. Each cell holds a dish name, an ingredient/description blurb and a
 * price, with the price printed on its own line at the bottom of the cell.
 *
 * Because the linear text order is jumbled, we work from positioned text runs
 * (see {@link extractTextItems}) and reconstruct one weekday column at a time.
 */

const WEEKDAY_STEMS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'] as const;

/** Left margin where category labels live; the grid columns start to the right. */
const LABEL_MAX_X = 40;
/** Horizontal padding subtracted from a column's header x to get its left edge. */
const COLUMN_PAD = 15;
/** Everything below this y is the page footer (legal text), not the grid. */
const FOOTER_Y = 115;
/** A price line, e.g. "11.90" or "9.50 / 12.50 / 16.50". */
const PRICE_RE = /\d+[.,]\d{2}/;

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Drop control-character glyph artifacts (some fonts encode e.g. "T" as \u0001). */
function stripControl(text: string): string {
  return text.replace(/[\u0000-\u001f]/g, '');
}

/** Weekday column index for a YYYY-MM-DD date: Monday → 0 … Sunday → 6. */
function weekdayColumn(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return (day + 6) % 7;
}

/**
 * The Monday–Sunday range the PDF is valid for, parsed from its
 * "DD. bis DD.MM.YYYY" header. Used to ignore a stale (not-yet-refreshed) PDF
 * rather than serve last week's food. The start month is omitted in the source
 * and inferred from the end month (handling a month/year rollover).
 */
export function parseFood2050WeekRange(
  items: TextItem[],
): { start: string; end: string } | undefined {
  const text = stripControl(items.map((i) => i.str).join(' '));
  const m = text.match(/(\d{2})\.\s*bis\s*(\d{2})\.(\d{2})\.(\d{4})/);
  if (!m) return undefined;

  const [, startDay, endDay, endMonth, endYearStr] = m;
  const endYear = Number(endYearStr);
  const rollover = Number(startDay) > Number(endDay);
  const startMonth = rollover ? Number(endMonth) - 1 || 12 : Number(endMonth);
  const startYear = rollover && startMonth === 12 ? endYear - 1 : endYear;
  const mm = String(startMonth).padStart(2, '0');
  return {
    start: `${startYear}-${mm}-${startDay}`,
    end: `${endYear}-${endMonth}-${endDay}`,
  };
}

/** Locate the weekday header row and return each column's [lo, hi) x-range. */
function columnRanges(
  items: TextItem[],
): { ranges: Array<{ lo: number; hi: number }>; headerY: number } | undefined {
  const headers: TextItem[] = [];
  for (const stem of WEEKDAY_STEMS) {
    const probe = stem.slice(0, 6);
    const header = items.find((i) => stripControl(clean(i.str)).startsWith(probe));
    if (!header) return undefined;
    headers.push(header);
  }
  const xs = headers.map((h) => h.x);
  const headerY = Math.max(...headers.map((h) => h.y));
  const ranges = xs.map((x, i) => ({
    lo: x - COLUMN_PAD,
    hi: i < xs.length - 1 ? xs[i + 1]! - COLUMN_PAD : Infinity,
  }));
  return { ranges, headerY };
}

/** Category names printed down the left margin, ordered top-to-bottom. */
function categoryNames(items: TextItem[], headerY: number): string[] {
  return items
    .filter((i) => i.x < LABEL_MAX_X && i.y > FOOTER_Y && i.y < headerY - 5)
    .filter((i) => stripControl(clean(i.str)).length > 0)
    .sort((a, b) => b.y - a.y)
    .map((i) => stripControl(clean(i.str)));
}

/**
 * Reconstruct the cells of one weekday column, top-to-bottom. Within a column
 * the runs read as: dish lines, then a price line, repeated per category. We
 * therefore accumulate lines until a price line closes the current cell.
 */
function columnCells(
  items: TextItem[],
  range: { lo: number; hi: number },
  headerY: number,
): Array<{ lines: string[]; price?: string }> {
  const runs = items
    .filter((i) => i.x >= range.lo && i.x < range.hi)
    .filter((i) => i.y > FOOTER_Y && i.y < headerY - 5)
    .sort((a, b) => b.y - a.y);

  const cells: Array<{ lines: string[]; price?: string }> = [];
  let lines: string[] = [];
  for (const run of runs) {
    const text = stripControl(clean(run.str));
    if (!text) continue;
    if (PRICE_RE.test(text)) {
      cells.push({ lines, price: text });
      lines = [];
    } else {
      lines.push(text);
    }
  }
  if (lines.length > 0) cells.push({ lines });
  return cells;
}

/** Join wrapped dish lines, undoing end-of-line hyphenation ("To-\nmatensugo"). */
function joinLines(lines: string[]): string {
  return clean(lines.join(' ')).replace(/([A-Za-zÀ-ÿ])-\s+(?=[a-zà-ÿ])/g, '$1');
}

/**
 * Parse the weekly food2050 PDF for the given date, returning that weekday's
 * dishes (one per category) with the category name prefixed. Returns [] on the
 * weekend, for a stale PDF (the date falls outside the printed week), or when
 * the grid can't be located.
 */
export function parseFood2050Weekly(
  items: TextItem[],
  date: string = todayInZurich(),
): MenuItem[] {
  const col = weekdayColumn(date);
  if (col > 4) return [];

  const week = parseFood2050WeekRange(items);
  if (week && (date < week.start || date > week.end)) return [];

  const grid = columnRanges(items);
  if (!grid) return [];

  const names = categoryNames(items, grid.headerY);
  const cells = columnCells(items, grid.ranges[col]!, grid.headerY);

  const result: MenuItem[] = [];
  cells.forEach((cell, i) => {
    if (cell.lines.length === 0) return;
    const joined = joinLines(cell.lines);
    const comma = joined.indexOf(',');
    const dish = comma === -1 ? joined : joined.slice(0, comma).trim();
    const rest = comma === -1 ? '' : joined.slice(comma + 1).trim();

    const category = names[i];
    const item: MenuItem = {
      name: category ? `${category}: ${dish}` : dish,
      language: 'de',
    };
    if (rest) item.description = rest;
    if (cell.price) item.price = cell.price;
    result.push(item);
  });

  return result;
}
