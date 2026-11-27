/**
 * The renames still in flight: each spelling a glossary table retires that a file under its paths still says, lower-cased, with each
 * such file and the times it says it (`glossary.test.ts`). A count only shrinks: a change that takes the spelling out of a file lowers
 * its count in the same commit, and takes the entry off where none is left. Why each spelling is retired is its row's card; where an
 * old spelling stays on purpose, its row says so as a `kept` path with why, and it is not counted here.
 */
export const RETIRED_COUNTS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  landed: {
    'packages/agent-orchestrator/contracts/checkout-checks.contract.ts': 2,
    'packages/agent-orchestrator/contracts/checkout-claim.contract.ts': 10,
    'packages/agent-orchestrator/contracts/landed-by.contract.ts': 15,
    'packages/agent-orchestrator/place/git/landed.ts': 7,
    'packages/agent-orchestrator/place/git/verbs/status.ts': 6,
    'packages/agent-orchestrator/place/memory/reads.ts': 3,
    'packages/agent-orchestrator/src/check/check.ts': 6,
    'packages/agent-orchestrator/src/collide/collide.ts': 4,
    'packages/agent-orchestrator/src/ending/ending.ts': 33,
    'packages/agent-orchestrator/src/ending/ending.verb.ts': 29,
    'packages/agent-orchestrator/src/forget/forget.ts': 4,
    'packages/agent-orchestrator/src/forget/prune/prune.verb.ts': 1,
    'packages/agent-orchestrator/src/list/list.ts': 6,
    'packages/agent-orchestrator/src/merge/merge.ts': 7,
    'packages/agent-orchestrator/src/place/landing.store.ts': 2,
    'packages/agent-orchestrator/src/place/place.ts': 1,
    'packages/agent-orchestrator/src/record/record.model.ts': 3,
    'packages/agent-orchestrator/src/record/record.store.ts': 1,
    'packages/agent-orchestrator/src/record/record.ts': 2,
    'packages/agent-orchestrator/src/rest/rest.ts': 1,
    'packages/agent-orchestrator/src/retry/retry-ask.ts': 1,
    'packages/agent-orchestrator/src/retry/retry-refusal.ts': 1,
    'packages/agent-orchestrator/src/retry/retry.ts': 7,
    'packages/agent-orchestrator/src/round/round.ts': 1,
    'packages/agent-orchestrator/src/stats/stats.ts': 4,
    'packages/agent-orchestrator/src/status/status.ts': 2,
    'packages/agent-orchestrator/src/tick/advance.verb.ts': 5,
  },
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
