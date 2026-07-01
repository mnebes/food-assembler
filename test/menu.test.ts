import { expect, test, describe } from 'bun:test';
import { isClosedMenu } from '../src/util/menu.ts';
import type { MenuItem } from '../src/types.ts';

const de = (name: string): MenuItem => ({ name, language: 'de' });

describe('isClosedMenu', () => {
  test('is true when every dish is a closed-marker (category-prefixed)', () => {
    expect(
      isClosedMenu([
        de('Pasta Uno: geschlossen'),
        de('Casa: Geschlossen'),
        de('Pinsa: geschlossen'),
      ]),
    ).toBe(true);
  });

  test('is true for un-prefixed and alternate markers', () => {
    expect(isClosedMenu([de('geschlossen')])).toBe(true);
    expect(isClosedMenu([de('Closed')])).toBe(true);
    expect(isClosedMenu([de('Casa: Betriebsferien')])).toBe(true);
  });

  test('is false when at least one real dish is present', () => {
    expect(
      isClosedMenu([de('Pasta Uno: geschlossen'), de('Casa: Panzanella')]),
    ).toBe(false);
  });

  test('is false for an empty menu (that is no-menu, not closed)', () => {
    expect(isClosedMenu([])).toBe(false);
  });

  test('does not treat a dish that merely contains the word as closed', () => {
    expect(isClosedMenu([de('Casa: Geschlossene Teigtaschen')])).toBe(false);
  });
});
