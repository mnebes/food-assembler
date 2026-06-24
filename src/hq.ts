import type { DistanceCategory, HqLocation } from './types.ts';

export interface HqInfo {
  id: HqLocation;
  /** Display name shown to users. */
  name: string;
}

/** The HQ locations, in display order. */
export const HQS: readonly HqInfo[] = [
  { id: 'com-west', name: 'com.West' },
  { id: 'westpark', name: 'Westpark' },
] as const;

/**
 * Playful wording for each distance category, surfaced in the summary page.
 * Keep the keys in sync with the DistanceCategory union.
 */
export const DISTANCE_WORDING: Record<DistanceCategory, string> = {
  near: 'around the corner',
  medium: 'a nice stroll',
  far: 'a proper hike',
};

export function hqName(id: HqLocation): string {
  const hq = HQS.find((h) => h.id === id);
  return hq ? hq.name : id;
}

export function distanceWording(category: DistanceCategory): string {
  return DISTANCE_WORDING[category];
}
