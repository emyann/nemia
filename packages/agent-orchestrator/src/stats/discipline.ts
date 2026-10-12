/**
 * The calls a try was refused, as the stats count them: which steps' tries are measured at all (`deniesRecorded`), which sessions ran as
 * jobs that record them (`ranAsJob`), and every call each ended attempt of a session was denied, one per call (`deniedCallsOf`); the feed
 * reads those and a running attempt's so far (`deniedSoFarOf`). And the skills a try loaded: every skill each ended attempt of a session
 * loaded, one per load, where each ended attempt says (`skillsLoadedOf`).
 * And the skills a try was due to load: those whose `applies:` names a file its sessions read or wrote (`filesTouchedOf`, `skillsDueOf`).
 * And the rules those skills declare (`SkillRule`): on each try whose denials were measured, a rule is broken when a call the try was
 * denied matches one of its `breaks`, as a `disallowedTools:` rule matches a call (`disallowedBy`), and kept otherwise — "no refused call
 * matched", not "followed" (`rulesOfTry`, `ruleRowsOf`). Pure: `stats.verb.ts` hands the views and each step's frozen skills' rules here,
 * and words each call with the runtime's `denialText`.
 */
import { DEFAULT_HARNESS } from '../harness/harness.ts';
import { bareSkillOf, disallowedBy } from '../keys/index.ts';
import { appliesMatch, type SkillRule } from '../skills/skills.ts';
import type { Workflow } from '../step/step.ts';
import type { TaskSpan } from '../timeline/index.ts';

/** The harnesses whose sessions say what they were denied: a job, `claude -p`, on either. */
const RECORDING = ['claude', 'claude-detached'];

/**
 * Whether a step's sessions record what they were denied, read off its frozen `harness:` (`DEFAULT_HARNESS` where it names none) and
 * `background:`: true on `claude` and `claude-detached`. False on `codex`, whose sandbox refuses a call nowhere the run reads, on a remote
 * agent (`a2a:<name>`), which reports none, and beside `background: true`, whose `claude --bg` session records none — the same harnesses
 * `denialsOf` refuses `denials: fail` on.
 */
export const deniesRecorded = (step: Pick<Workflow, 'harness' | 'background'>): boolean =>
  RECORDING.includes(step.harness ?? DEFAULT_HARNESS) && step.background !== true;

/**
 * The moment a `claude` step's sessions began to run as jobs (`claude -p`), which record what they were denied: a session filed before it
 * ran as a background session (`claude --bg`), which records none, and its journal says nothing that tells the two apart.
 */
export const JOBS_SINCE = '2026-09-23T19:04:31.000Z';

/**
 * Whether a session ran as a job that records its denials: filed at `JOBS_SINCE` or after, read off its filing, else its first spawn.
 * False for a session filed before, and for one whose filing and spawn are both unknown.
 */
export const ranAsJob = (session: Pick<TaskSpan, 'filedAt' | 'spawnedAt'>): boolean => {
  const since = session.filedAt ?? session.spawnedAt;
  return since !== null && Date.parse(since) >= Date.parse(JOBS_SINCE);
};

/** What `deniedCallsOf` and `deniedSoFarOf` read of a task's view: its attempts, whether each ended, and what each was denied. */
export type DeniedClock<D> = { state: { attempts: ReadonlyArray<{ ended: unknown; denials?: readonly D[] }> } };

/**
 * Every call a task's sessions were denied: each denial of each attempt that ended, in the order of the attempts, one per call — a call
 * denied twice is two. Empty for a task with no view, and for one denied nothing.
 */
export const deniedCallsOf = <D>(view: DeniedClock<D> | undefined): D[] =>
  (view?.state.attempts ?? []).flatMap((a) => (a.ended === null || a.ended === undefined ? [] : [...(a.denials ?? [])]));

/** What a task's sessions have been denied so far: `ended`, every call of its ended attempts; `running`, each distinct call of the rest. */
export type DeniedSoFar<D> = { ended: D[]; running: D[] };

/**
 * Every call a task's sessions have been denied so far, for its step's line in the feed: each denial of each attempt that ended, one per
 * call (`deniedCallsOf`), and apart, each distinct call of an attempt still running, once, by `key`, in the order first denied — a running
 * attempt's call is named as the harness reports it, and counted only once its attempt ends. Both empty for a task with no view, and for
 * one denied nothing.
 */
export const deniedSoFarOf = <D>(view: DeniedClock<D> | undefined, key: (d: D) => string): DeniedSoFar<D> => {
  const running = new Map<string, D>();
  for (const a of view?.state.attempts ?? [])
    if (a.ended === null || a.ended === undefined) for (const d of a.denials ?? []) if (!running.has(key(d))) running.set(key(d), d);
  return { ended: deniedCallsOf(view), running: [...running.values()] };
};

/** What `skillsLoadedOf` reads of a task's view: its attempts, whether each ended, and the skills each loaded, where its end says. */
export type SkillsClock = { state: { attempts: ReadonlyArray<{ ended: unknown; skills?: readonly string[] }> } };

/**
 * Every skill a task's sessions loaded: each skill of each attempt that ended, in the order of the attempts, one per load — a skill loaded
 * twice is two; `[]` where every ended attempt loaded none. A session says a skill by its bare name, and each is answered as `given`,
 * the names the step's `skills:` gave its session, writes the skill of that bare name (`app:y` for a load of `y`), and as loaded where
 * the step gave none. Null, not measured, for a task with no view, with no attempt ended, or with an ended attempt whose end does not
 * say its skills (an older journal, a `lost` end, a harness that cannot say).
 */
export function skillsLoadedOf(view: SkillsClock | undefined, given: readonly string[]): string[] | null {
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
 */
export function filesTouchedOf(view: FilesClock | undefined): string[] | null {
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
 */
export function skillsDueOf(files: readonly string[] | null, applies: ReadonlyMap<string, readonly string[]>): DueFact[] | null {
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

/**
 * One skill over a set of tries: its loads (`count`), the tries that loaded it at least once (`tries`), and, over the tries whose files
 * were measured, those that touched a path it declares (`touched`) and those of them that loaded it (`loadedWhenTouched`), each null where
 * it declares none on a measured try.
 */
export type SkillRow = { skill: string; count: number; tries: number; touched: number | null; loadedWhenTouched: number | null };

/**
 * Each skill `tries` loaded or were due to load (`SkillRow`): most loads first, then by name. A skill touched and never loaded has a row
 * of its own, with no load; one declared and neither touched nor loaded has none.
 */
export function skillRowsOf(tries: ReadonlyArray<{ skills: readonly string[] | null; due: readonly DueFact[] | null }>): SkillRow[] {
  const names = new Set([
    ...tries.flatMap((t) => t.skills ?? []),
    ...tries.flatMap((t) => (t.due ?? []).filter((d) => d.touched).map((d) => d.skill)),
  ]);
  return [...names]
    .map((skill): SkillRow => {
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
