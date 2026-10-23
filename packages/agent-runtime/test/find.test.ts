/**
 * Finding one session by its name without `claude agents`, at shipped defaults — a fake `claude` that keeps a registry
 * and counts every `agents` call, registration files where Claude Code writes them, and transcript files.
 *
 * To observe Claude Code is to run `claude agents --json`, a process a call, and a board's open stream and the api's list
 * view often. A session's own registration names it, so a read that needs only which session a task runs is answered
 * from that file, and a view of a task with no attempt in flight from its record. A read that needs a session's state
 * still observes, and where a registration and the registry disagree, it takes the registry's word.
 *
 * - A registration whose session id is empty is not taken: `transcript` would read `''` for as long as the attempt runs,
 *   and never observe.
 * - A task whose harness the engine no longer has is viewed off its record, and no other harness is asked, since none
 *   can name its sessions: the pass reads such a task the same way (`composite`: its names unread, its spawn refused).
 * - Where Claude Code keeps registrations is read when a runner is made, and transcripts when it is loaded, so
 *   `CLAUDE_CONFIG_DIR` is set before the import.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import type { Sighting, TranscriptEvent } from '../src/index.ts';
import { scratch } from './scratch.ts';
import { story } from './checkpoints.ts';

const tmp = (label: string) => scratch(`ae-find-${label}-`);

const config = tmp('config');
process.env.CLAUDE_CONFIG_DIR = config;
const sessions = path.join(config, 'sessions');
const { Engine } = await import('../src/index.ts');
const { asyncOps } = await import('./promise-runner.ts');
const { builtEngine } = await import('./engine.ts');
const { claudeOps } = await import('../src/harness/claude/bg.ts');
const { claudeRegistered, processStart } = await import('../src/harness/claude/inbox.ts');

type Row = { name: string; sessionId: string; state: string; status: string; startedAt: number; pid?: number };

/**
 * A fake `claude`. `agents` prints its rows and counts the call; `--bg --name <n>` adds a row, working and busy, whose
 * process is this test's; `stop` and `rm` take a short id. A test moves a row by hand, as the harness would.
 */
const fakeClaude = () => {
  const bin = tmp('bin');
  const registry = path.join(bin, 'registry.json');
  const calls = path.join(bin, 'agents-calls');
  fs.writeFileSync(registry, '[]');
  fs.writeFileSync(calls, '');
  fs.writeFileSync(
    path.join(bin, 'claude'),
    `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const rows = JSON.parse(fs.readFileSync(${JSON.stringify(registry)}, 'utf8'));
const save = () => fs.writeFileSync(${JSON.stringify(registry)}, JSON.stringify(rows));
if (args[0] === 'agents') { fs.appendFileSync(${JSON.stringify(calls)}, 'x'); process.stdout.write(JSON.stringify(rows)); process.exit(0); }
if (args[0] === 'stop' || args[0] === 'rm') {
  const at = rows.findIndex((r) => r.sessionId.split('-')[0] === args[1]);
  if (at === -1) { process.stderr.write("No job matching '" + args[1] + "'\\n"); process.exit(1); }
  if (args[0] === 'stop') rows[at].state = 'stopped'; else rows.splice(at, 1);
  save();
  process.exit(0);
}
if (args[0] === '--bg') {
  rows.push({ name: args[args.indexOf('--name') + 1], sessionId: require('node:crypto').randomUUID(), state: 'working', status: 'busy', kind: 'background', startedAt: Date.now(), pid: ${process.pid} });
  save();
}
`,
    { mode: 0o755 },
  );
  const rows = () => JSON.parse(fs.readFileSync(registry, 'utf8')) as Row[];
  return {
    bin,
    rows,
    setRows: (next: Row[]) => fs.writeFileSync(registry, JSON.stringify(next)),
    /** How many times `claude agents` has run. */
    agents: () => fs.readFileSync(calls, 'utf8').length,
  };
};

const onPath = async <T>(bin: string, f: () => Promise<T>): Promise<T> => {
  const prev = process.env.PATH;
  process.env.PATH = `${bin}:${prev}`;
  try {
    return await f();
  } finally {
    process.env.PATH = prev;
  }
};

/** The registration Claude Code writes for a running session: by its pid, with when that process started. */
const register = (session: { name: string; sessionId: string }, pid = process.pid, fields: object = {}) => {
  fs.mkdirSync(sessions, { recursive: true });
  fs.writeFileSync(
    path.join(sessions, `${pid}.json`),
    JSON.stringify({
      pid,
      sessionId: session.sessionId,
      name: session.name,
      kind: 'bg',
      procStart: processStart(pid),
      status: 'busy',
      ...fields,
    }),
  );
};

/** A line the session wrote to its transcript, just now. */
const wrote = (sessionId: string, text: string) => {
  const file = path.join(config, 'projects', 'fake-project', `${sessionId}.jsonl`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(
    file,
    `${JSON.stringify({ type: 'assistant', uuid: randomUUID(), sessionId, timestamp: new Date().toISOString(), message: { role: 'assistant', content: [{ type: 'text', text }] } })}\n`,
  );
};

const texts = (events: TranscriptEvent[]) => events.map((e) => e.text);
const find = (name: string) => Effect.runPromise(claudeOps({ root: tmp('root') }).find!(name));

test("a background session found by its name: its conversation read with no `claude agents`, a settled task viewed off its record — and where a registration and the registry disagree, the registry's word taken", async (t) => {
  const s = story(t);
  const claude = fakeClaude();
  const prev = process.env.PATH;
  process.env.PATH = `${claude.bin}:${prev}`;
  t.after(() => {
    process.env.PATH = prev;
  });
  const engine = builtEngine(Engine.layer({ root: tmp('root') }));
  let id = '';
  let row: Row | undefined;
  let before = 0;

  await s.test(
    "registered under its attempt's name, it is found by it, and its conversation read with no `claude agents` call",
    async () => {
      id = await Effect.runPromise(engine.file({ config: { background: true }, brief: 'the prompt', cwd: tmp('cwd') }));
      await Effect.runPromise(engine.tick());
      [row] = claude.rows();
      register(row);
      wrote(row.sessionId, 'working on it');
      before = claude.agents();
      assert.deepEqual(await find(row.name), { sessionId: row.sessionId }, 'found by name, at shipped defaults');
      assert.deepEqual(
        texts((await Effect.runPromise(engine.transcript(id))).events),
        ['working on it'],
        "the running attempt's conversation",
      );
      assert.equal(claude.agents(), before, 'read with no `claude agents` call');
    },
  );

  await s.test("a view of its attempt in flight observes: its state is the registry's", async () => {
    assert.equal((await Effect.runPromise(engine.view(id))).phase, 'running (working)', "its state is the registry's");
    assert.equal(claude.agents(), before + 1, 'a view of an attempt in flight observes');
  });

  await s.test(
    'ended and settled, the task is viewed, and its conversation read, off its record with no `claude agents` call',
    async () => {
      claude.setRows(claude.rows().map((r) => ({ ...r, state: 'done', status: 'idle' })));
      await Effect.runPromise(engine.tick());
      const settled = claude.agents();
      const v = await Effect.runPromise(engine.view(id));
      assert.equal(v.phase, 'succeeded', 'ended and settled: its phase is on the record');
      assert.equal(v.sessionId, row!.sessionId, 'the id its end was recorded with');
      assert.deepEqual(texts((await Effect.runPromise(engine.transcript(id))).events), ['working on it']);
      assert.equal(claude.agents(), settled, 'a settled task is viewed, and read, with no `claude agents` call');
    },
  );

  await s.test(
    "a registration and the registry that disagree: the registry's word is taken — by a view, by say, and by the pass",
    async () => {
      const next = await Effect.runPromise(engine.file({ config: { background: true }, brief: 'the prompt', cwd: tmp('cwd') }));
      await Effect.runPromise(engine.tick());
      const listed = claude.rows().find((r) => r.name === `ae/${next}/1`)!;
      const other = randomUUID();
      register({ name: listed.name, sessionId: other });
      claude.setRows(claude.rows().map((r) => (r.name === listed.name ? { ...r, state: 'stopped', status: 'idle' } : r)));
      assert.deepEqual(await find(listed.name), { sessionId: other }, 'the registration says one runs under the name');

      const v = await Effect.runPromise(engine.view(next));
      assert.equal(v.phase, 'running (stopped)', "its state is the registry's");
      assert.equal(v.sessionId, listed.sessionId, 'and so is which session it is');
      await assert.rejects(
        Effect.runPromise(engine.say(next, 'hello')),
        (e: Error & { _tag?: string }) => e._tag === 'SayRefused' && /session is `stopped` on its harness, not running/.test(e.message),
      );

      await Effect.runPromise(engine.tick());
      const after = await Effect.runPromise(engine.view(next));
      assert.equal(after.state.attempts[0]?.ended, 'stopped', 'the pass ended the attempt as the registry has it');
      assert.equal(after.state.attempts[0]?.nativeId, listed.sessionId);
      assert.equal(after.state.settled, 'stopped');
    },
  );
});

test('find: a registration that is not taken — of a process gone or replaced, of a name nobody registered, an interactive session, another pid, another user, a symlink, or no session id', async (t) => {
  await t.test(
    'a registration whose process has gone is not found, nor one whose pid another process has taken since — the session is observed instead',
    async () => {
      const claude = fakeClaude();
      await onPath(claude.bin, async () => {
        const engine = builtEngine(Engine.layer({ root: tmp('root') }));
        const id = await Effect.runPromise(engine.file({ config: { background: true }, brief: 'the prompt', cwd: tmp('cwd') }));
        await Effect.runPromise(engine.tick());
        const [row] = claude.rows();
        wrote(row.sessionId, 'hello');

        const exited = spawnSync(process.execPath, ['-e', '']).pid;
        register(row, exited);
        assert.equal(await find(row.name), undefined, 'its process has exited: not found');
        const before = claude.agents();
        assert.deepEqual(texts((await Effect.runPromise(engine.transcript(id))).events), ['hello'], 'the running session is still read');
        assert.equal(claude.agents(), before + 1, 'found through `claude agents` instead');
        fs.rmSync(path.join(sessions, `${exited}.json`));

        if (processStart(process.pid) !== undefined) {
          register(row, process.pid, { procStart: '1' });
          assert.equal(
            await find(row.name),
            undefined,
            'a live pid whose process started other than the registration says: not the session',
          );
          register(row, process.pid, { procStart: undefined });
          assert.equal(
            await find(row.name),
            undefined,
            'a registration that does not say when its process started, where that can be checked: not taken',
          );
        }
        register(row);
        assert.deepEqual(await find(row.name), { sessionId: row.sessionId }, 'the same registration, of its own live process: found');
      });
    },
  );

  await t.test(
    'a name no running session registered is not found — nor an interactive session, a file another user owns, one that names another pid, a symlink, or one with no session id',
    async () => {
      const session = { name: `ae/t-${randomUUID().slice(0, 8)}/1`, sessionId: randomUUID() };
      assert.equal(await find(session.name), undefined, 'nothing registered under it');
      assert.equal(
        await Effect.runPromise(claudeOps({ root: tmp('root'), sessionsDir: path.join(tmp('nowhere'), 'sessions') }).find!(session.name)),
        undefined,
        'no sessions directory at all',
      );

      register(session, process.pid, { kind: 'interactive' });
      assert.equal(await find(session.name), undefined, 'an interactive session is never ours');
      register(session, process.pid, { pid: process.pid + 1 });
      assert.equal(await find(session.name), undefined, 'a file that names a pid other than the one it is named for');

      register(session, process.pid, { sessionId: '' });
      assert.equal(await find(session.name), undefined, 'a registration whose session id is empty');
      register(session, process.pid, { sessionId: undefined });
      assert.equal(await find(session.name), undefined, 'a registration with no session id');

      const file = path.join(sessions, `${process.pid}.json`);
      const elsewhere = path.join(tmp('elsewhere'), `${process.pid}.json`);
      register(session);
      fs.copyFileSync(file, elsewhere);
      fs.rmSync(file);
      fs.symlinkSync(elsewhere, file);
      assert.equal(await find(session.name), undefined, 'a symlink, even to a good registration');
      fs.rmSync(file);
      register(session);
      assert.equal(await find(session.name.replace(/\/1$/, '/2')), undefined, "the next attempt's name is not this attempt's");
      assert.equal(
        await claudeRegistered(sessions, session.name, { uid: (process.getuid?.() ?? 0) + 1 }),
        undefined,
        "a file another user owns is not this user's session",
      );
      assert.deepEqual(
        await find(session.name),
        { sessionId: session.sessionId },
        'the control: a background session, of this user, under its own pid, found',
      );
    },
  );
});

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
        assert.equal((await Effect.runPromise(engine.view(id))).phase, 'running (working)', at);
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
      assert.equal((await Effect.runPromise(engine.view(running))).phase, 'running (working)', 'an attempt in flight, observed');
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
