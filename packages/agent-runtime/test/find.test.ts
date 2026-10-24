/**
 * Which harness a read asks, at shipped defaults: a task's own, by name where its runner can find a session and by observing where it
 * cannot, and none once it has settled or its harness is gone.
 *
 * - A task whose harness the engine no longer has is viewed off its record, and no other harness is asked, since none
 *   can name its sessions: the pass reads such a task the same way (`composite`: its names unread, its spawn refused).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import type { Sighting, TranscriptEvent } from '../src/index.ts';
import { Engine } from '../src/index.ts';
import { asyncOps } from './promise-runner.ts';
import { builtEngine } from './engine.ts';
import { scratch } from './scratch.ts';

const tmp = (label: string) => scratch(`ae-find-${label}-`);

const texts = (events: TranscriptEvent[]) => events.map((e) => e.text);

test("which harness a read asks: a task's own, by name where it can find and by observing where it cannot, and none once it has settled or its harness is gone", async (t) => {
  await t.test(
    "an AsyncRunner without find is observed while its task runs; one with find is asked by name, and only for an attempt's session; neither once settled",
    async () => {
      const harness = (withFind: boolean) => {
        const sessions = new Map<string, Sighting>();
        const counts = { observe: 0, find: [] as string[] };
        const runner = {
          async spawn(r: { name: string }) {
            const s = `s-${sessions.size + 1}`;
            sessions.set(r.name, { sessionId: s, state: 'working', nativeId: s });
          },
          async observe() {
            counts.observe++;
            return new Map(sessions);
          },
          async stop() {},
          async logs(sessionId: string) {
            return `logs of ${sessionId}`;
          },
          async transcript(sessionId: string) {
            return {
              events: [{ id: 'e', at: new Date(0).toISOString(), role: 'assistant' as const, kind: 'text' as const, text: sessionId }],
              cursor: 'c',
            };
          },
          ...(withFind
            ? {
                async find(name: string) {
                  counts.find.push(name);
                  const s = sessions.get(name);
                  return s && { sessionId: s.sessionId };
                },
              }
            : {}),
        };
        return { sessions, counts, runner };
      };

      for (const withFind of [false, true]) {
        const h = harness(withFind);
        const engine = builtEngine(Engine.layer({ root: tmp('root'), harnesses: { mine: asyncOps(h.runner) } }));
        const id = await Effect.runPromise(engine.file({ brief: 'the prompt', cwd: tmp('cwd') }));
        await Effect.runPromise(engine.tick());
        const at = `with find: ${withFind}`;

        let before = h.counts.observe;
        assert.deepEqual(texts((await Effect.runPromise(engine.transcript(id))).events), ['s-1'], at);
        assert.equal(h.counts.observe, before + (withFind ? 0 : 1), `${at}: a running attempt's session`);
        assert.deepEqual(h.counts.find, withFind ? [`ae/${id}/1`] : [], `${at}: asked by its name`);
        assert.equal((await Effect.runPromise(engine.view(id))).phase, 'working', at);
        assert.equal(h.counts.observe, before + (withFind ? 1 : 2), `${at}: a view of it observes either way`);

        h.sessions.set(`ae/${id}/1`, { ...h.sessions.get(`ae/${id}/1`)!, state: 'completed' });
        await Effect.runPromise(engine.tick());
        before = h.counts.observe;
        const v = await Effect.runPromise(engine.view(id));
        assert.equal(v.phase, 'succeeded', at);
        assert.equal(v.sessionId, 's-1', at);
        assert.equal(await Effect.runPromise(engine.logs(id)), 'logs of s-1', at);
        assert.equal(h.counts.observe, before, `${at}: a settled task, viewed and its logs read, off its record`);
        assert.equal(h.counts.find.length, withFind ? 1 : 0, `${at}: its id is on the record, and nobody is asked for it`);
      }
    },
  );

  await t.test(
    "a view asks its task's own harness and no other, on harnesses that cannot find, as a check or Codex cannot — and a task whose harness the engine no longer has is viewed off its record, asking no harness",
    async () => {
      const harness = (label: string) => {
        const sessions = new Map<string, Sighting>();
        const counts = { observe: 0 };
        const runner = {
          async spawn(r: { name: string }) {
            const s = `${label}-${sessions.size + 1}`;
            sessions.set(r.name, { sessionId: s, state: 'working', nativeId: s });
          },
          async observe() {
            counts.observe++;
            return new Map(sessions);
          },
          async stop() {},
          async logs(sessionId: string) {
            return `${label} logs of ${sessionId}`;
          },
        };
        return { sessions, counts, runner };
      };
      const a = harness('a');
      const b = harness('b');
      const root = tmp('root');
      const engine = builtEngine(Engine.layer({ root, harnesses: { a: asyncOps(a.runner), b: asyncOps(b.runner) } }));
      const running = await Effect.runPromise(engine.file({ brief: 'runs on b', cwd: tmp('cwd'), harness: 'b', id: 'running' }));
      const settled = await Effect.runPromise(engine.file({ brief: 'ends on b', cwd: tmp('cwd'), harness: 'b', id: 'settled' }));
      await Effect.runPromise(engine.tick());
      b.sessions.set(`ae/${settled}/1`, { ...b.sessions.get(`ae/${settled}/1`)!, state: 'completed' });
      await Effect.runPromise(engine.tick());

      const before = { a: a.counts.observe, b: b.counts.observe };
      assert.equal((await Effect.runPromise(engine.view(running))).phase, 'working', 'an attempt in flight, observed');
      assert.equal((await Effect.runPromise(engine.view(settled))).phase, 'succeeded', 'a settled task on a harness that cannot find');
      assert.equal(await Effect.runPromise(engine.logs(running)), 'b logs of b-1');
      assert.equal(a.counts.observe, before.a, "no view of a task on b asks a's registry");
      assert.equal(
        b.counts.observe,
        before.b + 2,
        "each read of the task in flight asks b's, once; the settled task's, none (`io.test.ts`)",
      );

      const c = harness('c');
      for (const [name, s] of b.sessions) c.sessions.set(name, s);
      const reopened = builtEngine(
        Engine.layer({ root, harnesses: { a: asyncOps(a.runner), c: asyncOps(c.runner) }, defaultHarness: 'c' }),
      );
      const at = { a: a.counts.observe, c: c.counts.observe };
      const recorded = await Effect.runPromise(reopened.view(running));
      assert.equal(recorded.phase, 'starting', 'what the record says of an attempt it has seen spawned and nothing since');
      assert.equal(recorded.state.attempts[0]?.ended, null, 'held open, not ended');
      assert.equal(await Effect.runPromise(reopened.logs(running)), '(no session yet)', 'no harness it has can name the session');
      assert.equal((await Effect.runPromise(reopened.view(settled))).phase, 'succeeded', 'a settled task reads as ever');
      assert.deepEqual({ a: a.counts.observe, c: c.counts.observe }, at, 'neither the first harness named nor the fallback was asked');
    },
  );

  await t.test(
    'REFUSED: a settled task on a harness that has `find` observes nothing either, when the record has no native id and find finds none (a harness that names no native id and forgets a session once it is done)',
    async () => {
      const sessions = new Map<string, Sighting>();
      const counts = { observe: 0, find: 0 };
      const runner = {
        async spawn(r: { name: string }) {
          sessions.set(r.name, { sessionId: `s-${sessions.size + 1}`, state: 'working' });
        },
        async observe() {
          counts.observe++;
          return new Map(sessions);
        },
        async find(name: string) {
          counts.find++;
          const s = sessions.get(name);
          return s && s.state !== 'completed' ? { sessionId: s.sessionId } : undefined;
        },
        async stop() {},
        async logs(sessionId: string) {
          return `logs of ${sessionId}`;
        },
      };
      const engine = builtEngine(Engine.layer({ root: tmp('root'), harnesses: { mine: asyncOps(runner) } }));
      const id = await Effect.runPromise(engine.file({ brief: 'b', cwd: tmp('cwd') }));
      await Effect.runPromise(engine.tick());
      sessions.set(`ae/${id}/1`, { ...sessions.get(`ae/${id}/1`)!, state: 'completed' });
      await Effect.runPromise(engine.tick());

      const before = counts.observe;
      const v = await Effect.runPromise(engine.view(id));
      assert.equal(v.phase, 'succeeded');
      assert.equal(v.state.attempts[0]?.nativeId, null, 'nothing named a native id');
      assert.equal(v.sessionId, 's-1', 'the handle its end was recorded under');
      assert.equal(await Effect.runPromise(engine.logs(id)), 'logs of s-1');
      assert.equal(counts.observe, before, 'viewed, and its logs read, with no observe');
      assert.equal(counts.find, 2, 'asked by name once a read, and found nothing');
    },
  );
});
