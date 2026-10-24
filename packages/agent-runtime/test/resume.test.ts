/**
 * A resumed attempt reads its own closeout and its own usage, at shipped defaults — a fake `claude` that
 * keeps a registry, and a transcript file where Claude Code keeps one.
 *
 * `--resume` keeps the session id, so a read of a finished session belongs to its attempt, not to the id: a
 * nudged retry is read from its own start, never handed its first try's statement and usage; and a read taken
 * while the registry lists a session final for one observation — by a `view`, which observes without stepping —
 * is read again once the transcript is newer than it. A transcript's mtime is put back, so that nothing but the
 * attempt keeps one attempt's read from the next. What is checked is what the engine writes on the
 * record. Where Claude Code keeps transcripts is read when the runner is loaded, so `CLAUDE_CONFIG_DIR` is set
 * before the import.
 */
import { Effect } from 'effect';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';

const tmp = (label: string) => scratch(`ae-resume-${label}-`);

const config = tmp('config');
process.env.CLAUDE_CONFIG_DIR = config;
const { Engine } = await import('../src/index.ts');

const { builtEngine } = await import('./engine.ts');

type Row = { name: string; sessionId: string; state: string; status: string; startedAt: number };

/**
 * A fake `claude`. `agents` prints its rows; `--bg --name <n>` adds one, working and idle, started now —
 * under the id `--resume` names, as Claude Code keeps it, or a new one; `stop` and `rm` take a short id.
 * A test moves a row by hand, as the harness would.
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

const transcript = (sessionId: string) => path.join(config, 'projects', 'fake-project', `${sessionId}.jsonl`);
/** Entries appended to the session's transcript, each stamped `at`, in milliseconds since the epoch. */
const append = (sessionId: string, at: number, ...entries: object[]) => {
  const file = transcript(sessionId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const timestamp = new Date(at).toISOString();
  fs.appendFileSync(file, entries.map((e) => `${JSON.stringify({ sessionId, timestamp, ...e })}\n`).join(''));
};
/** When the journal says the task's first attempt began, in milliseconds since the epoch. */
const begun = async (engine: ReturnType<typeof builtEngine>, id: string) =>
  Date.parse((await Effect.runPromise(engine.view(id))).state.attempts[0]?.startedAt ?? '');
/** Its mtime put back, as if last written `ago` milliseconds ago. */
const age = (sessionId: string, ago: number) => {
  const at = new Date(Date.now() - ago);
  fs.utimesSync(transcript(sessionId), at, at);
};
const TOKENS = { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 90, output_tokens: 5 };
const prompt = (content: string) => ({ type: 'user', message: { role: 'user', content } });
const response = (id: string, ...content: object[]) => ({ type: 'assistant', message: { id, role: 'assistant', content, usage: TOKENS } });
const call = (id: string, name: string, input: object = {}) => ({ type: 'tool_use', id, name, input });

test('a resumed or re-read session at shipped defaults is read for its own attempt: its own statement and usage, read again once its transcript grows', async (t) => {
  await t.test(
    "a session resumed under the same id is read for its new attempt: its own closeout, not the last one's, and usage since its own start",
    async () => {
      const claude = fakeClaude();
      await onPath(claude.bin, async () => {
        const engine = builtEngine(Engine.layer({ root: tmp('root') }));
        const schema = { type: 'object' };

        const first = await Effect.runPromise(
          engine.file({ config: { background: true }, brief: 'the prompt', cwd: tmp('cwd'), closeoutSchema: schema }),
        );
        await Effect.runPromise(engine.tick());
        const [row] = claude.rows();
        const began = await begun(engine, first);
        claude.set(row.name, { startedAt: began });
        append(
          row.sessionId,
          began + 1,
          prompt('the prompt'),
          response('msg_1', call('tu_1', 'Read')),
          response('msg_2', call('tu_2', 'StructuredOutput', { outcome: 'done', by: 'first' })),
        );
        age(row.sessionId, 30_000);
        claude.set(row.name, { state: 'done' });
        await Effect.runPromise(engine.tick());
        const [was] = (await Effect.runPromise(engine.view(first))).state.attempts;
        assert.deepEqual(was?.closeout, { outcome: 'done', by: 'first' }, 'the first try, listed done, ends with its closeout');
        assert.deepEqual(
          was?.usage,
          {
            responses: 2,
            toolCalls: 2,
            inputTokens: 200,
            uncachedTokens: 20,
            cacheWriteTokens: 0,
            cacheReadTokens: 180,
            outputTokens: 10,
            peakContextTokens: 100,
            firstContextTokens: 100,
            firstCacheWriteTokens: 0,
          },
          'the first try ends with its usage: two responses',
        );

        const retry = await Effect.runPromise(
          engine.file({
            config: { background: true },
            brief: 'give your closeout',
            cwd: tmp('cwd'),
            closeoutSchema: schema,
            resumeFrom: row.sessionId,
          }),
        );
        await Effect.runPromise(engine.tick());
        const [resumed] = claude.rows();
        assert.equal(resumed?.name, `ae/${retry}/1`, 'the retry continues that session');
        assert.equal(resumed?.sessionId, row.sessionId, 'the same id');

        const again = Math.max(await begun(engine, retry), began + 1) + 1;
        claude.set(resumed.name, { state: 'done', startedAt: again });
        assert.deepEqual(
          (await Effect.runPromise(engine.view(retry))).usage,
          { responses: 0, toolCalls: 0, inputTokens: 0, uncachedTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 0 },
          "nothing since its own start — not the first try's count",
        );

        append(
          row.sessionId,
          again + 1,
          prompt('give your closeout'),
          response('msg_3', { type: 'text', text: 'Giving it.' }),
          response('msg_4', call('tu_3', 'Bash')),
          response('msg_5', call('tu_4', 'StructuredOutput', { outcome: 'done', by: 'retry' })),
        );
        await Effect.runPromise(engine.tick());

        const v = await Effect.runPromise(engine.view(retry));
        assert.equal(v.state.settled, 'succeeded');
        const [is] = v.state.attempts;
        assert.deepEqual(is?.closeout, { outcome: 'done', by: 'retry' }, "its own statement, not the first try's");
        assert.notDeepEqual(is?.usage, was?.usage, "not the first try's count");
        assert.deepEqual(
          is?.usage,
          {
            responses: 3,
            toolCalls: 2,
            inputTokens: 300,
            uncachedTokens: 30,
            cacheWriteTokens: 0,
            cacheReadTokens: 270,
            outputTokens: 15,
            peakContextTokens: 100,
            firstContextTokens: 100,
            firstCacheWriteTokens: 0,
          },
          'only the responses since its own start',
        );
      });
    },
  );

  await t.test('a statement read as nothing from a final sighting is read again once the transcript has grown, and found', async () => {
    const claude = fakeClaude();
    await onPath(claude.bin, async () => {
      const engine = builtEngine(Engine.layer({ root: tmp('root') }));
      const id = await Effect.runPromise(
        engine.file({
          config: { background: true },
          brief: 'the prompt',
          cwd: tmp('cwd'),
          closeoutSchema: { type: 'object' },
        }),
      );
      await Effect.runPromise(engine.tick());
      const [row] = claude.rows();
      const began = await begun(engine, id);
      claude.set(row.name, { startedAt: began });
      append(row.sessionId, began + 1, prompt('the prompt'), response('msg_1', call('tu_1', 'Bash', { run_in_background: true })));
      age(row.sessionId, 30_000);

      claude.set(row.name, { state: 'done' });
      assert.deepEqual(
        (await Effect.runPromise(engine.view(id))).usage,
        {
          responses: 1,
          toolCalls: 1,
          inputTokens: 100,
          uncachedTokens: 10,
          cacheWriteTokens: 0,
          cacheReadTokens: 90,
          outputTokens: 5,
          peakContextTokens: 100,
          firstContextTokens: 100,
          firstCacheWriteTokens: 0,
        },
        'listed final between two turns, for one observation, and seen only by a view: nothing said yet',
      );
      append(row.sessionId, began + 2, response('msg_2', { type: 'text', text: 'the background task finished' }));
      age(row.sessionId, 30_000);
      assert.equal(
        (await Effect.runPromise(engine.view(id))).usage?.responses,
        2,
        'written after the read, though stamped before it as a wall clock stepped back stamps it: its mtime changed, so read again',
      );

      append(row.sessionId, began + 3, response('msg_3', call('tu_2', 'StructuredOutput', { outcome: 'done' })));
      await Effect.runPromise(engine.tick());

      const v = await Effect.runPromise(engine.view(id));
      assert.equal(v.state.settled, 'succeeded');
      const [a] = v.state.attempts;
      assert.deepEqual(a?.closeout, { outcome: 'done' }, 'found, not the nothing read before it was made');
      assert.deepEqual(a?.usage, {
        responses: 3,
        toolCalls: 2,
        inputTokens: 300,
        uncachedTokens: 30,
        cacheWriteTokens: 0,
        cacheReadTokens: 270,
        outputTokens: 15,
        peakContextTokens: 100,
        firstContextTokens: 100,
        firstCacheWriteTokens: 0,
      });
    });
  });
});
