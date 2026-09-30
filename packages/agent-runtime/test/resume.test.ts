/**
 * A resumed attempt reads its own closeout and its own usage, at shipped defaults — a fake `claude` that
 * keeps a registry, and a transcript file where Claude Code keeps one.
 *
 * `--resume` keeps the session id, so a read of a finished session belongs to its attempt, not to the id: a
 * nudged retry is read from its own start, never handed its first try's statement and usage; and a read taken
 * while the registry lists a session final for one observation — by a `view`, which observes without stepping —
 * is read again once the transcript is newer than it. A transcript's mtime is put back, so that nothing but the
 * attempt keeps one attempt's read from the next. What is checked is what the Promise engine writes on the
 * record. Where Claude Code keeps transcripts is read when the runner is loaded, so `CLAUDE_CONFIG_DIR` is set
 * before the import.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';

const tmp = (label: string) => scratch(`ae-resume-${label}-`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const config = tmp('config');
process.env.CLAUDE_CONFIG_DIR = config;
const { Engine, promiseEngine } = await import('../src/index.ts');

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
/** Entries appended to the session's transcript, each stamped now. */
const append = (sessionId: string, ...entries: object[]) => {
  const file = transcript(sessionId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const timestamp = new Date().toISOString();
  fs.appendFileSync(file, entries.map((e) => `${JSON.stringify({ sessionId, timestamp, ...e })}\n`).join(''));
};
/** Its mtime put back, as if last written `ago` milliseconds ago. */
const age = (sessionId: string, ago: number) => {
  const at = new Date(Date.now() - ago);
  fs.utimesSync(transcript(sessionId), at, at);
};
const TOKENS = { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 90, output_tokens: 5 };
const prompt = (content: string) => ({ type: 'user', message: { role: 'user', content } });
const response = (id: string, ...content: object[]) => ({ type: 'assistant', message: { id, role: 'assistant', content, usage: TOKENS } });
const call = (id: string, name: string, input: object = {}) => ({ type: 'tool_use', id, name, input });

test("a session resumed under the same id is read for its new attempt: its own closeout, not the last one's, and usage since its own start", async () => {
  const claude = fakeClaude();
  await onPath(claude.bin, async () => {
    const engine = promiseEngine(Engine.layer({ root: tmp('root') }));
    const schema = { type: 'object' };

    const first = await engine.file({ config: { background: true }, brief: 'the prompt', cwd: tmp('cwd'), closeoutSchema: schema });
    await engine.tick();
    const [row] = claude.rows();
    await sleep(10);
    append(
      row.sessionId,
      prompt('the prompt'),
      response('msg_1', call('tu_1', 'Read')),
      response('msg_2', call('tu_2', 'StructuredOutput', { outcome: 'done', by: 'first' })),
    );
    age(row.sessionId, 30_000);
    claude.set(row.name, { state: 'done' });
    await engine.tick();
    const [was] = (await engine.view(first)).state.attempts;
    assert.deepEqual(was?.closeout, { outcome: 'done', by: 'first' }, 'the first try, listed done, ends with its closeout');
    assert.deepEqual(
      was?.usage,
      {
        turns: 2,
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

    const retry = await engine.file({
      config: { background: true },
      brief: 'give your closeout',
      cwd: tmp('cwd'),
      closeoutSchema: schema,
      resumeFrom: row.sessionId,
    });
    await engine.tick();
    const [resumed] = claude.rows();
    assert.equal(resumed?.name, `ae/${retry}/1`, 'the retry continues that session');
    assert.equal(resumed?.sessionId, row.sessionId, 'the same id');

    claude.set(resumed.name, { state: 'done' });
    assert.deepEqual(
      (await engine.view(retry)).usage,
      { turns: 0, toolCalls: 0, inputTokens: 0, uncachedTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 0 },
      "nothing since its own start — not the first try's count",
    );

    await sleep(10);
    append(
      row.sessionId,
      prompt('give your closeout'),
      response('msg_3', { type: 'text', text: 'Giving it.' }),
      response('msg_4', call('tu_3', 'Bash')),
      response('msg_5', call('tu_4', 'StructuredOutput', { outcome: 'done', by: 'retry' })),
    );
    await engine.tick();

    const v = await engine.view(retry);
    assert.equal(v.state.settled, 'succeeded');
    const [is] = v.state.attempts;
    assert.deepEqual(is?.closeout, { outcome: 'done', by: 'retry' }, "its own statement, not the first try's");
    assert.notDeepEqual(is?.usage, was?.usage, "not the first try's count");
    assert.deepEqual(
      is?.usage,
      {
        turns: 3,
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
});

test('a statement read as nothing from a final sighting is read again once the transcript has grown, and found', async () => {
  const claude = fakeClaude();
  await onPath(claude.bin, async () => {
    const engine = promiseEngine(Engine.layer({ root: tmp('root') }));
    const id = await engine.file({
      config: { background: true },
      brief: 'the prompt',
      cwd: tmp('cwd'),
      closeoutSchema: { type: 'object' },
    });
    await engine.tick();
    const [row] = claude.rows();
    await sleep(10);
    append(row.sessionId, prompt('the prompt'), response('msg_1', call('tu_1', 'Bash', { run_in_background: true })));
    age(row.sessionId, 30_000);

    claude.set(row.name, { state: 'done' });
    assert.deepEqual(
      (await engine.view(id)).usage,
      {
        turns: 1,
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
    append(row.sessionId, response('msg_2', { type: 'text', text: 'the background task finished' }));
    age(row.sessionId, 30_000);
    assert.equal((await engine.view(id)).usage?.turns, 1, 'no newer than the read: kept');

    append(row.sessionId, response('msg_3', call('tu_2', 'StructuredOutput', { outcome: 'done' })));
    await engine.tick();

    const v = await engine.view(id);
    assert.equal(v.state.settled, 'succeeded');
    const [a] = v.state.attempts;
    assert.deepEqual(a?.closeout, { outcome: 'done' }, 'found, not the nothing read before it was made');
    assert.deepEqual(a?.usage, {
      turns: 3,
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
