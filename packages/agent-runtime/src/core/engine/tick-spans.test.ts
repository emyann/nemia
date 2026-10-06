/**
 * What the engine's pass traces: the work it does, never a task it looks at and skips. A pass over 2 settled tasks and one over 200 make
 * the same spans, the memo's proof on (`tickMemoLayer({ verify: true })`), and say on their `tick` span how many tasks the store lists
 * and how many the memo kept (`tasks`, `kept`); the pass that lets the sessions go traces each release (`releaseFinished`), with its
 * `task`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect, Layer, Tracer } from 'effect';
import { Journal } from './journal.ts';
import { tickMemoLayer } from './memo.ts';
import { file } from './filing.ts';
import { tick } from './engine.ts';
import { Runner, testOps } from '../../harness/seam.ts';
import { nameFor, type Sighting } from '../domain.ts';

/** The spans `program` made, traced to a tracer that keeps them. */
const spansOf = async <A, E>(program: Effect.Effect<A, E>): Promise<Tracer.NativeSpan[]> => {
  const spans: Tracer.NativeSpan[] = [];
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options);
      spans.push(span);
      return span;
    },
  });
  await Effect.runPromise(program.pipe(Effect.withTracer(tracer)));
  return spans;
};

/** The names of `spans`, sorted: what a pass traced, whatever order its fibers ended in. */
const namesOf = (spans: readonly Tracer.NativeSpan[]): string[] => spans.map((s) => s.name).sort();

/**
 * `m` tasks filed, spawned and seen ended, on a harness that lists only what it is told to look for and lets a session go by forgetting
 * it: the spans of the pass that ended and released them, and of a pass once the memo keeps every one.
 */
const passesOver = async (m: number) => {
  const sessions = new Map<string, Sighting>();
  const runner = Runner.layer({
    ...testOps({ sessions }),
    observeFor: (expected) =>
      Effect.sync(() => ({
        seen: new Map([...sessions].filter(([name]) => expected.some((e) => e.name === name))),
        unread: new Set<string>(),
      })),
    release: (s) =>
      Effect.sync(() => {
        for (const [name, listed] of sessions) if (listed.sessionId === s.sessionId) sessions.delete(name);
      }),
  });
  const layer = Layer.mergeAll(Journal.test(), runner, tickMemoLayer({ verify: true }));
  const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => e.pipe(Effect.provide(layer));
  const ids: string[] = [];
  for (let k = 0; k < m; k++) ids.push(await Effect.runPromise(run(file({ brief: 'do the thing', cwd: '/repo', id: `t-${k}` }))));
  await Effect.runPromise(run(tick()));
  for (const id of ids) sessions.set(nameFor(id, 1), { ...sessions.get(nameFor(id, 1))!, state: 'completed' });
  const releasing = await spansOf(run(tick()));
  assert.equal(sessions.size, 0, 'every session let go on the pass that ended it');
  for (let pass = 0; pass < 2; pass++) await Effect.runPromise(run(tick()));
  return { ids, releasing, kept: await spansOf(run(tick())) };
};

test('a pass over 2 settled tasks and over 200 makes the same spans; a release that asked the harness is one span, with its task', async () => {
  const two = await passesOver(2);
  const twoHundred = await passesOver(200);
  assert.deepEqual(namesOf(twoHundred.kept), namesOf(two.kept), 'a pass the memo answers every task of traces as much over 200 as over 2');
  assert.deepEqual(
    namesOf(two.kept).filter((name) => name === 'releaseFinished' || name === 'verifyKept'),
    [],
    'no span for a kept task with nothing to release, nor for its proof',
  );
  for (const [{ kept }, m] of [
    [two, 2],
    [twoHundred, 200],
  ] as const) {
    const pass = kept.find((s) => s.name === 'tick');
    assert.deepEqual(
      [pass?.attributes.get('tasks'), pass?.attributes.get('kept')],
      [m, m],
      `the tick over ${m} says how many tasks it listed and kept`,
    );
  }
  for (const { ids, releasing } of [two, twoHundred]) {
    const released = releasing.filter((s) => s.name === 'releaseFinished');
    assert.deepEqual(
      released.map((s) => String(s.attributes.get('task'))).sort(),
      [...ids].sort(),
      'the pass that let the sessions go traced each release, with its task',
    );
  }
});
