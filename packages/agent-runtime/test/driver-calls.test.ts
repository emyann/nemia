/**
 * Every call the engine makes to a harness goes through the A2A seam, but for the one named here: `refuses`, which judges
 * a task before any session exists and so is no call to one.
 *
 * Proven by behaviour, not by reading the code: every method of the harness's A2A agent (`HarnessHandler`) is run inside
 * an async context that marks it, and a driver records each verb it is asked outside one. A task is then taken through
 * every verb the engine has — file, tick, view, say, logs, transcript, stop, and the release a finished session gets —
 * and the only verbs asked directly must be the exemptions. The check is made to refuse the two shapes that bypass the
 * seam: the driver's own verbs spread beside the seam's three (`spawn`, `observe`, `stop`), each reported by name, and
 * every verb through the seam but the transcript.
 *
 * A remote A2A agent is no driver behind `HarnessHandler`: its verbs are A2A calls over HTTP to another party's agent, and
 * `remote-agent.test.ts` proves each one reaches it by that agent's own count of the methods it answered.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { rmSync } from 'node:fs';
import { Effect } from 'effect';
import { a2aOps } from '../src/a2a/client.ts';
import { HarnessHandler } from '../src/a2a/handler.ts';
import type { Sighting } from '../src/index.ts';
import { Engine } from '../src/index.ts';
import { scratch } from './scratch.ts';
import { asyncOps, type AsyncRunner } from './promise-runner.ts';
import { builtEngine } from './engine.ts';

/** The verbs a driver may be asked directly, the only ones: `refuses` judges a task before any session exists. */
const EXEMPT = ['refuses'];

const inCall = new AsyncLocalStorage<true>();

/** Run every method of the A2A agent inside `inCall`, for the length of `f`; put them back after. */
const marked = async <A>(f: () => Promise<A>): Promise<A> => {
  const proto = HarnessHandler.prototype as unknown as Record<string, unknown>;
  const names = Object.getOwnPropertyNames(proto).filter((k) => k !== 'constructor' && typeof proto[k] === 'function');
  const kept = new Map(names.map((k) => [k, proto[k] as (...a: unknown[]) => unknown]));
  for (const [k, method] of kept)
    proto[k] = function (this: unknown, ...a: unknown[]) {
      return inCall.run(true, () => method.apply(this, a));
    };
  try {
    return await f();
  } finally {
    for (const [k, method] of kept) proto[k] = method;
  }
};

/** A driver whose sessions a test moves by hand, recording every verb it is asked with no A2A call in flight. */
const spy = () => {
  const sessions = new Map<string, Sighting>();
  const direct: string[] = [];
  const asked: string[] = [];
  const saw = (verb: string) => {
    asked.push(verb);
    if (!inCall.getStore()) direct.push(verb);
  };
  let n = 0;
  const runner: AsyncRunner = {
    async spawn(r) {
      saw('spawn');
      sessions.set(r.name, { sessionId: `s-${++n}`, state: 'working', busy: true });
    },
    async observe() {
      saw('observe');
      return new Map(sessions);
    },
    async find(name) {
      saw('find');
      const s = sessions.get(name);
      return s && { sessionId: s.sessionId };
    },
    async stop(id) {
      saw('stop');
      for (const [name, s] of sessions) if (s.sessionId === id) sessions.set(name, { ...s, state: 'canceled', busy: false });
    },
    async logs(id) {
      saw('logs');
      return `logs of ${id}`;
    },
    async release() {
      saw('release');
      return { turns: 1 };
    },
    async transcript() {
      saw('transcript');
      return { events: [], cursor: '' };
    },
    async say() {
      saw('say');
    },
  };
  return { runner, sessions, direct, asked };
};

/** A task taken through every verb the engine has, on `harnesses`. */
const everyVerb = async (harnesses: Record<string, AsyncRunner>) => {
  const root = scratch('ae-driver-calls-');
  try {
    const engine = builtEngine(
      Engine.layer({ root, harnesses: Object.fromEntries(Object.entries(harnesses).map(([k, h]) => [k, asyncOps(h)])) }),
    );
    const id = await Effect.runPromise(engine.file({ id: 't-calls', brief: 'b', cwd: '/repo', harness: 'fake' }));
    await Effect.runPromise(engine.tick());
    await Effect.runPromise(engine.view(id));
    await Effect.runPromise(engine.list());
    await Effect.runPromise(engine.say(id, 'look again'));
    await Effect.runPromise(engine.logs(id));
    await Effect.runPromise(engine.transcript(id));
    await Effect.runPromise(engine.stop(id));
    await Effect.runPromise(engine.tick());
    await Effect.runPromise(engine.tick());
    await Effect.runPromise(engine.logs(id));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

test('the engine reaches a harness through the A2A seam for every verb it asks, the transcript included', async () => {
  const s = spy();
  await marked(() => everyVerb({ fake: s.runner }));
  for (const verb of ['spawn', 'observe', 'find', 'say', 'logs', 'transcript', 'stop', 'release']) {
    assert.ok(s.asked.includes(verb), `${verb} was asked (${s.asked.join(', ')})`);
  }
  assert.deepEqual(s.direct, [], 'none asked outside the seam, and every one asked, so none passed by being skipped');
});

test('REFUSED: a verb asked beside the seam is named, whichever shape bypasses it', async (t) => {
  await t.test("REFUSED: a driver asked directly, its own verbs spread beside the seam's three, is named for each verb", async () => {
    const s = spy();
    const direct = asyncOps(s.runner);
    const seam = a2aOps('fake', direct, async () => []);
    const besideTheSeam = { ...direct, spawn: seam.spawn, observe: seam.observe, stop: seam.stop };
    await marked(async () => {
      s.sessions.set('ae/t-1/1', { sessionId: 's-9', state: 'completed' });
      await Effect.runPromise(besideTheSeam.find!('ae/t-1/1'));
      await Effect.runPromise(besideTheSeam.logs('s-9'));
      await Effect.runPromise(besideTheSeam.release!({ sessionId: 's-9', state: 'completed' }, {}));
      await Effect.runPromise(besideTheSeam.say!({ name: 'ae/t-1/1', sessionId: 's-9' }, 'hi'));
      await Effect.runPromise(besideTheSeam.observe);
    });
    assert.deepEqual(s.direct, ['find', 'logs', 'release', 'say'], 'every verb that bypassed the seam, and the observe that did not');
    assert.ok(s.direct.some((verb) => !EXEMPT.includes(verb)));
  });

  await t.test(
    'REFUSED: the transcript read directly, spread from the driver beside every other verb through the seam, is named',
    async () => {
      const s = spy();
      const direct = asyncOps(s.runner);
      const transcriptBeside = { ...a2aOps('fake', direct, async () => []), transcript: direct.transcript! };
      await marked(async () => {
        s.sessions.set('ae/t-1/1', { sessionId: 's-9', state: 'completed' });
        await Effect.runPromise(transcriptBeside.transcript('s-9'));
        await Effect.runPromise(transcriptBeside.logs('s-9'));
      });
      assert.deepEqual(s.direct, ['transcript'], 'the transcript bypassed the seam, and the logs did not');
      assert.ok(s.direct.some((verb) => !EXEMPT.includes(verb)));
    },
  );
});
