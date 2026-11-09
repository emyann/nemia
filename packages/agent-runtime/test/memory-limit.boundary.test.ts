/**
 * A task's memory limit on a real cgroup: a command task limited to 256Mi runs in a scope of systemd's user manager, its worker beside
 * it, and a child it starts that allocates far past the limit is ended by the kernel inside that scope alone. The worker outlives it
 * there, reads the scope's files at the harness's exit, and the attempt says so (`memory`); a neighbour with no limit, on the same
 * engine, settles `succeeded` untouched.
 *
 * Skipped, with the probe's words, on a host that cannot make such a scope (`scopeRefusal`): no systemd user manager, cgroup v1, or a
 * systemd older than 253.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import { Engine as EngineService } from '../src/index.ts';
import { commandHarness } from '../src/harness/command/command.ts';
import { scopeRefusal } from '../src/harness/cgroup.ts';
import { scratch } from 'test-kit/scratch';
import { builtEngine } from './engine.ts';
import { story } from 'test-kit/checkpoints';
import { until, WAITED } from '../src/waits/index.ts';

/**
 * A child that allocates 16 MB at a time, for ever, run by a harness that exits with how its child ended. The limit leaves room for
 * the worker's, the harness's and the child's own Node (some 40 MB each), so the child that runs away is the largest process in the
 * scope by far when the kernel picks one: at 64Mi the three start near the limit, and a CI runner's attempt ended with another
 * exit than its child's kill.
 */
const RUNAWAY = [
  process.execPath,
  '-e',
  `const r = require('node:child_process').spawnSync(process.execPath, ['-e', 'const a = []; for (;;) a.push(Buffer.alloc(16 << 20, 1));'], { stdio: 'inherit' }); process.exit(r.signal === 'SIGKILL' ? 137 : (r.status ?? 1));`,
];

const refused = scopeRefusal();

test(
  'a runaway child past a task’s memory limit is killed in its scope alone: the attempt carries the limit, the kill and the peak, and a neighbour runs on',
  { ...WAITED, ...(refused ? { skip: refused } : {}) },
  async (t) => {
    const s = story(t);
    const root = scratch('ae-memory-boundary-');
    const cwd = scratch('ae-memory-boundary-cwd-');
    const engine = builtEngine(EngineService.layer({ root, harnesses: { command: commandHarness } }));
    const file = (command: string[], memory?: string) =>
      Effect.runPromise(
        engine.file({
          brief: 'run it',
          cwd,
          harness: 'command',
          config: { command },
          ...(memory ? { resources: { limits: { memory } } } : {}),
        }),
      );
    const ids = { runaway: await file(RUNAWAY, '256Mi'), neighbour: await file(['sh', '-c', 'sleep 1']) };
    const state = async (id: string) => (await Effect.runPromise(engine.view(id))).state;

    await s.test('both tasks settle', async (sub) => {
      await until(
        sub,
        async () => {
          await Effect.runPromise(engine.tick());
          return (await state(ids.runaway)).settled !== null && (await state(ids.neighbour)).settled !== null;
        },
        'both settled',
        { everyMs: 100 },
      );
    });

    await s.test('the runaway task ended by its worker, its attempt carrying the limit, an OOM kill and a peak', async () => {
      const [a] = (await state(ids.runaway)).attempts;
      assert.equal(a?.reason, 'harness', `ended by the worker, not lost: ${a?.reason} ${a?.error ?? ''}`);
      assert.equal(a?.exitCode, 137, `the harness said its child was killed, not itself (-1): ${a?.exitCode} ${JSON.stringify(a?.memory)}`);
      assert.equal(a?.memory?.limitBytes, 268_435_456);
      assert.ok((a?.memory?.oomKills ?? 0) >= 1, `the kernel killed in the scope: ${JSON.stringify(a?.memory)}`);
      assert.equal(typeof a?.memory?.peakBytes, 'number');
    });

    await s.test('the neighbour with no limit settles succeeded, and carries no memory', async () => {
      const neighbour = await state(ids.neighbour);
      assert.equal(neighbour.settled, 'succeeded');
      assert.equal(neighbour.attempts[0]?.memory, undefined);
    });
  },
);
