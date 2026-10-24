/**
 * A session held by something that is not the work, at shipped defaults — a fake `claude` that keeps a registry, and
 * a transcript file where Claude Code keeps one.
 *
 * A session that signs off with `StructuredOutput` and leaves a `run_in_background` loop running is listed busy by the
 * registry, and its transcript stays exactly as its closing turn left it. `busy` stops the runner reading a statement, and
 * stops `closedOut` acting on one, so the last word in the conversation answers the question `busy` cannot: a session
 * whose own closeout is the last thing in it, and which has written nothing since for the quiescence floor, has finished,
 * whatever its process is still doing.
 *
 * Claude Code's registration has a word of its own, `shell`, for a session held by a background shell, beside `busy`,
 * `idle` and `waiting`. It is not a turn, so the quiescence floor ends such a session, closeout or not.
 */
import { Effect } from 'effect';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';
import { seenFor } from './sighting.ts';

const tmp = (label: string) => scratch(`ae-shell-${label}-`);

/** Where Claude Code keeps transcripts: read when the runner is loaded, so set before the runner's import. */
const config = tmp('config');
process.env.CLAUDE_CONFIG_DIR = config;
const { Engine } = await import('../src/index.ts');

const { builtEngine } = await import('./engine.ts');

type Row = { name: string; sessionId: string; state: string; status: string; startedAt: number };

const MINUTES = 60_000;
const SCHEMA = { type: 'object', properties: { outcome: { type: 'string' } } };

/**
 * A fake `claude`. `agents` prints its rows; `--bg --name <n>` adds one, working and **busy** — a session with a
 * background shell of its own, as the registry lists it; `stop` and `rm` take a short id.
 */
const fakeClaude = () => {
  const bin = tmp('bin');
  const registry = path.join(bin, 'registry.json');
  fs.writeFileSync(registry, '[]');
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
  rows.push({ name: args[args.indexOf('--name') + 1], sessionId: require('node:crypto').randomUUID(), state: 'working', status: 'busy', kind: 'background', startedAt: Date.now() });
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

/**
 * Lines appended to the session's transcript, each stamped `at`, then its mtime put back `ago` milliseconds.
 *
 * `at` is a moment after the attempt began on the journal (`begun`), not `ago`: a statement made before its attempt
 * began is one the session inherited. How long the session has been quiet is the file's mtime, which is what `ago` moves.
 */
const wrote = (sessionId: string, at: number, ago: number, ...entries: object[]) => {
  const file = path.join(config, 'projects', 'fake-project', `${sessionId}.jsonl`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const timestamp = new Date(at).toISOString();
  fs.appendFileSync(file, entries.map((e) => `${JSON.stringify({ sessionId, timestamp, ...e })}\n`).join(''));
  const back = new Date(Date.now() - ago);
  fs.utimesSync(file, back, back);
};
/** When the journal says the task's first attempt began, in milliseconds since the epoch. */
const begun = async (engine: ReturnType<typeof builtEngine>, id: string) =>
  Date.parse((await Effect.runPromise(engine.view(id))).state.attempts[0]?.startedAt ?? '');
const prompt = (content: string) => ({ type: 'user', message: { role: 'user', content } });
const says = (id: string, text: string) => ({ type: 'assistant', message: { id, role: 'assistant', content: [{ type: 'text', text }] } });
/** A closing turn as Claude Code writes one: the call, its attachment, its result, and the turn's duration. */
const closingTurn = (id: string, payload: object) => [
  {
    type: 'assistant',
    message: { id, role: 'assistant', content: [{ type: 'tool_use', id: `tu_${id}`, name: 'StructuredOutput', input: payload }] },
  },
  { attachment: { type: 'structured_output', data: payload } },
  {
    type: 'user',
    message: {
      role: 'user',
      content: [{ tool_use_id: `tu_${id}`, type: 'tool_result', content: 'Structured output provided successfully' }],
    },
  },
  { type: 'system', subtype: 'turn_duration', durationMs: 11_545 },
];

test('a session held by a background shell, at shipped defaults: its own closeout as the last word of a cold transcript ends it, an advancing one or none does not', async (t) => {
  await t.test(
    'a session held busy by a background shell, its closeout the last word in its transcript, is read as quiet: its closeout is recorded, the task settles, and the session is let go',
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
        assert.equal(row?.status, 'busy', 'its process is doing something: the shell it left running');
        const began = await begun(engine, id);

        wrote(row.sessionId, began + 1, 10 * MINUTES, prompt('the prompt'), ...closingTurn('msg_1', { outcome: 'done' }));
        await seenFor(root, row.name, row.sessionId, 10 * MINUTES);
        claude.set(row.name, { startedAt: began - 20 * MINUTES });
        await Effect.runPromise(engine.tick());

        const v = await Effect.runPromise(engine.view(id));
        assert.equal(v.state.settled, 'succeeded');
        assert.deepEqual(
          v.state.attempts[0]?.closeout,
          { outcome: 'done' },
          'the closeout on the record, seventy minutes earlier than a person could have read it',
        );
        assert.equal(v.state.attempts[0]?.reason, 'harness');
        assert.deepEqual(claude.rows(), [], 'and the session let go, which is what ends the shell');
      });
    },
  );

  await t.test(
    'a session held busy whose transcript is still advancing is left alone — nothing about a working session is quiet',
    async () => {
      const claude = fakeClaude();
      await onPath(claude.bin, async () => {
        const engine = builtEngine(Engine.layer({ root: tmp('root') }));
        const id = await Effect.runPromise(
          engine.file({ config: { background: true }, brief: 'the prompt', cwd: tmp('cwd'), closeoutSchema: SCHEMA }),
        );
        await Effect.runPromise(engine.tick());
        const [row] = claude.rows();
        const began = await begun(engine, id);

        wrote(row.sessionId, began + 1, 1_000, prompt('the prompt'), ...closingTurn('msg_1', { outcome: 'done' }));
        claude.set(row.name, { startedAt: began - 20 * MINUTES });
        await Effect.runPromise(engine.tick());

        const v = await Effect.runPromise(engine.view(id));
        assert.equal(v.state.settled, null, 'still running');
        assert.equal(v.state.attempts[0]?.ended, null, 'a statement given a second ago, which it may yet revise, ends nothing');
        assert.equal(claude.rows().length, 1, 'and its session untouched');
      });
    },
  );

  await t.test(
    'a session held busy that gave no closeout is left where it was: the existing rule takes it once the registry lists it idle',
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
        const began = await begun(engine, id);

        wrote(row.sessionId, began + 1, 10 * MINUTES, prompt('the prompt'), says('msg_1', 'I have finished.'));
        await seenFor(root, row.name, row.sessionId, 10 * MINUTES);
        claude.set(row.name, { startedAt: began - 20 * MINUTES });
        await Effect.runPromise(engine.tick());
        assert.equal(
          (await Effect.runPromise(engine.view(id))).state.attempts[0]?.ended,
          null,
          'a busy session with nothing said is not quiet',
        );

        claude.set(row.name, { status: 'idle' });
        await Effect.runPromise(engine.tick());
        const v = await Effect.runPromise(engine.view(id));
        assert.deepEqual(
          [v.state.attempts[0]?.ended, v.state.attempts[0]?.stated],
          ['succeeded', false],
          'idle, the quiescence floor reads it quiet with no statement: `stated: false`, which the layer above reads as unsigned',
        );
      });
    },
  );

  await t.test(
    'a session the registry lists `shell` is not busy at all: the quiescence floor reads it quiet, closeout or not',
    async () => {
      const claude = fakeClaude();
      await onPath(claude.bin, async () => {
        const root = tmp('root');
        const engine = builtEngine(Engine.layer({ root }));
        const id = await Effect.runPromise(
          engine.file({ config: { background: true }, brief: 'the prompt', cwd: tmp('cwd'), closeoutSchema: SCHEMA }),
        );
        const silent = await Effect.runPromise(
          engine.file({ config: { background: true }, brief: 'the prompt', cwd: tmp('cwd'), closeoutSchema: SCHEMA }),
        );
        await Effect.runPromise(engine.tick());
        const row = claude.rows().find((r) => r.name === `ae/${id}/1`)!;
        const quiet = claude.rows().find((r) => r.name === `ae/${silent}/1`)!;
        const began = await begun(engine, id);
        wrote(row.sessionId, began + 1, 10 * MINUTES, prompt('the prompt'), ...closingTurn('msg_1', { outcome: 'done' }));
        claude.set(row.name, { status: 'shell', startedAt: began - 20 * MINUTES });
        wrote(quiet.sessionId, (await begun(engine, silent)) + 1, 10 * MINUTES, prompt('the prompt'), says('msg_2', 'I have finished.'));
        await seenFor(root, quiet.name, quiet.sessionId, 10 * MINUTES);
        claude.set(quiet.name, { status: 'shell', startedAt: began - 20 * MINUTES });
        await Effect.runPromise(engine.tick());

        const v = await Effect.runPromise(engine.view(id));
        assert.equal(v.state.settled, 'succeeded');
        assert.deepEqual(v.state.attempts[0]?.closeout, { outcome: 'done' });
        const w = await Effect.runPromise(engine.view(silent));
        assert.deepEqual(
          [w.state.attempts[0]?.ended, w.state.attempts[0]?.stated],
          ['succeeded', false],
          'and with nothing said, quiet all the same, where a busy one is not',
        );
      });
    },
  );
});
