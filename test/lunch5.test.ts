import { expect, test, describe } from 'bun:test';
import {
  parseLunch5,
  parseWeekRange,
  extractLunch5Items,
  config,
} from '../src/restaurants/lunch5.ts';

const buffer = new Uint8Array(
  await Bun.file(new URL('./fixtures/lunch5.pdf', import.meta.url)).arrayBuffer(),
);
const items = await extractLunch5Items(buffer);

// The fixture PDF covers the week of Mon 2026-06-22 … Fri 2026-06-26.
const MONDAY = '2026-06-22';
const THURSDAY = '2026-06-25';

describe('parseLunch5', () => {
  test("extracts the day's three categories with a category prefix", () => {
    const items_ = parseLunch5(items, MONDAY);
    const names = items_.map((i) => i.name);
    expect(names.some((n) => n.startsWith('Vegi:'))).toBe(true);
    expect(names.some((n) => n.startsWith('Lunch I:'))).toBe(true);
    expect(names.some((n) => n.startsWith('Lunch II:'))).toBe(true);
    expect(items_.every((i) => i.language === 'de')).toBe(true);
  });

  test('reconstructs the correct dish, description and price per column', () => {
    const monday = parseLunch5(items, MONDAY);
    const vegi = monday.find((i) => i.name.startsWith('Vegi:'));
    expect(vegi!.name).toBe('Vegi: Gebratene Glasnudeln');
    expect(vegi!.description).toContain('asiatischem Gemüse');
    expect(vegi!.price).toBe('14.90');

    const lunchI = monday.find((i) => i.name.startsWith('Lunch I:'));
    expect(lunchI!.name).toBe('Lunch I: Poulet Piccata');
    expect(lunchI!.price).toBe('16.20');

    const lunchII = monday.find((i) => i.name.startsWith('Lunch II:'));
    expect(lunchII!.name).toBe('Lunch II: Pferde Steak grilliert');
    expect(lunchII!.price).toBe('21.90');
  });

  test('returns different dishes for a different weekday column', () => {
    const monVegi = parseLunch5(items, MONDAY).find((i) => i.name.startsWith('Vegi:'));
    const thuVegi = parseLunch5(items, THURSDAY).find((i) => i.name.startsWith('Vegi:'));
    expect(monVegi!.name).not.toBe(thuVegi!.name);
    expect(thuVegi!.name).toBe('Vegi: Auberginen Pizza');
  });

  test('returns no items on the weekend', () => {
    expect(parseLunch5(items, '2026-06-27')).toEqual([]); // Saturday
    expect(parseLunch5(items, '2026-06-28')).toEqual([]); // Sunday
  });

  test('returns no items for a date outside the printed week (stale PDF)', () => {
    expect(parseLunch5(items, '2026-07-06')).toEqual([]);
  });

  test('returns no items when there is no positioned text', () => {
    expect(parseLunch5([], MONDAY)).toEqual([]);
  });
});

describe('parseWeekRange', () => {
  test('parses the Monday–Friday range from the PDF header', () => {
    expect(parseWeekRange(items)).toEqual({
      start: '2026-06-22',
      end: '2026-06-26',
    });
  });

  test('returns undefined when the header is absent', () => {
    expect(parseWeekRange([])).toBeUndefined();
  });
});

describe('lunch5 config', () => {
  test('has distances for both HQs', () => {
    expect(config.distances['com-west']).toBeDefined();
    expect(config.distances.westpark).toBeDefined();
  });
});
