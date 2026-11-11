/**
 * What a step's `checkFailurePolicy:` says of a check that refused (agent-orchestrator, src/check/check-policy.ts,
 * `checkFailureAction`): `FailStep`, the refusal is one only a person answers, so `retries:` files no try of it and the step waits on the
 * person; or `Count`, the default, a refusal `retries:` tries again while it has tries left (`retriesDue`, src/retry/retry.ts).
 *
 * Read against Kubernetes' Job `spec.podFailurePolicy`: its rules are read in order, the first whose `onExitCodes` requirement holds of
 * the exit code decides, and where none holds the default handling applies, which is `Count`. The step is the Job — `retries:` its
 * `backoffLimit` — so `FailJob` is `FailStep` here, and it fails nothing else: the run waits on a person, as it does past `retries:`.
 * Neither `Ignore` nor `FailIndex` is taken (a try counted against nothing has no bound but the budget, and a step has no index), and
 * no `containerName`: a check is one command.
 *
 * The policy is the orchestrator's, a key on the step frozen with the run and read by its pure judgement on every pass; the runtime runs
 * the check and records its exit code, and judges nothing of it (`attemptVerdict`, src/check/check.ts). A check that did not finish has no
 * exit code, and no rule reads it.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { Verdict } from '../src/check/check.ts';

/** What a rule does with a refusal it matches: `FailStep`, no try on the run's word; `Count`, a try `retries:` counts. */
export type CheckFailureAction = 'FailStep' | 'Count';

/** Kubernetes' `onExitCodes`: the exit code is among `values` (`In`), or is not (`NotIn`). */
export type ExitCodesRequirement = { readonly operator: 'In' | 'NotIn'; readonly values: readonly number[] };

/** One rule of the policy: its action, and the exit codes it reads. */
export type CheckFailureRule = { readonly action: CheckFailureAction; readonly onExitCodes: ExitCodesRequirement };

/** A step's `checkFailurePolicy:` as the loader reads it: its rules, in the order the line writes them. */
export type CheckFailurePolicy = { readonly rules: readonly CheckFailureRule[] };

/** Whether `rule` holds of a check's verdict: an exit code, `In` or `NotIn` its values. A check that did not finish matches no rule. */
const holds = (rule: CheckFailureRule, verdict: Verdict): boolean =>
  verdict !== 'unfinished' &&
  (rule.onExitCodes.operator === 'In' ? rule.onExitCodes.values.includes(verdict) : !rule.onExitCodes.values.includes(verdict));

/** Whether a rule before the `i`th of `rules` holds of the verdict. */
const heldBefore = (rules: readonly CheckFailureRule[], i: number, verdict: Verdict): boolean =>
  rules.some((rule, j) => j < i && holds(rule, verdict));

const checkFailureActionSpec = spec<(policy: CheckFailurePolicy | undefined, verdict: Verdict) => CheckFailureAction>({
  /**
   * What the loader lets through (`checkFailurePolicyOf`): at least one rule, each with at least one value, each value a whole exit code
   * from 1 to 255 — 0 is a check that passed, which no rule reads. And what the runtime records: a whole exit code, or no verdict.
   */
  requires: ({ input: [policy, verdict] }) =>
    (verdict === 'unfinished' || Number.isInteger(verdict)) &&
    (policy === undefined ||
      (policy.rules.length >= 1 &&
        policy.rules.every(
          (rule) =>
            rule.onExitCodes.values.length >= 1 &&
            rule.onExitCodes.values.every((code) => Number.isInteger(code) && code >= 1 && code <= 255),
        ))),
  ensures: {
    noPolicyCounts: {
      description: 'A step that declares no policy has every refusal counted, as retries: always read it',
      condition: ({ input: [policy], output }) => (policy === undefined ? output === 'Count' : true),
    },
    unfinishedCounts: {
      description: 'A check that did not finish said nothing of the work, nor whose it is: no rule fails the step on it',
      condition: ({ input: [, verdict], output }) => (verdict === 'unfinished' ? output === 'Count' : true),
    },
    noRuleHeldCounts: {
      description: 'An exit code no rule holds of is handled the default way: counted, so retries: tries it again',
      condition: ({ input: [policy, verdict], output }) =>
        policy === undefined || policy.rules.some((rule) => holds(rule, verdict)) || output === 'Count',
    },
    firstHeldDecides: {
      description: 'The rules are read in order: the first that holds of the exit code decides, and the rules after it are not read',
      condition: ({ input: [policy, verdict], output }) =>
        policy === undefined ||
        policy.rules.every((rule, i) => !holds(rule, verdict) || heldBefore(policy.rules, i, verdict) || output === rule.action),
    },
  },
});
/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type CheckFailureActionOf = Implementation<typeof checkFailureActionSpec>;
