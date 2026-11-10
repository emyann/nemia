/**
 * The builders the tables of `assess` and its neighbours share: a workflow's step, a run record, the engine's phases, and the check
 * that a line names its facts. A test file may not import another (it would run its tests there), so they live here.
 */
import assert from 'node:assert/strict';
import { listing as listed, type ListedPhase, type RepositoryRun, type Run, type TaskPhase } from '../src/run.ts';
import type { StepSpec } from '../src/workflow.ts';
import { feedPhase, feedWords, PHASE_OF, reasonOf } from '../src/feed/index.ts';
import type { AssessRead } from '../src/tick/assess.ts';
import type { ListingInput } from '../src/list/list.ts';
import type { Closeout } from '../src/closeout/closeout.ts';

/** A step of a workflow, waiting on `after`. */
export const step = (name: string, after: string[] = []): StepSpec => ({ name, after, body: `do ${name}` });

/** `implement → review`, the workflow most rows read. */
export const STEPS = [step('implement'), step('review', ['implement'])];

/** A run record whose steps are filed as `steps` says (a task id, or `null` for not yet filed), with `rest` over it. */
export const run = (steps: Record<string, string | null>, rest: Partial<RepositoryRun> = {}): RepositoryRun => ({
  id: 'r-1',
  repo: '/repo',
  workspace: '/wt',
  baseRef: 'abc123',
  branch: 'main',
  isolate: true,
  brief: 'add a flag',
  workflowDir: '/wf',
  createdAt: '2026-01-01T00:00:00Z',
  steps: Object.fromEntries(Object.entries(steps).map(([k, v]) => [k, { taskId: v }])),
  ...rest,
});

/**
 * The one read of a run `assess` and its readers take (`AssessRead`), as the tables build it: `steps` and `run`, with `partial` over the
 * readers `readersOf` (told.verb.ts) makes of an empty view — no task's phase known, no closeout, nothing asked, no session blocked,
 * nothing spent — and no asks, no standings and no checkout. Written out here rather than called, since this file is imported before a
 * test sets `WF_ROOT` and a verb's imports read it as they load; `test/one-read.test.ts` holds the two equal. Save each check's verdict,
 * left out (`undefined`) — and a reader given as `undefined` is left out: on an empty view `exitVerdicts` reads every check on the
 * record as `unfinished`, which no table means by leaving it out.
 */
export const aRead = (steps: readonly StepSpec[], r: Run, partial: Partial<Omit<AssessRead, 'steps' | 'run'>> = {}): AssessRead => ({
  steps,
  run: r,
  ...EMPTY_VIEW,
  asks: [],
  roundAsks: [],
  standings: [],
  checkout: undefined,
  ...given(partial),
});

/** `partial` with every key given as `undefined` left out, so a table's left-out reader is the default, as a positional one was. */
const given = <T extends object>(partial: T): Partial<T> =>
  Object.fromEntries(Object.entries(partial).filter(([, v]) => v !== undefined)) as Partial<T>;

/** What `readersOf` reads of a run off an empty view, every task unknown to it (`aRead`'s defaults). */
export const EMPTY_VIEW = {
  phaseOf: (): TaskPhase => 'unknown',
  signedOff: (): Closeout | undefined => undefined,
  asked: () => false as const,
  verdictOf: () => undefined,
  sessionBlocked: () => false,
  spendOf: () => undefined,
} satisfies Pick<AssessRead, 'phaseOf' | 'signedOff' | 'asked' | 'verdictOf' | 'sessionBlocked' | 'spendOf'>;

/** The engine's phase of each task id, `unknown` for one it does not hold. */
export const phases = (m: Record<string, TaskPhase>) => (id: string) => m[id] ?? 'unknown';

/**
 * That the code said something — a refusal, a line — and that it names each of `facts`: the command, flag or field its fix names,
 * and the ids, steps and counts the behaviour turns on. Never its sentence, whose words are nobody's to check.
 */
export const namesFor = (why: string, said: string | null | undefined, ...facts: string[]): void => {
  assert.equal(typeof said, 'string', `${why}: the code said nothing`);
  for (const fact of facts) assert.ok(said!.includes(fact), `${why}: ${JSON.stringify(said)} does not name ${JSON.stringify(fact)}`);
};

/** `namesFor`, where the test's title says why. */
export const names = (said: string | null | undefined, ...facts: string[]): void => namesFor('refused', said, ...facts);

/**
 * A run whose implement is on the try after the run's one sign-off nudge, spent: what `retriesDue` leaves an unsigned step to a person
 * on.
 */
export const signedOffOnce = (r: Run): Run => ({
  ...r,
  steps: { ...r.steps, implement: { ...r.steps.implement, tries: [{ taskId: 't0', cause: 'signoff' }] } },
});

/**
 * The engine's word as a step's standing reads it: a session that stopped to ask is still at work, and what is not settled runs. What the
 * tables' engine words come to as the one read's phase (`phaseOfView` reads the same off a view).
 */
export const settledWord =
  (phaseOf: (taskId: string) => string) =>
  (taskId: string): TaskPhase => {
    const word = phaseOf(taskId);
    if (word === 'input-required') return 'succeeded';
    return word === 'succeeded' || word === 'failed' || word === 'stopped' || word === 'unknown' ? word : 'running';
  };

/** What the tables hand a listing: its words, and the readers and asks its one read is built of (`listingInput`). */
export type ListedInput = Omit<ListingInput, 'read' | 'assessed'> &
  Partial<Omit<AssessRead, 'steps' | 'run' | 'phaseOf' | 'signedOff' | 'asked'>> & {
    readonly run: Run;
    readonly askedCloseout?: AssessRead['asked'];
  };

/**
 * A listing's input off a table's (`ListedInput`): its one read built by `aRead` from the engine's words (`settledWord`), the closeouts
 * read as the routing reads them (one nobody can read is none), and the session `needs-human` blocked, as `harnessBlocked` reads a view.
 */
export const listingInput = (input: ListedInput): ListingInput => {
  const { run: r, askedCloseout, verdictOf, asks, roundAsks, spendOf, standings, checkout, sessionBlocked, ...rest } = input;
  const signedOff = (name: string): Closeout | undefined => {
    const c = input.closeoutOf(name);
    return c && !('error' in c) ? c : undefined;
  };
  const read = aRead(input.steps, r, {
    phaseOf: settledWord(input.phaseOf),
    signedOff,
    ...(askedCloseout ? { asked: askedCloseout } : {}),
    ...(verdictOf ? { verdictOf } : {}),
    ...(asks ? { asks } : {}),
    ...(roundAsks ? { roundAsks } : {}),
    ...(spendOf ? { spendOf } : {}),
    ...(standings ? { standings } : {}),
    ...(checkout ? { checkout } : {}),
    sessionBlocked: sessionBlocked ?? ((taskId) => input.phaseOf(taskId) === 'needs-human'),
  });
  return { ...rest, read };
};

/** The engine's word as the feed keeps it (`feedPhase`), as the pass hands it to the listing it words for the feed (`wordFeed`). */
const fedWord = (word: ListedPhase): ListedPhase => (word === 'running' ? word : feedPhase(word));

/**
 * `listing`, holding each row's codes to the feed's word for it: a row's `reason` is the reason `reasonOf` reads off the word the feed
 * writes of the step (`feedWords`, over the listing the pass builds with the engine's words as the feed keeps them), and its `phase` the
 * phase of that reason (`PHASE_OF`). So a reason carried where the listing judges the step means what the feed's word meant before it was
 * carried, for every row the tables of `assess` list. The listing `nemia ls` prints is what it answers.
 */
export const listing = (input: ListedInput): ReturnType<typeof listed> => {
  const l = listed(listingInput(input));
  const fed = listed({ ...listingInput(input), phaseOf: (id) => fedWord(input.phaseOf(id)) });
  const words = feedWords(fed, input.run, { status: 'running' }, input.closeoutOf);
  fed.steps.forEach((row, i) => {
    const word = words.steps[i].word;
    assert.equal(
      row.reason,
      reasonOf({ word }, 'Step'),
      `${row.name}: the row's reason is the one the feed's word ${JSON.stringify(word)} names`,
    );
    assert.equal(l.steps[i].reason, row.reason, `${row.name}: the engine's live words come to the reason the feed's word does`);
    assert.equal(row.phase, PHASE_OF[row.reason], `${row.name}: its phase is its reason's`);
  });
  return l;
};
