/**
 * A run's feed, told as a person's stories on the stage (`story.ts`): the tick writes what it judged of each run and step on the test
 * place and the engine's stand-in, a line each time it changed, and `nemia watch` reads it. A gated run through its gate, its approval and
 * its end, read by `nemia watch` and across a restart; a person's acts and the runtime's faults, each said once; a step's denials, each a
 * one-shot by its step and try; a run waiting on a person, never said as failed; and a feed cut under a watch.
 *
 * What the feed's writer does with the words of one pass — the one-shots it counts, the fold and the diff, a line torn or of a shape
 * of its own, the bytes a line is published at, and the watch's races with the file — is `src/feed/feed.test.ts`'s; the hub and its
 * live readers `src/feed/feed.verb.test.ts`'s; what `nemia watch` refuses of what was typed `src/cli/watch.test.ts`'s.
 *
 * A file of its own, since `tick` reads every run under `WF_ROOT` and writes the store's one feed: each story empties the store first, and
 * counts only its own runs' lines. `WF_ROOT` is set before the runner is imported, which reads it as it loads; `WF_VERIFY_REST=1` judges
 * in full every run a pass answers from its memo of runs at rest.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { bell, until, WAITED } from 'agent-runtime/testing';
import type { Run } from '../src/record/record.ts';
import type { FeedLine, Reason, RunLine } from '../src/feed/feed.ts';
import { scratch } from './scratch.ts';
import { staged, story } from './story.ts';
import { names } from './assessed.ts';

const ROOT = scratch('wf-run-feed-');
const RUNS = path.join(ROOT, 'runs');
const FEED = path.join(ROOT, 'feed.jsonl');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_RUNS;
delete process.env.WF_MAX_CONCURRENT;
const {
  approveRun,
  cancelRun,
  hold,
  unhold,
  feedCursorRefusal,
  feedFile,
  freshFeedMemo,
  readFeed,
  startRun,
  tickRun,
  watchFeed,
  runWith: runEngine,
} = await import('../src/runner.ts');
const { recordFeed } = await import('../src/feed/feed.store.ts');
const { isRunLine } = await import('../src/feed/feed.ts');
const { readRun, rewriteRun, stepsOf } = await import('../src/record/record.store.ts');
const { tryOf } = await import('../src/record/record.ts');
const { freshRestMemo } = await import('../src/tick/tick.verb.ts');
const { runLabels, stepLabels } = await import('../src/telemetry/telemetry.ts');
const { DEFAULT_FACTORY } = await import('../src/factory/factory.ts');
const { main, watchPrinted } = await import('../src/cli/main.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const stage = staged({ runWith: runEngine, main, engineOf });

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };
const AT = '2026-09-22T10:05:00.000Z';

/** What the engine's own pass answers here: nothing admitted, nothing started, no view — every task is read off the stand-in. */
const QUIET = { tasks: 0, actions: [], running: {}, views: [] };

/** The stage's engine with a pass of its own that does nothing, and no tally: what a whole-store pass asks of the engine first. */
const ticking = () => {
  const b = stage.board();
  Object.assign(b.e, { tick: () => Effect.succeed(QUIET), tallied: undefined });
  return b;
};

/** One pass of the tick over the whole store, on the stage's engine. */
const tick = (options?: Parameters<typeof tickRun>[0]) => stage.runWith(ticking().e, tickRun(options));
/** `n` passes of the tick. */
const ticks = async (n: number) => {
  for (let i = 0; i < n; i++) await tick();
};

/** The task of `run`'s step `step`, as the tick files it. */
const task = (run: Run, step: string) => `${run.id}-${step}`;

/** The task `id` on the stand-in, settled `phase` and ending with `closeout`. */
const settle = (id: string, phase: string, closeout?: unknown) => stage.board().settle(id, phase, closeout);

/**
 * The calls the runtime denied the task `id` on its attempt, at work (`live`) or ended: a task not started yet is started at work. Laid
 * on the attempt as the runtime journals it, after any settle of it, which would take a new attempt.
 */
const deny = (id: string, denials: { tool: string; what?: string }[], live = false) => {
  const t = stage.board().tasks.get(id)!;
  if (!t.attempt) settle(id, 'running (working)');
  Object.assign(t.attempt!, { denials, ...(live || t.attempt!.endedAt ? {} : { ended: 'done', endedAt: AT }) });
};

/** The attempts of the task `id` that ended before its own, each for the runtime's `reason`: its next attempt is then at work. */
const ended = (id: string, reasons: readonly string[]) => {
  const t = stage.board().tasks.get(id)!;
  t.earlier = reasons.map((reason, i) => ({
    n: i + 1,
    startedAt: AT,
    spawnedAt: AT,
    ended: 'failed',
    endedAt: AT,
    reason: reason as 'lost',
    nativeId: `native-${id}-${i}`,
    usage: null,
    exitCode: null,
  }));
  t.attempt = null;
  settle(id, 'running');
};

/** A store with no runs and no feed. */
const emptyStore = () => {
  for (const dir of [RUNS, FEED, path.join(ROOT, 'tick.json')]) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(RUNS, { recursive: true });
};

/** A repository with one commit on the test place, so a start has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stage.place().world.repository(repo, {});
  return repo;
};

/** A workflow folder of `steps`, each its file's frontmatter lines past `place: git`, and its body `<name> it`. */
const folderOf = (steps: Record<string, string[]>): string => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  for (const [name, lines] of Object.entries(steps))
    fs.writeFileSync(path.join(dir, `${name}.md`), `---\n${['place: git', ...lines].join('\n')}\n---\n${name} it\n`);
  return dir;
};

/** `plan → implement`, whose plan waits at its gate for a person. */
const GATED = folderOf({ plan: ['gate: true'], implement: ['after: plan'] });
/** `plan → implement`, with no gate. */
const UNGATED = folderOf({ plan: [], implement: ['after: plan'] });
/** `implement → ship`, whose ending waits at its gate before it is filed, as a shipped `build` ends. */
const ENDING = folderOf({ implement: [], ship: ['after: implement', 'workspace: main', 'gate: true'] });

/** A run started on `workflowDir` in a repository of its own, its steps sharing its checkout unless `isolate`. */
const started = (brief: string, workflowDir = GATED, isolate = false): Promise<Run> =>
  stage.runPlaced(startRun({ brief, repo: aRepo(), workflowDir, isolate }));

/** Every line of a run in the feed, read off the file as a reader with cursor 0 would. */
const lines = (): RunLine[] => readFeed(0).lines.filter(isRunLine);
const size = (): number => fs.statSync(FEED, { throwIfNoEntry: false })?.size ?? 0;
/** The words of a run's own lines, or of one step's, in order. */
const words = (run: string, step?: string): string[] =>
  lines()
    .filter((l) => l.run === run && l.step === step)
    .map((l) => l.word);
/** The lines of `reason` about `run`, with the fields a selector matches one by. */
const said = (run: string, reason: Reason) =>
  lines()
    .filter((l) => l.run === run && l.reason === reason)
    .map((l) => ({ step: l.step, word: l.word, note: l.note, try: l.try, type: l.type, source: l.source, waits: l.waits }));

/** The pass's words for every run, as `tick` hands them to the feed: what a restarted daemon's first pass would judge. */
const judged = (pass: Effect.Success<ReturnType<typeof tickRun>>) => new Map(pass.runs.map((a) => [a.run.id, a.feed]));

/** What `nemia <argv>` printed on stdout, a line each. */
const printedBy = async (t: TestContext, ...argv: string[]): Promise<string[]> => {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.join(' '));
  });
  try {
    await stage.main(argv);
  } finally {
    log.mock.restore();
  }
  return printed.join('\n').split('\n');
};

/** Refused at exit 2, its words naming each of `facts`. */
const refusedNaming =
  (...facts: string[]) =>
  (err: Error & { exitCode?: number }) => {
    assert.equal(err.exitCode, 2, err.message);
    names(err.message, ...facts);
    return true;
  };

/** The reads the engine's stand-in was asked so far. */
const reads = async (): Promise<number> => (await Effect.runPromise(stage.board().e.io())).reads;

test(
  'a gated run through its gate, its approval and its end: a line per transition, read by nemia watch and across a restart',
  WAITED,
  async (t) => {
    const s = story(t);
    emptyStore();
    let run: Run;
    await s.test('the first pass says the run running and each step its first word, once; filed reads as pending, then quiet', async () => {
      run = await started('the gate');
      await tick();
      assert.deepEqual(words(run.id), ['running'], 'the run says it is running, once');
      assert.equal(words(run.id, 'plan').length, 1, 'and each step says its first word, once');
      await ticks(3);
      assert.deepEqual(words(run.id, 'plan').slice(1), ['pending'], 'filed on that pass reads as filed on the next, then quiet');
      const quiet = size();
      await tick();
      assert.equal(size(), quiet, 'a pass that judged nothing new writes nothing');
    });
    await s.test(
      'the feed asks the engine nothing of its own: a pass reads each task as many times with the feed as the judgement did',
      async () => {
        const before = await reads();
        await tick();
        assert.equal(
          (await reads()) - before,
          1,
          "one read per task filed, the plan's, per pass: what `advance` reads for its own judgement, and nothing for the feed",
        );
        assert.equal(feedFile(), FEED);
      },
    );
    await s.test("a step's live word moving writes nothing: the feed says running, once", async () => {
      settle(task(run, 'plan'), 'running (working)');
      await tick();
      const once = size();
      for (const live of ['running (idle)', 'working (quiescent)', 'running (working)', 'between attempts']) {
        settle(task(run, 'plan'), live);
        await tick();
      }
      assert.equal(
        size(),
        once,
        lines()
          .slice(-3)
          .map((l) => JSON.stringify(l))
          .join('\n'),
      );
      assert.equal(words(run.id, 'plan').at(-1), 'running');
    });
    await s.test(
      'nothing is written when nothing changed, across a restart: a daemon with no fold reads the feed, and says nothing again',
      async () => {
        const pass = await tick();
        const before = fs.readFileSync(FEED, 'utf8');
        assert.deepEqual(
          recordFeed(judged(pass), { memo: freshFeedMemo() }).lines,
          [],
          'a restarted daemon, with nothing in memory and the same world, folds the feed from the start on its first pass and owes it no line',
        );
        assert.equal(fs.readFileSync(FEED, 'utf8'), before);
      },
    );
    await s.test(
      'the gate reached is one line over four passes, and the run says once, in its own word, that it waits on a person',
      async () => {
        settle(task(run, 'plan'), 'succeeded', SIGNED);
        const moved = await tick();
        const after = size();
        assert.deepEqual(
          recordFeed(judged(moved), { memo: freshFeedMemo() }).lines,
          [],
          'the same after the world did change, then was written: the new process said what changed, once, and a second new one nothing',
        );
        assert.equal(size(), after);
        await ticks(3);
        assert.deepEqual(
          words(run.id, 'plan').filter((w) => w === 'awaiting approval'),
          ['awaiting approval'],
          'the gate reached is one line over four passes',
        );
        const onYou = lines().filter((l) => l.run === run.id && l.step === undefined && l.note);
        assert.deepEqual(
          onYou.map((l) => [l.note, l.word]),
          [['waiting on you: approve plan', 'awaiting approval']],
          'at its gate, in the word nemia decide says it in: nothing failed',
        );
      },
    );
    await s.test(
      'a fold that is no feed says every word again: what makes the restart quiet is reading the feed, not the memo',
      async () => {
        const pass = await tick();
        const kept = fs.readFileSync(FEED);
        fs.rmSync(FEED);
        assert.ok(recordFeed(judged(pass), { memo: freshFeedMemo() }).lines.length > 0);
        fs.writeFileSync(FEED, kept);
      },
    );
    await s.test('nemia watch --once prints each line and the cursor to read on from; from the end, the cursor alone', async () => {
      const printed = await printedBy(t, 'watch', '--once');
      assert.equal(printed.at(-1), `cursor: ${size()}`);
      assert.ok(
        printed.some((l) => l.includes(run.id) && l.endsWith('running')),
        printed.join('\n'),
      );
      assert.deepEqual(
        await printedBy(t, 'watch', '--once', String(size())),
        [`cursor: ${size()}`],
        'from the end, nothing but the cursor',
      );
    });
    await s.test(
      'nemia watch --once -l waits=person prints only the lines that wait on a person, and still ends at the feed’s end',
      async () => {
        const waiting = await printedBy(t, 'watch', '--once', '-l', 'waits=person');
        assert.equal(waiting.at(-1), `cursor: ${size()}`);
        const taken = lines().filter((l) => l.waits === 'person');
        assert.ok(taken.length >= 2, 'the gate wrote the run’s line and the step’s, each waiting on a person');
        assert.equal(waiting.length - 1, taken.length, waiting.join('\n'));
        for (const l of waiting.slice(0, -1)) assert.match(l, /awaiting approval/);
        const either = await printedBy(t, 'watch', '--once', '-l', `run=${run.id},kind=Run`, '-l', 'waits=person');
        assert.equal(
          either.length - 1,
          lines().filter((l) => (l.run === run.id && l.step === undefined) || l.waits === 'person').length,
          'a line either selector takes, each clause of one held',
        );
        assert.deepEqual(
          await printedBy(t, 'watch', '--once', '-l', 'factory=nowhere'),
          [`cursor: ${size()}`],
          'a selector that takes nothing still says where the feed ends, not where its last line did',
        );
      },
    );
    await s.test(
      'nemia watch --once --json prints the lines whole and a cursor-only bookmark as its last line, and nothing but JSON',
      async () => {
        const said = await printedBy(t, 'watch', '--once', '--json', '-l', `kind=Step,run=${run.id}`);
        assert.deepEqual(JSON.parse(said.at(-1)!), { cursor: size() }, 'the bookmark carries the cursor and nothing else');
        const parsed = said.slice(0, -1).map((l) => JSON.parse(l) as RunLine & { cursor: number });
        assert.deepEqual(
          parsed.map((l) => l.step),
          lines()
            .filter((l) => l.run === run.id && l.step !== undefined)
            .map((l) => l.step),
        );
        for (const l of parsed)
          assert.equal(feedCursorRefusal(l.cursor), undefined, `${l.step} ${l.word}: its cursor is one the feed takes`);
        assert.equal(
          said.some((l) => !l.startsWith('{')),
          false,
          'stdout holds nothing but JSON',
        );
      },
    );
    const file = path.join(ROOT, 'once.cursor');
    await s.test('nemia watch --once keeps its place in --cursor-file, and a watch given one starts from it', async () => {
      fs.rmSync(file, { force: true });
      assert.equal((await printedBy(t, 'watch', '--once', '--cursor-file', file)).at(-1), `cursor: ${size()}`);
      assert.equal(fs.readFileSync(file, 'utf8'), `${size()}\n`);
      assert.deepEqual(
        await printedBy(t, 'watch', '--once', '--cursor-file', file),
        [`cursor: ${size()}`],
        'the second read starts where the file says, and reads nothing twice',
      );
    });
    await s.test('the approval is a file of its own, and the next pass says what it changed: no word twice in a row', async () => {
      const at = size();
      await stage.runWith(stage.board().e, approveRun(run.id, 'plan'));
      await ticks(3);
      const plan = words(run.id, 'plan');
      assert.notEqual(plan.at(-1), 'awaiting approval', plan.join(' → '));
      assert.equal(new Set(plan).size, plan.length, `no word said twice in a row: ${plan.join(' → ')}`);
      assert.equal(
        lines()
          .filter((l) => l.run === run.id && l.step === undefined)
          .at(-1)!.note,
        undefined,
        'the run no longer waits on you',
      );
      assert.equal(words(run.id, 'implement').at(-1), 'pending');
      const resumed = await printedBy(t, 'watch', '--once', '--cursor-file', file);
      assert.equal(resumed.at(-1), `cursor: ${size()}`);
      assert.equal(
        resumed.length - 1,
        readFeed(at).lines.length,
        'the cursor file resumes the watch where it was: the lines since, and no other',
      );
      assert.equal(fs.readFileSync(file, 'utf8'), `${size()}\n`);
    });
    await s.test('a cursor file the feed cannot be read from starts the watch over, says why once, and keeps its place', async () => {
      const stale = path.join(ROOT, 'stale.cursor');
      fs.writeFileSync(stale, `${size() + 900}\n`);
      const out: string[] = [];
      const err: string[] = [];
      const log = t.mock.method(console, 'log', (...a: unknown[]) => out.push(a.join(' ')));
      const wrote = t.mock.method(console, 'error', (...a: unknown[]) => err.push(a.join(' ')));
      try {
        await stage.main(['watch', '--once', '--cursor-file', stale]);
      } finally {
        log.mock.restore();
        wrote.mock.restore();
      }
      assert.equal(out.at(-1), `cursor: ${size()}`, 'it read the feed there is now, from its start');
      assert.equal(out.length, readFeed(0).lines.length + 1, 'every line of it');
      assert.equal(err.length, 1, 'said once');
      names(err[0], stale, String(size() + 900), 'said again');
      assert.equal(fs.readFileSync(stale, 'utf8'), `${size()}\n`, 'and it kept its place, as any watch does');
    });
    await s.test('REFUSED: a cursor inside a line, past the end or not a number, by the read, by nemia watch and by a watch', async () => {
      const { cursor } = readFeed(0);
      assert.equal(cursor, size());
      const inside = cursor - 2;
      assert.throws(() => readFeed(inside), refusedNaming(`cursor ${inside}`, 'inside a line'));
      const log = t.mock.method(console, 'log', () => {});
      try {
        await assert.rejects(stage.main(['watch', String(inside)]), refusedNaming(String(inside), 'inside a line'));
        assert.equal(log.mock.callCount(), 0, 'refused before it says it is watching');
      } finally {
        log.mock.restore();
      }
      assert.throws(() => watchFeed({ from: inside, onLine: () => {} }), refusedNaming('inside a line'));
      const past = cursor + 10;
      const [named, sized] = [`cursor ${past} `, `(${cursor} bytes, `];
      assert.throws(() => readFeed(past), refusedNaming(named, sized, 'nemia watch --once 0'));
      await assert.rejects(stage.main(['watch', 'twelve']), refusedNaming('nemia watch', 'one cursor at most', 'a whole number of bytes'));
      await assert.rejects(stage.main(['watch', '0', '1']), refusedNaming('nemia watch does not take 1', 'nemia watch [cursor]'));
      assert.throws(() => readFeed(-1), refusedNaming('a whole number of bytes'));
      let at = 0;
      for (const line of fs.readFileSync(FEED, 'utf8').split('\n').slice(0, -1)) {
        at += Buffer.byteLength(line) + 1;
        assert.doesNotThrow(
          () => readFeed(at),
          `every cursor a read hands out is one the next read takes: 0, each line's end (${at}), the end`,
        );
      }
      assert.equal(at, cursor);
    });
    await s.test('a line a writer died in the middle of is ended by the next pass, and costs that line alone', async () => {
      const good = lines().length;
      fs.appendFileSync(FEED, '{"at":"2026-09-22T10:00:00.000Z","run":"r-torn","wo');
      settle(task(run, 'implement'), 'running (working)');
      await ticks(2);
      const text = fs.readFileSync(FEED, 'utf8');
      assert.ok(text.endsWith('\n'));
      assert.ok(text.includes('"wo\n{'), 'the torn line is ended before the pass writes');
      const after = lines();
      assert.ok(after.length > good, 'the pass after it is read whole');
      assert.equal(
        after.some((l) => l.run === 'r-torn'),
        false,
        'and the torn line is read by nobody',
      );
    });
    await s.test('a watch follows the lines as they are written, in order, until stopped, and delivers nothing after', async (sub) => {
      const got: FeedLine[] = [];
      const arrived = bell();
      const from = size();
      const watch = watchFeed({
        from,
        intervalMs: 20,
        onLine: (l) => {
          got.push(l);
          arrived.ring();
        },
      });
      try {
        settle(task(run, 'implement'), 'succeeded', SIGNED);
        await tick();
        await until(
          sub,
          () => got.length >= 1,
          () => `a line handed by the watch; it handed ${got.length}`,
          { bell: arrived },
        );
        assert.deepEqual(got, readFeed(from).lines.slice(0, got.length), 'the lines, in order, as the feed has them');
      } finally {
        watch.stop();
      }
      const stopped = got.length;
      const after: FeedLine[] = [];
      const heard = bell();
      const other = watchFeed({
        from: size(),
        intervalMs: 20,
        onLine: (l) => {
          after.push(l);
          heard.ring();
        },
      });
      try {
        fs.appendFileSync(FEED, `${JSON.stringify({ at: '2026-09-22T10:00:00.000Z', run: 'r-after', word: 'running' })}\n`);
        await until(sub, () => after.length >= 1, 'a watch still running handed the next line', { bell: heard });
      } finally {
        other.stop();
      }
      assert.equal(got.length, stopped, 'a watch stopped delivers nothing more');
    });
    await s.test('the run done is one line, and every line carries its time, its run and its word', async () => {
      await ticks(2);
      assert.deepEqual(
        words(run.id).filter((w) => w === 'succeeded'),
        ['succeeded'],
      );
      const implement = words(run.id, 'implement');
      assert.equal(new Set(implement).size, implement.length, `nothing said twice: ${implement.join(' → ')}`);
      for (const l of lines())
        assert.ok(typeof l.at === 'string' && l.run && l.word, `every line carries its time, its run, and its word: ${JSON.stringify(l)}`);
    });
    await s.test('a feed not written yet reads as nothing, at 0', () => {
      emptyStore();
      assert.deepEqual(readFeed(0), { lines: [], cursor: 0 });
    });
  },
);

test("a person's acts and the runtime's faults on a run, each said once off the store the pass already read, and a run gone said once", async (t) => {
  const s = story(t);
  emptyStore();
  const repo = aRepo();
  const inRepo = (brief: string, isolate: boolean) => stage.runPlaced(startRun({ brief, repo, workflowDir: GATED, isolate }));
  let other: Run;
  let run: Run;
  await s.test(
    'each attempt the runtime ended unstarted or lost is one line, in the workflow layer’s own word, of the runtime',
    async () => {
      other = await inRepo('the run it waits on', true);
      run = await inRepo('the acts', false);
      await tick();
      ended(task(run, 'plan'), ['unstartable', 'lost', 'lost']);
      await ticks(3);
      assert.deepEqual(
        [...said(run.id, 'SpawnFailed'), ...said(run.id, 'SessionLost')].map((l) => [l.step, l.word, l.note, l.source, l.type]),
        [
          ['plan', 'nothing started', 'try 1', 'runtime', 'Warning'],
          ['plan', 'session lost', 'try 1', 'runtime', 'Warning'],
          ['plan', 'session lost', 'try 1', 'runtime', 'Warning'],
        ],
        "faultsOf reads the attempts the pass already read and translates each once, in the workflow layer's own words",
      );
    },
  );
  await s.test(
    "REFUSED: no runtime word crosses into a signal — one site of the feed's code names it, the table that translates it",
    () => {
      for (const line of lines())
        assert.equal(
          JSON.stringify(line).includes('unstartable'),
          false,
          `a runtime end reason reached a line of the feed: ${JSON.stringify(line)}`,
        );
      const here = path.join(import.meta.dirname, '..', 'src', 'feed');
      const naming = fs
        .readdirSync(here)
        .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
        .filter((f) => fs.readFileSync(path.join(here, f), 'utf8').includes('unstartable'));
      assert.deepEqual(naming, ['word-feed.verb.ts']);
    },
  );
  let put = '';
  await s.test("the hold a person put is read off the record's own composed fact, once, as the person's deed", async () => {
    await stage.runWith(stage.board().e, hold(run.id, [other.id], { why: 'it waits on the other run', by: 'operator' }));
    await ticks(3);
    put = readRun(run.id).hold!.at;
    assert.deepEqual(
      said(run.id, 'HoldPut').map((l) => [l.word, l.note, l.source]),
      [['hold put', `since ${put}`, 'person']],
    );
  });
  await s.test(
    'and the hold taken off by hand, which leaves only an absence on disk, is said once off the put the feed holds',
    async () => {
      await stage.runWith(stage.board().e, unhold(run.id));
      await ticks(3);
      assert.deepEqual(
        said(run.id, 'HoldLifted').map((l) => [l.word, l.note, l.source]),
        [['hold lifted', `since ${put}`, 'person']],
      );
    },
  );
  await s.test(
    "the approval a person wrote at the gate is a line of its own, beside the state line the gate's own word wrote",
    async () => {
      settle(task(run, 'plan'), 'succeeded', SIGNED);
      await ticks(3);
      await stage.runWith(stage.board().e, approveRun(run.id, 'plan'));
      await ticks(3);
      const approval = readRun(run.id).approvals![0];
      assert.deepEqual(
        said(run.id, 'Approved').map((l) => [l.step, l.word, l.note, l.try, l.source]),
        [['plan', 'approved', `try ${approval.try} · at ${approval.at}`, approval.try, 'person']],
      );
    },
  );
  await s.test('a person calling the run off is one act and one state line', async () => {
    await stage.runWith(stage.board().e, cancelRun(run.id));
    await ticks(3);
    assert.deepEqual(
      said(run.id, 'CancelAsked').map((l) => [l.word, l.note, l.source]),
      [['cancel asked', `at ${readRun(run.id).cancelledAt}`, 'person']],
    );
    assert.deepEqual(
      words(run.id).filter((w) => w === 'cancelled'),
      ['cancelled'],
    );
    for (const reason of ['Approved', 'CancelAsked', 'HoldPut', 'HoldLifted', 'SpawnFailed', 'SessionLost'] as const)
      assert.equal(
        said(run.id, reason).every((l) => l.waits === undefined),
        true,
        `${reason} wakes nobody on its own`,
      );
  });
  await s.test("a pruned run's word says so, once: `nemia prune`'s marker is a person's fact, and the run's line gains it", async () => {
    fs.writeFileSync(path.join(RUNS, `${other.id}.pruned`), JSON.stringify({ at: '2026-09-22T10:00:00.000Z', worktrees: [] }));
    await ticks(3);
    assert.equal(readRun(other.id).pruned !== undefined, true);
    assert.deepEqual(
      words(other.id).filter((w) => w.endsWith('(pruned)')),
      ['running (pruned)'],
    );
  });
  await s.test('a run gone from the store writes one `removed`, with no line for its steps, then nothing, a restart included', async () => {
    fs.rmSync(path.join(RUNS, `${other.id}.json`));
    fs.rmSync(path.join(RUNS, `${other.id}.pruned`), { force: true });
    const before = lines().length;
    await ticks(3);
    assert.deepEqual(
      lines()
        .slice(before)
        .map((l) => [l.run, l.step, l.word]),
      [[other.id, undefined, 'removed']],
      "`nemia rm` removes the record, and the feed keeps the run's lines: the next pass says it is gone, once",
    );
    assert.deepEqual(recordFeed(judged(await tick()), { memo: freshFeedMemo() }).lines, [], 'a restarted daemon reads it as gone');
  });
});

test("a step's denials, each a one-shot of the runtime counted by its step and the try its task was filed for, never in a note", async (t) => {
  const s = story(t);
  emptyStore();
  const denied = (run: Run, step = 'plan') => lines().filter((l) => l.run === run.id && l.step === step && l.reason === 'ToolDenied');
  await s.test(
    'a step denied a call twice writes two one-shots over three passes, each with the step’s labels, and no note says it',
    async () => {
      const run = await started('the denial');
      await tick();
      settle(task(run, 'plan'), 'running (working)');
      deny(task(run, 'plan'), [
        { tool: 'Bash', what: 'git push' },
        { tool: 'Bash', what: 'git push' },
      ]);
      await ticks(3);
      const shots = denied(run);
      assert.deepEqual(
        shots.map((l) => [l.step, l.word, l.note]),
        [
          ['plan', 'denied: Bash(git push)', 'try 1'],
          ['plan', 'denied: Bash(git push)', 'try 1'],
        ],
      );
      assert.deepEqual(
        shots.map((l) => l.labels),
        Array(2).fill(shots[0].labels),
        'each carries the step’s labels',
      );
      assert.deepEqual([shots[0].labels?.step, shots[0].labels?.run], ['plan', run.id]);
      assert.deepEqual(
        lines().filter((l) => l.note?.includes('denied:')),
        [],
        'and no step’s note says a word of it: the denial is a signal of its own',
      );
    },
  );
  await s.test('a line’s labels are the ones stepLabels and runLabels give, so no second writer decides what a label is', async () => {
    const run = await started('the labels');
    await tick();
    settle(task(run, 'plan'), 'running (working)');
    deny(task(run, 'plan'), [{ tool: 'Bash', what: 'git push' }]);
    await tick();
    const record = readRun(run.id);
    const plan = stepsOf(record).find((st) => st.name === 'plan')!;
    assert.deepEqual(stepLabels(record, plan), {
      run: run.id,
      factory: DEFAULT_FACTORY,
      workflow: path.basename(record.workflowDir),
      step: 'plan',
      agent: 'none',
    });
    const ofPlan = lines().filter((l) => l.run === run.id && l.step === 'plan');
    assert.ok(ofPlan.length >= 2, 'the step said a word of its own');
    assert.ok(
      ofPlan.some((l) => l.reason === 'ToolDenied'),
      'and carries a one-shot, whose labels are filled where it is written',
    );
    for (const l of ofPlan) assert.deepEqual(l.labels, stepLabels(record, plan), `${l.word} carries the labels of the step’s filing`);
    const ofRun = lines().filter((l) => l.run === run.id && l.step === undefined);
    assert.ok(ofRun.length > 0, 'the run said a word of its own');
    for (const l of ofRun) assert.deepEqual(l.labels, runLabels(record), `${l.word} carries the labels the run is known by`);
  });
  await s.test('REFUSED: a recheck says no denial again — a one-shot is counted by the try its task was filed for', async () => {
    const run = await started('the recheck');
    await tick();
    settle(task(run, 'plan'), 'running (working)');
    deny(task(run, 'plan'), [{ tool: 'Bash', what: 'git push' }]);
    await tick();
    assert.deepEqual(
      denied(run).map((l) => [l.try, l.note]),
      [[1, 'try 1']],
      'the denial was written once, on the try its task was filed for',
    );
    const before = readRun(run.id);
    const plan = before.steps.plan;
    rewriteRun({ ...before, steps: { ...before.steps, plan: { ...plan, tries: [{ taskId: plan.taskId!, then: 'recheck' }] } } });
    assert.equal(tryOf(readRun(run.id), 'plan'), 2, 'the step is on a second try, on the task it was already on');
    await ticks(3);
    assert.deepEqual(
      denied(run).map((l) => [l.try, l.note]),
      [[1, 'try 1']],
      'and the recheck says it neither again nor under a try the runtime never journalled it on',
    );
  });
  await s.test('a step at work denied a call says it while its word stands at running, on a pass that reads no rest', async () => {
    const run = await started('the live denial');
    await tick();
    settle(task(run, 'plan'), 'running (working)');
    await ticks(2);
    assert.equal(words(run.id, 'plan').at(-1), 'running', 'the step is at work, and the feed said so');
    deny(task(run, 'plan'), [{ tool: 'Bash', what: 'git push' }]);
    const pass = await tick({ memo: freshRestMemo() });
    assert.equal(judged(pass).get(run.id)!.atRest, undefined, 'a run with a step at work is not at rest');
    const plan = lines().filter((l) => l.run === run.id && l.step === 'plan');
    assert.deepEqual(
      { word: plan.at(-1)!.word, note: plan.at(-1)!.note, reason: plan.at(-1)!.reason, source: plan.at(-1)!.source },
      { word: 'denied: Bash(git push)', note: 'try 1', reason: 'ToolDenied', source: 'runtime' },
    );
    assert.deepEqual(
      plan.filter((l) => l.reason !== 'ToolDenied').map((l) => l.word),
      ['waiting', 'running'],
      'and the step’s own word is said once, not again beside the denial',
    );
  });
  await s.test(
    'a running step’s every denial is a one-shot of its own, said while the attempt runs: a call denied twice is two lines',
    async () => {
      const run = await started('the live denials');
      await tick();
      const id = task(run, 'plan');
      settle(id, 'running (working)');
      const [ls, glob] = [{ tool: 'Bash', what: 'ls' }, { tool: 'Glob' }];
      deny(id, [ls], true);
      await tick();
      assert.deepEqual(
        denied(run).map((l) => l.call),
        ['Bash(ls)'],
        'said while the attempt runs, and not held until it ends',
      );
      deny(id, [ls, ls], true);
      await tick();
      assert.deepEqual(
        denied(run).map((l) => l.call),
        ['Bash(ls)', 'Bash(ls)'],
      );
      deny(id, [ls, ls, glob], true);
      await tick();
      deny(id, [ls, ls, glob]);
      await ticks(2);
      assert.deepEqual(
        denied(run).map((l) => [l.call, l.try]),
        [
          ['Bash(ls)', 1],
          ['Bash(ls)', 1],
          ['Glob', 1],
        ],
        'each denial once, in the order the runtime journalled them, each on the step’s first try — and the attempt ending adds none',
      );
    },
  );
  await s.test('a step whose attempt ends with a new denial says it on the pass that reads it ended, as the run finishes', async () => {
    const run = await started('the late denial', UNGATED);
    await tick();
    settle(task(run, 'plan'), 'succeeded', SIGNED);
    await ticks(3);
    assert.equal(words(run.id, 'implement').at(-1), 'pending', 'implement is filed');
    settle(task(run, 'implement'), 'succeeded', SIGNED);
    deny(task(run, 'implement'), [{ tool: 'Bash', what: 'git push' }]);
    for (let i = 0; i < 2; i++) await tick({ memo: freshRestMemo() });
    assert.deepEqual(
      lines()
        .filter((l) => l.run === run.id && l.step === 'implement')
        .map((l) => [l.word, l.note]),
      [
        ['waiting', undefined],
        ['pending', undefined],
        ['unverified · done', undefined],
        ['denied: Bash(git push)', 'try 1'],
      ],
      'the denial of the step that ended is its own line, once, beside the word it ended on',
    );
    assert.equal(words(run.id).at(-1), 'succeeded', 'and the run says it finished');
  });
  await s.test('REFUSED: finished runs write no state line for a denial read late — the one-shot alone, once, judged at rest', async () => {
    emptyStore();
    const runs = await Promise.all(['one', 'two', 'three'].map((brief) => started(brief, UNGATED)));
    await tick();
    for (const r of runs) settle(task(r, 'plan'), 'succeeded', SIGNED);
    await ticks(3);
    for (const r of runs) settle(task(r, 'implement'), 'succeeded', SIGNED);
    await ticks(3);
    for (const r of runs)
      assert.deepEqual(
        [words(r.id).at(-1), words(r.id, 'plan').at(-1), words(r.id, 'implement').at(-1)],
        ['succeeded', 'unverified · done', 'unverified · done'],
        'each run finished, and the feed said so',
      );
    for (const r of runs) deny(task(r, 'plan'), [{ tool: 'Bash', what: 'git push' }]);
    for (const r of runs) rewriteRun({ ...readRun(r.id), deniedCounted: [{ task: task(r, 'plan'), attempts: 1 }] });
    const quiet = lines().filter((l) => l.reason !== 'ToolDenied').length;
    for (let i = 0; i < 2; i++) {
      const pass = await tick({ memo: freshRestMemo() });
      for (const r of runs) {
        const judgedOf = judged(pass).get(r.id)!;
        assert.equal(judgedOf.atRest, true, 'the pass found the run at rest');
        assert.deepEqual(judgedOf.denials, [{ step: 'plan', try: 1, call: 'Bash(git push)' }], 'and read the denial its plan carries');
      }
    }
    assert.equal(lines().filter((l) => l.reason !== 'ToolDenied').length, quiet, 'no state line for a run nothing happened to, at rest');
    assert.deepEqual(
      lines()
        .filter((l) => l.reason === 'ToolDenied')
        .map((l) => [l.step, l.word]),
      runs.map(() => ['plan', 'denied: Bash(git push)']),
      'one one-shot for each run’s one denial, over two passes',
    );
    assert.deepEqual(
      lines().filter((l) => l.note?.includes('denied:')),
      [],
      'and no step’s note says it',
    );
  });
});

test('a run waiting on a person says what it waits on, never failed: an ending at its gate, and a step that signed off blocked', async (t) => {
  const s = story(t);
  emptyStore();
  await s.test("a run waiting at its ending's gate reads `awaiting approval` in the feed, as nemia decide says it", async () => {
    const repo = aRepo();
    const run = await stage.runPlaced(startRun({ brief: 'the ship gate', repo, workflowDir: ENDING }));
    await tick();
    const branch = readRun(run.id).steps.implement.branch!;
    stage.place().world.branch(repo, branch, { 'work.txt': 'the work\n' });
    settle(task(run, 'implement'), 'succeeded', SIGNED);
    await ticks(3);
    assert.equal(words(run.id, 'ship').at(-1), 'awaiting approval', 'ship waits at its gate, with work on the branch it left');
    const last = lines()
      .filter((l) => l.run === run.id && l.step === undefined)
      .at(-1)!;
    assert.deepEqual({ word: last.word, note: last.note }, { word: 'awaiting approval', note: 'waiting on you: approve ship' });
    assert.equal(words(run.id).includes('failed'), false, `no line of the run says failed: ${words(run.id).join(' → ')}`);
    const decided = (await printedBy(t, 'decide', run.id)).join('\n');
    assert.match(decided, /AWAITING APPROVAL, waiting on you: ship/, 'nemia decide says the same run awaits approval');
    assert.doesNotMatch(decided, /FAILED/, 'and that nothing failed');
  });
  await s.test('a run whose step broke says failed, gate or not', async () => {
    const broke = await stage.runPlaced(startRun({ brief: 'the break', repo: aRepo(), workflowDir: ENDING }));
    await tick();
    settle(task(broke, 'implement'), 'failed');
    await ticks(2);
    assert.equal(words(broke.id).at(-1), 'failed');
  });
  await s.test(
    'a step that signed off blocked says what it needs on its line, made one line, beside BLOCKED; the run says blocked',
    async () => {
      const run = await started('the question');
      await tick();
      const needs = 'Which colour —\n  red, or\tblue?\n\nThe brief says both.';
      settle(task(run, 'plan'), 'succeeded', { outcome: 'blocked', summary: 'stopped', artifacts: [], needs });
      await ticks(3);
      const plan = lines()
        .filter((l) => l.run === run.id && l.step === 'plan')
        .at(-1)!;
      assert.match(plan.word, /BLOCKED/);
      assert.equal(plan.note, 'needs: Which colour — red, or blue? The brief says both.');
      assert.equal(
        lines().filter((l) => l.run === run.id && l.step === 'plan' && l.note?.startsWith('needs:')).length,
        1,
        'said once, over three passes',
      );
      const runLine = lines()
        .filter((l) => l.run === run.id && l.step === undefined)
        .at(-1)!;
      assert.deepEqual({ word: runLine.word, note: runLine.note }, { word: 'blocked', note: 'waiting on you: plan' });
    },
  );
  await s.test('a long need is clipped, nemia decide having it whole; a step that signed off done says nothing it needs', async () => {
    const long = await started('the long question');
    const other = await started('the done');
    await tick();
    settle(task(long, 'plan'), 'succeeded', { outcome: 'blocked', summary: 'stopped', artifacts: [], needs: 'why '.repeat(100) });
    settle(task(other, 'plan'), 'succeeded', { ...SIGNED, needs: 'nothing, really' });
    await ticks(2);
    const clipped = lines()
      .filter((l) => l.run === long.id && l.step === 'plan')
      .at(-1)!.note!;
    assert.ok(
      clipped.startsWith('needs: why why') && clipped.endsWith('…') && clipped.length <= 'needs: '.length + 200,
      `long, it is clipped: ${clipped}`,
    );
    assert.equal(
      lines().some((l) => l.run === other.id && l.note?.includes('needs:')),
      false,
    );
  });
  await s.test("a session its harness blocked is a person's to answer: its word is not folded into running", async () => {
    const run = await started('the flicker');
    await tick();
    settle(task(run, 'plan'), 'needs-human');
    await tick();
    assert.equal(words(run.id, 'plan').at(-1)!.startsWith('needs-human'), true, words(run.id, 'plan').join(' → '));
  });
});

test(
  'a feed cut under nemia watch — truncated, deleted, replaced — is said once each, the next transition delivered, its cursor file at 0',
  WAITED,
  async (t) => {
    const s = story(t);
    emptyStore();
    const out: string[] = [];
    const err: string[] = [];
    const spoke = bell();
    t.mock.method(console, 'log', (...a: unknown[]) => {
      out.push(a.join(' '));
      spoke.ring();
    });
    t.mock.method(console, 'error', (...a: unknown[]) => {
      err.push(a.join(' '));
      spoke.ring();
    });
    const heard = (ok: () => boolean, what: string) => until(t, ok, what, { bell: spoke, everyMs: 20 });
    const cuts = () => err.filter((l) => l.includes('under this watch'));
    const printed = () => out.join('\n');
    const file = path.join(ROOT, 'cut.cursor');
    fs.rmSync(file, { force: true });
    const kept = (): number | undefined => (fs.existsSync(file) ? Number(fs.readFileSync(file, 'utf8').trim()) : undefined);
    let run: Run;
    let watch: ReturnType<typeof watchPrinted> | undefined;
    t.after(() => watch?.stop());
    await s.test('nemia watch says it is watching from the feed’s end, its engine asked nothing', async () => {
      run = await started('the cut');
      await tick();
      const from = size();
      watch = watchPrinted(from, {}, { cursorFile: file });
      assert.deepEqual(out, [`watching from ${from}, ^C to stop`]);
    });
    await s.test('truncated to nothing: said once, its cursor file at 0, and the gate reached after the cut delivered', async () => {
      fs.truncateSync(FEED, 0);
      await heard(() => cuts().length >= 1, 'the truncation said');
      assert.equal(cuts().length, 1, 'the truncation is said once');
      names(cuts()[0], 'nemia watch:', 'truncated under this watch', 'is 0 bytes now', 'from its start');
      await heard(() => kept() === 0, 'the cursor file rewritten to 0 on the cut');
      settle(task(run, 'plan'), 'succeeded', SIGNED);
      await ticks(2);
      await heard(() => /\splan\s+awaiting approval/.test(printed()), 'the watch reads the feed the tick writes again from its start');
    });
    await s.test('deleted: the same, said once, and the approval after it delivered', async () => {
      const before = printed().length;
      fs.rmSync(FEED);
      await heard(() => cuts().length >= 2, 'the deletion said');
      assert.equal(cuts().length, 2, 'the deletion is said once');
      names(cuts()[1], 'deleted under this watch');
      await stage.runWith(stage.board().e, approveRun(run.id, 'plan'));
      await ticks(2);
      await heard(() => /\splan\s+(?!awaiting)/.test(printed().slice(before)), 'the approval after the deletion is delivered');
    });
    await s.test('replaced by another file of the same bytes and more: its inode tells, not its size; said once, and read', async () => {
      const at = printed().length;
      const next = `${FEED}.next`;
      fs.writeFileSync(
        next,
        `${fs.readFileSync(FEED, 'utf8')}${JSON.stringify({ at: '2026-09-22T10:00:00.000Z', run: 'r-new', word: 'running' })}\n`,
      );
      fs.renameSync(next, FEED);
      await heard(() => cuts().length >= 3 && printed().slice(at).includes('r-new'), 'the replacement said on stderr, and read');
      assert.equal(cuts().length, 3, 'the replacement is said once');
      names(cuts()[2], 'replaced under this watch');
    });
    await s.test('each cut said once: every beat after reads on, the line after is delivered, and no cursor is refused, ever', async () => {
      const quiet = [...err];
      fs.appendFileSync(FEED, `${JSON.stringify({ at: '2026-09-22T10:00:01.000Z', run: 'r-last', word: 'running' })}\n`);
      await heard(() => printed().includes('r-last'), 'the line after delivered');
      assert.deepEqual(err, quiet, 'nothing more said');
      assert.equal(
        err.some((l) => /past the end|falls inside a line/.test(l)),
        false,
      );
      assert.equal(kept(), size(), 'and the cursor file at the feed’s end');
      assert.equal(stage.board().said.length + stage.board().stopped.length, 0, 'the engine asked nothing by the watch');
    });
  },
);
