/**
 * Run async tasks with bounded concurrency, preserving input order in the result.
 * Each task is invoked with its index. Rejections propagate (callers that need
 * per-task resilience should catch inside the task).
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const effectiveLimit = Math.max(1, Math.min(limit, items.length || 1));
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (true) {
      const current = next++;
      if (current >= items.length) return;
      results[current] = await task(items[current]!, current);
    }
  }

  const workers = Array.from({ length: effectiveLimit }, () => worker());
  await Promise.all(workers);
  return results;
}
