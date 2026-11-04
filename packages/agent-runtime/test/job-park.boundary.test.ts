/**
 * A Claude Code job stopped by the sessions' drain and continued, through the engine: `drainSessions` puts the drain, the job's own process
 * parks itself past its bound, the engine holds the parked attempt while the drain stands (`PARK_HELD`), and once it is lifted starts
 * attempt 2 of the same task after its back-off, resuming the same session, told the call that did not finish and handed what is left
 * of the task's cap. A parked attempt that spent the cap whole settles failed, `limit: 'budget'`. A worker killed — with its job's
 * process and its Claude Code, as a machine gone takes them — under a drain is read parked and continued the same way; one killed with
 * no drain settles failed, for the layer above to judge.
 *
 * The real engine, the real worker, the real `bin/ae-claude-job.ts`, the real `query()` and the stand-in Claude Code
 * (`fixtures/stand-in-claude.ts`). The job's bound and poll are shortened through the runner (`holdMs`, `holdPollMs`); the back-off and
 * a dead worker's lease, both measured on the monotonic clock, are passed by stepping this process's (`stepMono`) for the one pass that
 * reads past them. No wait here is a length of time.
 *
 * A boundary test: a real store, real detached workers, the SDK's processes and real child CLIs.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { scratch } from './scratch.ts';
import { story } from './checkpoints.ts';
import { stepMono } from './clock.ts';
import { sdkArgValue } from './sdk-argv.ts';
import { until, WAITED, type Waiter } from '../src/waits/index.ts';

/** Where Claude Code keeps its transcripts, for the stand-in and the runtime's reader alike: set before `src` is imported. */
const CONFIG = scratch('ae-park-config-');
process.env.CLAUDE_CONFIG_DIR = CONFIG;

const { Engine } = await import('../src/index.ts');
const { builtEngine } = await import('./engine.ts');
const { STAND_IN } = await import('./attached-held.ts');
const { claudeCodeOps } = await import('../src/harness/claude/code.ts');
const { readJobHold } = await import('../src/harness/claude/job-hold.ts');
const { STALE_MS } = await import('../src/harness/detached/detached.ts');
const { cutWords, observe, RESTART_BACKOFF } = await import('../src/core/domain.ts');

type Built = ReturnType<typeof builtEngine>;

/** A step of the monotonic clock past a first back-off, for the pass that is to read past it. */
const PAST_BACKOFF_MS = RESTART_BACKOFF.initialMs + 10_000;

/** A step of the monotonic clock past a worker's lease. */
const PAST_LEASE_MS = STALE_MS + 10_000;

/** A grace no checkpoint reaches: a job parks past its bound, or is killed, never because a grace ran out. */
const LONG_GRACE_MS = 600_000;

/** Whether the process `pid` is there. */
const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** The lines of the stand-in's `file` in `dir`, each parsed; `[]` where it wrote none. */
const wrote = (dir: string, file: string): unknown[] => {
  try {
    return fs
      .readFileSync(path.join(dir, file), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as unknown);
  } catch {
    return [];
  }
};

/** A file beside the run of attempt `n` of task `id` in the store at `root`, as the runner names it (`besideRun`). */
const besideRunOf = (root: string, id: string, n: number, end: string) =>
  path.join(root, 'runs', 'claude', `${`ae/${id}/${n}`.replace(/[^a-zA-Z0-9]+/g, '_')}.${end}`);

/**
 * An engine over a store of its own, its Claude Code jobs on the stand-in, polling the drain every 20 ms and held at most `holdMs`;
 * each task it files has a folder of its own, the stand-in's, and every process it starts is ended at the test's end.
 */
const stand = (t: TestContext, holdMs?: number) => {
  const root = scratch('ae-park-');
  const ops = claudeCodeOps({ root, claudeExecutable: STAND_IN, holdPollMs: 20, ...(holdMs ? { holdMs } : {}) });
  const engine: Built = builtEngine(Engine.layer({ root, harnesses: { claude: ops } }));
  const dirs = new Map<string, string>();
  const file = async (plan: object, budgetUsd: number) => {
    const dir = scratch('ae-park-work-');
    const config = { budgetUsd, env: { STANDIN_DIR: dir, STANDIN_PLAN: JSON.stringify(plan), STANDIN_NO_BRIDGE: '1' } };
    const id = await Effect.runPromise(engine.file({ brief: 'work', cwd: dir, harness: 'claude', config }));
    dirs.set(id, dir);
    t.after(() => {
      for (const f of ['release', 'release-next', 'next', 'end']) fs.writeFileSync(path.join(dir, f), '');
      return Effect.runPromise(Effect.ignore(engine.stop(id)));
    });
    return { id, dir };
  };
  return { root, engine, file, dirs };
};

/** The view of `id` once `ready` says so of it, each look a pass first where `ticking`. */
const viewWhen = (
  c: Waiter,
  engine: Built,
  id: string,
  ready: (v: Awaited<ReturnType<typeof viewNow>>) => boolean,
  what: string,
  ticking = true,
) =>
  until(
    c,
    async () => {
      if (ticking) await Effect.runPromise(engine.tick());
      const v = await viewNow(engine, id);
      return ready(v) ? v : undefined;
    },
    what,
    { everyMs: 50 },
  );

const viewNow = (engine: Built, id: string) => Effect.runPromise(engine.view(id));

/** `passes` passes of `engine`, with this process's monotonic clock `ms` on for each, and taken back after. */
const passesPast = async (c: TestContext, engine: Built, ms: number, passes = 1) => {
  const undo = stepMono(c, ms);
  try {
    for (let i = 0; i < passes; i++) await Effect.runPromise(engine.tick());
  } finally {
    undo();
  }
};

/** What decide reads of `id`'s record, seen nowhere, the sessions' drain standing: the event its pass moves it by. */
const heldEvent = async (engine: Built, id: string) =>
  observe((await viewNow(engine, id)).state, new Map(), { at: new Date(), graceMs: 30_000, unread: new Set(), drained: true }).type;

/**
 * Kills the worker of attempt `n` of `id` with SIGKILL, and with it the job's own process (found by the request file on its argv) and
 * the Claude Code it ran, as a machine gone takes them all: nothing is left to write an end.
 */
const crash = async (c: Waiter, root: string, dir: string, id: string, n: number) => {
  const worker = (JSON.parse(fs.readFileSync(besideRunOf(root, id, n, 'json'), 'utf8')) as { pid: number }).pid;
  const request = besideRunOf(root, id, n, 'request.json');
  const bin = fs
    .readdirSync('/proc')
    .filter((p) => /^\d+$/.test(p))
    .find((p) => {
      try {
        return fs.readFileSync(`/proc/${p}/cmdline`, 'utf8').split('\0').includes(request);
      } catch {
        return false;
      }
    });
  const claude = Number(fs.readFileSync(path.join(dir, 'pid'), 'utf8'));
  const pids = [worker, ...(bin ? [Number(bin)] : []), claude];
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {}
  }
  await until(c, () => pids.every((p) => !alive(p)), 'the worker, the job’s process and its Claude Code gone', { everyMs: 20 });
};

test('a Claude Code job stopped by the jobs’ drain parks, is held while it stands, and is continued within its cap', WAITED, async (t) => {
  const s = story(t);
  const a = stand(t, 1_000);
  const first = await a.file({ id: '5e551011-0000-4000-8000-0000000000e1', call: 'Bash', cost: 0.25 }, 1);

  await s.test('drained, a job in a call parks past its shortened bound, with the call it was in', async (c) => {
    await viewWhen(c, a.engine, first.id, (v) => v.calling?.tool === 'Bash', 'the call in flight, on the view');
    await Effect.runPromise(a.engine.drainSessions({ graceMs: LONG_GRACE_MS }));
    const v = await viewWhen(c, a.engine, first.id, (v) => v.state.attempts[0]?.ended != null, 'attempt 1 ended');
    const one = v.state.attempts[0];
    assert.equal(one?.ended, 'failed', `it ended itself: ${JSON.stringify(one)}`);
    assert.equal(one?.parked?.calling?.tool, 'Bash', 'parked, with the call it cut');
    assert.equal(one?.usage?.costUsd, 0.25, 'and what it spent');
    assert.equal(v.state.settled, null, 'the task is not settled');
  });

  await s.test('held while the drain stands, past its back-off: PARK_HELD, and no attempt 2', async (c) => {
    await passesPast(c, a.engine, PAST_BACKOFF_MS, 3);
    const v = await viewNow(a.engine, first.id);
    assert.deepEqual([v.state.attempts.length, v.state.settled], [1, null], 'nothing started, nothing settled');
    assert.equal(await heldEvent(a.engine, first.id), 'PARK_HELD');
  });

  await s.test('lifted: attempt 2 after the back-off resumes the session, told the call, handed the cap less what 1 spent', async (c) => {
    await Effect.runPromise(a.engine.drainSessions(null));
    await Effect.runPromise(a.engine.tick());
    assert.equal((await viewNow(a.engine, first.id)).state.attempts.length, 1, 'not before its back-off');
    await passesPast(c, a.engine, PAST_BACKOFF_MS);
    const two = (await viewNow(a.engine, first.id)).state.attempts[1];
    assert.equal(two?.n, 2, 'attempt 2 of the same task');
    assert.equal(two?.nudge, cutWords('Bash'), 'told the call that did not finish');
    await until(c, () => wrote(first.dir, 'said.jsonl').length === 2, 'the words reached the resumed session', { everyMs: 50 });
    assert.equal(wrote(first.dir, 'said.jsonl')[1], cutWords('Bash'));
    const argv = wrote(first.dir, 'argv.jsonl').at(-1) as string[];
    assert.equal(sdkArgValue(argv, '--resume'), '5e551011-0000-4000-8000-0000000000e1', 'the same Claude Code session');
    assert.equal(Number(sdkArgValue(argv, '--max-budget-usd')), 0.75, 'its cap less what attempt 1 spent');
    fs.writeFileSync(path.join(first.dir, 'release'), '');
    const done = await viewWhen(c, a.engine, first.id, (v) => v.state.settled !== null, 'the task settled');
    assert.deepEqual(
      done.state.attempts.map((x) => x.ended),
      ['failed', 'succeeded'],
    );
    assert.equal(done.state.settled, 'succeeded');
  });

  await s.test('a parked attempt that spent its whole cap settles failed, `limit: budget`, and starts no attempt 2', async (c) => {
    const spent = await a.file({ id: '5e551011-0000-4000-8000-0000000000e2', call: 'Bash', next: 'Edit', cost: 0.25 }, 0.25);
    await viewWhen(c, a.engine, spent.id, (v) => v.calling?.tool === 'Bash', 'the first call in flight');
    fs.writeFileSync(path.join(spent.dir, 'release'), '');
    await viewWhen(c, a.engine, spent.id, (v) => v.calling === undefined, 'the first call over', false);
    await Effect.runPromise(a.engine.drainSessions({ graceMs: LONG_GRACE_MS }));
    fs.writeFileSync(path.join(spent.dir, 'next'), '');
    const held = await viewWhen(c, a.engine, spent.id, (v) => v.heldBack !== undefined, 'the next call held back, on the view', false);
    assert.equal(typeof held.heldBack?.since, 'string');
    const v = await viewWhen(c, a.engine, spent.id, (v) => v.state.settled !== null, 'the task settled');
    const one = v.state.attempts[0];
    assert.deepEqual([one?.ended, one?.limit, one?.parked], ['failed', 'budget', undefined], JSON.stringify(one));
    assert.equal(v.state.settled, 'failed');
    await Effect.runPromise(a.engine.drainSessions(null));
    await passesPast(c, a.engine, PAST_BACKOFF_MS, 2);
    assert.equal((await viewNow(a.engine, spent.id)).state.attempts.length, 1, 'no attempt 2');
  });

  const b = stand(t);
  await s.test('a worker killed under a drain: read parked, held while the drain stands', async (c) => {
    const lost = await b.file({ id: '5e551011-0000-4000-8000-0000000000e3', call: 'Bash', cost: 0.25 }, 1);
    await viewWhen(c, b.engine, lost.id, (v) => v.calling?.tool === 'Bash', 'the call in flight');
    await Effect.runPromise(b.engine.drainSessions({ graceMs: LONG_GRACE_MS }));
    await until(c, () => readJobHold(besideRunOf(b.root, lost.id, 1, 'hold'))?.draining !== undefined, 'draining, on its hold file', {
      everyMs: 20,
    });
    await crash(c, b.root, lost.dir, lost.id, 1);
    await passesPast(c, b.engine, PAST_LEASE_MS);
    const one = (await viewNow(b.engine, lost.id)).state.attempts[0];
    assert.deepEqual([one?.ended, one?.parked?.calling?.tool], ['failed', 'Bash'], JSON.stringify(one));
    await passesPast(c, b.engine, PAST_LEASE_MS + PAST_BACKOFF_MS, 2);
    const v = await viewNow(b.engine, lost.id);
    assert.deepEqual([v.state.attempts.length, v.state.settled], [1, null], 'nothing started, nothing settled');
    assert.equal(await heldEvent(b.engine, lost.id), 'PARK_HELD');

    await Effect.runPromise(b.engine.drainSessions(null));
    await passesPast(c, b.engine, PAST_LEASE_MS + PAST_BACKOFF_MS);
    const two = (await viewNow(b.engine, lost.id)).state.attempts[1];
    assert.deepEqual(
      [two?.n, two?.nudge, two?.resumeFrom],
      [2, cutWords('Bash'), '5e551011-0000-4000-8000-0000000000e3'],
      'lifted, attempt 2 after the back-off, resumed and told the call that did not finish',
    );
    await until(c, () => wrote(lost.dir, 'said.jsonl').length === 2, 'the words reached the resumed session', { everyMs: 50 });
    fs.writeFileSync(path.join(lost.dir, 'release'), '');
    await viewWhen(c, b.engine, lost.id, (v) => v.state.settled === 'succeeded', 'attempt 2 ran to its end');
  });

  await s.test('a worker killed with no drain settles the task failed, and starts no attempt 2', async (c) => {
    const lost = await b.file({ id: '5e551011-0000-4000-8000-0000000000e4', call: 'Bash' }, 1);
    await viewWhen(c, b.engine, lost.id, (v) => v.calling?.tool === 'Bash', 'the call in flight');
    await crash(c, b.root, lost.dir, lost.id, 1);
    await passesPast(c, b.engine, PAST_LEASE_MS + PAST_BACKOFF_MS, 3);
    const v = await viewNow(b.engine, lost.id);
    assert.deepEqual([v.state.attempts.length, v.state.attempts[0]?.parked, v.state.settled], [1, undefined, 'failed']);
  });
});
