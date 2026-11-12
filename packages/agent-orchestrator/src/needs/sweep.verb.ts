/**
 * The needs' sweep as the daemon runs it, beside its passes: apart from `needs.verb.ts`, which the pass and the informer read, since the
 * sweep's loop (`sweepLoop`) is a controller's that reaches the pass.
 */
import { sweepLoop } from '../forget/prune/free.verb.ts';
import { NEEDS_EVERY, needsOnce, type NeedsMemo } from './needs.verb.ts';

/**
 * The sweep, for as long as the daemon runs: `needsOnce` over `memo`, then a rest of `NEEDS_EVERY` (`sweepLoop`). A sweep that fails
 * keeps the readings it had: a check that cannot be read holds nothing new.
 */
export const needs = (memo: NeedsMemo) => sweepLoop(() => needsOnce(memo), NEEDS_EVERY, "The machine's needs could not be read this sweep");
