/**
 * The rules a skill declares (`SkillRule`), as the stats count them: on each try whose denials were measured, a rule is broken when a call
 * the try was denied matches one of its `breaks`, as a `disallowedTools:` rule matches a call (`disallowedBy`), and kept otherwise — "no
 * refused call matched", not "followed". Pure: `stats.ts` carries the facts and rows, `stats.verb.ts` reads the rules off each step's
 * frozen copy of its skills.
 */
import { disallowedBy } from '../keys/tools.ts';
import type { SkillRule } from '../skills/skills.ts';

/** One rule of one skill on one try: whether a call the try was denied broke it, and each call that did, one per call (`by`). */
export type RuleFact = { skill: string; rule: string; says: string; broken: boolean; by: string[] };

/** One rule of one skill over a set of tries: how many of those whose denials were measured kept it, and how many broke it. */
export type RuleRow = { skill: string; rule: string; says: string; kept: number; broken: number };

/**
 * Each rule each skill declares (`declared`, by skill), kept or broken by the calls a try was denied, in the order declared. Null where the
 * try's denials were not measured (`denied` null), so an unmeasured try is never counted as kept; `[]` with no rule declared.
 */
export function rulesOfTry(denied: readonly string[] | null, declared: ReadonlyMap<string, readonly SkillRule[]>): RuleFact[] | null {
  if (denied === null) return null;
  return [...declared].flatMap(([skill, rules]) =>
    rules.map((r) => {
      const by = denied.filter((call) => disallowedBy(call, r.breaks) !== undefined);
      return { skill, rule: r.id, says: r.says, broken: by.length > 0, by };
    }),
  );
}

const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Each skill's rule over `tries` (`RuleRow`): most broken first, then by skill and rule. None where no try measured a rule. */
export function ruleRowsOf(tries: ReadonlyArray<{ rules: readonly RuleFact[] | null }>): RuleRow[] {
  const rows = new Map<string, RuleRow>();
  for (const fact of tries.flatMap((t) => t.rules ?? [])) {
    const key = JSON.stringify([fact.skill, fact.rule]);
    const row = rows.get(key) ?? { skill: fact.skill, rule: fact.rule, says: fact.says, kept: 0, broken: 0 };
    rows.set(key, { ...row, kept: row.kept + (fact.broken ? 0 : 1), broken: row.broken + (fact.broken ? 1 : 0) });
  }
  return [...rows.values()].sort((a, b) => b.broken - a.broken || byName(a.skill, b.skill) || byName(a.rule, b.rule));
}
