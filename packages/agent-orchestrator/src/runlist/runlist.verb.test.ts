/**
 * The runs in two reads (`runsOpen`, `runsFinished`), through their entries of the command table (`RUNS_OPEN`, `RUNS_FINISHED`), on a
 * store of runs started and advanced over the stand-ins: together they say what the whole list says (`RUNS`), each run once; the finished
 * runs page by when their work stopped; the light answer does not grow with the finished runs, and read warm costs no record of one;
 * and a page asked wrongly is refused.
 *
 * `WF_ROOT` is set before the package is imported, since the store reads it as it loads; each test empties the store's runs first, and
 * a test that compares two answers, or orders runs by time, seeds `Date`.
 */
import { beforeEach, test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { testEngine } from 'agent-runtime/testing';
import { scratch } from '../../test/scratch.ts';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runGiven, runOver } from '../../test/placed.ts';

const ROOT = scratch('wf-runlist-');
const RUNS_DIR = path.join(ROOT, 'runs');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
process.env.WF_DEFAULT_FACTORY_STARTS = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const { RUNS, RUNS_FINISHED, RUNS_OPEN } = await import('../command/pages.verb.ts');
const { advanceRun, approveRun, startRun, runWith: runEngine } = await import('../runner.ts');
const { Invalid } = await import('../refusal/refusal.ts');
const { readRun } = await import('../record/record.store.ts');
const { engineOf } = await import('../runtime-client.ts');
const { metered } = await import('../meter/tally.store.ts');
const { restingMemo } = await import('../rest/resting.verb.ts');
type FinishedPage = import('./runlist.verb.ts').FinishedPage;
type OpenRuns = import('./runlist.verb.ts').OpenRuns;
type RunSummary = import('../summary/summary.verb.ts').RunSummary;

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
  await runWith(e(), advanceRun(readRun(run.id)));
  return run.id;
};

/** One more pass over the run `id`. */
const advanced = (id: string) => runWith(e(), advanceRun(readRun(id)));

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

/** The record of the run `id` rewritten with `more` over it, as a start in a factory writes its name. */
const rewritten = (id: string, more: object): void => {
  const file = path.join(RUNS_DIR, `${id}.json`);
  fs.writeFileSync(file, `${JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), ...more }, null, 2)}\n`);
};

/** A person's cancellation of the run `id`, written beside its record as `nemia cancel` writes it. */
const cancelled = (id: string, at: number): void => fs.writeFileSync(path.join(RUNS_DIR, `${id}.cancelled`), new Date(at).toISOString());

const wholeList = async (): Promise<RunSummary[]> => await runWith(e(), RUNS.handler({}, process.env));
const open = async (args: Record<string, string> = {}): Promise<OpenRuns> => await runWith(e(), RUNS_OPEN.handler(args, process.env));
const finishedPage = async (args: Record<string, string> = {}): Promise<FinishedPage> =>
  await runWith(e(), RUNS_FINISHED.handler(args, process.env));

/** Every page of the finished runs, `size` rows a page, from the first to the last the first names. */
const everyPage = async (size: number, factory?: string): Promise<FinishedPage[]> => {
  const given = { size: String(size), ...(factory === undefined ? {} : { factory }) };
  const first = await finishedPage({ ...given, page: '1' });
  const rest: FinishedPage[] = [];
  for (let page = 2; page <= first.pages; page++) rest.push(await finishedPage({ ...given, page: String(page) }));
  return [first, ...rest];
};

/** A row of either read as the whole list answers the run: without what the two reads add. */
const summaryOf = (row: object): object => {
  const {
    wallMs: _w,
    finishedAt: _f,
    outcome: _o,
    clock: _c,
    stepCosts: _s,
    waitingSince: _p,
    ...summary
  } = row as Record<string, unknown>;
  return summary;
};

/** That the two reads of `factory` say what `whole` says: each run once, the counts adding up, each row the whole list's own. */
const assertParity = async (whole: RunSummary[], factory?: string) => {
  const light = await open(factory === undefined ? {} : { factory });
  const pages = await everyPage(2, factory);
  const rows = [...light.waiting, ...light.inFlight, ...pages.flatMap((page) => page.runs)];
  const ids = rows.map((run) => run.id);
  assert.equal(new Set(ids).size, ids.length, `no run twice: ${ids.join(' ')}`);
  assert.deepEqual([...ids].sort(), whole.map((run) => run.id).sort(), 'every run of the whole list, and no other');
  const { waiting, inFlight, finished } = light.counts;
  assert.equal(waiting + inFlight + finished, whole.length, 'the three counts add up to the whole list');
  assert.deepEqual([waiting, inFlight], [light.waiting.length, light.inFlight.length]);
  assert.equal(pages[0].total, finished);
  assert.equal(pages.flatMap((page) => page.runs).length, finished);
  for (const row of rows)
    assert.deepEqual(
      summaryOf(row),
      whole.find((run) => run.id === row.id),
      row.id,
    );
  return { light, pages };
};

const seeded = (t: TestContext, now = T0) => t.mock.timers.enable({ apis: ['Date'], now });

test('the two reads say what the whole list says: each run in the light answer or on one finished page, once, for all factories and for one', async (t) => {
  seeded(t);
  const finished = [await aFinished(), await aFinished(), await aFinished(), await aFinished(), await aFinished()];
  const waiting = [await aWaiting(), await aWaiting()];
  const inFlight = [await anInFlight(), await anInFlight()];
  for (const id of [finished[0], finished[1], waiting[0], inFlight[0]]) rewritten(id, { factory: 'nemia' });
  for (const id of [finished[2], inFlight[1]]) rewritten(id, { factory: 'pipao' });

  const whole = await wholeList();
  assert.equal(whole.length, 9);
  const all = await assertParity(whole);
  assert.deepEqual(all.light.counts, { waiting: 2, inFlight: 2, finished: 5 });
  assert.deepEqual(all.light.waiting.map((run) => run.id).sort(), [...waiting].sort());
  assert.deepEqual(all.light.inFlight.map((run) => run.id).sort(), [...inFlight].sort());
  assert.equal(all.pages.length, 3, 'five finished runs, two a page');

  const ofFactory = (name: string) => whole.filter((run) => (run.factory ?? 'default') === name);
  assert.deepEqual((await assertParity(ofFactory('nemia'), 'nemia')).light.counts, { waiting: 1, inFlight: 1, finished: 2 });
  assert.deepEqual((await assertParity(ofFactory('pipao'), 'pipao')).light.counts, { waiting: 0, inFlight: 1, finished: 1 });
  assert.deepEqual((await assertParity(ofFactory('default'), 'default')).light.counts, { waiting: 1, inFlight: 0, finished: 2 });
  assert.deepEqual((await assertParity([], 'no-such-factory')).light.counts, { waiting: 0, inFlight: 0, finished: 0 });
});

test('a run that moves and also waits is among the waiting, once; a cancelled run whose step waited is finished, cancelled', async (t) => {
  seeded(t);
  const both = await started({ plan: null, side: null }, ['plan'], true);
  engine().settle(`${both}-plan`, 'succeeded', { closeout: SIGNED });
  engine().settle(`${both}-side`, 'working');
  await advanced(both);
  const called = await aWaiting();
  cancelled(called, T0 + 5 * MIN);

  const whole = await wholeList();
  assert.equal(whole.find((run) => run.id === both)?.moving, true, 'the fixture moves');
  assert.deepEqual(whole.find((run) => run.id === both)?.waitingOnYou, ['plan'], 'and waits');
  const { light, pages } = await assertParity(whole);
  assert.deepEqual(
    light.waiting.map((run) => run.id),
    [both],
  );
  assert.deepEqual(light.inFlight, []);
  assert.deepEqual(
    pages[0].runs.map((run) => [run.id, run.outcome, run.finishedAt]),
    [[called, 'cancelled', new Date(T0 + 5 * MIN).toISOString()]],
  );
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
  assert.equal('stepCosts' in light.inFlight[0], false);
  assert.equal('waitingSince' in light.inFlight[0], false);
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

  const [row] = (await finishedPage()).runs;
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

test('a run held until a person lifts the hold has waited since the hold was placed', async (t) => {
  seeded(t);
  const id = await started({ work: null });
  const placed = new Date(T0 + 5 * MIN).toISOString();
  fs.writeFileSync(path.join(RUNS_DIR, `${id}.hold`), `${JSON.stringify({ at: placed, until: [] })}\n`);
  t.mock.timers.setTime(T0 + 20 * MIN);

  const [row] = (await open()).waiting;
  assert.equal(row.id, id);
  assert.deepEqual(row.waitingOnYou, [], 'no step of a held run waits on a person');
  assert.equal(row.waitingSince, placed);
});

test('a run that waits on a run which never lands, held until one that will, waits on a person since no instant: its hold is nobody’s to lift', async (t) => {
  seeded(t);
  const parent = await started({ work: null }, [], true);
  const lands = await anInFlight();
  const { repo } = readRun(parent) as { repo: string };
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
    page.runs.map((run) => [run.id, run.finishedAt, run.wallMs]),
    [
      [c, stamp(10), 7 * MIN],
      [a, stamp(5), 5 * MIN],
      [b, stamp(2), MIN],
    ],
  );
  const byCreation = [...page.runs].sort((x, y) => y.createdAt.localeCompare(x.createdAt)).map((run) => run.id);
  assert.deepEqual(byCreation, [c, b, a], 'the fixture finishes in another order than it was created');
  assert.deepEqual([page.page, page.size, page.total, page.pages], [1, 9, 3, 1], 'asked without a page or a size: page 1 of nine');
  assert.deepEqual(
    (await finishedPage({ size: '2', page: '2' })).runs.map((run) => run.id),
    [b],
  );
});

test('the light answer does not grow with the finished runs: the same answer, but for its count, with none and with two hundred', async (t) => {
  seeded(t);
  const model = await aFinished();
  const record = fs.readFileSync(path.join(RUNS_DIR, `${model}.json`), 'utf8');
  for (const file of fs.readdirSync(RUNS_DIR)) if (file.startsWith(model)) fs.rmSync(path.join(RUNS_DIR, file), { recursive: true });
  await aWaiting();
  await anInFlight();
  await anInFlight();

  const before = await open();
  assert.deepEqual(before.counts, { waiting: 1, inFlight: 2, finished: 0 });
  for (let n = 0; n < 200; n++) {
    const id = `${model}-copy-${String(n).padStart(3, '0')}`;
    fs.writeFileSync(path.join(RUNS_DIR, `${id}.json`), `${JSON.stringify({ ...JSON.parse(record), id })}\n`);
  }
  const after = await open();
  assert.equal(after.counts.finished, 200);
  assert.deepEqual({ ...after, counts: { ...after.counts, finished: 0 } }, before);
  assert.equal((await finishedPage({ page: '23' })).runs.length, 2, 'two hundred finished runs, nine a page: two on the last');
});

/** `n` more finished runs in the store, each a copy of the record `text` under an id of its own. */
const copies = (text: string, n: number): void => {
  for (let i = 0; i < n; i++) {
    const id = `cp-${String(i).padStart(3, '0')}`;
    fs.writeFileSync(path.join(RUNS_DIR, `${id}.json`), `${JSON.stringify({ ...JSON.parse(text), id })}\n`);
  }
};

test('a warm read of the open runs costs the records of the open runs alone: as many with two hundred finished runs as with one', async (t) => {
  seeded(t);
  const model = await aFinished();
  await aWaiting();
  await anInFlight();
  const kept = { runs: restingMemo<Omit<RunSummary, 'startedAt'>>(), filings: { filed: new Map(), cursor: 0 } };
  const unverified = { ...process.env, WF_VERIFY_REST: '0' };
  const warm = async (): Promise<number | undefined> => {
    await runWith(e(), RUNS_OPEN.handler({}, unverified, ROOT, kept));
    return (await metered(() => runWith(e(), RUNS_OPEN.handler({}, unverified, ROOT, kept)))).tallies?.records;
  };

  const few = await warm();
  copies(fs.readFileSync(path.join(RUNS_DIR, `${model}.json`), 'utf8'), 200);
  const many = await warm();
  assert.equal(few, 3, "the run in flight, which is at rest in no memo, and the two open runs' records, read for their clocks");
  assert.equal(many, few, "a warm read reads no finished run's record, however many there are");

  const warmed = await runWith(e(), RUNS_OPEN.handler({}, unverified, ROOT, kept));
  const cold = await open();
  assert.equal(cold.counts.finished, 201, 'the fixture holds two hundred and one finished runs');
  assert.deepEqual(warmed, cold, "the warm answer is a cold read's own: nothing the board shows changes");
});

test('REFUSED by kind: a page that is no whole number from 1, and a size that is none from 1 to 100', async () => {
  const refused = (args: Record<string, string>, said: string) =>
    assert.rejects(finishedPage(args), (err: Error) => {
      assert.ok(err instanceof Invalid, `${JSON.stringify(args)}: ${String(err)}`);
      assert.equal(err.message, `the finished runs are read a page at a time: ${said}`);
      return true;
    });
  for (const page of ['0', '-1', '1.5', 'abc', ''])
    await refused({ page }, `page takes a whole number from 1, as in page=2, and \`${page}\` is none.`);
  for (const size of ['0', '101', 'abc'])
    await refused({ size }, `size takes a whole number from 1 to 100, as in size=9, and \`${size}\` is none.`);
});

test('a page past the last answers an empty page, with the total and the pages there are', async (t) => {
  seeded(t);
  await aFinished();
  const past = await finishedPage({ page: '7' });
  assert.deepEqual([past.runs, past.total, past.page, past.pages], [[], 1, 7, 1]);
});
