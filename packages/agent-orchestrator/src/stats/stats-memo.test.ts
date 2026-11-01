/**
 * The stats' memo of each run's facts (`StatsMemo`, stats.verb.ts), told as one story of a serving process's memo across its calls: a call
 * through it reads again only the runs whose inputs changed — its files in the store (their stamp), its tasks' journals (the engine's
 * feed) — and never keeps a run in flight, a run read off its folder, nor one a journal of which does not read; it answers what a call
 * without it answers. Beside the story, the race of two calls overlapping, as a test of its own.
 *
 * It stays on the runtime itself, where the feed is: the engine's stand-in answers an empty feed, and the memo's claims are what a line
 * on the feed takes out.
 *
 * Walked through the runtime itself, `plainEngine` over an in-memory journal whose feed every append reaches, as the runtime's own
 * journal does, and the engine's `view` counted by task id. A file of its own, since `stats` reads every run under `WF_ROOT`, read as the
 * store loads, so it is set before the import.
 */
import { test } from 'node:test';
import { story } from '../../test/checkpoints.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { asyncStore, type AsyncJournal, asyncOps, type AsyncRunner } from '../../test/promised.ts';
import { Engine } from 'agent-runtime';
import { scratch } from '../../test/scratch.ts';
import { Effect } from 'effect';
import { plainEngine } from '../../test/promised.ts';

const ROOT = scratch('wf-stats-memo-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
process.env.WF_ROOT = ROOT;
const { freshStatsMemo, statsRun } = await import('./stats.verb.ts');
const { runWith } = await import('../runtime-client.ts');

type Event = Parameters<AsyncJournal['append']>[1];

/** Every task whose journal does not read: the engine rejects its view with the `JournalError` a store's failure becomes. */
const spoiled = new Set<string>();

/** The engine's store, in memory: every append reaches the feed; a task in `spoiled` does not read. */
const memoryJournal = (): AsyncJournal => {
  const tasks = new Map<string, Event[]>();
  const feed: Awaited<ReturnType<AsyncJournal['feed']>>['entries'] = [];
  return {
    async append(taskId, event) {
      tasks.set(taskId, [...(tasks.get(taskId) ?? []), event]);
      feed.push({ taskId, event });
    },
    async read(taskId) {
      if (spoiled.has(taskId)) throw new Error(`the journal of ${taskId} does not read`);
      return [...(tasks.get(taskId) ?? [])];
    },
    async list() {
      return [...tasks.keys()].sort();
    },
    async feed(after) {
      return { entries: feed.slice(after), cursor: feed.length };
    },
  };
};

/** A harness no task here reaches: every task is journalled by hand. */
const idle: AsyncRunner = {
  async spawn() {},
  async observe() {
    return new Map();
  },
  async stop() {},
  async logs() {
    return '';
  },
};

const journal = memoryJournal();
const engine = plainEngine(
  Engine.layer({
    root: path.join(ROOT, 'engine'),
    journal: asyncStore(journal),
    harnesses: { codex: asyncOps(idle), check: asyncOps(idle) },
    defaultHarness: 'codex',
  }),
);
/** Every task id the engine was asked to view since the last `viewedRuns`. */
let viewed: string[] = [];
/** What the next view of the task `when` names does once it has read, before it answers: another call, as a request overlapping it. */
let during: { when: string; then: () => Promise<unknown> } | undefined;
const e = {
  ...engine,
  view: (taskId: string) =>
    Effect.gen(function* () {
      viewed.push(taskId);
      const view = yield* engine.view(taskId);
      const hook = during?.when === taskId ? during : undefined;
      if (hook) {
        during = undefined;
        yield* Effect.promise(() => hook.then());
      }
      return view;
    }),
};

/** The runs whose tasks were viewed since the last call, by run id, sorted. */
const viewedRuns = (): string[] => {
  const runs = [...new Set(viewed.map((taskId) => taskId.slice(0, taskId.lastIndexOf('-'))))].sort();
  viewed = [];
  return runs;
};

const at = '2026-09-28T09:00:00.000Z';
const ended = '2026-09-28T10:00:00.000Z';
const NOW = new Date('2026-10-02T12:00:00.000Z');

/** A task filed, and where `settled`, run for an hour, signed off, measured at `costUsd` and settled. */
async function journalled(taskId: string, costUsd: number, settled: boolean): Promise<void> {
  const events: object[] = [{ kind: 'filed', at, brief: 'Do it.', cwd: ROOT, maxAttempts: 1, harness: 'codex' }];
  if (settled)
    events.push(
      { kind: 'starting', at, attempt: 1 },
      { kind: 'spawned', at, attempt: 1 },
      {
        kind: 'ended',
        at: ended,
        attempt: 1,
        sessionId: `ae/${taskId}/1`,
        observed: 'done',
        reason: 'harness',
        closeout: { outcome: 'done', summary: 'Did it.', needs: null, artifacts: [] },
      },
      { kind: 'measured', at: ended, attempt: 1, usage: { costUsd } },
      { kind: 'settled', at: ended, outcome: 'succeeded' },
    );
  for (const event of events) await journal.append(taskId, event as Event);
}

const recordFile = (id: string) => path.join(ROOT, 'runs', `${id}.json`);

/**
 * A run of one step, its workflow frozen on its record unless `unfrozen` names the folder it reads, its step's task journalled as
 * `journalled` says, its step's note `body`.
 */
async function aRun(id: string, costUsd: number, settled = true, unfrozen?: string, body = 'Implement it.'): Promise<void> {
  await journalled(`${id}-implement`, costUsd, settled);
  const workflow = [{ name: 'implement', after: [], body, harness: 'codex' }];
  fs.writeFileSync(
    recordFile(id),
    JSON.stringify({
      id,
      repo: '/repos/home',
      baseRef: 'abc',
      workspace: '/repos/home',
      branch: 'main',
      isolate: true,
      brief: `The brief of ${id}`,
      createdAt: at,
      workflowDir: unfrozen ?? '/repos/home/workflows/build',
      ...(unfrozen ? {} : { workflow }),
      steps: { implement: { taskId: `${id}-implement` } },
    }),
  );
}

await aRun('s-a', 1);
await aRun('s-b', 2);
await aRun('s-c', 3);
await aRun('s-moving', 4, false);

const FINISHED = ['s-a', 's-b', 's-c'];
const unverified = { verify: false };

/** A call through `memo`, unverified. */
const through = (memo: ReturnType<typeof freshStatsMemo>) => runWith(e, statsRun({}, NOW, { memo, ...unverified }));

/** A call with no memo, which reads every run afresh: what every call through the memo must answer. */
const afresh = () => runWith(e, statsRun({}, NOW));

test("A serving process's memo: each call reads again only the runs whose inputs changed, and answers what a fresh read answers", async (t) => {
  const s = story(t);
  const memo = freshStatsMemo();

  await s.test('the first call reads every run, and keeps every finished run and nothing of the one in flight', async () => {
    const first = await through(memo);
    assert.deepEqual(viewedRuns(), [...FINISHED, 's-moving']);
    assert.equal(memo.runs.has('s-moving'), false, 'nothing kept of the run in flight');
    assert.deepEqual(
      FINISHED.filter((id) => memo.runs.has(id)),
      FINISHED,
    );
    assert.deepStrictEqual(first, await afresh());
    viewedRuns();
  });

  await s.test(
    'a second call on a store whose runs are as they were views no task of a finished run, and reads the one in flight',
    async () => {
      const second = await through(memo);
      assert.deepEqual(viewedRuns(), ['s-moving']);
      assert.deepStrictEqual(second, await afresh());
      viewedRuns();
    },
  );

  await s.test('a run whose files in the store changed is read again, and no other', async () => {
    fs.writeFileSync(path.join(ROOT, 'runs', 's-b.cancelled'), `${ended}\n`);
    const answer = await through(memo);
    assert.deepEqual(viewedRuns(), ['s-b', 's-moving']);
    assert.deepStrictEqual(answer, await afresh());
    fs.rmSync(path.join(ROOT, 'runs', 's-b.cancelled'));
    await through(memo);
    viewedRuns();
  });

  await s.test("a line on the engine's feed for a run's task takes the run out of the memo, and no other", async () => {
    await journal.append('s-c-implement', { kind: 'measured', at: ended, attempt: 1, usage: { costUsd: 5 } });
    const answer = await through(memo);
    assert.deepEqual(viewedRuns(), ['s-c', 's-moving']);
    assert.deepStrictEqual(answer, await afresh());
    viewedRuns();
  });

  await s.test('a run gone from the store is gone from the memo and from the answer', async () => {
    await aRun('s-gone', 7);
    await through(memo);
    assert.equal(memo.runs.has('s-gone'), true);
    fs.rmSync(recordFile('s-gone'));
    const answer = await through(memo);
    assert.equal(memo.runs.has('s-gone'), false);
    assert.deepStrictEqual(answer, await afresh());
    assert.equal(answer.all.total.runs, FINISHED.length, 's-gone no longer counted');
    viewedRuns();
  });

  await s.test(
    'a run whose workflow is not frozen on its record is never kept: its steps are read off its folder, which no stamp covers',
    async () => {
      const folder = path.join(ROOT, 'unfrozen');
      fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(path.join(folder, 'implement.md'), '---\nplace: git\nharness: codex\n---\nImplement it.\n');
      await aRun('s-unfrozen', 6, true, folder);
      await through(memo);
      viewedRuns();
      await through(memo);
      assert.deepEqual(viewedRuns(), ['s-moving', 's-unfrozen']);
      fs.rmSync(recordFile('s-unfrozen'));
      await through(memo);
      viewedRuns();
    },
  );

  await s.test(
    'a run a journal of which does not read is left out and named, what it froze still compared, never kept, and counted again once it reads, with no line on the feed',
    async () => {
      await aRun('s-spoiled', 5, true, undefined, 'Implement it again.');
      spoiled.add('s-spoiled-implement');
      const first = await through(memo);
      assert.deepEqual(first.unreadable, ['s-spoiled']);
      assert.deepEqual(
        first.all.marks.map((m) => [m.run, m.kind, m.name]),
        [['s-spoiled', 'step', 'implement']],
        'its note changed from the run before it: marked, its journal read or not',
      );
      assert.equal(memo.runs.has('s-spoiled'), false, 'nothing kept of the run a journal of which does not read');
      viewedRuns();
      spoiled.delete('s-spoiled-implement');
      const healed = await through(memo);
      assert.deepEqual(viewedRuns(), ['s-moving', 's-spoiled']);
      assert.deepEqual(healed.unreadable, []);
      assert.deepStrictEqual(healed, await afresh());
      fs.rmSync(recordFile('s-spoiled'));
      await through(memo);
      viewedRuns();
    },
  );

  await s.test('verify reads every run the memo answers afresh, and refuses one that differs, naming it', async () => {
    const fresh = await through(memo);
    const kept = memo.runs.get('s-a')?.read;
    assert.ok(kept, 's-a is kept');
    kept.facts.tries = [];
    kept.facts.runs = [];
    assert.notDeepStrictEqual(await through(memo), fresh, 'unverified, the stale answer is given');
    await assert.rejects(
      runWith(e, statsRun({}, NOW, { memo, verify: true })),
      (err: Error) => err.message.includes('the run s-a ') && err.message.includes('stamp'),
    );
    viewedRuns();
  });

  await s.test('a feed that went back empties the memo, and the next call reads every run', async () => {
    memo.cursor = Number.MAX_SAFE_INTEGER - 1;
    const answer = await through(memo);
    assert.deepEqual(viewedRuns(), [...FINISHED, 's-moving']);
    assert.deepStrictEqual(answer, await afresh(), 'the stale s-a read is gone with the rest');
    viewedRuns();
  });

  await s.test('an engine whose feed does not read, or with no feed, answers nothing from memory, and keeps nothing', async () => {
    const unfed = { ...e, feed: () => Effect.fail(new Error('the feed does not read') as never) };
    await runWith(unfed, statsRun({}, NOW, { memo, ...unverified }));
    assert.deepEqual(viewedRuns(), [...FINISHED, 's-moving']);
    assert.equal(memo.runs.size, 0);
    await through(memo);
    viewedRuns();
    assert.ok(memo.runs.size > 0, 'the feed reads again: the memo keeps again');
    const feedless = { ...e, feed: undefined } as never;
    await runWith(feedless, statsRun({}, NOW, { memo, ...unverified }));
    assert.deepEqual(viewedRuns(), [...FINISHED, 's-moving']);
    assert.equal(memo.runs.size, 0);
  });
});

test("RACE: a call keeps nothing once another has read the engine's feed on past where it read to", async () => {
  const memo = freshStatsMemo();
  during = {
    when: 's-b-implement',
    then: async () => {
      await journal.append('s-b-implement', { kind: 'measured', at: ended, attempt: 1, usage: { costUsd: 9 } });
      await through(memo);
    },
  };
  await through(memo);
  assert.equal(during, undefined, 'the overlapping call ran');
  const answer = await runWith(e, statsRun({}, NOW, { memo, verify: true }));
  assert.deepStrictEqual(answer, await afresh());
  viewed = [];
});
