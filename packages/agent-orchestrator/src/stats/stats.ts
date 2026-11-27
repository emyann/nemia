/**
 * The flow numbers of a store's history, defined on each workflow's structure and never on a step's name: the rounds of each `loop:` step
 * to acceptance, whether each run merged, what a merged run cost and how long it took, and every step's tries,
 * time, cost, check verdicts and gate waits, the calls its harness refused it, where the harness records them, the skills its sessions
 * loaded, where their ends say, and the skills whose paths they touched, and each rule its skills declare, kept or broken by those calls
 * (`discipline.ts`); each count the step declares over its closeouts (`tally:`, `tally.ts`), per step and day.
 *
 * Pure: `factsOf` turns one run's timeline and record into facts, `statsOf` buckets them by UTC day and by one breakdown key, filters them
 * and totals them, with the changes to what the runs froze (`marksOf`, `marks.ts`), and `statsQueryOf` reads what a person asked.
 * `stats.verb.ts` reads the store and the engine and hands them here; the client (`apps/cli`) says the answer. A number with nothing
 * measured under it is `null`, never 0.
 */
import { runNamespace } from '../run-list/index.ts';
import path from 'node:path';
import { Invalid } from '../refusal/refusal.ts';
import { checkTasksOf, tryOf, type Run } from '../record/record.ts';
import { medianOf, p90Of } from '../costs/index.ts';
import type { TryMemory } from '../out-of-memory/index.ts';
import type { Closeout } from '../closeout/index.ts';
import { hasChecks, type StepSpec } from '../step/step.ts';
import { askedAgain } from '../status/status.ts';
import { answeredRoute } from '../route/routed/index.ts';
import { conditionOf, nodeFate } from '../route/index.ts';
import { gateWaitOf, tryEndOf, type Timeline, type TimelineTry } from '../timeline/index.ts';
import { healthOf, type Health } from '../series/series.ts';
import { marksOf, type Mark, type RunFrozen } from './marks.ts';
import type { Selectors } from '../watch/selector.ts';
import {
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
const BY_KEYS = ['agent', 'step', 'factory', 'workflow', 'repo'] as const;

/** One of `BY_KEYS`. */
export type ByKey = (typeof BY_KEYS)[number];

/**
 * What a person asks of the stats: the UTC days `from` and `to` (`YYYY-MM-DD`, both included; the first fact's day and today's by
 * default), the key the rows go by, a value per key the facts must have, and `selectors` (`-l`, parsed), which keep the facts of the
 * runs whose labels one of them takes (`selectedRuns`), every run's where none is given.
 */
export type StatsQuery = { from?: string; to?: string; by?: ByKey; selectors?: Selectors } & Partial<Record<ByKey, string>>;

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
 * `denied` names each call its session was refused, one per call; null for a try that ran no session of its own (a recheck's), and for a
 * session an end of which does not say its denials (`deniedCallsOf`: a harness that cannot say, an older journal). `skills` names
 * each skill its session loaded, one per load, `[]` for none; null for a try with no session of its own, and for a session an end of which
 * does not say what it loaded (`skillsLoadedOf`). `due` holds each of the step's frozen skills that declares paths (`applies:`), and
 * whether a file the session read or wrote is one of them (`skillsDueOf`); null for a try with no session of its own, and where an end of
 * it does not say its files. `rules` holds each rule the step's frozen skills declare, kept or broken by `denied` (`rulesOfTry`), `[]` with
 * none declared; null where `denied` is. `tallies` holds each count the frozen step declares (`tally:`), valued off its session's own
 * closeout (`tallyIn`): `[]` with none declared, and each value null for a try with no session of its own or whose closeout does not hold
 * it.
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
  /** Each of its checks, by name: how long it ran, null while not ended, and its verdict; absent on a fact read before checks had names. */
  checks?: CheckFact[];
  /**
   * The pictures handed to the run its first try was filed with, and how many of them it was shown in its first message (the step's
   * `pictures` on the record): on a step's first try alone, null for any other try or a step handed none; absent on a fact read before.
   */
  pictures?: { handed: number; shown: number } | null;
  /**
   * What its session peaked at in memory and what admission counted it at (`TryMemory`, `tryMemoryOf`), its peak null where none was
   * measured; absent for a try with no session of its own (a recheck's, an answer's), whose session's are on the try that filed it.
   */
  memory?: TryMemory;
};

/** One check of a try (`TryFact.checks`): its name (`check` for a step's `check: <line>`), the ms it ran, and its verdict. */
export type CheckFact = { name: string; ms: number | null; verdict: CheckVerdict | null };

/**
 * One check of a step over the facts kept (`checkRowsOf`): its workflow, step and name, how many tries ran it to a verdict, the median and
 * p90 of the ms those ran (nearest rank, null where none was measured), and the share of them it refused.
 */
type CheckRow = {
  workflow: string;
  step: string;
  check: string;
  count: number;
  medianMs: number | null;
  p90Ms: number | null;
  refused: number;
};

/**
 * A row per check of each step the tries ran (`CheckRow`), in the order met: what a person reads of which check takes the time and
 * which refuses. A try's check with no verdict yet is not counted.
 * @param tries The facts of the tries, in their order.
 */
export function checkRowsOf(tries: readonly TryFact[]) {
  const rows = new Map<string, { workflow: string; step: string; check: string; of: CheckFact[] }>();
  for (const t of tries) {
    for (const c of t.checks ?? []) {
      if (c.verdict === null) continue;
      const key = JSON.stringify([t.workflow, t.step, c.name]);
      const row = rows.get(key) ?? { workflow: t.workflow, step: t.step, check: c.name, of: [] };
      row.of.push(c);
      rows.set(key, row);
    }
  }
  return [...rows.values()].map(({ of, ...row }) => {
    const ms = of.flatMap((c) => (c.ms === null ? [] : [c.ms]));
    return {
      ...row,
      count: of.length,
      medianMs: medianOf(ms),
      p90Ms: p90Of(ms),
      refused: of.filter((c) => c.verdict === 'refused').length / of.length,
    } satisfies CheckRow;
  });
}

/**
 * The memory of one workflow step's sessions over the facts kept (`memoryRowsOf`): how many tries ran a session of their own, how many of
 * those had a peak measured, the median, p90 (nearest rank) and highest of those peaks in bytes, each null where none was, what the latest
 * of them was counted at by admission (`askedBytes`, null where it does not say), and how many peaked above what they were counted at
 * (`aboveAsked`). A read, never a setting: Nemia applies nothing from it.
 */
type MemoryRow = {
  workflow: string;
  step: string;
  tries: number;
  measured: number;
  medianBytes: number | null;
  p90Bytes: number | null;
  maxBytes: number | null;
  askedBytes: number | null;
  aboveAsked: number;
};

/**
 * A row per workflow step whose tries ran a session of their own (`MemoryRow`), in the order met: what a person reads to pick a step's
 * `memoryRequest:` from the peaks measured, and to see a step whose sessions pass what they ask as plainly as one asking far more.
 * @param tries The facts of the tries, in their order.
 */
export function memoryRowsOf(tries: readonly TryFact[]) {
  const rows = new Map<string, { workflow: string; step: string; of: TryMemory[] }>();
  for (const t of tries) {
    if (t.memory === undefined) continue;
    const key = JSON.stringify([t.workflow, t.step]);
    const row = rows.get(key) ?? { workflow: t.workflow, step: t.step, of: [] };
    row.of.push(t.memory);
    rows.set(key, row);
  }
  return [...rows.values()].map(({ of, ...row }) => {
    const peaks = of.flatMap((m) => (m.peak === null ? [] : [m.peak.peakBytes]));
    const asked = of.flatMap((m) => (m.askedBytes === null ? [] : [m.askedBytes]));
    return {
      ...row,
      tries: of.length,
      measured: peaks.length,
      medianBytes: medianOf(peaks),
      p90Bytes: p90Of(peaks),
      maxBytes: peaks.length ? Math.max(...peaks) : null,
      askedBytes: asked.at(-1) ?? null,
      aboveAsked: of.filter((m) => m.peak !== null && m.askedBytes !== null && m.peak.peakBytes > m.askedBytes).length,
    } satisfies MemoryRow;
  });
}

/** Each check of a try on the clock, by name (`TimelineTry.checks`, or its one check as `check`), as its fact holds it (`CheckFact`). */
const checkFactsOf = (r: RunRead, t: TimelineTry) =>
  (t.checks ?? (t.check ? [{ name: 'check', span: t.check }] : [])).map(
    ({ name, span }) => ({ name, ms: span.ranMs, verdict: r.verdictOf(span.taskId) }) satisfies CheckFact,
  );

/**
 * One run that finished, on the UTC day its last task ended. `rounds` holds, for each
 * `loop:` step whose loop ended accepted, how many rounds it ran. `merged` says whether every result branch of the run is on its base, as
 * the tick's last reading of where the branches stand says (`standing.json`): null for a run with no result branch, or where that reading
 * does not say. `costUsd` is every
 * session's cost, null unless each was measured; `wallMs` its first filing to its last end. A run counts under every step and agent it has.
 */
export type RunFact = RunKeys & {
  day: string;
  steps: string[];
  agents: Array<string | null>;
  rounds: number[];
  merged: boolean | null;
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
  steps: readonly StepSpec[];
  timeline: Timeline;
  succeeded: (taskId: string) => boolean;
  verdictOf: (checkTaskId: string) => CheckVerdict | null;
  closeoutOf: (step: string) => Closeout | undefined;
  deniedOf: (taskId: string) => string[] | null;
  skillsOf: (taskId: string, given: readonly string[]) => string[] | null;
  filesOf: (taskId: string) => string[] | null;
  rulesOf: (step: StepSpec) => ReadonlyMap<string, readonly SkillRule[]>;
  appliesOf: (step: StepSpec) => ReadonlyMap<string, readonly string[]>;
  closeoutOfTask: (taskId: string) => Closeout | undefined;
  memoryOf: (taskId: string) => TryMemory;
  merged: boolean | null;
};

/**
 * The UTC day of a time, `YYYY-MM-DD`.
 * @param at A time, as `Date` reads it.
 */
export const dayOf = (at: string) => new Date(at).toISOString().slice(0, 10);

/** A sum of what is known, null where nothing is. */
const knownSum = (values: ReadonlyArray<number | null | undefined>) => {
  const known = values.filter((v): v is number => typeof v === 'number');
  return known.length ? known.reduce((n, v) => n + v, 0) : null;
};

/**
 * The keys a run's facts carry.
 * @param run The run's record.
 */
export const keysOf = (run: Run) => ({
  run: run.id,
  factory: runNamespace(run.factory),
  workflow: path.basename(run.workflowDir),
  repo: run.repo ?? null,
});

/** A try's session's memory (`TryFact.memory`), on a try that ran a session of its own; nothing on a recheck's or an answer's. */
const ownMemoryOf = (r: RunRead, t: TimelineTry) => (t.session && t.turn === undefined ? { memory: r.memoryOf(t.session.taskId) } : {});

/** A fact per try of `r`'s run that ended (`TryFact`). */
function tryFactsOf(r: RunRead) {
  const keys = keysOf(r.run);
  return r.steps.flatMap((step) =>
    (r.timeline.steps[step.name] ?? []).flatMap((t) => {
      const end = tryEndOf(t);
      if (!end) return [];
      const denied = t.session ? r.deniedOf(t.session.taskId) : null;
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
          checks: checkFactsOf(r, t),
          pictures: t.try === 1 ? picturesHanded(r.run.steps[step.name]?.pictures) : null,
          ...ownMemoryOf(r, t),
        },
      ];
    }),
  );
}

/** The pictures a step's record says its first filing was handed and shown, counted; null where it was handed none. */
const picturesHanded = (p: { readonly shown: readonly string[]; readonly held: readonly unknown[] } | undefined) =>
  p === undefined ? null : { handed: p.shown.length + p.held.length, shown: p.shown.length };

/** For each `loop:` step whose loop ended accepted — its closeout said `again: false`, or a person accepted it — the rounds it ran. */
const roundsOf = (r: RunRead) =>
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
function runCostOf(t: Timeline) {
  const sessions = Object.values(t.steps)
    .flat()
    .filter((one) => one.session);
  const costs = sessions.map((one) => one.used?.costUsd);
  return sessions.length && costs.every((c) => typeof c === 'number') ? knownSum(costs) : null;
}

/**
 * Whether a node never filed is skipped (`nodeFate`): off the route its condition took (`when:`), or every node it follows skipped, so
 * there is nothing of it to be done.
 */
// oxlint-disable-next-line landmines-types/no-explicit-return-types -- it is recursive through `doneStep`, whose type inference cannot give
function skippedNode(r: RunRead, step: StepSpec): boolean {
  const own = r.run.steps[step.name];
  if (own?.taskId || own?.sent !== undefined) return false;
  const wordOf = (name: string) => {
    const parent = r.steps.find((s) => s.name === name);
    if (parent === undefined) return 'pending' as const;
    if (skippedNode(r, parent)) return 'skipped' as const;
    return doneStep(r, parent) ? ('verified' as const) : ('pending' as const);
  };
  const condition = conditionOf(step, r.steps);
  const said = condition ? answeredRoute(condition, r.run, r.closeoutOf, wordOf, r.steps) : undefined;
  return nodeFate(step.when, said?.kind === 'route' ? said.route : undefined, step.after.map(wordOf)) === 'skipped';
}

/**
 * Whether a step's current try ended as work that is done: its session succeeded and did not sign off blocked nor, looping, ask for another
 * round nobody accepted (`askedAgain`), and its check, where the step has one, passed.
 */
// oxlint-disable-next-line landmines-types/no-explicit-return-types -- it is recursive through `skippedNode`, whose type cannot be inferred
function doneStep(r: RunRead, step: StepSpec): boolean {
  const record = r.run.steps[step.name];
  if (record?.sent !== undefined) return true;
  if (!record?.taskId) return skippedNode(r, step);
  if (!r.succeeded(record.taskId) || r.closeoutOf(step.name)?.outcome === 'blocked') return false;
  if (askedAgain(step, r.run, r.closeoutOf)) return false;
  return record.check ? checkTasksOf(record.check).every(([, id]) => r.verdictOf(id) === 'passed') : !hasChecks(step);
}

/**
 * Whether a run is finished, and the time it finished: once nothing is in flight, its last task's end when every step's current try is
 * done (`doneStep`). Null for a run cancelled, a run that waits on a person — a check refused, a session failed or blocked, a loop that
 * asked for another round nobody accepted — and a run still going.
 */
function finishedAt(r: RunRead) {
  if (r.run.cancelledAt) return null;
  if (r.timeline.run.inFlight || !r.steps.every((s) => doneStep(r, s))) return null;
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
function runFactOf(r: RunRead) {
  const at = finishedAt(r);
  if (!at) return [];
  return [
    {
      ...keysOf(r.run),
      day: dayOf(at),
      steps: r.steps.map((s) => s.name),
      agents: [...new Set(r.steps.map((s) => s.agent?.name ?? null))],
      rounds: roundsOf(r),
      merged: r.merged,
      costUsd: runCostOf(r.timeline),
      wallMs: r.timeline.run.wallMs,
    },
  ];
}

/**
 * What one run's timeline gives: a fact per try that ended, and the run's own once it finished.
 * @param r The run's record and its timeline, as read.
 */
export const factsOf = (r: RunRead) => ({ tries: tryFactsOf(r), runs: runFactOf(r) });

/**
 * The headline numbers of a set of facts. `runs` counts the runs finished and `merged` those that merged, null where no run recorded
 * whether it merged. `rounds` is the mean rounds
 * to acceptance, `costPerMerged` and `timePerMerged` the mean cost and
 * wall time of a merged run, over those measured. `tries` counts the tries, `refused` the checks that refused, and `gateWaitMs` is the mean
 * wait at a gate. `deniedPerTry` is the mean count of calls refused per try, over the tries whose harness records them, and `skillsPerTry`
 * the mean count of skills loaded per try, over the tries whose sessions' ends say. Each mean over nothing is null.
 */
type Headline = {
  runs: number;
  merged: number | null;
  rounds: number | null;
  costPerMerged: number | null;
  timePerMerged: number | null;
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
type StepRow = {
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
  /** The pictures its first tries were handed and shown in their first message, summed: null where none was handed. */
  pictures: { handed: number; shown: number } | null;
};

/** The last 14 days to today, and the 14 before them, each by its first and last day. */
type Tiles = { last: Headline & { from: string; to: string }; before: Headline & { from: string; to: string } };

/**
 * The numbers of a set of facts: over all its days, on each day of the range, per step, and the tiles; the changes to what its runs
 * froze on the days of the range (`Mark`, `marks.ts`), sorted by day, run, kind and name; and a row per step and count it declares
 * (`TallyRow`, `tally.ts`), over the range and on each of its days, its sum null where no try of it was measured.
 */
type Group = {
  total: Headline;
  days: Array<Headline & { day: string }>;
  steps: StepRow[];
  tiles: Tiles;
  marks: Mark[];
  tallies: TallyRow[];
  checks: CheckRow[];
  memory: MemoryRow[];
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

const mean = (values: ReadonlyArray<number | null>) => {
  const known = values.filter((v): v is number => v !== null);
  return known.length ? known.reduce((n, v) => n + v, 0) / known.length : null;
};

/**
 * The headline numbers of a set of facts (`Headline`).
 * @param f The facts of the tries and of the runs.
 */
export function headlineOf(f: Pick<Facts, 'tries' | 'runs'>) {
  const merged = f.runs.filter((r) => r.merged === true);
  return {
    runs: f.runs.length,
    merged: f.runs.some((r) => r.merged !== null) ? merged.length : null,
    rounds: mean(f.runs.flatMap((r) => r.rounds)),
    costPerMerged: mean(merged.map((r) => r.costUsd)),
    timePerMerged: mean(merged.map((r) => r.wallMs)),
    tries: f.tries.length,
    refused: f.tries.filter((t) => t.check === 'refused').length,
    gateWaitMs: mean(f.tries.map((t) => t.gateWaitMs)),
    deniedPerTry: mean(f.tries.map((t) => t.denied?.length ?? null)),
    skillsPerTry: mean(f.tries.map((t) => t.skills?.length ?? null)),
  };
}

/** Each name given, with how many times it is given: most first, then by name. */
function countsOf(names: readonly string[]) {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Each step's totals, per agent (`StepRow`), in the order of the tries: run by run, and a run's steps in its workflow's order. */
function stepRowsOf(tries: readonly TryFact[]) {
  const rows = new Map<string, [TryFact, ...TryFact[]]>();
  for (const t of tries) {
    const key = JSON.stringify([t.step, t.agent]);
    const was = rows.get(key);
    rows.set(key, was ? [...was, t] : [t]);
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
    pictures: picturesOf(of),
  }));
}

/** The pictures `of`'s tries were handed and shown, summed; null where none of them was handed one. */
function picturesOf(of: readonly TryFact[]) {
  const handed = of.flatMap((t) => (t.pictures ? [t.pictures] : []));
  const sum: StepRow['pictures'] = handed.length
    ? { handed: handed.reduce((n, p) => n + p.handed, 0), shown: handed.reduce((n, p) => n + p.shown, 0) }
    : null;
  return sum;
}

const DAY_MS = 86_400_000;

/**
 * The day `n` days after `day` (before it, for a negative `n`).
 * @param day A day, `YYYY-MM-DD`.
 * @param n How many days after it, negative for before.
 */
export const dayPlus = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** Every day from `from` to `to`, both included. */
function daysBetween(from: string, to: string) {
  const days: string[] = [];
  for (let day = from; day <= to; day = dayPlus(day, 1)) days.push(day);
  return days;
}

/** The facts and marks a query keeps: its tries and runs, and the marks of what the runs froze (`marksOf`). */
type Kept = Pick<Facts, 'tries' | 'runs'> & { marks: Mark[] };

/** The facts and marks that fall between two days, both included. */
const within = (f: Kept, from: string, to: string) => ({
  tries: f.tries.filter((t) => t.day >= from && t.day <= to),
  runs: f.runs.filter((r) => r.day >= from && r.day <= to),
  marks: f.marks.filter((m) => m.day >= from && m.day <= to),
});

/** The numbers of a set of facts and marks (`Group`): the tiles against `today`, the rest over the days from `from` to `to`. */
function groupOf(f: Kept, from: string | null, to: string, today: string) {
  const kept = within(f, from ?? '0000-00-00', to);
  const tile = (a: string, b: string) => ({ ...headlineOf(within(f, a, b)), from: a, to: b });
  return {
    total: headlineOf(kept),
    days: from ? daysBetween(from, to).map((day) => ({ day, ...headlineOf(within(kept, day, day)) })) : [],
    steps: stepRowsOf(kept.tries),
    tiles: { last: tile(dayPlus(today, -13), today), before: tile(dayPlus(today, -27), dayPlus(today, -14)) },
    marks: kept.marks,
    tallies: tallyRowsOf(kept.tries, from ? daysBetween(from, to) : []),
    checks: checkRowsOf(kept.tries),
    memory: memoryRowsOf(kept.tries),
  };
}

/** The values a try's or a run's fact, or a mark, has for a key: a run's or a mark's, for a step or an agent, every one it has. */
function valuesOf(fact: TryFact | RunFact | Mark, key: ByKey) {
  if ('steps' in fact) return key === 'step' ? fact.steps : key === 'agent' ? fact.agents : [fact[key]];
  return [fact[key]];
}

/** The facts and marks that have `value` for `key`. */
const having = (f: Kept, key: ByKey, value: string | null) => ({
  tries: f.tries.filter((t) => valuesOf(t, key).includes(value)),
  runs: f.runs.filter((r) => valuesOf(r, key).includes(value)),
  marks: f.marks.filter((m) => valuesOf(m, key).includes(value)),
});

/** The order of the groups: by key, the group with none last. */
const byKey = (a: string | null, b: string | null) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1);

/**
 * The stats of a store's facts for a query (`Stats`), as of `now`. The marks are found over every run that froze (`marksOf`), so a run
 * before `from`, or one another key's filter leaves out, is still compared with, though never a run of another factory; the facts and
 * marks are then filtered by each key the query gives a value,
 * then kept between its days: `from` defaults to the first fact's or mark's day, `to` to `now`'s. With `by`, one group per value of that
 * key, sorted by key (`byKey`); a step with no agent, and a run with no repository, are a group of their own (`key` null), last. The tiles
 * are always the last 14 days to `now`'s day and the 14 before. `healthOver` reads the system's health over the days answered: none
 * kept, unless handed. `taken` says the runs whose facts and marks are kept, of the query's selectors (`statsRun` reads them off the
 * runs' labels): every run's, unless handed — and a run left out is still compared with, as one another key leaves out.
 * @param facts The store's facts and marks.
 * @param query The keys filtered on, the key to go by, and the days kept.
 * @param now The time the stats are as of.
 * @param unreadable The runs left out because a journal of them does not read; none where not given.
 * @param healthOver The system's health over the days answered, from the first, null where there is none, to the last; none kept where not
 *   given.
 * @param taken Whether the run of that id is kept, of the query's selectors; every run where not given.
 */
export function statsOf(
  facts: Facts,
  query: StatsQuery,
  now: Date,
  unreadable: readonly string[] = [],
  healthOver: (from: string | null, to: string) => Health = () => healthOf([]),
  taken: (run: string) => boolean = () => true,
) {
  const filters = Object.fromEntries(BY_KEYS.flatMap((k) => (query[k] === undefined ? [] : [[k, query[k]]]))) as Partial<
    Record<ByKey, string>
  >;
  const of = <F extends { run: string }>(rows: readonly F[]) => rows.filter((row) => taken(row.run));
  const every: Kept = { tries: of(facts.tries), runs: of(facts.runs), marks: of(marksOf(facts.frozen)) };
  const kept = Object.entries(filters).reduce((f, [k, v]) => having(f, k as ByKey, v ?? null), every);
  const today = now.toISOString().slice(0, 10);
  const to = query.to ?? today;
  const all = [...kept.tries, ...kept.runs, ...kept.marks];
  const from = query.from ?? all.map((x) => x.day).sort()[0] ?? null;
  const by = query.by;
  const keys = by ? [...new Set(all.flatMap((x) => valuesOf(x, by)))].sort(byKey) : [];
  return {
    from,
    to,
    by: query.by ?? null,
    filters,
    all: groupOf(kept, from, to, today),
    groups: by ? keys.map((key) => ({ key, ...groupOf(having(kept, by, key), from, to, today) })) : [],
    unreadable: [...unreadable],
    health: healthOver(from, to),
  };
}

/** Whether `text` is a real UTC day, `YYYY-MM-DD`. */
const isDay = (text: string) => /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(text)) && dayOf(text) === text;

/** A key of what a person gives a query: the days, the key to go by, and a filter per key. */
export type QueryKey = 'from' | 'to' | 'by' | ByKey;

/**
 * A query off what a person gave, each value under the name its key has where they gave it (`nameOf`: `--by` on the command line, `by` on
 * the api). Refused with `Invalid`: a key to go by that is not one of `BY_KEYS`, a day that is not a real `YYYY-MM-DD`, a `from` after the
 * `to`, and an empty filter.
 * @param given What the person gave, by the query's key.
 * @param nameOf What the person calls a key, as a refusal names it.
 */
export function statsQueryOf(given: Partial<Record<QueryKey, string>>, nameOf: (key: QueryKey) => string) {
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
