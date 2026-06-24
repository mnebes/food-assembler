import { expect, test, describe } from 'bun:test';
import { parseZhdk, config } from '../src/restaurants/zhdk.ts';

const html = await Bun.file(
  new URL('./fixtures/zhdk.html', import.meta.url),
).text();

describe('parseZhdk', () => {
  test("extracts a given weekday's food trucks", () => {
    const items = parseZhdk(html, 'Dienstag');
    const truck = items.find((i) => i.name.includes('Old Aleppo'));
    expect(truck).toBeDefined();
    expect(truck!.description).toContain('hausgemachten');
    expect(truck!.language).toBe('de');
  });

  test('extracts multiple trucks on a day that has several', () => {
    const items = parseZhdk(html, 'Montag');
    expect(items.length).toBeGreaterThan(1);
    expect(items.some((i) => i.name.includes('Deliz Asia'))).toBe(true);
  });

  test('returns no items on weekends', () => {
    expect(parseZhdk(html, 'Samstag')).toEqual([]);
    expect(parseZhdk(html, 'Sonntag')).toEqual([]);
  });

  test('returns no items for an empty page', () => {
    expect(parseZhdk('<html><body></body></html>', 'Montag')).toEqual([]);
  });
});

describe('zhdk config', () => {
  test('has distances for both HQs', () => {
    expect(config.distances['com-west']).toBeDefined();
    expect(config.distances.westpark).toBeDefined();
  });
});
