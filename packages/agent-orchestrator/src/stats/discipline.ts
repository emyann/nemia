/**
 * The calls a try was refused, as the stats count them: every call each ended attempt of a session was denied, one per call, measured
 * where each ended attempt says its denials (`deniedCallsOf`), read by the stats (`stats.verb.ts`); nothing reads a running attempt's
 * denials. And the skills a try
 * loaded: every skill each ended attempt of a session loaded, one per load, where each ended attempt says (`skillsLoadedOf`).
 * And the skills a try was due to load: those whose `applies:` names a file its sessions read or wrote (`filesTouchedOf`, `skillsDueOf`).
 * And the rules those skills declare (`SkillRule`): on each try whose denials were measured, a rule is broken when a call the try was
 * denied matches one of its `breaks`, as a `disallowedTools:` rule matches a call (`disallowedBy`), and kept otherwise — "no refused call
 * matched", not "followed" (`rulesOfTry`, `ruleRowsOf`). Pure: `stats.verb.ts` hands the views and each step's frozen skills' rules here,
 * and words each call with the runtime's `denialText`.
 */
import type { DeniedCallsOf } from '../../contracts/denials-measured.contract.ts';
import { bareSkillOf, disallowedBy } from '../keys/index.ts';
import { appliesMatch, type SkillRule } from '../skills/skills.ts';

/**
 * Every call a task's sessions were denied: each denial of each attempt that ended, in the order of the attempts, one per call — a call
 * denied twice is two; `[]` where every ended attempt says it was denied nothing. Null, not measured, for a task with no view, with no
 * attempt ended, or with an ended attempt whose end does not say its denials (its harness could not say). Typed by its contract.
 * @param view The task's view, its attempts among it, or undefined where there is none.
 */
export const deniedCallsOf: DeniedCallsOf = (view) => {
  const ends = (view?.state.attempts ?? []).filter((a) => a.ended !== null);
  if (!ends.length || !ends.every((a) => a.denials !== undefined)) return null;
  return ends.flatMap((a) => [...(a.denials ?? [])]);
};

/** What `skillsLoadedOf` reads of a task's view: its attempts, whether each ended, and the skills each loaded, where its end says. */
export type SkillsClock = { state: { attempts: ReadonlyArray<{ ended: unknown; skills?: readonly string[] }> } };

/**
 * Every skill a task's sessions loaded: each skill of each attempt that ended, in the order of the attempts, one per load — a skill loaded
 * twice is two; `[]` where every ended attempt loaded none. A session says a skill by its bare name, and each is answered as `given`,
 * the names the step's `skills:` gave its session, writes the skill of that bare name (`app:y` for a load of `y`), and as loaded where
 * the step gave none. Null, not measured, for a task with no view, with no attempt ended, or with an ended attempt whose end does not
 * say its skills (an older journal, a `lost` end, a harness that cannot say).
 * @param view The task's view, its attempts among it, or undefined where there is none.
 * @param given The skills the step's `skills:` gave its session, as written.
 */
export function skillsLoadedOf(view: SkillsClock | undefined, given: readonly string[]) {
  const ends = (view?.state.attempts ?? []).filter((a) => a.ended !== null && a.ended !== undefined);
  if (!ends.length || !ends.every((a) => a.skills !== undefined)) return null;
  const written = new Map(given.map((name) => [bareSkillOf(name), name]));
  return ends.flatMap((a) => (a.skills ?? []).map((skill) => written.get(skill) ?? skill));
}

/** What `filesTouchedOf` reads of a task's view: its attempts, whether each ended, and the files each touched, where its end says. */
export type FilesClock = { state: { attempts: ReadonlyArray<{ ended: unknown; files?: readonly string[] }> } };

/**
 * Every file a task's sessions read or wrote, each once, in the order first touched over its attempts that ended; `[]` where they touched
 * none. Null, not measured, where `skillsLoadedOf` would be: no view, no attempt ended, or an ended attempt whose end does not say its
 * files.
 * @param view The task's view, its attempts among it, or undefined where there is none.
 */
export function filesTouchedOf(view: FilesClock | undefined) {
  const ends = (view?.state.attempts ?? []).filter((a) => a.ended !== null && a.ended !== undefined);
  if (!ends.length || !ends.every((a) => a.files !== undefined)) return null;
  return [...new Set(ends.flatMap((a) => [...(a.files ?? [])]))];
}

/** One skill that declares the paths of its work (`applies:`), on one try: whether the try touched one of them. */
export type DueFact = { skill: string; touched: boolean };

/**
 * Each skill that declares paths (`applies`, by skill, `[]` for none declared), in the order declared, and whether a file the try touched
 * (`files`) is one of them (`appliesMatch`). Null where the try's files were not measured, so an unmeasured try is never counted as
 * untouched; a skill that declares no path gives none.
 * @param files The files the try touched, or null where they were not measured.
 * @param applies The globs each skill's `applies:` declares, by skill.
 */
export function skillsDueOf(files: readonly string[] | null, applies: ReadonlyMap<string, readonly string[]>) {
  if (files === null) return null;
  return [...applies]
    .filter(([, globs]) => globs.length)
    .map(([skill, globs]) => ({ skill, touched: files.some((f) => appliesMatch(f, globs)) }));
}

/** One rule of one skill on one try: whether a call the try was denied broke it, and each call that did, one per call (`by`). */
export type RuleFact = { skill: string; rule: string; says: string; broken: boolean; by: string[] };

/** One rule of one skill over a set of tries: how many of those whose denials were measured kept it, and how many broke it. */
export type RuleRow = { skill: string; rule: string; says: string; kept: number; broken: number };

/**
 * Each rule each skill declares (`declared`, by skill), kept or broken by the calls a try was denied, in the order declared. Null where the
 * try's denials were not measured (`denied` null), so an unmeasured try is never counted as kept; `[]` with no rule declared.
 * @param denied The calls the try was denied, or null where they were not measured.
 * @param declared The rules each skill declares, by skill.
 */
export function rulesOfTry(denied: readonly string[] | null, declared: ReadonlyMap<string, readonly SkillRule[]>) {
  if (denied === null) return null;
  return [...declared].flatMap(([skill, rules]) =>
    rules.map((r) => {
      const by = denied.filter((call) => disallowedBy(call, r.breaks) !== undefined);
      return { skill, rule: r.id, says: r.says, broken: by.length > 0, by };
    }),
  );
}

const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Each skill's rule over `tries` (`RuleRow`): most broken first, then by skill and rule. None where no try measured a rule.
 * @param tries The tries, each with the rules it kept or broke, null where none was measured.
 */
export function ruleRowsOf(tries: ReadonlyArray<{ rules: readonly RuleFact[] | null }>) {
  const rows = new Map<string, RuleRow>();
  for (const fact of tries.flatMap((t) => t.rules ?? [])) {
    const key = JSON.stringify([fact.skill, fact.rule]);
    const row = rows.get(key) ?? { skill: fact.skill, rule: fact.rule, says: fact.says, kept: 0, broken: 0 };
    rows.set(key, { ...row, kept: row.kept + (fact.broken ? 0 : 1), broken: row.broken + (fact.broken ? 1 : 0) });
  }
  return [...rows.values()].sort((a, b) => b.broken - a.broken || byName(a.skill, b.skill) || byName(a.rule, b.rule));
}

/**
 * One skill over a set of tries: its loads (`count`), the tries that loaded it at least once (`tries`), and, over the tries whose files
 * were measured, those that touched a path it declares (`touched`) and those of them that loaded it (`loadedWhenTouched`), each null where
 * it declares none on a measured try.
 */
export type SkillRow = { skill: string; count: number; tries: number; touched: number | null; loadedWhenTouched: number | null };

/**
 * Each skill `tries` loaded or were due to load (`SkillRow`): most loads first, then by name. A skill touched and never loaded has a row
 * of its own, with no load; one declared and neither touched nor loaded has none.
 * @param tries The tries, each with the skills it loaded and the skills it was due to load, each null where not measured.
 */
export function skillRowsOf(tries: ReadonlyArray<{ skills: readonly string[] | null; due: readonly DueFact[] | null }>) {
  const names = new Set([
    ...tries.flatMap((t) => t.skills ?? []),
    ...tries.flatMap((t) => (t.due ?? []).filter((d) => d.touched).map((d) => d.skill)),
  ]);
  return [...names]
    .map((skill) => {
      const loaded = (t: (typeof tries)[number]) => Boolean(t.skills?.includes(skill));
      const declared = tries.filter((t) => t.due?.some((d) => d.skill === skill));
      const touched = declared.filter((t) => t.due?.some((d) => d.skill === skill && d.touched));
      return {
        skill,
        count: tries.flatMap((t) => t.skills ?? []).filter((name) => name === skill).length,
        tries: tries.filter(loaded).length,
        touched: declared.length ? touched.length : null,
        loadedWhenTouched: declared.length ? touched.filter(loaded).length : null,
      };
    })
    .sort((a, b) => b.count - a.count || byName(a.skill, b.skill));
}
