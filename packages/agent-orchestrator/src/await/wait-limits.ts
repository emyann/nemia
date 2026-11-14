/** How long `nemia await` waits, by default and at most: read by `await.ts` and its contract (`contracts/wait-bound.contract.ts`). */

/** The bound a wait takes when it is given none: four minutes. */
export const WAIT_DEFAULT_MS = 240_000;

/** The longest bound a wait takes: four minutes and a half, under every caller's five. */
export const WAIT_MAX_MS = 270_000;

