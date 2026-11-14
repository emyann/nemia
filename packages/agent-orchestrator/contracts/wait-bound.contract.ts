/**
 * How long `nemia wait` waits before it ends with no line (agent-orchestrator, src/await/await.ts, `waitBound`), from the `--for` it was
 * given in milliseconds (`undefined`: none). The same bound on every side — the command line, the api's long poll, the port's tool — so
 * it is held under the shortest limit a caller meets: an HTTP call that answers nothing for five minutes is ended by its client (Node's
 * fetch waits 300 s for the headers; Claude Code ends an MCP call over HTTP silent for five minutes), so the most is four minutes and a
 * half, and none given is four. A wait that ends at its bound loses no line: it answers the cursor it read to, and the next wait starts
 * there. Pure.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import { WAIT_DEFAULT_MS, WAIT_MAX_MS } from '../src/await/wait-limits.ts';

/** The bound, or why the one given is refused: `not-positive`, none to wait; `above-max`, longer than a caller's call lives. */
export type WaitBound = { readonly ms: number } | { readonly refused: 'not-positive' | 'above-max' };

const waitBoundSpec = spec<(asked: number | undefined) => WaitBound>({
  requires: ({ input: [asked] }) => asked === undefined || Number.isFinite(asked),
  ensures: {
    noneGivenIsTheDefault: {
      description: 'A wait given no bound waits four minutes',
      condition: ({ input: [asked], output }) => asked !== undefined || ('ms' in output && output.ms === WAIT_DEFAULT_MS),
    },
    aBoundWithinIsTakenAsGiven: {
      description: 'A bound above zero and at most the longest is taken as given',
      condition: ({ input: [asked], output }) =>
        asked === undefined || asked <= 0 || asked > WAIT_MAX_MS || ('ms' in output && output.ms === asked),
    },
    nothingToWaitIsRefused: {
      description: 'A bound of zero or less is refused: there is nothing to wait',
      condition: ({ input: [asked], output }) =>
        asked === undefined || asked > 0 || ('refused' in output && output.refused === 'not-positive'),
    },
    longerThanACallLivesIsRefused: {
      description: 'A bound longer than four minutes and a half is refused, never cut: its caller asked for what it would not get',
      condition: ({ input: [asked], output }) =>
        asked === undefined || asked <= WAIT_MAX_MS || ('refused' in output && output.refused === 'above-max'),
    },
  },
});

/** `waitBound`'s type, which `src/await/await.ts` takes. */
export type WaitBoundOf = Implementation<typeof waitBoundSpec>;
