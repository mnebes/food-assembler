import { expect, test, describe } from 'bun:test';
import { mapWithConcurrency } from '../src/util/concurrency.ts';

describe('mapWithConcurrency', () => {
  test('preserves input order regardless of completion order', async () => {
    const input = [30, 10, 20, 5];
    const result = await mapWithConcurrency(input, 2, async (n) => {
      await new Promise((r) => setTimeout(r, n));
      return n * 2;
    });
    expect(result).toEqual([60, 20, 40, 10]);
  });

  test('passes the correct index to each task', async () => {
    const input = ['a', 'b', 'c'];
    const result = await mapWithConcurrency(input, 5, async (item, i) => `${i}:${item}`);
    expect(result).toEqual(['0:a', '1:b', '2:c']);
  });

  test('never exceeds the concurrency limit', async () => {
    let active = 0;
    let maxActive = 0;
    await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
    });
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  test('handles an empty input array', async () => {
    const result = await mapWithConcurrency([], 3, async (n) => n);
    expect(result).toEqual([]);
  });
});
