import type { Crawler } from '../types.ts';
import { crawler as westhive } from './westhive.ts';

/**
 * All active restaurant crawlers, in display order.
 * To add a restaurant: implement a crawler module and add it here.
 */
export const crawlers: readonly Crawler[] = [westhive];
