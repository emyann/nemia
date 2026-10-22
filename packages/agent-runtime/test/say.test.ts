/**
 * Telling a running session something, at shipped defaults — a fake `claude` on PATH that keeps a registry,
 * a real Unix socket standing in for the session's inbox, and the registration Claude Code writes beside it.
 *
 * `say` is a write path into a session a step is running, and the point of it is the trace: the words a person
 * gave a running step are on its record, so a reviewer can tell a change they authorised from a step
 * overstepping. So what is checked is that the words reach the inbox verbatim and land on the journal, and that
 * every refusal refuses — with exit 2, nothing sent and nothing journalled — while a delivery that fails
 * rejects plainly and journals nothing either. The inbox is found where Claude Code registers it: the
 * `messagingSocketPath` of `<config>/sessions/<pid>.json`.
 *
 * - Where Claude Code keeps its registrations is read when a runner is made, and its transcripts when the runner is
 *   loaded, so `CLAUDE_CONFIG_DIR` is pointed here before the import.
 * - A registry that cannot be read is met with a registration by a live process, as Claude Code writes one, so that the
 *   failed listing is the only thing that misses the session: on `claude` the listing reads past a registry that
 *   failed, and its jobs stay seen.
 * - The cases of a session that cannot be found each get a board of their own, so that each case's registration and
 *   inbox are the only ones its engine reads.
 */
import { Effect } from 'effect';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { EngineShape, Event, FeedEntry, Sighting, TaskSpec, TranscriptEvent } from '../src/index.ts';
import { scratch } from './scratch.ts';
import { until, WAITED, type Waiter } from '../src/waits/index.ts';
import { instantNow } from '../src/core/engine/now.ts';
import { elapsedMs } from '../src/core/clock.ts';
import type { AsyncJournal, AsyncRunner } from './promise-runner.ts';

const tmp = (label: string) => scratch(`ae-say-${label}-`);

const config = tmp('config');
process.env.CLAUDE_CONFIG_DIR = config;
const sessions = path.join(config, 'sessions');
const { Engine: EngineService } = await import('../src/index.ts');
const { asyncStore, asyncOps } = await import('./promise-runner.ts');
const { builtEngine } = await import('./engine.ts');
const { claudeInbox, claudeInboxLine, claudeInboxPost, inboxSocketRefuses, processStart, CLAUDE_INBOX_LINE_MAX } =
  await import('../src/harness/claude/inbox.ts');

type Row = { name: string; sessionId: string; state: string; status: string; startedAt: number; pid?: number };

/**
 * A fake `claude`. `agents` prints its rows, each with a `pid`, busy, as a session at work is listed; `--bg --name <n>`
 * adds one; `stop` and `rm` do what they do. `-p`, a job, reads its stdin a line at a time, as Claude Code does, and writes
 * each line to `<bin>/<brief>.stdin`, the brief being its first line's words; told `finish`, it prints its result, and
 * exits once its stdin ends — told `finish and linger`, not for a minute. While `<bin>/agents-fails` exists, `agents` fails.
 */
const fakeClaude = () => {
  const bin = tmp('bin');
  const registry = path.join(bin, 'registry.json');
  const agentsFails = path.join(bin, 'agents-fails');
  fs.writeFileSync(registry, '[]');
  fs.writeFileSync(
    path.join(bin, 'claude'),
    `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const rows = JSON.parse(fs.readFileSync(${JSON.stringify(registry)}, 'utf8'));
const save = () => fs.writeFileSync(${JSON.stringify(registry)}, JSON.stringify(rows));
if (args[0] === 'agents') {
  if (fs.existsSync(${JSON.stringify(agentsFails)})) { process.stderr.write('could not read the registry\\n'); process.exit(1); }
  process.stdout.write(JSON.stringify(rows)); process.exit(0);
}
if (args[0] === 'stop' || args[0] === 'rm') {
  const at = rows.findIndex((r) => r.sessionId.split('-')[0] === args[1]);
  if (at === -1) { process.stderr.write("No job matching '" + args[1] + "'\\n"); process.exit(1); }
  if (args[0] === 'stop') rows[at].state = 'stopped'; else rows.splice(at, 1);
  save();
  process.exit(0);
}
if (args[0] === '-p') {
  setTimeout(() => process.exit(0), 60_000);
  let got = '', brief, linger = false;
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => {
    got += d;
    for (let nl = got.indexOf('\\n'); nl !== -1; nl = got.indexOf('\\n')) {
      const line = got.slice(0, nl);
      got = got.slice(nl + 1);
      const words = JSON.parse(line).message.content;
      brief ??= words;
      fs.appendFileSync(require('node:path').join(${JSON.stringify(bin)}, brief + '.stdin'), line + '\\n');
      if (words === 'finish' || words === 'finish and linger') {
        linger = words === 'finish and linger';
        process.stdout.write(JSON.stringify({ subtype: 'success', is_error: false, result: 'done', type: 'result' }) + '\\n');
      }
    }
  });
  process.stdin.on('end', () => { if (!linger) process.exit(0); });
}
if (args[0] === '--bg') {
  rows.push({ name: args[args.indexOf('--name') + 1], sessionId: require('node:crypto').randomUUID(), state: 'working', status: 'busy', kind: 'background', startedAt: Date.now(), cwd: process.cwd(), pid: 900000 + rows.length });
  save();
}
`,
    { mode: 0o755 },
  );
  return {
    bin,
    rows: () => JSON.parse(fs.readFileSync(registry, 'utf8')) as Row[],
    setRows: (rows: Row[]) => fs.writeFileSync(registry, JSON.stringify(rows)),
    agentsFails: (fails: boolean) => (fails ? fs.writeFileSync(agentsFails, '') : fs.rmSync(agentsFails, { force: true })),
    /** What the job whose brief is `brief` has read on its stdin, a user message a line; none before it has started. */
    stdin: (brief: string) => {
      try {
        return fs
          .readFileSync(path.join(bin, `${brief}.stdin`), 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((l) => JSON.parse(l) as { type: string; message: { role: string; content: string } });
      } catch {
        return undefined;
      }
    },
  };
};

const fake = fakeClaude();
process.env.PATH = `${fake.bin}:${process.env.PATH}`;
const work = tmp('work');

const { STAND_IN } = await import('./attached-held.ts');

/**
 * The stand-in Claude Code a job runs on the Agent SDK, and the folder it writes what it saw into: a job is no `claude`
 * command line, so what reached its session is read here (`said.jsonl`) rather than off the fake `claude`'s stdin. Its plan
 * holds every turn at the file `end` and works each message as a turn of its own, so a job stays at work while it is told
 * things — and goes on running after its first result, which is the state a word said too late is refused in.
 */
const STAND_IN_PLAN = { id: '5e551011-0000-4000-8000-0000000000aa', turns: 'many', hold: true };

/** What the session whose stand-in writes into `dir` was told, in order: every user message it read. */
const toldIn = (dir: string): string[] | undefined => {
  try {
    return fs
      .readFileSync(path.join(dir, 'said.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as string);
  } catch {
    return undefined;
  }
};

/**
 * A session's inbox: a Unix socket that reads each connection's lines, answers nothing, and closes its end once the
 * sender has, as Claude Code's does. `neverCloses` reads the line and keeps its end open, as a process busy past the
 * post's deadline would; `neverReads` takes the connection and reads nothing. `heard(n)` resolves with the lines once the
 * inbox has read `n` of them, on the connection's end where it reads them.
 */
const inbox = async (o: { neverCloses?: boolean; neverReads?: boolean } = {}) => {
  const at = path.join(tmp('sock'), 'in.sock');
  const lines: Array<{ type?: string; session_id?: string; message?: { role?: string; content?: string } }> = [];
  const open = new Set<net.Socket>();
  const waiting: Array<{ n: number; resolve: (got: typeof lines) => void }> = [];
  const heard = (n: number) =>
    new Promise<typeof lines>((resolve) => {
      if (lines.length >= n) resolve(lines);
      else waiting.push({ n, resolve });
    });
  const server = net.createServer({ allowHalfOpen: true, pauseOnConnect: o.neverReads === true }, (c) => {
    open.add(c);
    c.on('close', () => open.delete(c));
    if (o.neverReads) return;
    let got = '';
    c.setEncoding('utf8');
    c.on('data', (d) => {
      got += d;
    });
    c.on('end', () => {
      for (const l of got.split('\n')) if (l.trim()) lines.push(JSON.parse(l));
      for (const due of waiting.filter((w) => lines.length >= w.n)) {
        waiting.splice(waiting.indexOf(due), 1);
        due.resolve(lines);
      }
      if (!o.neverCloses) c.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(at, resolve));
  server.unref();
  return {
    path: at,
    lines,
    heard,
    close: () =>
      new Promise<void>((resolve) => {
        for (const c of open) c.destroy();
        server.close(() => resolve());
      }),
  };
};

/** The registration Claude Code writes for a running session, by its pid. */
const register = (row: Row, fields: Record<string, unknown>) => {
  fs.mkdirSync(sessions, { recursive: true });
  fs.writeFileSync(
    path.join(sessions, `${row.pid}.json`),
    JSON.stringify({ pid: row.pid, sessionId: row.sessionId, name: row.name, kind: 'bg', ...fields }),
  );
};

/**
 * A task filed and ticked once, so its session is listed working — and, unless told not to, registered with an inbox. A
 * background session: at shipped defaults a Claude task is a job, which is told on its stdin (`job`, below).
 */
const running = async (engine: EngineShape, spec: Partial<TaskSpec> = {}, withInbox = true) => {
  const id = await Effect.runPromise(
    engine.file({ brief: 'do the work', cwd: work, ...spec, config: { background: true, ...spec.config } }),
  );
  await Effect.runPromise(engine.tick());
  const row = fake.rows().find((r) => r.name === `ae/${id}/1`)!;
  assert.ok(row, 'the fake listed the session');
  const box = await inbox();
  if (withInbox) register(row, { messagingSocketPath: box.path });
  return { id, row, box };
};

const entries = async (engine: EngineShape, id: string) => (await Effect.runPromise(engine.feed(0))).entries.filter((e) => e.taskId === id);

type Refusal = Error & { _tag?: string };

/** Refused: `SayRefused`, the sentence matched, and neither the journal nor the inbox moved. */
const refused = async (engine: EngineShape, id: string, text: string, pattern: RegExp, box?: { lines: unknown[] }) => {
  const before = (await entries(engine, id)).length;
  const heard = box?.lines.length ?? 0;
  await assert.rejects(Effect.runPromise(engine.say(id, text)), (e: Refusal) => {
    assert.equal(e._tag, 'SayRefused', e.message);
    assert.match(e.message, pattern);
    return true;
  });
  assert.equal((await entries(engine, id)).length, before, 'nothing journalled');
  if (box) assert.equal(box.lines.length, heard, 'nothing sent');
};

/** Failed: `SayUnsent` — not a refusal, so ask again — the sentence matched, and nothing journalled. */
const failed = async (engine: EngineShape, id: string, pattern: RegExp) => {
  const before = (await entries(engine, id)).length;
  await assert.rejects(Effect.runPromise(engine.say(id, 'are you there')), (e: Refusal) => {
    assert.equal(e._tag, 'SayUnsent', e.message);
    assert.match(e.message, pattern);
    return true;
  });
  assert.equal((await entries(engine, id)).length, before, 'nothing journalled');
  assert.deepEqual((await Effect.runPromise(engine.view(id))).state.said, []);
};

test("at shipped defaults, say hands the words verbatim to the running session's inbox, addressed to its session, then journals them", async () => {
  const engine = builtEngine(EngineService.layer({ root: tmp('board') }));
  const { id, row, box } = await running(engine);
  const text = 'Widen the scope to `apps/api` too.\nAnd answer: yes, "keep" the old route — ça va.';

  const said = await Effect.runPromise(engine.say(id, text));

  assert.deepEqual(
    await box.heard(1),
    [{ type: 'user', session_id: row.sessionId, message: { role: 'user', content: text } }],
    'one line, the words as given, for this session',
  );
  assert.equal(said.attempt, 1);
  assert.equal(said.text, text);
  assert.ok(Number.isFinite(Date.parse(said.at)), 'dated');
  assert.deepEqual((await Effect.runPromise(engine.view(id))).state.said, [said], 'view carries it');
  const last = (await entries(engine, id)).at(-1)!.event;
  assert.deepEqual(last, { kind: 'said', ...said }, 'and the feed has it, last');

  const again = await Effect.runPromise(engine.say(id, 'and the web app'));
  assert.deepEqual(
    (await Effect.runPromise(engine.view(id))).state.said.map((s) => s.text),
    [text, 'and the web app'],
    'said twice, journalled twice, in order: the record keeps what a person did, not what is new',
  );
  assert.equal(again.attempt, 1);
  assert.equal((await box.heard(2)).length, 2);
  await box.close();
});

test('a session its harness lists blocked is running, and its inbox is handed the words as a working one is', async () => {
  const engine = builtEngine(EngineService.layer({ root: tmp('board') }));
  const { id, row, box } = await running(engine);
  fake.setRows(fake.rows().map((r) => (r.sessionId === row.sessionId ? { ...r, state: 'blocked', status: 'idle' } : r)));
  await Effect.runPromise(engine.say(id, 'you may run the migration'));
  assert.equal((await box.heard(1)).length, 1);
  assert.equal((await Effect.runPromise(engine.view(id))).state.said.length, 1);
  await box.close();
});

test('a task journalled on claude before a job was its default runs --bg with no background in its config, and hears the words', async () => {
  const root = tmp('board');
  const engine = builtEngine(EngineService.layer({ root }));
  const { id, box } = await running(engine);
  const journal = path.join(root, 'tasks', `${id}.jsonl`);
  const [filed, ...rest] = fs.readFileSync(journal, 'utf8').split('\n');
  const event = JSON.parse(filed);
  delete event.config.background;
  fs.writeFileSync(journal, [JSON.stringify(event), ...rest].join('\n'));
  assert.equal((await Effect.runPromise(engine.view(id))).state.config?.background, undefined, 'the record names no mode');

  await Effect.runPromise(engine.say(id, 'and the web app'));
  assert.equal((await box.heard(1)).length, 1, 'the words reached its inbox');
  assert.equal((await Effect.runPromise(engine.view(id))).state.said.length, 1);
  await box.close();
});

/** What `read` answers, in test `t`, once it answers anything: read again every 50ms. */
const heard = <T>(t: Waiter, read: () => T | undefined | Promise<T | undefined>, what: string) => until(t, read, what, { everyMs: 50 });

/** A job filed at shipped defaults — no `background` — and ticked until its harness has read its brief on its stdin, in test `t`. */
const job = async (t: Waiter, engine: EngineShape, brief: string, spec: Partial<TaskSpec> = {}) => {
  const dir = tmp(`stand-in-${brief}`);
  const id = await Effect.runPromise(
    engine.file({
      brief,
      cwd: work,
      ...spec,
      config: { ...spec.config, env: { STANDIN_DIR: dir, STANDIN_PLAN: JSON.stringify(STAND_IN_PLAN) } },
    }),
  );
  await Effect.runPromise(engine.tick());
  await heard(t, () => (toldIn(dir)?.includes(brief) ? true : undefined), `${brief} read its brief`);
  return { id, told: () => toldIn(dir)!, letGo: () => fs.writeFileSync(path.join(dir, 'end'), '') };
};

test(
  'at shipped defaults, a job is told on its stdin: the words, verbatim, as the next user message after its brief — then journalled',
  WAITED,
  async (t) => {
    const engine = builtEngine(EngineService.layer({ root: tmp('board'), claudeExecutable: STAND_IN }));
    const { id, told } = await job(t, engine, 'job-told');
    const text = 'Widen the scope to `apps/api` too.\nAnd answer: yes, "keep" the old route — ça va.';

    const said = await Effect.runPromise(engine.say(id, text));
    assert.equal(said.attempt, 1);
    assert.deepEqual((await Effect.runPromise(engine.view(id))).state.said, [said], 'journalled');
    const read = await heard(t, () => (told().length > 1 ? told() : undefined), 'the words on its input');
    assert.deepEqual(read, ['job-told', text], 'one message each, a line break in the words kept inside theirs');

    await Effect.runPromise(engine.say(id, 'and the web app'));
    await heard(t, () => (told().length === 3 ? true : undefined), 'the second words');
    assert.equal(told()[2], 'and the web app', 'in the order they were said');
    await Effect.runPromise(engine.stop(id));
    await Effect.runPromise(engine.tick());
  },
);

test(
  "a job in bypassPermissions is told: what Claude Code's inbox holds for an approval is a background session's, and a job has no inbox",
  WAITED,
  async (t) => {
    const engine = builtEngine(EngineService.layer({ root: tmp('board'), claudeExecutable: STAND_IN }));
    const { id, told } = await job(t, engine, 'job-bypass', { config: { permissionMode: 'bypassPermissions' } });
    await Effect.runPromise(engine.say(id, 'carry on'));
    await heard(t, () => (told().length === 2 ? true : undefined), 'the words on its input');
    assert.equal((await Effect.runPromise(engine.view(id))).state.said.length, 1);
    await Effect.runPromise(engine.stop(id));
    await Effect.runPromise(engine.tick());
  },
);

/** Whether the worker of `runFile` has closed its session's input and written the state it ended on: nothing writes it after. */
const workerDone = (runFile: string): true | undefined => {
  const run = JSON.parse(fs.readFileSync(runFile, 'utf8')) as { inputClosed?: boolean; state?: string };
  return run.inputClosed === true && run.state !== 'working' ? true : undefined;
};

/**
 * The run of `runFile` written as it stands when its worker has closed the session's input and its process has not exited yet: a
 * job on the SDK leaves its result and ends with it, so there is no window to wait for. The rule under test is the worker's —
 * that a word said after the harness's closing line is refused rather than appended for nobody — and it is read off this file.
 *
 * Written once `workerDone` says the worker has written its last state, or that write lands on top of this one and the say is
 * refused for a session that has ended, which is another rule.
 *
 * @returns the file as it was, to write back once the rule has been read
 */
const withInputClosed = (runFile: string): string => {
  const was = fs.readFileSync(runFile, 'utf8');
  const run = JSON.parse(was) as Record<string, unknown>;
  fs.writeFileSync(runFile, JSON.stringify({ ...run, state: 'working', inputClosed: true, exitCode: undefined }));
  return was;
};

test(
  'a job that has given its result reads nothing more: words said before it exits are rejected, not journalled — and once it has settled, refused',
  WAITED,
  async (t) => {
    const root = tmp('board');
    const engine = builtEngine(EngineService.layer({ root, claudeExecutable: STAND_IN }));
    const { id, told, letGo } = await job(t, engine, 'job-lingers');
    await Effect.runPromise(engine.say(id, 'finish and linger'));
    await heard(t, () => (told().length === 2 ? true : undefined), 'the words on its input');
    letGo();
    const workerFile = (ext: string) => path.join(root, 'runs', 'claude', `ae/${id}/1`.replace(/[^a-zA-Z0-9]+/g, '_') + ext);
    const runFile = workerFile('.json');
    await heard(t, () => workerDone(runFile), 'its input closed at its result, and its worker done writing');
    assert.deepEqual(
      (await Effect.runPromise(engine.view(id))).state.said.map((s) => s.text),
      ['finish and linger'],
      'the words said before its result are the only ones journalled',
    );
    assert.equal(told().length, 2, 'and the only ones its session read');

    const was = withInputClosed(runFile);
    const before = fs.readFileSync(workerFile('.inbox.jsonl'), 'utf8');
    await assert.rejects(
      Effect.runPromise(engine.say(id, 'one more thing')),
      (e: Refusal) => {
        assert.equal(e._tag, 'SayUnsent', e.message);
        assert.match(e.message, /has given its result and reads no more words/);
        return true;
      },
      "its harness lists it working, so this is the worker's word, not the engine's: unsent, no refusal",
    );
    assert.deepEqual(
      (await Effect.runPromise(engine.view(id))).state.said.map((s) => s.text),
      ['finish and linger'],
      'nothing more journalled',
    );
    assert.equal(fs.readFileSync(workerFile('.inbox.jsonl'), 'utf8'), before, 'nothing appended');
    assert.equal(before.split('\n').filter(Boolean).length, 1);
    fs.writeFileSync(runFile, was);

    await Effect.runPromise(engine.stop(id));
    for (let i = 0; i < 20 && !(await Effect.runPromise(engine.view(id))).state.settled; i++) {
      await Effect.runPromise(engine.tick());
      await new Promise((r) => setTimeout(r, 50));
    }
    await refused(engine, id, 'hello', /has settled/);
  },
);

test('refused: empty words, and words that are only whitespace', async () => {
  const engine = builtEngine(EngineService.layer({ root: tmp('board') }));
  const { id, box } = await running(engine);
  await refused(engine, id, '', /`text` is empty/, box);
  await refused(engine, id, ' \n\t ', /`text` is empty/, box);
  await box.close();
});

test('refused: a task the engine has no record of', async () => {
  const engine = builtEngine(EngineService.layer({ root: tmp('board') }));
  await refused(engine, 'no-such-task', 'hello', /`no-such-task` is not a task on this board/);
});

test('refused: a Codex task, in its own words — `codex exec` takes nothing while it runs', async () => {
  const engine = builtEngine(EngineService.layer({ root: tmp('board') }));
  const id = await Effect.runPromise(engine.file({ brief: 'review', cwd: work, harness: 'codex' }));
  await refused(engine, id, 'hello', /`codex exec` reads its prompt once and takes nothing while it runs/);
});

test('refused: a claude-detached task, in its own words — no session id to address until it exits', async () => {
  const engine = builtEngine(EngineService.layer({ root: tmp('board') }));
  const id = await Effect.runPromise(engine.file({ brief: 'review', cwd: work, harness: 'claude-detached' }));
  await refused(engine, id, 'hello', /learns its session's id only from what it prints as it exits/);
});

test('refused: a Claude task in bypassPermissions, though its session runs and has an inbox — the words would wait for an approval nobody gives', async () => {
  const engine = builtEngine(EngineService.layer({ root: tmp('board') }));
  const { id, box } = await running(engine, { config: { permissionMode: 'bypassPermissions' } });
  await refused(engine, id, 'hello', /permissionMode: bypassPermissions`, and Claude Code holds a message/, box);
  await box.close();
});

test('refused: a task journalled on claude before a job was its default, in bypassPermissions — known for a background session once its harness lists it', async () => {
  const root = tmp('board');
  const engine = builtEngine(EngineService.layer({ root }));
  const { id, box } = await running(engine, { config: { permissionMode: 'bypassPermissions' } });
  const journal = path.join(root, 'tasks', `${id}.jsonl`);
  const [filed, ...rest] = fs.readFileSync(journal, 'utf8').split('\n');
  const event = JSON.parse(filed);
  delete event.config.background;
  fs.writeFileSync(journal, [JSON.stringify(event), ...rest].join('\n'));
  await refused(engine, id, 'hello', /permissionMode: bypassPermissions`, and Claude Code holds a message/, box);
  await box.close();
});

test("refused: words longer than Claude Code's inbox reads", async () => {
  const engine = builtEngine(EngineService.layer({ root: tmp('board') }));
  const { id, box } = await running(engine);
  await refused(engine, id, 'x'.repeat(CLAUDE_INBOX_LINE_MAX), /inbox drops a line over 1048576/, box);
  await box.close();
});

test('refused: a task that has not started an attempt', async () => {
  const engine = builtEngine(EngineService.layer({ root: tmp('board') }));
  const id = await Effect.runPromise(engine.file({ brief: 'queued', cwd: work, config: { background: true } }));
  await refused(engine, id, 'hello', /has not started an attempt yet/);
});

test('refused: a task that has settled', async () => {
  const engine = builtEngine(EngineService.layer({ root: tmp('board') }));
  const { id, row, box } = await running(engine);
  fake.setRows(fake.rows().map((r) => (r.sessionId === row.sessionId ? { ...r, state: 'done' } : r)));
  for (let i = 0; i < 5 && !(await Effect.runPromise(engine.view(id))).state.settled; i++) await Effect.runPromise(engine.tick());
  assert.equal((await Effect.runPromise(engine.view(id))).state.settled, 'succeeded');
  await refused(engine, id, 'hello', /has settled \(succeeded\).*`resumeFrom`/, box);
  await box.close();
});

test('refused: a task asked to stop, before its session has', async () => {
  const engine = builtEngine(EngineService.layer({ root: tmp('board') }));
  const { id, box } = await running(engine);
  await Effect.runPromise(engine.stop(id));
  await refused(engine, id, 'hello', /has been asked to stop/, box);
  await box.close();
});

test('refused: an attempt that has ended on a task that has not settled — one held open between turns, where nothing runs to hear anything until a person answers it', async () => {
  const engine = builtEngine(EngineService.layer({ root: tmp('board') }));
  const { id, row, box } = await running(engine, { holdOpen: true, closeoutSchema: { type: 'object' } });
  fake.setRows(fake.rows().map((r) => (r.sessionId === row.sessionId ? { ...r, state: 'done' } : r)));
  await Effect.runPromise(engine.tick());
  const { state } = await Effect.runPromise(engine.view(id));
  assert.deepEqual(
    state.attempts.map((a) => a.ended),
    ['done'],
    'the end is written',
  );
  assert.equal(state.settled, null, 'and the task waits');
  await refused(engine, id, 'hello', /has no attempt running: attempt 1 ended `done`/, box);
  await box.close();
});

test('refused: an attempt its harness does not list, and one it lists as no longer running', async () => {
  const engine = builtEngine(EngineService.layer({ root: tmp('board') }));
  const gone = await running(engine);
  fake.setRows(fake.rows().filter((r) => r.sessionId !== gone.row.sessionId));
  await refused(engine, gone.id, 'hello', /its harness lists no `ae\/.+\/1`/, gone.box);

  const quiet = await running(engine);
  fake.setRows(fake.rows().map((r) => (r.sessionId === quiet.row.sessionId ? { ...r, state: 'done' } : r)));
  await refused(engine, quiet.id, 'hello', /session is `done` on its harness, not running/, quiet.box);
  await gone.box.close();
  await quiet.box.close();
});

test('a registry that cannot be read rejects, not refuses: ask again', async () => {
  const engine = builtEngine(EngineService.layer({ root: tmp('board') }));
  const { id, row, box } = await running(engine);
  fs.writeFileSync(
    path.join(sessions, `${process.pid}.json`),
    JSON.stringify({
      pid: process.pid,
      sessionId: row.sessionId,
      name: row.name,
      kind: 'bg',
      procStart: processStart(process.pid),
      messagingSocketPath: box.path,
    }),
  );
  fake.agentsFails(true);
  try {
    await failed(engine, id, /the `claude` registry could not be read/);
  } finally {
    fake.agentsFails(false);
    fs.rmSync(path.join(sessions, `${process.pid}.json`));
  }
  assert.equal(box.lines.length, 0);
  await box.close();
});

test('a session with no registration, one registered to another session, one with no inbox, and one whose inbox is gone: rejected, nothing journalled', async () => {
  const board = () => builtEngine(EngineService.layer({ root: tmp('board') }));

  const e1 = board();
  const unregistered = await running(e1, {}, false);
  await failed(e1, unregistered.id, /was not given the words.*registration.*cannot be read/);

  const e2 = board();
  const reused = await running(e2, {}, false);
  register(reused.row, { sessionId: '11111111-2222-3333-4444-555555555555', messagingSocketPath: reused.box.path });
  await failed(e2, reused.id, /is registered to 11111111-2222-3333-4444-555555555555 now/);
  assert.equal(reused.box.lines.length, 0, 'the socket of a pid that passed to another session hears nothing');

  const e3 = board();
  const noInbox = await running(e3, {}, false);
  register(noInbox.row, {});
  await failed(e3, noInbox.id, /has no inbox/);

  const e4 = board();
  const closed = await running(e4);
  await closed.box.close();
  fs.rmSync(closed.box.path, { force: true });
  await failed(e4, closed.id, /inbox, .* is not there/);

  for (const r of [unregistered, reused, noInbox]) await r.box.close();
});

test('a session listed with no process — exited — rejects: nothing to find its inbox by', async () => {
  const engine = builtEngine(EngineService.layer({ root: tmp('board') }));
  const { id, row, box } = await running(engine);
  fake.setRows(fake.rows().map((r) => (r.sessionId === row.sessionId ? { ...r, pid: undefined } : r)));
  await failed(engine, id, /`claude agents` lists no process for/);
  assert.equal(box.lines.length, 0);
  await box.close();
});

test("an inbox that is a symlink to a real socket is refused before anything is sent — so is a registration another user owns, or a plain file in the socket's place", async () => {
  const engine = builtEngine(EngineService.layer({ root: tmp('board') }));
  const { id, row, box } = await running(engine, {}, false);
  const link = path.join(tmp('link'), 'in.sock');
  fs.symlinkSync(box.path, link);
  register(row, { messagingSocketPath: link });
  await failed(engine, id, /is not a socket — a symlink, or something else in its place\. Refusing to send/);
  assert.equal(box.lines.length, 0, 'the socket behind the link heard nothing');

  const file = path.join(tmp('plain'), 'in.sock');
  fs.writeFileSync(file, '');
  register(row, { messagingSocketPath: file });
  await assert.rejects(claudeInbox(sessions, row.pid!, row.sessionId), (e: Error) => /is not a socket/.test(e.message));

  register(row, { messagingSocketPath: box.path });
  assert.equal(await claudeInbox(sessions, row.pid!, row.sessionId), box.path, 'the real socket, registered, is found');
  const me = process.getuid!();
  await assert.rejects(claudeInbox(sessions, row.pid!, row.sessionId, me + 1), (e: Error) =>
    /cannot be read \(not a file of yours\)/.test(e.message),
  );
  await box.close();
});

test("a socket another user owns is refused — the check on what lstat said, handed another uid, since no test can make a socket another user's", async () => {
  const box = await inbox();
  const me = process.getuid!();
  const stat = fs.lstatSync(box.path);
  assert.equal(inboxSocketRefuses(box.path, stat, me), undefined, 'a socket of mine is sent to');
  assert.equal(inboxSocketRefuses(box.path, stat, undefined), undefined, 'and one on a platform with no uids');
  assert.match(inboxSocketRefuses(box.path, stat, me + 1) ?? '', new RegExp(`is owned by uid ${me}, not by you\\. Refusing to send`));
  const link = path.join(tmp('link'), 'in.sock');
  fs.symlinkSync(box.path, link);
  assert.match(
    inboxSocketRefuses(link, fs.lstatSync(link), me) ?? '',
    /is not a socket — a symlink/,
    'a link to my own socket, all the same',
  );
  await box.close();
});

/**
 * The deadline this test shortens the post to, at the seam `ClaudeOptions` gives for it: the shipped default is `SAY_TIMEOUT_MS`,
 * 5 s, and waiting it out cost every pass of this file the whole 5 s to prove what half a second proves — that an inbox slow to close its
 * end was given the words all the same. `EngineOptions.sayTimeoutMs` carries it to the harness that holds it, as `claudeExecutable`
 * beside it is carried: a harness brought as ops of a test's own has no background session (`harness-refusal.ts`), so the bound
 * cannot ride on those. The floor below says the deadline is what resolved the post and not the inbox; what the deadline's value
 * is the suite's own cost says, and no assertion of a ceiling, which would fail under load.
 */
const SAID_MS = 500;

/**
 * How far under the deadline a clock read around the post may come back: the post is resolved by a `setTimeout`, which fires up to a
 * millisecond or so before `instantNow()` reads its delay gone, `monoNow` keeping whole milliseconds besides. 50 ms holds any such
 * jitter and still stands far above a post the inbox answers by closing its end, which resolves in a few milliseconds.
 */
const TIMER_SLACK_MS = 50;

test('an inbox that reads the words and never closes its end — a process busy past the deadline — was given them: said, and journalled', async () => {
  const engine = builtEngine(EngineService.layer({ root: tmp('board'), sayTimeoutMs: SAID_MS }));
  const { id, row } = await running(engine, {}, false);
  const box = await inbox({ neverCloses: true });
  register(row, { messagingSocketPath: box.path });
  const t0 = instantNow();
  const said = await Effect.runPromise(engine.say(id, 'are you there'));
  const waited = elapsedMs(t0, instantNow());
  assert.ok(
    waited >= SAID_MS - TIMER_SLACK_MS,
    `waited ${waited} ms: the inbox never closed, so only the deadline it was given resolved the post`,
  );
  assert.deepEqual(
    (await box.heard(1)).map((l) => l.message?.content),
    ['are you there'],
    'the inbox has the words',
  );
  assert.deepEqual((await Effect.runPromise(engine.view(id))).state.said, [said], 'and so does the record');
  await box.close();
});

test('the post resolves once the whole line is written: when the inbox closes its end, or at its deadline when it never does', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const box = await inbox();
  await claudeInboxPost(box.path, claudeInboxLine('s', 'hi'), 200);
  assert.deepEqual(
    box.lines.map((l) => l.message?.content),
    ['hi'],
    'settled by the inbox closing its end, the deadline never passing',
  );
  await box.close();

  const slow = await inbox({ neverCloses: true });
  const post = claudeInboxPost(slow.path, claudeInboxLine('s', 'hello'), 200);
  const heard = await slow.heard(1);
  t.mock.timers.tick(200);
  await post;
  assert.deepEqual(
    heard.map((l) => l.message?.content),
    ['hello'],
  );
  await slow.close();
});

test('the post rejects when the line is still being written at the deadline, which an inbox drops, and when the inbox is not there', async () => {
  const deaf = await inbox({ neverReads: true });
  await assert.rejects(
    claudeInboxPost(deaf.path, claudeInboxLine('s', 'x'.repeat(4 * 1024 * 1024)), 200),
    (e: Error) => /took only part of the line within 200 ms, and an inbox drops a line cut short/.test(e.message),
    "a line bigger than a socket's buffer, to an inbox that reads nothing: most of it never leaves this process",
  );

  const gone = path.join(tmp('gone'), 'in.sock');
  await assert.rejects(claudeInboxPost(gone, claudeInboxLine('s', 'hello'), 60_000), (e: NodeJS.ErrnoException) => e.code === 'ENOENT');
  await deaf.close();
});

const memoryJournal = (failOn?: Event['kind']): AsyncJournal => {
  const tasks = new Map<string, Event[]>();
  const feed: FeedEntry[] = [];
  return {
    async append(taskId, event) {
      if (event.kind === failOn) throw new Error('the store is read-only now');
      tasks.set(taskId, [...(tasks.get(taskId) ?? []), event]);
      feed.push({ taskId, event });
    },
    async read(taskId) {
      return [...(tasks.get(taskId) ?? [])];
    },
    async list() {
      return [...tasks.keys()];
    },
    async feed(after) {
      return { entries: feed.slice(after), cursor: feed.length };
    },
  };
};

/**
 * A harness brought as a `AsyncRunner`, whose sessions work until stopped. Given `heard`, it has a `say` that records
 * what it is handed there, or rejects with `rejectWith`; without, it has no `say`.
 */
const promiseHarness = (
  heard?: Array<{ session: { name: string; sessionId: string }; text: string }>,
  rejectWith?: string,
): AsyncRunner => {
  const sessions = new Map<string, Sighting>();
  return {
    async spawn(r) {
      sessions.set(r.name, { sessionId: `s-${sessions.size + 1}`, state: 'working' });
    },
    async observe() {
      return new Map(sessions);
    },
    async stop() {},
    async logs() {
      return '';
    },
    ...(heard
      ? {
          async say(session: { name: string; sessionId: string }, text: string) {
            if (rejectWith) throw new Error(rejectWith);
            heard.push({ session, text });
          },
        }
      : {}),
  };
};

test("an AsyncRunner's own say is handed the session as observed and the words; without one, its tasks are refused", async () => {
  const heard: Array<{ session: { name: string; sessionId: string }; text: string }> = [];
  const engine = builtEngine(
    EngineService.layer({
      root: scratch('ae-say-root-'),
      journal: asyncStore(memoryJournal()),
      harnesses: { mine: asyncOps(promiseHarness(heard)) },
    }),
  );
  const id = await Effect.runPromise(engine.file({ brief: 'b', cwd: '/repo' }));
  await Effect.runPromise(engine.tick());
  const said = await Effect.runPromise(engine.say(id, 'hello'));
  assert.deepEqual(heard, [{ session: { name: `ae/${id}/1`, sessionId: 's-1' }, text: 'hello' }]);
  assert.deepEqual((await Effect.runPromise(engine.view(id))).state.said, [said]);

  const mute = builtEngine(
    EngineService.layer({
      root: scratch('ae-say-root-'),
      journal: asyncStore(memoryJournal()),
      harnesses: { mine: asyncOps(promiseHarness()) },
    }),
  );
  const muteId = await Effect.runPromise(mute.file({ brief: 'b', cwd: '/repo' }));
  await Effect.runPromise(mute.tick());
  await refused(mute, muteId, 'hello', /the `mine` harness has no channel into a running session/);
});

test("an AsyncRunner's say that rejects journals nothing; a journal that fails after the words were taken says so", async () => {
  const engine = builtEngine(
    EngineService.layer({
      root: scratch('ae-say-root-'),
      journal: asyncStore(memoryJournal()),
      harnesses: { mine: asyncOps(promiseHarness([], 'the line is down')) },
    }),
  );
  const id = await Effect.runPromise(engine.file({ brief: 'b', cwd: '/repo' }));
  await Effect.runPromise(engine.tick());
  await failed(engine, id, /ae\/.+\/1 was not given the words \(the line is down\)\. Nothing was journalled/);

  const heard: Array<{ session: { name: string; sessionId: string }; text: string }> = [];
  const readOnly = builtEngine(
    EngineService.layer({
      root: scratch('ae-say-root-'),
      journal: asyncStore(memoryJournal('said')),
      harnesses: { mine: asyncOps(promiseHarness(heard)) },
    }),
  );
  const roId = await Effect.runPromise(readOnly.file({ brief: 'b', cwd: '/repo' }));
  await Effect.runPromise(readOnly.tick());
  await assert.rejects(
    Effect.runPromise(readOnly.say(roId, 'hello')),
    (e: Refusal) =>
      e._tag === 'SayUnsent' && /was given the words, but they could not be journalled \(the store is read-only now\)/.test(e.message),
  );
  assert.equal(heard.length, 1, 'the words did go');
});

/**
 * `promiseHarness` with a conversation: `transcript` answers `events` as they stand, or rejects with `unread`, and `say` puts the
 * words' arrival on the end of them, as a session that reads them writes it.
 */
const talkingHarness = (heard: string[], events: TranscriptEvent[], unread?: string): AsyncRunner => {
  const base = promiseHarness([]);
  return {
    ...base,
    async transcript() {
      if (unread) throw new Error(unread);
      return { events: [...events], cursor: String(events.length) };
    },
    async say(_session, text) {
      heard.push(text);
      events.push({ id: `arrival-${heard.length}`, at: new Date().toISOString(), role: 'system', kind: 'system', text });
    },
  };
};

const toldThrough = async (harness: AsyncRunner) => {
  const engine = builtEngine(
    EngineService.layer({ root: scratch('ae-say-root-'), journal: asyncStore(memoryJournal()), harnesses: { mine: asyncOps(harness) } }),
  );
  const id = await Effect.runPromise(engine.file({ brief: 'b', cwd: '/repo' }));
  await Effect.runPromise(engine.tick());
  return { engine, id };
};

test("said's after is the last event the session's transcript held before the words were handed over, never the one they wrote", async () => {
  const heard: string[] = [];
  const at = new Date().toISOString();
  const events: TranscriptEvent[] = [
    { id: 'u-1', at, role: 'user', kind: 'text', text: 'Implement it.' },
    { id: 'c-1', at, role: 'assistant', kind: 'tool_use', tool: { name: 'Read', input: {} } },
  ];
  const { engine, id } = await toldThrough(talkingHarness(heard, events));
  const said = await Effect.runPromise(engine.say(id, 'hello'));
  assert.deepEqual(heard, ['hello'], 'the words were handed over');
  assert.deepEqual(said.after, { kind: 'tool_use', id: 'c-1' });
  assert.deepEqual((await Effect.runPromise(engine.view(id))).state.said, [said], 'journalled with it');
  const again = await Effect.runPromise(engine.say(id, 'and again'));
  assert.deepEqual(again.after, { kind: 'system', id: 'arrival-1' }, "said again: after the first words' arrival");
});

test("said's after is null when the harness keeps no conversation, holds no event yet, or cannot read it: the words still go, and are journalled", async () => {
  const quiet: string[] = [];
  const keepsNone = await toldThrough(promiseHarness([]));
  assert.equal((await Effect.runPromise(keepsNone.engine.say(keepsNone.id, 'hello'))).after, null, 'no conversation kept');
  const empty = await toldThrough(talkingHarness(quiet, []));
  assert.equal((await Effect.runPromise(empty.engine.say(empty.id, 'hello'))).after, null, 'none held yet');
  const unread: string[] = [];
  const failing = await toldThrough(talkingHarness(unread, [], 'the transcript is gone'));
  const said = await Effect.runPromise(failing.engine.say(failing.id, 'hello'));
  assert.equal(said.after, null, 'a read that failed');
  assert.deepEqual(unread, ['hello'], 'the words went all the same');
  assert.deepEqual((await Effect.runPromise(failing.engine.view(failing.id))).state.said, [said]);
});

test('a said journalled with no after reads back with a null one', async () => {
  const journal = memoryJournal();
  const engine = builtEngine(
    EngineService.layer({ root: scratch('ae-say-root-'), journal: asyncStore(journal), harnesses: { mine: asyncOps(promiseHarness([])) } }),
  );
  const id = await Effect.runPromise(engine.file({ brief: 'b', cwd: '/repo' }));
  await Effect.runPromise(engine.tick());
  const at = new Date().toISOString();
  await journal.append(id, { kind: 'said', at, attempt: 1, text: 'from before' });
  assert.deepEqual((await Effect.runPromise(engine.view(id))).state.said, [{ at, attempt: 1, text: 'from before', after: null }]);
});

const ae = fileURLToPath(new URL('../bin/ae.ts', import.meta.url));

/**
 * `ae`, run as a child — and not with `spawnSync`: the inbox is a socket in this process, and a process blocked
 * in `spawnSync` accepts no connection, so the child's words would wait out their timeout.
 */
const aeRun = (args: string[], env: NodeJS.ProcessEnv) =>
  new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [ae, ...args], { env });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (d: string) => {
      stdout += d;
    });
    child.stderr.setEncoding('utf8').on('data', (d: string) => {
      stderr += d;
    });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });

test('ae say <id> prints the line it journalled, the words being everything after the id; ae say <id> "" exits 2 and journals nothing', async () => {
  const root = tmp('cli-board');
  const engine = builtEngine(EngineService.layer({ root }));
  const { id, box } = await running(engine);
  const env = { ...process.env, AE_ROOT: root };

  const ok = await aeRun(['say', id, 'widen', 'the scope to the api'], env);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, new RegExp(`${id}\\s+said\\s+to attempt 1: widen the scope to the api`));
  assert.equal(box.lines.at(-1)?.message?.content, 'widen the scope to the api');

  const empty = await aeRun(['say', id, ''], env);
  assert.equal(empty.status, 2, empty.stderr);
  assert.match(empty.stderr, /`text` is empty/);
  assert.equal((await Effect.runPromise(engine.view(id))).state.said.length, 1, 'only the first was journalled');
  assert.equal(box.lines.length, 1);
  await box.close();
});
