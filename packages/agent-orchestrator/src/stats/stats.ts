/**
 * The flow numbers of a store's history, defined on each workflow's structure and never on a step's name: the rounds of each `loop:` step
 * to acceptance, the tries of the `workspace: main` step to a landing, what a landed run cost and how long it took, and every step's tries,
 * time, cost, check verdicts and gate waits, the calls its harness refused it, where the harness records them, the skills its sessions
 * loaded, where their ends say, and the skills whose paths they touched, and each rule its skills declare, kept or broken by those calls
 * (`discipline.ts`); each count the step declares over its closeouts (`tally:`, `tally.ts`), per step and day; and each landing check
 * that passed in more than half the deadline its task was filed with (`SlowLanding`), which asks for the deadline to be measured again.
 *
 * Pure: `factsOf` turns one run's timeline and record into facts, `statsOf` buckets them by UTC day and by one breakdown key, filters them
 * and totals them, with the changes to what the runs froze (`marksOf`, `marks.ts`), and `statsQueryOf` reads what a person asked.
 * `stats.verb.ts` reads the store and the engine and hands them here; `stats-words.ts` says the answer. A number with nothing measured
 * under it is `null`, never 0.
 */
import path from 'node:path';
import { Invalid } from '../refusal/refusal.ts';
import { isRepositoryRun, tryOf, type Run } from '../record/record.ts';
import type { Closeout } from '../closeout/index.ts';
import { endsOnBase, type Workflow } from '../step/step.ts';
import { DEFAULT_FACTORY } from '../factory/factory.ts';
import { askedAgain, landsOnCheck } from '../status/status.ts';
import { gateWaitOf, tryEndOf, type Timeline, type TimelineTry } from '../timeline/index.ts';
import { healthOf, type Health } from '../series/series.ts';
import { marksOf, type Mark, type RunFrozen } from './marks.ts';
import {
  deniesRecorded,
  ranAsJob,
  ruleRowsOf,
  rulesOfTry,
  skillRowsOf,
  skillsDueOf,
  type DueFact,
  type RuleFact,
  type RuleRow,
  type SkillRow,
} from './discipline.ts';
import type { SkillRule } from '../skills/skills.ts';
import { tallyIn, tallyRowsOf, type TallyFact, type TallyRow } from '../tally/tally.ts';

/** What a breakdown or a filter goes by: the step's agent, the step, the run's factory, its workflow's folder and its repository. */
export const BY_KEYS = ['agent', 'step', 'factory', 'workflow', 'repo'] as const;

/** One of `BY_KEYS`. */
export type ByKey = (typeof BY_KEYS)[number];

/**
 * What a person asks of the stats: the UTC days `from` and `to` (`YYYY-MM-DD`, both included; the first fact's day and today's by
 * default), the key the rows go by, and a value per key the facts must have.
 */
export type StatsQuery = { from?: string; to?: string; by?: ByKey } & Partial<Record<ByKey, string>>;

/** How a try's check ended: it passed, it refused the work (`refusedCheck`), or it did not finish. */
export type CheckVerdict = 'passed' | 'refused' | 'unfinished';

/** The values a run's facts have for the run's own keys: its factory, its workflow's folder, and its repository, null for a folder run. */
export type RunKeys = { run: string; factory: string; workflow: string; repo: string | null };

/**
 * One try of one step that ended, on the UTC day it ended: its check's end, or its session's where it has no check. `agent` is the
 * step's agent, null where it names none. `ranMs` is its session's and its check's run times, `checkMs` its check's alone, `costUsd`
 * what its session cost, `check` its check's verdict, null with no check, and `gateWaitMs` the wait for a person's approval of this try:
 * each null where not measured. A try that answered an earlier try's session is a fact of its own, ended when its turn did, with no run
 * time and no cost of its own, as a recheck's try has none: the session's are on the try that filed it.
 * `denied` names each call its session was refused, one per call; null for a try that ran no session of its own (a recheck's), on a step
 * whose harness records no denial (`deniesRecorded`), and for a session filed before steps ran as jobs (`ranAsJob`). `skills` names each
 * skill its session loaded, one per load, `[]` for none; null for a try with no session of its own, and for a session an end of which does
 * not say what it loaded (`skillsLoadedOf`). `due` holds each of the step's frozen skills that declares paths (`applies:`), and whether
 * a file the session read or wrote is one of them (`skillsDueOf`); null for a try with no session of its own, and where an end of it does
 * not say its files. `rules` holds each rule the step's frozen skills declare, kept or broken by `denied`
 * (`rulesOfTry`), `[]` with none declared; null where `denied` is. `tallies` holds each count the frozen step declares (`tally:`), valued
 * off its session's own closeout (`tallyIn`): `[]` with none declared, and each value null for a try with no session of its own or whose
 * closeout does not hold it. `landingDeadlineMs` is the deadline its check's task was filed with, where that check lands the run
 * (`landsOnCheck`); null for any other check, a try with none, and a task filed with no deadline.
 */
export type TryFact = RunKeys & {
  day: string;
  step: string;
  agent: string | null;
  try: number;
  ranMs: number | null;
  checkMs: number | null;
  costUsd: number | null;
  check: CheckVerdict | null;
  gateWaitMs: number | null;
  denied: string[] | null;
  skills: string[] | null;
  due: DueFact[] | null;
  rules: RuleFact[] | null;
  tallies: TallyFact[];
  landingDeadlineMs: number | null;
};

/**
 * One run that finished, on the UTC day its ending step's last task ended, or its last task, with no ending step. `rounds` holds, for each
 * `loop:` step whose loop ended accepted, how many rounds it ran. `landed` says whether its `workspace: main` step committed, and
 * `firstTry` whether it did so on its first try: null with no such step or where its record does not say, and `firstTry` null on a run
 * that did not land. `costUsd` is every
 * session's cost, null unless each was measured; `wallMs` its first filing to its last end. A run counts under every step and agent it has.
 */
export type RunFact = RunKeys & {
  day: string;
  steps: string[];
  agents: Array<string | null>;
  rounds: number[];
  landed: boolean | null;
  firstTry: boolean | null;
  costUsd: number | null;
  wallMs: number | null;
};

/** What a store's runs give: a fact per try that ended, one per run that finished, and what each run froze (`RunFrozen`, `marks.ts`). */
export type Facts = { tries: TryFact[]; runs: RunFact[]; frozen: RunFrozen[] };

/**
 * A run's timeline and record, and what `factsOf` reads beyond them: whether a task succeeded, each check's verdict, each step's
 * closeout, every call a session's task was refused, one per call, worded as a permission rule (`Bash(git push)`), and every skill it
 * loaded, one per load, null where an end of it does not say (`skillsLoadedOf`), and every file it touched, null where an end does not
 * say (`filesTouchedOf`); the rules each skill a step froze declares, by skill, and the paths each declares (`applies:`), by skill;
 * the closeout a task's current turn made, undefined where it made none that reads; and the deadline in seconds a task was filed with,
 * null where it was filed with none.
 */
export type RunRead = {
  run: Run;
  steps: readonly Workflow[];
  timeline: Timeline;
  succeeded: (taskId: string) => boolean;
  verdictOf: (checkTaskId: string) => CheckVerdict | null;
  closeoutOf: (step: string) => Closeout | undefined;
  deniedOf: (taskId: string) => string[];
  skillsOf: (taskId: string, given: readonly string[]) => string[] | null;
  filesOf: (taskId: string) => string[] | null;
  rulesOf: (step: Workflow) => ReadonlyMap<string, readonly SkillRule[]>;
  appliesOf: (step: Workflow) => ReadonlyMap<string, readonly string[]>;
  closeoutOfTask: (taskId: string) => Closeout | undefined;
  deadlineOf: (taskId: string) => number | null;
};

/** The UTC day of a time, `YYYY-MM-DD`. */
export const dayOf = (at: string): string => new Date(at).toISOString().slice(0, 10);

/** A sum of what is known, null where nothing is. */
const knownSum = (values: ReadonlyArray<number | null | undefined>): number | null => {
  const known = values.filter((v): v is number => typeof v === 'number');
  return known.length ? known.reduce((n, v) => n + v, 0) : null;
};

/** The keys a run's facts carry. */
export const keysOf = (run: Run): RunKeys => ({
  run: run.id,
  factory: run.factory ?? DEFAULT_FACTORY,
  workflow: path.basename(run.workflowDir),
  repo: run.repo ?? null,
});

/** The deadline in ms a try's check was filed with, where its step lands the run on that check (`landsOnCheck`); else null. */
function landingDeadlineOf(r: RunRead, step: Workflow, t: TimelineTry): number | null {
  if (!t.check || !isRepositoryRun(r.run) || !landsOnCheck(step, r.run)) return null;
  const seconds = r.deadlineOf(t.check.taskId);
  return seconds === null ? null : seconds * 1000;
}

/** A fact per try of `r`'s run that ended (`TryFact`). */
function tryFactsOf(r: RunRead): TryFact[] {
  const keys = keysOf(r.run);
  return r.steps.flatMap((step) =>
    (r.timeline.steps[step.name] ?? []).flatMap((t): TryFact[] => {
      const end = tryEndOf(t);
      if (!end) return [];
      const denied = t.session && deniesRecorded(step) && ranAsJob(t.session) ? r.deniedOf(t.session.taskId) : null;
      return [
        {
          ...keys,
          day: dayOf(end),
          step: step.name,
          agent: step.agent?.name ?? null,
          try: t.try,
          ranMs: knownSum([t.session?.ranMs, t.check?.ranMs]),
          checkMs: t.check?.ranMs ?? null,
          costUsd: t.used?.costUsd ?? null,
          check: t.check ? r.verdictOf(t.check.taskId) : null,
          gateWaitMs: gateWaitOf(r.run, r.timeline, step, t),
          denied,
          skills: t.session ? r.skillsOf(t.session.taskId, step.agent?.skills ?? []) : null,
          due: t.session ? skillsDueOf(r.filesOf(t.session.taskId), r.appliesOf(step)) : null,
          rules: rulesOfTry(denied, r.rulesOf(step)),
          tallies: (step.tally ?? []).map((tally) => ({
            tally,
            value: t.session ? tallyIn(tally, r.closeoutOfTask(t.session.taskId)?.output) : null,
          })),
          landingDeadlineMs: landingDeadlineOf(r, step, t),
        },
      ];
    }),
  );
}

/** For each `loop:` step whose loop ended accepted — its closeout said `again: false`, or a person accepted it — the rounds it ran. */
const roundsOf = (r: RunRead): number[] =>
  r.steps
    .filter((s) => s.loop)
    .filter(
      (s) =>
        r.closeoutOf(s.name)?.output?.again === false ||
        Boolean(r.run.acceptances?.some((a) => a.step === s.name && a.try === tryOf(r.run, s.name))),
    )
    .map((s) => r.timeline.rounds.filter((round) => round.loop === s.name).length)
    .filter((n) => n > 0);

/** Every session's cost together, null unless each session of the run was measured. */
function runCostOf(t: Timeline): number | null {
  const sessions = Object.values(t.steps)
    .flat()
    .filter((one) => one.session);
  const costs = sessions.map((one) => one.used?.costUsd);
  return sessions.length && costs.every((c) => typeof c === 'number') ? knownSum(costs) : null;
}

/**
 * Whether a step's current try ended as work that is done: its session succeeded and did not sign off blocked nor, looping, ask for another
 * round nobody accepted (`askedAgain`), and its check, where the step has one, passed.
 */
function doneStep(r: RunRead, step: Workflow): boolean {
  const record = r.run.steps[step.name];
  if (!record?.taskId || !r.succeeded(record.taskId) || r.closeoutOf(step.name)?.outcome === 'blocked') return false;
  if (askedAgain(step, r.run, r.closeoutOf)) return false;
  return record.check ? r.verdictOf(record.check.taskId) === 'passed' : step.check === undefined;
}

/**
 * Whether a run is finished, and the time it finished: its ending's last try's end once the record says how the ending landed. Else, once
 * nothing is in flight, its last task's end when its ending's current try is done (`doneStep`) — an ending that commits in its own prose,
 * whose record never says — or, with no ending, when every step's is. Null for a run cancelled, a run whose ending lands on its check
 * (`landsOnCheck`) and has not landed, a run that waits on a person — a check refused, a session failed or blocked, a loop that asked for
 * another round nobody accepted — and a run still going.
 */
function finishedAt(r: RunRead, ending: Workflow | undefined): string | null {
  if (r.run.cancelledAt) return null;
  if (ending && (r.run.steps[ending.name]?.landed || landsOnCheck(ending, r.run))) {
    const last = r.timeline.steps[ending.name]?.at(-1);
    return r.run.steps[ending.name]?.landed && last ? tryEndOf(last) : null;
  }
  if (r.timeline.run.inFlight || !(ending ? [ending] : r.steps).every((s) => doneStep(r, s))) return null;
  return (
    Object.values(r.timeline.steps)
      .flat()
      .map(tryEndOf)
      .filter((at): at is string => at !== null)
      .sort()
      .at(-1) ?? null
  );
}

/** The fact of a finished run (`RunFact`); none for a run that has not finished. */
function runFactOf(r: RunRead): RunFact[] {
  const ending = r.steps.find((s) => endsOnBase(s));
  const at = finishedAt(r, ending);
  if (!at) return [];
  const how = ending && r.run.steps[ending.name]?.landed;
  const landed = how ? 'commit' in how : null;
  return [
    {
      ...keysOf(r.run),
      day: dayOf(at),
      steps: r.steps.map((s) => s.name),
      agents: [...new Set(r.steps.map((s) => s.agent?.name ?? null))],
      rounds: roundsOf(r),
      landed,
      firstTry: ending && landed ? tryOf(r.run, ending.name) === 1 : null,
      costUsd: runCostOf(r.timeline),
      wallMs: r.timeline.run.wallMs,
    },
  ];
}

/** What one run's timeline gives: a fact per try that ended, and the run's own once it finished. */
export const factsOf = (r: RunRead): Pick<Facts, 'tries' | 'runs'> => ({ tries: tryFactsOf(r), runs: runFactOf(r) });

/**
 * The headline numbers of a set of facts. `runs` counts the runs finished and `landed` those that landed, null where no run recorded
 * whether it landed. `rounds` is the mean rounds
 * to acceptance, `firstTry` the share of landed runs that landed on their first try, `costPerLanded` and `timePerLanded` the mean cost and
 * wall time of a landed run, over those measured. `tries` counts the tries, `refused` the checks that refused, and `gateWaitMs` is the mean
 * wait at a gate. `deniedPerTry` is the mean count of calls refused per try, over the tries whose harness records them, and `skillsPerTry`
 * the mean count of skills loaded per try, over the tries whose sessions' ends say. Each mean over nothing is null.
 */
export type Headline = {
  runs: number;
  landed: number | null;
  rounds: number | null;
  firstTry: number | null;
  costPerLanded: number | null;
  timePerLanded: number | null;
  tries: number;
  refused: number;
  gateWaitMs: number | null;
  deniedPerTry: number | null;
  skillsPerTry: number | null;
};

/**
 * One step's totals, for one agent: its tries, their known run time and their checks' (`checkMs`), what the measured ones cost
 * (`costTries` of them measured), their checks' verdicts, and the mean gate wait; and the calls refused it, `deniedCalls` over the
 * `deniedTries` tries measured (null with none), each call with its count (`denials`), most first, then by call; and the skills its
 * sessions loaded, `skillLoads` over the `skillTries` tries measured (null with none), each skill loaded or touched with its loads, its
 * tries and how often it was loaded when its paths were touched (`skills`, `skillRowsOf`), most loads first, then by name; and each rule
 * its skills declare, kept or broken over the tries whose denials were measured (`rules`, `ruleRowsOf`), empty with none declared or
 * measured.
 */
export type StepRow = {
  step: string;
  agent: string | null;
  tries: number;
  ranMs: number | null;
  checkMs: number | null;
  costUsd: number | null;
  costTries: number;
  checks: Record<CheckVerdict, number>;
  gateWaitMs: number | null;
  deniedCalls: number | null;
  deniedTries: number;
  denials: Array<{ call: string; count: number }>;
  skillLoads: number | null;
  skillTries: number;
  skills: SkillRow[];
  rules: RuleRow[];
};

/**
 * A landing check that passed in more than half the deadline its task was filed with: the try's run, day, step and number, its check's run
 * time, that deadline, and the share of it the check took.
 */
export type SlowLanding = RunKeys & { day: string; step: string; try: number; checkMs: number; deadlineMs: number; share: number };

/** Each try whose landing check passed in more than half its filed deadline (`SlowLanding`), in the order of the tries. */
export const slowLandingsOf = (tries: readonly TryFact[]): SlowLanding[] =>
  tries.flatMap(({ run, factory, workflow, repo, day, step, try: n, check, checkMs, landingDeadlineMs: deadlineMs }) =>
    check === 'passed' && checkMs !== null && deadlineMs !== null && checkMs > deadlineMs / 2
      ? [{ run, factory, workflow, repo, day, step, try: n, checkMs, deadlineMs, share: checkMs / deadlineMs }]
      : [],
  );

/** The last 14 days to today, and the 14 before them, each by its first and last day. */
export type Tiles = { last: Headline & { from: string; to: string }; before: Headline & { from: string; to: string } };

/**
 * The numbers of a set of facts: over all its days, on each day of the range, per step, and the tiles; the changes to what its runs
 * froze on the days of the range (`Mark`, `marks.ts`), sorted by day, run, kind and name; and a row per step and count it declares
 * (`TallyRow`, `tally.ts`), over the range and on each of its days, its sum null where no try of it was measured; and each landing check
 * of the range that passed in more than half its filed deadline (`SlowLanding`).
 */
export type Group = {
  total: Headline;
  days: Array<Headline & { day: string }>;
  steps: StepRow[];
  tiles: Tiles;
  marks: Mark[];
  tallies: TallyRow[];
  slowLandings: SlowLanding[];
};

/**
 * What `nemia stats` and `GET /api/stats` answer: the days asked for, the filters and the key, the numbers of every fact kept (`all`), and,
 * with a key, one group per value of it (`key`, null for a step with no agent or a run with no repository). `unreadable` names each run
 * left out because a journal of it does not read. `health` is the system's over the same days, off the series' hour lines (`Health`).
 */
export type Stats = {
  from: string | null;
  to: string;
  by: ByKey | null;
  filters: Partial<Record<ByKey, string>>;
  all: Group;
  groups: Array<Group & { key: string | null }>;
  unreadable: string[];
  health: Health;
};

const mean = (values: ReadonlyArray<number | null>): number | null => {
  const known = values.filter((v): v is number => v !== null);
  return known.length ? known.reduce((n, v) => n + v, 0) / known.length : null;
};

/** The headline numbers of a set of facts (`Headline`). */
export function headlineOf(f: Pick<Facts, 'tries' | 'runs'>): Headline {
  const landed = f.runs.filter((r) => r.landed === true);
  return {
    runs: f.runs.length,
    landed: f.runs.some((r) => r.landed !== null) ? landed.length : null,
    rounds: mean(f.runs.flatMap((r) => r.rounds)),
    firstTry: landed.length ? landed.filter((r) => r.firstTry === true).length / landed.length : null,
    costPerLanded: mean(landed.map((r) => r.costUsd)),
    timePerLanded: mean(landed.map((r) => r.wallMs)),
    tries: f.tries.length,
    refused: f.tries.filter((t) => t.check === 'refused').length,
    gateWaitMs: mean(f.tries.map((t) => t.gateWaitMs)),
    deniedPerTry: mean(f.tries.map((t) => t.denied?.length ?? null)),
    skillsPerTry: mean(f.tries.map((t) => t.skills?.length ?? null)),
  };
}

/** Each name given, with how many times it is given: most first, then by name. */
function countsOf(names: readonly string[]): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Each step's totals, per agent (`StepRow`), in the order of the tries: run by run, and a run's steps in its workflow's order. */
function stepRowsOf(tries: readonly TryFact[]): StepRow[] {
  const rows = new Map<string, TryFact[]>();
  for (const t of tries) {
    const key = JSON.stringify([t.step, t.agent]);
    rows.set(key, [...(rows.get(key) ?? []), t]);
  }
  return [...rows.values()].map((of) => ({
    step: of[0].step,
    agent: of[0].agent,
    tries: of.length,
    ranMs: knownSum(of.map((t) => t.ranMs)),
    checkMs: knownSum(of.map((t) => t.checkMs)),
    costUsd: knownSum(of.map((t) => t.costUsd)),
    costTries: of.filter((t) => t.costUsd !== null).length,
    checks: {
      passed: of.filter((t) => t.check === 'passed').length,
      refused: of.filter((t) => t.check === 'refused').length,
      unfinished: of.filter((t) => t.check === 'unfinished').length,
    },
    gateWaitMs: mean(of.map((t) => t.gateWaitMs)),
    deniedCalls: knownSum(of.map((t) => t.denied?.length)),
    deniedTries: of.filter((t) => t.denied !== null).length,
    denials: countsOf(of.flatMap((t) => t.denied ?? [])).map(({ name, count }) => ({ call: name, count })),
    skillLoads: knownSum(of.map((t) => t.skills?.length)),
    skillTries: of.filter((t) => t.skills !== null).length,
    skills: skillRowsOf(of),
    rules: ruleRowsOf(of),
  }));
}

const DAY_MS = 86_400_000;

/** The day `n` days after `day` (before it, for a negative `n`). */
export const dayPlus = (day: string, n: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** Every day from `from` to `to`, both included. */
function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to; day = dayPlus(day, 1)) days.push(day);
  return days;
}

/** The facts and marks a query keeps: its tries and runs, and the marks of what the runs froze (`marksOf`). */
type Kept = Pick<Facts, 'tries' | 'runs'> & { marks: Mark[] };

/** The facts and marks that fall between two days, both included. */
const within = (f: Kept, from: string, to: string): Kept => ({
  tries: f.tries.filter((t) => t.day >= from && t.day <= to),
  runs: f.runs.filter((r) => r.day >= from && r.day <= to),
  marks: f.marks.filter((m) => m.day >= from && m.day <= to),
});

/** The numbers of a set of facts and marks (`Group`): the tiles against `today`, the rest over the days from `from` to `to`. */
function groupOf(f: Kept, from: string | null, to: string, today: string): Group {
  const kept = within(f, from ?? '0000-00-00', to);
  const tile = (a: string, b: string) => ({ ...headlineOf(within(f, a, b)), from: a, to: b });
  return {
    total: headlineOf(kept),
    days: from ? daysBetween(from, to).map((day) => ({ day, ...headlineOf(within(kept, day, day)) })) : [],
    steps: stepRowsOf(kept.tries),
    tiles: { last: tile(dayPlus(today, -13), today), before: tile(dayPlus(today, -27), dayPlus(today, -14)) },
    marks: kept.marks,
    tallies: tallyRowsOf(kept.tries, from ? daysBetween(from, to) : []),
    slowLandings: slowLandingsOf(kept.tries),
  };
}

/** The values a try's or a run's fact, or a mark, has for a key: a run's or a mark's, for a step or an agent, every one it has. */
function valuesOf(fact: TryFact | RunFact | Mark, key: ByKey): Array<string | null> {
  if ('steps' in fact) return key === 'step' ? fact.steps : key === 'agent' ? fact.agents : [fact[key]];
  return [fact[key]];
}

/** The facts and marks that have `value` for `key`. */
const having = (f: Kept, key: ByKey, value: string | null): Kept => ({
  tries: f.tries.filter((t) => valuesOf(t, key).includes(value)),
  runs: f.runs.filter((r) => valuesOf(r, key).includes(value)),
  marks: f.marks.filter((m) => valuesOf(m, key).includes(value)),
});

/** The order of the groups: by key, the group with none last. */
const byKey = (a: string | null, b: string | null): number => (a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1);

/**
 * The stats of a store's facts for a query (`Stats`), as of `now`. The marks are found over every run that froze (`marksOf`), so a run
 * before `from`, or one another key's filter leaves out, is still compared with, though never a run of another factory; the facts and
 * marks are then filtered by each key the query gives a value,
 * then kept between its days: `from` defaults to the first fact's or mark's day, `to` to `now`'s. With `by`, one group per value of that
 * key, sorted by key (`byKey`); a step with no agent, and a run with no repository, are a group of their own (`key` null), last. The tiles
 * are always the last 14 days to `now`'s day and the 14 before. `healthOver` reads the system's health over the days answered: none
 * kept, unless handed.
 */
export function statsOf(
  facts: Facts,
  query: StatsQuery,
  now: Date,
  unreadable: readonly string[] = [],
  healthOver: (from: string | null, to: string) => Health = () => healthOf([]),
): Stats {
  const filters = Object.fromEntries(BY_KEYS.flatMap((k) => (query[k] === undefined ? [] : [[k, query[k]]]))) as Partial<
    Record<ByKey, string>
  >;
  const every: Kept = { tries: facts.tries, runs: facts.runs, marks: marksOf(facts.frozen) };
  const kept = Object.entries(filters).reduce((f, [k, v]) => having(f, k as ByKey, v ?? null), every);
  const today = now.toISOString().slice(0, 10);
  const to = query.to ?? today;
  const all = [...kept.tries, ...kept.runs, ...kept.marks];
  const from = query.from ?? all.map((x) => x.day).sort()[0] ?? null;
  const keys = query.by ? [...new Set(all.flatMap((x) => valuesOf(x, query.by!)))].sort(byKey) : [];
  return {
    from,
    to,
    by: query.by ?? null,
    filters,
    all: groupOf(kept, from, to, today),
    groups: keys.map((key) => ({ key, ...groupOf(having(kept, query.by!, key), from, to, today) })),
    unreadable: [...unreadable],
    health: healthOver(from, to),
  };
}

/** Whether `text` is a real UTC day, `YYYY-MM-DD`. */
const isDay = (text: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(text)) && dayOf(text) === text;

/** A key of what a person gives a query: the days, the key to go by, and a filter per key. */
export type QueryKey = 'from' | 'to' | 'by' | ByKey;

/**
 * A query off what a person gave, each value under the name its key has where they gave it (`nameOf`: `--by` on the command line, `by` on
 * the api). Refused with `Invalid`: a key to go by that is not one of `BY_KEYS`, a day that is not a real `YYYY-MM-DD`, a `from` after the
 * `to`, and an empty filter.
 */
export function statsQueryOf(given: Partial<Record<QueryKey, string>>, nameOf: (key: QueryKey) => string): StatsQuery {
  const by = given.by;
  if (by !== undefined && !(BY_KEYS as readonly string[]).includes(by))
    throw new Invalid({ message: `${nameOf('by')} takes one of ${BY_KEYS.join(', ')}, not ${JSON.stringify(by)}.` });
  for (const key of ['from', 'to'] as const) {
    const day = given[key];
    if (day !== undefined && !isDay(day))
      throw new Invalid({ message: `${nameOf(key)} takes a day as YYYY-MM-DD, in UTC, such as 2026-09-30 — not ${JSON.stringify(day)}.` });
  }
  if (given.from && given.to && given.from > given.to)
    throw new Invalid({ message: `${nameOf('from')} ${given.from} is after ${nameOf('to')} ${given.to}: give the earlier day first.` });
  for (const key of BY_KEYS)
    if (given[key] === '')
      throw new Invalid({ message: `${nameOf(key)} takes a value to keep, such as the name of a ${key}; it was given none.` });
  const query: StatsQuery = by === undefined ? {} : { by: by as ByKey };
  for (const key of ['from', 'to', ...BY_KEYS] as const) if (given[key] !== undefined) query[key] = given[key];
  return query;
}
