import { getDocumentProxy } from 'unpdf';

/** A single positioned text run from a PDF (PDF user-space coordinates). */
export interface TextItem {
  /** Left edge, in PDF units. */
  x: number;
  /** Baseline position; y grows upward, so higher y is nearer the top. */
  y: number;
  /** Run width, in PDF units. */
  w: number;
  /** The text of the run. */
  str: string;
}

/**
 * Read every non-empty positioned text run from the first page of a PDF.
 * Coordinates use PDF user space (y grows upward). This is the shared building
 * block for the PDF-grid based crawlers, which reconstruct columns from these
 * positions rather than the (jumbled) linear text order.
 */
export async function extractTextItems(buffer: Uint8Array): Promise<TextItem[]> {
  const pdf = await getDocumentProxy(buffer);
  try {
    const page = await pdf.getPage(1);
    const content = await page.getTextContent();
    const items: TextItem[] = [];
    for (const raw of content.items as Array<{
      str?: string;
      transform?: number[];
      width?: number;
    }>) {
      if (typeof raw.str !== 'string' || !raw.str.trim() || !raw.transform) continue;
      items.push({
        x: raw.transform[4]!,
        y: raw.transform[5]!,
        w: raw.width ?? 0,
        str: raw.str,
      });
    }
    return items;
  } finally {
    await pdf.destroy();
  }
}
