import { expect, test, describe } from 'bun:test';
import { dishKey, normalizeDishName } from '../src/render/dish-key.ts';

describe('normalizeDishName', () => {
  test('lowercases and hyphenates', () => {
    expect(normalizeDishName('Soup: Asparagus')).toBe('soup-asparagus');
  });

  test('strips diacritics', () => {
    expect(normalizeDishName('Zürcher Geschnetzeltes')).toBe(
      'zurcher-geschnetzeltes',
    );
  });

  test('collapses runs of separators and trims edges', () => {
    expect(normalizeDishName('  Pasta — Puttanesca!! ')).toBe(
      'pasta-puttanesca',
    );
  });

  test('falls back to "dish" when no alphanumerics remain', () => {
    expect(normalizeDishName('—')).toBe('dish');
    expect(normalizeDishName('')).toBe('dish');
  });
});

describe('dishKey', () => {
  test('joins restaurant id and normalized name', () => {
    expect(dishKey('westhive-hardturm', 'Soup: Asparagus')).toBe(
      'westhive-hardturm::soup-asparagus',
    );
  });

  test('is deterministic for the same input', () => {
    expect(dishKey('roots', 'Crispy Tofu Sando')).toBe(
      dishKey('roots', 'Crispy Tofu Sando'),
    );
  });
});
