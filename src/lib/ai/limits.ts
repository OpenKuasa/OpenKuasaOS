/**
 * How many rows a lookup returns. A model asked to "list everything" will
 * often ask for more rows than a lookup gives. Refusing that request makes
 * the model report the refusal as if it were a finding ("the maximum is 50"
 * became "you have more than 50 leads"), so an oversized request is capped
 * instead: the lookup always answers, with as many rows as it allows.
 */

import { z } from 'zod';

export const LOOKUP_MAX = 50;

/** The schema for a lookup's `limit`: any number, capped when it is used. */
export const limitSchema = (describe: string) => z.number().optional().describe(describe);

/** The number of rows to return for a requested `limit`. */
export function rowLimit(requested: number | undefined, fallback: number, max = LOOKUP_MAX): number {
  if (requested === undefined || !Number.isFinite(requested)) return fallback;
  return Math.min(Math.max(1, Math.floor(requested)), max);
}
