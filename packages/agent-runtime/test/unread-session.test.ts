/**
 * One session whose output cannot be read never blinds the rest of its harness: a detached run whose output its spec refuses
 * (`readOutput`), or whose start it refuses (`HarnessSpec.start`, parsed in `test/start-event.test.ts`), is unread while its process
 * runs, every other run of the harness read, and read as failed once it has ended, with why said as a warning on every look.
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
import { CODEX_START, codexOutput } from '../src/harness/codex/stream.ts';
import type { Sighting } from '../src/core/domain.ts';
import { Engine, type TaskView } from '../src/index.ts';
import { scratch } from './scratch.ts';
import { warned } from './warned.ts';
import { builtEngine } from './engine.ts';
import { until, WAITED, type Waiter } from '../src/waits/index.ts';
import { story } from './checkpoints.ts';
import { printed as printedLines, ran, runFile, runFileOr, sh, THREAD, threadStarted } from './start-runs.ts';

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

test('a Codex run whose stream does not decode is unread alone while it works, why said by its name, read once it decodes, and failed once it has ended, its exit code and statement kept', async (t) => {
  const s = story(t);
  const dir = scratch('ae-unread-');
  const log = codexRun(dir, 'ae/bad/1', 'working', BAD);
  codexRun(dir, 'ae/good/1', 'done', GOOD);
  const ops = detachedOps(codex, dir);

  await s.test('REFUSED: at work, observe leaves it out and reads the harness’s other run, warning why once', async () => {
    const listed = await warned(ops.observe);
    assert.deepEqual([...listed.value.keys()], ['ae/good/1'], 'left out while it runs, never read as a live session that said nothing');
    assert.deepEqual(listed.value.get('ae/good/1')?.usage, USED);
    assert.equal(listed.warnings.length, 1);
    for (const w of refusalWords(log)) assert.match(listed.warnings[0], w);
  });

  await s.test(
    'REFUSED: observeFor names it unread, neither there nor gone, and why by its name alone, the other read completed',
    async () => {
      const asked = await warned(ops.observeFor!([{ name: 'ae/bad/1' }, { name: 'ae/good/1' }]));
      assert.deepEqual([...asked.value.unread], ['ae/bad/1'], 'neither there nor gone');
      assert.deepEqual([...asked.value.seen.keys()], ['ae/good/1']);
      assert.equal(asked.value.seen.get('ae/good/1')?.state, 'completed');
      assert.equal(asked.warnings.length, 1);
      for (const w of refusalWords(log)) assert.match(asked.warnings[0], w);
      assert.deepEqual(
        [...(asked.value.unreadWhy ?? [])],
        [['ae/bad/1', asked.warnings[0]]],
        'why, by its name, and none for the run read',
      );
      for (const w of refusalWords(log)) assert.match(asked.value.unreadWhy?.get('ae/bad/1') ?? '', w);
    },
  );

  await s.test('once its stream decodes it is read, and no look after says anything of the last', async () => {
    fs.writeFileSync(log, ['Reading additional input from stdin...', ...GOOD.map((l) => JSON.stringify(l))].join('\n'));
    const read = await warned(ops.observeFor!([{ name: 'ae/bad/1' }]));
    assert.deepEqual([...read.value.seen.keys()], ['ae/bad/1'], 'its stream decodes now');
    assert.equal(read.value.unreadWhy, undefined, 'and nothing of the last look is said');
    assert.equal(read.warnings.length, 0);
  });

  await s.test(
    'REFUSED: ended over a stream that does not decode, it reads failed on every look, its exit code and statement kept, nothing of its output, and why warned each time',
    async () => {
      assert.equal(codexRun(dir, 'ae/bad/1', 'done', BAD), log);
      fs.writeFileSync(log.replace(/\.log$/, '.closeout.json'), JSON.stringify({ verdict: 'ok' }));
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
    },
  );
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
  'tasks of one harness through the engine: one at work whose output does not decode carries why on the pass, list and view until a look reads it, and one that ended so settles failed beside one that succeeded, and is forgotten',
  WAITED,
  async (t) => {
    const s = story(t);
    const root = scratch('ae-unread-root-');
    const engine = builtEngine(Engine.layer({ root, harnesses: { sh: scripted }, defaultHarness: 'sh' }));
    const cwd = scratch('ae-unread-cwd-');
    const marker = path.join(cwd, 'go');
    t.after(() => fs.writeFileSync(marker, ''));
    const held = await Effect.runPromise(
      engine.file({ brief: `${printing(BAD)}; timeout 60 sh -c 'while [ ! -e ${marker} ]; do sleep 0.1; done'`, cwd }),
    );
    const bad = await Effect.runPromise(engine.file({ brief: printing(BAD), cwd }));
    const good = await Effect.runPromise(engine.file({ brief: printing(GOOD), cwd }));
    const log = path.join(root, 'runs', 'sh', `ae_${held.replace(/[^a-zA-Z0-9]+/g, '_')}_1.log`);

    await s.test("REFUSED: the task at work carries why on its view — the pass's, list's and view's — and is never settled", async (c) => {
      let pass: TaskView | undefined;
      await until(
        c,
        async () => {
          pass = (await Effect.runPromise(engine.tick())).views.find((v) => v.id === held);
          return pass?.unreadWhy !== undefined;
        },
        () => `${held} said unread: ${JSON.stringify(pass)}`,
        { everyMs: 100 },
      );
      const listed = (await Effect.runPromise(engine.list([held]))).views[0];
      const viewed = await Effect.runPromise(engine.view(held));
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
    });

    await s.test('the first look that reads its output says nothing of why, on the pass, list or view', async () => {
      fs.writeFileSync(log, GOOD.map((l) => JSON.stringify(l)).join('\n'));
      const read = (await Effect.runPromise(engine.tick())).views.find((v) => v.id === held);
      assert.ok(read, 'still at work');
      assert.equal(Object.hasOwn(read, 'unreadWhy'), false, `the pass that reads it says nothing: ${read.unreadWhy}`);
      assert.equal(Object.hasOwn((await Effect.runPromise(engine.list([held]))).views[0], 'unreadWhy'), false, 'nor does list');
      assert.equal(Object.hasOwn(await Effect.runPromise(engine.view(held)), 'unreadWhy'), false, 'nor does view');
    });

    await s.test(
      'REFUSED: a task whose output does not decode, once ended, settles failed, while a task of the same harness settles succeeded',
      async (c) => {
        const [b, g] = await settled(c, engine, [bad, good]);
        assert.equal(b.settled, 'failed');
        assert.equal(g.settled, 'succeeded');
      },
    );

    await s.test('the failed task is forgotten, its run files with it', async () => {
      const forgot = await Effect.runPromise(engine.forget([bad], { yes: true }));
      assert.equal(forgot.forgotten, true);
      const left = fs.readdirSync(path.join(root, 'runs', 'sh'));
      assert.ok(left.length > 0 && left.every((f) => !f.startsWith(`ae_${bad.replace(/[^a-zA-Z0-9]+/g, '_')}_`)), left.join(', '));
    });

    await s.test('the task read again settles once its process has ended', async (c) => {
      fs.writeFileSync(marker, '');
      const [h] = await settled(c, engine, [held]);
      assert.ok(h.settled, 'settled');
    });
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

/** The words a refused start's warning says, for the run `ae/bad/1` whose start line printed the thread id 12345. */
const START_REFUSAL_WORDS = [
  /`ae\/bad\/1`/,
  /line\s+1\s+of\s+its\s+stdout/,
  /`thread\.started`/,
  /`thread_id`/,
  /12345/,
  /hex\s+and\s+dashes/,
  /unread\s+while\s+its\s+process\s+runs/,
  /read\s+as\s+failed/,
  /`ae forget`/,
];

test(
  'a session whose start id is a number is unread while its process runs, the next of its harness read and why said by its name; once ended it reads failed with no id, and its task settles and is forgotten',
  WAITED,
  async (t) => {
    const s = story(t);
    const root = scratch('ae-start-');
    const marker = path.join(root, 'go');
    t.after(() => fs.writeFileSync(marker, ''));
    const script = `${printedLines(threadStarted(12345))}; timeout 30 sh -c 'while [ ! -e ${marker} ]; do sleep 0.1; done'`;
    const bad = detachedOps(sh(script, CODEX_START), root);
    let good: Awaited<ReturnType<typeof ran>> | undefined;

    await s.test('the worker records the refused start on the run file, its process still at work', async (c) => {
      await Effect.runPromise(bad.spawn({ name: 'ae/bad/1', brief: 'x', cwd: root }));
      await until(
        c,
        () => runFileOr(root, 'ae/bad/1').startRefused !== undefined,
        () => `ae/bad/1 refused its start: its run file is ${JSON.stringify(runFileOr(root, 'ae/bad/1'))}`,
        { everyMs: 100 },
      );
      good = await ran(c, sh(printedLines(threadStarted(THREAD)), CODEX_START), 'ae/good/1', root);
      assert.equal(runFile(root, 'ae/bad/1').state, 'working');
    });

    await s.test('REFUSED: observe leaves it out while it runs and reads the next session of the harness, warning why once', async () => {
      const listed = await warned(good!.ops.observe);
      assert.deepEqual([...listed.value.keys()], ['ae/good/1'], 'the refused session is left out while it runs, the other read');
      assert.equal(listed.value.get('ae/good/1')?.nativeId, THREAD);
      assert.equal(listed.warnings.length, 1);
      for (const w of START_REFUSAL_WORDS) assert.match(listed.warnings[0], w);
    });

    await s.test('REFUSED: observeFor names it unread, never a live session with no id, and why by its name, as it is warned', async () => {
      const asked = await warned(good!.ops.observeFor!([{ name: 'ae/bad/1' }, { name: 'ae/good/1' }]));
      assert.deepEqual([...asked.value.unread], ['ae/bad/1'], 'unread while it runs, never read as a live session with no id');
      assert.deepEqual([...asked.value.seen.keys()], ['ae/good/1']);
      assert.equal(asked.warnings.length, 1);
      for (const w of START_REFUSAL_WORDS) assert.match(asked.warnings[0], w);
      assert.deepEqual([...(asked.value.unreadWhy ?? [])], [['ae/bad/1', asked.warnings[0]]], 'why, by its name, as it is warned');
      for (const w of START_REFUSAL_WORDS) assert.match(asked.value.unreadWhy?.get('ae/bad/1') ?? '', w);
    });

    await s.test(
      'REFUSED: once its process has ended it reads failed with no id, listed so, still warned, and unread by no look',
      async (c) => {
        fs.writeFileSync(marker, '');
        await until(
          c,
          () => runFileOr(root, 'ae/bad/1').state !== 'working',
          () => `ae/bad/1 ended: its run file is ${JSON.stringify(runFileOr(root, 'ae/bad/1'))}`,
          { everyMs: 100 },
        );
        assert.equal(runFile(root, 'ae/bad/1').state, 'done', 'the harness itself exited 0');
        const ended = await warned(bad.observeFor!([{ name: 'ae/bad/1' }]));
        assert.equal(ended.value.seen.get('ae/bad/1')?.state, 'failed');
        assert.equal(ended.value.seen.get('ae/bad/1')?.nativeId, undefined);
        assert.deepEqual([...ended.value.unread], []);
        assert.equal(ended.warnings.length, 1, 'the refusal is still warned');
        for (const w of START_REFUSAL_WORDS) assert.match(ended.warnings[0] ?? '', w);
        assert.equal(ended.value.unreadWhy, undefined, 'read as failed, so not unread, and no words of why it is');
        assert.equal((await Effect.runPromise(bad.observe)).get('ae/bad/1')?.state, 'failed', 'listed, as failed');
      },
    );

    await s.test(
      'REFUSED: on a harness whose output is read as Codex’s, the ended start’s refusal is its own, and the session beside it read',
      async (c) => {
        const codexRoot = scratch('ae-start-');
        const codexLike = (line: string) => sh(printedLines(line), CODEX_START, { readOutput: codexOutput });
        await ran(c, codexLike(threadStarted(12345)), 'ae/bad/1', codexRoot);
        const { ops } = await ran(c, codexLike(threadStarted(THREAD)), 'ae/good/1', codexRoot);
        const listed = await warned(ops.observe);
        assert.equal(listed.value.get('ae/bad/1')?.state, 'failed');
        assert.equal(listed.value.get('ae/bad/1')?.nativeId, undefined);
        assert.equal(listed.value.get('ae/good/1')?.nativeId, THREAD);
        for (const w of START_REFUSAL_WORDS) assert.match(listed.warnings[0] ?? '', w);
        const asked = await Effect.runPromise(ops.observeFor!([{ name: 'ae/bad/1' }, { name: 'ae/good/1' }]));
        assert.deepEqual([...asked.unread], []);
        assert.equal(asked.seen.get('ae/bad/1')?.state, 'failed');
        assert.equal(asked.seen.get('ae/good/1')?.nativeId, THREAD);
      },
    );

    await s.test('through the engine, its task settles failed with no session id, and is forgotten with its run files', async (c) => {
      const engineRoot = scratch('ae-start-root-');
      const spec = sh(printedLines(threadStarted(12345)), CODEX_START);
      const engine = builtEngine(Engine.layer({ root: engineRoot, harnesses: { sh: spec }, defaultHarness: 'sh' }));
      const id = await Effect.runPromise(engine.file({ brief: 'b', cwd: scratch('ae-start-cwd-') }));
      const [state] = await settled(c, engine, [id]);
      assert.equal(state.settled, 'failed');
      assert.equal(state.attempts[0]?.nativeId ?? null, null, 'recorded with no session id');
      const forgot = await Effect.runPromise(engine.forget([id], { yes: true }));
      assert.equal(forgot.forgotten, true);
      assert.deepEqual(fs.readdirSync(path.join(engineRoot, 'runs', 'sh')), [], 'its run files went with it');
    });
  },
);
