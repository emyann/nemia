/**
 * Every reader of a run says the same thing of it. One fixture run for each place the readers were found to read a run apart, each read
 * by the tick's pass (its read and `assess` on it), by `nemia ls` (`list`, the listing and the assessment beside it), by `nemia decide`
 * (`decideRun`), by `nemia prune`'s judgement (`judging`) where it reads the run, and by the run object (`runObject`): each says the
 * run's status, what a person has to decide, the steps waiting on you, and the tries and rounds due, and where two of them say a fact,
 * they say it alike. The pass's reading is the truth: a row reads every other reader against it.
 *
 * Told on the test place and the engine's stand-in (`story.ts`). `WF_ROOT` is set before the runner is imported: it is read as the
 * module loads. Beside the table: the tables' empty read is `readersOf`'s, and the engine's `needs-human` is compared in `src/views/`
 * alone (`blockedWord`, `harnessBlocked`), so no reader judges a blocked session by a word of its own.
 */
import { settingsOf, StoreConfig } from '../src/config/config.store.ts';
import { rootNow } from './config-given.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { scratch } from 'test-kit/scratch';
import { staged } from './story.ts';

const ROOT = scratch('wf-one-read-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const { advanceRun, cancelRun, decideRun, list, retryRun, runObject, startRun, runWith } = await import('../src/runner.ts');
const { listRuns, runRecord } = await import('../src/record/record.store.ts');
const { filesStore: runStore } = await import('../src/record/files.store.ts');
/** The run `id` as a reader is given it, the store's pause composed onto it (`runs.read`). */
const theRun = (id: string) => runStore.runs.read(id);
const { passStanding, standingSnapshot } = await import('../src/standing/standing.verb.ts');
const { readRun: theRead } = await import('../src/tick/told.verb.ts');
const { passAssessment } = await import('../src/tick/advance.verb.ts');
const { cancelPlan } = await import('../src/cancel/cancel.ts');
const { headsOver, standingReader } = await import('../src/standing/standing.verb.ts');
const { statusMemo } = await import('../src/place/landing.store.ts');
const { PlaceService } = await import('../src/place/place.store.ts');
type Engine = import('../src/runtime-client.ts').Engine;
type Run = import('../src/run.ts').Run;
const { judging } = await import('../src/forget/prune/prune.verb.ts');
const { hold } = await import('../src/wait/wait.verb.ts');
const { putPause, resumePause } = await import('../src/pause/pause.store.ts');
const { StoreRoot } = await import('../src/config/root.store.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const { main } = await import('../src/cli/main.ts');
const stage = staged({ runWith, main, engineOf });

/** One pass of the tick over the run `id`, on the stage's engine. */
const tick = (id: string) => stage.runWith(stage.board().e, advanceRun(runRecord(id)));
/** A pass's read of where every run's branches stand, written to `standing.json` as the tick writes it: what `nemia ls` reads. */
const aPass = () => stage.runWith(stage.board().e, passStanding(listRuns()));

/**
 * The run as the tick's pass reads and assesses it: its one read (`readRun`), then the pass's own assessment (`passAssessment`, which
 * `advancePass` calls), the checkout read off what `nemia ls` reads where branches stand.
 */
const tickRead = (e: Engine, run: Run) =>
  Effect.gen(function* () {
    const { read: reads } = yield* theRead(e, run, { earlierTries: 'budgeted' });
    const snapshot = yield* standingSnapshot();
    const memo = statusMemo(headsOver(standingReader(snapshot)), yield* PlaceService);
    const { read, assessed } = yield* passAssessment(e, run, reads, { standing: Effect.succeed(snapshot) }, memo, snapshot).pipe(
      Effect.provide(StoreConfig.layer(settingsOf(process.env))),
    );
    return {
      ...assessed,
      plan: cancelPlan(read, assessed),
      asked: assessed.due.retry.filter((t) => t.by === 'ask').map((t) => t.step),
      roundDue: assessed.round.map((t) => t.step),
    };
  });

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };

/** A workflow folder: each step's file, its frontmatter lines as given (each step is placed on git). */
const folder = (steps: Record<string, readonly string[]>): string => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  for (const [name, lines] of Object.entries(steps))
    fs.writeFileSync(path.join(dir, `${name}.md`), `---\n${['place: git', ...lines].join('\n')}\n---\n${name} it\n`);
  return dir;
};

/** A repository on the test place, with one commit. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stage.place().world.repository(repo, { 'README.md': 'a repo\n' });
  return repo;
};

/** A run of `workflowDir` started in `repo` and ticked once, so its roots are filed. */
const started = async (workflowDir: string, repo = aRepo()): Promise<string> => {
  const run = await stage.runPlaced(startRun({ brief: 'read me', repo, workflowDir }));
  await tick(run.id);
  return run.id;
};

/** What one reader says of a run: each fact it says, and none it does not. */
type Said = {
  status?: string;
  running?: boolean;
  ready?: string[];
  retries?: string[];
  rounds?: string[];
  asked?: string[];
  roundDue?: string[];
  toDecide?: string | null;
  waitingOnYou?: string[];
  finished?: boolean;
};

/** A `ToDecide`, or the board's, as one comparable word: its kind and what it names. */
const decideWord = (t: { kind: string; step?: string; branches?: readonly string[] } | null | undefined): string | null =>
  t ? `${t.kind}:${t.step ?? [...(t.branches ?? [])].sort().join(',')}` : null;

/** Whether a run is finished as `nemia cancel` means it: nothing due, nobody waited on, and it succeeded or failed. */
const finishedOf = (
  a: { ready: unknown[]; check: unknown[]; retry: unknown[]; round: unknown[]; status: string },
  waitingOnYou: readonly string[],
): boolean =>
  !a.ready.length &&
  !a.check.length &&
  !a.retry.length &&
  !a.round.length &&
  !waitingOnYou.length &&
  ['succeeded', 'failed'].includes(a.status);

const sorted = (names: Iterable<string>): string[] => [...new Set(names)].sort();

/** What each reader says of the run `id`, the tick's pass first. */
const readers = async (id: string): Promise<Record<string, Said>> => {
  const e = stage.board().e;
  await aPass();
  const pass = await stage.runWith(e, tickRead(e, theRun(id)));
  const listed = await stage.runWith(
    e,
    Effect.flatMap(standingSnapshot(), (standing) => list(e, theRun(id), undefined, standing)),
  );
  const decided = await stage.runWith(e, decideRun(id));
  const object = await stage.runWith(e, Effect.provideService(runObject(theRun(id), { memo: { said: new Map() } }), StoreRoot, ROOT));
  const pruned = await stage.runWith(e, judging(id));
  const said: Record<string, Said> = {
    tick: {
      status: pass.status,
      running: pass.status === 'running',
      ready: sorted(pass.ready),
      retries: sorted(pass.retry.map((r) => r.step)),
      rounds: sorted(pass.round.map((r) => r.step)),
      asked: sorted(pass.asked),
      roundDue: sorted(pass.roundDue),
      toDecide: decideWord(pass.toDecide),
    },
    listing: {
      status: listed.assessed.status,
      running: listed.assessed.status === 'running',
      ready: sorted(listed.assessed.ready),
      retries: sorted(listed.assessed.retry.map((r) => r.step)),
      rounds: sorted(listed.assessed.round.map((r) => r.step)),
      asked: sorted(listed.assessed.due.retry.filter((r) => r.by === 'ask').map((r) => r.step)),
      roundDue: sorted(listed.steps.filter((s) => s.roundDue).map((s) => s.name)),
      toDecide: decideWord(listed.toDecide),
      waitingOnYou: sorted(listed.waitingOnYou),
      finished: finishedOf(listed.assessed, listed.waitingOnYou),
    },
    cancel: { finished: pass.plan.kind === 'finished' },
    decide: {
      running: decided.decision.kind === 'running',
      retries: sorted(decided.retrying.map((r) => r.step)),
      rounds: sorted(decided.rounding.map((r) => r.step)),
      toDecide: decideWord(decided.toDecide),
    },
    ...('unjudged' in object
      ? {}
      : {
          object: {
            status: object.status.status,
            asked: sorted(object.status.steps.filter((s) => s.asked !== null).map((s) => s.name)),
            roundDue: sorted(object.status.steps.filter((s) => s.roundDue).map((s) => s.name)),
            toDecide: decideWord(object.status.toDecide),
            waitingOnYou: sorted(object.status.waitingOnYou),
          },
        }),
    ...(pruned.facts?.decided ? { prune: { running: pruned.facts.decided === 'running' } } : {}),
  };
  return said;
};

/**
 * That every reader that says a fact says it as the tick's pass does, and, of a fact the pass does not say (who waits on you), as the
 * first reader that says it: each disagreement named by its fact and the two readers.
 */
const agree = (said: Record<string, Said>): void => {
  if (process.env.ONE_READ_SHOW) console.log(JSON.stringify(said));
  const facts = new Set(Object.values(said).flatMap((s) => Object.keys(s))) as Set<keyof Said>;
  const apart: string[] = [];
  for (const fact of facts) {
    const sayers = Object.entries(said).filter(([, s]) => s[fact] !== undefined);
    const [first, ...rest] = sayers;
    if (!first) continue;
    for (const [who, s] of rest) {
      if (JSON.stringify(s[fact]) !== JSON.stringify(first[1][fact]))
        apart.push(`${fact}: ${first[0]} says ${JSON.stringify(first[1][fact])}, ${who} says ${JSON.stringify(s[fact])}`);
    }
  }
  assert.deepEqual(apart, [], `the readers read the run apart:\n  ${apart.join('\n  ')}`);
};

test('one read of a run: the tick, nemia ls, nemia decide, nemia prune and the run object say the same of each run', async (t) => {
  await t.test('an ending waits for the checkout another run holds: nothing of it is ready, for any reader', async () => {
    const repo = aRepo();
    const workflow = folder({ implement: [], land: ['after: implement', 'workspace: base'] });
    const first = await started(workflow, repo);
    stage.board().settle(`${first}-implement`, 'succeeded', SIGNED);
    await tick(first);
    stage.board().settle(`${first}-land`, 'working');
    const second = await started(workflow, repo);
    stage.board().settle(`${second}-implement`, 'succeeded', SIGNED);
    agree(await readers(second));
  });

  await t.test('a try of an ending asked while another run holds the checkout: no reader says the try is filed now', async () => {
    const repo = aRepo();
    const workflow = folder({ implement: [], land: ['after: implement', 'workspace: base'] });
    const second = await started(workflow, repo);
    stage.board().settle(`${second}-implement`, 'succeeded', SIGNED);
    await tick(second);
    stage.board().settle(`${second}-land`, 'succeeded', { ...SIGNED, outcome: 'blocked', needs: 'which way?' });
    await tick(second);
    const first = await started(workflow, repo);
    stage.board().settle(`${first}-implement`, 'succeeded', SIGNED);
    await tick(first);
    stage.board().settle(`${first}-land`, 'working');
    await stage.runWith(stage.board().e, retryRun(second, 'land', { mode: 'continue', message: 'this way' }));
    agree(await readers(second));
  });

  await t.test(
    'a finished run with no gated ending and its branch ahead of the base: the result is to decide, for every reader',
    async () => {
      const id = await started(folder({ implement: [], review: ['after: implement'] }));
      const workspace = theRun(id).steps.implement.workspace!;
      fs.writeFileSync(path.join(workspace, 'a.txt'), 'a\n');
      stage.place().world.commit(workspace, 'the work');
      stage.board().settle(`${id}-implement`, 'succeeded', SIGNED);
      await tick(id);
      stage.board().settle(`${id}-review`, 'succeeded', SIGNED);
      await tick(id);
      agree(await readers(id));
    },
  );

  await t.test('a session its harness blocked, asked to try again: one try due, a session to stop first, for every reader', async () => {
    const id = await started(folder({ implement: [], review: ['after: implement'] }));
    stage.board().settle(`${id}-implement`, 'needs-human');
    await stage.runWith(stage.board().e, retryRun(id, 'implement', { mode: 'fresh' }, { stopBlocked: true }));
    agree(await readers(id));
  });

  await t.test('a task the engine holds queued: the step runs, for every reader', async () => {
    const id = await started(folder({ implement: [], review: ['after: implement'] }));
    stage.board().settle(`${id}-implement`, 'pending');
    agree(await readers(id));
  });

  await t.test('a refused check its retries cover: one try due, by the check, for every reader', async () => {
    const id = await started(folder({ implement: ['check: npm test', 'retries: 1'], review: ['after: implement'] }));
    stage.board().settle(`${id}-implement`, 'succeeded', SIGNED);
    await tick(id);
    stage.board().settle(`${id}-implement-check`, 'failed', undefined, 1);
    agree(await readers(id));
  });

  await t.test('a loop whose reviewer asks again: one round due, for every reader', async () => {
    const workflow = folder({ implement: [], review: ['after: implement', 'loop: implement', 'rounds: 3', 'output: review.schema.json'] });
    const again = { type: 'object', properties: { again: { type: 'boolean' } }, required: ['again'], additionalProperties: false };
    fs.writeFileSync(path.join(workflow, 'review.schema.json'), JSON.stringify(again));
    const id = await started(workflow);
    stage.board().settle(`${id}-implement`, 'succeeded', SIGNED);
    await tick(id);
    stage.board().settle(`${id}-review`, 'succeeded', { ...SIGNED, again: true });
    agree(await readers(id));
  });

  await t.test('a try asked while the store is paused: it waits on the pause, and no reader says it is filed now', async () => {
    const id = await started(folder({ implement: [], review: ['after: implement'] }));
    stage.board().settle(`${id}-implement`, 'failed');
    await tick(id);
    await stage.runWith(stage.board().e, retryRun(id, 'implement', { mode: 'fresh' }));
    putPause(rootNow(), { why: 'a release' });
    try {
      agree(await readers(id));
    } finally {
      resumePause(rootNow());
    }
  });

  await t.test('a step at its gate: the approval is to decide and the step waits on you, for every reader', async () => {
    const id = await started(folder({ plan: ['gate: true'], implement: ['after: plan'] }));
    stage.board().settle(`${id}-plan`, 'succeeded', SIGNED);
    await tick(id);
    agree(await readers(id));
  });

  await t.test('a step that signed off blocked: it waits on you, and the run is not finished, for every reader', async () => {
    const id = await started(folder({ implement: [], review: ['after: implement'] }));
    stage.board().settle(`${id}-implement`, 'succeeded', { ...SIGNED, outcome: 'blocked', needs: 'which flag?' });
    await tick(id);
    agree(await readers(id));
  });

  await t.test('a run called off with a step blocked: nothing due and nobody waited on, for every reader', async () => {
    const id = await started(folder({ implement: [], review: ['after: implement'] }));
    stage.board().settle(`${id}-implement`, 'succeeded', { ...SIGNED, outcome: 'blocked', needs: 'which flag?' });
    await tick(id);
    await stage.runWith(stage.board().e, cancelRun(id));
    agree(await readers(id));
  });

  await t.test('a held run with a try asked: nothing due and nobody waited on, for every reader', async () => {
    const id = await started(folder({ implement: [], review: ['after: implement'] }));
    stage.board().settle(`${id}-implement`, 'failed');
    await tick(id);
    await stage.runWith(stage.board().e, retryRun(id, 'implement', { mode: 'fresh' }));
    await stage.runWith(stage.board().e, hold(id, []));
    agree(await readers(id));
  });

  await t.test('an ending at its gate whose work is sent back: the try is due and nobody is waited on, for every reader', async () => {
    const id = await started(folder({ implement: [], land: ['after: implement', 'workspace: base', 'gate: true'] }));
    stage.board().settle(`${id}-implement`, 'succeeded', SIGNED);
    await tick(id);
    await stage.runWith(stage.board().e, retryRun(id, 'implement', { mode: 'continue', message: 'not this way' }));
    agree(await readers(id));
  });
});

test("the tables' empty read is `readersOf`'s on an empty view: every task unknown, nothing signed, asked, blocked or spent", async () => {
  const { readersOf } = await import('../src/tick/told.verb.ts');
  const { EMPTY_VIEW, run, STEPS } = await import('./assessed.ts');
  const r = run({ implement: 't1', review: null });
  const real = readersOf(new Map(), r, STEPS);
  for (const id of ['t1', 't2', '']) {
    assert.deepEqual(
      [real.phaseOf(id), real.asked(id), real.sessionBlocked(id), real.spendOf(id)],
      [EMPTY_VIEW.phaseOf(), EMPTY_VIEW.asked(), EMPTY_VIEW.sessionBlocked(), EMPTY_VIEW.spendOf()],
      id,
    );
  }
  for (const name of ['implement', 'review'])
    assert.deepEqual([real.signedOff(name), real.verdictOf(name)], [EMPTY_VIEW.signedOff(), EMPTY_VIEW.verdictOf()], name);
});

/** Each line of `text` that compares the engine's `needs-human` itself, as `<file>:<line>`: what `blockedWord` is for. */
const comparesBlocked = (file: string, text: string): string[] =>
  text.split('\n').flatMap((line, i) => (/[=!]==\s*'needs-human'|'needs-human'\s*[=!]==/.test(line) ? [`${file}:${i + 1}`] : []));

test("REFUSED: a source file outside src/views/ compares the engine's needs-human itself, where blockedWord says it", () => {
  const planted = "const live = sources.phase === 'needs-human' ? 'waits' : 'running';\nconst said = `${NEEDS_HUMAN}: waits`;";
  assert.deepEqual(
    comparesBlocked('src/chat/chat.ts', planted),
    ['src/chat/chat.ts:1'],
    'the planted comparison is found, the word said is not',
  );
  const src = path.join(import.meta.dirname, '..', 'src');
  const files = (fs.readdirSync(src, { recursive: true }) as string[]).filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.startsWith(`views${path.sep}`),
  );
  assert.ok(files.length > 100, 'the scan reads the source');
  const found = files.flatMap((f) => comparesBlocked(`src/${f}`, fs.readFileSync(path.join(src, f), 'utf8')));
  assert.deepEqual(found, [], 'compare the engine word through blockedWord (src/views/views-words.ts), or harnessBlocked off views');
});
