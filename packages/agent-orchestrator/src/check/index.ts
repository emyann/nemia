/**
 * The check feature: what a step's `check:` runs and means (`check.ts`), and what its failure policy says of a refusal
 * (`check-policy.ts`).
 */
export {
  attemptVerdict,
  CHECK_DEADLINE_SECONDS,
  CHECK_NICENESS,
  CHECK_RESULTS,
  CHECK_TAIL_LINES,
  checkArgv,
  checkContract,
  checksContract,
  checkEnvOf,
  type CheckHanded,
  checkHandedSection,
  type CheckRefusal,
  type CheckResult,
  type CheckVerdict,
  checkVerdictOf,
  failingLines,
  INSTALL_ARGS,
  keptOutput,
  LANDING_CHECK_DEADLINE_SECONDS,
  landingContract,
  type LandingSaid,
  landingSaidSection,
  type LandingWords,
  lastLines,
  onItsCheck,
  REFUSAL_FILE_BYTES,
  REFUSAL_LINES,
  refusalSection,
  refusalsSection,
  reportedLines,
  UNPROVISIONED,
  type Verdict,
  verdictWord,
} from './check.ts';
export {
  checkFailureAction,
  checkFailurePolicyLine,
  checkFailurePolicyOf,
  checkFailurePolicyWritten,
  type CheckFailurePolicy,
} from './check-policy.ts';
export { checksDue, checksPhase, currentCheckTask, decidingCheckTask, standingOf, stepChecksDue } from './checks-due.ts';
export { checksOf, checksWritten } from './checks-plan.ts';
