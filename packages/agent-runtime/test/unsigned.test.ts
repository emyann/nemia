/**
 * A session that goes quiet without the closing statement its task asked for, at shipped defaults — a fake `claude`
 * that keeps a registry and records what it was asked to run, and a transcript file where Claude Code keeps one.
 *
 * The Claude runner reports how long a session has been quiet, and `decide` — which alone knows whether a statement was
 * asked for — ends that attempt saying whether one came: `stated`, on the `ended` event. The runtime judges nothing on it:
 * the orchestrator's `closeoutAsked` reads `stated: false` as unsigned and files the one sign-off nudge per round
 * (`agent-orchestrator/test/store.test.ts`). So what is pinned here is the fact, and that the runtime continues nothing on
 * it. A task that asked for nothing ends on quiet with no `stated` key at all. The registry's own `done` is a second door
 * to the same fact: a session it lists `done` with no statement has stated nothing either.
 */
import { Effect } from 'effect';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';
import { seenFor } from './sighting.ts';

const tmp = (label: string) => scratch(`ae-unsigned-${label}-`);

/** Where Claude Code keeps transcripts: read when the runner is loaded, so set before the runner's import. */
const config = tmp('config');
process.env.CLAUDE_CONFIG_DIR = config;
const { Engine } = await import('../src/index.ts');

const { builtEngine } = await import('./engine.ts');

type Row = { name: string; sessionId: string; state: string; status: string; startedAt: number };

const MINUTES = 60_000;
const SCHEMA = { type: 'object', properties: { outcome: { type: 'string' } } };

/**
 * A fake `claude`. `agents` prints its rows; `--bg --name <n>` records its arguments and adds a row, working and idle,
 * started now — under the id `--resume` names, as Claude Code keeps it, or a new one; `stop` and `rm` take a short id.
 */
const fakeClaude = () => {
  const bin = tmp('bin');
  const registry = path.join(bin, 'registry.json');
  const spawns = path.join(bin, 'spawns.jsonl');
  fs.writeFileSync(registry, '[]');
  fs.writeFileSync(spawns, '');
  fs.writeFileSync(
    path.join(bin, 'claude'),
    `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const rows = JSON.parse(fs.readFileSync(${JSON.stringify(registry)}, 'utf8'));
const save = () => fs.writeFileSync(${JSON.stringify(registry)}, JSON.stringify(rows));
if (args[0] === 'agents') { process.stdout.write(JSON.stringify(rows)); process.exit(0); }
if (args[0] === 'stop' || args[0] === 'rm') {
  const at = rows.findIndex((r) => r.sessionId.split('-')[0] === args[1]);
  if (at === -1) { process.stderr.write("No job matching '" + args[1] + "'\\n"); process.exit(1); }
  if (args[0] === 'stop') rows[at].state = 'stopped'; else rows.splice(at, 1);
  save();
  process.exit(0);
}
if (args[0] === '--bg') {
  fs.appendFileSync(${JSON.stringify(spawns)}, JSON.stringify(args) + '\\n');
  const resumed = args.indexOf('--resume');
  const sessionId = resumed === -1 ? require('node:crypto').randomUUID() : args[resumed + 1];
  rows.push({ name: args[args.indexOf('--name') + 1], sessionId, state: 'working', status: 'idle', kind: 'background', startedAt: Date.now() });
  save();
}
`,
    { mode: 0o755 },
  );
  const rows = () => JSON.parse(fs.readFileSync(registry, 'utf8')) as Row[];
  return {
    bin,
    rows,
    set: (name: string, change: Partial<Row>) =>
      fs.writeFileSync(registry, JSON.stringify(rows().map((r) => (r.name === name ? { ...r, ...change } : r)))),
    /** The arguments of every `claude --bg`, in order. */
    spawns: () =>
      fs
        .readFileSync(spawns, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as string[]),
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

/** When the journal says the task's first attempt began, in milliseconds since the epoch. */
const begun = async (engine: ReturnType<typeof builtEngine>, id: string) =>
  Date.parse((await Effect.runPromise(engine.view(id))).state.attempts[0]?.startedAt ?? '');

/**
 * Lines appended to the session's transcript, then its mtime put back `ago` milliseconds. Each line carries its own time, a
 * moment after `began` (`begun`) unless it says another: a statement counts only when made after its attempt began.
 */
const wrote = (sessionId: string, began: number, ago: number, ...entries: object[]) => {
  const file = path.join(config, 'projects', 'fake-project', `${sessionId}.jsonl`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const timestamp = new Date(began + 1).toISOString();
  fs.appendFileSync(file, entries.map((e) => `${JSON.stringify({ sessionId, timestamp, ...e })}\n`).join(''));
  const at = new Date(Date.now() - ago);
  fs.utimesSync(file, at, at);
};
const prompt = (content: string) => ({ type: 'user', message: { role: 'user', content } });
const says = (id: string, text: string) => ({ type: 'assistant', message: { id, role: 'assistant', content: [{ type: 'text', text }] } });
const closes = (id: string, payload: object) => ({
  type: 'assistant',
  message: { id, role: 'assistant', content: [{ type: 'tool_use', id: `tu_${id}`, name: 'StructuredOutput', input: payload }] },
});

const settledNote = async (engine: ReturnType<typeof builtEngine>, id: string) => {
  const entry = (await Effect.runPromise(engine.feed(0))).entries.find((e) => e.taskId === id && e.event.kind === 'settled');
  return entry?.event.kind === 'settled' ? entry.event.note : undefined;
};

test('a session that ends without the closing statement its task asked for, at shipped defaults: `stated: false` on its end, and nothing continued', async (t) => {
  await t.test(
    "a task that asked for a closeout, whose session goes quiet without one, ends saying so — `stated: false` — and the runtime continues nothing: the nudge is the layer above's",
    async () => {
      const claude = fakeClaude();
      await onPath(claude.bin, async () => {
        const root = tmp('root');
        const engine = builtEngine(Engine.layer({ root }));
        const id = await Effect.runPromise(
          engine.file({ config: { background: true }, brief: 'the prompt', cwd: tmp('cwd'), closeoutSchema: SCHEMA }),
        );
        await Effect.runPromise(engine.tick());
        const [row] = claude.rows();

        wrote(row.sessionId, await begun(engine, id), 10 * MINUTES, prompt('the prompt'), says('msg_1', 'I have finished.'));
        await seenFor(root, row.name, row.sessionId, 10 * MINUTES);
        claude.set(row.name, { startedAt: Date.now() - 20 * MINUTES });
        await Effect.runPromise(engine.tick());

        const v = await Effect.runPromise(engine.view(id));
        const [first] = v.state.attempts;
        assert.deepEqual(
          [first?.ended, first?.reason, first?.stated, first?.closeout],
          ['succeeded', 'harness', false, undefined],
          'ended as quiet ends, and said to have stated nothing: the fact the orchestrator reads as unsigned',
        );
        assert.deepEqual(claude.rows(), [], 'its session let go');

        await Effect.runPromise(engine.tick());
        assert.equal((await Effect.runPromise(engine.view(id))).state.attempts.length, 1, 'no attempt follows');
        assert.equal(claude.spawns().length, 1, 'nothing continued, and nobody told a nudge');
        assert.equal(await settledNote(engine, id), undefined);
      });
    },
  );

  await t.test('a task that asked for no closeout ends on quiet as it always did: succeeded, and nothing continued', async () => {
    const claude = fakeClaude();
    await onPath(claude.bin, async () => {
      const root = tmp('root');
      const engine = builtEngine(Engine.layer({ root }));
      const id = await Effect.runPromise(engine.file({ config: { background: true }, brief: 'the prompt', cwd: tmp('cwd') }));
      await Effect.runPromise(engine.tick());
      const [row] = claude.rows();
      wrote(row.sessionId, await begun(engine, id), 10 * MINUTES, prompt('the prompt'), says('msg_1', 'Done.'));
      await seenFor(root, row.name, row.sessionId, 10 * MINUTES);
      claude.set(row.name, { startedAt: Date.now() - 20 * MINUTES });

      await Effect.runPromise(engine.tick());
      const v = await Effect.runPromise(engine.view(id));
      assert.equal(v.state.settled, 'succeeded');
      assert.deepEqual(
        v.state.attempts.map((a) => [a.ended, a.reason]),
        [['succeeded', 'harness']],
      );
      assert.equal(claude.spawns().length, 1, 'nothing continued');
    });
  });

  await t.test(
    "quiet after a statement of its own succeeds with it; quiet after only its parent's statement, resumed, has stated nothing",
    async () => {
      const claude = fakeClaude();
      await onPath(claude.bin, async () => {
        const root = tmp('root');
        const engine = builtEngine(Engine.layer({ root }));

        const said = await Effect.runPromise(
          engine.file({ config: { background: true }, brief: 'the prompt', cwd: tmp('cwd'), closeoutSchema: SCHEMA }),
        );
        await Effect.runPromise(engine.tick());
        const [row] = claude.rows();
        wrote(row.sessionId, await begun(engine, said), 10 * MINUTES, prompt('the prompt'), closes('msg_1', { outcome: 'done' }));
        await seenFor(root, row.name, row.sessionId, 10 * MINUTES);
        claude.set(row.name, { startedAt: Date.now() - 20 * MINUTES });
        await Effect.runPromise(engine.tick());
        const v = await Effect.runPromise(engine.view(said));
        assert.equal(v.state.settled, 'succeeded');
        assert.deepEqual(v.state.attempts[0]?.closeout, { outcome: 'done' });
        assert.equal(v.state.attempts[0]?.stated, true);

        const inherited = await Effect.runPromise(
          engine.file({
            config: { background: true },
            brief: 'go on',
            cwd: tmp('cwd'),
            closeoutSchema: SCHEMA,
            resumeFrom: row.sessionId,
          }),
        );
        await Effect.runPromise(engine.tick());
        const other = claude.rows().find((r) => r.name === `ae/${inherited}/1`)!;
        assert.equal(other.sessionId, row.sessionId, "resumed into its parent's transcript, which ends on the parent's statement");
        claude.set(other.name, { startedAt: Date.now() - 20 * MINUTES });
        await seenFor(root, other.name, other.sessionId, 10 * MINUTES);
        await Effect.runPromise(engine.tick());
        const w = await Effect.runPromise(engine.view(inherited));
        assert.equal(w.state.attempts[0]?.stated, false, "a parent's statement is not this attempt's");
        assert.equal(
          w.state.attempts[0]?.closeout,
          undefined,
          "and no closeout: its transcript holds only its parent's conversation, statement included, under the call id its spawn recorded",
        );
      });
    },
  );

  await t.test(
    "THE HARNESS'S `done` without a statement is said to have stated nothing too, for a task that asked for one: the second door, reported — and a task that asked for nothing is told of nothing",
    async () => {
      const claude = fakeClaude();
      await onPath(claude.bin, async () => {
        const engine = builtEngine(Engine.layer({ root: tmp('root') }));
        const asked = await Effect.runPromise(
          engine.file({ config: { background: true }, brief: 'the prompt', cwd: tmp('cwd'), closeoutSchema: SCHEMA }),
        );
        const nothing = await Effect.runPromise(engine.file({ config: { background: true }, brief: 'the prompt', cwd: tmp('cwd') }));
        await Effect.runPromise(engine.tick());
        for (const row of claude.rows()) {
          wrote(row.sessionId, await begun(engine, row.name.split('/')[1]), 0, prompt('the prompt'), says('msg_1', 'I have finished.'));
          claude.set(row.name, { state: 'done' });
        }
        await Effect.runPromise(engine.tick());

        const v = await Effect.runPromise(engine.view(asked));
        assert.deepEqual(
          v.state.attempts.map((a) => [a.ended, a.reason, a.closeout, a.stated]),
          [['succeeded', 'harness', undefined, false]],
          'it never said it had finished, and the record says so',
        );

        const w = await Effect.runPromise(engine.view(nothing));
        assert.equal(w.state.settled, 'succeeded', "the harness's word is the only end a task that asked for nothing has");
        assert.deepEqual(
          w.state.attempts.map((a) => [a.ended, a.reason]),
          [['succeeded', 'harness']],
        );
        assert.equal('stated' in w.state.attempts[0], false);
      });
    },
  );
});
