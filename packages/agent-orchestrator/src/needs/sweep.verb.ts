/**
 * The needs' sweep as the daemon runs it, beside its passes: apart from `needs.verb.ts`, which the pass and the informer read, since the
 * sweep's loop (`sweepLoop`) is a controller's that reaches the pass. And the readiness read swept on the same rest (`readied`), which
 * the passes hand the feed.
 */
import { Effect } from 'effect';
import type { Readiness } from 'objects';
import { sweepLoop } from '../forget/prune/free.verb.ts';
import { NEEDS_EVERY, NeedsMemory, needsOnce, type NeedsMemo } from './needs.verb.ts';
import { liveFacts, readinessOf, type ReadinessFacts } from './readiness.verb.ts';

/**
 * The sweep, for as long as the daemon runs: `needsOnce` over `memo`, then a rest of `NEEDS_EVERY` (`sweepLoop`). A sweep that fails
 * keeps the readings it had: a check that cannot be read holds nothing new.
 */
export const needs = (memo: NeedsMemo) => sweepLoop(() => needsOnce(memo), NEEDS_EVERY, "The machine's needs could not be read this sweep");

/**
 * The machine's facts as the daemon's sweep reads them: this process's (`liveFacts`), but that a command is never run — `run` answers
 * that it did not start — since `liveFacts` runs each with `spawnSync`, and the sweep shares its loop with the passes, the api and the
 * feed's streams. So a piece only a command reads (the service, the linger, the user's service manager, a harness's version) reads
 * `unknown` or its version unread, never `missing`, and the feed's level is what the needs' memory, filled by the needs' sweep off the
 * loop (`needsOnce`), and the store's files say: the place's, the workflows' and the harnesses' needs, the tools folder, a factory.
 * `nemia doctor` still runs every command.
 */
export const sweptFacts = (): ReadinessFacts => ({ ...liveFacts(), run: () => undefined });

/**
 * The store's readiness read, for as long as the daemon runs: `readinessOf` over the needs' memory `memo` the sweep above fills, the
 * machine's facts read afresh each time with no command run (`sweptFacts`), each read handed to `keep`, then a rest of `NEEDS_EVERY`. A
 * read that fails keeps the one before, which the passes go on handing the feed.
 */
export const readied = (memo: NeedsMemo, keep: (read: Readiness) => void, facts: () => ReadinessFacts = sweptFacts) =>
  sweepLoop(
    () => readinessOf(facts()).pipe(Effect.provideService(NeedsMemory, memo)),
    NEEDS_EVERY,
    "The store's readiness could not be read this sweep",
    { done: keep },
  );
