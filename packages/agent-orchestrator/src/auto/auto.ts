/**
 * What a person lets an agent answer unasked at `auto`, as rules the machinery holds: a rule (`AutoRule`) names an answer, the steps it
 * covers and the conditions it needs (`CONDITIONS`), judged on a run's facts at the moment of the call (`Facts`, `allowedBy`); the
 * builtin rule, decide when all agree (`DEFAULT_AUTO`); the list in force (`listInForce`); a rule in the person's words, made from its
 * fields (`ruleWords`); and the refusal of a rule that is none (`ruleRefusal`).
 *
 * Pure, and naming no agent: admission reads a list for whichever agent it is given (`admissionOf`). The files are `auto.store.ts`'s, the
 * facts `facts.ts`'s, the commands `auto.verb.ts`'s.
 */

/**
 * The conditions a rule may need, each a fact admission reads of a run at the call: the step's agent recommends (`recommends`), its check
 * passed (`checked`), every reviewer accepted (`accepted`), no step is past its budget (`withinBudget`), and nothing is left open
 * (`nothingOpen`).
 */
export const CONDITIONS = ['recommends', 'checked', 'accepted', 'withinBudget', 'nothingOpen'] as const;

/** A condition a rule may need. */
export type Condition = (typeof CONDITIONS)[number];

/** The answers a rule may give unasked: a step approved at its gate, and a step tried again. */
export const AUTO_ANSWERS = ['approve', 'retry'] as const;

/** An answer a rule may give unasked. */
export type AutoAnswer = (typeof AUTO_ANSWERS)[number];

/**
 * A rule: its `id`; the `answer` it gives unasked; the `steps` it covers, by name, every step where absent; the conditions it needs
 * (`when`), all of them; a dollar line the run's spend stays under (`under`), none where absent; and where it came from (`from`): the
 * builtin default, or an agent's proposal the person confirmed.
 */
export type AutoRule = {
  id: string;
  answer: AutoAnswer;
  steps?: string[];
  when: Condition[];
  under?: number;
  from?: 'default' | 'proposed';
};

/** A run's facts at a call, for one step: each condition, whether it holds, and what the run has spent (`spend`, in dollars). */
export type Facts = Record<Condition, boolean> & { spend: number };

/** The facts of a run that does not read: no condition holds, so no rule allows. */
export const NO_FACTS: Facts = {
  recommends: false,
  checked: false,
  accepted: false,
  withinBudget: false,
  nothingOpen: false,
  spend: Number.POSITIVE_INFINITY,
};

/**
 * The folder of the store the rules for auto are kept in, one writer to each of its files (`auto.store.ts`). It keeps its name though the
 * commands that write it are `nemia policy`: a folder renamed would orphan every rule a person confirmed.
 */
export const AUTO_FOLDER = 'auto';

/** The id of the builtin rule. */
export const DEFAULT_ID = 'default';

/** The builtin rule, decide when all agree: approve any step unasked when every condition holds. */
export const DEFAULT_AUTO: AutoRule = { id: DEFAULT_ID, answer: 'approve', when: [...CONDITIONS], from: 'default' };

/** The list in force: the builtin rule while the person has confirmed none, else their confirmed list, which replaces it. Pure. */
export const listInForce = (confirmed: readonly AutoRule[] | undefined): AutoRule[] =>
  confirmed === undefined ? [DEFAULT_AUTO] : [...confirmed];

/** Whether `rule` allows `answer` at `step` in `facts`: its answer, a step it covers, each condition it needs, and under its line. */
const allows = (rule: AutoRule, answer: string, step: string, facts: Facts): boolean =>
  rule.answer === answer &&
  (rule.steps === undefined || rule.steps.includes(step)) &&
  rule.when.every((c) => facts[c]) &&
  (rule.under === undefined || facts.spend < rule.under);

/** The first rule of `list` that allows `answer` at `step` in `facts`, or undefined where none does. Pure. */
export const allowedBy = (
  list: readonly AutoRule[],
  { answer, step }: { answer: string; step: string },
  facts: Facts,
): AutoRule | undefined => list.find((rule) => allows(rule, answer, step, facts));

/** Each condition as a rule says it. */
const CONDITION_WORDS: Record<Condition, string> = {
  recommends: 'the agent recommends it',
  checked: 'its check passed',
  accepted: 'every reviewer accepted',
  withinBudget: 'no step is past its budget',
  nothingOpen: 'nothing is left open',
};

/** Each answer as a rule says it. */
const ANSWER_WORDS: Record<AutoAnswer, string> = { approve: 'Approve', retry: 'Try again' };

/** Words joined as a sentence lists them: `a`, `a and b`, `a, b and c`. */
const listed = (words: readonly string[]): string =>
  words.length < 2 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;

/**
 * A rule in the person's words, made from its fields alone, so what they read is what admission holds: `Approve any step unasked when
 * the agent recommends it, …`. Pure.
 */
export function ruleWords(rule: AutoRule): string {
  const steps = rule.steps === undefined ? 'any step' : `${rule.steps.length === 1 ? 'the step' : 'the steps'} ${listed(rule.steps)}`;
  const when = [
    ...rule.when.map((c) => CONDITION_WORDS[c]),
    ...(rule.under === undefined ? [] : [`the run has cost under $${rule.under}`]),
  ];
  return `${ANSWER_WORDS[rule.answer]} ${steps} unasked${when.length ? ` when ${listed(when)}` : ', whatever the run’s state'}.`;
}

/** A value read as a list of names, or undefined where it is not one. */
const namesOf = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.every((v) => typeof v === 'string' && v.trim() !== '') ? value : undefined;

/** Why the fields of `rule` other than its id and answer are no rule's, or undefined where they are. */
function shapeRefusal(rule: Record<string, unknown>, at: string): string | undefined {
  if (rule.steps !== undefined && (namesOf(rule.steps) === undefined || (rule.steps as string[]).length === 0))
    return `${at}: steps is a list of step names, or left out for every step.`;
  const when = rule.when;
  if (!Array.isArray(when) || when.some((c) => !(CONDITIONS as readonly unknown[]).includes(c)))
    return `${at}: when is a list of the conditions ${CONDITIONS.join(', ')}; ${JSON.stringify(when)} is not.`;
  if (new Set(when).size !== when.length) return `${at}: when names a condition twice.`;
  if (rule.under !== undefined && !(typeof rule.under === 'number' && Number.isFinite(rule.under) && rule.under > 0))
    return `${at}: under is the dollars the run's spend stays under, a number above 0, or left out.`;
  return undefined;
}

/**
 * Why `rule` is no rule an agent may propose, or undefined where it is one: an id that is no name or is the default's, an answer that is
 * none of `AUTO_ANSWERS`, steps that are no list of names, a condition that is none of `CONDITIONS` or named twice, and a line that is no
 * dollars above 0. `at` names it in the refusal. Pure.
 */
export function ruleRefusal(rule: unknown, at: string): string | undefined {
  if (typeof rule !== 'object' || rule === null || Array.isArray(rule))
    return `${at} is no rule: { "id", "answer", "steps"?, "when", "under"? }.`;
  const r = rule as Record<string, unknown>;
  if (typeof r.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(r.id))
    return `${at}: id is a name of lowercase letters, digits and dashes; ${JSON.stringify(r.id)} is not.`;
  if (r.id === DEFAULT_ID) return `${at}: the id ${DEFAULT_ID} is the builtin rule: give the rule an id of its own.`;
  if (!(AUTO_ANSWERS as readonly unknown[]).includes(r.answer))
    return `${at}: answer is one of ${AUTO_ANSWERS.join(', ')}; ${JSON.stringify(r.answer)} is not one a rule may give unasked.`;
  return shapeRefusal(r, at);
}
