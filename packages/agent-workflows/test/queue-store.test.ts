/**
 * The queue on disk: the cap on runs in flight (`WF_MAX_RUNS`), judged by the tick over every run in a store of its own.
 *
 * What the cap decides is pure, and lives in run.test.ts. This is the part that is not: a pass over the whole store, which advances the runs
 * that have started first and then admits the rest oldest first, and the verbs that say what it held — as a person types them. A file of its
 * own, since `tick` reads every run under `WF_ROOT`, and the runs of the other store tests would be ticked with these.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Engine } from 'agent-engine';
import type { Run, TaskPhase } from '../src/run.ts';

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-queue-'));
const RUNS = path.join(ROOT, 'runs');

// WF_ROOT is read as the module loads, so it is set before the import rather than after it. WF_MAX_RUNS is read on every pass.
process.env.WF_ROOT = ROOT;
delete process.env.WF_MAX_RUNS;
const { cancel, decide, readRun, start, tick } = await import('../src/runner.ts');
const { main } = await import('../src/cli.ts');

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };

/** Refused by name: exit 2, and the message — never `String(err)`, which starts with `Error: `. */
const refusedWith = (pattern: RegExp) => (err: Error & { exitCode?: number }) => err.exitCode === 2 && pattern.test(err.message);

/**
 * An engine board a test settles by hand, as the engine would: a task filed is `pending`, and one asked to stop before it settled is settled
 * `stopped` by the next engine tick. Its feed has every filing, at the time the test's clock says.
 */
const board = () => {
  const tasks = new Map<string, { spec: { id: string; brief: string; cwd: string; closeoutSchema?: object }; phase: TaskPhase; closeout?: unknown }>();
  const filings: string[] = [];
  const feed: Array<{ taskId: string; event: { kind: 'filed'; at: string } }> = [];
  const stopping = new Set<string>();
  const settledPhase = (p: TaskPhase) => ['succeeded', 'failed', 'stopped'].includes(p);
  let now = Date.parse('2026-09-16T10:00:00.000Z');
  const e = {
    tick: async () => {
      for (const id of stopping) {
        const t = tasks.get(id);
        if (t && !settledPhase(t.phase)) t.phase = 'stopped';
      }
      stopping.clear();
    },
    view: async (id: string) => {
      const t = tasks.get(id);
      return {
        id, phase: t?.phase ?? 'pending', sessionId: t ? 's' : null,
        state: {
          brief: t?.spec.brief ?? '', closeoutSchema: t?.spec.closeoutSchema, settled: t && settledPhase(t.phase) ? t.phase : null, stopRequested: stopping.has(id), said: [],
          attempts: !t || t.phase === 'pending' ? [] : [{ n: 1, ended: null, nativeId: `native-${id}`, closeout: t.closeout, exitCode: null, usage: null, startedAt: new Date(now).toISOString(), spawnedAt: new Date(now).toISOString(), endedAt: null, reason: null }],
        },
      };
    },
    file: async (spec: { id: string; brief: string; cwd: string }) => {
      filings.push(spec.id);
      tasks.set(spec.id, { spec, phase: 'pending' });
      feed.push({ taskId: spec.id, event: { kind: 'filed', at: new Date(now).toISOString() } });
      return spec.id;
    },
    stop: async (id: string) => { stopping.add(id); },
    logs: async () => '(no output yet)',
    feed: async (after = 0) => ({ entries: feed.slice(after), cursor: feed.length }),
  } as unknown as Engine;
  const settle = (id: string, phase: TaskPhase, closeout?: unknown) => Object.assign(tasks.get(id)!, { phase, closeout });
  /** Moves the board's clock on, in minutes. */
  const later = (minutes: number) => { now += minutes * 60_000; };
  return { e, tasks, filings, settle, later };
};

/** A store with no runs in it, and the cap as given: `undefined` unsets it. */
const emptyStore = (cap: string | undefined) => {
  fs.rmSync(RUNS, { recursive: true, force: true });
  fs.mkdirSync(RUNS, { recursive: true });
  if (cap === undefined) delete process.env.WF_MAX_RUNS;
  else process.env.WF_MAX_RUNS = cap;
};

/** A repository with one commit, so a start has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, stdio: 'ignore' });
  git('init', '-q');
  git('commit', '-q', '--allow-empty', '-m', 'base');
  return repo;
};

/** A workflow of one step, `implement`. */
const oneStep = (() => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), 'implement it\n');
  return dir;
})();

/**
 * `wf start`, for real, of a one-step run over a repository of its own unless given one — created at `createdAt`, written over the record as the
 * test's to say.
 */
const started = (brief: string, createdAt: string, opts: { isolate?: boolean; after?: string[]; repo?: string } = {}): Run => {
  const run = start({ brief, repo: opts.repo ?? aRepo(), workflowDir: oneStep, isolate: opts.isolate ?? false, ...(opts.after ? { after: opts.after } : {}) });
  const file = path.join(RUNS, `${run.id}.json`);
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), createdAt }, null, 2));
  return readRun(run.id);
};
const at = (minute: number) => `2026-09-16T09:${String(minute).padStart(2, '0')}:00.000Z`;

/** What `main` printed, line by line, for one verb. */
const printedBy = async (t: { mock: { method: (o: object, m: string, f: (...a: unknown[]) => void) => { mock: { restore: () => void } } } }, e: Engine, ...argv: string[]): Promise<string[]> => {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => { printed.push(args.join(' ')); });
  try { await main(argv, e); } finally { log.mock.restore(); }
  return printed.join('\n').split('\n');
};

test("REFUSED at a cap of 2 at shipped defaults: a third run is not filed — `wf tick`, `wf ls` and `wf decide` say it is waiting for a run slot (2 of 2 in flight), and the record says when the cap first held it, once", async (t) => {
  emptyStore('2');
  const b = board();
  const [one, two, three] = [started('first', at(1)), started('second', at(2)), started('third', at(3))];

  const ticked = await printedBy(t, b.e, 'tick');
  assert.deepEqual(b.filings, [`${one.id}-implement`, `${two.id}-implement`]);
  assert.ok(ticked.includes(`${three.id}  running  waiting for a run slot (2 of 2 in flight)`), ticked.join('\n'));
  assert.ok(ticked.includes('   implement: waiting for a run slot (2 of 2 in flight) — filed once a run in flight settles'), ticked.join('\n'));
  const heldAt = readRun(three.id).slotHeldAt;
  assert.ok(heldAt, 'the pass that held it wrote when');

  // The next pass holds it again, files nothing, and writes nothing: the time stands, and the note is said once.
  const again = await tick(b.e);
  assert.deepEqual([b.filings.length, readRun(three.id).slotHeldAt], [2, heldAt]);
  assert.deepEqual(again.find((a) => a.run.id === three.id)!.notes, []);
  assert.deepEqual([again.find((a) => a.run.id === three.id)!.held, again.filter((a) => a.inFlight).map((a) => a.run.id).sort()], [{ inFlight: 2, cap: 2 }, [one.id, two.id].sort()]);
  assert.deepEqual(readRun(one.id).slotHeldAt, undefined, 'a run the cap never held has no time written');

  const listed = await printedBy(t, b.e, 'ls');
  assert.ok(listed.some((l) => /^ {3}implement +waiting for a run slot \(2 of 2 in flight\)/.test(l)), listed.join('\n'));
  assert.equal(listed.filter((l) => l.includes('waiting for a run slot')).length, 1, 'the two in flight say pending');
  assert.ok((await printedBy(t, b.e, 'ls', three.id)).some((l) => /^ {3}implement +waiting for a run slot \(2 of 2 in flight\)/.test(l)), 'judged over the store for one run too');
  assert.deepEqual((await printedBy(t, b.e, 'decide', three.id)).slice(2), ['  waiting for a run slot (2 of 2 in flight)', `  nothing of ${three.id} is filed until a run in flight settles, oldest held first; nothing to decide yet`]);
  assert.equal((await decide(b.e, one.id)).held, undefined);
});

test('a run that finishes frees its slot on the next pass, and so does one called off — the run held longest takes it, and its timeline counts the wait as queued', async (t) => {
  emptyStore('1');
  const b = board();
  const one = started('first', at(1));
  const two = started('second', at(2));
  const three = started('third', at(3));
  await tick(b.e);
  assert.deepEqual(b.filings, [`${one.id}-implement`]);
  const first = await tick(b.e);
  assert.deepEqual(first.filter((a) => a.held).map((a) => [a.run.id, a.held]), [[two.id, { inFlight: 1, cap: 1 }], [three.id, { inFlight: 1, cap: 1 }]]);

  // Signed off: finished, and nothing in flight. The next pass files the run held longest, and holds the other.
  b.later(12);
  b.settle(`${one.id}-implement`, 'succeeded', SIGNED);
  const freed = await tick(b.e);
  assert.deepEqual(b.filings, [`${one.id}-implement`, `${two.id}-implement`]);
  assert.deepEqual([freed.find((a) => a.run.id === two.id)!.filed, freed.find((a) => a.run.id === three.id)!.held], [['implement'], { inFlight: 1, cap: 1 }]);

  // Called off while it runs: the engine stops it on its tick, and that pass files the third.
  b.settle(`${two.id}-implement`, 'running');
  await cancel(b.e, two.id);
  b.later(3);
  await tick(b.e);
  assert.deepEqual(b.filings, [`${one.id}-implement`, `${two.id}-implement`, `${three.id}-implement`]);
  assert.equal(b.tasks.get(`${two.id}-implement`)!.phase, 'stopped');

  // The third was created at 09:03 and filed at 10:15: that wait is its run's queue.
  b.settle(`${three.id}-implement`, 'succeeded', SIGNED);
  const { timeline } = await decide(b.e, three.id);
  assert.deepEqual(timeline.slot, { from: at(3), filedAt: '2026-09-16T10:15:00.000Z', ms: 72 * 60_000, queued: '1h12m' });
  assert.ok((await printedBy(t, b.e, 'decide', three.id)).includes('  timeline  run slot  queued 1h12m'), 'on the screen');
});

test('a run waiting on `--after` counts only once filed: at a cap of 2, with its parent in flight, a run started after it is filed — and the one after that is held at 2 of 2', async (t) => {
  emptyStore('2');
  const b = board();
  const parent = started('parent', at(1), { isolate: true });
  await tick(b.e);
  assert.deepEqual(b.filings, [`${parent.id}-implement`]);

  const child = started('child', at(2), { after: [parent.id], isolate: true, repo: parent.repo });
  const plain = started('plain', at(3));
  const pass = await tick(b.e);
  assert.deepEqual(b.filings, [`${parent.id}-implement`, `${plain.id}-implement`]);
  const waiting = pass.find((a) => a.run.id === child.id)!;
  assert.deepEqual([waiting.waiting.map((w) => w.run), waiting.held, waiting.inFlight], [[parent.id], undefined, false]);

  const later = started('later', at(4));
  await tick(b.e);
  assert.equal(b.filings.length, 2);
  const listed = await printedBy(t, b.e, 'ls');
  assert.ok(listed.some((l) => new RegExp(`^ {3}implement +waiting on ${parent.id}`).test(l)), listed.join('\n'));
  assert.equal(listed.filter((l) => l.includes('waiting for a run slot (2 of 2 in flight)')).length, 1, `only ${later.id}`);
});

test('with no cap — WF_MAX_RUNS unset, or 0 — a pass files every run as before, and nothing is written of a slot', async () => {
  for (const cap of [undefined, '0']) {
    emptyStore(cap);
    const b = board();
    const runs = [started('first', at(1)), started('second', at(2)), started('third', at(3))];
    const pass = await tick(b.e);
    assert.deepEqual(b.filings.sort(), runs.map((r) => `${r.id}-implement`).sort(), String(cap));
    assert.deepEqual(pass.map((a) => a.held), [undefined, undefined, undefined]);
    assert.ok(runs.every((r) => readRun(r.id).slotHeldAt === undefined));
  }
});

test('the oldest run is admitted first, by when it was created — not by its id, nor the order the store lists it in', async () => {
  emptyStore('1');
  const b = board();
  // Ids sort a, b, c; created c, a, b.
  const youngest = started('b the youngest', at(9));
  const oldest = started('c the oldest', at(1));
  const middle = started('a the middle', at(5));
  assert.deepEqual([middle.id < youngest.id, youngest.id < oldest.id], [true, true]);
  await tick(b.e);
  assert.deepEqual(b.filings, [`${oldest.id}-implement`]);
  b.settle(`${oldest.id}-implement`, 'succeeded', SIGNED);
  await tick(b.e);
  assert.deepEqual(b.filings, [`${oldest.id}-implement`, `${middle.id}-implement`]);
});

test('`wf up` says both ceilings in words before its first pass — and REFUSED by name, exit 2, a WF_MAX_RUNS that is not a count, by `wf up`, `wf tick` and `wf ls`', async (t) => {
  emptyStore(undefined);
  const b = board();
  const stop = Object.assign(new Error('the test stops the daemon'), { exitCode: 9 });
  (b.e as { tick: () => Promise<void> }).tick = async () => { throw stop; };
  const concurrent = process.env.WF_MAX_CONCURRENT;
  process.env.WF_MAX_CONCURRENT = '4';
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => { printed.push(args.join(' ')); });
  try {
    await assert.rejects(main(['up'], b.e), (err) => err === stop);
    process.env.WF_MAX_RUNS = '2';
    await assert.rejects(main(['up', '1000'], b.e), (err) => err === stop);
  } finally {
    log.mock.restore();
    if (concurrent === undefined) delete process.env.WF_MAX_CONCURRENT;
    else process.env.WF_MAX_CONCURRENT = concurrent;
  }
  assert.deepEqual(printed, [
    'up — every 4000ms, ^C to stop',
    '   sessions per harness: at most 4 at once, checks in a pool of their own (WF_MAX_CONCURRENT)',
    '   runs in flight: no cap (WF_MAX_RUNS)',
    'up — every 1000ms, ^C to stop',
    '   sessions per harness: at most 4 at once, checks in a pool of their own (WF_MAX_CONCURRENT)',
    '   runs in flight: at most 2 at once — a run with nothing filed waits for a slot, oldest first (WF_MAX_RUNS)',
  ]);

  emptyStore('two');
  started('first', at(1));
  const refused = refusedWith(/^WF_MAX_RUNS=two is not a count\. It is the most runs in flight at once, a whole number: WF_MAX_RUNS=2 — or 0, or unset, for no cap\.$/);
  await assert.rejects(main(['up'], board().e), refused);
  await assert.rejects(main(['tick'], board().e), refused);
  await assert.rejects(main(['ls'], board().e), refused);
  emptyStore(undefined);
});
