import { expect, test, describe } from 'bun:test';
import { todayInZurich, nowInZurich } from '../src/util/date.ts';

describe('todayInZurich', () => {
  test('formats as YYYY-MM-DD', () => {
    expect(todayInZurich()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('uses Zurich timezone (CEST: a UTC instant late evening is next day)', () => {
    // 2024-06-15 23:30 UTC is 2024-06-16 01:30 in Zurich (CEST, +02:00).
    const instant = new Date('2024-06-15T23:30:00Z');
    expect(todayInZurich(instant)).toBe('2024-06-16');
  });

  test('uses Zurich timezone (CET: an early UTC instant is still previous day)', () => {
    // 2024-01-01 00:30 UTC is 2024-01-01 01:30 in Zurich (CET, +01:00).
    const instant = new Date('2024-01-01T00:30:00Z');
    expect(todayInZurich(instant)).toBe('2024-01-01');
  });
});

describe('nowInZurich', () => {
  test('returns a non-empty human-readable string', () => {
    expect(nowInZurich(new Date('2024-06-15T10:00:00Z')).length).toBeGreaterThan(0);
  });
});
