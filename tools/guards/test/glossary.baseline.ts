/**
 * The spellings the glossary tables retire, still said in the code, counted per file (`glossary.test.ts`), each count only shrinking.
 *
 * `RETIRED_COUNTS`: each retired spelling, lower-cased, and each file under the paths of a table that retires it that says it, whole and
 * in any case, by its path from the repository root, with the times it says it. A table's paths take in the contexts nested in them,
 * so the run core's `wf` is counted in the whole of `packages/agent-orchestrator`; where two tables retire one spelling, its files are
 * counted once, under that spelling, over the paths of both — the run core's and the api's `wf`, the api's source saying none today.
 *
 * `wf`, on the day the guard was written: 47 words in 19 files of the orchestrator, every one of them on the card that renames the
 * command (`slice-4: the command table and the rename to nemia`). Some are a value stored and read back as it was written (a daemon
 * file's `by: 'wf up'`), the check's marker `wf <name>:`, the alias's own words, the run's branches `wf/<run>/<step>` and git's identity
 * `user.name=wf`; that card says which of them go.
 *
 * `wordState` and `pauseHolds`, the board's parses of a step's sentence into its state, retired by its *Step state* row the day the
 * step's codes reached the board: 5 words in 2 files, which that card (A step's state crosses the wire as a code, not a sentence) takes
 * out. Their keys here are lower-cased, as every spelling's is.
 *
 * It only shrinks: a change that takes a retired spelling out of a file lowers its count here in the same commit, and takes the entry
 * off where none is left; a new retired row in a table adds the counts of its files the day it lands. A count is never raised, nor a
 * file added for an old spelling.
 */
export const RETIRED_COUNTS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  wf: {
    'packages/agent-orchestrator/place/git/verbs/handoff.ts': 2,
    'packages/agent-orchestrator/place/git/verbs/make.ts': 2,
    'packages/agent-orchestrator/src/admission/admission.ts': 2,
    'packages/agent-orchestrator/src/brief/brief.ts': 1,
    'packages/agent-orchestrator/src/brief/handed.verb.ts': 1,
    'packages/agent-orchestrator/src/check/check.ts': 7,
    'packages/agent-orchestrator/src/cli/flags.ts': 3,
    'packages/agent-orchestrator/src/cli/main.ts': 1,
    'packages/agent-orchestrator/src/config/config.store.ts': 1,
    'packages/agent-orchestrator/src/daemon/daemon.store.ts': 1,
    'packages/agent-orchestrator/src/forget/forget.ts': 2,
    'packages/agent-orchestrator/src/forget/forget.verb.ts': 2,
    'packages/agent-orchestrator/src/place/place.store.ts': 3,
    'packages/agent-orchestrator/src/start/store-root.ts': 1,
    'packages/agent-orchestrator/src/status/status.ts': 1,
    'packages/agent-orchestrator/src/workflow/validate.ts': 1,
    'packages/agent-orchestrator/src/workspace/workspace.ts': 6,
    'packages/agent-orchestrator/src/workspace/worktree.store.ts': 3,
  },
  pauseholds: {
    'apps/web/src/lib/status.ts': 1,
    'apps/web/src/lib/words.ts': 2,
  },
  wordstate: {
    'apps/web/src/lib/status.ts': 2,
  },
};
