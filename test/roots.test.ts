import { expect, test, describe } from 'bun:test';
import { parseRoots, config } from '../src/restaurants/roots.ts';

const html = await Bun.file(
  new URL('./fixtures/roots.html', import.meta.url),
).text();

describe('parseRoots', () => {
  const items = parseRoots(html);

  test('extracts at least one item', () => {
    expect(items.length).toBeGreaterThan(0);
  });

  test("includes today's daily dish with description and price", () => {
    const dish = items.find((i) => i.name === 'Dandan Noodles');
    expect(dish).toBeDefined();
    expect(dish!.description).toContain('Vegan Mince');
    expect(dish!.price).toBe('19.90');
    expect(dish!.language).toBe('en');
  });

  test('includes the buffet block', () => {
    const buffet = items.find((i) => i.name === 'Buffet');
    expect(buffet).toBeDefined();
    expect(buffet!.price).toBe('4.10 / 100g');
  });

  test('does not include weekly-menu accordion days', () => {
    const weekly = items.find((i) => i.name.includes('Miso Roasted Eggplant'));
    expect(weekly).toBeUndefined();
  });

  test('returns no items for an empty page', () => {
    expect(parseRoots('<html><body></body></html>')).toEqual([]);
  });
});

describe('roots config', () => {
  test('has distances for both HQs', () => {
    expect(config.distances['com-west']).toBeDefined();
    expect(config.distances.westpark).toBeDefined();
  });
});
