import { expect, test, describe } from 'bun:test';
import {
  parseTopolino,
  extractMenuPdfUrl,
  config,
} from '../src/restaurants/topolino.ts';
import { extractTextItems } from '../src/util/pdf.ts';

const buffer = new Uint8Array(
  await Bun.file(new URL('./fixtures/topolino.pdf', import.meta.url)).arrayBuffer(),
);
const items = await extractTextItems(buffer);

const html = await Bun.file(
  new URL('./fixtures/topolino.html', import.meta.url),
).text();

// The fixture PDF covers the week of Mon 2026-06-22 … Fri 2026-06-26.
const MONDAY = '2026-06-22';
const THURSDAY = '2026-06-25';

describe('extractMenuPdfUrl', () => {
  test('resolves the current-week PDF under "Aktuelle Wochenmenüs"', () => {
    expect(extractMenuPdfUrl(html)).toBe(
      'https://www.betriebsrestaurants-migros.ch/media/41bnggrw/menuplan-herdern.pdf',
    );
  });

  test('does not pick the following week ("Menüplan Folgewoche")', () => {
    expect(extractMenuPdfUrl(html)).not.toContain('kw27');
  });

  test('returns undefined when the heading is absent', () => {
    expect(extractMenuPdfUrl('<h5>Something else</h5>')).toBeUndefined();
  });
});

describe('parseTopolino', () => {
  test('extracts Mittags-Hit, Veggie and the unprefixed special, in order', () => {
    const monday = parseTopolino(items, MONDAY);
    const names = monday.map((i) => i.name);
    expect(names[0]!.startsWith('Mittags-Hit:')).toBe(true);
    expect(names[1]!.startsWith('Veggie:')).toBe(true);
    // The always-available special is listed last, without a category prefix.
    expect(names[2]).toBe('Crispy Poké Bowls');
    expect(monday.every((i) => i.language === 'de')).toBe(true);
  });

  test('reconstructs the dish name and price for each column', () => {
    const monday = parseTopolino(items, MONDAY);
    const hit = monday.find((i) => i.name.startsWith('Mittags-Hit:'));
    expect(hit!.name).toBe('Mittags-Hit: Pouletragout');
    expect(hit!.price).toBe('13.90');
    expect(hit!.description).toContain('Marsala');

    const veggie = monday.find((i) => i.name.startsWith('Veggie:'));
    expect(veggie!.name).toBe('Veggie: Ravioli Verdure');
    expect(veggie!.price).toBe('12.50');
    expect(veggie!.tags).toEqual(['vegetarian']);

    const special = monday.find((i) => i.name === 'Crispy Poké Bowls');
    expect(special!.price).toBe('17.90');
  });

  test('returns a different row for a different weekday', () => {
    const thursday = parseTopolino(items, THURSDAY);
    const hit = thursday.find((i) => i.name.startsWith('Mittags-Hit:'));
    expect(hit!.name).toBe('Mittags-Hit: Paniertes Kabeljaufilet');
    // Thursday has no middle special.
    expect(thursday.some((i) => !/^(Mittags-Hit|Veggie):/.test(i.name))).toBe(false);
  });

  test('returns no items on the weekend', () => {
    expect(parseTopolino(items, '2026-06-27')).toEqual([]); // Saturday
    expect(parseTopolino(items, '2026-06-28')).toEqual([]); // Sunday
  });

  test('returns no items for a date outside the printed week (stale PDF)', () => {
    expect(parseTopolino(items, '2026-07-06')).toEqual([]);
  });

  test('returns no items when there is no positioned text', () => {
    expect(parseTopolino([], MONDAY)).toEqual([]);
  });
});

describe('topolino config', () => {
  test('has distances for both HQs', () => {
    expect(config.distances['com-west']).toBeDefined();
    expect(config.distances.westpark).toBeDefined();
  });
});
