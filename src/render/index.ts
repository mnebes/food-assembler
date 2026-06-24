import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { RawData } from '../types.ts';
import { renderJson } from './json.ts';
import { renderHtml } from './html.ts';

export { renderJson } from './json.ts';
export { renderHtml } from './html.ts';

/** Write data.json and index.html into the given output directory. */
export async function writeSite(data: RawData, outDir: string): Promise<void> {
  const jsonPath = join(outDir, 'data.json');
  const htmlPath = join(outDir, 'index.html');
  await mkdir(dirname(jsonPath), { recursive: true });
  await Promise.all([
    Bun.write(jsonPath, renderJson(data)),
    Bun.write(htmlPath, renderHtml(data)),
  ]);
}
