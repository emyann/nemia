/**
 * A task whose journal holds an entry no runtime wrote, beside a run whose tasks read: the runtime leaves the task out of its pass and says
 * why (`TickReport.unreadable`), and the tick leaves the run it belongs to unjudged and says so, while every other run advances — through
 * `tick` and `nemia tick`, never a throw that stops the daemon. Walked through the runtime itself, `plainEngine` over an in-memory
 * journal that hands back what was put in it, as a store does, and a harness the test signs by hand, as rest-store.test.ts does.
 *
 * `WF_ROOT` is set before the runner is imported, which reads it as the module loads; `WF_MAX_CONCURRENT` admits sessions enough for both
 * runs, and no cap is set on runs.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { nameFor, Engine, type Sighting } from 'agent-runtime';
import { asyncStore, type AsyncJournal, asyncOps, type AsyncRunner } from './promised.ts';
import { scratch } from './scratch.ts';
import { Effect } from 'effect';
import { plainEngine } from './promised.ts';
import { runGiven, runOver } from './placed.ts';
import { testPlace } from '../place/memory/index.ts';

const place = testPlace();
const stand = () => place;
const ROOT = scratch('wf-unreadable-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
process.env.WF_MAX_CONCURRENT = '10';
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_RUNS;
const { startRun, runWith: runEngine } = await import('../src/runner.ts');
const runWith = runOver(runEngine, () => stand().layer);
const runPlaced = runGiven(() => stand().layer);
const { readRun } = await import('../src/record/record.store.ts');
const { tickRun } = await import('../src/tick/tick.verb.ts');
const { main } = await import('../src/cli/main.ts');
const { readFeed } = await import('../src/feed/feed.store.ts');
const { REMOVED } = await import('../src/feed/feed.ts');

const REPO = fs.mkdtempSync(path.join(ROOT, 'repo-'));
stand().world.repository(REPO, {});

const FOLDER = fs.mkdtempSync(path.join(ROOT, 'wf-'));
fs.writeFileSync(path.join(FOLDER, 'work.md'), '---\nplace: git\nharness: codex\n---\nwork it\n');

/** What no runtime writes: a `measured` whose turns are a word. */
const MISWRITTEN = { kind: 'measured', at: '2026-09-28T00:00:00Z', attempt: 1, usage: { turns: 'three' } };

const tasks = new Map<string, unknown[]>();
/** When the journal says each attempt began, in milliseconds, by its session's name: a closeout counts only when made after it. */
const starts = new Map<string, number>();
const journal: AsyncJournal = {
  async append(taskId, event) {
    tasks.set(taskId, [...(tasks.get(taskId) ?? []), event]);
    if (event.kind === 'starting') starts.set(nameFor(taskId, event.attempt), Date.parse(event.at));
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
const signAll = () => {
  for (const [name, s] of sessions)
    if (s.state === 'working')
      sessions.set(name, {
        ...s,
        state: 'completed',
        busy: false,
        closeout: { payload: { outcome: 'done', summary: 'did it', artifacts: [], needs: null }, at: starts.get(name)! + 1 },
      });
};

const printedBy = async (t: TestContext, argv: string[]) => {
  const out: string[] = [];
  const err: string[] = [];
  const log = t.mock.method(console, 'log', (...a: unknown[]) => void out.push(a.map(String).join(' ')));
  const error = t.mock.method(console, 'error', (...a: unknown[]) => void err.push(a.map(String).join(' ')));
  try {
    await main(argv, e, undefined, stand().place);
  } finally {
    log.mock.restore();
    error.mock.restore();
  }
  return { out, err };
};

test('a run whose task journal holds an entry no runtime wrote is left out of the pass and said, while the run beside it finishes', async (t) => {
  const bad = await runPlaced(startRun({ brief: 'the bad one', repo: REPO, workflowDir: FOLDER }));
  const good = await runPlaced(startRun({ brief: 'the good one', repo: REPO, workflowDir: FOLDER }));
  for (let k = 0; k < 3; k++) await runWith(e, tickRun({ repo: ROOT }));
  const badTask = readRun(bad.id).steps.work.taskId!;
  assert.match((await Effect.runPromise(e.view(badTask))).phase, /^(working|quiescent)$/, 'both runs at work before the journal is spoiled');
  assert.match((await Effect.runPromise(e.view(readRun(good.id).steps.work.taskId!))).phase, /^(working|quiescent)$/);

  tasks.get(badTask)!.push(MISWRITTEN);
  signAll();
  let pass = await runWith(e, tickRun({ repo: ROOT }));
  for (let k = 0; k < 3 && pass.runs.find((a) => a.run.id === good.id)?.status !== 'succeeded'; k++)
    pass = await runWith(e, tickRun({ repo: ROOT }));

  assert.equal(pass.runs.find((a) => a.run.id === good.id)?.status, 'succeeded', 'the good run finished');
  assert.equal(
    pass.runs.find((a) => a.run.id === bad.id),
    undefined,
    'the bad run is not judged on a journal that does not read',
  );
  const entry = `${badTask}'s journal, entry ${tasks.get(badTask)!.length} is a \`measured\` event, and its \`usage.turns\``;
  assert.ok(
    pass.unreadable?.some((w) => w.startsWith(`${bad.id} is not advanced while a task it reads is unreadable: ${entry}`)),
    JSON.stringify(pass.unreadable),
  );
  assert.equal(pass.unreadable?.filter((w) => w.includes(entry)).length, 1, `said once, by the run: ${JSON.stringify(pass.unreadable)}`);
  assert.deepEqual(
    readFeed().lines.filter((l) => 'run' in l && l.run === bad.id && l.word === REMOVED),
    [],
    'the feed does not say the run was removed',
  );

  const { out, err } = await printedBy(t, ['tick']);
  assert.ok(
    err.some((l) => l.startsWith(`left out: ${bad.id} is not advanced while a task it reads is unreadable: ${entry}`)),
    err.join('\n'),
  );
  assert.ok(
    out.some((l) => l.startsWith(`${good.id}  succeeded`)),
    out.join('\n'),
  );
  assert.ok(!out.includes('no runs'));
});
