/**
 * Stable, build-time identity for a dish so votes can be attributed to it.
 *
 * Menu items have no stable id of their own — only a `name` that changes daily.
 * We derive a deterministic key from the (stable) restaurant slug plus a
 * normalized form of the dish name. The same key is emitted into the markup as
 * `data-dish-key` and used as the `dish_key` stored in PocketBase, so the
 * rendered page stays the single source of truth.
 */

/**
 * Normalize a dish name to a slug fragment: NFKD, strip diacritics, lowercase,
 * and reduce any run of non-alphanumeric characters to a single hyphen.
 * Returns `'dish'` for names that contain no alphanumerics so keys never end
 * with a dangling separator.
 */
export function normalizeDishName(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'dish';
}

/** `restaurantId + "::" + normalizeDishName(name)`, e.g. `westhive::soup-asparagus`. */
export function dishKey(restaurantId: string, name: string): string {
  return `${restaurantId}::${normalizeDishName(name)}`;
}
