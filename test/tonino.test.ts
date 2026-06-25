import { expect, test, describe } from 'bun:test';
import { extractTextItems } from '../src/util/pdf.ts';
import {
  parseFood2050Weekly,
  parseFood2050WeekRange,
} from '../src/restaurants/food2050.ts';
import { config } from '../src/restaurants/tonino.ts';

const buffer = new Uint8Array(
  await Bun.file(new URL('./fixtures/tonino.pdf', import.meta.url)).arrayBuffer(),
);
const items = await extractTextItems(buffer);

// The fixture PDF covers the week of Mon 2026-06-22 … Sun 2026-06-28.
const MONDAY = '2026-06-22';
const THURSDAY = '2026-06-25';

describe('parseFood2050Weekly (Bistro Tonino)', () => {
  test("extracts the day's categories with a category prefix", () => {
    const day = parseFood2050Weekly(items, MONDAY);
    const names = day.map((i) => i.name);
    expect(names.some((n) => n.startsWith('Pasta Uno:'))).toBe(true);
    expect(names.some((n) => n.startsWith('Pasta Due:'))).toBe(true);
    expect(names.some((n) => n.startsWith('Casa:'))).toBe(true);
    expect(names.some((n) => n.startsWith('Pinsa:'))).toBe(true);
    expect(day.every((i) => i.language === 'de')).toBe(true);
  });

  test('reconstructs dish name, description and price per cell', () => {
    const day = parseFood2050Weekly(items, MONDAY);
    const uno = day.find((i) => i.name.startsWith('Pasta Uno:'));
    expect(uno!.name).toBe('Pasta Uno: MACCHERONI QUADRI');
    expect(uno!.description).toBe('Tomatensugo, Aubergine, Pinienkerne, Minze');
    expect(uno!.price).toBe('9.50 / 12.50 / 16.50');

    const pinsa = day.find((i) => i.name.startsWith('Pinsa:'));
    expect(pinsa!.name).toBe('Pinsa: PINSA BIANCHA');
    expect(pinsa!.price).toBe('12.90 / 15.90 / 19.90');
  });

  test('de-hyphenates wrapped description lines', () => {
    const due = parseFood2050Weekly(items, MONDAY).find((i) =>
      i.name.startsWith('Pasta Due:'),
    );
    // "Mini Bur-\nrata" and "To-\nmatensugo" should be rejoined.
    expect(due!.description).toBe('Tomatensugo, Mini Burrata, Basilikum');
  });

  test('returns a different column for a different weekday', () => {
    const monCasa = parseFood2050Weekly(items, MONDAY).find((i) =>
      i.name.startsWith('Casa:'),
    );
    const thuCasa = parseFood2050Weekly(items, THURSDAY).find((i) =>
      i.name.startsWith('Casa:'),
    );
    expect(monCasa!.name).toBe('Casa: PANZANELLA');
    expect(thuCasa!.name).toBe('Casa: COCOMERO');
  });

  test('returns no items on the weekend', () => {
    expect(parseFood2050Weekly(items, '2026-06-27')).toEqual([]); // Saturday
  });

  test('returns no items for a date outside the printed week (stale PDF)', () => {
    expect(parseFood2050Weekly(items, '2026-07-06')).toEqual([]);
  });

  test('returns no items when there is no positioned text', () => {
    expect(parseFood2050Weekly([], MONDAY)).toEqual([]);
  });
});

describe('parseFood2050Weekly with glyph-corrupted headers', () => {
  // Some live food2050 PDFs use a header font whose lowercase "o" glyph is a
  // dropped control char, so "Montag"→"Mntag", "Mittwoch"→"Mittwch",
  // "Donnerstag"→"Dnnerstag". The grid must still be located.
  const corrupted = [
    { x: 14, y: 753, w: 80, str: '22. bis 28.06.2026' },
    { x: 45, y: 700, w: 40, str: 'Mntag' },
    { x: 153, y: 700, w: 40, str: 'Dienstag' },
    { x: 261, y: 700, w: 40, str: 'Mittwch' },
    { x: 369, y: 700, w: 40, str: 'Dnnerstag' },
    { x: 477, y: 700, w: 40, str: 'Freitag' },
    { x: 23, y: 650, w: 40, str: 'Pasta Uno' },
    { x: 51, y: 670, w: 60, str: 'TESTDISH, Tomatensugo' },
    { x: 53, y: 600, w: 40, str: '9.50' },
  ];

  test('locates the grid despite missing letters in weekday labels', () => {
    const day = parseFood2050Weekly(corrupted, MONDAY);
    expect(day).toHaveLength(1);
    expect(day[0]!.name).toBe('Pasta Uno: TESTDISH');
    expect(day[0]!.description).toBe('Tomatensugo');
    expect(day[0]!.price).toBe('9.50');
  });
});


describe('parseFood2050WeekRange', () => {
  test('parses the week range from the PDF header', () => {
    expect(parseFood2050WeekRange(items)).toEqual({
      start: '2026-06-22',
      end: '2026-06-28',
    });
  });

  test('returns undefined when the header is absent', () => {
    expect(parseFood2050WeekRange([])).toBeUndefined();
  });
});

describe('tonino config', () => {
  test('has distances for both HQs', () => {
    expect(config.distances['com-west']).toBeDefined();
    expect(config.distances.westpark).toBeDefined();
  });
});
