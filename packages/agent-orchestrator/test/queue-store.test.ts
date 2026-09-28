/**
 * The queue on disk: the cap on runs in flight (`WF_MAX_RUNS`), and inbox cards that start themselves (`wf inbox queue`), judged by the tick
 * over every run and card in a store of its own.
 *
 * What the cap and the queue decide is pure, and lives in run.test.ts and inbox.test.ts. This is the part that is not: a pass over the whole
 * store, which advances the runs that have started first, admits the rest oldest first, then starts a queued card while a slot is free — and
 * the verbs that say what it did, as a person types them. A file of its own, since `tick` reads every run under `WF_ROOT`, and the runs of the
 * other store tests would be ticked with these.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Engine } from 'agent-runtime';
import type { Run, TaskPhase } from '../src/run.ts';
import { queueLine } from '../src/inbox.ts';
import { scratch } from './scratch.ts';

const ROOT = scratch('wf-queue-');
const RUNS = path.join(ROOT, 'runs');
const INBOX = path.join(ROOT, 'inbox');

// WF_ROOT is read as the module loads, so it is set before the import rather than after it. WF_MAX_RUNS is read on every pass.
process.env.WF_ROOT = ROOT;
// Every run a pass answers from its memo of runs at rest is judged in full as well, and a difference throws (`verifyRest` in tick.ts).
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_RUNS;
const { addToInbox, cancel, decide, listRuns, readInbox, readRun, start, tick } = await import('../src/runner.ts');
const { main } = await import('../src/cli.ts');

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };

/** Refused by name: exit 2, and the message — never `String(err)`, which starts with `Error: `. */
const refusedWith = (pattern: RegExp) => (err: Error & { exitCode?: number }) => err.exitCode === 2 && pattern.test(err.message);

/**
 * An engine board a test settles by hand, as the engine would: a task filed is `pending`, and one asked to stop before it settled is settled
 * `stopped` by the next engine tick. Its feed has every filing, at the time the test's clock says.
 */
const board = () => {
  const tasks = new Map<string, { spec: { id: string; brief: string; cwd: string; closeoutSchema?: object }; phase: TaskPhase; closeout?: unknown; filedAt: string }>();
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
      return ({ tasks: 0, actions: [], running: {}, views: [] });
    },
    admit: async () => [],
    view: async (id: string) => {
      const t = tasks.get(id);
      return {
        id, phase: t?.phase ?? 'pending', sessionId: t ? 's' : null,
        state: {
          brief: t?.spec.brief ?? '', ...(t ? { filedAt: t.filedAt } : {}), closeoutSchema: t?.spec.closeoutSchema, settled: t && settledPhase(t.phase) ? t.phase : null, stopRequested: stopping.has(id), said: [],
          attempts: !t || t.phase === 'pending' ? [] : [{ n: 1, ended: null, nativeId: `native-${id}`, closeout: t.closeout, exitCode: null, usage: null, startedAt: new Date(now).toISOString(), spawnedAt: new Date(now).toISOString(), endedAt: null, reason: null }],
        },
      };
    },
    file: async (spec: { id: string; brief: string; cwd: string }) => {
      filings.push(spec.id);
      tasks.set(spec.id, { spec, phase: 'pending', filedAt: new Date(now).toISOString() });
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

/** A store with no runs, no cards, no tries of the queue and no ceilings of a last pass in it, and the cap as given: `undefined` unsets it. */
const emptyStore = (cap: string | undefined) => {
  for (const dir of [RUNS, INBOX, path.join(ROOT, 'queue'), path.join(ROOT, 'tick.json')]) fs.rmSync(dir, { recursive: true, force: true });
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
  const { runs: again } = await tick(b.e);
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

test("`wf ls` and `wf decide` judge by the cap the last pass ran with, not their own shell's: WF_MAX_RUNS set on the daemon alone still reads a held run as waiting for a run slot, and a shell's own value does not change the count — before any pass, the shell's own", async (t) => {
  emptyStore('2');
  const b = board();
  const [one, two, three] = [started('first', at(1)), started('second', at(2)), started('third', at(3))];
  const recorded = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'tick.json'), 'utf8')) as { sessions: number; runs: number };
  // The daemon's pass, with its own environment.
  await tick(b.e);
  assert.deepEqual([b.filings, recorded().runs], [[`${one.id}-implement`, `${two.id}-implement`], 2]);

  /** What a person's shell says of the store: `wf ls`'s lines that wait for a slot, and `wf decide` on the third run. */
  const seen = async () => ({
    listed: (await printedBy(t, b.e, 'ls')).filter((l) => l.includes('waiting for a run slot')).map((l) => l.trim()),
    decided: (await printedBy(t, b.e, 'decide', three.id)).slice(2),
  });
  const held = {
    listed: ['implement      waiting for a run slot (2 of 2 in flight)'],
    decided: ['  waiting for a run slot (2 of 2 in flight)', `  nothing of ${three.id} is filed until a run in flight settles, oldest held first; nothing to decide yet`],
  };
  // A shell with no WF_MAX_RUNS, and shells with other values, one that is not a count among them: each says what the daemon holds.
  for (const shell of [undefined, '5', '1', 'two']) {
    if (shell === undefined) delete process.env.WF_MAX_RUNS;
    else process.env.WF_MAX_RUNS = shell;
    assert.deepEqual(await seen(), held, `WF_MAX_RUNS=${shell}`);
  }

  // Before any pass has written its ceilings, the shell's own: with none, nothing is held, and a value that is not a count is refused.
  fs.rmSync(path.join(ROOT, 'tick.json'));
  delete process.env.WF_MAX_RUNS;
  assert.deepEqual((await seen()).listed, []);
  process.env.WF_MAX_RUNS = 'two';
  await assert.rejects(main(['ls'], b.e), refusedWith(/^WF_MAX_RUNS=two is not a count\./));

  // A pass that runs with no cap writes that down, and files the third: a shell that sets a cap reads none.
  delete process.env.WF_MAX_RUNS;
  await tick(b.e);
  assert.deepEqual([recorded().runs, b.filings.length], [0, 3]);
  started('fourth', at(4));
  process.env.WF_MAX_RUNS = '1';
  try {
    assert.deepEqual((await seen()).listed, [], 'not held by a cap the daemon does not run with');
  } finally { delete process.env.WF_MAX_RUNS; }
});

test('a run that finishes frees its slot on the next pass, and so does one called off — the run held longest takes it, and its timeline counts the wait as queued', async (t) => {
  emptyStore('1');
  const b = board();
  const one = started('first', at(1));
  const two = started('second', at(2));
  const three = started('third', at(3));
  await tick(b.e);
  assert.deepEqual(b.filings, [`${one.id}-implement`]);
  const { runs: first } = await tick(b.e);
  assert.deepEqual(first.filter((a) => a.held).map((a) => [a.run.id, a.held]), [[two.id, { inFlight: 1, cap: 1 }], [three.id, { inFlight: 1, cap: 1 }]]);

  // Signed off: finished, and nothing in flight. The next pass files the run held longest, and holds the other.
  b.later(12);
  b.settle(`${one.id}-implement`, 'succeeded', SIGNED);
  const { runs: freed } = await tick(b.e);
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
  const { runs: pass } = await tick(b.e);
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
    const { runs: pass } = await tick(b.e);
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
  (b.e as { tick: () => Promise<unknown> }).tick = async () => { throw stop; };
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
  // The store taken, said once per start (daemon-store.test.ts has the rest of it).
  const holds = `   holds ${ROOT} as pid ${process.pid} — a second wf up, or a wf tick, on this store is refused while it ticks (daemon.json)`;
  assert.deepEqual(printed, [
    'up — every 4000ms, ^C to stop',
    '   sessions at work per pool: at most 4 at once — claude with claude-detached, codex, checks each a pool (WF_MAX_CONCURRENT)',
    '   runs in flight: no cap (WF_MAX_RUNS)',
    holds,
    'up — every 1000ms, ^C to stop',
    '   sessions at work per pool: at most 4 at once — claude with claude-detached, codex, checks each a pool (WF_MAX_CONCURRENT)',
    '   runs in flight: at most 2 at once — a run with nothing filed waits for a slot, oldest first (WF_MAX_RUNS)',
    holds,
  ]);

  emptyStore('two');
  started('first', at(1));
  const refused = refusedWith(/^WF_MAX_RUNS=two is not a count\. It is the most runs in flight at once, a whole number: WF_MAX_RUNS=2 — or 0, or unset, for no cap\.$/);
  await assert.rejects(main(['up'], board().e), refused);
  await assert.rejects(main(['tick'], board().e), refused);
  await assert.rejects(main(['ls'], board().e), refused);
  emptyStore(undefined);
});

// ─── cards that start themselves ────────────────────────────────────────────

/** A repository with one commit and a one-step workflow under its workflows/ for each name. */
const aRepoWith = (...workflows: string[]): string => {
  const repo = aRepo();
  for (const name of workflows) {
    fs.mkdirSync(path.join(repo, 'workflows', name), { recursive: true });
    fs.writeFileSync(path.join(repo, 'workflows', name, 'implement.md'), `implement it, on ${name}\n`);
  }
  return repo;
};

/** A card written by hand, under a name of the test's: its keys as given, then its body. */
const aCard = (name: string, keys: Record<string, string>, body: string): string => {
  fs.mkdirSync(INBOX, { recursive: true });
  const file = path.join(INBOX, `${name}.md`);
  fs.writeFileSync(file, `---\n${Object.entries(keys).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n${body}\n`);
  return file;
};

const fromCard = (card: string) => listRuns().filter((r) => r.from?.inbox === card);

test('`wf inbox queue` marks a card, and the next pass starts it with no cap — on its workflow and repo, through the start any card has: the card removed, `wf tick` and `wf up` saying `started <card> as <runId>`, and its roots filed on the pass after', async (t) => {
  emptyStore(undefined);
  const b = board();
  const repo = aRepoWith('dev');
  const { card, file } = addToInbox({ text: 'Cache the views between passes', workflow: 'dev', repo });
  const queued = await printedBy(t, b.e, 'inbox', 'queue', card.name);
  const at = /^queued: (.*)$/m.exec(fs.readFileSync(file, 'utf8'))![1]!;
  assert.deepEqual(fs.readFileSync(file, 'utf8'), `---\nworkflow: dev\nrepo: ${repo}\nqueued: ${at}\n---\nCache the views between passes\n`);
  assert.deepEqual(queued, [
    `${card.name}  queued at ${at}, 1 of 1  workflow: dev  repo: ${repo}`,
    `the tick starts it on its own once its turn comes and a run slot is free — take it back with wf inbox queue ${card.name} --off`,
  ]);
  assert.match((await printedBy(t, b.e, 'inbox'))[0]!, new RegExp(`^${card.name}  Cache the views between passes  workflow: dev  repo: \\S+  queued 1 of 1$`));

  const ticked = await printedBy(t, b.e, 'tick');
  const [run] = fromCard(card.name);
  assert.ok(run, 'a run started from the card');
  assert.equal(ticked[0], `started ${card.name} as ${run.id}`);
  assert.deepEqual([run.brief, run.repo, run.workflowDir, run.isolate, fs.existsSync(file), b.filings], ['Cache the views between passes', repo, path.join(repo, 'workflows', 'dev'), true, false, []]);
  const next = await tick(b.e);
  assert.deepEqual([next.queue, b.filings], [undefined, [`${run.id}-implement`]], 'its roots filed on the next pass, and nothing more started');

  // `wf up` logs it the same way, a time before it: a pass that starts a card, then a pass the test stops.
  emptyStore(undefined);
  const again = addToInbox({ text: 'Show the flag', workflow: 'dev', repo });
  await printedBy(t, b.e, 'inbox', 'queue', again.card.name);
  const up = board();
  let passes = 0;
  const stop = new Error('the test stops the daemon');
  const inner = up.e.tick.bind(up.e);
  (up.e as { tick: () => Promise<unknown> }).tick = async () => { if (++passes > 1) throw stop; return inner(); };
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => { printed.push(args.join(' ')); });
  try {
    await assert.rejects(main(['up', '1'], up.e), (err) => err === stop);
  } finally { log.mock.restore(); }
  const [upRun] = fromCard(again.card.name);
  assert.ok(printed.some((l) => new RegExp(`^\\d\\d:\\d\\d:\\d\\d  started ${again.card.name} as ${upRun!.id}$`).test(l)), printed.join('\n'));
});

test("`wf inbox queue` keeps the card file's time: a queue is no edit of the idea, and a card's filing time is its mtime — at the command line as through the board", async (t) => {
  emptyStore(undefined);
  const b = board();
  const repo = aRepoWith('dev');
  const { card, file } = addToInbox({ text: 'Filed this morning', workflow: 'dev', repo });
  // Filed long enough ago that a file written by the queue could not pass for it.
  const filed = new Date('2026-09-16T08:00:00.000Z');
  fs.utimesSync(file, filed, filed);

  await printedBy(t, b.e, 'inbox', 'queue', card.name);
  assert.match(fs.readFileSync(file, 'utf8'), /^queued: /m, 'the card is queued');
  assert.equal(fs.statSync(file).mtime.toISOString(), filed.toISOString(), 'and its file is as old as it was');

  await printedBy(t, b.e, 'inbox', 'queue', card.name, '--off');
  assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /^queued: /m, 'taken back');
  assert.equal(fs.statSync(file).mtime.toISOString(), filed.toISOString(), 'and as old still');

  // A card filed is written now: it is the queue that keeps the time it found, not every write of the inbox.
  const fresh = addToInbox({ text: 'Filed now', workflow: 'dev', repo });
  assert.ok(Date.now() - fs.statSync(fresh.file).mtime.getTime() < 60_000, 'wf inbox add writes a card at the time it is filed');
});

test('a queued card that names no repository starts on the repository the daemon runs in, as `wf start` takes `.`', async (t) => {
  emptyStore(undefined);
  const b = board();
  const daemons = aRepoWith('dev');
  const { card } = addToInbox({ text: 'Anywhere the daemon is', workflow: 'dev' });
  await printedBy(t, b.e, 'inbox', 'queue', card.name);
  const pass = await tick(b.e, { repo: daemons });
  const [run] = fromCard(card.name);
  assert.deepEqual([pass.queue, run?.repo, run?.workflowDir], [{ card: card.name, run: run!.id, removed: true }, daemons, path.join(daemons, 'workflows', 'dev')]);
});

test('REFUSED at a cap of 1 at shipped defaults: with one run in flight a queued card waits, and starts on the pass that sees that run finish — whose run the cap then counts before any other card', async () => {
  emptyStore('1');
  const b = board();
  const repo = aRepoWith('dev');
  const busy = started('busy', at(1));
  aCard('first-a1b2', { workflow: 'dev', repo, queued: '2026-09-16T09:10:00.000Z' }, 'First');
  aCard('second-c3d4', { workflow: 'dev', repo, queued: '2026-09-16T09:20:00.000Z' }, 'Second');
  const waited = await tick(b.e);
  assert.deepEqual([waited.queue, b.filings, fromCard('first-a1b2')], [undefined, [`${busy.id}-implement`], []]);
  assert.deepEqual((await tick(b.e)).queue, undefined, 'and on every pass the run is in flight');
  assert.ok(fs.existsSync(path.join(INBOX, 'first-a1b2.md')));

  b.settle(`${busy.id}-implement`, 'succeeded', SIGNED);
  const freed = await tick(b.e);
  const [first] = fromCard('first-a1b2');
  assert.deepEqual(freed.queue, { card: 'first-a1b2', run: first!.id, removed: true });
  // The card's run has nothing filed: the next pass admits it into the slot, and the second card waits behind it.
  const counted = await tick(b.e);
  assert.deepEqual([counted.queue, b.filings, fromCard('second-c3d4')], [undefined, [`${busy.id}-implement`, `${first!.id}-implement`], []]);
});

test('the oldest queued card starts first — by when it was queued, not by its name — one card a pass', async () => {
  emptyStore(undefined);
  const b = board();
  const repo = aRepoWith('dev');
  aCard('a-young-a1b2', { workflow: 'dev', repo, queued: '2026-09-16T09:30:00.000Z' }, 'Young');
  aCard('z-old-c3d4', { workflow: 'dev', repo, queued: '2026-09-16T09:00:00.000Z' }, 'Old');
  aCard('m-parked-e5f6', { workflow: 'dev', repo }, 'Parked, not queued');
  const first = await tick(b.e);
  assert.deepEqual([first.queue && 'run' in first.queue ? first.queue.card : first.queue, listRuns().map((r) => r.from?.inbox)], ['z-old-c3d4', ['z-old-c3d4']], 'the oldest, and only it');
  await tick(b.e);
  assert.deepEqual(listRuns().map((r) => r.from?.inbox ?? '').sort(), ['a-young-a1b2', 'z-old-c3d4']);
  await tick(b.e);
  assert.equal(listRuns().filter((r) => r.from).length, 2, 'a card not queued is never started');
  assert.ok(fs.existsSync(path.join(INBOX, 'm-parked-e5f6.md')));
});

test('REFUSED by name at shipped defaults: `wf inbox queue` of a name with no card, of a card with no workflow — `--workflow` writes both — of one already queued, and of one a run was started from; `--off` and `wf inbox rm` take a card back, and nothing is started', async (t) => {
  emptyStore(undefined);
  const b = board();
  const repo = aRepoWith('dev');
  const queue = (...argv: string[]) => main(['inbox', 'queue', ...argv], b.e);
  const bare = addToInbox({ text: 'No workflow yet', repo });
  const before = fs.readFileSync(bare.file, 'utf8');

  await assert.rejects(queue('no-such-card'), refusedWith(new RegExp(`^no card no-such-card in the inbox\\. Its cards are: ${bare.card.name}\\. Queue one of those — wf inbox queue <name> — or park the idea first: wf inbox add "<idea>"\\.$`)));
  await assert.rejects(queue(), refusedWith(/^wf inbox queue takes the name of the card to queue, as wf inbox lists it: wf inbox queue <name> \[--workflow <w>\] \[--off\]\.$/));
  await assert.rejects(queue('../runs/x'), refusedWith(/^`\.\.\/runs\/x` is not a card's name/));
  await assert.rejects(queue(bare.card.name),
    refusedWith(new RegExp(`^${bare.card.name}\\.md: no workflow — a queued card starts on its own, and nothing says what runs it\\. Queue it with its workflow: wf inbox queue ${bare.card.name} --workflow <w> writes both\\.$`)));
  await assert.rejects(queue(bare.card.name, '--off', '--workflow', 'dev'), refusedWith(/^--off takes the card out of the queue, and --workflow writes what starts it: give one of them\.$/));
  await assert.rejects(queue(bare.card.name, '--workflow'), refusedWith(/^--workflow takes the workflow the card starts on/));
  await assert.rejects(queue(bare.card.name, 'another'), refusedWith(/^wf inbox queue queues one card, and another is a second/));
  assert.equal(fs.readFileSync(bare.file, 'utf8'), before, 'nothing written');
  assert.deepEqual((await printedBy(t, b.e, 'inbox', 'queue', bare.card.name, '--off')), [`${bare.card.name}  not queued — nothing to take back`]);

  await printedBy(t, b.e, 'inbox', 'queue', bare.card.name, '--workflow', 'dev');
  assert.match(fs.readFileSync(bare.file, 'utf8'), new RegExp(`^---\\nworkflow: dev\\nrepo: ${repo.replace(/[.]/g, '\\.')}\\nqueued: \\S+\\n---\\nNo workflow yet\\n$`), '--workflow writes both');
  await assert.rejects(queue(bare.card.name), refusedWith(new RegExp(`^${bare.card.name}\\.md: already queued, at \\S+, 1 in the queue's order: the tick starts it when its turn comes and a run slot is free\\. To queue it again, take it back first: wf inbox queue ${bare.card.name} --off\\.$`)));
  assert.deepEqual(await printedBy(t, b.e, 'inbox', 'queue', bare.card.name, '--off'), [`${bare.card.name}  taken back: it no longer starts on its own — start it with wf start ${bare.file}`]);
  assert.equal(fs.readFileSync(bare.file, 'utf8'), `---\nworkflow: dev\nrepo: ${repo}\n---\nNo workflow yet\n`);
  assert.deepEqual([(await tick(b.e)).queue, listRuns()], [undefined, []], 'taken back: not started');

  // Queued, then dropped: nothing to start.
  await printedBy(t, b.e, 'inbox', 'queue', bare.card.name);
  await printedBy(t, b.e, 'inbox', 'rm', bare.card.name);
  assert.deepEqual([(await tick(b.e)).queue, listRuns()], [undefined, []]);

  // A card a run's record names — its removal failed — is not queued.
  const kept = aCard('kept-a1b2', { workflow: 'dev', repo }, 'Started already');
  fs.writeFileSync(path.join(RUNS, 'started-already-zz99.json'), JSON.stringify({ ...readRun(started('x', at(1)).id), id: 'started-already-zz99', from: { inbox: 'kept-a1b2' } }));
  await assert.rejects(queue('kept-a1b2'), refusedWith(/^kept-a1b2\.md: this card was started as started-already-zz99 — that run's record says so — and is still in the inbox because its removal failed\./));
  assert.equal(fs.readFileSync(kept, 'utf8').includes('queued:'), false);
});

test('a card queued, then started by hand, is not started twice — nor, when its removal failed, by any pass after', { skip: process.getuid?.() === 0 && 'root removes a file from a folder it may not write' }, async (t) => {
  emptyStore(undefined);
  const b = board();
  const repo = aRepoWith('dev');
  const removed = addToInbox({ text: 'Started by hand', workflow: 'dev', repo });
  await printedBy(t, b.e, 'inbox', 'queue', removed.card.name);
  await printedBy(t, b.e, 'start', removed.file);
  assert.equal(fromCard(removed.card.name).length, 1);
  assert.deepEqual([(await tick(b.e)).queue, (await tick(b.e)).queue, fromCard(removed.card.name).length], [undefined, undefined, 1]);

  const stuck = addToInbox({ text: 'Started by hand, and left behind', workflow: 'dev', repo });
  await printedBy(t, b.e, 'inbox', 'queue', stuck.card.name);
  fs.chmodSync(INBOX, 0o555);
  try {
    await printedBy(t, b.e, 'start', stuck.file);
  } finally { fs.chmodSync(INBOX, 0o755); }
  assert.deepEqual([fs.existsSync(stuck.file), fromCard(stuck.card.name).length], [true, 1], 'still in the inbox, and started once');
  assert.deepEqual(readInbox().find((l) => l.name === stuck.card.name)!.queued, { at: /^queued: (.*)$/m.exec(fs.readFileSync(stuck.file, 'utf8'))![1]!, place: null });
  assert.deepEqual([(await tick(b.e)).queue, (await tick(b.e)).queue, fromCard(stuck.card.name).length], [undefined, undefined, 1], 'not started again');
});

test('REFUSED at shipped defaults: a queued card whose start the package refuses — its workflow gone — is left as it is, named on `wf tick` and in `wf inbox`, tried once and not again while it reads the same, and the card behind it has its turn; queued again, it is tried again', async (t) => {
  emptyStore(undefined);
  const b = board();
  const repo = aRepoWith('dev');
  const gone = aCard('gone-a1b2', { workflow: 'nope', repo, queued: '2026-09-16T09:00:00.000Z' }, 'Its workflow is gone');
  aCard('behind-c3d4', { workflow: 'dev', repo, queued: '2026-09-16T09:05:00.000Z' }, 'Behind it');
  const text = fs.readFileSync(gone, 'utf8');

  const ticked = await printedBy(t, b.e, 'tick');
  const why = `gone-a1b2.md: \`workflow: nope\` — no workflow folder at ${path.join(INBOX, 'nope')}, nor a workflow named nope in ${path.join(repo, 'workflows')}.`;
  assert.ok(ticked[0]!.startsWith(`gone-a1b2 not started: ${why}`), ticked.join('\n'));
  assert.ok(ticked[0]!.endsWith(' — left queued as it is, and not tried again while it reads the same: edit the card, or take it back and queue it again (wf inbox queue gone-a1b2 --off, then wf inbox queue gone-a1b2)'), ticked[0]);
  assert.deepEqual([fs.readFileSync(gone, 'utf8'), listRuns()], [text, []], 'the card as it was, and no run');
  const listed = (await printedBy(t, b.e, 'inbox')).find((l) => l.startsWith('gone-a1b2'))!;
  assert.match(listed, /^gone-a1b2 +Its workflow is gone  workflow: nope  repo: \S+  queued 1 of 2 — not started at \S+: gone-a1b2\.md: `workflow: nope` — no workflow folder at .* Edit the card, or take it back and queue it again, and the tick tries it again$/);

  // The next pass does not try it again: the card behind it starts.
  const next = await tick(b.e);
  const [behind] = fromCard('behind-c3d4');
  assert.deepEqual(next.queue, { card: 'behind-c3d4', run: behind!.id, removed: true });
  assert.deepEqual([(await tick(b.e)).queue, fromCard('gone-a1b2')], [undefined, []], 'nothing more: the refused card waits for a person');

  // The workflow put back, and the card queued again: the next pass tries it, and starts it.
  fs.mkdirSync(path.join(repo, 'workflows', 'nope'));
  fs.writeFileSync(path.join(repo, 'workflows', 'nope', 'implement.md'), 'implement it\n');
  await printedBy(t, b.e, 'inbox', 'queue', 'gone-a1b2', '--off');
  await printedBy(t, b.e, 'inbox', 'queue', 'gone-a1b2');
  const retried = await tick(b.e);
  const [back] = fromCard('gone-a1b2');
  assert.deepEqual(retried.queue, { card: 'gone-a1b2', run: back!.id, removed: true });
  assert.deepEqual(fs.readdirSync(path.join(ROOT, 'queue')), [], 'its refusal removed once the card no longer read as refused');
});

test("REFUSED at shipped defaults: a queued card whose `repo:` folder was deleted keeps its place, is tried, and its start refused by name on `wf tick` and in `wf inbox`, the card left as it is — the card behind it starts on the next pass, and `--off` takes it back", async (t) => {
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
    `gone-a1b2 not started: ${why} — left queued as it is, and not tried again while it reads the same: edit the card, or take it back and queue it again (wf inbox queue gone-a1b2 --off, then wf inbox queue gone-a1b2)`,
  ]);
  assert.deepEqual([fs.readFileSync(gone, 'utf8'), listRuns()], [text, []], 'the card as it was, and no run');
  const listed = (await printedBy(t, b.e, 'inbox')).find((l) => l.startsWith('gone-a1b2'))!;
  assert.match(listed, new RegExp(`^gone-a1b2 +${why.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}  queued 1 of 2 — not started at \\S+ Edit the card, or take it back and queue it again, and the tick tries it again$`));

  const next = await tick(b.e);
  const [behind] = fromCard('behind-c3d4');
  assert.deepEqual(next.queue, { card: 'behind-c3d4', run: behind!.id, removed: true });

  // Taken back though its repository is gone, and listed with why, out of the queue.
  assert.deepEqual(await printedBy(t, b.e, 'inbox', 'queue', 'gone-a1b2', '--off'), [`gone-a1b2  taken back: it no longer starts on its own — start it with wf start ${gone}`]);
  assert.equal(fs.readFileSync(gone, 'utf8'), `---\nworkflow: dev\nrepo: ${doomed}\n---\nIts repository is gone\n`);
  assert.equal(readInbox().find((l) => l.name === 'gone-a1b2')!.queued, undefined);
  await assert.rejects(main(['inbox', 'queue', 'gone-a1b2'], b.e), refusedWith(/^gone-a1b2\.md: `repo: .*` names no directory\./), 'and queued again only once it reads');
});

test("a queued card whose start fails without a refusal — its repository no git repository, say — is not written off: tried again on every pass, where it keeps its place and the card behind it waits, said once on `wf up`, and started once the failure clears", async (t) => {
  emptyStore(undefined);
  const b = board();
  const repo = aRepoWith('dev');
  // A directory with a workflow in it, and no git: the start's `git rev-parse` fails, with no exit code of the package's.
  const bare = fs.mkdtempSync(path.join(ROOT, 'bare-'));
  fs.mkdirSync(path.join(bare, 'workflows', 'dev'), { recursive: true });
  fs.writeFileSync(path.join(bare, 'workflows', 'dev', 'implement.md'), 'implement it\n');
  aCard('no-git-a1b2', { workflow: 'dev', repo: bare, queued: '2026-09-16T09:00:00.000Z' }, 'Its repository has no git');
  aCard('behind-c3d4', { workflow: 'dev', repo, queued: '2026-09-16T09:05:00.000Z' }, 'Behind it');

  const first = await tick(b.e);
  assert.ok(first.queue && 'failed' in first.queue, JSON.stringify(first.queue));
  assert.deepEqual([first.queue.card, first.queue.again], ['no-git-a1b2', false]);
  assert.match(first.queue.failed, /^Command failed: git rev-parse HEAD \/ .*not a git repository/);
  const written = JSON.parse(fs.readFileSync(path.join(ROOT, 'queue', 'no-git-a1b2.json'), 'utf8'));
  assert.deepEqual([written.refused, written.repo, written.why], [false, bare, first.queue.failed]);
  const listed = (await printedBy(t, b.e, 'inbox')).find((l) => l.startsWith('no-git-a1b2'))!;
  assert.match(listed, / {2}queued 1 of 2 — failed at \S+: Command failed: git rev-parse HEAD .* — not a refusal: the tick tries it again on every pass, where it keeps its place$/);

  // `wf up` over two passes: the failure said on the first, the card tried on both, and the card behind it not started.
  const up = board();
  let passes = 0;
  const stop = new Error('the test stops the daemon');
  const inner = up.e.tick.bind(up.e);
  (up.e as { tick: () => Promise<unknown> }).tick = async () => { if (++passes > 2) throw stop; return inner(); };
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => { printed.push(args.join(' ')); });
  try {
    await assert.rejects(main(['up', '1'], up.e), (err) => err === stop);
  } finally { log.mock.restore(); }
  // Said on the daemon's first pass though the failure is `again`: it was written down by the `tick` above, whose line this daemon never
  // printed, and a person restarting `wf up` to see why cards stopped starting is told by it. Then not again, however many passes follow.
  const named = printed.filter((l) => l.includes('no-git-a1b2'));
  assert.equal(named.length, 1, printed.join('\n'));
  assert.match(named[0]!, /^\d\d:\d\d:\d\d  no-git-a1b2 not started: Command failed: git rev-parse HEAD \/ .*not a git repository.* — not a refusal: tried again on the next pass, where it keeps its place, and said again only if it fails otherwise$/);
  const again = await tick(b.e);
  assert.deepEqual([again.queue && 'failed' in again.queue && again.queue.again, listRuns()], [true, []], 'tried again, and nothing started behind it');
  assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT, 'queue', 'no-git-a1b2.json'), 'utf8')).at, written.at, 'not written again');

  // Git put there: the next pass starts it, and the pass after removes its try, then starts the card behind it.
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: bare, stdio: 'ignore' });
  git('init', '-q');
  git('commit', '-q', '--allow-empty', '-m', 'base');
  const cleared = await tick(b.e);
  const [run] = fromCard('no-git-a1b2');
  assert.deepEqual(cleared.queue, { card: 'no-git-a1b2', run: run!.id, removed: true });
  const behind = await tick(b.e);
  assert.deepEqual([behind.queue && 'run' in behind.queue && behind.queue.card, fs.readdirSync(path.join(ROOT, 'queue'))], ['behind-c3d4', []]);
});

test("a queued card whose `repo:` is no git repository leaves the daemon's own stderr alone: git's words are read off the failure, not passed through", async (t) => {
  emptyStore(undefined);
  const b = board();
  // A directory with a workflow in it and no git, as above: the start's `git rev-parse` fails, and git writes `fatal:` on its stderr.
  const bare = fs.mkdtempSync(path.join(ROOT, 'bare-'));
  fs.mkdirSync(path.join(bare, 'workflows', 'dev'), { recursive: true });
  fs.writeFileSync(path.join(bare, 'workflows', 'dev', 'implement.md'), 'implement it\n');
  aCard('no-git-a1b2', { workflow: 'dev', repo: bare, queued: '2026-09-16T09:00:00.000Z' }, 'Its repository has no git');

  const said: string[] = [];
  const stderr = t.mock.method(process.stderr, 'write', (chunk: string | Uint8Array) => { said.push(String(chunk)); return true; });
  let pass: Awaited<ReturnType<typeof tick>>;
  try { pass = await tick(b.e); } finally { stderr.mock.restore(); }
  assert.deepEqual(said, [], "git's stderr is not the daemon's: a pass every four seconds would print it every four seconds");

  // Read all the same, and said once, with the card's name on it.
  assert.ok(pass.queue && 'failed' in pass.queue, JSON.stringify(pass.queue));
  assert.match(queueLine(pass.queue), /^no-git-a1b2 not started: Command failed: git rev-parse HEAD \/ fatal: not a git repository/);
});

test("a `wf up` at a cap of 1 names the card its queue is stuck on once a slot frees, though its first pass read no queue at all: a daemon says what it has not said, not what the store has not written", async (t) => {
  emptyStore('1');
  const b = board();
  // A card whose start fails without a refusal, tried and written down by a pass of its own — the daemon that is gone.
  const bare = fs.mkdtempSync(path.join(ROOT, 'bare-'));
  fs.mkdirSync(path.join(bare, 'workflows', 'dev'), { recursive: true });
  fs.writeFileSync(path.join(bare, 'workflows', 'dev', 'implement.md'), 'implement it\n');
  aCard('no-git-a1b2', { workflow: 'dev', repo: bare, queued: '2026-09-16T09:00:00.000Z' }, 'Its repository has no git');
  const before = await tick(b.e);
  assert.ok(before.queue && 'failed' in before.queue && !before.queue.again, JSON.stringify(before.queue));

  // A run to hold the one slot, so the daemon's first pass files it and reads no queue at all — and finishes before the second pass,
  // which tries the card and fails as the pass above did: `again`, and never said by this daemon.
  const busy = started('holds the slot', at(1));
  let passes = 0;
  const stop = new Error('the test stops the daemon');
  const inner = b.e.tick.bind(b.e);
  (b.e as { tick: () => Promise<unknown> }).tick = async () => {
    if (++passes > 2) throw stop;
    if (passes === 2) b.settle(`${busy.id}-implement`, 'succeeded', SIGNED);
    return inner();
  };
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => { printed.push(args.join(' ')); });
  try {
    await assert.rejects(main(['up', '1'], b.e), (err) => err === stop);
  } finally { log.mock.restore(); }

  const named = printed.filter((l) => l.includes('no-git-a1b2'));
  assert.equal(named.length, 1, printed.join('\n'));
  assert.match(named[0]!, /^\d\d:\d\d:\d\d  no-git-a1b2 not started: Command failed: git rev-parse HEAD \/ .*not a git repository/);
  const filed = printed.findIndex((l) => l.includes(`${busy.id}  filed implement`));
  assert.ok(filed >= 0 && filed < printed.indexOf(named[0]!), `the pass that held the slot came first: ${printed.join('\n')}`);
});

test("REFUSED at shipped defaults, on the repository it was tried on: a queued card that names no repository, refused on the daemon's — no such workflow there — is passed over by every pass there, and started by a pass in a repository that has its workflow", async (t) => {
  emptyStore(undefined);
  const b = board();
  const none = aRepoWith();
  const dev = aRepoWith('dev');
  const { card } = addToInbox({ text: 'Wherever the daemon is', workflow: 'dev' });
  await printedBy(t, b.e, 'inbox', 'queue', card.name);

  const refused = await tick(b.e, { repo: none });
  assert.ok(refused.queue && 'refused' in refused.queue, JSON.stringify(refused.queue));
  assert.equal(refused.queue.on, none);
  assert.match(queueLine(refused.queue), new RegExp(`^${card.name} not started on ${none.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}: ${card.name}\\.md: \`workflow: dev\` — no workflow folder at .*, or run wf up in the repository it is about$`));
  assert.deepEqual([(await tick(b.e, { repo: none })).queue, listRuns()], [undefined, []], 'passed over on the same repository');
  assert.match((await printedBy(t, b.e, 'inbox'))[0]!, new RegExp(` — not started at \\S+ on ${none.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}: `));

  const started = await tick(b.e, { repo: dev });
  const [run] = fromCard(card.name);
  assert.deepEqual([started.queue, run?.repo], [{ card: card.name, run: run!.id, removed: true }, dev]);
});
