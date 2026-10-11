/**
 * The queue on disk: the cap on runs in flight (`WF_MAX_RUNS`), and inbox cards that start themselves (`nemia inbox queue`), judged by the
 * tick over every run and card in a store of its own.
 *
 * What the cap and the queue decide is pure, and lives in run.test.ts and inbox.test.ts. This is the part that is not: a pass over the
 * whole store, which advances the runs that have started first, admits the rest oldest first, then starts a queued card while a slot is
 * free — and the verbs that say what it did, as a person types them. A file of its own, since `tick` reads every run under `WF_ROOT`, and
 * the runs of the other store tests would be ticked with these. `WF_ROOT` is read as the module loads, so it is set before the import;
 * `WF_MAX_RUNS` is read on every pass. `WF_VERIFY_REST=1` judges in full every run a pass answers from its memo of runs at rest, and a
 * difference throws (`verifyRest` in tick.verb.ts).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Engine } from '../src/runtime-client.ts';
import type { Run, TaskPhase } from '../src/run.ts';
import { queueLine } from '../src/inbox/inbox.ts';
import { scratch } from './scratch.ts';
import { TEAM } from './team.ts';
import { decideScreen } from './screens.ts';
import { promised } from './promised.ts';
import { Effect } from 'effect';
import { runGiven, runOver } from './placed.ts';

const ROOT = scratch('wf-queue-');
const RUNS = path.join(ROOT, 'runs');
const INBOX = path.join(ROOT, 'inbox');

process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_RUNS;
delete process.env.WF_MAX_CONCURRENT;
const {
  addFactory,
  addToInbox,
  attachWorkflow,
  cancelRun,
  decideRun,
  readInbox,
  startRun,
  startFromInbox,
  tickRun,
  runWith: runEngine,
  gitPlaceLayer,
} = await import('../src/runner.ts');
const runWith = runOver(runEngine, gitPlaceLayer);
const runPlaced = runGiven(gitPlaceLayer);
const { listRuns, readRun } = await import('../src/record/record.store.ts');
const { main } = await import('../src/cli/main.ts');
const { filesStore } = await import('../src/record/files.store.ts');

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };

/** Refused by name: exit 2, and the message — never `String(err)`, which starts with `Error: `. */
const refusedWith = (pattern: RegExp) => (err: Error & { exitCode?: number }) => err.exitCode === 2 && pattern.test(err.message);

/** Refused by name, as `refusedWith`, and of the kind `tag` (`Missing`, `Conflict`, `Invalid`), which the api answers a status by. */
const refusedAs = (tag: string, pattern: RegExp) => (err: Error & { exitCode?: number; _tag?: string }) =>
  err._tag === tag && refusedWith(pattern)(err);

/**
 * An engine board a test settles by hand, as the engine would: a task filed is `pending`, and one asked to stop before it settled is
 * settled `stopped` by the next engine tick. Its feed has every filing, at the time the test's clock says, and `later` moves that clock on,
 * in minutes. `list` views the tasks it is handed that were filed.
 */
/** Hands `e` a tick of its own, which the verbs of the engine then read. */
const retick = (e: Engine, tick: Engine['tick']): void => void Object.assign(e, { tick });

const board = () => {
  const tasks = new Map<
    string,
    { spec: { id: string; brief: string; cwd: string; closeoutSchema?: object }; phase: TaskPhase; closeout?: unknown; filedAt: string }
  >();
  const filings: string[] = [];
  const feed: Array<{ taskId: string; event: { kind: 'filed'; at: string } }> = [];
  const stopping = new Set<string>();
  const settledPhase = (p: TaskPhase) => ['succeeded', 'failed', 'stopped'].includes(p);
  let now = Date.parse('2026-09-16T10:00:00.000Z');
  const e = promised({
    tick: async () => {
      for (const id of stopping) {
        const t = tasks.get(id);
        if (t && !settledPhase(t.phase)) t.phase = 'stopped';
      }
      stopping.clear();
      return { tasks: 0, actions: [], running: {}, views: [] };
    },
    admit: async () => [],
    view: async (id: string) => {
      const t = tasks.get(id);
      return {
        id,
        phase: t?.phase ?? 'pending',
        sessionId: t ? 's' : null,
        state: {
          brief: t?.spec.brief ?? '',
          ...(t ? { filedAt: t.filedAt } : {}),
          closeoutSchema: t?.spec.closeoutSchema,
          settled: t && settledPhase(t.phase) ? t.phase : null,
          stopRequested: stopping.has(id),
          said: [],
          attempts:
            !t || t.phase === 'pending'
              ? []
              : [
                  {
                    n: 1,
                    ended: null,
                    nativeId: `native-${id}`,
                    closeout: t.closeout,
                    exitCode: null,
                    usage: null,
                    startedAt: new Date(now).toISOString(),
                    spawnedAt: new Date(now).toISOString(),
                    endedAt: null,
                    reason: null,
                  },
                ],
        },
      };
    },
    file: async (spec: { id: string; brief: string; cwd: string }) => {
      filings.push(spec.id);
      tasks.set(spec.id, { spec, phase: 'pending', filedAt: new Date(now).toISOString() });
      feed.push({ taskId: spec.id, event: { kind: 'filed', at: new Date(now).toISOString() } });
      return spec.id;
    },
    stop: async (id: string) => {
      stopping.add(id);
    },
    logs: async () => '(no output yet)',
    feed: async (after = 0) => ({ entries: feed.slice(after), cursor: feed.length }),
    list: async (ids?: readonly string[]) => ({
      views: await Promise.all((ids ?? [...tasks.keys()]).filter((id) => tasks.has(id)).map((id) => Effect.runPromise(e.view(id)))),
      unreadable: [],
    }),
  });
  const settle = (id: string, phase: TaskPhase, closeout?: unknown) => Object.assign(tasks.get(id)!, { phase, closeout });
  const later = (minutes: number) => {
    now += minutes * 60_000;
  };
  return { e, tasks, filings, settle, later };
};

/**
 * A store with no runs, no cards, no tries of the queue and no ceilings of a last pass in it, and the cap as given: `undefined` unsets it.
 */
const emptyStore = (cap: string | undefined) => {
  for (const dir of [RUNS, INBOX, path.join(ROOT, 'queue'), path.join(ROOT, 'tick.json')]) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(RUNS, { recursive: true });
  if (cap === undefined) delete process.env.WF_MAX_RUNS;
  else process.env.WF_MAX_RUNS = cap;
};

/** A repository with one commit, so a start has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, stdio: 'ignore' });
  git('init', '-q');
  git('commit', '-q', '--allow-empty', '-m', 'base');
  return repo;
};

/** A workflow of one step, `implement`. */
const oneStep = (() => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  return dir;
})();

/**
 * `nemia start`, for real, of a one-step run over a repository of its own unless given one — created at `createdAt`, written over the
 * record as the test's to say.
 */
const started = async (
  brief: string,
  createdAt: string,
  opts: { isolate?: boolean; after?: string[]; repo?: string } = {},
): Promise<Run> => {
  const run = await runPlaced(
    startRun({
      brief,
      repo: opts.repo ?? aRepo(),
      workflowDir: oneStep,
      isolate: opts.isolate ?? false,
      ...(opts.after ? { after: opts.after } : {}),
    }),
  );
  const file = path.join(RUNS, `${run.id}.json`);
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), createdAt }, null, 2));
  return readRun(run.id);
};
const at = (minute: number) => `2026-09-16T09:${String(minute).padStart(2, '0')}:00.000Z`;

/** What `main` printed, line by line, for one verb. */
const printedBy = async (
  t: { mock: { method: (o: object, m: string, f: (...a: unknown[]) => void) => { mock: { restore: () => void } } } },
  e: Engine,
  ...argv: string[]
): Promise<string[]> => {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.join(' '));
  });
  try {
    await main(argv, e);
  } finally {
    log.mock.restore();
  }
  return printed.join('\n').split('\n');
};

test('REFUSED at a cap of 2 at shipped defaults: a third run is not filed — `nemia tick`, `nemia ls` and `nemia decide` say it is waiting for a run slot (2 of 2 in flight), and the record says when the cap first held it, once', async (t) => {
  emptyStore('2');
  const b = board();
  const one = await started('first', at(1));
  const two = await started('second', at(2));
  const three = await started('third', at(3));

  const ticked = await printedBy(t, b.e, 'tick');
  assert.deepEqual(b.filings, [`${one.id}-implement`, `${two.id}-implement`]);
  assert.ok(ticked.includes(`${three.id}  running  waiting for a run slot (2 of 2 in flight)`), ticked.join('\n'));
  assert.ok(
    ticked.includes('   implement: waiting for a run slot (2 of 2 in flight) — filed once a run in flight settles'),
    ticked.join('\n'),
  );
  const heldAt = readRun(three.id).slotHeldAt;
  assert.ok(heldAt, 'the pass that held it wrote when');

  const { runs: again } = await runWith(b.e, tickRun());
  assert.deepEqual(
    [b.filings.length, readRun(three.id).slotHeldAt],
    [2, heldAt],
    'the next pass holds it again, files nothing, and writes nothing: the time stands',
  );
  assert.deepEqual(again.find((a) => a.run.id === three.id)!.notes, [], 'and the note is said once');
  assert.deepEqual(
    [
      again.find((a) => a.run.id === three.id)!.held,
      again
        .filter((a) => a.inFlight)
        .map((a) => a.run.id)
        .sort(),
    ],
    [{ inFlight: 2, cap: 2 }, [one.id, two.id].sort()],
  );
  assert.deepEqual(readRun(one.id).slotHeldAt, undefined, 'a run the cap never held has no time written');

  const listed = await printedBy(t, b.e, 'ls');
  assert.ok(
    listed.some((l) => /^ {3}implement +waiting for a run slot \(2 of 2 in flight\)/.test(l)),
    listed.join('\n'),
  );
  assert.equal(listed.filter((l) => l.includes('waiting for a run slot')).length, 1, 'the two in flight say pending');
  assert.ok(
    (await printedBy(t, b.e, 'ls', three.id)).some((l) => /^ {3}implement +waiting for a run slot \(2 of 2 in flight\)/.test(l)),
    'judged over the store for one run too',
  );
  assert.deepEqual((await printedBy(t, b.e, 'decide', three.id)).slice(2), [
    '  waiting for a run slot (2 of 2 in flight)',
    `  nothing of ${three.id} is filed until a run in flight settles, oldest held first; nothing to decide yet`,
  ]);
  assert.equal((await runWith(b.e, decideRun(one.id))).held, undefined);
});

test("`nemia ls` and `nemia decide` judge by the cap the last pass ran with, not their own shell's: WF_MAX_RUNS set on the daemon alone still reads a held run as waiting for a run slot, and a shell's own value does not change the count — before any pass, the shell's own", async (t) => {
  emptyStore('2');
  const b = board();
  const one = await started('first', at(1));
  const two = await started('second', at(2));
  const three = await started('third', at(3));
  const recorded = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'tick.json'), 'utf8')) as { sessions: number; runs: number };
  await runWith(b.e, tickRun());
  assert.deepEqual(
    [b.filings, recorded().runs],
    [[`${one.id}-implement`, `${two.id}-implement`], 2],
    "the daemon's pass, with its own environment",
  );

  const seen = async () => ({
    listed: (await printedBy(t, b.e, 'ls')).filter((l) => l.includes('waiting for a run slot')).map((l) => l.trim()),
    decided: (await printedBy(t, b.e, 'decide', three.id)).slice(2),
  });
  const held = {
    listed: ['implement      waiting for a run slot (2 of 2 in flight)'],
    decided: [
      '  waiting for a run slot (2 of 2 in flight)',
      `  nothing of ${three.id} is filed until a run in flight settles, oldest held first; nothing to decide yet`,
    ],
  };
  for (const shell of [undefined, '5', '1', 'two']) {
    if (shell === undefined) delete process.env.WF_MAX_RUNS;
    else process.env.WF_MAX_RUNS = shell;
    assert.deepEqual(await seen(), held, `a shell with WF_MAX_RUNS=${shell} says in nemia ls and nemia decide what the daemon holds`);
  }

  fs.rmSync(path.join(ROOT, 'tick.json'));
  delete process.env.WF_MAX_RUNS;
  assert.deepEqual((await seen()).listed, [], "before any pass has written its ceilings, the shell's own: with none, nothing is held");
  process.env.WF_MAX_RUNS = 'two';
  await assert.rejects(
    main(['ls'], b.e),
    refusedWith(/^WF_MAX_RUNS=two is not a count\./),
    "and a shell's own value that is not a count is refused",
  );

  delete process.env.WF_MAX_RUNS;
  await runWith(b.e, tickRun());
  assert.deepEqual([recorded().runs, b.filings.length], [0, 3], 'a pass that runs with no cap writes that down, and files the third');
  await started('fourth', at(4));
  process.env.WF_MAX_RUNS = '1';
  try {
    assert.deepEqual((await seen()).listed, [], 'not held by a cap the daemon does not run with');
  } finally {
    delete process.env.WF_MAX_RUNS;
  }
});

test('a run that finishes frees its slot on the next pass, and so does one called off — the run held longest takes it, and its timeline counts the wait as queued', async (t) => {
  emptyStore('1');
  const b = board();
  const one = await started('first', at(1));
  const two = await started('second', at(2));
  const three = await started('third', at(3));
  await runWith(b.e, tickRun());
  assert.deepEqual(b.filings, [`${one.id}-implement`]);
  const { runs: first } = await runWith(b.e, tickRun());
  assert.deepEqual(
    first.filter((a) => a.held).map((a) => [a.run.id, a.held]),
    [
      [two.id, { inFlight: 1, cap: 1 }],
      [three.id, { inFlight: 1, cap: 1 }],
    ],
  );

  b.later(12);
  b.settle(`${one.id}-implement`, 'succeeded', SIGNED);
  const { runs: freed } = await runWith(b.e, tickRun());
  assert.deepEqual(
    b.filings,
    [`${one.id}-implement`, `${two.id}-implement`],
    'signed off: finished, and nothing in flight, so the next pass files the run held longest',
  );
  assert.deepEqual(
    [freed.find((a) => a.run.id === two.id)!.filed, freed.find((a) => a.run.id === three.id)!.held],
    [['implement'], { inFlight: 1, cap: 1 }],
    'and holds the other',
  );

  b.settle(`${two.id}-implement`, 'running');
  await runWith(b.e, cancelRun(two.id));
  b.later(3);
  await runWith(b.e, tickRun());
  assert.deepEqual(
    b.filings,
    [`${one.id}-implement`, `${two.id}-implement`, `${three.id}-implement`],
    'called off while it runs: the engine stops it on its tick, and that pass files the third',
  );
  assert.equal(b.tasks.get(`${two.id}-implement`)!.phase, 'stopped');

  b.settle(`${three.id}-implement`, 'succeeded', SIGNED);
  const { timeline } = await runWith(b.e, decideRun(three.id));
  assert.deepEqual(
    timeline.slot,
    { from: at(3), filedAt: '2026-09-16T10:15:00.000Z', ms: 72 * 60_000, queued: '1h12m' },
    "the third was created at 09:03 and filed at 10:15: that wait is its run's queue",
  );
  assert.ok((await printedBy(t, b.e, 'decide', three.id)).includes('  timeline  run slot  queued 1h12m'), 'on the screen');
});

test('a run waiting on `--after` counts only once filed: at a cap of 2, with its parent in flight, a run started after it is filed — and the one after that is held at 2 of 2', async (t) => {
  emptyStore('2');
  const b = board();
  const parent = await started('parent', at(1), { isolate: true });
  await runWith(b.e, tickRun());
  assert.deepEqual(b.filings, [`${parent.id}-implement`]);

  const child = await started('child', at(2), { after: [parent.id], isolate: true, repo: parent.repo });
  const plain = await started('plain', at(3));
  const { runs: pass } = await runWith(b.e, tickRun());
  assert.deepEqual(b.filings, [`${parent.id}-implement`, `${plain.id}-implement`]);
  const waiting = pass.find((a) => a.run.id === child.id)!;
  assert.deepEqual([waiting.waiting.map((w) => w.run), waiting.held, waiting.inFlight], [[parent.id], undefined, false]);

  const later = await started('later', at(4));
  await runWith(b.e, tickRun());
  assert.equal(b.filings.length, 2);
  const listed = await printedBy(t, b.e, 'ls');
  assert.ok(
    listed.some((l) => new RegExp(`^ {3}implement +waiting on ${parent.id}`).test(l)),
    listed.join('\n'),
  );
  assert.equal(listed.filter((l) => l.includes('waiting for a run slot (2 of 2 in flight)')).length, 1, `only ${later.id}`);
});

test('with no cap — WF_MAX_RUNS unset, or 0 — a pass files every run as before, and nothing is written of a slot', async () => {
  for (const cap of [undefined, '0']) {
    emptyStore(cap);
    const b = board();
    const runs = [await started('first', at(1)), await started('second', at(2)), await started('third', at(3))];
    const { runs: pass } = await runWith(b.e, tickRun());
    assert.deepEqual(b.filings.sort(), runs.map((r) => `${r.id}-implement`).sort(), String(cap));
    assert.deepEqual(
      pass.map((a) => a.held),
      [undefined, undefined, undefined],
    );
    assert.ok(runs.every((r) => readRun(r.id).slotHeldAt === undefined));
  }
});

test('the oldest run is admitted first, by when it was created — not by its id, nor the order the store lists it in', async () => {
  emptyStore('1');
  const b = board();
  const youngest = await started('b the youngest', at(9));
  const oldest = await started('c the oldest', at(1));
  const middle = await started('a the middle', at(5));
  assert.deepEqual([middle.id < youngest.id, youngest.id < oldest.id], [true, true], 'ids sort a, b, c; created c, a, b');
  await runWith(b.e, tickRun());
  assert.deepEqual(b.filings, [`${oldest.id}-implement`]);
  b.settle(`${oldest.id}-implement`, 'succeeded', SIGNED);
  await runWith(b.e, tickRun());
  assert.deepEqual(b.filings, [`${oldest.id}-implement`, `${middle.id}-implement`]);
});

test('`nemia up` says both ceilings in words before its first pass — and REFUSED by name, exit 2, a WF_MAX_RUNS that is not a count, by `nemia up`, `nemia tick` and `nemia ls`', async (t) => {
  emptyStore(undefined);
  const b = board();
  const stop = Object.assign(new Error('the test stops the daemon'), { exitCode: 9 });
  retick(b.e, () => Effect.die(stop));
  const concurrent = process.env.WF_MAX_CONCURRENT;
  process.env.WF_MAX_CONCURRENT = '4';
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.join(' '));
  });
  try {
    await assert.rejects(main(['up'], b.e), (err) => err === stop);
    process.env.WF_MAX_RUNS = '2';
    await assert.rejects(main(['up', '1000'], b.e), (err) => err === stop);
  } finally {
    log.mock.restore();
    if (concurrent === undefined) delete process.env.WF_MAX_CONCURRENT;
    else process.env.WF_MAX_CONCURRENT = concurrent;
  }
  const holds = `   holds ${ROOT} as pid ${process.pid} — a second daemon, the api or a nemia up, or a nemia tick, on this store is refused while it ticks (daemon.json)`;
  const startedLines = printed.filter((l) => / {2}daemon started {2}· /.test(l));
  assert.deepEqual(
    startedLines.map((l) => l.replace(/^\d\d:\d\d:\d\d {2}/, '').replace(/at \S+$/, 'at …')),
    [`pid ${process.pid}  daemon started  · first daemon on this store`, `pid ${process.pid}  daemon started  · last stopped at …`],
    'each start writes the feed its daemon started line, the second saying when the first stopped',
  );
  assert.deepEqual(
    printed.filter((l) => !startedLines.includes(l)),
    [
      'up — every 4000ms, ^C to stop',
      '   sessions at work per pool: at most 4 at once — claude with claude-detached, codex, checks each a pool (WF_MAX_CONCURRENT)',
      '   runs in flight: no cap (WF_MAX_RUNS)',
      holds,
      'up — every 1000ms, ^C to stop',
      '   sessions at work per pool: at most 4 at once — claude with claude-detached, codex, checks each a pool (WF_MAX_CONCURRENT)',
      '   runs in flight: at most 2 at once — a run with nothing filed waits for a slot, oldest first (WF_MAX_RUNS)',
      holds,
    ],
    'the store taken is said once per start; daemon.store.test.ts has the rest of it',
  );

  emptyStore('two');
  await started('first', at(1));
  const refused = refusedWith(
    /^WF_MAX_RUNS=two is not a count\. It is the most runs in flight at once, a whole number: WF_MAX_RUNS=2 — or 0, or unset, for no cap\.$/,
  );
  await assert.rejects(main(['up'], board().e), refused);
  await assert.rejects(main(['tick'], board().e), refused);
  await assert.rejects(main(['ls'], board().e), refused);
  emptyStore(undefined);
});

test('REFUSED at shipped defaults: WF_MAX_CONCURRENT=-3 by `nemia up`, before the store is taken, and by `nemia tick` before it admits anything; WF_VERIFY_REST=true by `nemia up`, `nemia tick` and `tick`, before the engine is asked anything — each by name, exit 2', async (t) => {
  emptyStore(undefined);
  await started('first', at(1));
  const daemon = path.join(ROOT, 'daemon.json');
  const held = fs.existsSync(daemon) ? fs.readFileSync(daemon, 'utf8') : undefined;
  const concurrent = process.env.WF_MAX_CONCURRENT;
  t.after(() => {
    if (concurrent === undefined) delete process.env.WF_MAX_CONCURRENT;
    else process.env.WF_MAX_CONCURRENT = concurrent;
    process.env.WF_VERIFY_REST = '1';
  });
  const asked = board();
  const stop = Object.assign(new Error('the engine was asked to tick'), { exitCode: 9 });
  retick(asked.e, () => Effect.die(stop));
  const log = t.mock.method(console, 'log', () => {});

  process.env.WF_MAX_CONCURRENT = '-3';
  const sessions = refusedWith(
    /^WF_MAX_CONCURRENT=-3 is not a count from 1\. It is the most sessions at work per pool at once, a whole number: WF_MAX_CONCURRENT=4 — or unset, for 2\.$/,
  );
  await assert.rejects(main(['up'], asked.e), sessions);
  assert.equal(fs.existsSync(daemon) ? fs.readFileSync(daemon, 'utf8') : undefined, held, 'the store is not taken');
  const ticked = board();
  await assert.rejects(main(['tick'], ticked.e), sessions);
  assert.deepEqual(ticked.filings, [], 'nothing filed by the pass that refused');
  delete process.env.WF_MAX_CONCURRENT;

  process.env.WF_VERIFY_REST = 'true';
  const verify = refusedWith(
    /^WF_VERIFY_REST=true is neither 1 nor 0\. It judges in full each run a pass answers from its memo of runs at rest, which costs all the memo saves: WF_VERIFY_REST=1 — or 0, or unset, for off\.$/,
  );
  await assert.rejects(main(['up'], asked.e), verify);
  await assert.rejects(main(['tick'], asked.e), verify);
  await assert.rejects(runWith(asked.e, tickRun()), verify);
  log.mock.restore();
  assert.deepEqual(asked.filings, [], 'nothing filed');
  emptyStore(undefined);
});

/** A repository with one commit and a one-step workflow under its workflows/ for each name. */
const aRepoWith = (...workflows: string[]): string => {
  const repo = aRepo();
  for (const name of workflows) {
    fs.mkdirSync(path.join(repo, 'workflows', name), { recursive: true });
    fs.writeFileSync(path.join(repo, 'workflows', name, 'implement.md'), `---\nplace: git\n---\nimplement it, on ${name}\n`);
  }
  return repo;
};

/** A card written by hand, under a name of the test's: its keys as given, then its body. */
const aCard = (name: string, keys: Record<string, string>, body: string): string => {
  fs.mkdirSync(INBOX, { recursive: true });
  const file = path.join(INBOX, `${name}.md`);
  fs.writeFileSync(
    file,
    `---\n${Object.entries(keys)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n')}\n---\n${body}\n`,
  );
  return file;
};

const fromCard = (card: string) => listRuns().filter((r) => r.from?.inbox === card);

test('`nemia inbox queue` marks a card, and the next pass starts it with no cap — on its workflow and repo, through the start any card has: the card removed, `nemia tick` and `nemia up` saying `started <card> as <runId>`, and its roots filed on the pass after', async (t) => {
  emptyStore(undefined);
  const b = board();
  const repo = aRepoWith('dev');
  const { card, file } = addToInbox({ text: 'Cache the views between passes', workflow: 'dev', repo });
  const queued = await printedBy(t, b.e, 'inbox', 'queue', card.name);
  const at = /^queued: (.*)$/m.exec(fs.readFileSync(file, 'utf8'))![1];
  assert.deepEqual(
    fs.readFileSync(file, 'utf8'),
    `---\nworkflow: dev\nrepo: ${repo}\nqueued: ${at}\n---\nCache the views between passes\n`,
  );
  assert.deepEqual(queued, [
    `${card.name}  queued at ${at}, 1 of 1  workflow: dev  repo: ${repo}`,
    `the tick starts it on its own once its turn comes and a run slot is free — take it back with nemia inbox queue ${card.name} --off`,
  ]);
  assert.match(
    (await printedBy(t, b.e, 'inbox'))[0],
    new RegExp(`^${card.name}  Cache the views between passes  workflow: dev  repo: \\S+  queued 1 of 1$`),
  );

  const ticked = await printedBy(t, b.e, 'tick');
  const [run] = fromCard(card.name);
  assert.ok(run, 'a run started from the card');
  assert.equal(ticked[0], `started ${card.name} as ${run.id}`);
  assert.deepEqual(
    [run.brief, run.repo, run.workflowDir, run.isolate, fs.existsSync(file), b.filings],
    ['Cache the views between passes', repo, path.join(repo, 'workflows', 'dev'), true, false, []],
  );
  const next = await runWith(b.e, tickRun());
  assert.deepEqual(
    [next.queue, b.filings],
    [undefined, [`${run.id}-implement`]],
    'its roots filed on the next pass, and nothing more started',
  );

  emptyStore(undefined);
  const again = addToInbox({ text: 'Show the flag', workflow: 'dev', repo });
  await printedBy(t, b.e, 'inbox', 'queue', again.card.name);
  const up = board();
  let passes = 0;
  const stop = new Error('the test stops the daemon');
  const inner = up.e.tick;
  retick(up.e, () => {
    if (++passes > 1) return Effect.die(stop);
    return inner();
  });
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.join(' '));
  });
  try {
    await assert.rejects(main(['up', '1'], up.e), (err) => err === stop);
  } finally {
    log.mock.restore();
  }
  const [upRun] = fromCard(again.card.name);
  assert.ok(
    printed.some((l) => new RegExp(`^\\d\\d:\\d\\d:\\d\\d  started ${again.card.name} as ${upRun.id}$`).test(l)),
    `\`nemia up\` logs it the same way, a time before it, on a pass that starts a card:\n${printed.join('\n')}`,
  );
});

test("`nemia inbox queue` keeps the card file's time: a queue is no edit of the idea, and a card's filing time is its mtime — at the command line as through the board", async (t) => {
  emptyStore(undefined);
  const b = board();
  const repo = aRepoWith('dev');
  const { card, file } = addToInbox({ text: 'Filed this morning', workflow: 'dev', repo });
  const filed = new Date('2026-09-16T08:00:00.000Z');
  fs.utimesSync(file, filed, filed);

  await printedBy(t, b.e, 'inbox', 'queue', card.name);
  assert.match(fs.readFileSync(file, 'utf8'), /^queued: /m, 'the card is queued');
  assert.equal(
    fs.statSync(file).mtime.toISOString(),
    filed.toISOString(),
    'and its file is as old as it was, filed long enough ago that a file written by the queue could not pass for it',
  );

  await printedBy(t, b.e, 'inbox', 'queue', card.name, '--off');
  assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /^queued: /m, 'taken back');
  assert.equal(fs.statSync(file).mtime.toISOString(), filed.toISOString(), 'and as old still');

  const fresh = addToInbox({ text: 'Filed now', workflow: 'dev', repo });
  assert.ok(
    fs.statSync(fresh.file).mtime > filed,
    'nemia inbox add writes a card at the time it is filed: it is the queue that keeps the time it found, not every write of the inbox',
  );
});

test('a queued card that names no repository starts on the repository the daemon runs in, as `nemia start` takes `.`', async (t) => {
  emptyStore(undefined);
  const b = board();
  const daemons = aRepoWith('dev');
  const { card } = addToInbox({ text: 'Anywhere the daemon is', workflow: 'dev' });
  await printedBy(t, b.e, 'inbox', 'queue', card.name);
  const pass = await runWith(b.e, tickRun({ repo: daemons }));
  const [run] = fromCard(card.name);
  assert.deepEqual(
    [pass.queue, run?.repo, run?.workflowDir],
    [{ card: card.name, run: run.id, removed: true }, daemons, path.join(daemons, 'workflows', 'dev')],
  );
});

test('REFUSED at a cap of 1 at shipped defaults: with one run in flight a queued card waits, and starts on the pass that sees that run finish — whose run the cap then counts before any other card', async () => {
  emptyStore('1');
  const b = board();
  const repo = aRepoWith('dev');
  const busy = await started('busy', at(1));
  aCard('first-a1b2', { workflow: 'dev', repo, queued: '2026-09-16T09:10:00.000Z' }, 'First');
  aCard('second-c3d4', { workflow: 'dev', repo, queued: '2026-09-16T09:20:00.000Z' }, 'Second');
  const waited = await runWith(b.e, tickRun());
  assert.deepEqual([waited.queue, b.filings, fromCard('first-a1b2')], [undefined, [`${busy.id}-implement`], []]);
  assert.deepEqual((await runWith(b.e, tickRun())).queue, undefined, 'and on every pass the run is in flight');
  assert.ok(fs.existsSync(path.join(INBOX, 'first-a1b2.md')));

  b.settle(`${busy.id}-implement`, 'succeeded', SIGNED);
  const freed = await runWith(b.e, tickRun());
  const [first] = fromCard('first-a1b2');
  assert.deepEqual(freed.queue, { card: 'first-a1b2', run: first.id, removed: true });
  const counted = await runWith(b.e, tickRun());
  assert.deepEqual(
    [counted.queue, b.filings, fromCard('second-c3d4')],
    [undefined, [`${busy.id}-implement`, `${first.id}-implement`], []],
    "the card's run has nothing filed: the next pass admits it into the slot, and the second card waits behind it",
  );
});

test('the oldest queued card starts first — by when it was queued, not by its name — one card a pass', async () => {
  emptyStore(undefined);
  const b = board();
  const repo = aRepoWith('dev');
  aCard('a-young-a1b2', { workflow: 'dev', repo, queued: '2026-09-16T09:30:00.000Z' }, 'Young');
  aCard('z-old-c3d4', { workflow: 'dev', repo, queued: '2026-09-16T09:00:00.000Z' }, 'Old');
  aCard('m-parked-e5f6', { workflow: 'dev', repo }, 'Parked, not queued');
  const first = await runWith(b.e, tickRun());
  assert.deepEqual(
    [first.queue && 'run' in first.queue ? first.queue.card : first.queue, listRuns().map((r) => r.from?.inbox)],
    ['z-old-c3d4', ['z-old-c3d4']],
    'the oldest, and only it',
  );
  await runWith(b.e, tickRun());
  assert.deepEqual(
    listRuns()
      .map((r) => r.from?.inbox ?? '')
      .sort(),
    ['a-young-a1b2', 'z-old-c3d4'],
  );
  await runWith(b.e, tickRun());
  assert.equal(listRuns().filter((r) => r.from).length, 2, 'a card not queued is never started');
  assert.ok(fs.existsSync(path.join(INBOX, 'm-parked-e5f6.md')));
});

test('REFUSED by name at shipped defaults: `nemia inbox queue` of a name with no card, of a card with no workflow — `--workflow` writes both — of one already queued, and of one a run was started from; `--off` and `nemia inbox rm` take a card back, and nothing is started', async (t) => {
  emptyStore(undefined);
  const b = board();
  const repo = aRepoWith('dev');
  const queue = (...argv: string[]) => main(['inbox', 'queue', ...argv], b.e);
  const bare = addToInbox({ text: 'No workflow yet', repo });
  const before = fs.readFileSync(bare.file, 'utf8');

  await assert.rejects(
    queue('no-such-card'),
    refusedAs(
      'Missing',
      new RegExp(
        `^no card no-such-card in the inbox\\. Its cards are: ${bare.card.name}\\. Queue one of those — nemia inbox queue <name> — or park the idea first: nemia inbox add "<idea>"\\.$`,
      ),
    ),
  );
  await assert.rejects(
    queue(),
    refusedWith(
      /^nemia inbox queue takes the name of the card to queue, as nemia inbox lists it: nemia inbox queue <name> \[--workflow <w>\] \[--off\]\.$/,
    ),
  );
  await assert.rejects(queue('../runs/x'), refusedWith(/^`\.\.\/runs\/x` is not a card's name/));
  await assert.rejects(
    queue(bare.card.name),
    refusedAs(
      'Invalid',
      new RegExp(
        `^${bare.card.name}\\.md: no workflow — a queued card starts on its own, and nothing says what runs it\\. Queue it with its workflow: nemia inbox queue ${bare.card.name} --workflow <w> writes both\\.$`,
      ),
    ),
  );
  await assert.rejects(
    queue(bare.card.name, '--off', '--workflow', 'dev'),
    refusedWith(/^--off takes the card out of the queue, and --workflow writes what starts it: give one of them\.$/),
  );
  await assert.rejects(queue(bare.card.name, '--workflow'), refusedWith(/^--workflow takes the workflow the card starts on/));
  await assert.rejects(queue(bare.card.name, 'another'), refusedWith(/^nemia inbox queue queues one card, and another is a second/));
  assert.equal(fs.readFileSync(bare.file, 'utf8'), before, 'nothing written');
  assert.deepEqual(await printedBy(t, b.e, 'inbox', 'queue', bare.card.name, '--off'), [
    `${bare.card.name}  not queued — nothing to take back`,
  ]);

  await printedBy(t, b.e, 'inbox', 'queue', bare.card.name, '--workflow', 'dev');
  assert.match(
    fs.readFileSync(bare.file, 'utf8'),
    new RegExp(`^---\\nworkflow: dev\\nrepo: ${repo.replace(/[.]/g, '\\.')}\\nqueued: \\S+\\n---\\nNo workflow yet\\n$`),
    '--workflow writes both',
  );
  await assert.rejects(
    queue(bare.card.name),
    refusedAs(
      'Conflict',
      new RegExp(
        `^${bare.card.name}\\.md: already queued, at \\S+, 1 in the queue's order: the tick starts it when its turn comes and a run slot is free\\. To queue it again, take it back first: nemia inbox queue ${bare.card.name} --off\\.$`,
      ),
    ),
  );
  assert.deepEqual(await printedBy(t, b.e, 'inbox', 'queue', bare.card.name, '--off'), [
    `${bare.card.name}  taken back: it no longer starts on its own — start it with nemia start ${bare.file}`,
  ]);
  assert.equal(fs.readFileSync(bare.file, 'utf8'), `---\nworkflow: dev\nrepo: ${repo}\n---\nNo workflow yet\n`);
  assert.deepEqual([(await runWith(b.e, tickRun())).queue, listRuns()], [undefined, []], 'taken back: not started');

  await printedBy(t, b.e, 'inbox', 'queue', bare.card.name);
  await printedBy(t, b.e, 'inbox', 'rm', bare.card.name);
  assert.deepEqual([(await runWith(b.e, tickRun())).queue, listRuns()], [undefined, []], 'queued, then dropped: nothing to start');

  const kept = aCard('kept-a1b2', { workflow: 'dev', repo }, 'Started already');
  fs.writeFileSync(
    path.join(RUNS, 'started-already-zz99.json'),
    JSON.stringify({ ...readRun((await started('x', at(1))).id), id: 'started-already-zz99', from: { inbox: 'kept-a1b2' } }),
  );
  const startedAlready =
    /^kept-a1b2\.md: this card was started as started-already-zz99 — that run's record says so — and is still in the inbox because its removal failed\./;
  await assert.rejects(
    queue('kept-a1b2'),
    refusedAs('Conflict', startedAlready),
    "a card a run's record names, its removal failed, is refused",
  );
  await assert.rejects(
    async () => await runPlaced(startFromInbox({ name: 'kept-a1b2', callerRepo: repo })),
    refusedAs('Conflict', startedAlready),
    'and so is its start, of the same kind',
  );
  await assert.rejects(
    async () => await runPlaced(startFromInbox({ name: 'no-such-card', callerRepo: repo })),
    refusedAs('Missing', /^no card no-such-card in the inbox\. Its cards are: .*\. Start one of those — nemia start /),
    'a start of a card not there',
  );
  assert.equal(fs.readFileSync(kept, 'utf8').includes('queued:'), false, 'and not queued');
});

test(
  'a card queued, then started by hand, is not started twice — nor, when its removal failed, by any pass after',
  { skip: process.getuid?.() === 0 && 'root removes a file from a folder it may not write' },
  async (t) => {
    emptyStore(undefined);
    const b = board();
    const repo = aRepoWith('dev');
    const removed = addToInbox({ text: 'Started by hand', workflow: 'dev', repo });
    await printedBy(t, b.e, 'inbox', 'queue', removed.card.name);
    await printedBy(t, b.e, 'start', removed.file);
    assert.equal(fromCard(removed.card.name).length, 1);
    assert.deepEqual(
      [(await runWith(b.e, tickRun())).queue, (await runWith(b.e, tickRun())).queue, fromCard(removed.card.name).length],
      [undefined, undefined, 1],
    );

    const stuck = addToInbox({ text: 'Started by hand, and left behind', workflow: 'dev', repo });
    await printedBy(t, b.e, 'inbox', 'queue', stuck.card.name);
    fs.chmodSync(INBOX, 0o555);
    try {
      await printedBy(t, b.e, 'start', stuck.file);
    } finally {
      fs.chmodSync(INBOX, 0o755);
    }
    assert.deepEqual([fs.existsSync(stuck.file), fromCard(stuck.card.name).length], [true, 1], 'still in the inbox, and started once');
    assert.deepEqual(readInbox().find((l) => l.name === stuck.card.name)!.queued, {
      at: /^queued: (.*)$/m.exec(fs.readFileSync(stuck.file, 'utf8'))![1],
      place: null,
    });
    assert.deepEqual(
      [(await runWith(b.e, tickRun())).queue, (await runWith(b.e, tickRun())).queue, fromCard(stuck.card.name).length],
      [undefined, undefined, 1],
      'not started again',
    );
  },
);

test('REFUSED at shipped defaults: a queued card whose start the package refuses — its workflow gone — is left as it is, named on `nemia tick` and in `nemia inbox`, tried once and not again while it reads the same, and the card behind it has its turn; queued again, it is tried again', async (t) => {
  emptyStore(undefined);
  const b = board();
  const repo = aRepoWith('dev');
  const gone = aCard('gone-a1b2', { workflow: 'nope', repo, queued: '2026-09-16T09:00:00.000Z' }, 'Its workflow is gone');
  aCard('behind-c3d4', { workflow: 'dev', repo, queued: '2026-09-16T09:05:00.000Z' }, 'Behind it');
  const text = fs.readFileSync(gone, 'utf8');

  const ticked = await printedBy(t, b.e, 'tick');
  const why = `gone-a1b2.md: \`workflow: nope\` — no workflow folder at ${path.join(INBOX, 'nope')}, nor a workflow named nope in ${path.join(repo, 'workflows')}.`;
  assert.ok(ticked[0].startsWith(`gone-a1b2 not started: ${why}`), ticked.join('\n'));
  assert.ok(
    ticked[0].endsWith(
      ' — left queued as it is, and not tried again while it reads the same: edit the card, or take it back and queue it again (nemia inbox queue gone-a1b2 --off, then nemia inbox queue gone-a1b2)',
    ),
    ticked[0],
  );
  assert.deepEqual([fs.readFileSync(gone, 'utf8'), listRuns()], [text, []], 'the card as it was, and no run');
  const listed = (await printedBy(t, b.e, 'inbox')).find((l) => l.startsWith('gone-a1b2'))!;
  assert.match(
    listed,
    /^gone-a1b2 +Its workflow is gone  workflow: nope  repo: \S+  queued 1 of 2 — not started at \S+: gone-a1b2\.md: `workflow: nope` — no workflow folder at .* Edit the card, or take it back and queue it again, and the tick tries it again$/,
  );

  const next = await runWith(b.e, tickRun());
  const [behind] = fromCard('behind-c3d4');
  assert.deepEqual(
    next.queue,
    { card: 'behind-c3d4', run: behind.id, removed: true },
    'the next pass does not try it again: the card behind it starts',
  );
  assert.deepEqual(
    [(await runWith(b.e, tickRun())).queue, fromCard('gone-a1b2')],
    [undefined, []],
    'nothing more: the refused card waits for a person',
  );

  fs.mkdirSync(path.join(repo, 'workflows', 'nope'));
  fs.writeFileSync(path.join(repo, 'workflows', 'nope', 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  await printedBy(t, b.e, 'inbox', 'queue', 'gone-a1b2', '--off');
  await printedBy(t, b.e, 'inbox', 'queue', 'gone-a1b2');
  const retried = await runWith(b.e, tickRun());
  const [back] = fromCard('gone-a1b2');
  assert.deepEqual(
    retried.queue,
    { card: 'gone-a1b2', run: back.id, removed: true },
    'the workflow put back, and the card queued again: the next pass tries it, and starts it',
  );
  assert.deepEqual(fs.readdirSync(path.join(ROOT, 'queue')), [], 'its refusal removed once the card no longer read as refused');
});

test('REFUSED at shipped defaults: a queued card whose `repo:` folder was deleted keeps its place, is tried, and its start refused by name on `nemia tick` and in `nemia inbox`, the card left as it is — the card behind it starts on the next pass, and `--off` takes it back', async (t) => {
  emptyStore(undefined);
  const b = board();
  const repo = aRepoWith('dev');
  const doomed = aRepoWith('dev');
  const gone = aCard('gone-a1b2', { workflow: 'dev', repo: doomed, queued: '2026-09-16T09:00:00.000Z' }, 'Its repository is gone');
  aCard('behind-c3d4', { workflow: 'dev', repo, queued: '2026-09-16T09:05:00.000Z' }, 'Behind it');
  fs.rmSync(doomed, { recursive: true, force: true });
  const text = fs.readFileSync(gone, 'utf8');

  const why = `gone-a1b2.md: \`repo: ${doomed}\` names no directory. Correct it to the repository the idea is about, or delete the line, and the card is started on the repository its start names.`;
  assert.deepEqual(await printedBy(t, b.e, 'tick'), [
    `gone-a1b2 not started: ${why} — left queued as it is, and not tried again while it reads the same: edit the card, or take it back and queue it again (nemia inbox queue gone-a1b2 --off, then nemia inbox queue gone-a1b2)`,
  ]);
  assert.deepEqual([fs.readFileSync(gone, 'utf8'), listRuns()], [text, []], 'the card as it was, and no run');
  const listed = (await printedBy(t, b.e, 'inbox')).find((l) => l.startsWith('gone-a1b2'))!;
  assert.match(
    listed,
    new RegExp(
      `^gone-a1b2 +${why.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}  queued 1 of 2 — not started at \\S+ Edit the card, or take it back and queue it again, and the tick tries it again$`,
    ),
  );

  const next = await runWith(b.e, tickRun());
  const [behind] = fromCard('behind-c3d4');
  assert.deepEqual(next.queue, { card: 'behind-c3d4', run: behind.id, removed: true });

  assert.deepEqual(
    await printedBy(t, b.e, 'inbox', 'queue', 'gone-a1b2', '--off'),
    [`gone-a1b2  taken back: it no longer starts on its own — start it with nemia start ${gone}`],
    'taken back though its repository is gone',
  );
  assert.equal(fs.readFileSync(gone, 'utf8'), `---\nworkflow: dev\nrepo: ${doomed}\n---\nIts repository is gone\n`);
  assert.equal(readInbox().find((l) => l.name === 'gone-a1b2')!.queued, undefined, 'and listed with why, out of the queue');
  await assert.rejects(
    main(['inbox', 'queue', 'gone-a1b2'], b.e),
    refusedWith(/^gone-a1b2\.md: `repo: .*` names no directory\./),
    'and queued again only once it reads',
  );
});

test('a queued card whose start fails without a refusal — its `.worktreeinclude` a link to itself, which its place cannot read, say — is not written off: tried again on every pass, where it keeps its place and the card behind it waits, said once on `nemia up`, and started once the failure clears', async (t) => {
  emptyStore(undefined);
  const b = board();
  const repo = aRepoWith('dev');
  const broken = aRepoWith('dev');
  fs.symlinkSync('.worktreeinclude', path.join(broken, '.worktreeinclude'));
  aCard('odd-include-a1b2', { workflow: 'dev', repo: broken, queued: '2026-09-16T09:00:00.000Z' }, 'Its include file is a link to itself');
  aCard('behind-c3d4', { workflow: 'dev', repo, queued: '2026-09-16T09:05:00.000Z' }, 'Behind it');

  const first = await runWith(b.e, tickRun());
  assert.ok(first.queue && 'failed' in first.queue, JSON.stringify(first.queue));
  assert.deepEqual([first.queue.card, first.queue.again], ['odd-include-a1b2', false]);
  assert.match(
    first.queue.failed,
    /^the place's open was not heard: open threw before it answered: ELOOP: too many symbolic links encountered, stat '.*\.worktreeinclude'\. Nothing was started: start it again$/,
    "a repository whose `.worktreeinclude` is a link to itself: the place's open cannot read it, and an open not heard is no refusal",
  );
  const written = JSON.parse(fs.readFileSync(path.join(ROOT, 'queue', 'odd-include-a1b2.json'), 'utf8'));
  assert.deepEqual([written.refused, written.repo, written.why], [false, broken, first.queue.failed]);
  const listed = (await printedBy(t, b.e, 'inbox')).find((l) => l.startsWith('odd-include-a1b2'))!;
  assert.match(
    listed,
    / {2}queued 1 of 2 — failed at \S+: the place's open was not heard: open threw before it answered: ELOOP: too many symbolic links encountered.* — not a refusal: the tick tries it again on every pass, where it keeps its place$/,
  );

  const up = board();
  let passes = 0;
  const stop = new Error('the test stops the daemon');
  const inner = up.e.tick;
  retick(up.e, () => {
    if (++passes > 2) return Effect.die(stop);
    return inner();
  });
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.join(' '));
  });
  try {
    await assert.rejects(main(['up', '1'], up.e), (err) => err === stop);
  } finally {
    log.mock.restore();
  }
  const named = printed.filter((l) => l.includes('odd-include-a1b2'));
  assert.equal(
    named.length,
    1,
    `\`nemia up\` over two passes says the failure once, on its first pass, though it is \`again\`: the \`tick\` above wrote it down and this daemon never printed its line, and a person restarting \`nemia up\` to see why cards stopped starting is told by it:\n${printed.join('\n')}`,
  );
  assert.match(
    named[0],
    /^\d\d:\d\d:\d\d  odd-include-a1b2 not started: the place's open was not heard: open threw before it answered: ELOOP: too many symbolic links encountered.* — not a refusal: tried again on the next pass, where it keeps its place, and said again only if it fails otherwise$/,
  );
  const again = await runWith(b.e, tickRun());
  assert.deepEqual(
    [again.queue && 'failed' in again.queue && again.queue.again, listRuns()],
    [true, []],
    'tried again, and nothing started behind it',
  );
  assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT, 'queue', 'odd-include-a1b2.json'), 'utf8')).at, written.at, 'not written again');

  fs.rmSync(path.join(broken, '.worktreeinclude'));
  const cleared = await runWith(b.e, tickRun());
  const [run] = fromCard('odd-include-a1b2');
  assert.deepEqual(cleared.queue, { card: 'odd-include-a1b2', run: run.id, removed: true }, 'the link gone: the next pass starts it');
  const behind = await runWith(b.e, tickRun());
  assert.deepEqual(
    [behind.queue && 'run' in behind.queue && behind.queue.card, fs.readdirSync(path.join(ROOT, 'queue'))],
    ['behind-c3d4', []],
    'and the pass after removes its try, then starts the card behind it',
  );
});

test("REFUSED at shipped defaults: a queued card whose `repo:` is no git repository, in the place's words, left queued; and the daemon's own stderr is left alone: git's words are not passed through", async (t) => {
  emptyStore(undefined);
  const b = board();
  const bare = fs.mkdtempSync(path.join(ROOT, 'bare-'));
  fs.mkdirSync(path.join(bare, 'workflows', 'dev'), { recursive: true });
  fs.writeFileSync(path.join(bare, 'workflows', 'dev', 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  aCard('no-git-a1b2', { workflow: 'dev', repo: bare, queued: '2026-09-16T09:00:00.000Z' }, 'Its repository has no git');

  const said: string[] = [];
  const stderr = t.mock.method(process.stderr, 'write', (chunk: string | Uint8Array) => {
    said.push(String(chunk));
    return true;
  });
  let pass: Effect.Success<ReturnType<typeof tickRun>>;
  try {
    pass = await runWith(b.e, tickRun());
  } finally {
    stderr.mock.restore();
  }
  assert.deepEqual(
    said,
    [],
    "git writes `fatal:` on its stderr, and that stderr is not the daemon's: a pass every four seconds would print it every four seconds",
  );

  assert.ok(pass.queue && 'refused' in pass.queue, JSON.stringify(pass.queue));
  assert.ok(
    queueLine(pass.queue).startsWith(
      `no-git-a1b2 not started: ${bare} is not a git repository: run git init there and commit once, or name a repository with --repo — left queued as it is`,
    ),
    `the place's open refuses it, and the card is said once with its name on it: ${queueLine(pass.queue)}`,
  );
  assert.deepEqual(listRuns(), [], 'and no run');
});

test('a `nemia up` at a cap of 1 names the card its queue is stuck on once a slot frees, though its first pass read no queue at all: a daemon says what it has not said, not what the store has not written', async (t) => {
  emptyStore('1');
  const b = board();
  const broken = aRepoWith('dev');
  fs.symlinkSync('.worktreeinclude', path.join(broken, '.worktreeinclude'));
  aCard('odd-include-a1b2', { workflow: 'dev', repo: broken, queued: '2026-09-16T09:00:00.000Z' }, 'Its include file is a link to itself');
  const before = await runWith(b.e, tickRun());
  assert.ok(
    before.queue && 'failed' in before.queue && !before.queue.again,
    `a card whose start fails without a refusal, tried and written down by a pass of its own, the daemon that is gone: ${JSON.stringify(before.queue)}`,
  );

  const busy = await started('holds the slot', at(1));
  let passes = 0;
  const stop = new Error('the test stops the daemon');
  const inner = b.e.tick;
  retick(b.e, () => {
    if (++passes > 2) return Effect.die(stop);
    if (passes === 2) b.settle(`${busy.id}-implement`, 'succeeded', SIGNED);
    return inner();
  });
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.join(' '));
  });
  try {
    await assert.rejects(main(['up', '1'], b.e), (err) => err === stop);
  } finally {
    log.mock.restore();
  }

  const named = printed.filter((l) => l.includes('odd-include-a1b2'));
  assert.equal(
    named.length,
    1,
    `a run holds the one slot, so the daemon's first pass reads no queue, and its second tries the card and fails as the pass above did, \`again\`, never said by this daemon:\n${printed.join('\n')}`,
  );
  assert.match(
    named[0],
    /^\d\d:\d\d:\d\d  odd-include-a1b2 not started: the place's open was not heard: open threw before it answered: ELOOP: too many symbolic links/,
  );
  const filed = printed.findIndex((l) => l.includes(`${busy.id}  filed implement`));
  assert.ok(filed >= 0 && filed < printed.indexOf(named[0]), `the pass that held the slot came first: ${printed.join('\n')}`);
});

test("REFUSED at shipped defaults, on the repository it was tried on: a queued card that names no repository, refused on the daemon's — no such workflow there — is passed over by every pass there, and started by a pass in a repository that has its workflow", async (t) => {
  emptyStore(undefined);
  const b = board();
  const none = aRepoWith();
  const dev = aRepoWith('dev');
  const { card } = addToInbox({ text: 'Wherever the daemon is', workflow: 'dev' });
  await printedBy(t, b.e, 'inbox', 'queue', card.name);

  const refused = await runWith(b.e, tickRun({ repo: none }));
  assert.ok(refused.queue && 'refused' in refused.queue, JSON.stringify(refused.queue));
  assert.equal(refused.queue.on, none);
  assert.match(
    queueLine(refused.queue),
    new RegExp(
      `^${card.name} not started on ${none.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}: ${card.name}\\.md: \`workflow: dev\` — no workflow folder at .*, or run nemia up in the repository it is about$`,
    ),
  );
  assert.deepEqual(
    [(await runWith(b.e, tickRun({ repo: none }))).queue, listRuns()],
    [undefined, []],
    'passed over on the same repository',
  );
  assert.match(
    (await printedBy(t, b.e, 'inbox'))[0],
    new RegExp(` — not started at \\S+ on ${none.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}: `),
  );

  const started = await runWith(b.e, tickRun({ repo: dev }));
  const [run] = fromCard(card.name);
  assert.deepEqual([started.queue, run?.repo], [{ card: card.name, run: run.id, removed: true }, dev]);
});

/**
 * The factory `solo`, filed afresh on one repository that holds the tests' team under `workflows/`, with `attached` attached to it: the
 * team's `dev` names its agents in its steps, so a start of it in `solo` hires no one.
 */
const aSoloFactory = (attached: readonly string[]): string => {
  fs.rmSync(path.join(ROOT, 'factories'), { recursive: true, force: true });
  const repo = aRepo();
  fs.cpSync(TEAM, path.join(repo, 'workflows'), { recursive: true });
  addFactory({ name: 'solo', repos: [repo] });
  for (const workflow of attached) attachWorkflow({ factory: 'solo', workflow });
  return repo;
};

test("a queued card of a factory with one repository starts in it, on that repository, from a daemon anywhere — the tick's line names no repository of the daemon's", async (t) => {
  emptyStore(undefined);
  const b = board();
  const solo = aSoloFactory(['dev']);
  const daemons = aRepoWith('dev');
  aCard('solo-card', { workflow: 'dev', factory: 'solo' }, 'Build it in solo.');
  await printedBy(t, b.e, 'inbox', 'queue', 'solo-card');
  const pass = await runWith(b.e, tickRun({ repo: daemons }));
  const [run] = fromCard('solo-card');
  assert.deepEqual(
    [pass.queue, run?.factory, run?.repo, run?.workflowDir],
    [{ card: 'solo-card', run: run?.id, removed: true }, 'solo', solo, path.join(solo, 'workflows', 'dev')],
  );
});

test("REFUSED at shipped defaults, on its factory's repository: a queued card of a workflow its factory has not attached is tried there, and passed over by every pass after, from a daemon anywhere", async (t) => {
  emptyStore(undefined);
  const b = board();
  const solo = aSoloFactory([]);
  const daemons = aRepoWith('dev');
  aCard('unattached-card', { workflow: 'dev', factory: 'solo' }, 'Build it in solo.');
  await printedBy(t, b.e, 'inbox', 'queue', 'unattached-card');
  const refused = await runWith(b.e, tickRun({ repo: daemons }));
  assert.ok(refused.queue && 'refused' in refused.queue, JSON.stringify(refused.queue));
  assert.equal(refused.queue.on, undefined, "the card's factory names the repository, not the daemon");
  assert.match(refused.queue.refused, /^dev: the factory solo does not offer this workflow — it offers none yet\. /);
  assert.equal(filesStore.inbox.tries().get('unattached-card')?.repo, solo);
  assert.deepEqual(
    [(await runWith(b.e, tickRun({ repo: daemons }))).queue, listRuns()],
    [undefined, []],
    'passed over on the same repository',
  );
});

test("REFUSED as shipped: a queued card that names no factory is refused from a daemon in a repository one factory alone holds, said with no start's flag and no repository to run nemia up in, and not tried again; with its factory: written, it starts in it", async (t) => {
  const was = process.env.WF_DEFAULT_FACTORY_STARTS;
  delete process.env.WF_DEFAULT_FACTORY_STARTS;
  t.after(() => {
    if (was !== undefined) process.env.WF_DEFAULT_FACTORY_STARTS = was;
  });
  emptyStore(undefined);
  const b = board();
  const solo = aSoloFactory(['dev']);
  const file = aCard('loose-card', { workflow: 'dev' }, 'Build it, somewhere.');
  await printedBy(t, b.e, 'inbox', 'queue', 'loose-card');
  const refused = await runWith(b.e, tickRun({ repo: solo }));
  assert.ok(refused.queue && 'refused' in refused.queue, JSON.stringify(refused.queue));
  assert.equal(refused.queue.on, undefined, 'refused wherever the daemon runs');
  assert.match(
    refused.queue.refused,
    /^\S+\/inbox\/loose-card\.md: this card names no factory, .* — one of solo; a new card names it as it is filed: /,
  );
  assert.doesNotMatch(refused.queue.refused, /--factory <name>;|at start/, 'a daemon has no flag to give');
  assert.doesNotMatch(queueLine(refused.queue), / not started on |run nemia up in the repository/);
  assert.deepEqual([(await runWith(b.e, tickRun({ repo: solo }))).queue, listRuns()], [undefined, []], 'the refusal lasts');
  const [line] = await printedBy(t, b.e, 'inbox');
  assert.match(line, /^loose-card .* — not started at \S+: \S+\/inbox\/loose-card\.md: this card names no factory, /);
  assert.doesNotMatch(line, /run nemia up in the repository/);

  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('---\nworkflow: dev', '---\nworkflow: dev\nfactory: solo'));
  const pass = await runWith(b.e, tickRun({ repo: aRepoWith('dev') }));
  const [run] = fromCard('loose-card');
  assert.deepEqual([pass.queue, run?.factory, run?.repo], [{ card: 'loose-card', run: run?.id, removed: true }, 'solo', solo]);

  aCard('default-card', { workflow: 'dev', factory: 'default' }, 'Build it in the history.');
  await printedBy(t, b.e, 'inbox', 'queue', 'default-card');
  const history = await runWith(b.e, tickRun({ repo: solo }));
  assert.ok(history.queue && 'refused' in history.queue, JSON.stringify(history.queue));
  assert.match(
    history.queue.refused,
    /^`default` is the default factory: .* Name a factory — `factory: <name>` in \S+\/inbox\/default-card\.md, one of solo\. /,
  );
  assert.deepEqual(fromCard('default-card'), []);
});

test('a record that does not read as a run stops no other run: the pass files the rest, and says once, on stderr, which record it left out and why', async (t) => {
  emptyStore(undefined);
  const b = board();
  const run = await started('a run beside a broken one', at(1));
  const broken = path.join(RUNS, 'r-broken.json');
  fs.writeFileSync(broken, JSON.stringify({ id: 'r-broken', brief: 'written by hand' }));
  const errs: string[] = [];
  const err = t.mock.method(process.stderr, 'write', (chunk: string | Uint8Array) => {
    errs.push(String(chunk));
    return true;
  });
  try {
    const ticked = await printedBy(t, b.e, 'tick');
    assert.deepEqual(b.filings, [`${run.id}-implement`]);
    assert.ok(!ticked.some((l) => l.includes('r-broken')), ticked.join('\n'));
    const listed = await printedBy(t, b.e, 'ls');
    assert.ok(
      listed.some((l) => l.startsWith(run.id)),
      listed.join('\n'),
    );
    await runWith(b.e, tickRun());
  } finally {
    err.mock.restore();
    fs.rmSync(broken);
  }
  const leftOut = errs.filter((l) => l.startsWith('left out: run r-broken: its record, '));
  assert.equal(leftOut.length, 1, `said once a process, pass after pass: ${errs.join('')}`);
  assert.ok(leftOut[0].includes('does not read as a run: its `workspace` is missing'), leftOut[0]);
});

test('a try the tick wrote down is read only as the tick writes it: a file whose `refused` is no boolean, or missing, or that is no try at all, is none — the card is tried again — and a key beside the five is left unread', () => {
  emptyStore(undefined);
  const queue = path.join(ROOT, 'queue');
  fs.mkdirSync(queue, { recursive: true });
  const kept = { at: '2026-09-16T09:00:00.000Z', text: 'the card', repo: '/r', why: 'no workflow', refused: true };
  const files: Record<string, unknown> = {
    kept: { ...kept, by: 'a newer tick' },
    yes: { ...kept, refused: 'yes' },
    unsaid: { at: kept.at, text: kept.text, repo: kept.repo, why: kept.why },
    unrepo: { ...kept, repo: 7 },
    list: [kept],
  };
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(queue, `${name}.json`), JSON.stringify(body));
  fs.writeFileSync(path.join(queue, 'torn.json'), '{"at": "2026');
  assert.deepEqual([...filesStore.inbox.tries()], [['kept', kept]]);
});

test('the whole screen of a run held by the cap on runs in flight', async (t) => {
  emptyStore('1');
  const b = board();
  await started('first', at(1));
  const held = await started('second', at(2));
  await runWith(b.e, tickRun());
  assert.deepEqual(await decideScreen(t, b.e, [held.id], { '<id>': held.id, '<root>': ROOT }), [
    '<id>  second',
    '',
    '  waiting for a run slot (1 of 1 in flight)',
    '  nothing of <id> is filed until a run in flight settles, oldest held first; nothing to decide yet',
  ]);
});

test('`nemia inbox queue --workflow` given a path reads it from where it is typed, and writes it absolute on the card', async (t) => {
  emptyStore(undefined);
  const b = board();
  const repo = aRepoWith('dev');
  const card = addToInbox({ text: 'Queued on a folder', repo });
  const folder = path.join(repo, 'workflows', 'dev');
  await printedBy(t, b.e, 'inbox', 'queue', card.card.name, '--workflow', path.relative(process.cwd(), folder));
  assert.match(
    fs.readFileSync(card.file, 'utf8'),
    new RegExp(`^---\\nworkflow: ${folder.replace(/[.]/g, '\\.')}\\nrepo: `),
    'the folder as typed, from where it was typed',
  );
});
