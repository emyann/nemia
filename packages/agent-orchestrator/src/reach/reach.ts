/**
 * Which gates a person's rules for `auto` can reach: read off each gated step as its workflow declares it, never off a run, so it says
 * whether a rule could ever approve that gate, and, given a run's facts, what keeps a rule from it now. A rule is judged on facts of the
 * gated step itself (`factsOf`, `facts.ts`), and some of them never hold at some gates: a step with no check never has one that
 * passed. Pure; the laws are its contract's.
 */
import type { SuggestedFor, Unmet, UnmetNow } from '../../contracts/reach.contract.ts';
import { CONDITION_WORDS, CONDITIONS, type Condition, type Facts, type GateRule as PolicyRule } from '../auto/index.ts';
import type { GateSite, NeverWhy } from '../../contracts/never-holds.contract.ts';
import { neverHolds } from './never-holds.ts';
import { ruleReaches } from './rule-reaches.ts';

export { ruleReaches } from './rule-reaches.ts';

export type { Unmet } from '../../contracts/reach.contract.ts';

export type { GateSite, NeverWhy } from '../../contracts/never-holds.contract.ts';

/** A step's name as a rule's id may hold it: lowercase letters and digits, every other run of characters a dash. */
function slugOf(step: string) {
  let slug = '';
  for (const ch of step.toLowerCase()) slug += /[a-z0-9]/.test(ch) ? ch : slug.endsWith('-') || slug === '' ? '' : '-';
  return slug.endsWith('-') ? slug.slice(0, -1) : slug;
}

/**
 * The rule that approves the step gated at `site` and no other, needing every condition that can hold there and no dollar line, which
 * is the person's to add; its id `approve-<step>`, the step's name slugged so that `ruleRefusal` takes it. Pure.
 * @param site The gate the rule is suggested for.
 * @public
 */
export const suggestedFor: SuggestedFor = (site) => ({
  id: `approve-${slugOf(site.step)}`,
  answer: 'approve',
  steps: [site.step],
  when: CONDITIONS.filter((c) => neverHolds(site, c) === null),
});

/**
 * What keeps `rule` from letting its answer through in `facts`: each condition it needs that does not hold, and its dollar line. Pure.
 * @param rule The rule in force.
 * @param facts The run's facts at the gate: which conditions hold, and what it has cost.
 * @public
 */
export const unmetNow: UnmetNow = (rule, facts) => ({
  conditions: CONDITIONS.filter((c) => rule.when.includes(c) && !facts[c]),
  overLine: rule.under !== undefined && facts.spend >= rule.under,
});

/** How much of a factory's gates its rules in force reach: every one, some, or none. */
export type Reach = 'all' | 'some' | 'none';

/**
 * Why a rule in force can never approve at a gate, its first reason: it only tries a step again (`answers-retry`), it covers other
 * steps (`other-steps`), or it needs a condition that never holds there (`never-holds`), the first in `CONDITIONS`' order, and why.
 */
export type RuleMiss =
  | { rule: string; why: 'answers-retry' }
  | { rule: string; why: 'other-steps' }
  | { rule: string; why: 'never-holds'; condition: Condition; because: NeverWhy };

/**
 * A gate and what reaches it: the ids of the rules in force that could approve it (`reachedBy`), of the proposed rules not in force
 * that could (`proposedBy`), each rule in force that cannot with its first reason and its words (`misses`), and, where a run's facts
 * are given, each rule that reaches it with what keeps it from approving now (`now`), a rule kept by nothing left out.
 */
export type GateReach = GateSite & {
  reachedBy: string[];
  proposedBy: string[];
  misses: (RuleMiss & { words: string })[];
  now?: { rule: string; unmet: Unmet; words: string }[];
};

/** Why a condition never holds at a gate, in a person's words. */
export const NEVER_WORDS: Record<NeverWhy, string> = {
  'no-check': 'it has no check to pass',
};

/** Each condition, where it does not hold now, in a person's words. */
const UNMET_WORDS: Record<Condition, string> = {
  recommends: 'its agent has not recommended it',
  checked: 'its check has not passed',
  accepted: 'its review has not passed',
  withinBudget: 'a step is past its budget',
  nothingOpen: 'something waits on you',
};

/** Words joined as a sentence lists them: `a`, `a and b`, `a, b and c`. */
const listed = (words: readonly string[]) => (words.length < 2 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`);

/** Dollars as a person reads them: whole where they are, else to the cent. */
const dollars = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

/**
 * Why a rule misses a gate, in a person's words, naming the rule by its id.
 * @param miss The rule's first reason it can never approve at the gate.
 */
export function missWords(miss: RuleMiss) {
  if (miss.why === 'answers-retry') return `${miss.rule}: it only tries a step again, and never approves one`;
  if (miss.why === 'other-steps') return `${miss.rule}: it covers other steps, not this one`;
  return `${miss.rule}: it needs "${CONDITION_WORDS[miss.condition]}", and ${NEVER_WORDS[miss.because]}`;
}

/**
 * What keeps `rule` from approving now, in a person's words: each condition that does not hold, and the run's cost past its line.
 * @param unmet What keeps the rule now (`unmetNow`).
 * @param rule The rule, whose dollar line is named.
 * @param spend What the run has cost, in dollars.
 */
export function unmetWords(unmet: Unmet, rule: PolicyRule, spend: number) {
  const line = unmet.overLine && rule.under !== undefined ? [`it has cost ${dollars(spend)}, past its ${dollars(rule.under)} line`] : [];
  return listed([...unmet.conditions.map((c) => UNMET_WORDS[c]), ...line]);
}

/** The first reason `rule` can never approve at `site`, or undefined where it can. */
function missOf(rule: PolicyRule, site: GateSite) {
  if (rule.answer === 'retry') return { rule: rule.id, why: 'answers-retry' } satisfies RuleMiss | undefined;
  if (rule.steps !== undefined && !rule.steps.includes(site.step))
    return { rule: rule.id, why: 'other-steps' } satisfies RuleMiss | undefined;
  for (const condition of CONDITIONS) {
    const because = rule.when.includes(condition) ? neverHolds(site, condition) : null;
    if (because !== null) return { rule: rule.id, why: 'never-holds', condition, because } satisfies RuleMiss | undefined;
  }
  return undefined;
}

/** A gate's row: the rules that reach it, those proposed that would, the misses, and, given facts, what keeps each rule now. */
function rowOf(inForce: readonly PolicyRule[], proposed: readonly PolicyRule[], site: GateSite, facts: Facts | undefined) {
  const reaching = inForce.filter((rule) => ruleReaches(rule, site));
  const misses = inForce.flatMap((rule) => {
    const miss = missOf(rule, site);
    return miss === undefined ? [] : [{ ...miss, words: missWords(miss) }];
  });
  const row: GateReach = {
    ...site,
    reachedBy: reaching.map((rule) => rule.id),
    proposedBy: proposed.filter((p) => !inForce.some((r) => r.id === p.id) && ruleReaches(p, site)).map((p) => p.id),
    misses,
  };
  if (facts === undefined) return row;
  const now = reaching.flatMap((rule) => {
    const unmet = unmetNow(rule, facts);
    return unmet.conditions.length === 0 && !unmet.overLine ? [] : [{ rule: rule.id, unmet, words: unmetWords(unmet, rule, facts.spend) }];
  });
  return { ...row, now };
}

/**
 * The gates of a factory and what its rules reach: a row for each site, the reach of the whole list (`all` where every row is reached,
 * no row included; `none` where none is), and one suggested rule for each step's name that some site no rule in force reaches gates,
 * asking only what can hold at every site of that name. `factsAt` gives a run's facts at a site, for what keeps a rule now. Pure.
 * @param inForce The factory's rules in force.
 * @param proposed The rules proposed, not in force.
 * @param sites The factory's gates.
 * @param factsAt A run's facts at a site, for what keeps a rule now; absent, or undefined for a site, where no run's facts are given.
 */
export function gateRows(
  inForce: readonly PolicyRule[],
  proposed: readonly PolicyRule[],
  sites: readonly GateSite[],
  factsAt?: (site: GateSite) => Facts | undefined,
) {
  const rows = sites.map((site) => rowOf(inForce, proposed, site, factsAt?.(site)));
  const reached = rows.filter((row) => row.reachedBy.length > 0).length;
  const reach: Reach = reached === rows.length ? 'all' : reached === 0 ? 'none' : 'some';
  const missed = [...new Set(rows.filter((row) => row.reachedBy.length === 0).map((row) => row.step))];
  const suggested = missed.flatMap((step) => {
    const named = sites.filter((site) => site.step === step);
    const first = named.at(0);
    if (first === undefined) return [];
    const rule = suggestedFor(first);
    return [{ ...rule, when: rule.when.filter((c) => named.every((site) => neverHolds(site, c) === null)) }];
  });
  return { reach, rows, suggested };
}
