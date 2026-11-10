/**
 * The renames still in flight: each spelling a glossary table retires that a file under its paths still says, lower-cased, with each
 * such file and the times it says it (`glossary.test.ts`). A count only shrinks: a change that takes the spelling out of a file lowers
 * its count in the same commit, and takes the entry off where none is left. Why each spelling is retired is its row's card; where an
 * old spelling stays on purpose, its row says so as a `kept` path with why, and it is not counted here.
 */
export const RETIRED_COUNTS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  selector: {
    'packages/objects/src/api-errors.ts': 2,
  },
  wf: {
    'packages/agent-orchestrator/place/git/git.ts': 1,
    'packages/agent-orchestrator/place/git/verbs/handoff.ts': 2,
    'packages/agent-orchestrator/place/git/verbs/make.ts': 2,
    'packages/agent-orchestrator/place/memory/reads.ts': 1,
    'packages/agent-orchestrator/src/admission/admission.ts': 2,
    'packages/agent-orchestrator/src/brief/brief.ts': 1,
    'packages/agent-orchestrator/src/brief/handed.verb.ts': 1,
    'packages/agent-orchestrator/src/check/check.ts': 7,
    'packages/agent-orchestrator/src/cli/flags.ts': 3,
    'packages/agent-orchestrator/src/cli/main.ts': 1,
    'packages/agent-orchestrator/src/config/config.store.ts': 1,
    'packages/agent-orchestrator/src/daemon/daemon.store.ts': 1,
    'packages/agent-orchestrator/src/start/store-root.ts': 1,
    'packages/agent-orchestrator/src/status/status.ts': 1,
    'packages/agent-orchestrator/src/workspace/worktree.store.ts': 1,
  },
};
