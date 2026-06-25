import type { Page } from 'playwright';
import type { Crawler, MenuItem, RestaurantConfig } from '../types.ts';
import { todayInZurich } from '../util/date.ts';
import { extractTextItems } from '../util/pdf.ts';
import { parseFood2050Weekly } from './food2050.ts';

/**
 * Bistro Tonino (in the ZHdK Toni-Areal) publishes its weekly lunch as a
 * food2050.ch grid PDF — the same layout as ZFV Technopark. We fetch the PDF
 * and reconstruct today's column with the shared {@link parseFood2050Weekly}
 * parser.
 */
const PDF_URL =
  'https://app.food2050.ch/de/v2/zfv/zhdk,toni-areal/bistro-tonino/mittagsverpflegung/menu/weekly.pdf';

export const config: RestaurantConfig = {
  id: 'bistro-tonino',
  name: 'Bistro Tonino',
  url: 'https://app.food2050.ch/de/zhdk,toni-areal/bistro-tonino/menu/mittagsverpflegung/weekly',
  location: 'Pfingstweidstrasse 96, 8005 Zürich',
  distances: { 'com-west': 'medium', westpark: 'far' },
};

async function fetchPdf(page: Page): Promise<Uint8Array | undefined> {
  try {
    const response = await page.request.get(PDF_URL, { timeout: 30_000 });
    if (!response.ok()) return undefined;
    return new Uint8Array(await response.body());
  } catch {
    return undefined;
  }
}

export const crawler: Crawler = {
  config,
  async crawl(page: Page): Promise<MenuItem[]> {
    const buffer = await fetchPdf(page);
    if (!buffer) return [];
    const items = await extractTextItems(buffer);
    return parseFood2050Weekly(items, todayInZurich());
  },
};
