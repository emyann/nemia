/**
 * Whether the person skipped, in this browser, the Setup page's first-visit question of which harness to activate: kept through
 * `lib/stored.ts` under a key of its own, since a skip is one person's choice in one browser and the server keeps nothing of it.
 */
import { forgetStored, readStored, store } from './stored.ts';

/** The key the skip is kept under. */
export const HARNESS_SKIP_KEY = 'nemia:harness-skipped';

/** Whether the question was skipped in this browser: kept as `1`, anything else read as not skipped. */
export const readHarnessSkipped = (): boolean => readStored(HARNESS_SKIP_KEY, (raw) => (raw === '1' ? true : undefined), false);

/** Keeps the skip, so the question is not asked again in this browser. */
export const keepHarnessSkip = (): void => store(HARNESS_SKIP_KEY, '1');

/** Forgets the skip, so the question is asked again while no harness is activated. */
export const forgetHarnessSkip = (): void => forgetStored(HARNESS_SKIP_KEY);
