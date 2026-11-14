/**
 * The contracts that still import from the code that implements them (`contract-first.test.ts`), each by its path from the
 * repository's root: 39 the day the guard was written, of 130. tsverify's own pages showed a spec taking its types from the file it
 * types, and this repository's skill told an implementer to move a contract's types into `src`.
 *
 * It only shrinks: a change that moves a contract's types into the contract, or a value both need into a file of its own, takes the
 * contract off here in the same commit. A contract is never added.
 */
export const READS_ITS_CODE: readonly string[] = [
  'packages/agent-orchestrator/contracts/gate.contract.ts',
  'packages/agent-orchestrator/contracts/handed-runs.contract.ts',
  'packages/agent-orchestrator/contracts/hold.contract.ts',
  'packages/agent-orchestrator/contracts/leftovers.contract.ts',
  'packages/agent-orchestrator/contracts/reach.contract.ts',
  'packages/agent-orchestrator/contracts/retention.contract.ts',
  'packages/agent-orchestrator/contracts/session-caller.contract.ts',
  'packages/agent-orchestrator/contracts/speaker.contract.ts',
  'packages/agent-orchestrator/contracts/standing.contract.ts',
  'packages/agent-orchestrator/contracts/step-machine.contract.ts',
  'packages/agent-orchestrator/contracts/step-speaker.contract.ts',
  'packages/agent-orchestrator/contracts/unit-running.contract.ts',
  'packages/agent-orchestrator/contracts/watch-changes.contract.ts',
  'packages/agent-orchestrator/contracts/workflow-graph.contract.ts',
  'packages/agent-runtime/contracts/decide.contract.ts',
  'packages/agent-runtime/contracts/lifecycle.contract.ts',
  'packages/agent-runtime/contracts/observe.contract.ts',
];
