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
  'packages/agent-orchestrator/contracts/reach.contract.ts',
  'packages/agent-orchestrator/contracts/standing.contract.ts',
  'packages/agent-runtime/contracts/decide.contract.ts',
  'packages/agent-runtime/contracts/lifecycle.contract.ts',
  'packages/agent-runtime/contracts/observe.contract.ts',
];
