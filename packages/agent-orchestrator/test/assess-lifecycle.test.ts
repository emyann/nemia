/**
 * What `assess`, `cancelPlan`, `inFlight`, `composeBrief`, `workspacePlan`, `cutName` and `handOffDue` make of a run's steps: the DAG
 * (what a pass files, what waits, what is blocked), what `nemia cancel` stops and whether a run is finished, what a run called off says,
 * what each step is told of the request and the work before it, where each step works and under what name, and which finished steps are
 * handed off. Pure: each row hands them the engine's view of each task and reads what they decide. The same walked on disk, a chain, a
 * diamond and a cancelled run, is told in `lifecycle.test.ts`; the order of a record's steps and a run's id are in
 * `src/record/record.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assess,
  cancelPlan,
  composeBrief,
  cutName,
  decision,
  feedWords,
  handOffDue,
  inFlight,
  LINE_NAME,
  retryable,
  stepStatus,
  workspacePlan,
  type RepositoryRun,
  type Run,
  type SpendOf,
  type StepStatus,
  type ListedPhase,
} from '../src/run.ts';
import { PRECEDENCE } from '../src/brief/index.ts';
import { declared } from '../place/memory/place.ts';
import type { Closeout } from '../src/closeout/closeout.ts';
import { admissionOf } from '../src/admission/index.ts';
import { TABLE } from '../src/command/commands.verb.ts';
import { waitsOnPerson } from '../src/retry/index.ts';
import type { Workflow } from '../src/workflow.ts';
import { listing, phases, run, signedOffOnce, step, STEPS } from './assessed.ts';

const CANCELLED = { cancelledAt: '2026-01-02T00:00:00Z' };
/** The engine's own phase words — `working`, `needs-human` — or the feed's `running`. */
const shown =
  (m: Record<string, ListedPhase>) =>
  (id: string): ListedPhase =>
    m[id] ?? 'unknown';
/** How each step signed off, by name. A step not named left no closeout. */
const signedOff = (m: Record<string, Closeout | { error: string }>) => (name: string) => m[name];
const said = (outcome: Closeout['outcome']): Closeout => ({
  outcome,
  summary: 'rewrote the parser\nand the three tests that pinned it',
  artifacts: [],
  needs: outcome === 'blocked' ? 'which flag name ships' : undefined,
});
const nothingShipped = () => false;
/** `implement` declares a check; `review` waits on it. */
const CHECKED: Workflow[] = [{ ...step('implement'), check: 'npm test' }, step('review', ['implement'])];
const signedDone = () => ({ outcome: 'done' as const, summary: 's', artifacts: [], needs: undefined });
/** Every task here was filed asking for a closeout — which is what the runner does. */
const asked = () => true;
/** `implement` filed and settled as the phases say; its check filed under `checkId`, if given. */
const withCheck = (checkId: string | null, extra: Partial<RepositoryRun> = {}) =>
  run(
    {},
    {
      steps: { implement: { taskId: 't1', ...(checkId ? { check: { taskId: checkId } } : {}) }, review: { taskId: null } },
      ...extra,
    },
  );
/**
 * What the engine measured of each task's sessions, by id — dollars on its ended attempts — and the tasks its harness ended at their
 * budget.
 */
const spends =
  (usd: Record<string, number>, budgetEnded: string[] = []): SpendOf =>
  (id) =>
    id in usd || budgetEnded.includes(id)
      ? { usd: usd[id] ?? 0, measured: id in usd ? 1 : 0, unmeasured: id in usd ? 0 : 1, budgetEnded: budgetEnded.includes(id) }
      : undefined;
const deniedSpend =
  (denied: Record<string, string[]>): SpendOf =>
  (id) =>
    id in denied ? { usd: 0, measured: 0, unmeasured: 0, budgetEnded: false, denied: denied[id] } : undefined;
/** implement signed off blocked, and review never filed: a failed run with nothing in flight that waits on a person. */
const blockedRun = (rest: Partial<RepositoryRun> = {}) => run({ implement: 't1', review: null }, rest);
const BLOCKED_SAID = signedOff({ implement: said('blocked') });
/** `step`'s brief in `r`, told the test place's words for reading the work (`say`). */
const placed = (s: Workflow, r: Run, steps: readonly Workflow[]): string =>
  composeBrief(
    s,
    r,
    steps,
    ...([undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined] as const),
    {
      say: declared.say,
    },
  );

test('assess of the DAG: what a pass files, what it blocks, and how the run stands', async (t) => {
  await t.test('a fresh run files only the step with nothing in front of it', () => {
    const a = assess(STEPS, run({ implement: null, review: null }), phases({}));
    assert.deepEqual(a.ready, ['implement']);
    assert.equal(a.status, 'running');
  });

  await t.test('the next step waits while the first one runs', () => {
    const a = assess(STEPS, run({ implement: 't1', review: null }), phases({ t1: 'running' }));
    assert.deepEqual(a.ready, []);
    assert.equal(a.status, 'running');
  });

  await t.test('the next step is filed when the first SUCCEEDS — not merely when it ends', () => {
    const a = assess(STEPS, run({ implement: 't1', review: null }), phases({ t1: 'succeeded' }));
    assert.deepEqual(a.ready, ['review']);
  });

  await t.test('a failed step blocks what waits on it, and says so rather than hanging', () => {
    const a = assess(STEPS, run({ implement: 't1', review: null }), phases({ t1: 'failed' }));
    assert.deepEqual(a.ready, []);
    assert.deepEqual(a.blocked, ['review']);
    assert.equal(a.status, 'failed');
  });

  await t.test('a stopped step blocks too — an operator stop is final, not a pause', () => {
    const a = assess(STEPS, run({ implement: 't1', review: null }), phases({ t1: 'stopped' }));
    assert.deepEqual(a.blocked, ['review']);
    assert.equal(a.status, 'failed');
  });

  await t.test('a run is finished when every step has succeeded', () => {
    const a = assess(STEPS, run({ implement: 't1', review: 't2' }), phases({ t1: 'succeeded', t2: 'succeeded' }));
    assert.deepEqual(a.ready, []);
    assert.equal(a.status, 'succeeded');
  });

  await t.test('independent steps are filed together — this is a DAG, not a queue', () => {
    const fan = [step('a'), step('b'), step('merge', ['a', 'b'])];
    const first = assess(fan, run({ a: null, b: null, merge: null }), phases({}));
    assert.deepEqual(first.ready.sort(), ['a', 'b']);

    const half = assess(fan, run({ a: 't1', b: 't2', merge: null }), phases({ t1: 'succeeded', t2: 'running' }));
    assert.deepEqual(half.ready, [], 'merge waits for BOTH');

    const done = assess(fan, run({ a: 't1', b: 't2', merge: null }), phases({ t1: 'succeeded', t2: 'succeeded' }));
    assert.deepEqual(done.ready, ['merge']);
  });

  await t.test('assessing twice in a row says the same thing — it is level-triggered', () => {
    const r = run({ implement: 't1', review: null });
    const p = phases({ t1: 'succeeded' });
    assert.deepEqual(assess(STEPS, r, p), assess(STEPS, r, p));
  });

  await t.test('a cancelled run files nothing, however ready the next step looked', () => {
    const live = run({ implement: 't1', review: null });
    assert.deepEqual(
      assess(STEPS, live, phases({ t1: 'succeeded' })).ready,
      ['review'],
      'without the cancel mark this assessment files review, and the next tick would start a step of a run somebody just stopped',
    );

    const a = assess(STEPS, run({ implement: 't1', review: null }, CANCELLED), phases({ t1: 'succeeded' }));
    assert.deepEqual(a.ready, []);
    assert.equal(a.status, 'cancelled');
  });

  await t.test('cancelled is a fact about the run, not a verdict on its steps', () => {
    const a = assess(STEPS, run({ implement: 't1', review: 't2' }, CANCELLED), phases({ t1: 'succeeded', t2: 'succeeded' }));
    assert.deepEqual(a.blocked, [], 'nothing is blocked: no step failed, the run was called off');
    assert.equal(a.status, 'cancelled', 'a run whose steps all succeeded before the cancel is still cancelled, not succeeded');
  });
});

test('cancelPlan and inFlight: what `nemia cancel` stops, and whether a run is finished', async (t) => {
  await t.test('cancelling stops what is in flight — both a running step and one still queued', () => {
    const queued = cancelPlan(STEPS, run({ implement: 't1', review: null }), phases({ t1: 'pending' }));
    assert.deepEqual(
      queued,
      { kind: 'cancel', stop: [{ name: 'implement', taskId: 't1' }] },
      'a filed task would be STARTED by the next tick, so it counts as in flight',
    );

    const working = cancelPlan(STEPS, run({ implement: 't1', review: 't2' }), phases({ t1: 'succeeded', t2: 'running' }));
    assert.deepEqual(working, { kind: 'cancel', stop: [{ name: 'review', taskId: 't2' }] }, 'the step that has ended is not asked to stop');
  });

  await t.test('a fan-out with two live siblings stops both', () => {
    const fan = [step('a'), step('b'), step('merge', ['a', 'b'])];
    const plan = cancelPlan(fan, run({ a: 't1', b: 't2', merge: null }), phases({ t1: 'running', t2: 'pending' }));
    assert.deepEqual(plan, {
      kind: 'cancel',
      stop: [
        { name: 'a', taskId: 't1' },
        { name: 'b', taskId: 't2' },
      ],
    });
  });

  await t.test('a sibling still working is stopped even though the run has already failed', () => {
    const fan = [step('a'), step('b'), step('merge', ['a', 'b'])];
    const r = run({ a: 't1', b: 't2', merge: null });
    const p = phases({ t1: 'failed', t2: 'running' });
    assert.equal(assess(fan, r, p).status, 'failed');
    assert.deepEqual(
      cancelPlan(fan, r, p),
      { kind: 'cancel', stop: [{ name: 'b', taskId: 't2' }] },
      'the run failed the moment a failed, but b is a session still burning, and stopping it is what the person cancelling came for',
    );
  });

  await t.test('cancelling a run with nothing in flight is normal, and still cancels it', () => {
    const plan = cancelPlan(STEPS, run({ implement: null, review: null }), phases({}));
    assert.deepEqual(
      plan,
      { kind: 'cancel', stop: [] },
      'filed but never ticked: no task to stop, and marking it is the whole point, or the next tick starts the first step',
    );
  });

  await t.test('cancelling a finished run is not an error, and does not relabel it', () => {
    const done = cancelPlan(STEPS, run({ implement: 't1', review: 't2' }), phases({ t1: 'succeeded', t2: 'succeeded' }));
    assert.deepEqual(
      done,
      { kind: 'finished', status: 'succeeded' },
      'stamping a succeeded run cancelled would make nemia ls lie about work that landed: it is already succeeded, and nothing is written',
    );

    const gone = cancelPlan(STEPS, run({ implement: 't1', review: null }), phases({ t1: 'failed' }));
    assert.deepEqual(gone, { kind: 'finished', status: 'failed' });
  });

  await t.test('a failed run with a step still READY is cancelled, not called finished', () => {
    const fan = [step('a'), step('b'), step('c', ['b'])];
    const r = run({ a: 't1', b: 't2', c: null });
    const p = phases({ t1: 'failed', t2: 'succeeded' });

    const a = assess(fan, r, p);
    assert.equal(a.status, 'failed');
    assert.deepEqual(a.ready, ['c'], 'the run is failed AND has work it would file');

    assert.deepEqual(
      cancelPlan(fan, r, p),
      { kind: 'cancel', stop: [] },
      'failed is not stopped moving: c waits only on b, which succeeded; called finished, no mark is written and the next tick files c',
    );
    assert.deepEqual(assess(fan, { ...r, cancelledAt: '2026-01-02T00:00:00Z' }, p).ready, [], 'and once marked, that step is never filed');
  });

  await t.test('cancelling a cancelled run says who got there first, rather than re-stamping it', () => {
    const plan = cancelPlan(STEPS, run({ implement: 't1', review: null }, CANCELLED), phases({ t1: 'stopped' }));
    assert.deepEqual(plan, { kind: 'already-cancelled', at: CANCELLED.cancelledAt, stop: [] });
  });

  await t.test('cancelling twice still stops what is still in flight — it is level-triggered', () => {
    const plan = cancelPlan(STEPS, run({ implement: 't1', review: null }, CANCELLED), phases({ t1: 'running' }));
    assert.deepEqual(
      plan,
      { kind: 'already-cancelled', at: CANCELLED.cancelledAt, stop: [{ name: 'implement', taskId: 't1' }] },
      'the engine stops a task on its next tick, so a second nemia cancel finds it running: asking again is how a person fixes one that slipped',
    );
  });

  await t.test('a step the engine cannot find is not reported as stopped', () => {
    assert.deepEqual(
      inFlight(run({ implement: 't1' }), phases({})),
      [],
      'an unknown task was filed and cannot be looked up: claiming to have stopped it would be a line nobody can check',
    );
  });

  await t.test('REFUSED to be finished: a run whose step signed off blocked waits on a person, so `nemia cancel` calls it off', () => {
    const p = phases({ t1: 'succeeded' });
    const blocked = (name: string) => (name === 'implement' ? said('blocked') : undefined);
    assert.equal(assess(STEPS, blockedRun(), p, blocked, asked).status, 'blocked');
    assert.deepEqual(
      listing({ steps: STEPS, run: blockedRun(), phaseOf: shown({ t1: 'succeeded' }), closeoutOf: BLOCKED_SAID, askedCloseout: asked })
        .waitingOnYou,
      ['implement'],
    );
    assert.deepEqual(
      cancelPlan(STEPS, blockedRun(), p, blocked, asked),
      { kind: 'cancel', stop: [] },
      'nothing is in flight, but the blocked step is asked of a person: calling the run off is how they set it aside and keep its record',
    );
  });

  await t.test(
    'REFUSED to be finished: a run waiting on a person in any status `nemia ls` says so of — unsigned, budget exhausted, denied, an unreadable closeout — is called off by `nemia cancel`',
    () => {
      const DENYING: Workflow[] = [{ ...step('implement'), denials: 'fail' }, step('review', ['implement'])];
      const cases: Array<[string, Workflow[], RepositoryRun, ReturnType<typeof signedOff>, SpendOf, StepStatus]> = [
        ['unsigned, its nudge spent', STEPS, signedOffOnce(blockedRun()) as RepositoryRun, signedOff({}), () => undefined, 'unsigned'],
        ['cut off at its budget', STEPS, blockedRun(), signedOff({ implement: said('done') }), spends({}, ['t1']), 'budget exhausted'],
        ['denied a call', DENYING, blockedRun(), signedOff({ implement: said('done') }), deniedSpend({ t1: ['Bash(x)'] }), 'denied'],
        [
          'a closeout that does not read, nudge spent',
          STEPS,
          signedOffOnce(blockedRun()) as RepositoryRun,
          signedOff({ implement: { error: 'outcome: not done or blocked' } }),
          () => undefined,
          'unsigned',
        ],
      ];
      for (const [why, steps, r, closeouts, spendOf, status] of cases) {
        const readable = (name: string) => {
          const c = closeouts(name);
          return c && !('error' in c) ? c : undefined;
        };
        const p = phases({ t1: 'succeeded' });
        assert.equal(stepStatus(steps[0], r, p, readable, asked, steps, spendOf), status, why);
        assert.deepEqual(
          listing({ steps, run: r, phaseOf: shown({ t1: 'succeeded' }), closeoutOf: closeouts, askedCloseout: asked, spendOf })
            .waitingOnYou,
          ['implement'],
          why,
        );
        assert.deepEqual(
          cancelPlan(steps, r, p, readable, asked, () => undefined, [], [], spendOf),
          { kind: 'cancel', stop: [] },
          `${why}: cancelPlan reads the closeout as the run's reader hands it, only a well-formed one`,
        );
      }
    },
  );

  await t.test(
    'a stopped step holds its run but waits on no one for admission: Nemia retries an unsigned step and a failed check unasked, and `nemia cancel` calls the run off',
    () => {
      const cases: Array<[StepStatus, Workflow[], RepositoryRun, Parameters<typeof phases>[0], (name: string) => Closeout | undefined]> = [
        ['unsigned', STEPS, signedOffOnce(blockedRun()) as RepositoryRun, { t1: 'succeeded' }, () => undefined],
        ['failed (check)', CHECKED, withCheck('c1'), { t1: 'succeeded', c1: 'failed' }, signedDone],
      ];
      for (const [status, steps, r, ended, closeoutOf] of cases) {
        const p = phases(ended);
        assert.equal(stepStatus(steps[0], r, p, closeoutOf, asked, steps), status);
        const waitOf = (_: string, name: string) =>
          waitsOnPerson(
            retryable(
              steps.find((s) => s.name === name)!,
              r,
              p,
              closeoutOf,
              asked,
              steps,
            ),
          );
        const admitted = (command: string) => admissionOf({ tool: 'Bash', input: { command }, cwd: '/' }, TABLE, waitOf);
        assert.equal(admitted('nemia retry r implement'), undefined, `${status}: a try of a stopped step is Nemia's to give`);
        assert.ok(admitted('nemia retry r implement --budget 5'), `${status}: a budget is the person's`);
        assert.deepEqual(cancelPlan(steps, r, p, closeoutOf, asked), { kind: 'cancel', stop: [] }, `${status}: the run is not finished`);
        const closeouts = (name: string) => (name === 'implement' ? closeoutOf(name) : undefined);
        assert.deepEqual(
          listing({ steps, run: r, phaseOf: shown(ended), closeoutOf: closeouts, askedCloseout: asked }).waitingOnYou,
          ['implement'],
          `${status}: nemia ls says it waits on you`,
        );
      }
    },
  );
});

test('what a run called off says: `nemia ls`, `nemia decide` and the feed', async (t) => {
  await t.test(
    'a blocked run called off waits on no one in `nemia ls`, `nemia decide` or the feed, and its steps say what they said',
    () => {
      const p = phases({ t1: 'succeeded' });
      const listed = (r: RepositoryRun) =>
        listing({ steps: STEPS, run: r, phaseOf: shown({ t1: 'succeeded' }), closeoutOf: BLOCKED_SAID, askedCloseout: asked });
      const called = blockedRun(CANCELLED);
      const l = listed(called);
      assert.deepEqual(l.waitingOnYou, []);
      assert.deepEqual(l.steps, listed(blockedRun()).steps, "the steps' words stand as they were");
      assert.deepEqual(
        decision(STEPS, called, p, nothingShipped, () => said('blocked'), asked),
        {
          kind: 'cancelled',
          at: CANCELLED.cancelledAt,
        },
      );
      const words = feedWords(
        l,
        called,
        assess(STEPS, called, p, () => said('blocked'), asked),
      );
      assert.deepEqual([words.run.word, words.run.note], ['cancelled', undefined], 'no `waiting on you:` note');
      assert.ok(
        feedWords(
          listed(blockedRun()),
          blockedRun(),
          assess(STEPS, blockedRun(), p, () => said('blocked'), asked),
        ).run.note,
      );
    },
  );
});

test('composeBrief: what a step is told of the request, the work before it and its workspace', async (t) => {
  await t.test('a step is told its own prose and the original request', () => {
    const brief = composeBrief(step('implement'), run({ implement: null }), STEPS);
    assert.match(brief, /do implement/);
    assert.match(brief, /add a flag/, 'the spec travels to every step');
  });

  await t.test('a later step is pointed at the workspace and the base ref, not at a transcript', () => {
    const brief = placed(step('review', ['implement']), run({ implement: 't1', review: null }), STEPS);
    assert.match(brief, /against the commit abc123 of the test place/, "it is told how to see what changed, in its place's words");
    assert.match(brief, /implement/, 'and who was here before it');
    assert.match(brief, /not an account of it/, 'and that it is judging the change, not a claim');
  });

  await t.test('the first step is told nothing about a workspace nobody has touched', () => {
    const brief = composeBrief(step('implement'), run({ implement: null, review: null }), STEPS);
    assert.doesNotMatch(brief, /Where to look/);
  });

  await t.test('a resumed step is told only its own prose — it already has the context', () => {
    const respond: Workflow = { name: 'respond', after: ['implement'], body: 'answer the review', resume: 'implement' };
    const brief = composeBrief(respond, run({ implement: 't1', respond: null }), [step('implement'), respond]);
    assert.ok(brief.startsWith(`${PRECEDENCE}\n\nanswer the review`), brief);
    assert.doesNotMatch(brief, /What was asked for/, 'it was there when the request came in');
    assert.doesNotMatch(brief, /Where to look/, 'it has been looking at this workspace all along');
    assert.match(
      brief,
      /When you are finished/,
      'every brief carries the closeout contract, resumed or not: it is how the run learns the step is finished',
    );
  });

  await t.test(
    "a fan-in step is told it is holding merged work, and the conflicts its place's merge left, with the place's words for seeing them",
    () => {
      const merge: Workflow = { name: 'integrate', after: ['a', 'b'], body: 'combine them' };
      const steps = [step('a'), step('b'), merge];
      const r = run({ a: 't1', b: 't2', integrate: null });
      const told = (conflicts: string[]) =>
        composeBrief(
          merge,
          r,
          steps,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          {
            conflicts,
            say: 'SAY-CONFLICTS shows them.',
          },
        );
      const brief = told(['src/a.ts', 'src/b.ts']);
      assert.match(brief, /work of a and b has been merged/);
      assert.match(
        brief,
        /The merge left conflicts, and they are yours to resolve — that is what a step waiting on several others is for:\n\n- src\/a\.ts\n- src\/b\.ts\n\nSAY-CONFLICTS shows them\./,
      );
      for (const clean of [told([]), composeBrief(merge, r, steps)]) {
        assert.match(clean, /work of a and b has been merged/);
        assert.doesNotMatch(clean, /conflict/i, 'a merge that left none is told of none');
      }
    },
  );

  await t.test(
    "a folder run is briefed on folders, never on git: a chain continues its parent's folder, a fork and a fan-in are told where the steps before them worked, and a new session is told what it left is still here",
    () => {
      const f = (name: string, after: string[] = [], rest: Partial<Workflow> = {}): Workflow => ({
        ...step(name, after),
        place: 'folder',
        ...rest,
      });
      const write = f('write');
      const review = f('review', ['write']);
      const a = f('a', ['write']);
      const b = f('b', ['write']);
      const join = f('join', ['a', 'b']);
      const loopTarget = f('draft');
      const looper = f('critic', ['draft'], { loop: 'draft' });
      const folder = (steps: Record<string, string | null>): Run => ({
        id: 'n-1',
        place: { kind: 'folder' },
        workspace: '/store/runs/n-1/work',
        brief: 'a note on tides',
        workflowDir: '/wf',
        createdAt: '2026-01-01T00:00:00Z',
        steps: Object.fromEntries(
          Object.entries(steps).map(([k, v]) => [k, { taskId: v, ...(v ? { workspace: `/store/runs/n-1/work/${k}` } : {}) }]),
        ),
      });
      const briefs = [
        composeBrief(write, folder({ write: null, review: null }), [write, review], undefined, '/store/runs/n-1/artifacts/write'),
        composeBrief(review, folder({ write: 't1', review: null }), [write, review], undefined, '/store/runs/n-1/artifacts/review'),
        composeBrief(
          a,
          folder({ write: 't1', a: null, b: null, join: null }),
          [write, a, b, join],
          undefined,
          '/store/runs/n-1/artifacts/a',
        ),
        composeBrief(
          join,
          folder({ write: 't1', a: 't2', b: 't3', join: null }),
          [write, a, b, join],
          undefined,
          '/store/runs/n-1/artifacts/join',
        ),
        composeBrief(
          write,
          folder({ write: 't1', review: null }),
          [write, review],
          undefined,
          '/store/runs/n-1/artifacts/write',
          undefined,
          {
            try: 2,
            by: 'ask',
            mode: 'fresh',
            resumed: false,
            status: 'blocked',
          },
        ),
        composeBrief(
          loopTarget,
          folder({ draft: 't1', critic: 't2' }),
          [loopTarget, looper],
          undefined,
          '/store/runs/n-1/artifacts/draft',
          undefined,
          undefined,
          { loop: 'critic', round: 2, rounds: 3, by: 'again', resumed: false },
        ),
      ];
      for (const brief of briefs) assert.doesNotMatch(brief, /\bgit\b|branch|commit|worktree|repositor/i, brief);
      assert.match(briefs[0], /This step works in a folder the run made for it/);
      assert.match(briefs[1], /This folder has already been worked in by: write\. Their work is on disk here\./);
      assert.match(
        briefs[2],
        /The steps before you worked in folders of their own, which this one is not\. What each left has been copied into this folder:\n\n- write: `given\/from\/write`/,
      );
      assert.match(briefs[3], /- a: `given\/from\/a`\n- b: `given\/from\/b`/);
      assert.doesNotMatch(briefs[3], /merged/);
      assert.match(briefs[4], /An earlier one worked on this step in this folder, and what it left is still here\./);
      assert.match(briefs[5], /your last one could not be continued\. What it left is in this folder\./);
      for (const brief of briefs) {
        assert.match(
          brief,
          /leave it in this\nfolder, and name it in `artifacts` by its path from the folder/,
          'one way to hand a file over, and it is inside the fence',
        );
        assert.match(brief, /the run\ncopies each such file out and keeps it, before it checks your work\./);
        assert.match(brief, /Write nowhere else\./);
        assert.doesNotMatch(
          brief,
          /\/store\/runs\/n-1\/artifacts\//,
          'the directory the run keeps is outside the fence, and a folder step runs in dontAsk (validateFolderMode): it is not named',
        );
        assert.doesNotMatch(brief, /by absolute path/);
        assert.doesNotMatch(
          brief,
          /\/store\//,
          "no path under the store is named to a fenced session, parents' folders and inputs included: it would be denied each with no prompt",
        );
      }

      const continued = (r: Run, from: string, to: string): Run => ({
        ...r,
        steps: { ...r.steps, [to]: { ...r.steps[to], workspace: r.steps[from].workspace } },
      });
      const again = [
        composeBrief(
          write,
          continued(folder({ write: 't1', review: 't2' }), 'write', 'review'),
          [write, review],
          undefined,
          '/store/runs/n-1/artifacts/write',
          undefined,
          { try: 2, by: 'ask', mode: 'fresh', resumed: false, status: 'blocked' },
        ),
        composeBrief(
          loopTarget,
          continued(folder({ draft: 't1', critic: 't2' }), 'draft', 'critic'),
          [loopTarget, looper],
          undefined,
          '/store/runs/n-1/artifacts/draft',
          undefined,
          undefined,
          { loop: 'critic', round: 2, rounds: 3, by: 'again', resumed: false },
        ),
      ];
      assert.match(
        again[0],
        /This folder has already been worked in by: review\. Their work is on disk here\./,
        "a root tried again after review ran works in its folder, review's being write's, and is told the later step worked here",
      );
      assert.match(
        again[1],
        /This folder has already been worked in by: critic\. Their work is on disk here\./,
        "a loop's target in its next round, critic's folder being draft's, is told the same",
      );
      for (const brief of again)
        assert.doesNotMatch(
          brief,
          /which this one is not|copied into this folder/,
          `never that its folder is not theirs, which would tell the writer to leave its own note alone:\n${brief}`,
        );
      const side = composeBrief(
        a,
        folder({ write: 't1', a: 't2', b: 't3', join: null }),
        [write, a, b, join],
        undefined,
        '/store/runs/n-1/artifacts/a',
        undefined,
        { try: 2, by: 'ask', mode: 'fresh', resumed: false, status: 'blocked' },
      );
      assert.match(
        side,
        /The steps before you worked in folders of their own, which this one is not\. What each left has been copied into this folder:\n\n- write: `given\/from\/write`\n\n/,
        "a fork's side tried again, beside a sibling in a folder of its own and the parent it did not continue, is told of the parent's copy",
      );
      assert.doesNotMatch(side, /already been worked in/, 'here is its own folder, and the rest are not');

      const solo = f('solo');
      const alone = composeBrief(solo, folder({ write: 't1', solo: null }), [write, solo], undefined, '/store/runs/n-1/artifacts/solo');
      assert.doesNotMatch(
        alone,
        /worked in|given\/from|Judge what is there/,
        `a folder step that declares no after is given nothing, whatever else has run: no folder no make copied, no work to judge:\n${alone}`,
      );
      assert.match(alone, /This step works in a folder the run made for it/);

      const withInputs = composeBrief(
        review,
        { ...folder({ write: 't1', review: null }), inputs: ['mock.png'] },
        [write, review],
        undefined,
        '/store/runs/n-1/artifacts/review',
        undefined,
        undefined,
        undefined,
        undefined,
        '/store/runs/n-1/inputs',
      );
      assert.match(
        withInputs,
        /\n## Files given with it\n\n[^\n]*: `mock\.png`, a picture\. They are copied into `given\/inputs` in this folder\./,
        'the inputs a person gave the run sit outside the fence too: the line names the copy in this folder',
      );
      assert.doesNotMatch(withInputs, /\/store\//, "the run's own inputs directory is outside the fence: it is not named");

      assert.match(
        composeBrief(
          join,
          run({ write: 't1', a: 't2', b: 't3', join: null }),
          [write, a, b, join].map((s) => ({ ...s, workspace: undefined })),
        ),
        /has been merged into this branch/,
        "the same shapes on a repository run still say git's words: the folder's are said only on a folder run",
      );
    },
  );
});

test('workspacePlan: where each step works', async (t) => {
  await t.test('a sequential chain stays in one workspace — the line of work continues', () => {
    const chain = [step('implement'), step('review', ['implement']), step('respond', ['review'])];
    assert.deepEqual(workspacePlan(chain, chain[0]), { kind: 'fork', from: null });
    assert.deepEqual(workspacePlan(chain, chain[1]), { kind: 'inherit', from: 'implement' });
    assert.deepEqual(workspacePlan(chain, chain[2]), { kind: 'inherit', from: 'review' });
  });

  await t.test('SIBLINGS FORK — two concurrent steps never share a directory', () => {
    const fan = [step('split'), step('a', ['split']), step('b', ['split']), step('c', ['split'])];
    for (const name of ['a', 'b', 'c']) {
      assert.deepEqual(
        workspacePlan(
          fan,
          fan.find((s) => s.name === name)!,
        ),
        { kind: 'fork', from: 'split' },
        'N agents never edit one worktree at the same time',
      );
    }
  });

  await t.test('a fan-in MERGES its predecessors — `after: a, b` means "and give me both"', () => {
    const fan = [step('a'), step('b'), step('c'), step('merge', ['a', 'b', 'c'])];
    assert.deepEqual(workspacePlan(fan, fan[3]), { kind: 'merge', from: 'a', also: ['b', 'c'] });
  });

  await t.test('the merge base is deterministic, whatever order `after` was written in', () => {
    const one = workspacePlan([step('x', ['b', 'a'])], step('x', ['b', 'a']));
    const two = workspacePlan([step('x', ['a', 'b'])], step('x', ['a', 'b']));
    assert.deepEqual(one, two);
  });

  await t.test('several roots each fork from the base — a run may start wide', () => {
    const wide = [step('a'), step('b')];
    assert.deepEqual(workspacePlan(wide, wide[0]), { kind: 'fork', from: null });
    assert.deepEqual(workspacePlan(wide, wide[1]), { kind: 'fork', from: null });
  });
});

test('cutName: the name a cut is made under', async (t) => {
  await t.test("a run's line of work is cut under the run's own name, not the step's that cut it", () => {
    const chain = [step('implement'), step('review', ['implement']), step('respond', ['review'])];
    assert.equal(cutName(chain, chain[0]), LINE_NAME, 'one worktree and one branch per card: `wf/<run>/run`, the card and no step');
    assert.equal(LINE_NAME, 'run');
  });

  await t.test('a fork beside the line, a fan-in and a second root each keep their own step name — each is a line of its own', () => {
    const fan = [step('split'), step('a', ['split']), step('b', ['split']), step('merge', ['a', 'b'])];
    assert.equal(cutName(fan, fan[0]), LINE_NAME, "split forks off the base: it is the run's own line");
    assert.equal(cutName(fan, fan[1]), 'a', 'a fork with a parent is cut beside the line and named for its step');
    assert.equal(cutName(fan, fan[2]), 'b');
    assert.equal(cutName(fan, fan[3]), 'merge', 'a fan-in merges into a cut of its own');

    const wide = [step('a'), step('b')];
    assert.equal(cutName(wide, wide[0]), LINE_NAME, "the first root is the run's line");
    assert.equal(cutName(wide, wide[1]), 'b', 'the second root is another line, and keeps its step name');
  });

  await t.test('the name of a cut is a function of the step set alone, whatever order the set is read in', () => {
    const chain = [step('implement'), step('review', ['implement'])];
    const other = [chain[1], chain[0]];
    assert.equal(cutName(other, chain[0]), LINE_NAME, "the workflow's order says which root is the line, and `review` is no root");
    assert.equal(cutName(other, chain[1]), 'review');
  });
});

test('handOffDue: which finished steps are handed off', async (t) => {
  await t.test('every finished step is handed off — failed and stopped too — and none after its check is filed', () => {
    const r = run(
      {},
      {
        steps: {
          ok: { taskId: 't1', workspace: '/w1' },
          broke: { taskId: 't2', workspace: '/w2' },
          halted: { taskId: 't3', workspace: '/w3' },
          live: { taskId: 't4', workspace: '/w4' },
          judged: { taskId: 't5', workspace: '/w5', check: { taskId: 'c5' } },
          unfiled: { taskId: null },
        },
      },
    );
    const p = phases({ t1: 'succeeded', t2: 'failed', t3: 'stopped', t4: 'running', t5: 'succeeded', c5: 'running' });
    const independent = ['ok', 'broke', 'halted', 'live', 'judged', 'unfiled'].map((name) => step(name));
    assert.deepEqual(handOffDue(independent, r, p), ['ok', 'broke', 'halted']);
  });

  await t.test("a step is no longer handed off once a later step works in its workspace — what is there is that step's", () => {
    const chain: Workflow[] = [step('implement'), { ...step('review', ['implement']), check: 'npm test' }];
    const withReview = (review: Run['steps'][string]) => run({}, { steps: { implement: { taskId: 't1', workspace: '/w' }, review } });

    assert.deepEqual(handOffDue(chain, withReview({ taskId: null }), phases({ t1: 'succeeded' })), ['implement'], 'nothing after it yet');
    assert.deepEqual(
      handOffDue(chain, withReview({ taskId: 't2', workspace: '/w' }), phases({ t1: 'succeeded', t2: 'running' })),
      [],
      "review is working there: its work in progress is not implement's to commit",
    );
    assert.deepEqual(
      handOffDue(
        chain,
        withReview({ taskId: 't2', workspace: '/w', check: { taskId: 'c2' } }),
        phases({ t1: 'succeeded', t2: 'succeeded', c2: 'running' }),
      ),
      [],
      "review's check is running there: what the suite leaves is nobody's to commit",
    );
    assert.deepEqual(
      handOffDue(chain, withReview({ taskId: 't2', workspace: '/wt/review' }), phases({ t1: 'succeeded', t2: 'running' })),
      ['implement'],
      'a follower in a worktree of its own takes nothing from this one',
    );
  });

  await t.test(
    'REFUSED at shipped defaults: a step is handed off once for each try — what a person leaves in its workspace afterwards is not committed under its name',
    () => {
      const chain: Workflow[] = [step('review'), { ...step('ship', ['review']), workspace: 'main', gate: true }];
      const p = phases({ t1: 'succeeded', t2: 'succeeded', t9: 'failed' });
      const at = (review: Run['steps'][string]) => run({}, { steps: { review, ship: { taskId: 't9', workspace: '/repo' } } });
      assert.deepEqual(handOffDue(chain, at({ taskId: 't1', workspace: '/w' }), p), ['review'], 'not yet handed off: due');
      assert.deepEqual(
        handOffDue(chain, at({ taskId: 't1', workspace: '/w', handedOff: 't1' }), p),
        [],
        "handed off for this try: never again, or with its ending in another checkout every pass commits a person's edits as review's",
      );
      assert.deepEqual(
        handOffDue(chain, at({ taskId: 't2', workspace: '/w', handedOff: 't1' }), p),
        ['review'],
        'a new try is handed off anew',
      );
    },
  );
});
