import type { Page } from 'playwright';

export type Language = 'de' | 'en' | 'unknown';

/** The two HQ locations. Extend this union if more sites are added. */
export type HqLocation = 'com-west' | 'westpark';

/** How far a restaurant is from a given HQ. Ordered near -> far. */
export type DistanceCategory = 'near' | 'medium' | 'far';

export interface MenuItem {
  /** Dish name, source text as-is. */
  name: string;
  /** Optional longer text. */
  description?: string;
  /** Raw price string, e.g. "CHF 18.50". */
  price?: string;
  /** e.g. "vegetarian", "vegan" if cheaply detectable. */
  tags?: string[];
  /** Language of this item's text. */
  language: Language;
}

export interface RestaurantConfig {
  /** Stable slug, e.g. "westhive-hardturm". */
  id: string;
  /** Display name. */
  name: string;
  /** Page to crawl. */
  url: string;
  /** Address hint / human-readable location. */
  location?: string;
  /** Distance category from each HQ. Every HQ must have an entry. */
  distances: Record<HqLocation, DistanceCategory>;
}

export type CrawlStatus = 'ok' | 'no-menu' | 'error';

export interface MenuResult {
  restaurant: RestaurantConfig;
  status: CrawlStatus;
  /** Empty unless status === 'ok'. */
  items: MenuItem[];
  /** Present when status === 'error'. */
  error?: string;
  /** ISO timestamp. */
  crawledAt: string;
}

export interface RawData {
  /** YYYY-MM-DD (Europe/Zurich). */
  date: string;
  /** ISO timestamp. */
  generatedAt: string;
  results: MenuResult[];
}

export interface Crawler {
  readonly config: RestaurantConfig;
  /** Given a fresh Playwright page, return today's menu items. */
  crawl(page: Page): Promise<MenuItem[]>;
}
