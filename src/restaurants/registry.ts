import type { Crawler } from '../types.ts';
import { crawler as westhive } from './westhive.ts';
import { crawler as roots } from './roots.ts';
import { crawler as zhdk } from './zhdk.ts';
import { crawler as technopark } from './technopark.ts';

/**
 * All active restaurant crawlers, in display order.
 * To add a restaurant: implement a crawler module and add it here.
 */
export const crawlers: readonly Crawler[] = [westhive, roots, zhdk, technopark];
