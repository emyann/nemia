/**
 * A factory's schedules, started by the tick over a store of its own: due at its latest fire after the schedule was written and after the
 * run it last started, once after any downtime, after the queue and under the same run slot and pause, at every level. `WF_ROOT` is read
 * as the module loads, so it is set before the import; `WF_MAX_RUNS` is read on every pass. `WF_VERIFY_REST=1` judges in full every run a
 * pass answers from its memo, and a difference throws.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';
import { TEAM } from './team.ts';
import { promised } from './promised.ts';
import { testPlace } from '../place/memory/index.ts';
import { eachTest, runOver } from './placed.ts';

const ROOT = scratch('wf-schedule-');

process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_RUNS;
delete process.env.WF_MAX_CONCURRENT;
const { addFactory, attachWorkflow, setSchedule, tickRun, runWith: runEngine } = await import('../src/runner.ts');
const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer);
const { listRuns, readRun } = await import('../src/record/record.store.ts');
const { putPause, resumePause } = await import('../src/pause/pause.store.ts');
const { main: cli } = await import('../src/cli/main.ts');
/** `nemia`, as a person types it, its commands given this test's place. */
const main = (argv: string[], e?: Parameters<typeof cli>[1]) => cli(argv, e, undefined, stand().place);
const { filesStore } = await import('../src/record/files.store.ts');

/** A fake runtime whose tasks are all `pending` once filed: a run started stays in flight, and nothing it files is ever admitted. */
const runtime = () => {
  const filed = new Map<string, string>();
  const feed: Array<{ taskId: string; event: { kind: 'filed'; at: string } }> = [];
  const view = (id: string) => ({
    id,
    phase: 'pending',
    sessionId: null,
    state: { brief: filed.has(id) ? 'filed' : '', filedAt: filed.get(id), settled: null, stopRequested: false, said: [], attempts: [] },
  });
  return promised({
    tick: async () => ({ tasks: 0, actions: [], running: {}, views: [] }),
    admit: async () => [],
    view: async (id: string) => view(id),
    file: async (spec: { id: string }) => {
      filed.set(spec.id, new Date().toISOString());
      feed.push({ taskId: spec.id, event: { kind: 'filed', at: new Date().toISOString() } });
      return spec.id;
    },
    stop: async () => {},
    logs: async () => '(no output yet)',
    feed: async (after = 0) => ({ entries: feed.slice(after), cursor: feed.length }),
    list: async (ids?: readonly string[]) => ({
      views: (ids ?? [...filed.keys()]).filter((id) => filed.has(id)).map((id) => view(id)),
      unreadable: [],
    }),
  });
};

/** A repository with one commit and the tests' team under `workflows/`, so a factory's run has a base and a folder. */
const aTeamRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stand().world.repository(repo, {});
  fs.cpSync(TEAM, path.join(repo, 'workflows'), { recursive: true });
  return repo;
};

/**
 * A store with no runs, cards, tries, pause or factories, then the factory `solo` on a repository of its own, attaching the team's `dev`,
 * and the clock at `now`. The cap as given: `undefined` unsets it.
 */
const aStore = (t: TestContext, now: string, cap?: string): string => {
  for (const dir of ['runs', 'inbox', 'queue', 'schedules', 'factories', 'nemia', 'cordon', 'tick.json']) {
    fs.rmSync(path.join(ROOT, dir), { recursive: true, force: true });
  }
  if (cap === undefined) delete process.env.WF_MAX_RUNS;
  else process.env.WF_MAX_RUNS = cap;
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(now) });
  const repo = aTeamRepo();
  addFactory({ name: 'solo', repos: [repo] });
  attachWorkflow({ factory: 'solo', workflow: 'dev' });
  return repo;
};

/** `solo` schedules `dev` at 9 AM, Montreal, each Monday — 13:00Z while daylight saving lasts. */
const weekly = () => setSchedule({ factory: 'solo', workflow: 'dev', cron: '0 9 * * 1', tz: 'America/Montreal', brief: 'Read the stats' });

/** The runs a schedule started, oldest fire first: the fire each was started for. */
const scheduledDues = (): string[] =>
  listRuns()
    .flatMap((r) => (r.scheduled ? [r.scheduled.due] : []))
    .sort();

const MONDAY = '2026-10-05T13:00:00.000Z';

test('a due schedule starts one run on a pass, whose record carries the fire it was started for, on the factory, and the next pass starts none', async (t) => {
  const repo = aStore(t, '2026-10-04T12:00:00Z');
  weekly();
  const e = runtime();
  t.mock.timers.setTime(Date.parse(MONDAY) + 30_000);
  const first = await runWith(e, tickRun());
  const [run] = listRuns();
  assert.deepEqual(first.scheduled, { factory: 'solo', workflow: 'dev', due: MONDAY, run: run?.id });
  assert.deepEqual(
    [run?.scheduled, run?.factory, run?.brief, run?.repo, run?.workflowDir],
    [{ factory: 'solo', workflow: 'dev', due: MONDAY }, 'solo', 'Read the stats', repo, path.join(repo, 'workflows', 'dev')],
  );
  assert.deepEqual(readRun(run.id).scheduled, { factory: 'solo', workflow: 'dev', due: MONDAY }, 'read back off the record');
  const second = await runWith(e, tickRun());
  assert.deepEqual([second.scheduled, scheduledDues()], [undefined, [MONDAY]]);
});

test('a pass that lands on the fire itself starts it: the latest fire is taken to the second, and Cron.prev alone is strict', async (t) => {
  aStore(t, '2026-10-04T12:00:00Z');
  weekly();
  t.mock.timers.setTime(Date.parse(MONDAY) + 400);
  await runWith(runtime(), tickRun());
  assert.deepEqual(scheduledDues(), [MONDAY]);
});

test('REFUSED while the store is paused: a due schedule starts nothing, and starts on the pass after nemia resume', async (t) => {
  aStore(t, '2026-10-04T12:00:00Z');
  weekly();
  const e = runtime();
  t.mock.timers.setTime(Date.parse(MONDAY) + 30_000);
  putPause({ why: 'a test' });
  const paused = await runWith(e, tickRun());
  assert.deepEqual([paused.scheduled, listRuns()], [undefined, []]);
  resumePause();
  const resumed = await runWith(e, tickRun());
  assert.deepEqual([resumed.scheduled && 'run' in resumed.scheduled, scheduledDues()], [true, [MONDAY]]);
});

test('REFUSED at a cap of 1 at shipped defaults: with one run in flight a due schedule starts nothing, and starts once the cap is lifted', async (t) => {
  const repo = aStore(t, '2026-10-04T12:00:00Z', '1');
  weekly();
  const e = runtime();
  await main(['start', 'By hand', '--workflows', 'dev', '--factory', 'solo', '--repo', repo], e);
  await runWith(e, tickRun());
  t.mock.timers.setTime(Date.parse(MONDAY) + 30_000);
  const held = await runWith(e, tickRun());
  assert.deepEqual([held.scheduled, scheduledDues(), listRuns().length], [undefined, [], 1]);
  process.env.WF_MAX_RUNS = '2';
  await runWith(e, tickRun());
  assert.deepEqual(scheduledDues(), [MONDAY]);
});

test('the queue goes first: a queued card and a due schedule on one pass start the card alone, and the next pass starts the schedule', async (t) => {
  aStore(t, '2026-10-04T12:00:00Z');
  weekly();
  const e = runtime();
  fs.mkdirSync(path.join(ROOT, 'inbox'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'inbox', 'a-card.md'), '---\nworkflow: dev\nfactory: solo\n---\nBuild it.\n');
  await main(['inbox', 'queue', 'a-card'], e);
  t.mock.timers.setTime(Date.parse(MONDAY) + 30_000);
  const first = await runWith(e, tickRun());
  assert.deepEqual([first.queue && 'run' in first.queue, first.scheduled, scheduledDues()], [true, undefined, []]);
  const second = await runWith(e, tickRun());
  assert.deepEqual([second.scheduled && 'run' in second.scheduled, scheduledDues()], [true, [MONDAY]]);
});

test('a daemon down across three fires starts one run, for the latest, then none', async (t) => {
  aStore(t, '2026-10-04T12:00:00Z');
  weekly();
  const e = runtime();
  t.mock.timers.setTime(Date.parse(MONDAY) + 30_000);
  await runWith(e, tickRun());
  t.mock.timers.setTime(Date.parse('2026-10-27T12:00:00Z'));
  await runWith(e, tickRun());
  await runWith(e, tickRun());
  assert.deepEqual(scheduledDues(), [MONDAY, '2026-10-26T13:00:00.000Z']);
});

test('a schedule written after its latest fire starts nothing before its next', async (t) => {
  aStore(t, '2026-10-05T14:00:00Z');
  weekly();
  const e = runtime();
  t.mock.timers.setTime(Date.parse('2026-10-05T15:00:00Z'));
  assert.equal((await runWith(e, tickRun())).scheduled, undefined);
  t.mock.timers.setTime(Date.parse('2026-10-12T13:00:05Z'));
  assert.equal((await runWith(e, tickRun())).scheduled?.due, '2026-10-12T13:00:00.000Z');
});

test('REFUSED at shipped defaults: a schedule whose start the package refuses — its workflow detached by hand — is kept refused for that fire, tried no more and said no more, and tried again at its next fire', async (t) => {
  const repo = aStore(t, '2026-10-04T12:00:00Z');
  weekly();
  const file = path.join(ROOT, 'factories', 'solo.json');
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), workflows: [] }, null, 2));
  const e = runtime();
  t.mock.timers.setTime(Date.parse(MONDAY) + 30_000);
  const refused = await runWith(e, tickRun({ repo }));
  assert.ok(refused.scheduled && 'refused' in refused.scheduled, JSON.stringify(refused.scheduled));
  assert.match(refused.scheduled.refused, /dev/);
  const kept = JSON.parse(fs.readFileSync(path.join(ROOT, 'schedules', 'solo', 'dev.json'), 'utf8'));
  assert.deepEqual([kept.due, kept.refused, kept.why], [MONDAY, true, refused.scheduled.refused]);
  assert.deepEqual([(await runWith(e, tickRun({ repo }))).scheduled, listRuns()], [undefined, []], 'not tried again for that fire');
  t.mock.timers.setTime(Date.parse('2026-10-12T13:00:05Z'));
  const next = await runWith(e, tickRun({ repo }));
  assert.equal(next.scheduled && 'refused' in next.scheduled ? next.scheduled.due : undefined, '2026-10-12T13:00:00.000Z');
});

test('a scheduled run whose files are removed, as nemia rm removes them, does not bring its fire back: the try the tick kept still says it was started', async (t) => {
  aStore(t, '2026-10-04T12:00:00Z');
  weekly();
  const e = runtime();
  t.mock.timers.setTime(Date.parse(MONDAY) + 30_000);
  const first = await runWith(e, tickRun());
  const id = first.scheduled && 'run' in first.scheduled ? first.scheduled.run : '';
  filesStore.runs.forget(id);
  assert.deepEqual(listRuns(), []);
  assert.deepEqual([(await runWith(e, tickRun())).scheduled, listRuns()], [undefined, []]);
});

test("at Manual, with no Nemia, a due schedule starts all the same: the scheduled start reads no level and no Nemia's lease", async (t) => {
  aStore(t, '2026-10-04T12:00:00Z');
  weekly();
  const e = runtime();
  await main(['level', 'manual'], e);
  await main(['level', 'manual', '--factory', 'solo'], e);
  t.mock.timers.setTime(Date.parse(MONDAY) + 30_000);
  await runWith(e, tickRun());
  assert.deepEqual(scheduledDues(), [MONDAY]);
  const source = fs.readFileSync(path.join(import.meta.dirname, '..', 'src', 'schedule', 'schedule.verb.ts'), 'utf8');
  const imports = [...source.matchAll(/^import[\s\S]*?from\s*'([^']+)';/gm)].map((m) => m[1]);
  assert.ok(imports.includes('../start/start.verb.ts'), 'the imports are read');
  assert.deepEqual(
    imports.filter((from) => /\/level\/|\/nemia\/|keep/.test(from ?? '')),
    [],
  );
});

test('across the end of daylight saving in Montreal, 2026-11-01, a daily fire at 1:30 AM is neither skipped nor doubled', async (t) => {
  aStore(t, '2026-10-30T12:00:00Z');
  setSchedule({ factory: 'solo', workflow: 'dev', cron: '30 1 * * *', tz: 'America/Montreal', brief: 'Read the stats' });
  const e = runtime();
  for (let at = Date.parse('2026-10-31T00:15:00Z'); at <= Date.parse('2026-11-02T12:15:00Z'); at += 3_600_000) {
    t.mock.timers.setTime(at);
    await runWith(e, tickRun());
  }
  assert.deepEqual(scheduledDues(), ['2026-10-31T05:30:00.000Z', '2026-11-01T05:30:00.000Z', '2026-11-02T06:30:00.000Z']);
});
