/**
 * Claude Code as the engine runs it by default: a job (`claude -p`) unless the task asks for a background session
 * (`claude --bg`), and every verb given a session id reaching the mode that id belongs to — by its shape, with nothing
 * remembered. Against the real worker and a fake `claude` on PATH that records what it was given and prints what
 * 2.1.280 printed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = (label: string) => fs.mkdtempSync(path.join(os.tmpdir(), `ae-claude-code-${label}-`));

// Where Claude Code keeps transcripts is read when the runner is loaded, so it is set before the import.
const config = tmp('config');
process.env.CLAUDE_CONFIG_DIR = config;
const { claudeCodeOps, claudeJob } = await import('../src/runner-claude-code.ts');
const { claudeCodeRefuses } = await import('../src/runner-claude-vocabulary.ts');

const JOB_ID = '5e551011-0000-4000-8000-00000000000a';
const BG_ID = '5e551011-0000-4000-8000-00000000000b';

/**
 * A fake `claude`: `-p` records its arguments and prints a stream (and waits first when its brief is `wait`); `--bg`
 * records its arguments; `agents` lists what `agents.json` holds; `stop` and `rm` are recorded in order.
 */
const fake = () => {
  const dir = tmp('bin');
  const echo = (line: object) => `      echo '${JSON.stringify(line)}'`;
  fs.writeFileSync(path.join(dir, 'agents.json'), '[]');
  fs.writeFileSync(path.join(dir, 'claude'), [
    '#!/bin/sh',
    'case "$1" in',
    `  agents) cat '${dir}/agents.json' ;;`,
    `  stop|rm) echo "$@" >> '${dir}/verbs' ;;`,
    `  --bg) printf '%s\\n' "$@" > '${dir}/bg-args' ;;`,
    `  -p) printf '%s\\n' "$@" > '${dir}/job-args.tmp'; mv '${dir}/job-args.tmp' '${dir}/job-args'`,
    echo({ type: 'system', subtype: 'init', session_id: JOB_ID }),
    '      if [ "$2" = wait ]; then sleep 30; fi',
    echo({ type: 'result', subtype: 'success', is_error: false, session_id: JOB_ID, total_cost_usd: 0.03, structured_output: { outcome: 'done' } }),
    '      ;;',
    'esac',
    '',
  ].join('\n'), { mode: 0o755 });
  const prev = process.env.PATH;
  process.env.PATH = `${dir}:${prev}`;
  const read = (f: string) => { try { return fs.readFileSync(path.join(dir, f), 'utf8').replace(/\n$/, '').split('\n'); } catch { return undefined; } };
  return { dir, read, restore: () => { process.env.PATH = prev; } };
};

const opsIn = (root: string) => claudeCodeOps({
  root, sessionsDir: tmp('sessions'),
  // A background session's clock and statement, answered without a transcript.
  transcriptTime: async () => Date.now(), closeoutFrom: async () => undefined, usageFrom: async () => undefined,
});

const until = async <T>(read: () => Promise<T | undefined>, what: string, ms = 15_000): Promise<T> => {
  const deadline = Date.now() + ms;
  for (;;) {
    const got = await read();
    if (got !== undefined) return got;
    if (Date.now() > deadline) assert.fail(`never saw ${what}`);
    await new Promise((r) => setTimeout(r, 100));
  }
};

test('a job is `claude -p` printing a stream, verbose, that no prompt can hold — the brief first and the lists ended before it could be taken', () => {
  const args = claudeJob.command({
    name: 'ae/t/1', brief: 'the prompt', cwd: '/r', budgetUsd: 0.5, resumeFrom: BG_ID,
    config: { tools: ['Read', 'Bash'], permissionMode: 'dontAsk' },
  }).args;
  assert.deepEqual(args.slice(0, 7), ['-p', 'the prompt', '--output-format', 'stream-json', '--verbose', '--permission-prompts', 'none']);
  assert.ok(args.indexOf('--tools') < args.indexOf('--permission-mode'), 'the variadic list is ended by the mode after it');
  assert.equal(args[args.indexOf('--permission-mode') + 1], 'dontAsk');
  assert.equal(args[args.indexOf('--max-budget-usd') + 1], '0.5', 'a job keeps its cap');
  assert.equal(args[args.indexOf('--resume') + 1], BG_ID);
  assert.equal(claudeJob.command({ name: 'ae/t/1', brief: 'b', cwd: '/r' }).args[claudeJob.command({ name: 'ae/t/1', brief: 'b', cwd: '/r' }).args.indexOf('--permission-mode') + 1], 'auto', 'the default mode, as before');
});

test('a task is run as a job unless it asks for a background session, which is `claude --bg` — and the job is seen by its name, with its own id and answer', async () => {
  const f = fake();
  try {
    const root = tmp('root');
    const ops = opsIn(root);
    await Effect.runPromise(ops.spawn({ name: 'ae/j/1', brief: 'go', cwd: f.dir }));
    const seen = await until(async () => {
      const s = (await Effect.runPromise(ops.observe)).get('ae/j/1');
      return s?.state === 'done' ? s : undefined;
    }, 'the job done');
    assert.equal(f.read('job-args')?.[0], '-p');
    assert.equal(f.read('bg-args'), undefined, 'no background session for a job');
    assert.equal(seen.sessionId, 'ae/j/1', 'a job is known by its name');
    assert.equal(seen.nativeId, JOB_ID, "and carries Claude Code's own id, to resume and read by");
    assert.deepEqual(seen.closeout?.payload, { outcome: 'done' });
    assert.equal(seen.usage?.costUsd, 0.03);

    await Effect.runPromise(ops.spawn({ name: 'ae/b/1', brief: 'go', cwd: f.dir, config: { background: true } }));
    assert.equal(f.read('bg-args')?.[0], '--bg');
    assert.equal(f.read('bg-args')?.includes('ae/b/1'), true, 'named as the engine named it');
  } finally { f.restore(); }
});

test('observe lists the jobs and the background sessions in one map — and a registry that will not answer hides only its own', async () => {
  const f = fake();
  try {
    const root = tmp('root');
    const ops = opsIn(root);
    await Effect.runPromise(ops.spawn({ name: 'ae/j/1', brief: 'go', cwd: f.dir }));
    fs.writeFileSync(path.join(f.dir, 'agents.json'), JSON.stringify([{ name: 'ae/b/1', sessionId: BG_ID, state: 'working', status: 'busy', kind: 'background' }]));
    const both = await Effect.runPromise(ops.observe);
    assert.equal(both.get('ae/b/1')?.sessionId, BG_ID);
    assert.equal(both.get('ae/j/1')?.sessionId, 'ae/j/1');

    fs.writeFileSync(path.join(f.dir, 'agents.json'), 'not json');
    const jobs = await Effect.runPromise(ops.observe);
    assert.equal(jobs.has('ae/j/1'), true, "`claude agents` failing does not hide a job");
    assert.equal(jobs.has('ae/b/1'), false);
  } finally { f.restore(); }
});

test('a stop, a release and words reach the mode the id belongs to, by its shape — with no observe made first, as after a restart', async () => {
  const f = fake();
  try {
    const root = tmp('root');
    const first = opsIn(root);
    await Effect.runPromise(first.spawn({ name: 'ae/j/2', brief: 'wait', cwd: f.dir }));
    await until(async () => f.read('job-args'), 'the job started');

    // A fresh runner, as a restarted process has: nothing observed, nothing remembered.
    const ops = opsIn(root);
    await Effect.runPromise(ops.stop('ae/j/2'));
    await Effect.runPromise(ops.stop(BG_ID));
    assert.deepEqual(f.read('verbs'), ['stop 5e551011'], 'a background session is stopped by `claude stop`, a job never');
    const stopped = await until(async () => {
      const s = (await Effect.runPromise(ops.observe)).get('ae/j/2');
      return s?.state === 'stopped' ? s : undefined;
    }, 'the job stopped by its worker');
    assert.equal(stopped.sessionId, 'ae/j/2');

    // A job's run file is its record: nothing to let go of. A background session is removed from Claude Code's list.
    await Effect.runPromise(ops.release!(stopped, {}));
    assert.deepEqual(f.read('verbs'), ['stop 5e551011'], 'releasing a job asks Claude Code for nothing');
    await Effect.runPromise(ops.release!({ sessionId: BG_ID, state: 'done' }, {}));
    assert.deepEqual(f.read('verbs'), ['stop 5e551011', 'rm 5e551011']);

    const toJob = await Effect.runPromise(Effect.flip(ops.say!({ name: 'ae/j/2', sessionId: 'ae/j/2' }, 'hello')));
    assert.match(toJob.message, /config\.background: true/, 'a job takes no words, and the refusal names the mode that does');
    const toBg = await Effect.runPromise(Effect.flip(ops.say!({ name: 'ae/b/1', sessionId: BG_ID }, 'hello')));
    assert.match(toBg.message, /^claude --bg: /, 'words for a background session go to its inbox');
  } finally { f.restore(); }
});

test('a job is found by its run file, and a name no job has is asked of Claude Code', async () => {
  const f = fake();
  try {
    const root = tmp('root');
    const ops = opsIn(root);
    await Effect.runPromise(ops.spawn({ name: 'ae/j/3', brief: 'go', cwd: f.dir }));
    assert.deepEqual(await Effect.runPromise(ops.find!('ae/j/3')), { sessionId: 'ae/j/3' });
    assert.equal(await Effect.runPromise(ops.find!('ae/b/9')), undefined, 'no registration by that name either');
  } finally { f.restore(); }
});

test("finding a job reads its run file and nothing else — no other job's, and no job's output", async () => {
  const f = fake();
  try {
    const root = tmp('root');
    const ops = opsIn(root);
    for (const name of ['ae/j/1', 'ae/k/1']) await Effect.runPromise(ops.spawn({ name, brief: 'go', cwd: f.dir }));
    // Both ended, and each has printed its stream: a find that listed the jobs would read every log that changed since.
    await until(async () => {
      const seen = await Effect.runPromise(ops.observe);
      return ['ae/j/1', 'ae/k/1'].every((n) => seen.get(n)?.state === 'done') || undefined;
    }, 'both jobs done');
    const runs = path.join(root, 'runs', 'claude');
    for (const log of fs.readdirSync(runs).filter((n) => n.endsWith('.log'))) fs.appendFileSync(path.join(runs, log), '\n');
    const read: string[] = [];
    const readFileSync = fs.readFileSync;
    fs.readFileSync = ((file: fs.PathOrFileDescriptor, ...rest: unknown[]) => {
      read.push(String(file));
      return (readFileSync as (...a: unknown[]) => unknown)(file, ...rest);
    }) as typeof fs.readFileSync;
    let found;
    try { found = await Effect.runPromise(ops.find!('ae/j/1')); } finally { fs.readFileSync = readFileSync; }
    assert.deepEqual(found, { sessionId: 'ae/j/1' });
    assert.deepEqual(read, [path.join(runs, 'ae_j_1.json')], 'one file read, the run file of the job asked for');
  } finally { f.restore(); }
});

test('a run file another name folds onto is not the job asked for', async () => {
  const f = fake();
  try {
    const root = tmp('root');
    const ops = opsIn(root);
    await Effect.runPromise(ops.spawn({ name: 'ae/j/2', brief: 'go', cwd: f.dir }));
    // `ae-j/2` is written at the same path as `ae/j/2`; the file says whose it is.
    assert.equal(await Effect.runPromise(ops.find!('ae-j/2')), undefined);
    assert.deepEqual(await Effect.runPromise(ops.find!('ae/j/2')), { sessionId: 'ae/j/2' });
  } finally { f.restore(); }
});

test("a running job's conversation is read by its name, and an ended one's by Claude Code's id — the same transcript", async () => {
  const f = fake();
  try {
    const root = tmp('root');
    const ops = opsIn(root);
    const file = path.join(config, 'projects', 'fake-project', `${JOB_ID}.jsonl`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify({ type: 'user', uuid: 'u1', timestamp: new Date().toISOString(), message: { role: 'user', content: 'the brief' } })}\n`);
    await Effect.runPromise(ops.spawn({ name: 'ae/j/4', brief: 'wait', cwd: f.dir }));
    const byName = await until(async () => {
      const t = await Effect.runPromise(ops.transcript!('ae/j/4'));
      return t.events.length ? t : undefined;
    }, 'the transcript through the run file');
    assert.equal(byName.events[0]?.text, 'the brief', 'read while it runs: the stream named the session first');
    const byId = await Effect.runPromise(ops.transcript!(JOB_ID));
    assert.deepEqual(byId.events, byName.events);
    await Effect.runPromise(ops.stop('ae/j/4'));
  } finally { f.restore(); }
});

test('a job resumed from a background session is a job — and, its parent not one of its runs, carries no cost it cannot tell from its parent', async () => {
  const f = fake();
  try {
    const root = tmp('root');
    const ops = opsIn(root);
    await Effect.runPromise(ops.spawn({ name: 'ae/u/2', brief: 'go', cwd: f.dir, resumeFrom: BG_ID }));
    const seen = await until(async () => {
      const s = (await Effect.runPromise(ops.observe)).get('ae/u/2');
      return s?.state === 'done' ? s : undefined;
    }, 'the resumed job done');
    const args = f.read('job-args')!;
    assert.equal(args[0], '-p');
    assert.equal(args[args.indexOf('--resume') + 1], BG_ID);
    assert.equal(f.read('bg-args'), undefined);
    assert.deepEqual(seen.closeout?.payload, { outcome: 'done' });
    assert.equal(seen.usage?.costUsd, undefined, "the printed total carries the background session's on");
  } finally { f.restore(); }
});

test('what the default Claude Code refuses depends on the mode: a job refuses a bridge, a background session a spend cap — each naming the other', () => {
  assert.equal(claudeCodeRefuses({ brief: 'b', cwd: '/r', budgetUsd: 1 }), undefined, 'a job keeps a cap');
  assert.equal(claudeCodeRefuses({ brief: 'b', cwd: '/r', config: { background: true, remoteControl: true } }), undefined);
  assert.equal(claudeCodeRefuses({ brief: 'b', cwd: '/r' }), undefined);
  const bridge = claudeCodeRefuses({ brief: 'b', cwd: '/r', config: { remoteControl: true } });
  assert.ok(bridge && /^`remoteControl: true` bridges a session to claude\.ai/.test(bridge) && bridge.includes('`config.background: true`'), bridge);
  const cap = claudeCodeRefuses({ brief: 'b', cwd: '/r', budgetUsd: 0.5, config: { background: true } });
  assert.ok(cap && /^`budgetUsd: 0\.5` is a spend cap/.test(cap) && cap.includes('Leave `config.background` off'), cap);
  for (const background of [undefined, true]) {
    assert.match(claudeCodeRefuses({ brief: 'b', cwd: '/r', config: { background, effort: 'huge' } }) ?? '', /^`effort: huge` is not an effort Claude Code has/);
    assert.match(claudeCodeRefuses({ brief: 'b', cwd: '/r', config: { background, permissionMode: 'yolo' } }) ?? '', /^`permissionMode: yolo` is not a mode/);
  }
});
