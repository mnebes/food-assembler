import { expect, test, describe } from 'bun:test';
import { parseWesthive, config } from '../src/restaurants/westhive.ts';

const html = await Bun.file(
  new URL('./fixtures/westhive.html', import.meta.url),
).text();

describe('parseWesthive', () => {
  const items = parseWesthive(html);

  test('extracts at least one item', () => {
    expect(items.length).toBeGreaterThan(0);
  });

  test("includes today's daily lunch dish with a price", () => {
    const today = items.find((i) =>
      i.name.includes('Grilled chicken thigh steaks with tomato salsa'),
    );
    expect(today).toBeDefined();
    expect(today!.price).toBe('19.90');
    expect(today!.language).toBe('en');
  });

  test('does not include other days from the daily lunch menu', () => {
    const otherDay = items.find((i) => i.name.includes('Veal escalope'));
    expect(otherDay).toBeUndefined();
  });

  test('includes weekly specials prefixed by category', () => {
    const soup = items.find((i) => i.name === 'Soup: Asparagus');
    expect(soup).toBeDefined();
    expect(soup!.price).toBe('7.00 / 11.50');
  });

  test('returns no items for an empty page', () => {
    expect(parseWesthive('<html><body></body></html>')).toEqual([]);
  });
});

describe('westhive config', () => {
  test('has distances for both HQs', () => {
    expect(config.distances['com-west']).toBeDefined();
    expect(config.distances.westpark).toBeDefined();
  });
});
