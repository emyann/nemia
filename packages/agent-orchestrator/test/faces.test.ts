/**
 * Each verb's program beside its plain face, as one table: run through Effect with its services given, a program answers what its face
 * answers on the same store; a refusal is the program's typed failure, picked out by its tag (`Missing`, `Conflict`, `Invalid`), and
 * the face's rejection, exit code 2; anything else is a defect the program dies of, which no `Effect.catch` recovers, and the face
 * rethrows as it was thrown. The rows are the verbs: the tick, what a person asks of a run (`nemia retry`, `--round`, `nemia approve`,
 * `nemia say`, `nemia cancel`), the views' reads, `nemia decide` and `nemia start`. That a face is its program over the engine it is
 * handed is `runWith`'s own definition (`src/runtime-client.ts`); what each program says in its type is read by the typecheck where the
 * verb's tests are.
 *
 * Told on the stage (`story.ts`): the test place and the engine's stand-in, shared by the rows of the one test. The tick's rows come
 * first, as the pass reads the whole store and counts the runs on it; the start's last two last, as they take the store's write away.
 *
 * `WF_ROOT` is set before the runner is imported, which reads it as the module loads. `WF_VERIFY_REST=1` judges in full every run a pass
 * answers from its memo, and no cap is set on runs or sessions.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import type { Effect as EffectOf } from 'effect/Effect';
import { StopRefused } from 'agent-runtime';
import type { Engine, EngineService } from '../src/runtime-client.ts';
import type { Refusal } from '../src/refusal/refusal.ts';
import type { PlaceService } from '../src/place/place.store.ts';
import type { StoreRoot } from '../src/config/root.store.ts';
import type { BranchReader } from '../src/branches/branches.store.ts';
import type { RepositoryRun, Run, TaskPhase } from '../src/run.ts';
import type { EnginePhase } from '../src/views/views-words.ts';
import { scratch } from './scratch.ts';
import { TEAM_DEV } from './team.ts';
import { givenPlace } from './placed.ts';
import { staged, type Board } from './story.ts';

const ROOT = scratch('wf-faces-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const {
  Conflict,
  Missing,
  acceptRun,
  advanceRun,
  approveRun,
  cancelRun,
  decideRun,
  retryRun,
  roundRun,
  sayRun,
  startRun,
  stepsOf,
  tickRun,
  runWith: runEngine,
} = await import('../src/runner.ts');
const { isRepositoryRun } = await import('../src/run.ts');
const { cancelFile, readRun } = await import('../src/record/record.store.ts');
const { EngineService: Service, engineOf } = await import('../src/runtime-client.ts');
const { Invalid, isRefusal } = await import('../src/refusal/refusal.ts');
const { inputsDir, runsDir } = await import('../src/record/record.store.ts');
const { runStore } = await import('../src/record/files.store.ts');
const { freshRestMemo } = await import('../src/tick/tick.verb.ts');
const { PHASES } = await import('../src/meter/meter.ts');
const { main } = await import('../src/cli/main.ts');
const stage = staged({ runWith: runEngine, main, engineOf });
const { runWith, runPlaced } = stage;
/** `program` given the place of the test running now, and still to be run. */
const placed = <A, E, R>(program: EffectOf<A, E, R>) => givenPlace(() => stage.place().layer)(program);
/** `program` over the engine `e` given as the service, and the test's place: a program run as an edge runs it. */
const over = <A, E>(e: Engine, program: EffectOf<A, E, EngineService | PlaceService | StoreRoot>): Promise<A> =>
  Effect.runPromise(placed(program).pipe(Effect.provide(Service.layer(e))));

/** What `p` rejects with, or a failed test when it resolves. */
const rejection = (p: Promise<unknown>, what: string): Promise<unknown> =>
  p.then(
    () => assert.fail(`${what} resolved`),
    (x: unknown) => x,
  );
/** What `fn` threw, or a failure of the test when it returned. */
const thrown = (fn: () => unknown, what: string): unknown => {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return assert.fail(`${what} returned`);
};
/** `program` answered `'answered'`, or the message of its failure tagged `tag`. */
const recovered = <A>(e: Engine, program: EffectOf<A, Refusal, EngineService | PlaceService | StoreRoot>, tag: Refusal['_tag']) =>
  over(
    e,
    program.pipe(
      Effect.map(() => 'answered'),
      Effect.catchTag(tag, (r) => Effect.succeed(r.message)),
    ),
  );

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };
/** Why a person judged the loop's findings later work rather than this run's. */
const ENOUGH = 'the finding is a case no shipped team has: follow-up work, not this run.';
const asksDir = (id: string) => path.join(ROOT, 'runs', `${id}.asks`);

/** What the engine's own pass answers here: nothing admitted, nothing started, no view — every task is read off the stand-in. */
const QUIET = { tasks: 0, actions: [], running: {}, views: [] };
/** The stage's engine with a pass of its own that does nothing, and no tally: what a whole-store pass asks of the engine first. */
const ticking = (b: Board) => {
  const e = { ...b.e };
  Object.assign(e, { tick: () => Effect.succeed(QUIET), tallied: undefined });
  return e;
};

/** A repository with one commit, so `nemia start` has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stage.place().world.repository(repo, {});
  return repo;
};
/** A workflow folder: `implement`, with whatever frontmatter it is given, and `review` after it. */
const folder = (implementKeys = '') => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), `---\nplace: git\n${implementKeys ? `${implementKeys}\n` : ''}---\nimplement it\n`);
  fs.writeFileSync(path.join(dir, 'review.md'), '---\nafter: implement\nplace: git\n---\nreview it\n');
  return dir;
};
/** A workflow of one step, `implement`: its branch is the run's result. */
const oneStep = () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'one-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  return dir;
};
/** A strict findings schema with the loop's word, as the tests' team's review has it. */
const LOOPING = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: { file: { type: 'string' }, line: { type: ['integer', 'null'] }, what: { type: 'string' } },
        required: ['file', 'line', 'what'],
        additionalProperties: false,
      },
    },
    again: { type: 'boolean' },
  },
  required: ['findings', 'again'],
  additionalProperties: false,
};
const FOUND = [{ file: 'src/flag.ts', line: 12, what: 'the flag is read before it is parsed' }];
/** implement, checked → review, looping back to it with `rounds:` at its default. */
const looped = () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\ncheck: npm test\n---\nimplement it\n');
  fs.writeFileSync(
    path.join(dir, 'review.md'),
    '---\nafter: implement\nplace: git\noutput: review.schema.json\nloop: implement\n---\nreview it\n',
  );
  fs.writeFileSync(path.join(dir, 'review.schema.json'), JSON.stringify(LOOPING, null, 2));
  return dir;
};
/** implement ⇄ review as `looped()` builds it, and a gated ship after the loop. */
const loopedThenShip = () => {
  const dir = looped();
  fs.writeFileSync(path.join(dir, 'ship.md'), '---\nafter: review\nplace: git\ngate: true\n---\nship it\n');
  return dir;
};
const REPLIES = [{ finding: 'src/flag.ts:12', answer: 'fixed', why: 'the flag is parsed before it is read' }];
const reviewSays = (again: boolean) => ({ ...SIGNED, summary: 'REVIEWER-SUMMARY', findings: FOUND, again });
const ANSWERED = { ...SIGNED, summary: 'IMPLEMENTER-SUMMARY', replies: REPLIES };
/** A step's task on round `n`: its first try's id, then its try's. */
const onRound = (id: string, step: string, n: number) => (n === 1 ? `${id}-${step}` : `${id}-${step}-try${n}`);
/** Round `n` up to review's word: implement signs off, its check passes, then review signs off saying `again`. */
const toReview = async (b: Board, id: string, n: number, again: boolean) => {
  b.settle(onRound(id, 'implement', n), 'succeeded', n === 1 ? SIGNED : ANSWERED);
  assert.deepEqual((await runWith(b.e, advanceRun(readRun(id)))).checked, ['implement'], `round ${n}: implement's check`);
  b.settle(`${onRound(id, 'implement', n)}-check`, 'succeeded', undefined, 0);
  assert.deepEqual((await runWith(b.e, advanceRun(readRun(id)))).filed, ['review'], `round ${n}: review`);
  b.settle(onRound(id, 'review', n), 'succeeded', reviewSays(again));
};

/** A run this file started on a repository. */
const repositoryRunOf = (run: Run): RepositoryRun => {
  assert.ok(isRepositoryRun(run), `${run.id} works on a repository`);
  return run;
};
/** `nemia start` over a fresh repository, the steps working in the checkout itself. */
const started = async (dir: string) =>
  repositoryRunOf(await runPlaced(startRun({ brief: 'add a flag', repo: aRepo(), workflowDir: dir, isolate: false })));
/** `nemia start` over `implement` (with `keys`) → `review`, run until implement's check settles `phase`, with the exit code given. */
const throughCheck = async (keys: string, phase: EnginePhase, exitCode?: number) => {
  const run = await started(folder(keys));
  const b = stage.board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(run.id)));
  b.settle(`${run.id}-implement-check`, phase, undefined, exitCode);
  return { run, b };
};
/** A run another waits on, on the board its child is ticked on, its step filed, started with worktrees. */
const aParent = async (repo: string, b: Board) => {
  const run = repositoryRunOf(await runPlaced(startRun({ brief: 'the parent', repo, workflowDir: oneStep() })));
  await runWith(b.e, advanceRun(readRun(run.id)));
  return { run };
};
/**
 * A team whose steps say `workspace: folder`, in a chain, its writer an agent of its own: a run of it works in folders it makes, with no
 * git repository, and renders the writer.
 */
const folderTeam = () => {
  const root = fs.mkdtempSync(path.join(ROOT, 'team-'));
  const dir = path.join(root, 'notes');
  fs.mkdirSync(path.join(root, 'agents'));
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(root, 'agents', 'writer.md'), '---\nrole: Writer\ndescription: Writes the note.\n---\nWrite the note.\n');
  fs.writeFileSync(path.join(dir, 'write.md'), '---\nagent: writer\nworkspace: folder\npermissionMode: dontAsk\n---\nwrite the note\n');
  fs.writeFileSync(path.join(dir, 'review.md'), '---\nworkspace: folder\npermissionMode: dontAsk\nafter: write\n---\nreview the note\n');
  return dir;
};
/** The views' programs, and the standing of `ids` read off the test place. */
const viewPrograms = async () => {
  const views = await import('../src/views/views.verb.ts');
  const { standingLiveOf } = await import('../src/standing/standing.verb.ts');
  const live = (ids: readonly string[]) => runPlaced(standingLiveOf(ids));
  const fed = (e: Engine, entries: Effect.Success<ReturnType<Engine['feed']>>['entries']) => ({
    ...e,
    feed: (after = 0) => Effect.succeed({ entries: entries.slice(after), cursor: entries.length }),
  });
  return { over, fed, live, ...views };
};

/** The tick's program, given `engine` as the service, run to a Promise as the face runs it. */
const tickOn = (engine: Engine, options: Parameters<typeof tickRun>[0] = {}) =>
  runPlaced(tickRun(options).pipe(Effect.provide(Service.layer(engine))));

test("each verb's program, given its services, answers what its plain face answers; a refusal is its typed failure, anything else a defect", async (t) => {
  await t.test("the tick's program and its plain face each meter their pass over every phase the meter has", async () => {
    const b = stage.board();
    const e = ticking(b);
    const repo = aRepo();
    const work = fs.mkdtempSync(path.join(ROOT, 'wf-'));
    fs.writeFileSync(path.join(work, 'work.md'), '---\nplace: git\nharness: codex\n---\nwork it\n');
    const run = await runPlaced(startRun({ brief: 'one run', repo, workflowDir: work }));
    await runWith(e, tickRun({ repo: ROOT }));
    b.settle(`${run.id}-work`, 'succeeded', SIGNED);
    const status = async () => (await runWith(e, tickRun({ repo: ROOT }))).runs.find((a) => a.run.id === run.id)?.status;
    let now = await status();
    for (let k = 0; k < 4 && now !== 'succeeded'; k++) now = await status();
    assert.equal(now, 'succeeded', 'the run finished before the pass is metered');

    const { cost: faceCost, ...face } = await runWith(e, tickRun({ repo: ROOT, memo: freshRestMemo() }));
    const { cost: programCost } = await tickOn(e, { repo: ROOT, memo: freshRestMemo() });
    assert.deepEqual(
      face.runs.map((a) => [a.run.id, a.status]),
      [[run.id, 'succeeded']],
    );
    assert.deepEqual(Object.keys(programCost?.phases ?? {}), [...PHASES], 'the program meters its pass as the face does');
    assert.deepEqual(Object.keys(faceCost?.phases ?? {}), [...PHASES]);
  });

  await t.test(
    "REFUSED: the tick's refusal is its program's `Invalid`, picked out by its tag, and its face's rejection, exit code 2",
    async () => {
      const e = ticking(stage.board());
      const was = process.env.WF_MAX_CONCURRENT;
      process.env.WF_MAX_CONCURRENT = '-3';
      try {
        const said = await tickOn(e, { repo: ROOT }).then(
          () => 'answered',
          (x: unknown) => x,
        );
        assert.ok(said instanceof Invalid, `the program fails with an Invalid, not ${String(said)}`);
        const caught = await runPlaced(
          tickRun({ repo: ROOT }).pipe(
            Effect.catchTag('Invalid', (r) => Effect.succeed(r.message)),
            Effect.provide(Service.layer(e)),
          ),
        );
        assert.match(String(caught), /WF_MAX_CONCURRENT=-3/);
        const err = await rejection(runWith(e, tickRun({ repo: ROOT })), 'a pass under a ceiling that does not read');
        assert.ok(err instanceof Invalid, `an Invalid, not ${String(err)}`);
        assert.equal(err.exitCode, 2);
        assert.equal(err.message, caught);
      } finally {
        if (was === undefined) delete process.env.WF_MAX_CONCURRENT;
        else process.env.WF_MAX_CONCURRENT = was;
      }
    },
  );

  await t.test(
    "REFUSED: what is not a refusal is a defect the tick's program dies of, recovered by no catch, and its face rethrows it",
    async () => {
      const e = ticking(stage.board());
      const boom = new Error('boom');
      const failing = { ...e, tick: () => Effect.die(boom) };
      const caught = await runPlaced(
        tickRun({ repo: ROOT }).pipe(
          Effect.catch(() => Effect.succeed('caught')),
          Effect.provide(Service.layer(failing)),
        ),
      ).then(
        (x) => x,
        (x: unknown) => x,
      );
      assert.equal(caught, boom, 'the catch of failures left the defect alone');
      assert.equal(await rejection(runWith(failing, tickRun({ repo: ROOT })), 'a pass whose runtime rejected'), boom);
      assert.equal((await tickOn(e, { repo: ROOT })).runs.length, 1, 'the next pass reads the store as before');
    },
  );

  await t.test(
    'the programs of `nemia retry`, with `--round` and without, `nemia approve`, of a loop and at a gate, `nemia say` and `nemia cancel` answer what their plain faces answer',
    async (tt: TestContext) => {
      const at = Date.parse('2026-09-30T08:00:00.000Z');
      const same = async <A extends object>(what: string, program: () => Promise<A>, face: () => Promise<A>) => {
        tt.mock.timers.enable({ apis: ['Date'], now: at });
        try {
          const ran = await program();
          if ('file' in ran) fs.rmSync(String(ran.file));
          assert.deepStrictEqual(ran, await face(), what);
        } finally {
          tt.mock.timers.reset();
        }
      };

      const run = await started(loopedThenShip());
      const b = stage.board();
      await runWith(b.e, advanceRun(readRun(run.id)));
      for (const n of [1, 2]) {
        await toReview(b, run.id, n, true);
        assert.deepEqual((await runWith(b.e, advanceRun(readRun(run.id)))).looped, ['review'], `round ${n + 1}`);
      }
      await toReview(b, run.id, 3, true);
      await runWith(b.e, advanceRun(readRun(run.id)));
      await same(
        'nemia retry --round',
        () => over(b.e, roundRun(run.id)),
        () => runWith(b.e, roundRun(run.id)),
      );
      fs.rmSync(path.join(asksDir(run.id), 'round-review-4'));
      await same(
        'nemia approve of a loop',
        () => over(b.e, acceptRun(run.id, undefined, ENOUGH)),
        () => runWith(b.e, acceptRun(run.id, undefined, ENOUGH)),
      );
      assert.deepEqual((await runWith(b.e, advanceRun(readRun(run.id)))).filed, ['ship']);
      b.settle(`${run.id}-ship`, 'succeeded', SIGNED);
      await runWith(b.e, advanceRun(readRun(run.id)));
      await same(
        'nemia approve',
        () => over(b.e, approveRun(run.id, 'ship', 'land it')),
        () => runWith(b.e, approveRun(run.id, 'ship', 'land it')),
      );

      const failed = await started(folder());
      await runWith(b.e, advanceRun(readRun(failed.id)));
      b.settle(`${failed.id}-implement`, 'failed');
      await runWith(b.e, advanceRun(readRun(failed.id)));
      await same(
        'nemia retry',
        () => over(b.e, retryRun(failed.id, 'implement', { mode: 'fresh' })),
        () => runWith(b.e, retryRun(failed.id, 'implement', { mode: 'fresh' })),
      );

      const running = await started(folder());
      await runWith(b.e, advanceRun(readRun(running.id)));
      const taskId = `${running.id}-implement`;
      b.settle(taskId, 'working');
      const told = await over(b.e, sayRun(running.id, 'implement', 'Start with the parser.'));
      const face = await runWith(b.e, sayRun(running.id, 'implement', 'Start with the parser.'));
      const journalled = b.tasks.get(taskId)!.said;
      assert.deepStrictEqual(
        [told, face],
        journalled.map((said) => ({ ...face, said })),
        'nemia say: each journalled once, in turn',
      );

      await same(
        'nemia cancel',
        async () => {
          const cancelled = await over(b.e, cancelRun(running.id));
          fs.rmSync(cancelFile(running.id));
          b.tasks.get(taskId)!.stopRequested = false;
          return cancelled;
        },
        () => runWith(b.e, cancelRun(running.id)),
      );
      assert.deepEqual(b.stopped.slice(-2), [taskId, taskId], 'each asked the engine to stop the step');
    },
  );

  await t.test(
    'REFUSED as a typed failure: a run not there is a `Missing`, and a state that forbids the verb a `Conflict`, in the words its face rejects with',
    async () => {
      const b = stage.board();
      assert.match(await recovered(b.e, approveRun('no-such-run', 'x'), 'Missing'), /no such run: no-such-run/);
      assert.match(await recovered(b.e, acceptRun('no-such-run', undefined, ENOUGH), 'Missing'), /no such run: no-such-run/);

      const run = await started(looped());
      await runWith(b.e, advanceRun(readRun(run.id)));
      b.settle(`${run.id}-implement`, 'working');
      const refusals: Array<[string, EffectOf<unknown, Refusal, EngineService | PlaceService | StoreRoot>, Promise<unknown>]> = [
        ['nemia retry', retryRun(run.id, 'implement', { mode: 'fresh' }), runWith(b.e, retryRun(run.id, 'implement', { mode: 'fresh' }))],
        ['nemia retry --round', roundRun(run.id), runWith(b.e, roundRun(run.id))],
        ['nemia approve', approveRun(run.id, 'implement', 'ok'), runWith(b.e, approveRun(run.id, 'implement', 'ok'))],
      ];
      for (const [what, program, face] of refusals) {
        const err = await rejection(face, what);
        assert.ok(err instanceof Conflict, `${what}: a Conflict, not ${String(err)}`);
        assert.equal(err.exitCode, 2, what);
        assert.equal(await recovered(b.e, program, 'Conflict'), err.message, what);
      }
      assert.ok(!fs.existsSync(asksDir(run.id)), 'nothing written');
    },
  );

  await t.test("REFUSED as a typed failure: a record the store refuses to read is each program's `Invalid`, not a defect", async () => {
    const e = stage.board().e;
    fs.writeFileSync(path.join(ROOT, 'runs', 'garbled.json'), '{ not json');
    try {
      const programs: Array<[string, EffectOf<unknown, Refusal, EngineService | PlaceService | StoreRoot>]> = [
        ['nemia retry --round', roundRun('garbled')],
        ['nemia approve of a loop', acceptRun('garbled', undefined, ENOUGH)],
        ['nemia retry', retryRun('garbled', 'implement', { mode: 'fresh' })],
        ['nemia approve', approveRun('garbled', 'implement')],
        ['nemia say', sayRun('garbled', 'implement', 'hello')],
        ['nemia cancel', cancelRun('garbled')],
      ];
      for (const [what, program] of programs) assert.match(await recovered(e, program, 'Invalid'), /is not JSON/, what);
      assert.ok(!fs.existsSync(asksDir('garbled')) && !fs.existsSync(path.join(ROOT, 'runs', 'garbled.cancelled')), 'nothing written');
    } finally {
      fs.rmSync(path.join(ROOT, 'runs', 'garbled.json'));
    }
  });

  await t.test(
    'a journal that does not read is a defect of each program, which no `Effect.catch` recovers, and its plain face rejects with it; nothing written',
    async () => {
      const b = stage.board();
      const run = await started(folder());
      await runWith(b.e, advanceRun(readRun(run.id)));
      const boom = new Error('journal');
      const broken = { ...b.e, view: () => Effect.die(boom) };
      const verbs: Array<[string, EffectOf<unknown, Refusal, EngineService | PlaceService | StoreRoot>, () => Promise<unknown>]> = [
        ['nemia retry --round', roundRun(run.id), () => runWith(broken, roundRun(run.id))],
        ['nemia approve of a loop', acceptRun(run.id, undefined, ENOUGH), () => runWith(broken, acceptRun(run.id, undefined, ENOUGH))],
        [
          'nemia retry',
          retryRun(run.id, 'implement', { mode: 'fresh' }),
          () => runWith(broken, retryRun(run.id, 'implement', { mode: 'fresh' })),
        ],
        ['nemia approve', approveRun(run.id, 'implement', 'ok'), () => runWith(broken, approveRun(run.id, 'implement', 'ok'))],
        ['nemia say', sayRun(run.id, 'implement', 'hello'), () => runWith(broken, sayRun(run.id, 'implement', 'hello'))],
        ['nemia cancel', cancelRun(run.id), () => runWith(broken, cancelRun(run.id))],
      ];
      for (const [what, program, face] of verbs) {
        const uncaught = await rejection(over(broken, program.pipe(Effect.catch(() => Effect.succeed('caught')))), what);
        assert.equal(uncaught, boom, `${what}: a defect, which no \`Effect.catch\` recovers`);
        assert.equal(await rejection(face(), what), boom, `${what}: its face rejects with the error itself`);
      }
      assert.ok(!fs.existsSync(asksDir(run.id)) && !readRun(run.id).cancelledAt, 'nothing written');
    },
  );

  await t.test(
    "REFUSED as a typed failure: `nemia say`'s engine refusing is its program's `Conflict`; words not delivered are a defect its face rejects with",
    async () => {
      const b = stage.board();
      const run = await started(folder());
      await runWith(b.e, advanceRun(readRun(run.id)));
      const taskId = `${run.id}-implement`;
      const unheard = await recovered(b.e, sayRun(run.id, 'implement', 'Start with the parser.'), 'Conflict');
      assert.ok(unheard.startsWith(`say: \`${taskId}\``) && unheard.includes('has not started an attempt'), unheard);

      b.settle(taskId, 'working');
      const lost = new Error(`say: ae/${taskId}/1 was not given the words`);
      const deaf = { ...b.e, say: () => Effect.die(lost) };
      const program = sayRun(run.id, 'implement', 'Widen the scope.').pipe(Effect.catch(() => Effect.succeed('caught')));
      assert.equal(await rejection(over(deaf, program), 'nemia say'), lost, 'a defect, which no `Effect.catch` recovers');
      assert.equal(await rejection(runWith(deaf, sayRun(run.id, 'implement', 'Widen the scope.')), 'nemia say'), lost);
      assert.deepEqual(b.tasks.get(taskId)!.said, [], 'nothing said');
    },
  );

  await t.test(
    '`nemia cancel` asks the engine to stop before it marks the run: a stop the engine rejects leaves the run uncancelled, and its face rejects with it',
    async () => {
      const b = stage.board();
      const run = await started(folder());
      await runWith(b.e, advanceRun(readRun(run.id)));
      const refused = new Error('stop: the engine is not listening');
      const deaf = { ...b.e, stop: () => Effect.die(refused) };
      assert.equal(await rejection(runWith(deaf, cancelRun(run.id)), 'nemia cancel'), refused);
      assert.equal(readRun(run.id).cancelledAt, undefined, 'not marked: asking again does both');
      assert.ok((await runWith(b.e, cancelRun(run.id))).run.cancelledAt, 'asked again, it stops and marks');
    },
  );

  await t.test(
    'the programs of the views, given the engine as a service, answer what their plain faces answer on the same store',
    async () => {
      const v = await viewPrograms();
      const { run, b } = await throughCheck('check: npm test\nretries: 1', 'failed', 1);
      const e = b.e;
      await runWith(e, advanceRun(readRun(run.id)));
      b.settle(`${run.id}-implement-try2`, 'succeeded', SIGNED);
      await runWith(e, advanceRun(readRun(run.id)));
      const check = `${run.id}-implement-try2-check`;
      b.end(check, 'failed', {
        exitCode: 1,
        printed: { stdout: 'not ok 1 - parses a trailing comma\n# fail 1\n', stderr: 'npm error Test failed.\n' },
      });
      const record = readRun(run.id);
      const earlier = `${run.id}-implement`;
      assert.deepEqual(record.steps.implement.tries?.[0].taskId, earlier, 'an earlier try, whose task only every try reads');

      for (const how of [{}, { earlierTries: false }]) {
        const ran = await v.over(e, v.taskPhasesRead(record, how));
        assert.equal(ran.views.has(earlier), how.earlierTries !== false, JSON.stringify(how));
      }

      const { phaseOf } = await v.over(e, v.taskPhasesRead(record));
      const steps = stepsOf(record);
      const failed = (p: TaskPhase) => p === 'failed' || p === 'stopped';
      const reports = await v.over(e, v.checkReportsRead(record, steps, phaseOf, failed));
      assert.deepStrictEqual(reports.get('implement'), {
        passed: false,
        command: 'npm test',
        verdict: 1,
        stdout: 'not ok 1 - parses a trailing comma\n# fail 1',
        stderr: 'npm error Test failed.',
      });
      await v.over(e, v.refusalRead('npm test', check));

      const at = '2026-09-30T08:00:00.000Z';
      const told = v.fed(e, [
        { taskId: 'a', event: { kind: 'filed', at, brief: 'a', cwd: '/repo' } },
        { taskId: 'a', event: { kind: 'admitted', at: '2026-09-30T08:01:00.000Z' } },
        { taskId: 'b', event: { kind: 'filed', at: '2026-09-30T08:02:00.000Z', brief: 'b', cwd: '/repo' } },
      ]);
      assert.deepStrictEqual(await v.over(told, v.filingsRead(0, new Map([['c', at]]))), {
        filed: new Map([
          ['c', at],
          ['a', at],
          ['b', '2026-09-30T08:02:00.000Z'],
        ]),
        cursor: 3,
        forgotten: 0,
      });
      assert.deepStrictEqual(
        await v.over(told, v.filingsRead(1)),
        { filed: new Map([['b', '2026-09-30T08:02:00.000Z']]), cursor: 3, forgotten: 0 },
        'from a cursor',
      );

      const repo = aRepo();
      const landed = await aParent(repo, b);
      b.settle(`${landed.run.id}-implement`, 'succeeded', SIGNED);
      const running = await aParent(repo, b);
      const child = await runPlaced(startRun({ brief: 'the child', repo, workflowDir: folder(), after: [landed.run.id, running.run.id] }));
      const ids = [landed.run.id, running.run.id, 'no-such-run'];
      const git = await v.live(ids);
      const read = await Promise.all(ids.map((id) => v.over(b.e, v.parentRead(id, git))));
      assert.deepEqual(
        read.map((p) => p.landed),
        [true, false, false],
      );
      const lookup = await v.over(b.e, v.parentsRead(readRun(child.id), git));
      assert.deepStrictEqual(ids.map(lookup), read);
    },
  );

  await t.test(
    "REFUSED as a death in the runtime's words: a refusal the engine's view, logs or feed fails with is each views program's death, exit code 2; a refusal of the store is still its failure",
    async () => {
      const v = await viewPrograms();
      const { run, b } = await throughCheck('check: npm test', 'failed', 1);
      const e = b.e;
      const record = readRun(run.id);
      const check = `${run.id}-implement-check`;
      const repo = aRepo();
      const parent = await aParent(repo, b);
      b.settle(`${parent.run.id}-implement`, 'succeeded', SIGNED);
      const child = readRun((await runPlaced(startRun({ brief: 'the child', repo, workflowDir: folder(), after: [parent.run.id] }))).id);
      const failed = (): TaskPhase => 'failed';
      const live = await v.live([parent.run.id]);
      const reads = (err: unknown) => {
        const refuse = () => Effect.fail(err);
        return [
          ['taskPhases', 'view', v.taskPhasesRead(record), { ...e, view: refuse }],
          ['checkReports', 'logs', v.checkReportsRead(record, stepsOf(record), failed, () => true), { ...e, logs: refuse }],
          ['refusalOf', 'logs', v.refusalRead('npm test', check), { ...e, logs: refuse }],
          ['parentOf', 'view', v.parentRead(parent.run.id, live), { ...e, view: refuse }],
          ['parentsOf', 'view', v.parentsRead(child, live), { ...e, view: refuse }],
          ['readFilings', 'feed', v.filingsRead(), { ...e, feed: refuse }],
        ] as unknown as Array<[string, string, EffectOf<unknown, Refusal, EngineService>, Engine]>;
      };

      const refused = new StopRefused({ message: 'no such task' });
      for (const [what, verb, program, broken] of reads(refused)) {
        const died = (await rejection(v.over(broken, program), what)) as Error & { exitCode?: number };
        assert.ok(
          died.message.startsWith(`${verb}: `) && died.message.includes('no such task'),
          `${what}: led by its verb: ${died.message}`,
        );
        assert.equal(died.exitCode, 2, what);
        const uncaught = await rejection(v.over(broken, program.pipe(Effect.catch(() => Effect.succeed('caught')))), what);
        assert.equal((uncaught as Error).message, died.message, `${what}: a death, which no \`Effect.catch\` recovers`);
      }

      const boom = new Error('journal');
      for (const [what, , program, broken] of reads(boom)) {
        const uncaught = await rejection(v.over(broken, program.pipe(Effect.catch(() => Effect.succeed('caught')))), what);
        assert.equal(uncaught, boom, `${what}: a defect, which no \`Effect.catch\` recovers`);
        assert.equal(await rejection(v.over(broken, program), what), boom, `${what}: the program rejects with the error itself`);
      }

      const unreadable = new Missing({ message: 'git has no such repository' });
      const git: BranchReader = {
        ...live,
        has: () => {
          throw unreadable;
        },
      };
      const caught = await v.over(b.e, v.parentRead(parent.run.id, git).pipe(Effect.catchTag('Missing', (r) => Effect.succeed(r))));
      assert.equal(caught, unreadable, 'a refusal of git is the program’s failure, recovered by its tag');
    },
  );

  await t.test("`nemia decide`'s program, given the engine as a service, answers what its plain face answers", async () => {
    const run = await runPlaced(startRun({ brief: 'add sub', repo: aRepo(), workflowDir: folder(), isolate: false }));
    const b = stage.board();
    await runWith(b.e, advanceRun(readRun(run.id)));
    b.settle(`${run.id}-implement`, 'succeeded', { outcome: 'blocked', summary: 'two readings', artifacts: [], needs: 'Rename --flag?' });
    await runWith(b.e, advanceRun(readRun(run.id)));
    await runWith(b.e, retryRun(run.id, 'implement', { mode: 'continue', message: 'Keep it.' }));
    await runWith(b.e, advanceRun(readRun(run.id)));
    b.settle(`${run.id}-implement-try2`, 'succeeded', SIGNED);
    await runWith(b.e, advanceRun(readRun(run.id)));

    const face = await runWith(b.e, decideRun(run.id));
    const program = await runPlaced(decideRun(run.id).pipe(Effect.provide(Service.layer(b.e))));
    assert.deepEqual(
      face.answers.implement,
      { try: 2, message: 'Keep it.', needs: 'Rename --flag?' },
      'a try answered, and the try before read',
    );
    assert.deepStrictEqual(program, face);
  });

  await t.test(
    "REFUSED: `nemia decide` of a run that is not there is its program's `Missing`, picked out by its tag, and its face's rejection, exit code 2",
    async () => {
      const e = stage.board().e;
      const err = await rejection(runWith(e, decideRun('no-such-run')), 'decide of no run');
      assert.ok(err instanceof Missing, `a Missing, not ${String(err)}`);
      assert.equal(err.exitCode, 2);
      assert.match(err.message, /no such run: no-such-run/);
      const caught = await runPlaced(
        decideRun('no-such-run').pipe(
          Effect.catchTag('Missing', (r) => Effect.succeed(r.message)),
          Effect.provide(Service.layer(e)),
        ),
      );
      assert.equal(caught, err.message);
    },
  );

  await t.test(
    'the start program answers what its plain face answers on the same store: a repository run with an input, a gate and a parent, and a folder run',
    async () => {
      const repo = aRepo();
      const parent = await runPlaced(startRun({ brief: 'the parent', repo, workflowDir: oneStep() }));
      const input = path.join(fs.mkdtempSync(path.join(ROOT, 'given-')), 'notes.md');
      fs.writeFileSync(input, 'the notes\n');
      const cases: Array<[string, Parameters<typeof startRun>[0]]> = [
        ['a repository run', { brief: 'the child', repo, workflowDir: TEAM_DEV, inputs: [input], gates: ['review'], after: [parent.id] }],
        ['a folder run', { brief: 'the note', repo: ROOT, workflowDir: folderTeam(), inputs: [input] }],
      ];
      const differ = ['id', 'workspace', 'branch', 'baseRef', 'createdAt'];
      const same = (r: Run) => Object.fromEntries(Object.entries(r).filter(([k]) => !differ.includes(k)));
      const written = (r: Run) => JSON.parse(JSON.stringify(r)) as Run;
      for (const [what, opts] of cases) {
        const ran = await Effect.runPromise(placed(startRun(opts)));
        const face = await runPlaced(startRun(opts));
        assert.deepStrictEqual(written(ran), readRun(ran.id), `${what}: the program's run is on the record`);
        assert.deepStrictEqual(written(face), readRun(face.id), `${what}: the face's run is on the record`);
        assert.deepStrictEqual(same(written(ran)), same(written(face)), what);
        assert.ok(fs.existsSync(path.join(inputsDir(ran), 'notes.md')), `${what}: its input copied`);
        assert.ok(fs.statSync(path.join(runsDir(), ran.id, 'agents')).isDirectory(), `${what}: its agents rendered`);
      }
    },
  );

  await t.test(
    "REFUSED as a typed failure at `nemia start`: each refusal is the start program's `Invalid`, its face's, exit 2, and nothing is written",
    async () => {
      const repo = aRepo();
      const fan = fs.mkdtempSync(path.join(ROOT, 'fan-'));
      fs.writeFileSync(path.join(fan, 'a.md'), '---\nplace: git\n---\nside a\n');
      fs.writeFileSync(path.join(fan, 'b.md'), '---\nplace: git\n---\nside b\n');
      const cases: Array<[string, Parameters<typeof startRun>[0]]> = [
        ['--repo on a folder team', { brief: 'x', repo, repoNamed: true, workflowDir: folderTeam() }],
        ['a gate naming no step', { brief: 'x', repo, workflowDir: folder(), gates: ['nowhere'] }],
        ['an input not there', { brief: 'x', repo, workflowDir: folder(), inputs: [path.join(ROOT, 'no-such-input.md')] }],
        ['after an unknown run', { brief: 'x', repo, workflowDir: folder(), after: ['no-such-run'] }],
        ['--no-worktree on a fan-out', { brief: 'x', repo, workflowDir: fan, isolate: false }],
      ];
      for (const [what, opts] of cases) {
        const before = fs.readdirSync(runsDir()).sort();
        const caught = Effect.runSync(placed(startRun(opts)).pipe(Effect.catchTag('Invalid', (r) => Effect.succeed(r))));
        assert.ok(caught instanceof Invalid, `${what}: an Invalid, recovered by its tag`);
        const err = await rejection(runPlaced(startRun(opts)), what);
        assert.ok(err instanceof Invalid, `${what}: the face throws the Invalid itself, not ${String(err)}`);
        assert.equal(err.exitCode, 2, what);
        assert.equal(caught.message, err.message, what);
        assert.deepEqual(fs.readdirSync(runsDir()).sort(), before, `${what}: nothing written`);
      }
    },
  );

  await t.test(
    'a run whose inputs cannot be copied is what the start program dies of, not a refusal: its face throws the same exit-1 Error, and nothing is left',
    async (tt: TestContext) => {
      const input = path.join(fs.mkdtempSync(path.join(ROOT, 'given-')), 'notes.md');
      fs.writeFileSync(input, 'the notes\n');
      const opts = { brief: 'unwritable', repo: aRepo(), workflowDir: folder(), inputs: [input] };
      const before = fs.readdirSync(runsDir()).sort();
      fs.chmodSync(runsDir(), 0o555);
      tt.after(() => fs.chmodSync(runsDir(), 0o755));
      const died = thrown(() => Effect.runSync(placed(startRun(opts)).pipe(Effect.catch(() => Effect.succeed('caught')))), 'the program');
      const face = await rejection(runPlaced(startRun(opts)), 'the face');
      fs.chmodSync(runsDir(), 0o755);
      for (const [what, err] of [
        ['the program', died],
        ['the face', face],
      ] as const) {
        assert.ok(err instanceof Error && !isRefusal(err), `${what}: an Error, not a refusal: ${String(err)}`);
        assert.equal((err as Error & { exitCode?: number }).exitCode, 1, what);
        assert.match(err.message, /^--input: /, what);
      }
      const anyId = (err: unknown) => (err as Error).message.replaceAll(/unwritable-[a-z0-9]+/g, '<id>');
      assert.equal(anyId(died), anyId(face), 'in the same words, but for the run id');
      assert.deepEqual(fs.readdirSync(runsDir()).sort(), before, 'no record, and no run directory');
    },
  );

  await t.test(
    'a run that dies once its own directory is made takes that directory with it: an input that cannot be read, a skill that cannot be rendered — exit 1, and nothing of it is left',
    { skip: process.getuid?.() === 0 && 'root reads a file of mode 000' },
    async (tt: TestContext) => {
      const unreadable = (at: string) => {
        fs.writeFileSync(at, 'kept from the run\n');
        fs.chmodSync(at, 0o000);
        tt.after(() => fs.chmodSync(at, 0o644));
      };
      const input = path.join(fs.mkdtempSync(path.join(ROOT, 'given-')), 'notes.md');
      unreadable(input);
      const team = folderTeam();
      const skill = path.join(path.dirname(team), 'skills', 'noting');
      fs.mkdirSync(skill, { recursive: true });
      fs.writeFileSync(path.join(skill, 'SKILL.md'), '---\nname: noting\ndescription: How a note is kept.\n---\nKeep it short.\n');
      unreadable(path.join(skill, 'form.md'));
      const writer = path.join(path.dirname(team), 'agents', 'writer.md');
      fs.writeFileSync(writer, fs.readFileSync(writer, 'utf8').replace('description:', 'skills: noting\ndescription:'));
      const cases: Array<[string, Parameters<typeof startRun>[0], RegExp]> = [
        ['an input', { brief: 'unreadable', repo: aRepo(), workflowDir: folder(), inputs: [input] }, /^--input: /],
        ['a skill', { brief: 'unrendered', repo: ROOT, workflowDir: team }, /agents could not be rendered/],
      ];
      for (const [what, opts, said] of cases) {
        const before = fs.readdirSync(runsDir()).sort();
        const err = await rejection(runPlaced(startRun(opts)), what);
        assert.equal((err as Error & { exitCode?: number }).exitCode, 1, `${what}: ${String(err)}`);
        assert.match((err as Error).message, said, what);
        const id = /runs\/([a-z0-9-]+)\//.exec((err as Error).message)?.[1] ?? '';
        assert.ok(id, `${what}: the message names the run's directory: ${(err as Error).message}`);
        assert.equal(runStore.runs.taken(id), false, `${what}: nothing of ${id} is left`);
        assert.deepEqual(fs.readdirSync(runsDir()).sort(), before, `${what}: no record, and no run directory`);
      }
    },
  );
});
