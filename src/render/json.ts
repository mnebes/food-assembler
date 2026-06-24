import type { RawData } from '../types.ts';

/** Serialize RawData to the public data.json string (stable, pretty-printed). */
export function renderJson(data: RawData): string {
  return JSON.stringify(data, null, 2) + '\n';
}
