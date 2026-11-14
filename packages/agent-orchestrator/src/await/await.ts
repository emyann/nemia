/**
 * The pure part of `nemia wait`: how long a wait waits (`waitBound`), and the `--for` it is given read as milliseconds (`waitForOf`).
 */
import type { WaitBoundOf } from '../../contracts/wait-bound.contract.ts';
import { WAIT_DEFAULT_MS, WAIT_MAX_MS } from './wait-limits.ts';

export { WAIT_DEFAULT_MS, WAIT_MAX_MS } from './wait-limits.ts';

export type { WaitBound } from '../../contracts/wait-bound.contract.ts';

/**
 * How long a wait waits, from the bound it was given in milliseconds (`undefined`: none): four minutes where none was given, the one given
 * where it is above zero and at most four minutes and a half, else refused — never cut to the longest, since its caller asked for what it
 * would not get. Pure; proved by `contracts/wait-bound.contract.ts`.
 */
export const waitBound: WaitBoundOf = (asked) => {
  if (asked === undefined) return { ms: WAIT_DEFAULT_MS };
  if (asked <= 0) return { refused: 'not-positive' };
  if (asked > WAIT_MAX_MS) return { refused: 'above-max' };
  return { ms: asked };
};

/** How `--for` is typed, as every refusal of one says it. */
export const WAIT_FOR_FORM = 'digits and ms, s or m, above zero and at most 270s, as 30s or 4m';

/** The milliseconds of each unit `--for` is typed in. */
const UNIT_MS: Readonly<Record<string, number>> = { ms: 1, s: 1_000, m: 60_000 };

/**
 * The milliseconds `text` says by its form alone (digits, then `ms`, `s` or `m`: `30s`, `4m`), its bound unread (`waitBound` judges it);
 * undefined where it does not read as one. Pure.
 */
export function waitForOf(text: string): number | undefined {
  const [, digits, unit] = /^(\d+)(ms|s|m)$/.exec(text.trim()) ?? [];
  const per = unit === undefined ? undefined : UNIT_MS[unit];
  return digits === undefined || per === undefined ? undefined : Number(digits) * per;
}

/**
 * The bound `--for` (`text`, none given where undefined) asks of a wait, or why it is refused, in words that say the fix: a duration not
 * in its form, none to wait, or longer than a call lives. Pure.
 */
export function waitForBound(text: string | undefined): { readonly ms: number } | { readonly refusal: string } {
  const asked = text === undefined ? undefined : waitForOf(text);
  if (text !== undefined && asked === undefined)
    return {
      refusal: `--for takes how long the wait waits, ${WAIT_FOR_FORM}, and ${JSON.stringify(text)} is not one: nemia wait --for 30s`,
    };
  const bound = waitBound(asked);
  if ('ms' in bound) return bound;
  return bound.refused === 'not-positive'
    ? { refusal: `--for ${String(text)} leaves nothing to wait: give a bound above zero, as --for 30s, or leave --for out for 4m` }
    : {
        refusal: `--for ${String(text)} is longer than a call lives (at most 270s): give --for 4m or less, and wait again from the cursor it answers`,
      };
}
