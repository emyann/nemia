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
import path from 'node:path';
import { scratch } from './scratch.ts';

const tmp = (label: string) => scratch(`ae-claude-code-${label}-`);

// Where Claude Code keeps transcripts is read when the runner is loaded, so it is set before the import.
const config = tmp('config');
process.env.CLAUDE_CONFIG_DIR = config;
const { claudeCodeOps, claudeJob } = await import('../src/runner-claude-code.ts');
const { claudeCodeRefuses, claudeRefuses } = await import('../src/runner-claude-vocabulary.ts');

const JOB_ID = '5e551011-0000-4000-8000-00000000000a';
const BG_ID = '5e551011-0000-4000-8000-00000000000b';

/**
 * A fake `claude`: `-p` records its arguments, prints its init line, and then reads its stdin a line at a time as
 * 2.1.280 does — recording each in `job-stdin`, and printing a result for each but a brief of `wait`, until its stdin
 * ends. The result names its `type` last, as 2.1.280's does. `--bg` records its arguments; `agents` lists what
 * `agents.json` holds, a line in `agents-calls` each time; `stop` and `rm` are recorded in order.
 */
const fake = () => {
  const dir = tmp('bin');
  const echo = (line: object) => `      echo '${JSON.stringify(line)}'`;
  fs.writeFileSync(path.join(dir, 'agents.json'), '[]');
  fs.writeFileSync(path.join(dir, 'claude'), [
    '#!/bin/sh',
    'case "$1" in',
    `  agents) echo x >> '${dir}/agents-calls'; cat '${dir}/agents.json' ;;`,
    `  stop|rm) echo "$@" >> '${dir}/verbs' ;;`,
    `  --bg) printf '%s\\n' "$@" > '${dir}/bg-args' ;;`,
    `  -p) printf '%s\\n' "$@" > '${dir}/job-args.tmp'; mv '${dir}/job-args.tmp' '${dir}/job-args'`,
    echo({ type: 'system', subtype: 'init', session_id: JOB_ID }),
    `      while IFS= read -r line; do printf '%s\\n' "$line" >> '${dir}/job-stdin'`,
    `        case "$line" in *'"content":"wait"'*) ;; *)`,
    '  ' + echo({ subtype: 'success', is_error: false, session_id: JOB_ID, total_cost_usd: 0.03, structured_output: { outcome: 'done' }, type: 'result' }),
    '        ;; esac',
    '      done ;;',
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

test('a job is `claude -p` reading a stream and printing one, verbose, that no prompt can hold — its brief the first line on its stdin', () => {
  const args = claudeJob.command({
    name: 'ae/t/1', brief: 'the prompt', cwd: '/r', resumeFrom: BG_ID,
    config: { tools: ['Read', 'Bash'], permissionMode: 'dontAsk', budgetUsd: 0.5 },
  }).args;
  assert.deepEqual(args.slice(0, 8), ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--permission-prompts', 'none']);
  assert.equal(args.includes('the prompt'), false, 'the brief is not an argument');
  assert.deepEqual(JSON.parse(claudeJob.input!.line('the prompt')), { type: 'user', message: { role: 'user', content: 'the prompt' } }, 'it is a user message, as M6 wrote one');
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
    assert.deepEqual(f.read('job-stdin')?.map((l) => JSON.parse(l).message.content), ['go'], 'the brief on its stdin, and its stdin ended at the result');
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

test('observeFor asks `claude agents` only when a session expected is not a job: none for jobs alone or nothing, one for a background session', async () => {
  const f = fake();
  try {
    const ops = opsIn(tmp('root'));
    const calls = () => f.read('agents-calls')?.length ?? 0;
    await Effect.runPromise(ops.spawn({ name: 'ae/j/1', brief: 'go', cwd: f.dir }));
    fs.writeFileSync(path.join(f.dir, 'agents.json'), JSON.stringify([{ name: 'ae/b/1', sessionId: BG_ID, state: 'working', status: 'busy', kind: 'background' }]));

    assert.equal((await Effect.runPromise(ops.observeFor!([]))).size, 1, 'nothing expected: the jobs, off their run files');
    const jobs = await Effect.runPromise(ops.observeFor!([{ name: 'ae/j/1', harness: 'claude' }]));
    assert.equal(jobs.get('ae/j/1')?.sessionId, 'ae/j/1');
    assert.equal(calls(), 0, 'a pass with only jobs in flight spawns no `claude agents`');

    // A background session is known by nothing on the task: its name is simply not a job's.
    const both = await Effect.runPromise(ops.observeFor!([{ name: 'ae/j/1', harness: 'claude' }, { name: 'ae/b/1', harness: 'claude' }]));
    assert.equal(both.get('ae/b/1')?.sessionId, BG_ID);
    assert.equal(both.get('ae/j/1')?.sessionId, 'ae/j/1');
    assert.equal(calls(), 1, 'one expected session that is no job: one `claude agents`');

    await Effect.runPromise(ops.observe);
    assert.equal(calls(), 2, 'observe, told nothing, still asks the registry');
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
    assert.match(toJob.message, /^claude: `ae\/j\/2` is `stopped`, not running/, "a job's words go to its worker, which refuses them once it has ended");
    const toBg = await Effect.runPromise(Effect.flip(ops.say!({ name: 'ae/b/1', sessionId: BG_ID }, 'hello')));
    assert.match(toBg.message, /^claude --bg: /, 'words for a background session go to its inbox');
  } finally { f.restore(); }
});

test('words said to a running job reach its stdin as the next user message, and once it has given its result it takes no more', async () => {
  const f = fake();
  try {
    const root = tmp('root');
    const ops = opsIn(root);
    await Effect.runPromise(ops.spawn({ name: 'ae/s/1', brief: 'wait', cwd: f.dir }));
    await until(async () => f.read('job-stdin'), 'the brief read');
    await Effect.runPromise(ops.say!({ name: 'ae/s/1', sessionId: 'ae/s/1' }, 'hello'));
    const done = await until(async () => {
      const s = (await Effect.runPromise(ops.observe)).get('ae/s/1');
      return s?.state === 'done' ? s : undefined;
    }, 'the job done on the words it was told');
    assert.deepEqual(f.read('job-stdin')?.map((l) => JSON.parse(l)), [
      { type: 'user', message: { role: 'user', content: 'wait' } },
      { type: 'user', message: { role: 'user', content: 'hello' } },
    ], 'the brief, then the words, each a user message on its stdin');
    assert.deepEqual(done.closeout?.payload, { outcome: 'done' }, 'the result the words brought on');

    const late = await Effect.runPromise(Effect.flip(ops.say!({ name: 'ae/s/1', sessionId: 'ae/s/1' }, 'too late')));
    assert.match(late.message, /^claude: `ae\/s\/1` has given its result and reads no more words/);
    assert.equal(fs.readFileSync(path.join(root, 'runs', 'claude', 'ae_s_1.inbox.jsonl'), 'utf8').split('\n').filter(Boolean).length, 1, 'nothing appended once refused');
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
  assert.equal(claudeCodeRefuses({ brief: 'b', cwd: '/r', config: { budgetUsd: 1 } }), undefined, 'a job keeps a cap');
  assert.equal(claudeCodeRefuses({ brief: 'b', cwd: '/r', config: { background: true, remoteControl: true } }), undefined);
  assert.equal(claudeCodeRefuses({ brief: 'b', cwd: '/r' }), undefined);
  const bridge = claudeCodeRefuses({ brief: 'b', cwd: '/r', config: { remoteControl: true } });
  assert.ok(bridge && /^`remoteControl: true` bridges a session to claude\.ai/.test(bridge) && bridge.includes('`config.background: true`'), bridge);
  const cap = claudeCodeRefuses({ brief: 'b', cwd: '/r', config: { budgetUsd: 0.5, background: true } });
  assert.ok(cap && /^`budgetUsd: 0\.5` is a spend cap/.test(cap) && cap.includes('Leave `config.background` off'), cap);
  for (const background of [undefined, true]) {
    assert.match(claudeCodeRefuses({ brief: 'b', cwd: '/r', config: { background, effort: 'huge' } }) ?? '', /^`effort: huge` is not an effort Claude Code has/);
    assert.match(claudeCodeRefuses({ brief: 'b', cwd: '/r', config: { background, permissionMode: 'yolo' } }) ?? '', /^`permissionMode: yolo` is not a mode/);
  }
});

/** Every flag in `args` as `config.claude` would name it: `--permission-mode` is `permissionMode`, `-p` is `p`. */
const flagsIn = (args: readonly string[]) => args.filter((a) => a.startsWith('-')).map((a) => a.replace(/^--?/, '').replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()));

/** A config that makes a spawn give every flag it can. */
const EVERYTHING = {
  tools: ['Read'], disallowedTools: ['SendMessage'], allowedTools: ['Edit(**)'], permissionMode: 'dontAsk', model: 'opus', effort: 'high',
  contextTokens: 200000, worktree: 'w', budgetUsd: 1, mcp: { m: { command: 'x' } },
};

test("Claude Code's own flags (`config.claude`) are handed over as written, after the variadic lists and directly before the mode — on a job, on claude -p's other spec and on a background session", async () => {
  const claude = { appendSystemPromptFile: '/a/prompt.md', pluginDir: ['/a/hkb-x', '/a/hkb-y'], settings: '{"outputStyle":"hkb-x:no-coding"}', bare: true as const };
  const want = ['--append-system-prompt-file', '/a/prompt.md', '--plugin-dir', '/a/hkb-x', '--plugin-dir', '/a/hkb-y', '--settings', '{"outputStyle":"hkb-x:no-coding"}', '--bare'];
  const { claudeDetached } = await import('../src/runner-claude-detached.ts');
  const job = claudeJob.command({ name: 'ae/t/1', brief: 'b', cwd: '/r', config: { tools: ['Read', 'Skill'], claude } }).args;
  const detached = claudeDetached.command({ name: 'ae/t/1', brief: 'b', cwd: '/r', config: { tools: ['Read', 'Skill'], claude } }).args;
  const f = fake();
  let bg: string[];
  try {
    await Effect.runPromise(opsIn(tmp('root')).spawn({ name: 'ae/b/1', brief: 'b', cwd: f.dir, config: { background: true, tools: ['Read', 'Skill'], claude } }));
    bg = f.read('bg-args')!;
  } finally { f.restore(); }
  for (const [what, args] of [['a job', job], ['claude-detached', detached], ['a background session', bg]] as const) {
    const at = args.indexOf('--append-system-prompt-file');
    assert.deepEqual(args.slice(at, at + want.length), want, what);
    assert.equal(args[at + want.length], '--permission-mode', `${what}: directly before the mode`);
    assert.ok(args.indexOf('--tools') < at, `${what}: after the variadic list, which the first of them ends`);
  }
  // None given, none handed over: the argv is what it was.
  assert.deepEqual(claudeJob.command({ name: 'ae/t/1', brief: 'b', cwd: '/r', config: { claude: {} } }).args, claudeJob.command({ name: 'ae/t/1', brief: 'b', cwd: '/r' }).args);
});

test("a job reads its checkout's settings and never the operator's — `--setting-sources project,local` once, on both `claude -p` specs; a background session is not given it", async () => {
  const { claudeDetached } = await import('../src/runner-claude-detached.ts');
  const sources = (args: string[]) => args.flatMap((a, i) => (a === '--setting-sources' ? [args[i + 1]] : []));
  const f = fake();
  let job: string[];
  let bg: string[];
  try {
    const ops = opsIn(tmp('root'));
    await Effect.runPromise(ops.spawn({ name: 'ae/j/1', brief: 'go', cwd: f.dir }));
    job = await until(async () => f.read('job-args'), 'the job started');
    await Effect.runPromise(ops.spawn({ name: 'ae/b/1', brief: 'go', cwd: f.dir, config: { background: true } }));
    bg = f.read('bg-args')!;
  } finally { f.restore(); }
  assert.deepEqual(sources(job), ['project,local'], 'the argv the worker gave the job');
  assert.deepEqual(sources(claudeDetached.command({ name: 'ae/t/1', brief: 'b', cwd: '/r' }).args), ['project,local'], 'claude-detached');
  assert.deepEqual(sources(claudeJob.command({ name: 'ae/t/1', brief: 'b', cwd: '/r', config: { claude: { settings: '{}' } } }).args), ['project,local'], 'beside the caller\'s own `--settings`');
  assert.deepEqual(sources(bg), [], 'a background session reads what it read before');
});

test('REFUSED at shipped defaults: a flag the runtime gives Claude Code itself, in `config.claude` — and every flag a spawn gives is on that list', async () => {
  const { CLAUDE_OWNED_FLAGS } = await import('../src/runner-claude-vocabulary.ts');
  const { claudeDetached } = await import('../src/runner-claude-detached.ts');
  const request = { name: 'ae/t/1', brief: 'b', cwd: '/r', resumeFrom: BG_ID, closeoutSchema: { type: 'object' }, config: EVERYTHING };
  const io = { checkoutMcpConfig: '/r/.mcp.json', mcpConfigFile: '/m.json' };
  const f = fake();
  let bg: string[];
  try {
    await Effect.runPromise(opsIn(tmp('root')).spawn({ ...request, name: 'ae/b/1', cwd: f.dir, config: { ...EVERYTHING, budgetUsd: undefined, background: true, remoteControl: true } }));
    bg = f.read('bg-args')!;
  } finally { f.restore(); }
  for (const [what, args] of [['a job', claudeJob.command(request, io).args], ['claude-detached', claudeDetached.command(request, io).args], ['a background session', bg]] as const) {
    const stray = flagsIn(args).filter((flag) => !CLAUDE_OWNED_FLAGS.includes(flag));
    assert.deepEqual(stray, [], `${what} gives flags the list does not name`);
  }
  for (const owned of CLAUDE_OWNED_FLAGS) {
    for (const refuses of [claudeRefuses, claudeCodeRefuses]) {
      const says = refuses({ brief: 'b', cwd: '/r', config: { claude: { [owned]: 'x' } } }) ?? '';
      assert.ok(says.startsWith(`\`claude.${owned}\` is a flag the runtime gives Claude Code itself`), `${owned}: ${says}`);
    }
  }
  assert.equal(claudeRefuses({ brief: 'b', cwd: '/r', config: { claude: { appendSystemPromptFile: 'p.md', pluginDir: ['d'] } } }), undefined, 'what the orchestrator gives is taken');
});

test("REFUSED at shipped defaults: Claude Code's flags on a harness that is not Claude Code — codex, and any spec that does not say it is — at the engine's door and codex's own", async () => {
  const { createEngine, codex } = await import('../src/facade.ts');
  const other = { name: 'other', command: () => ({ cmd: 'true', args: [] }) };
  const e = createEngine({ root: tmp('root'), harnesses: { claude: 'claude', codex, other } });
  const claude = { appendSystemPromptFile: '/a/prompt.md' };
  for (const harness of ['codex', 'other']) {
    await assert.rejects(e.file({ brief: 'b', cwd: '/r', harness, config: { claude } }), (err: Error & { exitCode?: number }) => {
      assert.equal(err.exitCode, 2);
      assert.ok(err.message.startsWith(`file: \`claude\` gives Claude Code flags of its own, and the \`${harness}\` harness is not Claude Code`), err.message);
      assert.ok(err.message.includes('File the task on `claude`'), err.message);
      return true;
    });
  }
  assert.match(codex.refuses!({ brief: 'b', cwd: '/r', config: { claude } }) ?? '', /^`claude: \{"appendSystemPromptFile":"\/a\/prompt\.md"\}` gives Claude Code flags of its own, and `codex exec` is not Claude Code/);
  assert.equal(codex.refuses!({ brief: 'b', cwd: '/r' }), undefined);
  // A key that is no harness argument — `codex`, say — was refused before this card and still is: there is no bag for Codex.
  await assert.rejects(e.file({ brief: 'b', cwd: '/r', harness: 'codex', config: { codex: { x: 1 } } as never }), /`config\.codex` is not a harness argument/);
});

test("a flag Claude Code does not have fails the attempt as the CLI fails it, and the CLI's own words reach the attempt's logs", async () => {
  // What 2.1.282 does given `--frobnicate` (F22): nothing on stdout, its words on stderr, exit 1.
  const dir = tmp('bin');
  fs.writeFileSync(path.join(dir, 'claude'), [
    '#!/bin/sh',
    'case "$1" in',
    '  agents) echo "[]" ;;',
    '  *) for a in "$@"; do case "$a" in --frobnicate) echo "error: unknown option \'--frobnicate\'" >&2; exit 1 ;; esac; done; exit 0 ;;',
    'esac',
    '',
  ].join('\n'), { mode: 0o755 });
  const prev = process.env.PATH;
  process.env.PATH = `${dir}:${prev}`;
  try {
    const { createEngine } = await import('../src/facade.ts');
    const e = createEngine({ root: tmp('root'), harnesses: { claude: 'claude' } });
    const id = await e.file({ brief: 'b', cwd: dir, config: { claude: { frobnicate: true } } });
    const until = Date.now() + 20_000;
    while (!(await e.view(id)).state.settled) {
      assert.ok(Date.now() < until, 'settled');
      await e.tick();
      await new Promise((r) => setTimeout(r, 50));
    }
    const v = await e.view(id);
    assert.equal(v.phase, 'failed', 'an ordinary failed end');
    assert.equal(v.state.attempts[0]?.exitCode, 1, 'with the exit code the CLI gave');
    assert.match(await e.logs(id), /error: unknown option '--frobnicate'/, "and the CLI's words, where a person reads why");
  } finally { process.env.PATH = prev; }
});
