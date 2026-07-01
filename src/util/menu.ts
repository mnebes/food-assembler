import type { MenuItem } from '../types.ts';

/**
 * Markers a venue prints in place of dishes when it isn't serving — e.g. Bistro
 * Tonino publishes its usual weekly grid during the summer break with every cell
 * reading "geschlossen". Matched case-insensitively against the dish name (the
 * category prefix, if any, is stripped first).
 */
const CLOSED_MARKERS = /^(geschlossen|closed|betriebsferien)$/i;

/**
 * The dish part of a rendered item name. Parsers prefix the menu category
 * ("Pasta Uno: Macasroni"), so we look at the text after the first ": ".
 */
function dishName(name: string): string {
  const idx = name.indexOf(': ');
  return (idx === -1 ? name : name.slice(idx + 2)).trim();
}

/**
 * Whether a parsed menu really means "the venue is closed" — a non-empty menu
 * whose every dish is just a closed-marker (see {@link CLOSED_MARKERS}). Used by
 * the orchestrator to normalize such menus to the `closed` status instead of
 * publishing a list of "geschlossen" dishes. Operates on the common `MenuItem[]`
 * output, so it applies to every restaurant regardless of how it was crawled.
 */
export function isClosedMenu(items: readonly MenuItem[]): boolean {
  if (items.length === 0) return false;
  return items.every((item) => CLOSED_MARKERS.test(dishName(item.name)));
}
