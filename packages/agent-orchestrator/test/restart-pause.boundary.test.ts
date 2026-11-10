/**
 * A restart of the daemon, a person's story on the stage (`story.ts`): the pause a take-over puts names the process that runs it
 * (`heldBy`), so a `nemia service restart` killed while it waits — by `timeout`, ^C or SIGKILL — leaves the store paused no longer than
 * the daemon's next pass, which reads the pause file and the process table and lifts it (`liftLapsedPause`); a pause whose process still
 * runs stands. And a restart with only a landing's check running restarts at once: the check runs on its worker through the restart, is
 * not waited for, and the new daemon's pass reads its result.
 *
 * The take-over's process is a child spawned with the test's `WF_ROOT`, putting the pause through the live host's own `pause`, killed
 * with SIGKILL and waited to its exit: no pid is guessed. A real process's end is the first story's whole subject, so the file is a
 * boundary test. The tick is the store's pass (`tickRun`) on the stage's engine, given a pass of
 * its own that does nothing and no tally, as `pause.test.ts` gives it. The take-over runs on a host whose machine is the test's — a
 * lease it steps, a signal and a start it logs — and whose pause, resume and calls are the live host's, over the stage's engine. A line
 * the take-over says of waiting on the landing throws, so a take-over that waits on it fails at once rather than hanging the story.
 */
import { rootNow } from './config-given.ts';
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Effect } from 'effect';
import type { DaemonStanding } from '../src/daemon/daemon.ts';
import type { FeedLine } from '../src/feed/feed.ts';
import { scratch } from 'test-kit/scratch';
import { staged, story, type Board } from './story.ts';
import { nodeChild } from './child.ts';

const ROOT = scratch('wf-restart-pause-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
process.env.WF_MAX_RUNS = '100';
delete process.env.WF_MAX_CONCURRENT;
const { approveRun, startRun, tickRun, runWith, readFeed } = await import('../src/runner.ts');
const { runRecord } = await import('../src/record/record.store.ts');
const { readPause, readPauseFile } = await import('../src/pause/pause.store.ts');
const { liveHost } = await import('../src/service/service.verb.ts');
const { takeOver } = await import('../src/service/takeover.verb.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const { main } = await import('../src/cli/main.ts');
const stage = staged({ runWith, main, engineOf });

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };
/** What the engine's own pass answers here: nothing admitted, nothing started, no view — every task is read off the stand-in. */
const QUIET = { tasks: 0, actions: [], running: {}, views: [] };
const SERVICE_VERB = fileURLToPath(new URL('../src/service/service.verb.ts', import.meta.url));
const BY = 'nemia service restart';
const OLD = 4242;
const NEW = 5151;

/** The stage's engine with a pass of its own that does nothing, and no tally: what a whole-store pass asks of the engine first. */
const ticking = (): Board => {
  const b = stage.board();
  Object.assign(b.e, { tick: () => Effect.succeed(QUIET), tallied: undefined });
  return b;
};

/** The store's lines of the feed whose reason is `reason`. */
const storeLines = (reason: string): FeedLine[] => readFeed(0).lines.filter((l) => 'store' in l && l.reason === reason);

/**
 * A take-over's process: a child of this test, on its `WF_ROOT`, that puts the store's pause through the live host's `pause` and then
 * waits to be killed. Answers once the pause is on disk; the test kills it, and `t.after` kills it where a checkpoint failed first.
 */
const takeOverProcess = async (t: TestContext) => {
  const child = nodeChild(
    `const m = await import(${JSON.stringify(SERVICE_VERB)}); m.liveHost(${JSON.stringify(ROOT)}).pause({ by: ${JSON.stringify(BY)}, why: 'restarting the daemon at pid ${OLD}' }); process.stdout.write('paused\\n'); setInterval(() => {}, 60_000);`,
    { ...process.env, WF_ROOT: ROOT },
  );
  t.after(() => void child.child.kill('SIGKILL'));
  await child.until(() => child.out().includes('paused'), 'the take-over process put its pause');
  return child;
};

test("a restart killed while it waits leaves the store paused no longer than the daemon's next pass", async (t) => {
  const s = story(t);
  const b = ticking();
  const pass = () => stage.runWith(b.e, tickRun());
  let child: Awaited<ReturnType<typeof takeOverProcess>> | undefined;

  await s.test('the take-over pauses the store naming its own process, and a pass while it runs leaves the pause standing', async () => {
    child = await takeOverProcess(t);
    assert.equal(readPauseFile(rootNow())?.heldBy?.pid, child.child.pid, 'the pause names the process that put it');
    await pass();
    assert.equal(readPause(rootNow())?.by, BY, 'a pause whose process runs stands');
    assert.equal(storeLines('StorePaused').length, 1, 'the feed says the store paused');
  });

  await s.test('the take-over killed, the next pass lifts its pause and the feed says the store resumed', async () => {
    assert.ok(child);
    child.child.kill('SIGKILL');
    assert.equal((await child.closed).signal, 'SIGKILL');
    assert.ok(readPause(rootNow()) !== null, 'the pause outlives the killed command until a pass reads it');
    await pass();
    assert.equal(readPause(rootNow()), null, 'the pass lifted the pause of a process gone');
    assert.equal(storeLines('StoreResumed').length, 1, 'the feed says the store resumed');
  });
});

test("a restart with only a landing's check running restarts at once, and the check's result is read after", async (t) => {
  const s = story(t);
  const b = ticking();
  const pass = () => stage.runWith(b.e, tickRun());
  const repo = fs.mkdtempSync(path.join(ROOT, 'lands-'));
  stage.place().world.repository(repo, {});
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'work.md'), '---\nplace: git\n---\nwork it\n');
  fs.writeFileSync(path.join(dir, 'ship.md'), '---\nplace: git\nafter: work\ngate: true\nworkspace: base\ncheck: "true"\n---\nship it\n');
  let id = '';
  const shipOf = () => runRecord(id).steps.ship;

  await s.test("a run's ending signed off, its landing check filed and running", async () => {
    id = (await stage.runPlaced(startRun({ brief: 'restart', repo, workflowDir: dir, isolate: true }))).id;
    await pass();
    const work = runRecord(id).steps.work;
    fs.writeFileSync(path.join(work.workspace!, 'work.txt'), 'work\n');
    b.settle(work.taskId!, 'succeeded', SIGNED);
    await pass();
    await stage.runWith(b.e, approveRun(id, 'ship'));
    await pass();
    stage.place().world.stage(repo, work.branch!);
    b.settle(shipOf().taskId!, 'succeeded', SIGNED);
    await pass();
    const check = shipOf().check?.taskId;
    assert.ok(check, 'the landing check is filed');
    b.settle(check, 'working');
    assert.ok(!shipOf().landed, 'the landing waits on its check');
  });

  await s.test('the restart pauses, signals the daemon at once, starts the service and resumes after its first pass', async () => {
    const events: string[] = [];
    let lease: DaemonStanding = leaseOf(OLD);
    const later: DaemonStanding[] = [];
    let unitPid: number | null = OLD;
    const live = liveHost(rootNow());
    const host = {
      ...live,
      lease: () => {
        const read = lease;
        lease = later.shift() ?? lease;
        return read;
      },
      signal: (pid: number) => {
        events.push(`signal ${pid}`);
        lease = leaseOf(pid, 'stopped');
        unitPid = null;
      },
      pause: (said: { why?: string; by?: string }) => (events.push('pause'), live.pause(said)),
      resume: () => (events.push('resume'), live.resume()),
      say: (line: string) => {
        if (line.includes(' to land')) throw new Error(`the restart waits on the landing: ${line}`);
        events.push(`say ${line}`);
      },
      pollMs: 1,
    };
    const service = {
      start: () => {
        events.push('start');
        unitPid = NEW;
        lease = leaseOf(NEW);
        later.push(leaseOf(NEW), leaseOf(NEW, 'ticking', true));
      },
      logs: 'journalctl --user -u nemia',
      stateNow: () => ({ active: unitPid === null ? 'inactive' : 'active', enabled: 'enabled', pid: unitPid }),
      startLine: 'systemctl --user start nemia.service',
    };
    const taken = await stage.runWith(b.e, takeOver(OLD, host, service, BY));
    assert.equal(taken.pid, NEW);
    assert.deepEqual(
      events.filter((e) => !e.startsWith('say ')),
      ['pause', `signal ${OLD}`, 'start', 'resume'],
      'nothing is waited for between the pause and the signal',
    );
    assert.equal(readPause(rootNow()), null);
  });

  await s.test("the check ends on its worker, and the new daemon's pass records the landing", async () => {
    b.settle(shipOf().check!.taskId, 'succeeded', undefined, 0);
    await pass();
    assert.ok(shipOf().landed, 'the landing is recorded off the check it did not wait for');
  });
});

/** A lease of the daemon `pid`, standing as `kind` and confirmed, with a pass completed when `passed`. */
function leaseOf(pid: number, kind: 'ticking' | 'stopped' = 'ticking', passed = false): DaemonStanding {
  return {
    kind,
    file: {
      pid,
      by: 'api',
      url: 'http://127.0.0.1:8790',
      startedAt: new Date().toISOString(),
      cwd: '/',
      every: 4000,
      passedAt: passed ? new Date().toISOString() : null,
    },
    last: Date.now(),
    quiet: 0,
    identity: 'same',
  };
}
