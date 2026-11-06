/**
 * The order of the finished runs a RunList asked by `status.state=finished` answers (agent-orchestrator, src/run-list/run-list.ts,
 * `finishedBefore`; no code yet): newest first by when its work stopped (`finishedAt`, read in epoch milliseconds), and of two that
 * stopped at the same instant the one whose name sorts first, as `<` compares names — the order a name-ordered list and its `continue`
 * token already use (`byName`, `pageOf`), so a sort by it and the search for where a token's page starts agree on every pair. The list
 * sorts by it, and a `continue` token names a position in it (the `finishedAt` and the name of the last run a page answered): the next
 * page starts at the first run the token's position comes before, so a run removed between two pages skips none after it. What a token
 * carries and how it is refused are the door's: a test holds them.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** Where a finished run stands in its list: when its work stopped, in epoch milliseconds, and its name. Declared here until src holds it. */
export type FinishedKey = { readonly finishedMs: number; readonly name: string };

const finishedBeforeSpec = spec<(a: FinishedKey, b: FinishedKey) => boolean>({
  requires: ({ input: [a, b] }) => Number.isFinite(a.finishedMs) && Number.isFinite(b.finishedMs),
  ensures: {
    newestFirst: {
      description: 'A run whose work stopped later comes before one whose work stopped earlier',
      condition: ({ input: [a, b], output }) => !(a.finishedMs > b.finishedMs) || output,
    },
    olderNeverFirst: {
      description: 'A run whose work stopped earlier never comes before one whose work stopped later',
      condition: ({ input: [a, b], output }) => !(a.finishedMs < b.finishedMs) || !output,
    },
    tiesByName: {
      description: 'Of two runs whose work stopped at the same instant, the one whose name sorts first comes first, and only it',
      condition: ({ input: [a, b], output }) => a.finishedMs !== b.finishedMs || output === a.name < b.name,
    },
  },
});

/** `finishedBefore`'s type, which `src/run-list/run-list.ts` takes: whether `a` comes before `b` among the finished runs. */
export type FinishedBefore = Implementation<typeof finishedBeforeSpec>;
