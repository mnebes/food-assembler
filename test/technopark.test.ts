import { expect, test, describe } from 'bun:test';
import { parseTechnopark, config } from '../src/restaurants/technopark.ts';

const html = await Bun.file(
  new URL('./fixtures/technopark.html', import.meta.url),
).text();

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

  test('returns no items for a date not in the grid', () => {
    expect(parseTechnopark(html, '1999-01-01')).toEqual([]);
  });

  test('returns no items for an empty page', () => {
    expect(parseTechnopark('<html><body></body></html>', '2026-06-24')).toEqual([]);
  });
});

describe('technopark config', () => {
  test('has distances for both HQs', () => {
    expect(config.distances['com-west']).toBeDefined();
    expect(config.distances.westpark).toBeDefined();
  });
});
