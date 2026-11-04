/**
 * A Claude Code job held by the jobs' drain, in its own process: the real `bin/ae-claude-job.ts`, run as the worker runs it — a spawn
 * request's path on its argv, the brief's line on its stdin, its stdin ended once its result is printed — the real `query()`, and the
 * stand-in Claude Code the SDK spawns through `AE_CLAUDE_EXECUTABLE` (`fixtures/stand-in-claude.ts`).
 *
 * What it holds, each a rule the bin states (its header) and nothing else proves: a call in flight when the drain is put finishes, the
 * job's hold file saying `draining`; the next main-thread call waits at its hook (`heldBack`) until the drain is lifted, and then runs;
 * a call that outlives the drain's grace is cut, the job parked with the call it cut, ended through the SDK and leaving with its Claude
 * Code gone; a job held past its bound parks with no call; a sub-agent's call is answered while the job's calls are held; and a SIGTERM
 * still ends a held job. The bounds are shortened through the request (`holdMs`, `holdPollMs`) and the grace through the drain, so no
 * wait here is a length of time: each waits for the hold file or the stand-in to say what it waits for.
 *
 * A boundary test: real processes, the bin's and the Claude Code the SDK spawns for it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scratch } from './scratch.ts';
import { story } from './checkpoints.ts';
import { until, WAITED } from '../src/waits/index.ts';
import { jobDrainFile, liftJobDrain, putJobDrain, readJobHold } from '../src/harness/claude/job-hold.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(HERE, '..', 'bin', 'ae-claude-job.ts');
const STAND_IN = path.join(HERE, 'fixtures', 'stand-in-claude.ts');

/** A grace no checkpoint reaches: the call it gives finishes because the test says so, never because the grace ran out. */
const LONG_GRACE_MS = 600_000;

/** Whether the process `pid` is still there, as a signal of 0 answers. */
const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** The lines of the stand-in's `file`, each parsed; `[]` where it wrote none. */
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

/** How many of the stand-in's hooks of `event` were answered. */
const answered = (dir: string, event: string): number =>
  wrote(dir, 'answers.jsonl').filter((a) => (a as { event?: string }).event === event).length;

/**
 * The bin started on a job whose session does `plan`, in a store of its own: its hold file and the store's drain file named on its
 * request, its poll shortened, `holdMs` where given. Its stdin is ended at its first result line, as the worker ends it (`closesOn`).
 * Killed at the test's end, with its Claude Code, where either outlived it.
 */
const job = (t: { after: (f: () => void) => void }, plan: object, io: { holdMs?: number } = {}) => {
  const root = scratch('ae-job-hold-');
  const dir = path.join(root, 'work');
  fs.mkdirSync(dir, { recursive: true });
  const holdFile = path.join(root, 'job.hold');
  const at = path.join(root, 'spawn.request.json');
  fs.writeFileSync(
    at,
    JSON.stringify({
      request: {
        name: 'ae/t/1',
        brief: 'b',
        cwd: dir,
        config: { env: { STANDIN_DIR: dir, STANDIN_PLAN: JSON.stringify(plan), STANDIN_NO_BRIDGE: '1' } },
      },
      io: { holdFile, drainFile: jobDrainFile(root), holdPollMs: 20, ...io },
    }),
  );
  const child = spawn(process.execPath, [BIN, at], {
    env: { ...process.env, AE_CLAUDE_EXECUTABLE: STAND_IN },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let out = '';
  let err = '';
  child.stdout.on('data', (d: Buffer) => {
    out += d.toString();
    if (out.split('\n').some((l) => l.startsWith('{"type":"result"'))) child.stdin.end();
  });
  child.stderr.on('data', (d: Buffer) => (err += d.toString()));
  child.stdin.write(`${JSON.stringify({ type: 'user', message: { role: 'user', content: 'b' } })}\n`);
  const done = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) =>
    child.on('close', (code, signal) => resolve({ code, signal })),
  );
  const claudePid = (): number | undefined => {
    try {
      return Number(fs.readFileSync(path.join(dir, 'pid'), 'utf8'));
    } catch {
      return undefined;
    }
  };
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    const claude = claudePid();
    if (claude !== undefined && alive(claude)) process.kill(claude, 'SIGKILL');
  });
  return {
    root,
    dir,
    child,
    done,
    claudePid,
    hold: () => readJobHold(holdFile),
    out: () => out,
    err: () => err,
    release: (file: string) => fs.writeFileSync(path.join(dir, file), ''),
  };
};

test(
  'a Claude Code job under the jobs’ drain: finishes its call, held at the next, cut past the grace, parked past its bound',
  WAITED,
  async (t) => {
    const s = story(t);
    const a = job(t, { call: 'Bash', next: 'Edit' });

    await s.test('drained with a call in flight: the hold file says draining, and the call finishes', async (c) => {
      await until(
        c,
        () => a.hold()?.calling?.tool === 'Bash',
        () => `the call in flight on the hold file: ${JSON.stringify(a.hold())}`,
        { everyMs: 20 },
      );
      putJobDrain(a.root, { graceMs: LONG_GRACE_MS });
      await until(
        c,
        () => a.hold()?.draining !== undefined,
        () => `draining on the hold file: ${JSON.stringify(a.hold())}`,
        { everyMs: 20 },
      );
      assert.equal(a.hold()?.calling?.tool, 'Bash', 'the call in flight runs on under the drain');
      a.release('release');
      await until(
        c,
        () => answered(a.dir, 'PostToolUse') === 1 && a.hold()?.calling === undefined,
        () => `the call over: ${JSON.stringify(a.hold())}`,
        {
          everyMs: 20,
        },
      );
      assert.ok(a.hold()?.draining, 'still draining');
      assert.equal(a.hold()?.parked, undefined, 'and not parked: its call finished within the grace');
    });

    await s.test('the next call waits at its hook, the hold file saying it is held back', async (c) => {
      a.release('next');
      await until(
        c,
        () => a.hold()?.heldBack !== undefined,
        () => `heldBack on the hold file: ${JSON.stringify(a.hold())}`,
        { everyMs: 20 },
      );
      assert.equal(answered(a.dir, 'PreToolUse'), 1, 'the held call’s hook is not answered: only the first call’s was');
      assert.equal(a.hold()?.calling, undefined, 'and the held call is not in flight');
    });

    await s.test('lifted: the held call runs, and draining and heldBack clear', async (c) => {
      liftJobDrain(a.root);
      await until(
        c,
        () => a.hold()?.calling?.tool === 'Edit',
        () => `the held call in flight: ${JSON.stringify(a.hold())}`,
        { everyMs: 20 },
      );
      assert.equal(answered(a.dir, 'PreToolUse'), 2, 'its hook answered');
      assert.equal(a.hold()?.draining, undefined, 'draining cleared');
      assert.equal(a.hold()?.heldBack, undefined, 'heldBack cleared');
      a.release('release-next');
      const { code } = await a.done;
      assert.equal(code, 0, `the job ran to its end: ${a.err()}`);
      assert.equal(a.hold()?.parked, undefined, 'never parked');
    });

    await s.test('grace 0 with a call in flight: the job parks with the call it cut, and leaves with its Claude Code gone', async (c) => {
      const b = job(t, { call: 'Bash', cost: 0.25 });
      await until(
        c,
        () => b.hold()?.calling?.tool === 'Bash',
        () => `the call in flight: ${JSON.stringify(b.hold())}`,
        { everyMs: 20 },
      );
      putJobDrain(b.root, { graceMs: 0 });
      const { code } = await b.done;
      assert.notEqual(code, null, 'it left by itself, killed by nobody');
      assert.equal(b.hold()?.parked?.calling?.tool, 'Bash', `parked with the call it cut: ${JSON.stringify(b.hold())}`);
      const claude = b.claudePid();
      assert.ok(claude !== undefined, 'its Claude Code had started');
      await until(c, () => !alive(claude), 'its Claude Code gone with it', { everyMs: 20 });
      const result = b
        .out()
        .split('\n')
        .filter((l) => l.startsWith('{"type":"result"'))
        .map((l) => JSON.parse(l) as { total_cost_usd?: number })
        .at(-1);
      assert.equal(result?.total_cost_usd, 0.25, 'the cut turn’s result was printed, with its cost');
      assert.equal(wrote(b.dir, 'cost-state.jsonl').length, 1, 'and Claude Code ended on its own, saving its total, never killed');
    });

    await s.test('held past a shortened bound between calls: the job parks with no call', async (c) => {
      const d = job(t, { call: 'Bash', next: 'Edit' }, { holdMs: 1_000 });
      await until(
        c,
        () => d.hold()?.calling?.tool === 'Bash',
        () => `the call in flight: ${JSON.stringify(d.hold())}`,
        { everyMs: 20 },
      );
      d.release('release');
      await until(c, () => answered(d.dir, 'PostToolUse') === 1 && d.hold()?.calling === undefined, 'the first call over', { everyMs: 20 });
      putJobDrain(d.root, { graceMs: LONG_GRACE_MS });
      d.release('next');
      const { code } = await d.done;
      assert.notEqual(code, null, 'it left by itself');
      const parked = d.hold()?.parked;
      assert.ok(parked, `parked: ${JSON.stringify(d.hold())}`);
      assert.equal(parked.calling, undefined, 'with no call: none was in flight');
      assert.equal(answered(d.dir, 'PreToolUse'), 1, 'and the held call never ran');
    });

    await s.test('a sub-agent’s call is answered while the job’s calls are held', async (c) => {
      const e = job(t, { nested: 'Read', fromSubAgent: true, hold: true });
      await until(c, () => wrote(e.dir, 'said.jsonl').length === 1, 'the session took its brief', { everyMs: 20 });
      putJobDrain(e.root, { graceMs: LONG_GRACE_MS });
      await until(
        c,
        () => e.hold()?.draining !== undefined,
        () => `draining: ${JSON.stringify(e.hold())}`,
        { everyMs: 20 },
      );
      e.release('nest');
      await until(
        c,
        () => answered(e.dir, 'PreToolUse') === 1,
        () => `the sub-agent’s call answered: ${JSON.stringify(e.hold())}`,
        { everyMs: 20 },
      );
      liftJobDrain(e.root);
      e.release('end');
      const { code } = await e.done;
      assert.equal(code, 0, e.err());
    });

    await s.test('a SIGTERM still ends a held job, and its Claude Code with it', async (c) => {
      const f = job(t, { call: 'Bash' });
      putJobDrain(f.root, { graceMs: LONG_GRACE_MS });
      await until(
        c,
        () => f.hold()?.heldBack !== undefined,
        () => `held back: ${JSON.stringify(f.hold())}`,
        { everyMs: 20 },
      );
      const claude = f.claudePid();
      assert.ok(claude !== undefined && alive(claude), 'its Claude Code runs');
      f.child.kill('SIGTERM');
      const { code, signal } = await f.done;
      assert.ok(code !== 0, `the stop is no success: ${code} ${signal}`);
      await until(c, () => !alive(claude), 'its Claude Code gone with it', { everyMs: 20 });
    });
  },
);
