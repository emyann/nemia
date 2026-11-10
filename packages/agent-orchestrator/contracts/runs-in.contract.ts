/**
 * The permission mode a step's try runs in, as the board's Facts show it (agent-orchestrator, src/resource/runs-in.ts, `runsInOf`):
 * read off what the runtime measured of the try's session — its attempt's `ranIn`, the mode the session's own start line said (Claude
 * Code's `init`), or the sandbox the runtime's spawn gave it (Codex) — and the mode the task was filed with, never rebuilt from an argv
 * nor taken from what was filed.
 *
 * Where the runtime has measured nothing yet (no attempt, a session that has not said its start line, a harness that cannot say), there
 * is no mode to show: null, and the board falls back to the filed fence (`ranWith`). Where it has, the mode is the measured one, and
 * `by` says where it came from: `default` with none filed, `filed` where the session runs in the mode filed, `harness` where its
 * harness ran it in another (Claude Code dropping `auto` on a model; Codex's sandbox narrowed by tools that write nothing).
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { RunsInBy } from 'objects';

/** A try's mode as the board reads it: the mode, and where it came from (`objects`' `RunsInBy`, `filed | default | harness`). */
export type RunsIn = { readonly mode: string; readonly by: RunsInBy };

const runsInSpec = spec<(filed: string | undefined, ranIn: string | undefined) => RunsIn | null>({
  ensures: {
    unmeasuredIsNone: {
      description:
        'A try whose session has said no mode yet, or whose harness cannot say one, shows none: never the mode it was filed with',
      condition: ({ input: [, ranIn], output }) => ranIn !== undefined || output === null,
    },
    measuredIsShown: {
      description: 'A try whose session said its mode shows that mode, whatever it was filed with',
      condition: ({ input: [, ranIn], output }) => ranIn === undefined || (output !== null && output.mode === ranIn),
    },
    noneFiledIsDefault: {
      description: 'A try filed with no mode runs in its harness’s choice: by default',
      condition: ({ input: [filed, ranIn], output }) => !(filed === undefined && ranIn !== undefined) || output?.by === 'default',
    },
    asFiledIsFiled: {
      description: 'A try whose session runs in the mode it was filed with runs in it as filed',
      condition: ({ input: [filed, ranIn], output }) => !(filed !== undefined && ranIn === filed) || output?.by === 'filed',
    },
    otherIsTheHarness: {
      description: 'A try whose session runs in another mode than the one filed was put there by its harness',
      condition: ({ input: [filed, ranIn], output }) =>
        !(filed !== undefined && ranIn !== undefined && ranIn !== filed) || output?.by === 'harness',
    },
  },
});

/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type RunsInOf = Implementation<typeof runsInSpec>;
