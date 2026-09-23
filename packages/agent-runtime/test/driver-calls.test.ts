/**
 * Every call the engine makes to a harness goes through the A2A seam (thin runtime, stage 1 part 3), but for the two
 * named here: `transcript`, until part 4 makes it `SubscribeToTask`, and `refuses`, which judges a task before any
 * session exists and so is no call to one.
 *
 * Proven by behaviour, not by reading the code: every method of the harness's A2A agent (`HarnessHandler`) is run inside
 * an async context that marks it, and a driver records each verb it is asked outside one. A task is then taken through
 * every verb the engine has — file, tick, view, say, logs, transcript, stop, and the release a finished session gets —
 * and the only verbs asked directly must be the exemptions. The same driver behind the old shape, where the seam spread
 * the driver's own verbs beside its three, is reported by name: the check refuses what part 3 moved.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Effect } from 'effect';
import { a2aOps } from '../src/a2a-client.ts';
import { HarnessHandler } from '../src/a2a-handler.ts';
import { createEngine, type PromiseRunner, type Sighting } from '../src/facade.ts';
import { promiseOps } from '../src/runner-promise.ts';

/** The verbs a driver may be asked directly, and why: the only ones. */
const EXEMPT = ['transcript', 'refuses'];

const inCall = new AsyncLocalStorage<true>();

/** Run every method of the A2A agent inside `inCall`, for the length of `f`; put them back after. */
const marked = async <A>(f: () => Promise<A>): Promise<A> => {
  const proto = HarnessHandler.prototype as unknown as Record<string, unknown>;
  const names = Object.getOwnPropertyNames(proto).filter((k) => k !== 'constructor' && typeof proto[k] === 'function');
  const kept = new Map(names.map((k) => [k, proto[k] as (...a: unknown[]) => unknown]));
  for (const [k, method] of kept) proto[k] = function (this: unknown, ...a: unknown[]) { return inCall.run(true, () => method.apply(this, a)); };
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
  const runner: PromiseRunner = {
    async spawn(r) { saw('spawn'); sessions.set(r.name, { sessionId: `s-${++n}`, state: 'working', busy: true }); },
    async observe() { saw('observe'); return new Map(sessions); },
    async find(name) { saw('find'); const s = sessions.get(name); return s && { sessionId: s.sessionId }; },
    async stop(id) {
      saw('stop');
      for (const [name, s] of sessions) if (s.sessionId === id) sessions.set(name, { ...s, state: 'stopped', busy: false });
    },
    async logs(id) { saw('logs'); return `logs of ${id}`; },
    async release() { saw('release'); return { turns: 1 }; },
    async transcript() { saw('transcript'); return { events: [], cursor: '' }; },
    async say() { saw('say'); },
  };
  return { runner, sessions, direct, asked };
};

/** A task taken through every verb the engine has, on `harnesses`. */
const everyVerb = async (harnesses: Record<string, PromiseRunner>) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'ae-driver-calls-'));
  try {
    const engine = createEngine({ root, harnesses });
    const id = await engine.file({ id: 't-calls', brief: 'b', cwd: '/repo', harness: 'fake' });
    await engine.tick();
    await engine.view(id);
    await engine.list();
    await engine.say(id, 'look again');
    await engine.logs(id);
    await engine.transcript(id);
    await engine.stop(id);
    await engine.tick();
    await engine.tick();
    await engine.logs(id);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

test('the engine reaches a harness through the A2A seam for every verb but transcript', async () => {
  const s = spy();
  await marked(() => everyVerb({ fake: s.runner }));
  // The run went where it should: every verb was asked, so none passed by being skipped.
  for (const verb of ['spawn', 'observe', 'find', 'say', 'logs', 'transcript', 'stop', 'release']) {
    assert.ok(s.asked.includes(verb), `${verb} was asked (${s.asked.join(', ')})`);
  }
  assert.deepEqual([...new Set(s.direct)], ['transcript']);
  assert.ok(s.direct.every((verb) => EXEMPT.includes(verb)));
});

test('REFUSED: a driver asked directly, as the seam asked it before part 3, is named for each verb', async () => {
  const s = spy();
  const direct = promiseOps(s.runner);
  // Part 2's shape: the driver's verbs spread beside the three the seam carried.
  const seam = a2aOps('fake', direct, async () => []);
  const partTwo = { ...direct, spawn: seam.spawn, observe: seam.observe, stop: seam.stop };
  await marked(async () => {
    s.sessions.set('ae/t-1/1', { sessionId: 's-9', state: 'done' });
    await Effect.runPromise(partTwo.find!('ae/t-1/1'));
    await Effect.runPromise(partTwo.logs('s-9'));
    await Effect.runPromise(partTwo.release!({ sessionId: 's-9', state: 'done' }, {}));
    await Effect.runPromise(partTwo.say!({ name: 'ae/t-1/1', sessionId: 's-9' }, 'hi'));
    await Effect.runPromise(partTwo.observe);
  });
  assert.deepEqual(s.direct, ['find', 'logs', 'release', 'say'], 'every verb that bypassed the seam, and the observe that did not');
  assert.ok(s.direct.some((verb) => !EXEMPT.includes(verb)));
});
