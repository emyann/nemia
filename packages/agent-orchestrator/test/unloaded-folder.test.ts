/**
 * A run that froze no workflow at `nemia start`, whose workflow folder does not load — a step file that says no `place:`, as the folders of
 * the runs started before a workflow was frozen on the record say, or a folder that is gone — beside a run whose steps read: the tick
 * leaves the first unjudged and says so, while every other run is filed, and `nemia tick`, `nemia ls`, a pause and `nemia up` each go
 * on; once the folder is mended, the next pass reads it and the run goes on, nothing remembered. Walked through the runtime itself,
 * `plainEngine` over an in-memory journal, as unreadable-journal.test.ts does.
 *
 * `WF_ROOT` is set before the runner is imported, which reads it as the module loads; `WF_MAX_CONCURRENT` admits sessions enough for
 * every run, and no cap is set on runs but in the test that counts the slots.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Engine, type Sighting } from 'agent-runtime';
import { Effect } from 'effect';
import { asyncStore, type AsyncJournal, asyncOps, type AsyncRunner, plainEngine } from './promised.ts';
import { scratch } from './scratch.ts';
import { runGiven, runOver } from './placed.ts';
import { testPlace } from '../place/memory/index.ts';

const place = testPlace();
const stand = () => place;
const ROOT = scratch('wf-unloaded-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
process.env.WF_MAX_CONCURRENT = '10';
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_RUNS;
const { startRun, runWith: runEngine } = await import('../src/runner.ts');
const runWith = runOver(runEngine, () => stand().layer);
const runPlaced = runGiven(() => stand().layer);
const { readRun, runFile } = await import('../src/record/record.store.ts');
const { tickRun } = await import('../src/tick/tick.verb.ts');
const { slotsRead } = await import('../src/cap/cap.verb.ts');
const { main } = await import('../src/cli/main.ts');
const { readFeed } = await import('../src/feed/feed.store.ts');
const { REMOVED } = await import('../src/feed/feed.ts');
const { putPause, resumePause } = await import('../src/pause/pause.store.ts');
const { judgedNow } = await import('../src/summary/summary.verb.ts');
const { workflowsOf } = await import('../src/summary/reads.verb.ts');
const { loadWorkflows } = await import('../src/folder/folder.store.ts');

const REPO = fs.mkdtempSync(path.join(ROOT, 'repo-'));
stand().world.repository(REPO, {});

const PLACED = '---\nplace: git\nharness: codex\n---\nwork it\n';
const FOLDER = fs.mkdtempSync(path.join(ROOT, 'wf-'));
fs.writeFileSync(path.join(FOLDER, 'work.md'), PLACED);

/** A folder whose one step says no `place:`, as the folders of the runs started before a workflow was frozen on the record say. */
const UNPLACED = fs.mkdtempSync(path.join(ROOT, 'unplaced-'));
fs.writeFileSync(path.join(UNPLACED, 'work.md'), '---\nharness: codex\n---\nwork it\n');

const tasks = new Map<string, unknown[]>();
const journal: AsyncJournal = {
  async append(taskId, event) {
    tasks.set(taskId, [...(tasks.get(taskId) ?? []), event]);
  },
  async read(taskId) {
    return [...(tasks.get(taskId) ?? [])] as Awaited<ReturnType<AsyncJournal['read']>>;
  },
  async list() {
    return [...tasks.keys()].sort();
  },
  async feed() {
    return { entries: [], cursor: 0 };
  },
};

const sessions = new Map<string, Sighting>();
const runner: AsyncRunner = {
  async spawn(r) {
    sessions.set(r.name, { sessionId: `s-${sessions.size + 1}`, nativeId: `n-${sessions.size + 1}`, state: 'working', busy: true });
  },
  async observe() {
    return new Map(sessions);
  },
  async stop() {},
  async logs() {
    return '';
  },
};
const e = plainEngine(
  Engine.layer({
    root: fs.mkdtempSync(path.join(ROOT, 'engine-')),
    journal: asyncStore(journal),
    harnesses: { claude: asyncOps(runner), codex: asyncOps(runner), check: asyncOps(runner) },
    defaultHarness: 'claude',
  }),
);

const printedBy = async (t: TestContext, argv: string[], engine = e) => {
  const out: string[] = [];
  const err: string[] = [];
  const log = t.mock.method(console, 'log', (...a: unknown[]) => void out.push(a.map(String).join(' ')));
  const error = t.mock.method(console, 'error', (...a: unknown[]) => void err.push(a.map(String).join(' ')));
  let threw: unknown;
  try {
    await main(argv, engine, undefined, stand().place);
  } catch (caught) {
    threw = caught;
  } finally {
    log.mock.restore();
    error.mock.restore();
  }
  return { out, err, threw };
};

const started = (brief: string) => runPlaced(startRun({ brief, repo: REPO, workflowDir: FOLDER }));

/** The run's record as an early tick wrote it: no workflow frozen on it, its steps read off `dir` on every pass. */
const unfrozen = (id: string, dir: string): void => {
  const { workflow: _, ...record } = JSON.parse(fs.readFileSync(runFile(id), 'utf8')) as Record<string, unknown>;
  fs.writeFileSync(runFile(id), `${JSON.stringify({ ...record, workflowDir: dir }, null, 2)}\n`);
};

const LEFT_OUT = (id: string) => `${id} is not advanced while its workflow folder does not load: run ${id}: it froze no workflow`;

const bad = await started('the unfrozen one');
unfrozen(bad.id, UNPLACED);

test('a run whose unfrozen folder says no place: is left out of the pass and said, while the run beside it files', async (t) => {
  const good = await started('the good one');
  const pass = await runWith(e, tickRun({ repo: ROOT }));

  assert.deepEqual(pass.runs.find((a) => a.run.id === good.id)?.filed, ['work'], 'the good run filed its step');
  assert.equal(
    pass.runs.find((a) => a.run.id === bad.id),
    undefined,
    'the unfrozen run is not judged',
  );
  const said = pass.unreadable?.filter((w) => w.startsWith(LEFT_OUT(bad.id))) ?? [];
  assert.equal(said.length, 1, JSON.stringify(pass.unreadable));
  assert.match(said[0], /work: says no `place:`/);
  assert.match(said[0], new RegExp(`or nemia rm ${bad.id}\\.$`));
  assert.equal(readRun(bad.id).steps.work?.taskId ?? null, null, 'nothing of it filed');
  assert.deepEqual(
    readFeed().lines.filter((l) => 'run' in l && l.run === bad.id && l.word === REMOVED),
    [],
    'the feed does not say the run was removed',
  );

  const { out, err, threw } = await printedBy(t, ['tick']);
  assert.equal(threw, undefined);
  assert.ok(
    err.some((l) => l.startsWith(`left out: ${LEFT_OUT(bad.id)}`)),
    err.join('\n'),
  );
  assert.ok(
    out.some((l) => l.startsWith(`${good.id}  `)),
    out.join('\n'),
  );
});

test('a run whose unfrozen folder is gone is left out of the pass the same, its step at work beside it', async () => {
  const gone = await started('the folder taken away');
  await runWith(e, tickRun({ repo: ROOT }));
  assert.ok(readRun(gone.id).steps.work?.taskId, 'its step filed while the folder read');
  unfrozen(gone.id, path.join(ROOT, 'no-such-folder'));

  const pass = await runWith(e, tickRun({ repo: ROOT }));
  assert.equal(
    pass.runs.find((a) => a.run.id === gone.id),
    undefined,
  );
  assert.ok(
    pass.unreadable?.some((w) => w.startsWith(LEFT_OUT(gone.id)) && w.includes('no workflow folder at')),
    JSON.stringify(pass.unreadable),
  );
});

test('under a pause, a pass and `nemia ls` over a run at work whose folder stops loading finish, its finishing tasks read without it', async (t) => {
  const working = await started('at work when its folder goes');
  for (let k = 0; k < 3; k++) await runWith(e, tickRun({ repo: ROOT }));
  const taskId = readRun(working.id).steps.work.taskId!;
  assert.match((await Effect.runPromise(e.view(taskId))).phase, /^running/, 'its step at work before its folder goes');
  unfrozen(working.id, path.join(ROOT, 'no-folder-at-work'));
  putPause({ why: 'a test pauses', by: 'ann' });
  t.after(() => resumePause());

  const pass = await runWith(e, tickRun({ repo: ROOT }));
  assert.ok(pass.pause, 'the pass read the pause');
  assert.ok(
    pass.unreadable?.some((w) => w.startsWith(LEFT_OUT(working.id))),
    JSON.stringify(pass.unreadable),
  );
  assert.ok(!pass.pause.finishing.some((f) => f.run === working.id));

  const { out, threw } = await printedBy(t, ['ls']);
  assert.equal(threw, undefined);
  assert.ok(
    out.some((l) => l.includes(`→ unreadable: ${working.id}'s workflow folder does not load, so nemia ls does not judge the run`)),
    out.join('\n'),
  );
});

test("nemia ls says the run with the folder's words and lists its steps off its record, and fails nothing", async (t) => {
  const { out, threw } = await printedBy(t, ['ls']);
  assert.equal(threw, undefined);
  assert.ok(
    out.some((l) => l.includes(`→ unreadable: ${bad.id}'s workflow folder does not load, so nemia ls does not judge the run`)),
    out.join('\n'),
  );
});

test("the board answers the run unjudged and running, in the folder's words, its steps off its record", async () => {
  const [one] = await runWith(e, judgedNow(e, ROOT, [readRun(bad.id)]));
  assert.equal(one.status, 'running');
  assert.ok(
    one.unreadable?.startsWith(`${bad.id}'s workflow folder does not load, so the board does not judge the run`),
    one.unreadable ?? '',
  );
  assert.match(one.unreadable ?? '', /work: says no `place:`/);
  assert.deepEqual(
    one.steps.map((s) => s.name),
    ['work'],
  );
});

test('the cap counts the run in flight, as the pass does', async (t) => {
  process.env.WF_MAX_RUNS = '9';
  t.after(() => delete process.env.WF_MAX_RUNS);
  await runWith(e, tickRun({ repo: ROOT }));
  const slots = await runWith(e, slotsRead());
  assert.ok(slots.inFlight?.includes(bad.id), JSON.stringify(slots.inFlight));
});

test('`nemia up` over a store holding such a run ends no daemon: it passes again and again, and says the run once', async (t) => {
  const STOP = new Error('the test stops the daemon');
  let ticks = 0;
  const counted: typeof e = { ...e, tick: () => (++ticks > 3 ? Effect.die(STOP) : e.tick()) };
  const { out, err, threw } = await printedBy(t, ['up', '1'], counted);
  assert.equal(threw, STOP, `the daemon ended of what stopped it, after three passes: ${String(threw)}`);
  const said = [...out, ...err].filter((l) => l.includes(`left out: ${LEFT_OUT(bad.id)}`));
  assert.equal(said.length, 1, [...out, ...err].join('\n'));
});

test("REFUSED: an unfrozen run whose folder does not load is warned in the folder's words alone", () => {
  const run = readRun(bad.id);
  const loaded = (() => {
    try {
      loadWorkflows(UNPLACED, { repo: run.repo, home: ROOT });
      return 'it loaded';
    } catch (err) {
      return (err as Error).message;
    }
  })();
  assert.deepEqual(workflowsOf(run, ROOT), {
    steps: null,
    warning: `The workflow folder ${UNPLACED} no longer reads as a workflow: ${/[.!?]$/.test(loaded) ? loaded : `${loaded}.`}`,
  });
  assert.ok(!workflowsOf(run, ROOT).warning?.includes('..'), String(workflowsOf(run, ROOT).warning));
  const gone = path.join(ROOT, 'no-such-folder');
  assert.deepEqual(workflowsOf({ ...run, workflowDir: gone }, ROOT), { steps: null, warning: `The workflow folder ${gone} is gone.` });
});

test('the run goes on once its folder is mended, on the next pass, with nothing remembered', async () => {
  fs.writeFileSync(path.join(UNPLACED, 'work.md'), PLACED);
  const pass = await runWith(e, tickRun({ repo: ROOT }));
  assert.deepEqual(pass.runs.find((a) => a.run.id === bad.id)?.filed, ['work']);
  assert.ok(!pass.unreadable?.some((w) => w.startsWith(LEFT_OUT(bad.id))), JSON.stringify(pass.unreadable));
});

test("an unfrozen run whose step names an agent only its repository's `.claude/agents/` holds is read with its places, and filed", async () => {
  const named = fs.mkdtempSync(path.join(ROOT, 'named-'));
  fs.writeFileSync(path.join(named, 'work.md'), '---\nplace: git\nagent: repo-only\n---\nwork it\n');
  fs.mkdirSync(path.join(REPO, '.claude', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(REPO, '.claude', 'agents', 'repo-only.md'), '---\nharness: codex\n---\nYou work.\n');
  assert.throws(() => loadWorkflows(named), 'the folder alone does not read: nothing beside it holds the agent');
  const run = await started('the agent is the repository own');
  unfrozen(run.id, named);

  const pass = await runWith(e, tickRun({ repo: ROOT }));
  assert.ok(!pass.unreadable?.some((w) => w.startsWith(LEFT_OUT(run.id))), JSON.stringify(pass.unreadable));
  assert.deepEqual(pass.runs.find((a) => a.run.id === run.id)?.filed, ['work']);
});
