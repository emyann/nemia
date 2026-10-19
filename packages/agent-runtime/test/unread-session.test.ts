/**
 * One session whose output cannot be read never blinds the rest of its harness: a detached run whose output its spec refuses
 * (`readOutput`), as a refused start is (`test/start-event.test.ts`), is unread while its process runs, every other run of the
 * harness read, and read as failed once it has ended, with why said as a warning on every look.
 *
 * What the tests below rest on:
 * - A run file written by hand stands for one the worker left: `working` with a fresh beat is a process at work, `done` one
 *   that exited; nothing reads its pid but `stop`.
 * - A harness whose `command` runs the brief as a script gives each task of one harness its own process, so a bad session and
 *   a good one share the harness.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import { detachedOps, type HarnessSpec } from '../src/harness/detached/detached.ts';
import { codex } from '../src/harness/codex/codex.ts';
import { codexOutput } from '../src/harness/codex/stream.ts';
import type { Sighting } from '../src/core/domain.ts';
import { Engine, type TaskView } from '../src/index.ts';
import { scratch } from './scratch.ts';
import { warned } from './warned.ts';
import { builtEngine } from './engine.ts';
import { until, WAITED, type Waiter } from '../src/waits/index.ts';

const CODEX_USED = { input_tokens: 1200, cached_input_tokens: 1000, cache_write_input_tokens: 0, output_tokens: 80 };
const USED = { toolCalls: 0, inputTokens: 1200, uncachedTokens: 200, cacheWriteTokens: 0, cacheReadTokens: 1000, outputTokens: 80 };
const BAD = [{ type: 'turn.started' }, { type: 'turn.completed', usage: { ...CODEX_USED, input_tokens: 'many' } }];
const GOOD = [{ type: 'turn.started' }, { type: 'turn.completed', usage: CODEX_USED }];

/** A Codex run `name` written into `dir` as its worker leaves it, in `state`, its output `lines`; answers its log's path. */
const codexRun = (dir: string, name: string, state: 'working' | 'done', lines: object[]) => {
  const runs = path.join(dir, 'runs', 'codex');
  fs.mkdirSync(runs, { recursive: true });
  const base = path.join(runs, name.replace(/[^a-zA-Z0-9]+/g, '_'));
  const ended = state === 'done' ? { exitCode: 0 } : {};
  const run = { name, state, pid: 999999, ...ended, logFile: `${base}.log`, heartbeatAt: new Date().toISOString() };
  fs.writeFileSync(`${base}.json`, JSON.stringify(run));
  fs.writeFileSync(`${base}.log`, ['Reading additional input from stdin...', ...lines.map((l) => JSON.stringify(l))].join('\n'));
  return `${base}.log`;
};

/** The words a refused output's warning says, for the run `ae/bad/1` whose output is `log`. */
const refusalWords = (log: string) => [
  /`ae\/bad\/1`/,
  new RegExp(log.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  /line\s+3\s+of\s+the\s+`codex exec --json`\s+stream/,
  /`usage\.input_tokens`/,
  /unread\s+while\s+its\s+process\s+runs/,
  /read\s+as\s+failed\s+once\s+it\s+has\s+ended/,
  /other\s+sessions\s+of\s+codex\s+are\s+read/,
  /`ae forget`/,
];

test('REFUSED: a Codex run at work whose stream does not decode is unread alone: the harness’s other run is read, and why is said', async () => {
  const dir = scratch('ae-unread-');
  const log = codexRun(dir, 'ae/bad/1', 'working', BAD);
  codexRun(dir, 'ae/good/1', 'done', GOOD);
  const ops = detachedOps(codex, dir);

  const listed = await warned(ops.observe);
  assert.deepEqual([...listed.value.keys()], ['ae/good/1'], 'left out while it runs, never read as a live session that said nothing');
  assert.deepEqual(listed.value.get('ae/good/1')?.usage, USED);
  assert.equal(listed.warnings.length, 1);
  for (const w of refusalWords(log)) assert.match(listed.warnings[0], w);

  const asked = await warned(ops.observeFor!([{ name: 'ae/bad/1' }, { name: 'ae/good/1' }]));
  assert.deepEqual([...asked.value.unread], ['ae/bad/1'], 'neither there nor gone');
  assert.deepEqual([...asked.value.seen.keys()], ['ae/good/1']);
  assert.equal(asked.value.seen.get('ae/good/1')?.state, 'completed');
  assert.equal(asked.warnings.length, 1);
  for (const w of refusalWords(log)) assert.match(asked.warnings[0], w);
  assert.deepEqual([...(asked.value.unreadWhy ?? [])], [['ae/bad/1', asked.warnings[0]]], 'why, by its name, and none for the run read');
});

test('REFUSED: why a Codex run at work is unread is answered by the look that left it unread, and by no look after the one that reads its stream', async () => {
  const dir = scratch('ae-unread-');
  const log = codexRun(dir, 'ae/bad/1', 'working', BAD);
  const ops = detachedOps(codex, dir);
  const unread = await warned(ops.observeFor!([{ name: 'ae/bad/1' }]));
  for (const w of refusalWords(log)) assert.match(unread.value.unreadWhy?.get('ae/bad/1') ?? '', w);

  fs.writeFileSync(log, ['Reading additional input from stdin...', ...GOOD.map((l) => JSON.stringify(l))].join('\n'));
  const read = await warned(ops.observeFor!([{ name: 'ae/bad/1' }]));
  assert.deepEqual([...read.value.seen.keys()], ['ae/bad/1'], 'its stream decodes now');
  assert.equal(read.value.unreadWhy, undefined, 'and nothing of the last look is said');
  assert.equal(read.warnings.length, 0);
});

test('REFUSED: a Codex run whose stream does not decode, once ended, reads as failed, its exit code and statement kept, nothing of its output, and why said on every look', async () => {
  const dir = scratch('ae-unread-');
  const log = codexRun(dir, 'ae/bad/1', 'done', BAD);
  fs.writeFileSync(log.replace(/\.log$/, '.closeout.json'), JSON.stringify({ verdict: 'ok' }));
  const ops = detachedOps(codex, dir);
  const failed: Sighting = {
    sessionId: 'ae/bad/1',
    state: 'failed',
    nativeId: undefined,
    closeout: { payload: { verdict: 'ok' } },
    exitCode: 0,
  };
  for (const look of [1, 2]) {
    const listed = await warned(ops.observe);
    assert.deepEqual(listed.value.get('ae/bad/1'), failed, `look ${look}: failed, never completed, and no usage`);
    assert.equal(listed.warnings.length, 1, `look ${look}: the warning is kept`);
    for (const w of refusalWords(log)) assert.match(listed.warnings[0], w);
  }
  const asked = await warned(ops.observeFor!([{ name: 'ae/bad/1' }]));
  assert.deepEqual([...asked.value.unread], []);
  assert.deepEqual(asked.value.seen.get('ae/bad/1'), failed);
  assert.equal(asked.warnings.length, 1);
  assert.equal(asked.value.unreadWhy, undefined, 'read as failed, so not unread, and no words of why it is');
});

/** A harness that runs each task's brief as an `sh` script, whose output is read as Codex's. */
const scripted: HarnessSpec = { name: 'sh', command: (r) => ({ cmd: 'sh', args: ['-c', r.brief] }), readOutput: codexOutput };

/** A script that prints each of `lines` as a line of JSON. */
const printing = (lines: object[]) => lines.map((l) => `printf '%s\\n' '${JSON.stringify(l)}'`).join('; ');

/** Ticks `engine` until every task of `ids` has settled, and answers their states; `t`'s test fails if one never does. */
const settled = async (t: Waiter, engine: ReturnType<typeof builtEngine>, ids: string[]) => {
  let views: TaskView[] = [];
  await until(
    t,
    async () => {
      views = await Promise.all(ids.map((id) => Effect.runPromise(engine.view(id))));
      if (views.every((v) => v.state.settled)) return true;
      await Effect.runPromise(engine.tick());
      return false;
    },
    () => `settled: ${views.map((v) => `${v.state.taskId} ${JSON.stringify(v.state.attempts.at(-1))}`).join(', ')}`,
    { everyMs: 50 },
  );
  return views.map((v) => v.state);
};

test(
  'REFUSED: a task whose output does not decode settles failed and is forgotten, while a task of the same harness settles succeeded',
  WAITED,
  async (t) => {
    const root = scratch('ae-unread-root-');
    const engine = builtEngine(Engine.layer({ root, harnesses: { sh: scripted }, defaultHarness: 'sh' }));
    const cwd = scratch('ae-unread-cwd-');
    const bad = await Effect.runPromise(engine.file({ brief: printing(BAD), cwd }));
    const good = await Effect.runPromise(engine.file({ brief: printing(GOOD), cwd }));
    const [b, g] = await settled(t, engine, [bad, good]);
    assert.equal(b.settled, 'failed');
    assert.equal(g.settled, 'succeeded');
    const forgot = await Effect.runPromise(engine.forget([bad], { yes: true }));
    assert.equal(forgot.forgotten, true);
    const left = fs.readdirSync(path.join(root, 'runs', 'sh'));
    assert.ok(left.length > 0 && left.every((f) => !f.startsWith(`ae_${bad.replace(/[^a-zA-Z0-9]+/g, '_')}_`)), left.join(', '));
  },
);

test('a stop asked while a session is unread settles its task once its process has ended, and it is forgotten', WAITED, async (t) => {
  const root = scratch('ae-unread-root-');
  const engine = builtEngine(Engine.layer({ root, harnesses: { sh: scripted }, defaultHarness: 'sh' }));
  const cwd = scratch('ae-unread-cwd-');
  const marker = path.join(cwd, 'go');
  const id = await Effect.runPromise(
    engine.file({ brief: `${printing(BAD)}; timeout 60 sh -c 'while [ ! -e ${marker} ]; do sleep 0.1; done'`, cwd }),
  );
  await until(t, async () => ((await Effect.runPromise(engine.tick())).observed.sh?.unread ?? 0) > 0, `${id} read unread`, {
    everyMs: 100,
  });
  try {
    await Effect.runPromise(engine.stop(id));
    for (const pass of [1, 2, 3]) {
      await Effect.runPromise(engine.tick());
      assert.equal((await Effect.runPromise(engine.view(id))).state.settled, null, `pass ${pass}: unsettled while it is unread`);
    }
  } finally {
    fs.writeFileSync(marker, '');
  }
  const [state] = await settled(t, engine, [id]);
  assert.ok(state.settled, 'settled');
  assert.equal((await Effect.runPromise(engine.forget([id], { yes: true }))).forgotten, true);
});

test(
  "REFUSED: a task at work whose output does not decode carries why on its task's view — the pass's, list's and view's — and loses it on the first look that reads its output",
  WAITED,
  async (t) => {
    const root = scratch('ae-unread-root-');
    const engine = builtEngine(Engine.layer({ root, harnesses: { sh: scripted }, defaultHarness: 'sh' }));
    const cwd = scratch('ae-unread-cwd-');
    const marker = path.join(cwd, 'go');
    const id = await Effect.runPromise(
      engine.file({ brief: `${printing(BAD)}; timeout 60 sh -c 'while [ ! -e ${marker} ]; do sleep 0.1; done'`, cwd }),
    );
    try {
      let pass: TaskView | undefined;
      await until(
        t,
        async () => {
          pass = (await Effect.runPromise(engine.tick())).views.find((v) => v.id === id);
          return pass?.unreadWhy !== undefined;
        },
        () => `${id} said unread: ${JSON.stringify(pass)}`,
        { everyMs: 100 },
      );
      const log = path.join(root, 'runs', 'sh', `ae_${id.replace(/[^a-zA-Z0-9]+/g, '_')}_1.log`);
      const listed = (await Effect.runPromise(engine.list([id]))).views[0];
      const viewed = await Effect.runPromise(engine.view(id));
      for (const [where, v] of [
        ['pass', pass],
        ['list', listed],
        ['view', viewed],
      ] as const) {
        assert.equal(v?.state.settled, null, `${where}: unread, never settled`);
        for (const w of [
          /`ae\/[^`]+\/1`/,
          new RegExp(log.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
          /`usage\.input_tokens`/,
          /`ae forget`/,
        ]) {
          assert.match(v?.unreadWhy ?? '', w, where);
        }
      }

      fs.writeFileSync(log, GOOD.map((l) => JSON.stringify(l)).join('\n'));
      const read = (await Effect.runPromise(engine.tick())).views.find((v) => v.id === id);
      assert.ok(read, 'still at work');
      assert.equal(Object.hasOwn(read, 'unreadWhy'), false, `the pass that reads it says nothing: ${read.unreadWhy}`);
      assert.equal(Object.hasOwn((await Effect.runPromise(engine.list([id]))).views[0], 'unreadWhy'), false, 'nor does list');
      assert.equal(Object.hasOwn(await Effect.runPromise(engine.view(id)), 'unreadWhy'), false, 'nor does view');
    } finally {
      fs.writeFileSync(marker, '');
    }
    await settled(t, engine, [id]);
  },
);
