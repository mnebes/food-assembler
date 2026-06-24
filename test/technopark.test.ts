import { expect, test, describe } from 'bun:test';
import { extractText, getDocumentProxy } from 'unpdf';
import {
  parseTechnopark,
  extractTechnoparkPrices,
  config,
} from '../src/restaurants/technopark.ts';

const html = await Bun.file(
  new URL('./fixtures/technopark.html', import.meta.url),
).text();

const pdfBuffer = new Uint8Array(
  await Bun.file(new URL('./fixtures/technopark.pdf', import.meta.url)).arrayBuffer(),
);
const pdf = await getDocumentProxy(pdfBuffer);
const { text: pdfText } = await extractText(pdf, { mergePages: true });

describe('parseTechnopark', () => {
  test("extracts the target date's dishes with category prefix", () => {
    const items = parseTechnopark(html, '2026-06-24');
    const asian = items.find((i) => i.name.startsWith('Asian:'));
    expect(asian).toBeDefined();
    expect(asian!.name).toContain('TIKKA MASALA');
    expect(asian!.language).toBe('de');
  });

  test('de-duplicates dishes repeated across responsive layouts', () => {
    const items = parseTechnopark(html, '2026-06-24');
    const names = items.map((i) => i.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test('returns different dishes for a different date', () => {
    const wed = parseTechnopark(html, '2026-06-24').map((i) => i.name);
    const thu = parseTechnopark(html, '2026-06-25').map((i) => i.name);
    expect(wed).not.toEqual(thu);
  });

  test('attaches prices from the weekly PDF for the matching weekday', () => {
    const items = parseTechnopark(html, '2026-06-24', pdfText);
    const byCategory = (prefix: string) =>
      items.find((i) => i.name.startsWith(prefix));

    expect(byCategory('Asian:')!.price).toBe('11.90');
    expect(byCategory('Mediterranean:')!.price).toBe('14.90');
    expect(byCategory('Traditional:')!.price).toBe('18.90');
    expect(byCategory('Add-on:')!.price).toBe('4.50');
    expect(byCategory('Add-on II:')!.price).toBe('4.50');
  });

  test('picks the correct price column for a different weekday', () => {
    const tue = parseTechnopark(html, '2026-06-23', pdfText);
    expect(tue.find((i) => i.name.startsWith('Asian:'))!.price).toBe('14.90');
  });

  test('omits prices when no PDF text is supplied', () => {
    const items = parseTechnopark(html, '2026-06-24');
    expect(items.every((i) => i.price === undefined)).toBe(true);
  });

  test('returns no items for a date not in the grid', () => {
    expect(parseTechnopark(html, '1999-01-01')).toEqual([]);
  });

  test('returns no items for an empty page', () => {
    expect(parseTechnopark('<html><body></body></html>', '2026-06-24')).toEqual([]);
  });
});

describe('extractTechnoparkPrices', () => {
  test('maps reading-order tokens onto the weekday column', () => {
    const text = [
      'Asian 1.10 1.20 1.30 1.40 1.50',
      'Main 2.10 2.20 2.30 2.40 2.50',
    ].join(' ');
    expect(extractTechnoparkPrices(text, 2, 0)).toEqual(['1.10', '2.10']);
    expect(extractTechnoparkPrices(text, 2, 2)).toEqual(['1.30', '2.30']);
    expect(extractTechnoparkPrices(text, 2, 4)).toEqual(['1.50', '2.50']);
  });

  test('ignores leading non-grid numbers (e.g. a date) via tail slice', () => {
    const text = '28.06 1.10 1.20 1.30 1.40 1.50';
    expect(extractTechnoparkPrices(text, 1, 0)).toEqual(['1.10']);
  });

  test('returns nothing when the token count does not fit the grid', () => {
    expect(extractTechnoparkPrices('1.10 1.20', 1, 0)).toEqual([]);
  });
});

describe('technopark config', () => {
  test('has distances for both HQs', () => {
    expect(config.distances['com-west']).toBeDefined();
    expect(config.distances.westpark).toBeDefined();
  });
});
