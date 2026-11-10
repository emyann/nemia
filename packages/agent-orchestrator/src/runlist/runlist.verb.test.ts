/**
 * The RunList asked by state (`runList` with `fieldSelector`, run-list.verb.ts), on a store of runs started and advanced over the
 * stand-ins: each selector takes exactly the runs `kindOf` puts in its state, the counts ignore the selector and the page, the finished
 * runs come newest first by when their work stopped, each run carries the frame's parts measured to `metadata.asOf` (`framePartsOf`,
 * runlist.verb.ts), and a warm read costs no record of a finished run (the big quiet store of rest-store.test.ts says the same on the
 * runtime itself); a plain list carries none of it, and a selector that is none is refused before any run is judged.
 *
 * `WF_ROOT` is set before the package is imported, since the store reads it as it loads; each test empties the store's runs first, and
 * a test that compares two answers, or orders runs by time, seeds `Date`.
 */
import { beforeEach, test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { testEngine } from 'agent-runtime/testing';
import { scratch } from 'test-kit/scratch';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runGiven, runOver } from '../../test/placed.ts';

const ROOT = scratch('wf-runlist-');
const RUNS_DIR = path.join(ROOT, 'runs');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
process.env.WF_DEFAULT_FACTORY_STARTS = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const { runList } = await import('../run-list/run-list.verb.ts');
const { kindOf } = await import('../run-state/run-state.ts');
const { judgedNow } = await import('../summary/summary.verb.ts');
const { advanceRun, approveRun, startRun, runWith: runEngine } = await import('../runner.ts');
const { Invalid } = await import('../refusal/refusal.ts');
const { runRecord } = await import('../record/record.store.ts');
const { engineOf } = await import('../runtime-client.ts');
const { metered } = await import('../meter/tally.store.ts');
const { informerMemo } = await import('../rest/informer.verb.ts');
type RunList = import('objects').RunList;
type RunStatus = import('objects').RunStatus;
type RunQuery = import('../run-list/run-list.verb.ts').RunQuery;

const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer);
const runPlaced = runGiven(() => stand().layer);
const engine = eachTest(testEngine);
const e = () => engineOf(engine().layer);

beforeEach(() => {
  fs.rmSync(RUNS_DIR, { recursive: true, force: true });
  fs.mkdirSync(RUNS_DIR, { recursive: true });
});

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };
const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 4, 10);

/** A workflow folder of the steps named, each after those `after` gives it. */
const folder = (steps: Record<string, string | null>): string => {
  const dir = scratch('wf-runlist-team-');
  for (const [name, after] of Object.entries(steps))
    fs.writeFileSync(path.join(dir, `${name}.md`), `---\n${after ? `after: ${after}\n` : ''}place: git\n---\n${name} it\n`);
  return dir;
};

/**
 * A run started in a repository of its own and advanced one pass, so its roots are filed; `isolate` for one whose steps run side by
 * side.
 */
const started = async (steps: Record<string, string | null>, gates: string[] = [], isolate = false) => {
  const repo = scratch('wf-runlist-repo-');
  stand().world.repository(repo, {});
  const run = await runPlaced(startRun({ brief: 'list me', repo, workflowDir: folder(steps), isolate, gates }));
  await runWith(e(), advanceRun(runRecord(run.id)));
  return run.id;
};

/** One more pass over the run `id`. */
const advanced = (id: string) => runWith(e(), advanceRun(runRecord(id)));

/** A run of one step that signed off: finished. */
const aFinished = async () => {
  const id = await started({ work: null });
  engine().settle(`${id}-work`, 'succeeded', { closeout: SIGNED });
  await advanced(id);
  return id;
};

/** A run of one step whose session runs: in flight. */
const anInFlight = async () => {
  const id = await started({ work: null });
  engine().settle(`${id}-work`, 'working');
  return id;
};

/** A run whose first step signed off at its gate: it waits on a person. */
const aWaiting = async () => {
  const id = await started({ plan: null, build: 'plan' }, ['plan']);
  engine().settle(`${id}-plan`, 'succeeded', { closeout: SIGNED });
  await advanced(id);
  return id;
};

/** A person's cancellation of the run `id`, written beside its record as `nemia cancel` writes it. */
const cancelled = (id: string, at: number): void => fs.writeFileSync(path.join(RUNS_DIR, `${id}.cancelled`), new Date(at).toISOString());

/** What a list keeps between requests: the informer; a fresh one for each read where none is given. */
type Kept = { runs: import('../rest/informer.verb.ts').InformerMemo };
const cold = (): Kept => ({ runs: informerMemo() });

/** The RunList `query` asks, read through `kept`, verified as `env` says. */
const list = async (query: RunQuery = {}, kept = cold(), env = process.env): Promise<RunList> =>
  await runWith(
    e(),
    runList(e(), { home: ROOT, memo: kept.runs, verify: env.WF_VERIFY_REST === '1' }, { memo: { said: new Map() } }, query),
  );

/** A run of a list as a row: its name as `id`, its creation as `createdAt`, and its status. */
type Row = RunStatus & { id: string; createdAt: string };
const rowsOf = (answer: RunList): Row[] =>
  answer.items.map((item) => ({ ...item.status, id: item.metadata.name, createdAt: item.metadata.creationTimestamp }));

/** The frame's list of the runs not finished, split by state as the board splits it, with its counts and the instant it is read at. */
const open = async () => {
  const answer = await list({ fieldSelector: 'status.state!=finished' });
  const rows = rowsOf(answer);
  return {
    asOf: answer.metadata.asOf ?? '',
    counts: answer.metadata.counts,
    waiting: rows.filter((row) => row.state === 'waiting'),
    inFlight: rows.filter((row) => row.state === 'inFlight'),
  };
};

/** A page of the finished runs, newest first, as the board asks it. */
const finishedPage = async (query: RunQuery = {}): Promise<Row[]> =>
  rowsOf(await list({ fieldSelector: 'status.state=finished', ...query }));

/** The frame's seven keys of a run's status. */
const FRAME = ['state', 'wallMs', 'clock', 'stepCosts', 'waitingSince', 'finishedAt', 'outcome'] as const;

/** An item without the frame's keys: what a plain list answers of the run. */
const unframed = (item: RunList['items'][number]) => {
  const status: Record<string, unknown> = { ...item.status };
  for (const key of FRAME) delete status[key];
  return { ...item, status };
};

const seeded = (t: TestContext, now = T0) => t.mock.timers.enable({ apis: ['Date'], now });

test('each selector takes exactly the runs kindOf puts in its state; the counts ignore the selector and the limit', async (t) => {
  seeded(t);
  const finished = [await aFinished(), await aFinished(), await aFinished()];
  const waiting = [await aWaiting(), await aWaiting()];
  const inFlight = [await anInFlight()];
  const all = [...finished, ...waiting, ...inFlight];
  const kinds = new Map(
    (
      await runWith(
        e(),
        judgedNow(
          e(),
          ROOT,
          all.map((id) => runRecord(id)),
        ),
      )
    ).map((s) => [s.id, kindOf(s)]),
  );
  const names = (answer: RunList) => answer.items.map((item) => item.metadata.name);
  const by = (pick: (id: string) => boolean) => all.filter(pick).sort();
  const counts = { waiting: 2, inFlight: 1, finished: 3 };
  for (const [fieldSelector, pick] of [
    ['status.state=waiting', (id: string) => kinds.get(id) === 'waiting'],
    ['status.state==inFlight', (id: string) => kinds.get(id) === 'inFlight'],
    ['status.state!=finished', (id: string) => kinds.get(id) !== 'finished'],
  ] as const) {
    const answer = await list({ fieldSelector });
    assert.deepEqual(names(answer), by(pick), fieldSelector);
    assert.deepEqual(answer.metadata.counts, counts, `${fieldSelector}: the counts are the namespace's`);
    assert.ok(
      answer.items.every((item) => FRAME.every((key) => key in item.status)),
      'every run carries the seven keys',
    );
  }
  assert.deepEqual(
    by((id) => kinds.get(id) === 'waiting'),
    [...waiting].sort(),
    'the fixture waits where kindOf says',
  );
  const done = await list({ fieldSelector: 'status.state=finished', limit: 1 });
  assert.deepEqual(names(done).length, 1);
  assert.equal(done.metadata.remainingItemCount, 2);
  assert.deepEqual(done.metadata.counts, counts, 'the counts ignore the limit');
});

test('a plain list carries no counts, no asOf and no frame key, and answers each run as the list asked by state does but for them', async (t) => {
  seeded(t);
  await aFinished();
  await aWaiting();
  await anInFlight();
  const plain = await list();
  assert.equal('counts' in plain.metadata, false);
  assert.equal('asOf' in plain.metadata, false);
  for (const item of plain.items) for (const key of FRAME) assert.equal(key in item.status, false, `${item.metadata.name} ${key}`);
  const framed = [
    ...(await list({ fieldSelector: 'status.state!=finished' })).items,
    ...(await list({ fieldSelector: 'status.state=finished' })).items,
  ].sort((a, b) => (a.metadata.name < b.metadata.name ? -1 : 1));
  assert.deepEqual(framed.map(unframed), plain.items);
});

test('a run left unjudged is named in unjudged with its state on a list asked by state: in flight, as the whole list counts it', async (t) => {
  seeded(t);
  const id = await aWaiting();
  const record = JSON.parse(fs.readFileSync(path.join(RUNS_DIR, `${id}.json`), 'utf8')) as Record<string, unknown>;
  delete record.workflow;
  fs.writeFileSync(path.join(RUNS_DIR, `${id}.json`), `${JSON.stringify({ ...record, workflowDir: path.join(ROOT, 'no-such-folder') })}\n`);
  const answer = await list({ fieldSelector: 'status.state!=finished' });
  assert.deepEqual(
    answer.unjudged?.map((one) => [one.name, one.state]),
    [[id, 'inFlight']],
  );
  assert.deepEqual(answer.metadata.counts, { waiting: 0, inFlight: 1, finished: 0 });
});

test('REFUSED Invalid, before any record is read: a field that is no state, a state that is none, a chain of terms', async (t) => {
  seeded(t);
  await aWaiting();
  for (const fieldSelector of ['spec.repo=x', 'status.state=done', 'status.state=waiting,status.state=inFlight', 'status.state']) {
    const refused = await metered(() =>
      assert.rejects(list({ fieldSelector }), (err: Error & { exitCode?: number }) => {
        assert.ok(err instanceof Invalid, String(err));
        assert.equal(err.exitCode, 2);
        return true;
      }),
    );
    assert.equal(refused.tallies?.records ?? 0, 0, `${fieldSelector}: no record read`);
  }
});

test('a waiting run and a run in flight each carry a clock whose parts add up to its wall time; the costs and the wait are the waiting row\u2019s alone', async (t) => {
  seeded(t);
  const id = await started({ plan: null, build: 'plan' }, ['plan']);
  t.mock.timers.setTime(T0 + 10 * MIN);
  engine().settle(`${id}-plan`, 'succeeded', {
    closeout: SIGNED,
    startedAt: new Date(T0).toISOString(),
    spawnedAt: new Date(T0).toISOString(),
  });
  await advanced(id);
  await anInFlight();
  t.mock.timers.setTime(T0 + 60 * MIN);

  const light = await open();
  const [row] = light.waiting;
  assert.equal(light.asOf, new Date(T0 + 60 * MIN).toISOString());
  assert.equal(row.wallMs, 60 * MIN);
  assert.equal(row.finishedAt, null);
  assert.ok(row.clock);
  assert.deepEqual(row.clock, { wallMs: 60 * MIN, sessionsMs: 10 * MIN, checksMs: 0, personMs: 50 * MIN, slotMs: 0, restMs: 0 });
  const { wallMs, ...parts } = row.clock;
  assert.equal(
    Object.values(parts).reduce((sum, ms) => sum + ms, 0),
    wallMs,
  );
  assert.deepEqual(
    row.stepCosts?.map((cost) => cost.step),
    ['plan', 'build'],
  );
  assert.equal(light.inFlight[0].stepCosts, null);
  assert.equal(light.inFlight[0].waitingSince, null);
  assert.equal(row.waitingSince, new Date(T0 + 10 * MIN).toISOString(), 'the gate was reached as plan ended');
  const moving = light.inFlight[0];
  assert.equal(moving.wallMs, 50 * MIN, 'created at 10:10, read at 11:00');
  assert.ok(moving.clock, 'a run in flight carries its clock too: the cell breaks it down');
  const { wallMs: movingWall, ...movingParts } = moving.clock;
  assert.equal(movingWall, moving.wallMs, "the clock's wall time is the row's own");
  assert.equal(
    Object.values(movingParts).reduce((sum, ms) => sum + ms, 0),
    movingWall,
  );
});

test("a finished row carries a clock frozen where its work stopped, whose parts add up to the row's own wall time", async (t) => {
  seeded(t);
  const id = await started({ work: null });
  t.mock.timers.setTime(T0 + 10 * MIN);
  engine().settle(`${id}-work`, 'succeeded', {
    closeout: SIGNED,
    startedAt: new Date(T0).toISOString(),
    spawnedAt: new Date(T0).toISOString(),
  });
  await advanced(id);
  t.mock.timers.setTime(T0 + 90 * MIN);

  const [row] = await finishedPage();
  assert.equal(row.wallMs, 10 * MIN, 'created at 10:00, its work stopped at 10:10');
  assert.ok(row.clock);
  assert.equal(row.clock.wallMs, 10 * MIN, 'read at its finish and not at now: an hour and a half later it says the same');
  assert.equal(row.clock.sessionsMs, 10 * MIN, 'the whole of it was a session at work');
  const { wallMs, ...parts } = row.clock;
  assert.equal(
    Object.values(parts).reduce((sum, ms) => sum + ms, 0),
    wallMs,
  );
});

test('a run at its second gate has waited since that gate was reached, while its clock sums both waits on a person', async (t) => {
  seeded(t);
  const stamp = (min: number) => new Date(T0 + min * MIN).toISOString();
  const id = await started({ plan: null, build: 'plan' }, ['plan', 'build']);
  t.mock.timers.setTime(T0 + 10 * MIN);
  engine().settle(`${id}-plan`, 'succeeded', { closeout: SIGNED, startedAt: stamp(0), spawnedAt: stamp(0) });
  await advanced(id);
  t.mock.timers.setTime(T0 + 30 * MIN);
  await runWith(e(), approveRun(id, 'plan'));
  await advanced(id);
  t.mock.timers.setTime(T0 + 35 * MIN);
  engine().settle(`${id}-build`, 'succeeded', { closeout: SIGNED, startedAt: stamp(30), spawnedAt: stamp(30) });
  await advanced(id);
  t.mock.timers.setTime(T0 + 60 * MIN);

  const light = await open();
  const [row] = light.waiting;
  assert.deepEqual(row.waitingOnYou, ['build'], 'the fixture waits at its second gate');
  assert.equal(row.waitingSince, stamp(35));
  assert.equal(row.clock?.personMs, 45 * MIN, '20 minutes at the first gate and 25 at the second');
  assert.equal(Date.parse(light.asOf) - Date.parse(row.waitingSince), 25 * MIN);
});

test('a run held until a person lifts the hold waits on nobody: it is not among the runs waiting on a person, and says its hold', async (t) => {
  seeded(t);
  const id = await started({ work: null });
  const placed = new Date(T0 + 5 * MIN).toISOString();
  fs.writeFileSync(path.join(RUNS_DIR, `${id}.hold`), `${JSON.stringify({ at: placed, until: [] })}\n`);
  t.mock.timers.setTime(T0 + 20 * MIN);

  const page = await open();
  assert.ok(!page.waiting.some((run) => run.id === id), 'the hold is the person’s word already given, and asks them nothing');
  const row = page.inFlight.find((run) => run.id === id);
  assert.ok(row, 'it is listed beside the other held runs');
  assert.deepEqual(row.waitingOnYou, [], 'no step of a held run waits on a person');
  assert.equal(row.holding?.waitingOnYou, false);
  assert.equal(row.holding?.at, placed);
});

test('a run that waits on a run which never lands, held until one that will, waits on a person since no instant: its hold is nobody’s to lift', async (t) => {
  seeded(t);
  const parent = await started({ work: null }, [], true);
  const lands = await anInFlight();
  const { repo } = runRecord(parent) as { repo: string };
  const child = await runPlaced(startRun({ brief: 'after it', repo, workflowDir: folder({ work: null }), after: [parent] }));
  cancelled(parent, T0 + MIN);
  fs.writeFileSync(
    path.join(RUNS_DIR, `${child.id}.hold`),
    `${JSON.stringify({ at: new Date(T0 + 5 * MIN).toISOString(), until: [lands] })}\n`,
  );
  t.mock.timers.setTime(T0 + 20 * MIN);

  const row = (await open()).waiting.find((run) => run.id === child.id);
  assert.ok(row, 'it waits on a person: the run it waits on was called off');
  assert.equal(row.waiting?.waitingOnYou, true);
  assert.equal(row.holding?.waitingOnYou, false, 'and its hold lifts by itself, once the run it names lands');
  assert.equal(row.waitingSince, null);
});

test('the finished runs page by when their work stopped, not by when they were created: a late cancellation is the last stop', async (t) => {
  seeded(t);
  const a = await started({ work: null });
  t.mock.timers.setTime(T0 + MIN);
  const b = await started({ work: null });
  t.mock.timers.setTime(T0 + 2 * MIN);
  engine().settle(`${b}-work`, 'succeeded', { closeout: SIGNED });
  await advanced(b);
  t.mock.timers.setTime(T0 + 3 * MIN);
  const c = await started({ work: null });
  t.mock.timers.setTime(T0 + 4 * MIN);
  engine().settle(`${c}-work`, 'succeeded', { closeout: SIGNED });
  await advanced(c);
  t.mock.timers.setTime(T0 + 5 * MIN);
  engine().settle(`${a}-work`, 'succeeded', { closeout: SIGNED });
  await advanced(a);
  cancelled(c, T0 + 10 * MIN);
  t.mock.timers.setTime(T0 + 20 * MIN);

  const page = await finishedPage();
  const stamp = (min: number) => new Date(T0 + min * MIN).toISOString();
  assert.deepEqual(
    page.map((run) => [run.id, run.finishedAt, run.wallMs, run.outcome]),
    [
      [c, stamp(10), 7 * MIN, 'cancelled'],
      [a, stamp(5), 5 * MIN, 'succeeded'],
      [b, stamp(2), MIN, 'succeeded'],
    ],
  );
  const byCreation = [...page].sort((x, y) => y.createdAt.localeCompare(x.createdAt)).map((run) => run.id);
  assert.deepEqual(byCreation, [c, b, a], 'the fixture finishes in another order than it was created');
  const first = await list({ fieldSelector: 'status.state=finished', limit: 2 });
  assert.deepEqual(
    first.items.map((item) => item.metadata.name),
    [c, a],
  );
  assert.ok(first.metadata.continue?.startsWith('f.'), 'the finished order has its own token');
  assert.deepEqual(
    (await finishedPage({ limit: 2, continue: first.metadata.continue })).map((run) => run.id),
    [b],
  );
});

const copies = (text: string, n: number): void => {
  for (let i = 0; i < n; i++) {
    const id = `cp-${String(i).padStart(3, '0')}`;
    fs.writeFileSync(path.join(RUNS_DIR, `${id}.json`), `${JSON.stringify({ ...JSON.parse(text), id })}\n`);
  }
};

test('a warm read by state costs the records of the runs still moving alone: as many with two hundred finished runs as with one', async (t) => {
  seeded(t);
  const model = await aFinished();
  await aWaiting();
  await anInFlight();
  const kept = cold();
  const unverified = { ...process.env, WF_VERIFY_REST: '0' };
  const asked = { fieldSelector: 'status.state!=finished' };
  const warm = async (): Promise<number | undefined> => {
    await list(asked, kept, unverified);
    return (await metered(() => list(asked, kept, unverified))).tallies?.records;
  };

  const few = await warm();
  copies(fs.readFileSync(path.join(RUNS_DIR, `${model}.json`), 'utf8'), 200);
  const many = await warm();
  assert.equal(few, 1, 'the run in flight alone, which is at rest in no memo: no record is read again for a clock');
  assert.equal(many, few, "a warm read reads no finished run's record, however many there are");

  const warmed = await list(asked, kept, unverified);
  const fresh = await list(asked);
  assert.equal(fresh.metadata.counts?.finished, 201, 'the fixture holds two hundred and one finished runs');
  assert.deepEqual(warmed, fresh, "the warm answer is a cold read's own: nothing the board shows changes");
  const page = await metered(() => list({ fieldSelector: 'status.state=finished', limit: 9 }, kept, unverified));
  assert.equal(page.tallies?.records, few, "a warm page of the finished runs reads no finished run's record");
});

test('a run held until a run that never lands waits on a person since the hold was placed', async (t) => {
  seeded(t);
  const parent = await anInFlight();
  const id = await started({ work: null });
  cancelled(parent, T0 + MIN);
  const placed = new Date(T0 + 5 * MIN).toISOString();
  fs.writeFileSync(path.join(RUNS_DIR, `${id}.hold`), `${JSON.stringify({ at: placed, until: [parent] })}\n`);
  t.mock.timers.setTime(T0 + 20 * MIN);

  const row = (await open()).waiting.find((run) => run.id === id);
  assert.ok(row, 'its hold is only a person’s to lift: the run it names was called off');
  assert.equal(row.holding?.waitingOnYou, true);
  assert.equal(row.waitingSince, placed);
});
