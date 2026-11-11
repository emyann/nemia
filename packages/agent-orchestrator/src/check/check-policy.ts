/**
 * A step's `checkFailurePolicy:`, which says which exit codes of its `check:` mean a refusal only a person answers: read from its line
 * (`checkFailurePolicyOf`), judged against a refused check's verdict (`checkFailureAction`, proved by
 * contracts/check-failure-policy.contract.ts), and written back as its map (`checkFailurePolicyWritten`) or its line in YAML flow
 * (`checkFailurePolicyLine`).
 *
 * The shape is Kubernetes' Job `spec.podFailurePolicy`, narrowed: `{ rules: [ { action, onExitCodes: { operator, values } } ] }`, the
 * rules read in order and the first whose `onExitCodes` holds of the exit code deciding, `Count` where none holds. The step is the Job
 * and `retries:` its `backoffLimit`, so the departures are these: `FailJob` is `FailStep` (no `retries:` try is filed and the step waits
 * on a person, `failed (check)`); no `Ignore` (a try counted against nothing has no bound but the budget); no `FailIndex` (a step has no
 * index); no `containerName` (a check is one command); no `onPodConditions` (a check has an exit code and nothing else).
 */
import type { CheckFailureActionOf, CheckFailurePolicy, CheckFailureRule } from '../../contracts/check-failure-policy.contract.ts';
import type { FrontmatterValue } from '../frontmatter/frontmatter.ts';
import { refuse } from '../step/step.ts';

export type {
  CheckFailureAction,
  CheckFailurePolicy,
  CheckFailureRule,
  ExitCodesRequirement,
} from '../../contracts/check-failure-policy.contract.ts';

/**
 * What the policy says of a check's verdict: the action of the first rule whose `onExitCodes` holds of its exit code, or `Count` where
 * no rule holds, no policy is declared, or the check did not finish. Pure.
 */
export const checkFailureAction: CheckFailureActionOf = (policy, verdict) => {
  if (policy === undefined || verdict === 'unfinished') return 'Count';
  for (const rule of policy.rules) {
    const listed = rule.onExitCodes.values.some((code) => code === verdict);
    if (rule.onExitCodes.operator === 'In' ? listed : !listed) return rule.action;
  }
  return 'Count';
};

const ACTIONS = ['FailStep', 'Count'] as const;
const OPERATORS = ['In', 'NotIn'] as const;
const EXAMPLE = '`checkFailurePolicy: { rules: [ { action: FailStep, onExitCodes: { operator: In, values: [78] } } ] }`';

const isMap = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A step's `checkFailurePolicy:` from the JSON text `readKeys` kept of its map; each shape it cannot take is refused with the line to write. */
export function checkFailurePolicyOf(step: string, text: string | undefined): CheckFailurePolicy | undefined {
  if (text === undefined) return undefined;
  let map: unknown;
  try {
    map = text.trim().startsWith('{') ? JSON.parse(text) : undefined;
  } catch {
    map = undefined;
  }
  if (!isMap(map)) refuse(`${step}: \`checkFailurePolicy: ${text}\` is no policy. Write a map of rules: ${EXAMPLE}.`);
  const other = Object.keys(map).find((key) => key !== 'rules');
  if (other !== undefined)
    refuse(`${step}: \`checkFailurePolicy:\` holds \`${other}\`, and a policy holds \`rules\` alone. Delete it: ${EXAMPLE}.`);
  const rules = map.rules;
  if (!Array.isArray(rules) || !rules.length)
    refuse(`${step}: \`checkFailurePolicy:\` lists no rule. Write one — ${EXAMPLE} — or delete the line.`);
  return { rules: rules.map((rule, i) => ruleOf(step, i + 1, rule)) };
}

/** The `n`th rule of a policy: `action` FailStep or Count, and `onExitCodes` In or NotIn a list of exit codes, each once, from 1 to 255. */
function ruleOf(step: string, n: number, rule: unknown): CheckFailureRule {
  const at = `${step}: rule ${n} of \`checkFailurePolicy:\``;
  if (!isMap(rule)) refuse(`${at} is no map. Write \`{ action: FailStep, onExitCodes: { operator: In, values: [78] } }\`.`);
  const other = Object.keys(rule).find((key) => key !== 'action' && key !== 'onExitCodes');
  if (other !== undefined) refuse(`${at} holds \`${other}\`, and a rule holds \`action\` and \`onExitCodes\`. Delete it.`);
  const action = rule.action;
  if (action === 'Ignore')
    refuse(
      `${at} says \`action: Ignore\`, a try counted against nothing, which would have no bound but the budget. Write \`action: Count\`, which \`retries:\` bounds, or \`action: FailStep\`.`,
    );
  if (!ACTIONS.some((a) => a === action))
    refuse(`${at} says \`action: ${String(action)}\`. Write \`action: FailStep\` (a person answers it) or \`action: Count\`.`);
  const codes = rule.onExitCodes;
  if (!isMap(codes)) refuse(`${at} reads no exit codes. Add \`onExitCodes: { operator: In, values: [<code>] }\`.`);
  const other2 = Object.keys(codes).find((key) => key !== 'operator' && key !== 'values');
  if (other2 !== undefined)
    refuse(`${at}: \`onExitCodes\` holds \`${other2}\`, and it holds \`operator\` and \`values\`, a check being one command. Delete it.`);
  const operator = OPERATORS.find((o) => o === codes.operator);
  if (operator === undefined)
    refuse(`${at}: \`operator: ${String(codes.operator)}\` is none. Write \`operator: In\` or \`operator: NotIn\`.`);
  const written = codes.values;
  if (!Array.isArray(written) || !written.length)
    refuse(`${at} lists no exit code. Write \`values: [<code>]\`, each a whole number from 1 to 255.`);
  const values = written.map((value) => {
    const code = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : NaN;
    if (!Number.isInteger(code) || code < 1 || code > 255)
      refuse(
        `${at} lists \`${String(value)}\`, and an exit code it reads is a whole number from 1 to 255 (0 is a check that passed). Write one.`,
      );
    return code;
  });
  const twice = values.find((v, i) => values.indexOf(v) !== i);
  if (twice !== undefined) refuse(`${at} lists \`${twice}\` twice. Delete one.`);
  return { action: action as CheckFailureRule['action'], onExitCodes: { operator, values } };
}

/** The policy as its line writes it, the map `checkFailurePolicyOf` reads back: each exit code written as its digits. */
export const checkFailurePolicyWritten = (policy: CheckFailurePolicy): FrontmatterValue => ({
  rules: policy.rules.map((rule) => ({
    action: rule.action,
    onExitCodes: { operator: rule.onExitCodes.operator, values: rule.onExitCodes.values.map(String) },
  })),
});

/** The policy as its line writes it, in YAML flow: `{ rules: [ { action: FailStep, onExitCodes: { operator: In, values: [78] } } ] }`. */
export const checkFailurePolicyLine = (policy: CheckFailurePolicy): string =>
  `{ rules: [ ${policy.rules
    .map(
      (rule) =>
        `{ action: ${rule.action}, onExitCodes: { operator: ${rule.onExitCodes.operator}, values: [${rule.onExitCodes.values.join(', ')}] } }`,
    )
    .join(', ')} ] }`;
