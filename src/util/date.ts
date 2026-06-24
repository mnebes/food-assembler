const ZURICH_TZ = 'Europe/Zurich';

/**
 * Today's date in the Europe/Zurich timezone, formatted as YYYY-MM-DD.
 * Independent of the host machine / CI runner timezone.
 */
export function todayInZurich(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZURICH_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * The full weekday name for the given date in the Europe/Zurich timezone.
 * Pass a locale to control the language, e.g. 'de-DE' → "Dienstag".
 */
export function weekdayInZurich(now: Date = new Date(), locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: ZURICH_TZ,
    weekday: 'long',
  }).format(now);
}

/**
 * Human-readable date+time in the Europe/Zurich timezone, for "last updated".
 */
export function nowInZurich(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: ZURICH_TZ,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(now);
}
