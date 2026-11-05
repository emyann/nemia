/**
 * A held long-lived session under a memory limit (`resources.limits.memory`), on the stand-in Claude Code: refused its start where this
 * host makes no scope, its neighbour with no limit started all the same; ended, not taken up again and again, when a holder that makes no
 * scope finds it parked; and, where the host makes one, run in a scope of its own whose memory its run file and its sighting say.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Effect } from 'effect';
import { RunnerError } from '../src/harness/error.ts';
import { filesOf, writeRun } from '../src/harness/claude/attached-file.ts';
import { scopeRefusal } from '../src/harness/cgroup.ts';
import { story } from './checkpoints.ts';
import { until, WAITED } from '../src/waits/index.ts';
import { holder, kept, lines, NAME, run } from './attached-held.ts';
import fs from 'node:fs';
import path from 'node:path';

/** A scope program that makes no scope: `false` exits 1, as `systemd-run` does on a host with no user manager. */
const NO_SCOPE = { scopeProgram: 'false' };
const LIMITED = { limits: { memory: '256Mi' } };

test('a held session under a memory limit, on a host that makes no scope', WAITED, async (t) => {
  const s = story(t);

  await s.test('REFUSED: its start is refused, as a refusal, and no run file is written', async () => {
    const { root, request } = kept({});
    const h = await holder(root, undefined, undefined, NO_SCOPE);
    t.after(h.close);
    const exit = await Effect.runPromiseExit(h.attached.ops.spawn({ ...request, resources: LIMITED }));
    assert.equal(exit._tag, 'Failure', 'the limited spawn fails');
    const err = exit._tag === 'Failure' ? exit.cause.reasons.map((r) => ('error' in r ? r.error : undefined)).find(Boolean) : undefined;
    assert.ok(err instanceof RunnerError, `a runner's error: ${String(err)}`);
    assert.equal(err.refused, true, 'refused, so the attempt ends unstartable');
    assert.equal(fs.existsSync(filesOf(root, NAME).run), false, 'no run file was written');
  });

  await s.test('its neighbour with no limit starts on the same holder', async (st) => {
    const { root, dir, request } = kept({});
    const h = await holder(root, undefined, undefined, NO_SCOPE);
    t.after(async () => {
      fs.writeFileSync(path.join(dir, 'end'), '');
      await h.close();
    });
    await Effect.runPromise(h.attached.ops.spawn(request));
    await until(st, () => run(root)?.state === 'idle', 'the unlimited session idle after its first turn', { everyMs: 50 });
  });

  await s.test(
    'REFUSED: a parked limited session a holder that makes no scope takes up ends failed, and is not taken up again',
    async (st) => {
      const { root, dir, request } = kept({});
      fs.mkdirSync(path.dirname(filesOf(root, NAME).run), { recursive: true });
      writeRun(root, {
        name: NAME,
        state: 'parked',
        owner: process.pid,
        startedAt: new Date().toISOString(),
        sessionId: 'left',
        request: { ...request, resources: LIMITED, brief: undefined },
      });
      const h = await holder(root, undefined, undefined, NO_SCOPE);
      t.after(h.close);
      await Effect.runPromise(h.attached.ops.observe);
      await until(st, () => run(root)?.state === 'failed', 'the parked session ended failed', { everyMs: 50 });
      await Effect.runPromise(h.attached.ops.observe);
      assert.equal(run(root)?.state, 'failed', 'and the next look leaves it ended');
      assert.equal(lines(dir, 'argv.jsonl').length, 0, 'no Claude Code was started for it');
    },
  );
});

const refused = scopeRefusal();

test(
  'a held session under a memory limit runs in a scope of its own, and its run file and sighting say what the scope held',
  { ...WAITED, ...(refused ? { skip: refused } : {}) },
  async (t) => {
    const { root, dir, request } = kept({});
    const h = await holder(root);
    t.after(async () => {
      fs.writeFileSync(path.join(dir, 'end'), '');
      await h.close();
    });
    await Effect.runPromise(h.attached.ops.spawn({ ...request, resources: LIMITED }));
    const idle = await until(t, () => run(root)?.state === 'idle' && run(root), 'the limited session idle', { everyMs: 50 });
    const pid = idle && idle.childPid;
    assert.ok(pid, 'its Claude Code has a pid');
    const cgroup = fs.readFileSync(`/proc/${pid}/cgroup`, 'utf8');
    assert.match(cgroup, /\.scope$/m, `its Claude Code runs in a scope of its own: ${cgroup}`);
    assert.equal(fs.readFileSync(`/sys/fs/cgroup${cgroup.trim().slice(3)}/memory.max`, 'utf8').trim(), '268435456', 'under the limit');
    const seen = (await Effect.runPromise(h.attached.ops.observe)).get(NAME);
    assert.equal(seen?.memory?.limitBytes, 268_435_456, `its sighting says the scope's limit: ${JSON.stringify(seen?.memory)}`);
    assert.equal(typeof seen?.memory?.oomKills, 'number');
  },
);
