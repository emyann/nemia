/**
 * A run's decision as a test reads it: the read model `GET /api/runs/:runId/decision` serves (`decisionRead`), whose `decision` is
 * `objects`' `RunDecision` and whose `decided` is the package's whole reading of the run (`Decided`) — the facts the client's `nemia
 * decide` prints, and the run object and its sub-resources serve. A test asserts the facts; the lines a person reads of them are the
 * client's, held by `apps/cli/test/decide.test.ts`.
 */
import { decisionRead, type DecisionRead, type DecisionUnjudged } from '../src/decide/decision.verb.ts';
import type { Decided } from '../src/decide/decide.verb.ts';
import { runWith, type Env, type Place } from '../src/runner.ts';
import { placedIn, type Engine } from '../src/cli/flags.ts';
import { countsLine } from '../src/branches/branches.ts';
import type { TaskSpan } from '../src/timeline/timeline.ts';
import type { Stage } from './story.ts';

/**
 * What a read is made over: the place, which a test names (a stand-in's, or the git place in a boundary test), the store `env` names,
 * and the globs read in full.
 */
export type DecisionOver = { readonly place: Place; readonly env?: Env; readonly sensitive?: readonly string[] };

/** Run `id`'s decision, or why it is not judged, read over the engine `e` as the api reads it; a refusal (`Missing`) thrown as it is. */
export const decisionOrWhy = (e: Engine, id: string, over: DecisionOver): Promise<DecisionRead | DecisionUnjudged> =>
  runWith(e, placedIn(over.env ?? process.env, over.place, decisionRead(id, over.sensitive ? { sensitive: [...over.sensitive] } : {})));

/** Run `id`'s decision (`decisionOrWhy`), thrown as an `Error` in the read model's own words where it is not judged. */
export async function decisionOf(e: Engine, id: string, over: DecisionOver): Promise<DecisionRead> {
  const read = await decisionOrWhy(e, id, over);
  if ('unjudged' in read) throw new Error(read.saidBy('nemia decide'));
  return read;
}

/**
 * The package's whole reading of run `id` (`Decided`), off its decision: thrown where the decision read none (a run waiting, called
 * off).
 */
export async function decidedOf(e: Engine, id: string, over: DecisionOver): Promise<Decided> {
  const { decided, decision } = await decisionOf(e, id, over);
  if (decided === undefined) throw new Error(`${id}'s decision was read without its reading: ${JSON.stringify(decision)}`);
  return decided;
}

/**
 * Run `id`'s decision on a story's stage (`decisionOf`): over its board's engine, its place and its store, the globs `sensitive` names
 * read in full.
 */
export async function decisionOn(
  stage: Pick<Stage, 'runWith' | 'board'>,
  id: string,
  sensitive?: readonly string[],
): Promise<DecisionRead> {
  const read = await stage.runWith(stage.board().e, decisionRead(id, sensitive ? { sensitive: [...sensitive] } : {}));
  if ('unjudged' in read) throw new Error(read.saidBy('nemia decide'));
  return read;
}

/** The package's whole reading of run `id` on a story's stage (`decisionOn`), thrown where the decision read none. */
export async function decidedOn(stage: Pick<Stage, 'runWith' | 'board'>, id: string): Promise<Decided> {
  const { decided, decision } = await decisionOn(stage, id);
  if (decided === undefined) throw new Error(`${id}'s decision was read without its reading: ${JSON.stringify(decision)}`);
  return decided;
}

/** A task on the clock as a pin reads it: where it stands, when it was filed, spawned and ended, and its queue and run times in words. */
const spanOf = (s: TaskSpan | null) => s && [s.at, s.filedAt, s.spawnedAt, s.endedAt, s.queued, s.ran];

/** Each list of `decided`'s verdicts that names a step, by its name, and the run's outcome: what a run awaiting a person ended with. */
function verdictsOf(decided: Decided): Record<string, unknown> {
  const d = decided.decision;
  if (d.kind !== 'awaiting') return { kind: d.kind };
  const named = Object.entries(d).filter(([, v]) => Array.isArray(v) && v.length && v.every((x) => typeof x === 'string'));
  return { outcome: d.outcome, ...Object.fromEntries(named.filter(([k]) => k !== 'branches')) };
}

/**
 * What the reading says of the step `name`: its closeout (outcome, summary, needs, output) or why it does not read, its check (command,
 * verdict, whether it passed), what its session used and its cost line, each try on the clock (session and check), and, only where it has
 * one, what its harness waits for, what it was denied, what a person said to it, their answer, the retry that answers it and its gate.
 */
function stepOf(decided: Decided, used: Record<string, { used: string }>, name: string): Record<string, unknown> {
  const c = decided.closeouts[name];
  const check = decided.checks[name];
  const extras = {
    waitingOn: decided.waitingOn[name],
    denied: decided.denied[name],
    said: decided.said[name]?.length ? decided.said[name] : undefined,
    answer: decided.answers[name],
    answering: decided.answering[name],
    gate: decided.gates[name],
    accepted: decided.accepted[name],
  };
  return {
    closeout: c && ('error' in c ? c : [c.outcome, c.summary, c.needs ?? null, c.output ?? {}]),
    check: check ? [check.command, check.verdict, check.passed] : null,
    used: used[name]?.used ?? null,
    cost: decided.costs[name] ?? null,
    tries: (decided.timeline.steps[name] ?? []).map((t) => [t.try, spanOf(t.session), spanOf(t.check)]),
    ...Object.fromEntries(Object.entries(extras).filter(([, v]) => v !== undefined)),
  };
}

/**
 * A run's whole decision as facts, for a pin to compare whole as a screen once was: the decision itself where it is not one a person
 * makes, with what still runs, what its harness waits for and the tries and rounds the next tick files; else the verdicts, the tries
 * and rounds offered once more, what each branch read touched (its groups, the agent-facing and check-affecting files, or why it is
 * not known), the lesson, the files read in full, each step that has a closeout, a check or a task (`stepOf`), in the order the steps
 * run, the run's cost and time, each result branch's counts and the notes it added, where each branch stands, the collisions, and the
 * commands offered.
 */
export function decisionFacts(read: DecisionRead): Record<string, unknown> {
  const { decision: d, decided } = read;
  if (!('touched' in d) || decided === undefined)
    return {
      decision: d,
      ...(decided && {
        running: decided.decision,
        waitingOn: decided.waitingOn,
        retrying: decided.retrying.map((r) => [r.step, r.try, r.mode, r.by]),
        rounding: decided.rounding.map((r) => [r.step, r.target, r.round, r.by]),
      }),
    };
  const steps = decided.steps.map((x) => x.name).filter((n) => decided.closeouts[n] || decided.checks[n] || decided.run.steps[n]?.taskId);
  return {
    verdicts: verdictsOf(decided),
    offers: decided.offers,
    overBudget: d.overBudget,
    touched: d.touched.map((t) => [
      t.branch,
      'error' in t.radius
        ? t.radius.error
        : [t.radius.groups.map((g) => [g.name, g.files, g.added, g.removed, g.binary]), t.radius.agentFacing, t.radius.checkAffecting],
    ]),
    lesson: d.lesson.said,
    inFull: d.sensitive.map((b) => [b.branch, b.error ?? b.files.map((f) => [f.path, f.lines])]),
    steps: Object.fromEntries(steps.map((n) => [n, stepOf(decided, d.used, n)])),
    run: [d.cost, decided.timeline.run.queued, decided.timeline.run.ran, decided.timeline.run.wall],
    results: read.results.map((r) => [
      r.branch,
      'error' in r.radius ? r.radius.error : countsLine(r.radius),
      'error' in r.notes ? r.notes.error : r.notes.map((n) => n.file),
    ]),
    standings: d.standings.map((x) => x.said),
    collisions: d.collisions && [d.collisions.base.map((b) => b.said), d.collisions.said],
    commands: d.commands.map((c) => [c.label, c.command]),
  };
}
