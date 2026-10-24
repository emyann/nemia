/**
 * Claude Code as the engine runs it by default: a job unless the task asks for a background session (`claude --bg`), and every
 * verb given a session id reaching the mode that id belongs to — by its shape, with nothing remembered.
 *
 * Against the real worker, and two stand-ins: a fake `claude` on PATH, which records what `--bg`, `agents`, `stop` and `rm` were
 * given and prints what Claude Code prints; and, for a job, the Agent SDK's own stand-in CLI (`fixtures/stand-in-claude.ts`),
 * which the runner is given as its `claudeExecutable` — a job is no `claude` command line any more, so what it was given is read
 * where the SDK put it, in the stand-in's own folder (`argv.jsonl`, `said.jsonl`). Its plan rides the test process's environment,
 * which the bin's `Options.env` carries down to it.
 */
import { test, type TestContext } from 'node:test';

import assert from 'node:assert/strict';

import { Effect } from 'effect';

import fs from 'node:fs';

import childProcess from 'node:child_process';

import { syncBuiltinESMExports } from 'node:module';

import path from 'node:path';

import { scratch } from './scratch.ts';

import { ioCounts } from '../src/core/engine/tally.ts';

import { parentFileOf, type ParentCall } from '../src/harness/claude/parent.ts';

import type { Statement } from '../src/harness/claude/bg.ts';

import type { SpawnRequest } from '../src/harness/seam.ts';

import { stepClock } from './clock.ts';

import { until, WAITED, type Waiter } from '../src/waits/index.ts';

import { refusedOsError, TRANSIENT_ERRNOS } from '../src/harness/error.ts';
import { story } from './checkpoints.ts';

const tmp = (label: string) => scratch(`ae-claude-code-${label}-`);

/** Where Claude Code keeps transcripts: read when the runner is loaded, so set before the runner's import. */
const config = tmp('config');
process.env.CLAUDE_CONFIG_DIR = config;

const { claudeCodeOps, claudeJob } = await import('../src/harness/claude/code.ts');

const { STAND_IN } = await import('./attached-held.ts');

const { attachedOptions } = await import('../src/harness/claude/attached-options.ts');

const { asyncOps } = await import('./promise-runner.ts');

const { claudeOps, QUIESCENT_AFTER_MS } = await import('../src/harness/claude/bg.ts');

const { quietFileOf, sightingOf } = await import('../src/harness/claude/quiet.ts');

const { claudeCodeRefuses, claudeRefuses } = await import('../src/harness/claude/vocabulary.ts');

const { registryOf } = await import('../src/harness/claude/registry.ts');

const JOB_ID = '5e551011-0000-4000-8000-00000000000a';

const BG_ID = '5e551011-0000-4000-8000-00000000000b';

/**
 * A fake `claude`: `-p` records its arguments and, in `job-env`, whether background tasks are off and the default timeout of a
 * call (`unset` for a variable not set), prints its init line, and then reads its stdin a line at a time as Claude Code does —
 * recording each in `job-stdin`, and printing a result for each but a brief of `wait`, until its stdin ends. The result names its
 * `type` last, as Claude Code's does. `--bg` records its arguments, the same two variables in `bg-env`, and the file `sees` as it
 * finds it in `bg-saw` (`absent` when there is none); `agents` lists what `agents.json` holds, a line in `agents-calls` each time;
 * `stop` and `rm` are recorded in order.
 *
 * It is the stand-in Claude Code (`STAND_IN`) that the job road runs, not this one; `fake` sets the stand-in's plan and folder on
 * this process's environment, which reaches it because a job's own process lays the engine's environment under `Options.env`
 * (`attachedOptions`). `JOB_ID` is the session id it answers under, which `CLAUDE_INIT_START` reads off its first line.
 */
const fake = (sees?: string, plan: object = {}) => {
  const dir = tmp('bin');
  const echo = (line: object) => `      echo '${JSON.stringify(line)}'`;
  fs.writeFileSync(path.join(dir, 'agents.json'), '[]');
  fs.writeFileSync(
    path.join(dir, 'claude'),
    [
      '#!/bin/sh',
      'case "$1" in',
      `  agents) echo x >> '${dir}/agents-calls'; cat '${dir}/agents.json' ;;`,
      `  stop|rm) echo "$@" >> '${dir}/verbs' ;;`,
      `  --bg) ${sees ? `{ cat '${sees}' 2>/dev/null || echo absent; } > '${dir}/bg-saw'; ` : ''}printf '%s %s' "\${CLAUDE_CODE_DISABLE_BACKGROUND_TASKS-unset}" "\${BASH_DEFAULT_TIMEOUT_MS-unset}" > '${dir}/bg-env'; printf '%s\\n' "$@" > '${dir}/bg-args' ;;`,
      `  -p) printf '%s %s' "\${CLAUDE_CODE_DISABLE_BACKGROUND_TASKS-unset}" "\${BASH_DEFAULT_TIMEOUT_MS-unset}" > '${dir}/job-env.tmp'; mv '${dir}/job-env.tmp' '${dir}/job-env'`,
      `      printf '%s\\n' "$@" > '${dir}/job-args.tmp'; mv '${dir}/job-args.tmp' '${dir}/job-args'`,
      echo({ type: 'system', subtype: 'init', session_id: JOB_ID }),
      `      while IFS= read -r line; do printf '%s\\n' "$line" >> '${dir}/job-stdin'`,
      `        case "$line" in *'"content":"wait"'*) ;; *)`,
      '  ' +
        echo({
          subtype: 'success',
          is_error: false,
          session_id: JOB_ID,
          total_cost_usd: 0.03,
          structured_output: { outcome: 'done' },
          type: 'result',
        }),
      '        ;; esac',
      '      done ;;',
      'esac',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  const prev = process.env.PATH;
  process.env.PATH = `${dir}:${prev}`;
  const prevStandIn = { dir: process.env.STANDIN_DIR, plan: process.env.STANDIN_PLAN };
  process.env.STANDIN_DIR = dir;
  process.env.STANDIN_PLAN = JSON.stringify({ id: JOB_ID, cost: 0.03, output: { outcome: 'done' }, ...plan });
  const read = (f: string) => {
    try {
      return fs.readFileSync(path.join(dir, f), 'utf8').replace(/\n$/, '').split('\n');
    } catch {
      return undefined;
    }
  };
  return {
    dir,
    read,
    /** The lines the stand-in wrote into `file`, each parsed; `undefined` where it wrote none. */
    said: (file: string): unknown[] | undefined => {
      try {
        return fs
          .readFileSync(path.join(dir, file), 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((l) => JSON.parse(l) as unknown);
      } catch {
        return undefined;
      }
    },
    /** Lets a held turn of the stand-in go: the file it waits for. */
    end: () => fs.writeFileSync(path.join(dir, 'end'), ''),
    restore: () => {
      process.env.PATH = prev;
      for (const [key, value] of [
        ['STANDIN_DIR', prevStandIn.dir],
        ['STANDIN_PLAN', prevStandIn.plan],
      ] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    },
  };
};

/** The Claude Code runner's options over a store at `root`, a background session's clock and statement answered without a transcript. */
const opsOptions = (root: string) => ({
  claudeExecutable: STAND_IN,
  root,
  sessionsDir: tmp('sessions'),
  transcriptTime: async () => Date.now(),
  closeoutFrom: async () => undefined,
  usageFrom: async () => undefined,
});

/** The Claude Code runner over a store at `root` (`opsOptions`). */
const opsIn = (root: string) => claudeCodeOps(opsOptions(root));

/** What `read` answers, in test `t`, once it answers anything: read again every 100ms. */
const looked = <T>(t: Waiter, read: () => Promise<T | undefined>, what: string) => until(t, read, what, { everyMs: 100 });

test(
  'a job is run as its own process beside background sessions: seen by its name with its own id and answer, observed in one map, found by its run file, its words to its stdin, its conversation by its name or its id, and every verb routed by the shape of its id',
  WAITED,
  async (t) => {
    const s = story(t);
    const f = fake();
    t.after(() => f.restore());
    const root = tmp('root');
    const ops = opsIn(root);
    const calls = () => f.read('agents-calls')?.length ?? 0;
    const said = () => f.said('said.jsonl') ?? [];
    const done = (name: string, c: Waiter) =>
      looked(
        c,
        async () => {
          const seen = (await Effect.runPromise(ops.observe)).get(name);
          return seen?.state === 'completed' ? seen : undefined;
        },
        `${name} done`,
      );

    await s.test(
      'a task is run as a job unless it asks for a background session: seen by its name, with its own id and answer, and no `claude -p` spawned',
      async (c) => {
        await Effect.runPromise(ops.spawn({ name: 'ae/j/1', brief: 'go', cwd: f.dir }));
        const seen = await done('ae/j/1', c);
        assert.equal(f.read('job-args'), undefined, 'no `claude -p` was ever spawned for it');
        assert.deepEqual(said(), ['go'], 'the brief reached the session, and its input ended at the result');
        assert.equal(f.read('bg-args'), undefined, 'no background session for a job');
        assert.equal(seen.sessionId, 'ae/j/1', 'a job is known by its name');
        assert.equal(seen.nativeId, JOB_ID, "and carries Claude Code's own id, to resume and read by");
        assert.deepEqual(seen.closeout?.payload, { outcome: 'done' });
        assert.equal(seen.usage?.costUsd, 0.03);
      },
    );

    await s.test('a task that asks for a background session is `claude --bg`, named as the engine named it', async () => {
      await Effect.runPromise(ops.spawn({ name: 'ae/b/1', brief: 'go', cwd: f.dir, config: { background: true } }));
      assert.equal(f.read('bg-args')?.[0], '--bg');
      assert.equal(f.read('bg-args')?.includes('ae/b/1'), true, 'named as the engine named it');
    });

    await s.test(
      'a background session given a closed list of skills is refused before anything starts: `claude --bg` has no flag or setting that closes them',
      async () => {
        fs.rmSync(path.join(f.dir, 'bg-args'), { force: true });
        const refused = await Effect.runPromise(
          Effect.flip(ops.spawn({ name: 'ae/b/2', brief: 'go', cwd: f.dir, config: { background: true, enabledSkills: ['plug:review'] } })),
        );
        assert.equal(refused._tag, 'RunnerError');
        assert.equal(refused.refused, true, 'nothing started, and waiting will not change that');
        assert.equal(f.read('bg-args'), undefined, 'no `claude --bg` was spawned');
      },
    );

    await s.test(
      'observeFor asks `claude agents` only when a session expected is not a job: none for jobs alone or nothing, one for a background session; observe always',
      async () => {
        fs.writeFileSync(
          path.join(f.dir, 'agents.json'),
          JSON.stringify([{ name: 'ae/b/1', sessionId: BG_ID, state: 'working', status: 'busy', kind: 'background' }]),
        );
        const before = calls();
        const reads = ioCounts().reads;
        assert.equal((await Effect.runPromise(ops.observeFor!([]))).seen.size, 0, 'nothing expected: nothing listed');
        assert.equal(ioCounts().reads - reads, 0, 'and no run file read');
        const jobs = await Effect.runPromise(ops.observeFor!([{ name: 'ae/j/1', harness: 'claude' }]));
        assert.equal(jobs.seen.get('ae/j/1')?.sessionId, 'ae/j/1');
        assert.deepEqual(jobs.unread, new Set());
        assert.equal(calls() - before, 0, 'a pass with only jobs in flight spawns no `claude agents`');

        const both = await Effect.runPromise(
          ops.observeFor!([
            { name: 'ae/j/1', harness: 'claude' },
            { name: 'ae/b/1', harness: 'claude' },
          ]),
        );
        assert.equal(
          both.seen.get('ae/b/1')?.sessionId,
          BG_ID,
          "a background session is known by nothing on the task: its name is simply not a job's",
        );
        assert.equal(both.seen.get('ae/j/1')?.sessionId, 'ae/j/1');
        assert.equal(calls() - before, 1, 'one expected session that is no job: one `claude agents`');
        await Effect.runPromise(ops.observe);
        assert.equal(calls() - before, 2, 'observe, told nothing, still asks the registry');
      },
    );

    await s.test(
      'observe lists the jobs and the background sessions in one map — and a registry that will not answer hides only its own',
      async () => {
        const both = await Effect.runPromise(ops.observe);
        assert.equal(both.get('ae/b/1')?.sessionId, BG_ID);
        assert.equal(both.get('ae/j/1')?.sessionId, 'ae/j/1');
        fs.writeFileSync(path.join(f.dir, 'agents.json'), 'not json');
        const jobs = await Effect.runPromise(ops.observe);
        assert.equal(jobs.has('ae/j/1'), true, '`claude agents` failing does not hide a job');
        assert.equal(jobs.has('ae/b/1'), false);
      },
    );

    await s.test(
      "observeFor says which names a failed registry left unread — a background session's, and a job's not on disk — never a job it listed; once it answers, a name it lists not is gone",
      async () => {
        const o = await Effect.runPromise(
          ops.observeFor!([
            { name: 'ae/j/1', harness: 'claude' },
            { name: 'ae/b/1', harness: 'claude' },
            { name: 'ae/j/2', harness: 'claude' },
          ]),
        );
        assert.deepEqual([...o.seen.keys()], ['ae/j/1'], 'the registry failing does not hide a job');
        assert.deepEqual(o.unread, new Set(['ae/b/1', 'ae/j/2']), 'a name the failed read could have listed is unread, not gone');
        fs.writeFileSync(path.join(f.dir, 'agents.json'), JSON.stringify([]));
        const read = await Effect.runPromise(
          ops.observeFor!([
            { name: 'ae/b/1', harness: 'claude' },
            { name: 'ae/j/2', harness: 'claude' },
          ]),
        );
        assert.deepEqual(read.unread, new Set(), 'read, and not listed: gone, as the registry answered and lists neither');
      },
    );

    await s.test(
      'a row of ours `claude agents` lists that does not decode leaves that name unread, never gone, and a job still seen, until it decodes',
      async () => {
        const expected = [
          { name: 'ae/j/1', harness: 'claude' },
          { name: 'ae/b/1', harness: 'claude' },
        ];
        fs.writeFileSync(path.join(f.dir, 'agents.json'), JSON.stringify([{ name: 'ae/b/1', state: 'working', status: 'busy' }]));
        const refused = await Effect.runPromise(ops.observeFor!(expected));
        assert.deepEqual([...refused.seen.keys()], ['ae/j/1']);
        assert.deepEqual(refused.unread, new Set(['ae/b/1']), 'a row of ours with no session id is unread, not gone');
        fs.writeFileSync(
          path.join(f.dir, 'agents.json'),
          JSON.stringify([{ name: 'ae/b/1', sessionId: BG_ID, state: 'working', status: 'busy' }]),
        );
        const fixed = await Effect.runPromise(ops.observeFor!(expected));
        assert.equal(fixed.seen.get('ae/b/1')?.sessionId, BG_ID);
        assert.deepEqual(fixed.unread, new Set());
      },
    );

    await s.test(
      "a job is found by its run file and nothing else — no other job's, and no job's output, though every log changed since both ended; a name no job has is asked of Claude Code, and a run file another name folds onto is not the job asked for",
      async (c) => {
        await Effect.runPromise(ops.spawn({ name: 'ae/k/1', brief: 'go', cwd: f.dir }));
        await done('ae/k/1', c);
        const runs = path.join(root, 'runs', 'claude');
        for (const log of fs.readdirSync(runs).filter((n) => n.endsWith('.log'))) fs.appendFileSync(path.join(runs, log), '\n');
        const read: string[] = [];
        const readFileSync = fs.readFileSync;
        fs.readFileSync = ((file: fs.PathOrFileDescriptor, ...rest: unknown[]) => {
          read.push(String(file));
          return (readFileSync as (...a: unknown[]) => unknown)(file, ...rest);
        }) as typeof fs.readFileSync;
        let found;
        try {
          found = await Effect.runPromise(ops.find!('ae/j/1'));
        } finally {
          fs.readFileSync = readFileSync;
        }
        assert.deepEqual(found, { sessionId: 'ae/j/1' });
        assert.deepEqual(read, [path.join(runs, 'ae_j_1.json')], 'one file read, the run file of the job asked for');
        assert.equal(await Effect.runPromise(ops.find!('ae/b/9')), undefined, 'no registration by that name either');
        assert.equal(
          await Effect.runPromise(ops.find!('ae-j/1')),
          undefined,
          '`ae-j/1` is written at the same path as `ae/j/1`, and the file says whose it is',
        );
      },
    );

    await s.test(
      'a job resumed from a background session is a job, the SDK writing its resume as one argument — and, its parent not one of its runs, carries no cost it cannot tell from its parent',
      async (c) => {
        const argvs = f.said('argv.jsonl')?.length ?? 0;
        const bg = f.read('bg-args');
        await Effect.runPromise(ops.spawn({ name: 'ae/u/2', brief: 'go', cwd: f.dir, resumeFrom: BG_ID }));
        const seen = await done('ae/u/2', c);
        assert.ok(
          (f.said('argv.jsonl')?.[argvs] as string[] | undefined)?.includes(`--resume=${BG_ID}`),
          `the SDK wrote the resume as one argument: ${JSON.stringify(f.said('argv.jsonl')?.[argvs])}`,
        );
        assert.equal(f.read('job-args'), undefined, 'no `claude -p` was spawned');
        assert.deepEqual(f.read('bg-args'), bg, 'and no background session');
        assert.deepEqual(seen.closeout?.payload, { outcome: 'done' });
        assert.equal(seen.usage?.costUsd, undefined, "the printed total carries the background session's on");
      },
    );

    await s.test(
      'words said to a running job reach its stdin as the next user message, and once it has given its result it takes no more',
      async (c) => {
        process.env.STANDIN_PLAN = JSON.stringify({ id: JOB_ID, cost: 0.03, output: { outcome: 'done' }, hold: true });
        const before = said().length;
        await Effect.runPromise(ops.spawn({ name: 'ae/s/1', brief: 'wait', cwd: f.dir }));
        await looked(c, async () => (said().length > before ? true : undefined), 'the brief read');
        await Effect.runPromise(ops.say!({ name: 'ae/s/1', sessionId: 'ae/s/1' }, 'hello'));
        await looked(c, async () => (said().length === before + 2 ? true : undefined), 'the words heard by the session');
        assert.deepEqual(said().slice(before), ['wait', 'hello'], 'the brief, then the words, each a user message on its input');
        f.end();
        const answered = await done('ae/s/1', c);
        assert.deepEqual(answered.closeout?.payload, { outcome: 'done' }, 'the result its turn gave once it had heard them');
        const late = await Effect.runPromise(Effect.flip(ops.say!({ name: 'ae/s/1', sessionId: 'ae/s/1' }, 'too late')));
        assert.match(late.message, /^claude: `ae\/s\/1` has given its result/);
        assert.match(late.message, /and reads no more words/);
        assert.equal(
          fs
            .readFileSync(path.join(root, 'runs', 'claude', 'ae_s_1.inbox.jsonl'), 'utf8')
            .split('\n')
            .filter(Boolean).length,
          1,
          'nothing appended once refused',
        );
      },
    );

    await s.test("a running job's conversation is read by its name, and by Claude Code's id — the same transcript", async (c) => {
      fs.rmSync(path.join(f.dir, 'end'), { force: true });
      const file = path.join(config, 'projects', 'fake-project', `${JOB_ID}.jsonl`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(
        file,
        `${JSON.stringify({ type: 'user', uuid: 'u1', timestamp: new Date().toISOString(), message: { role: 'user', content: 'the brief' } })}\n`,
      );
      await Effect.runPromise(ops.spawn({ name: 'ae/j/4', brief: 'wait', cwd: f.dir }));
      const byName = await looked(
        c,
        async () => {
          const got = await Effect.runPromise(ops.transcript!('ae/j/4'));
          return got.events.length ? got : undefined;
        },
        'the transcript through the run file',
      );
      assert.equal(byName.events[0]?.text, 'the brief', 'read while it runs: the stream named the session first');
      const byId = await Effect.runPromise(ops.transcript!(JOB_ID));
      assert.deepEqual(byId.events, byName.events);
      await Effect.runPromise(ops.stop('ae/j/4'));
    });

    await s.test(
      'a stop, a release and words reach the mode the id belongs to, by its shape — with no observe made first, as after a restart',
      async (c) => {
        const before = said().length;
        await Effect.runPromise(ops.spawn({ name: 'ae/j/2', brief: 'wait', cwd: f.dir }));
        await looked(c, async () => (said().length > before ? true : undefined), 'the job started');
        fs.writeFileSync(path.join(f.dir, 'agents.json'), '[]');
        const fresh = opsIn(root);
        const verbs = () => f.read('verbs') ?? [];
        await Effect.runPromise(fresh.stop('ae/j/2'));
        await Effect.runPromise(fresh.stop(BG_ID));
        assert.deepEqual(verbs(), ['stop 5e551011'], 'a background session is stopped by `claude stop`, a job never');
        const stopped = await looked(
          c,
          async () => {
            const seen = (await Effect.runPromise(fresh.observe)).get('ae/j/2');
            return seen?.state === 'canceled' ? seen : undefined;
          },
          'the job stopped by its worker',
        );
        assert.equal(stopped.sessionId, 'ae/j/2');
        await Effect.runPromise(fresh.release!(stopped, {}));
        assert.deepEqual(verbs(), ['stop 5e551011'], 'releasing a job asks Claude Code for nothing');
        await Effect.runPromise(fresh.release!({ sessionId: BG_ID, state: 'completed' }, {}));
        assert.deepEqual(verbs(), ['stop 5e551011', 'rm 5e551011'], "a background session is removed from Claude Code's list");
        const toJob = await Effect.runPromise(Effect.flip(fresh.say!({ name: 'ae/j/2', sessionId: 'ae/j/2' }, 'hello')));
        assert.match(toJob.message, /^claude: `ae\/j\/2` is `stopped`, not running/, "a job's words go to its worker");
        const toBg = await Effect.runPromise(Effect.flip(fresh.say!({ name: 'ae/b/1', sessionId: BG_ID }, 'hello')));
        assert.match(toBg.message, /^claude --bg: /, 'words for a background session go to its inbox');
      },
    );
  },
);

test('a pass over many ended jobs reads the run file and output of the job it expects, and no other', async () => {
  const f = fake();
  try {
    const root = tmp('root');
    const runs = path.join(root, 'runs', 'claude');
    fs.mkdirSync(runs, { recursive: true });
    const at = new Date().toISOString();
    for (let i = 0; i <= 200; i++) {
      const file = path.join(runs, `ae_s${i}_1`);
      fs.writeFileSync(
        `${file}.json`,
        JSON.stringify({
          name: `ae/s${i}/1`,
          state: 'done',
          exitCode: 0,
          pid: 999999,
          logFile: `${file}.log`,
          startedAt: at,
          heartbeatAt: at,
        }),
      );
      fs.writeFileSync(`${file}.log`, `${JSON.stringify({ type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0.01 })}\n`);
    }
    const full = await Effect.runPromise(opsIn(root).observe);
    const ops = opsIn(root);
    const calls = f.read('agents-calls')?.length;
    const before = ioCounts().reads;
    const told = await Effect.runPromise(ops.observeFor!([{ name: 'ae/s7/1', harness: 'claude' }]));
    const reads = ioCounts().reads - before;
    assert.ok(reads <= 3, `read ${reads} files: its run file, what its output said and its closeout`);
    assert.deepEqual([...told.seen.keys()], ['ae/s7/1']);
    assert.deepEqual(told.seen.get('ae/s7/1'), full.get('ae/s7/1'));
    assert.equal(f.read('agents-calls')?.length, calls, 'and no `claude agents`: the job answered');
  } finally {
    f.restore();
  }
});

test('observeFor: what a failed read leaves unread, never absent — a background session whose transcript cannot be read, a job whose run file is half written', async (t) => {
  await t.test(
    'REFUSED: observeFor keeps the name of a background session the registry lists and whose transcript it cannot read as unread, never absent, and reads the other beside it',
    async () => {
      const f = fake();
      try {
        const bad = '5e551011-0000-4000-8000-0000000000bd';
        const rows = [
          { name: 'ae/b/1', sessionId: bad, state: 'done', status: 'idle', kind: 'background' },
          { name: 'ae/g/1', sessionId: BG_ID, state: 'done', status: 'idle', kind: 'background' },
        ];
        fs.writeFileSync(path.join(f.dir, 'agents.json'), JSON.stringify(rows));
        const ops = claudeCodeOps({
          ...opsOptions(tmp('root')),
          closeoutFrom: async (sessionId: string) => {
            if (sessionId === bad) throw new Error('line 2 of the transcript is a `user` line whose `timestamp` is "yesterday"');
            return { payload: { outcome: 'done' }, at: 5 };
          },
        });
        const o = await Effect.runPromise(
          ops.observeFor!([
            { name: 'ae/b/1', harness: 'claude' },
            { name: 'ae/g/1', harness: 'claude' },
          ]),
        );
        assert.deepEqual(o.unread, new Set(['ae/b/1']), 'the registry answered, and left it unread');
        assert.deepEqual([...o.seen.keys()], ['ae/g/1']);
        assert.deepEqual(o.seen.get('ae/g/1')?.closeout, { payload: { outcome: 'done' }, at: 5 });
        assert.deepEqual([...(o.unreadWhy?.keys() ?? [])], ['ae/b/1'], 'why it alone is unread, kept through the jobs and the registry');
        for (const said of ["`ae/b/1`'s transcript cannot be read", 'whose `timestamp` is "yesterday"']) {
          assert.ok(o.unreadWhy?.get('ae/b/1')?.includes(said), o.unreadWhy?.get('ae/b/1'));
        }
      } finally {
        f.restore();
      }
    },
  );
  await t.test('a job whose run file is there and half written is unread, never gone, when `claude agents` lists nothing', async () => {
    const f = fake();
    try {
      const root = tmp('root');
      const runs = path.join(root, 'runs', 'claude');
      fs.mkdirSync(runs, { recursive: true });
      fs.writeFileSync(path.join(runs, 'ae_j_3.json'), '{"name": "ae/j/3", "sta');
      const told = await Effect.runPromise(opsIn(root).observeFor!([{ name: 'ae/j/3', harness: 'claude' }]));
      assert.deepEqual([...told.seen.keys()], []);
      assert.deepEqual(told.unread, new Set(['ae/j/3']));
      assert.equal(f.read('agents-calls')?.length, 1, 'the registry was asked, and lists nothing');
    } finally {
      f.restore();
    }
  });
});

test("a row of ours `claude agents` lists that does not decode is said on the pass's report, in the registry's words for the row and its field, and on no pass after it decodes", async () => {
  const f = fake();
  try {
    const { Engine } = await import('../src/index.ts');
    const { builtEngine } = await import('./engine.ts');
    const e = builtEngine(Engine.layer({ root: tmp('root'), harnesses: { claude: 'claude' } }));
    const id = await Effect.runPromise(e.file({ brief: 'go', cwd: f.dir, config: { background: true } }));
    const started = await Effect.runPromise(e.tick());
    assert.deepEqual(started.unobserved, [], 'nothing to say while the registry reads');
    assert.equal(f.read('bg-args')?.includes(`ae/${id}/1`), true, 'the session was started in the background');

    const listing = JSON.stringify([{ name: `ae/${id}/1`, state: 'working', status: 'busy' }]);
    fs.writeFileSync(path.join(f.dir, 'agents.json'), listing);
    const refused = await Effect.runPromise(e.tick());
    const words = registryOf(listing);
    assert.ok('wrong' in words && words.wrong.includes(`lists \`ae/${id}/1\`, a session of ours, and its \`sessionId\` is missing`));
    assert.deepEqual(refused.unobserved, [`harness \`claude\`: ${words.wrong}`], "the registry's words, naming the harness");
    assert.equal(refused.observed.claude?.unread, 1, 'and the name is unread');
    assert.equal(refused.actions, 0, 'with nothing done on an unread name');

    fs.writeFileSync(
      path.join(f.dir, 'agents.json'),
      JSON.stringify([{ name: `ae/${id}/1`, sessionId: BG_ID, state: 'working', status: 'busy' }]),
    );
    const fixed = await Effect.runPromise(e.tick());
    assert.deepEqual(fixed.unobserved, [], 'a listing that decodes leaves nothing said, nothing kept from the pass before');
  } finally {
    f.restore();
  }
});

/** Every flag in `args` as `config.claude` would name it: `--permission-mode` is `permissionMode`, `-p` is `p`. */
const flagsIn = (args: readonly string[]) =>
  args.filter((a) => a.startsWith('-')).map((a) => a.replace(/^--?/, '').replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()));

/** A config that makes a spawn give every flag it can. */
const EVERYTHING = {
  tools: ['Read'],
  disallowedTools: ['SendMessage'],
  allowedTools: ['Edit(**)'],
  permissionMode: 'dontAsk',
  model: 'opus',
  effort: 'high',
  contextTokens: 200000,
  worktree: 'w',
  budgetUsd: 1,
  mcp: { m: { command: 'x' } },
  mounts: [{ path: '/srv/notes', readOnly: true }],
};

/** A task's mounts, one read-only and one writable, and the argv each Claude Code spawn gives them. */
const MOUNTED = {
  disallowedTools: ['SendMessage'],
  mounts: [
    { path: '/srv/notes', readOnly: true },
    { path: '/srv/scratch', readOnly: false },
  ],
};

/**
 * The argv of `claude-detached` and of a background session, for one `config`. A job has no argv of ours: its session's facts are
 * `attachedOptions`, held to `claudePrintFlags`' argv fact for fact by `attached-options.test.ts`.
 */
const spawnArgvs = async (config: SpawnRequest['config']): Promise<(readonly [string, string[]])[]> => {
  const { claudeDetached } = await import('../src/harness/claude/code.ts');
  const f = fake();
  try {
    await Effect.runPromise(
      opsIn(tmp('root')).spawn({ name: 'ae/b/1', brief: 'the brief', cwd: f.dir, config: { ...config, background: true } }),
    );
    return [
      ['claude-detached', claudeDetached.command({ name: 'ae/t/1', brief: 'the brief', cwd: '/r', config }).args],
      ['a background session', f.read('bg-args')!],
    ];
  } finally {
    f.restore();
  }
};

/** Paths a permission rule cannot carry, one per character `CLAUDE_UNRULED` holds: each ends, misses or widens the rule. */
const UNRULED_MOUNTS = [
  '/srv/(x)',
  '/srv/a)',
  '/srv/*',
  '/srv/a?',
  '/srv/[a]',
  '/srv/a]',
  '/srv/a\\b',
  '/srv/a\tb',
  '/srv/a\nb',
  `/srv/a${String.fromCharCode(0xa0)}b`,
  `/srv/a${String.fromCharCode(0x2028)}b`,
];

/** Asserts `says` refuses the mount of `at`, given `how`, naming the path, the rule that cannot carry it and the fix. */
const mountRefused = (says: string | undefined, at: string, how: 'read-only' | 'writable', what: string) => {
  assert.ok(says?.startsWith(`\`mounts\` gives the session ${JSON.stringify(at)} ${how}, and Claude Code `), `${what}: ${says}`);
  for (const words of ['by a permission rule, which cannot name a path with a parenthesis', 'Mount a folder whose path has none of them']) {
    assert.ok(says?.includes(words), `${what}: ${says}`);
  }
  assert.ok(says?.endsWith('or leave the mount off.'), `${what}: ${says}`);
};

/** Paths a permission rule carries, as measured on Claude Code 2.1.291: a space, a comma and braces inside its parentheses. */
const RULED_MOUNTS = ['/srv/my notes', '/srv/a,b', '/srv/{a,b}', '/srv/plain'];

const JOB_ENV_KEYS = ['CLAUDE_CODE_DISABLE_BACKGROUND_TASKS', 'BASH_DEFAULT_TIMEOUT_MS'] as const;

test("Claude Code's roads, pinned: a job's command and options, claude-detached's and a background session's argv — its own flags, mounts, setting sources and environment", async (t) => {
  await t.test(
    'a job is this runtime’s own process running one session on the Agent SDK — no `claude -p` argv anywhere on its road',
    async () => {
      const { CLAUDE_JOB_BIN, claudeJobSpec } = await import('../src/harness/claude/code.ts');
      const request = {
        name: 'ae/t/1',
        brief: 'the prompt',
        cwd: '/r',
        resumeFrom: BG_ID,
        config: { tools: ['Read', 'Bash'], permissionMode: 'dontAsk', budgetUsd: 0.5 },
      };
      const at = '/store/runs/claude/ae_t_1.request.json';
      const { cmd, args, env } = claudeJob.command(request, { requestFile: at });
      assert.equal(cmd, process.execPath, 'this runtime’s own node');
      assert.deepEqual(args, [CLAUDE_JOB_BIN, at], 'the bin and the spawn request it reads, and nothing else');
      assert.equal(args.includes('-p'), false, 'no `-p`: the job is no longer a Claude Code command line');
      assert.equal(claudeJob.needsRequest, true, 'which is why the runner writes it one');
      assert.equal(env, undefined, 'the session’s own environment is laid inside the bin, never on the engine’s child');
      assert.deepEqual(
        JSON.parse(claudeJob.input!.line('the prompt')),
        { type: 'user', message: { role: 'user', content: 'the prompt' } },
        'the brief is a user message on its stdin, as M6 wrote one',
      );
      const given = attachedOptions(request);
      assert.deepEqual(given.tools, ['Read', 'Bash']);
      assert.equal(given.permissionMode, 'dontAsk');
      assert.equal(given.maxBudgetUsd, 0.5, 'a job keeps its cap');
      assert.equal(given.resume, BG_ID);
      assert.equal(given.includePartialMessages, true, 'and is followed live, as `--include-partial-messages` made it');
      assert.equal(attachedOptions({ name: 'ae/t/1', brief: 'b', cwd: '/r' }).permissionMode, 'auto', 'the default mode, as before');
      assert.equal(
        claudeJobSpec('/opt/claude/cli.js').command(request, { requestFile: at }).env?.AE_CLAUDE_EXECUTABLE,
        '/opt/claude/cli.js',
        'the Claude Code the engine named reaches the bin, and nothing else does',
      );
      assert.equal(claudeJobSpec().command(request, { requestFile: at }).env, undefined, 'and none is named where the engine names none');
    },
  );
  await t.test(
    "Claude Code's own flags (`config.claude`) are handed over as written, after the variadic lists and directly before the mode — on a job, on claude -p's other spec and on a background session",
    async () => {
      const claude = {
        appendSystemPromptFile: '/a/prompt.md',
        pluginDir: ['/a/nemia-x', '/a/nemia-y'],
        settings: '{"outputStyle":"nemia-x:no-coding"}',
        bare: true as const,
      };
      const want = [
        '--append-system-prompt-file',
        '/a/prompt.md',
        '--plugin-dir',
        '/a/nemia-x',
        '--plugin-dir',
        '/a/nemia-y',
        '--settings',
        '{"outputStyle":"nemia-x:no-coding","autoMemoryEnabled":false}',
        '--bare',
      ];
      const { claudeDetached } = await import('../src/harness/claude/code.ts');
      const detached = claudeDetached.command({ name: 'ae/t/1', brief: 'b', cwd: '/r', config: { tools: ['Read', 'Skill'], claude } }).args;
      const f = fake();
      let bg: string[];
      try {
        await Effect.runPromise(
          opsIn(tmp('root')).spawn({
            name: 'ae/b/1',
            brief: 'b',
            cwd: f.dir,
            config: { background: true, tools: ['Read', 'Skill'], claude },
          }),
        );
        bg = f.read('bg-args')!;
      } finally {
        f.restore();
      }
      for (const [what, args] of [
        ['claude-detached', detached],
        ['a background session', bg],
      ] as const) {
        const at = args.indexOf('--append-system-prompt-file');
        assert.deepEqual(args.slice(at, at + want.length), want, what);
        assert.equal(args[at + want.length], '--permission-mode', `${what}: directly before the mode`);
        assert.ok(args.indexOf('--tools') < at, `${what}: after the variadic list, which the first of them ends`);
      }
      assert.deepEqual(
        claudeDetached.command({ name: 'ae/t/1', brief: 'b', cwd: '/r', config: { claude: {} } }).args,
        claudeDetached.command({ name: 'ae/t/1', brief: 'b', cwd: '/r' }).args,
        'none given, none handed over: the argv is what it is without them',
      );
      const { appendSystemPromptFile: _, ...rest } = claude;
      const flagged = attachedOptions({ name: 'ae/t/1', brief: 'b', cwd: '/r', config: { tools: ['Read', 'Skill'], claude: rest } });
      assert.deepEqual(
        flagged.plugins?.map((p) => p.path),
        [path.resolve('/r', '/a/nemia-x'), path.resolve('/r', '/a/nemia-y')],
      );
      assert.deepEqual(flagged.settings, { outputStyle: 'nemia-x:no-coding', autoMemoryEnabled: false });
      assert.equal(
        flagged.extraArgs?.bare,
        null,
        'a job: what the SDK has no option for is on `extraArgs`, the rest on its own option — held to this argv fact for fact by `attached-options.test.ts`',
      );
    },
  );
  await t.test(
    'a mount is `--add-dir` and its path, ended by a flag, a read-only one an edit denied under it, in the one deny list, and a writable one an edit allowed under it, in the one allow list — on claude-detached and on a background session',
    async () => {
      for (const [what, args] of await spawnArgvs({ ...MOUNTED, allowedTools: ['Edit(**)'] })) {
        assert.equal(args.filter((a) => a === '--allowedTools').length, 1, `${what}: one allow list`);
        assert.equal(
          args[args.indexOf('--allowedTools') + 1],
          'Edit(**),Edit(//srv/scratch/**)',
          `${what}: the writable mount is allowed, and the read-only one is not`,
        );
      }
      const allowed = (await spawnArgvs({ mounts: [{ path: '/srv/scratch', readOnly: false }] })).map(
        ([, args]) => args[args.indexOf('--allowedTools') + 1],
      );
      assert.deepEqual(
        allowed,
        ['Edit(//srv/scratch/**)', 'Edit(//srv/scratch/**)'],
        'a writable mount alone is an allow list of its own: `dontAsk` refuses a write under an added folder that no allow names',
      );
      for (const [what, args] of await spawnArgvs(MOUNTED)) {
        const at = args.indexOf('--add-dir');
        assert.deepEqual(args.slice(at, at + 3), ['--add-dir', '/srv/notes', '/srv/scratch'], what);
        assert.ok(args[at + 3].startsWith('--'), `${what}: a flag ends the variadic list, never the brief`);
        assert.equal(args.filter((a) => a === '--disallowedTools').length, 1, `${what}: one deny list`);
        assert.equal(
          args[args.indexOf('--disallowedTools') + 1],
          'SendMessage,Edit(//srv/notes/**)',
          `${what}: the writable mount is not denied`,
        );
      }
      const denied = (await spawnArgvs({ mounts: [{ path: '/srv/notes', readOnly: true }] })).map(
        ([, args]) => args[args.indexOf('--disallowedTools') + 1],
      );
      assert.deepEqual(denied, ['Edit(//srv/notes/**)', 'Edit(//srv/notes/**)'], 'a read-only mount alone is a deny list of its own');
    },
  );
  await t.test(
    'a task with no mounts is given what it was given before mounts existed, on a job, on claude-detached and on a background session',
    async () => {
      const config = {
        tools: ['Read'],
        disallowedTools: ['SendMessage'],
        allowedTools: ['Edit(**)'],
        permissionMode: 'dontAsk',
        model: 'opus',
      };
      const argvs = Object.fromEntries(
        (await spawnArgvs(config)).map(([what, args]) => [what, args.filter((a) => !a.includes('ae-claude-code-'))]),
      );
      assert.deepEqual(argvs, PINNED_ARGV);
      const { env, ...given } = attachedOptions({ name: 'ae/t/1', brief: 'the brief', cwd: '/r', config });
      assert.ok(env, "a job's environment is its own, and is read where it is laid (`attached-options.test.ts`)");
      assert.deepEqual(given, PINNED_JOB_OPTIONS);
    },
  );
  await t.test(
    "a job reads its checkout's shared settings and neither the operator's nor a `settings.local.json` — once, on a job and on `claude-detached`; a background session is not given it",
    async () => {
      const { claudeDetached } = await import('../src/harness/claude/code.ts');
      const sources = (args: string[]) => args.flatMap((a, i) => (a === '--setting-sources' ? [args[i + 1]] : []));
      const f = fake();
      let bg: string[];
      try {
        await Effect.runPromise(opsIn(tmp('root')).spawn({ name: 'ae/b/1', brief: 'go', cwd: f.dir, config: { background: true } }));
        bg = f.read('bg-args')!;
      } finally {
        f.restore();
      }
      assert.deepEqual(sources(claudeDetached.command({ name: 'ae/t/1', brief: 'b', cwd: '/r' }).args), ['project'], 'claude-detached');
      assert.deepEqual(
        attachedOptions({ name: 'ae/t/1', brief: 'b', cwd: '/r', config: { claude: { settings: '{}' } } }).settingSources,
        ['project'],
        "a job, on the SDK's own option, beside the caller's own settings",
      );
      assert.deepEqual(sources(bg), [], 'a background session reads what it read before');
    },
  );
  await t.test(
    "REFUSED at shipped defaults: a job runs with background tasks off and its calls' default timeout at the most one may take, on a job and on `claude-detached`; a background session is left as it is",
    async () => {
      const { claudeDetached } = await import('../src/harness/claude/code.ts');
      const saved = JOB_ENV_KEYS.map((key) => [key, process.env[key]] as const);
      for (const key of JOB_ENV_KEYS) delete process.env[key];
      const f = fake();
      let job: Record<string, string | undefined> | undefined;
      let bg: string[] | undefined;
      try {
        job = attachedOptions({ name: 'ae/j/1', brief: 'go', cwd: f.dir }).env;
        await Effect.runPromise(opsIn(tmp('root')).spawn({ name: 'ae/b/1', brief: 'go', cwd: f.dir, config: { background: true } }));
        bg = f.read('bg-env');
      } finally {
        f.restore();
        for (const [key, value] of saved) if (value !== undefined) process.env[key] = value;
      }
      assert.deepEqual(
        JOB_ENV_KEYS.map((key) => job?.[key]),
        ['1', '600000'],
        "the environment a job's own process lays on the session it runs",
      );
      assert.deepEqual(
        claudeDetached.command({ name: 'ae/t/1', brief: 'b', cwd: '/r' }).env,
        { CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1', BASH_DEFAULT_TIMEOUT_MS: '600000' },
        'claude-detached',
      );
      assert.deepEqual(bg, ['unset unset'], 'a background session runs as it did before');
    },
  );
  await t.test(
    'a bridge asked in `config.claude` reaches a background session as --remote-control, first of the bag and directly before the mode when it is written first',
    async () => {
      const f = fake();
      let bg: string[];
      try {
        await Effect.runPromise(
          opsIn(tmp('root')).spawn({
            name: 'ae/b/1',
            brief: 'b',
            cwd: f.dir,
            config: { background: true, tools: ['Read'], claude: { remoteControl: true, appendSystemPromptFile: '/a/p.md' } },
          }),
        );
        bg = f.read('bg-args')!;
      } finally {
        f.restore();
      }
      const at = bg.indexOf('--remote-control');
      assert.deepEqual(bg.slice(at, at + 6), [
        '--remote-control',
        '--append-system-prompt-file',
        '/a/p.md',
        '--settings',
        '{"autoMemoryEnabled":false}',
        '--permission-mode',
      ]);
      assert.equal(bg.filter((a) => a === '--remote-control').length, 1, 'once: the runtime gives it no other way');
    },
  );
});

test("REFUSED at the door: Claude Code's flags on the wrong mode or harness, a flag the runtime gives itself, and a mount no permission rule can name", async (t) => {
  await t.test(
    'what the default Claude Code refuses depends on the mode: a job refuses a bridge, named or not, a background session a spend cap — each naming the other',
    () => {
      assert.equal(claudeCodeRefuses({ brief: 'b', cwd: '/r', config: { budgetUsd: 1 } }), undefined, 'a job keeps a cap');
      assert.equal(claudeCodeRefuses({ brief: 'b', cwd: '/r', config: { background: true, claude: { remoteControl: true } } }), undefined);
      assert.equal(claudeCodeRefuses({ brief: 'b', cwd: '/r' }), undefined);
      for (const remoteControl of [true, 'phone'] as const) {
        const bridge = claudeCodeRefuses({ brief: 'b', cwd: '/r', config: { claude: { remoteControl } } });
        assert.ok(
          bridge &&
            bridge.startsWith('`claude.remoteControl` bridges a session to claude.ai') &&
            bridge.includes('`config.background: true`'),
          bridge,
        );
      }
      const cap = claudeCodeRefuses({ brief: 'b', cwd: '/r', config: { budgetUsd: 0.5, background: true } });
      assert.ok(cap && cap.startsWith('`budgetUsd: 0.5` is a spend cap') && cap.includes('Leave `config.background` off'), cap);
      for (const background of [undefined, true]) {
        assert.match(
          claudeCodeRefuses({ brief: 'b', cwd: '/r', config: { background, effort: 'huge' } }) ?? '',
          /^`effort: huge` is not an effort Claude Code has/,
        );
        assert.match(
          claudeCodeRefuses({ brief: 'b', cwd: '/r', config: { background, permissionMode: 'yolo' } }) ?? '',
          /^`permissionMode: yolo` is not a mode/,
        );
      }
    },
  );
  await t.test(
    'REFUSED at shipped defaults: a mount whose path a permission rule cannot name, read-only or writable, on a job, on a background session and on claude-detached',
    async () => {
      const { Engine } = await import('../src/index.ts');
      const { builtEngine } = await import('./engine.ts');
      const e = builtEngine(Engine.layer({ root: tmp('root') }));
      for (const at of UNRULED_MOUNTS) {
        for (const [harness, background] of [
          ['claude', false],
          ['claude', true],
          ['claude-detached', false],
        ] as const) {
          const config = { background: background || undefined, mounts: [{ path: at, readOnly: true }] };
          const refused = await Effect.runPromise(e.file({ brief: 'b', cwd: tmp('cwd'), harness, config })).then(
            () => undefined,
            (err: Error & { _tag?: string }) => err,
          );
          const what = `${harness}${background ? ' --bg' : ''}: ${at}`;
          assert.equal(refused?._tag, 'FileRefused', what);
          mountRefused(refused.message, at, 'read-only', what);
        }
      }
      for (const at of UNRULED_MOUNTS) {
        const says = claudeRefuses({ brief: 'b', cwd: '/r', config: { mounts: [{ path: at, readOnly: false }] } });
        mountRefused(says, at, 'writable', at);
      }
    },
  );
  await t.test(
    'a mount whose path holds a space, a comma or braces is taken, read-only or writable, as a permission rule carries them',
    () => {
      for (const at of RULED_MOUNTS) {
        for (const readOnly of [true, false]) {
          assert.equal(
            claudeRefuses({ brief: 'b', cwd: '/r', config: { mounts: [{ path: at, readOnly }] } }),
            undefined,
            `${at} ${readOnly}`,
          );
        }
      }
    },
  );
  await t.test(
    "the mount guard and the vocabulary door's `unruledIn` refuse the same paths, so a caller asking the door is never refused later",
    async () => {
      const { unruledIn } = await import('../src/vocabulary.ts');
      for (const at of [...UNRULED_MOUNTS, ...RULED_MOUNTS]) {
        const refused = claudeRefuses({ brief: 'b', cwd: '/r', config: { mounts: [{ path: at, readOnly: true }] } }) !== undefined;
        assert.equal(unruledIn('claude', at) !== undefined, refused, JSON.stringify(at));
      }
    },
  );
  await t.test(
    'REFUSED at shipped defaults: a bridge in `config.claude` on the claude -p specs, which would spell it onto a prompt that runs and exits — the Effect door asks them alone',
    async () => {
      const { claudeDetached } = await import('../src/harness/claude/code.ts');
      for (const [what, spec] of [
        ['a job', claudeJob],
        ['claude-detached', claudeDetached],
      ] as const) {
        const says = spec.refuses?.({ brief: 'b', cwd: '/r', config: { claude: { remoteControl: true } } }) ?? '';
        assert.ok(
          says.startsWith(
            '`claude.remoteControl` asks for a session bridged to claude.ai, and a session that runs one prompt and exits is held by its own process',
          ),
          `${what}: ${says}`,
        );
        assert.equal(
          spec.refuses?.({ brief: 'b', cwd: '/r', config: { claude: { appendSystemPromptFile: 'p.md' } } }),
          undefined,
          `${what}: the rest of the bag is taken`,
        );
      }
    },
  );
  await t.test(
    'REFUSED at shipped defaults: a flag the runtime gives Claude Code itself, in `config.claude` — and every flag a spawn gives is on that list',
    async () => {
      const { CLAUDE_OWNED_FLAGS } = await import('../src/harness/claude/vocabulary.ts');
      const { claudeDetached } = await import('../src/harness/claude/code.ts');
      const request = { name: 'ae/t/1', brief: 'b', cwd: '/r', resumeFrom: BG_ID, closeoutSchema: { type: 'object' }, config: EVERYTHING };
      const io = { projectMcpConfig: '/r/.mcp.json', mcpConfigFile: '/m.json' };
      const f = fake();
      let bg: string[];
      try {
        await Effect.runPromise(
          opsIn(tmp('root')).spawn({
            ...request,
            name: 'ae/b/1',
            cwd: f.dir,
            config: { ...EVERYTHING, budgetUsd: undefined, background: true },
          }),
        );
        bg = f.read('bg-args')!;
      } finally {
        f.restore();
      }
      assert.deepEqual(
        flagsIn(claudeJob.command(request, { ...io, requestFile: '/r.json' }).args),
        [],
        'a job gives Claude Code no flag at all: its argv is the bin and the spawn request it reads',
      );
      for (const [what, args] of [
        ['claude-detached', claudeDetached.command(request, io).args],
        ['a background session', bg],
      ] as const) {
        const stray = flagsIn(args).filter((flag) => !CLAUDE_OWNED_FLAGS.includes(flag) && flag !== 'settings');
        assert.deepEqual(stray, [], `${what} gives flags the list does not name`);
        assert.equal(args.filter((a) => a === '--settings').length, 1, `${what}: the session's auto-memory is merged into one --settings`);
      }
      for (const owned of CLAUDE_OWNED_FLAGS) {
        for (const refuses of [claudeRefuses, claudeCodeRefuses]) {
          const says = refuses({ brief: 'b', cwd: '/r', config: { claude: { [owned]: 'x' } } }) ?? '';
          assert.ok(says.startsWith(`\`claude.${owned}\` is a flag the runtime gives Claude Code itself`), `${owned}: ${says}`);
        }
      }
      assert.equal(
        claudeRefuses({ brief: 'b', cwd: '/r', config: { claude: { appendSystemPromptFile: 'p.md', pluginDir: ['d'] } } }),
        undefined,
        'what the orchestrator gives is taken',
      );
    },
  );
  await t.test(
    "REFUSED at shipped defaults: Claude Code's flags on a harness that is not Claude Code — codex, and any spec that does not say it is — at the engine's door and codex's own",
    async () => {
      const { codex } = await import('../src/index.ts');
      const { Engine } = await import('../src/index.ts');
      const { builtEngine } = await import('./engine.ts');
      const other = { name: 'other', command: () => ({ cmd: 'true', args: [] }) };
      const e = builtEngine(Engine.layer({ root: tmp('root'), harnesses: { claude: 'claude', codex, other } }));
      const claude = { appendSystemPromptFile: '/a/prompt.md' };
      for (const harness of ['codex', 'other']) {
        await assert.rejects(
          Effect.runPromise(e.file({ brief: 'b', cwd: '/r', harness, config: { claude } })),
          (err: Error & { _tag?: string }) => {
            assert.equal(err._tag, 'FileRefused', err.message);
            assert.ok(
              err.message.startsWith(`\`claude\` gives Claude Code flags of its own, and the \`${harness}\` harness is not Claude Code`),
              err.message,
            );
            assert.ok(err.message.includes('File the task on `claude`'), err.message);
            return true;
          },
        );
      }
      const codexSays = codex.refuses!({ brief: 'b', cwd: '/r', config: { claude } }) ?? '';
      assert.match(codexSays, /^`claude: \{"appendSystemPromptFile":"\/a\/prompt\.md"\}` gives /);
      assert.match(codexSays, /Claude Code flags of its own, and `codex exec` is not Claude Code/);
      assert.equal(codex.refuses!({ brief: 'b', cwd: '/r' }), undefined);
      await assert.rejects(
        Effect.runPromise(e.file({ brief: 'b', cwd: '/r', harness: 'codex', config: { codex: { x: 1 } } as never })),
        /`codex\.x` is not one of Codex's arguments/,
        "Codex's bag holds its own arguments, and a key that is none of them is refused",
      );
    },
  );
});

test(
  "a flag Claude Code does not have fails the attempt as the CLI fails it — nothing on stdout, its words on stderr, exit 1 — and the CLI's own words reach the attempt's logs",
  WAITED,
  async (t) => {
    const dir = tmp('bin');
    fs.writeFileSync(
      path.join(dir, 'claude'),
      [
        '#!/bin/sh',
        'case "$1" in',
        '  agents) echo "[]" ;;',
        '  *) for a in "$@"; do case "$a" in --frobnicate) echo "error: unknown option \'--frobnicate\'" >&2; exit 1 ;; esac; done; exit 0 ;;',
        'esac',
        '',
      ].join('\n'),
      { mode: 0o755 },
    );
    const prev = process.env.PATH;
    process.env.PATH = `${dir}:${prev}`;
    try {
      const { Engine } = await import('../src/index.ts');
      const { builtEngine } = await import('./engine.ts');
      const e = builtEngine(Engine.layer({ root: tmp('root'), harnesses: { claude: 'claude' } }));
      const id = await Effect.runPromise(e.file({ brief: 'b', cwd: dir, config: { claude: { frobnicate: true } } }));
      await until(
        t,
        async () => {
          if ((await Effect.runPromise(e.view(id))).state.settled) return true;
          await Effect.runPromise(e.tick());
          return false;
        },
        `${id} settled`,
        { everyMs: 50 },
      );
      const v = await Effect.runPromise(e.view(id));
      assert.equal(v.phase, 'failed', 'an ordinary failed end');
      assert.equal(v.state.attempts[0]?.exitCode, 1, 'with the exit code the CLI gave');
      assert.match(
        await Effect.runPromise(e.logs(id)),
        /error: unknown option '--frobnicate'/,
        "and the CLI's words, where a person reads why",
      );
    } finally {
      process.env.PATH = prev;
    }
  },
);

const PARENT_ID = '5e551011-0000-4000-8000-00000000000c';

const PARENT_CALL = 'toolu_01Parent';

const OWN_CALL = 'toolu_01Child';

/** The Claude Code runner over a store at `root`, a resumed session's parent's last call answered by `parent` without a transcript. */
const bgOps = (root: string, parent: (sessionId: string) => Promise<ParentCall | undefined> = async () => ({ lastCall: PARENT_CALL })) =>
  claudeCodeOps({ ...opsOptions(root), parentCallFrom: parent });

/** A background row of ours, as `claude agents --all --json` lists it. */
const bgRow = (name: string, state: string, status: string, startedAt: number) => ({
  name,
  sessionId: BG_ID,
  state,
  status,
  kind: 'background',
  startedAt,
});

const recordAt = (root: string, name: string) => JSON.parse(fs.readFileSync(parentFileOf(root, name), 'utf8')) as unknown;

test("a background spawn records its parent's last StructuredOutput call before `claude --bg` runs, or refuses to start", async (t) => {
  await t.test(
    "a background spawn records its parent's last StructuredOutput call under `root` — null resumed from nothing — and none where it could not tell, clearing the last one's",
    async () => {
      const f = fake();
      try {
        const root = tmp('root');
        const bg = { cwd: f.dir, config: { background: true } };
        await Effect.runPromise(bgOps(root).spawn({ name: 'ae/fresh/1', brief: 'go', ...bg }));
        assert.deepEqual(recordAt(root, 'ae/fresh/1'), { lastCall: null }, 'a fresh session has no parent: any call it makes is its own');

        await Effect.runPromise(bgOps(root).spawn({ name: 'ae/r/2', brief: 'go', resumeFrom: PARENT_ID, ...bg }));
        assert.deepEqual(recordAt(root, 'ae/r/2'), { lastCall: PARENT_CALL });

        const asked: string[] = [];
        const cannot = [
          async (id: string) => {
            asked.push(id);
            return undefined;
          },
          async (id: string): Promise<ParentCall | undefined> => {
            asked.push(id);
            throw new Error('line 2 of the transcript does not decode');
          },
        ];
        for (const parent of cannot) {
          await Effect.runPromise(bgOps(root).spawn({ name: 'ae/r/2', brief: 'go', resumeFrom: PARENT_ID, ...bg }));
          assert.ok(fs.existsSync(parentFileOf(root, 'ae/r/2')), 'seeded by the spawn before');
          await Effect.runPromise(bgOps(root, parent).spawn({ name: 'ae/r/2', brief: 'go', resumeFrom: PARENT_ID, ...bg }));
          assert.equal(fs.existsSync(parentFileOf(root, 'ae/r/2')), false, "no record, and not another attempt's: the time judges");
          assert.equal(f.read('bg-args')?.[0], '--bg', 'and the session is spawned all the same');
        }
        assert.deepEqual(asked, [PARENT_ID, PARENT_ID], 'asked of the session it resumes');
      } finally {
        f.restore();
      }
    },
  );
  await t.test("the parent's last call is on disk before `claude --bg` runs, so no look can find the session without it", async () => {
    const root = tmp('root');
    const f = fake(parentFileOf(root, 'ae/r/2'));
    try {
      await Effect.runPromise(
        bgOps(root).spawn({ name: 'ae/r/2', brief: 'go', cwd: f.dir, resumeFrom: PARENT_ID, config: { background: true } }),
      );
      assert.deepEqual(JSON.parse(f.read('bg-saw')!.join('\n')), { lastCall: PARENT_CALL });
    } finally {
      f.restore();
    }
  });
  await t.test('REFUSED: a background spawn whose record of its parent cannot be written starts nothing and says so', async () => {
    const f = fake();
    try {
      const root = tmp('root');
      fs.writeFileSync(path.join(root, 'parent'), 'a file where the folder goes');
      const e = await Effect.runPromise(
        Effect.flip(bgOps(root).spawn({ name: 'ae/r/2', brief: 'go', cwd: f.dir, resumeFrom: PARENT_ID, config: { background: true } })),
      );
      assert.equal(e.refused, true, 'nothing started, so the attempt is unstartable, not lost');
      assert.ok(e.message.startsWith('claude --bg: '), e.message);
      assert.equal(f.read('bg-args'), undefined, '`claude` never ran');
    } finally {
      f.restore();
    }
  });
});

/** An error as Node gives one for the OS errno `code`, met in `syscall` on `target`. */
const osError = (code: string, syscall: string, target: string) =>
  Object.assign(new Error(`${syscall} ${target} ${code}`), { code, syscall, path: target, errno: -1 });

/** What a background spawn of `ae/r/2` fails with, through the runner over a store at `root`, or `undefined` when it starts. */
const bgSpawnError = async (root: string, cwd: string) =>
  Effect.runPromise(
    bgOps(root)
      .spawn({ name: 'ae/r/2', brief: 'go', cwd, resumeFrom: PARENT_ID, config: { background: true } })
      .pipe(
        Effect.as(undefined),
        Effect.catchTag('RunnerError', (e) => Effect.succeed(e)),
      ),
  );

test('a spawn the OS could not make for a short-lived reason is left to the grace window, and any other refuses', async (t) => {
  await t.test(
    'a spawn the OS could not make for a short-lived reason is no refusal: EAGAIN, EMFILE, ENFILE, ENOMEM are left to the grace window, while ENOENT, EACCES and ENOTDIR refuse',
    () => {
      const failed = (code: string) => Object.assign(new Error(`spawn claude ${code}`), { code, syscall: 'spawn claude', errno: -1 });
      assert.deepEqual([...TRANSIENT_ERRNOS], ['EAGAIN', 'EMFILE', 'ENFILE', 'ENOMEM'], 'the shipped set');
      for (const code of TRANSIENT_ERRNOS) assert.equal(refusedOsError(failed(code)), false, code);
      for (const code of ['ENOENT', 'EACCES', 'ENOTDIR']) assert.equal(refusedOsError(failed(code)), true, code);
      assert.equal(refusedOsError(new Error('no code at all')), true, 'an error with no code is no short-lived one');
    },
  );
  await t.test(
    'a background launch the OS could not make for a short-lived reason is left to the grace window, through the runner: EAGAIN is no refusal, ENOENT is',
    async (t) => {
      const f = fake();
      const real = childProcess.execFile;
      let code = 'EAGAIN';
      t.mock.method(
        childProcess,
        'execFile',
        (cmd: string, args: string[], o: object, done: (err: Error | null, out: string, err2: string) => void) => {
          if (args[0] !== '--bg') return (real as (...a: unknown[]) => unknown)(cmd, args, o, done);
          queueMicrotask(() => done(osError(code, `spawn ${cmd}`, cmd), '', ''));
          return { kill: () => true };
        },
      );
      syncBuiltinESMExports();
      try {
        const transient = await bgSpawnError(tmp('root'), f.dir);
        assert.ok(transient, 'the launch failed');
        assert.equal(transient.refused, undefined, 'EAGAIN, no process slot for a moment: no refusal');
        code = 'ENOENT';
        assert.equal((await bgSpawnError(tmp('root'), f.dir))?.refused, true, 'one with no binary is');
      } finally {
        t.mock.restoreAll();
        syncBuiltinESMExports();
        f.restore();
      }
    },
  );
  await t.test(
    'a write before the background launch that failed for a short-lived reason is left to the grace window, through the runner: EMFILE is no refusal, ENOTDIR is',
    async (t) => {
      const f = fake();
      const real = fs.renameSync;
      let code = 'EMFILE';
      t.mock.method(fs, 'renameSync', (from: fs.PathLike, to: fs.PathLike) => {
        if (path.basename(path.dirname(String(to))) === 'parent') throw osError(code, 'rename', String(to));
        return real(from, to);
      });
      try {
        const transient = await bgSpawnError(tmp('root'), f.dir);
        assert.ok(transient?.message.startsWith('claude --bg: '), transient?.message);
        assert.equal(transient?.refused, undefined, 'out of descriptors for a moment is no refusal');
        assert.equal(f.read('bg-args'), undefined, '`claude` never ran');
        code = 'ENOTDIR';
        assert.equal((await bgSpawnError(tmp('root'), f.dir))?.refused, true, 'a folder that is a file is');
      } finally {
        t.mock.restoreAll();
        f.restore();
      }
    },
  );
});

/**
 * What `observe` reports of the background session `name`, its row `row` and its record written as `record`, or none: its
 * transcript last written ten floors ago, and seen so by the runner since.
 */
const seenWith = async (o: { record?: string; said: Statement; row: object; quiet?: boolean }) => {
  const f = fake();
  try {
    const root = tmp('root');
    if (o.record !== undefined) {
      fs.mkdirSync(path.dirname(parentFileOf(root, 'ae/r/2')), { recursive: true });
      fs.writeFileSync(parentFileOf(root, 'ae/r/2'), o.record);
    }
    fs.writeFileSync(path.join(f.dir, 'agents.json'), JSON.stringify([o.row]));
    const written = Date.now() - 10 * QUIESCENT_AFTER_MS;
    sightingOf(quietFileOf(root, 'ae/r/2'), written, { boot: 'boot-1', ms: written });
    const ops = claudeCodeOps({
      root,
      sessionsDir: tmp('sessions'),
      now: () => Date.now(),
      mono: () => ({ boot: 'boot-1', ms: Date.now() }),
      transcriptTime: async () => written,
      closeoutFrom: async () => o.said,
      usageFrom: async () => undefined,
    });
    return (await Effect.runPromise(ops.observe)).get('ae/r/2');
  } finally {
    f.restore();
  }
};

/**
 * The first attempt of a task resumed from a background session, run on Claude Code's background runner through an engine, in test
 * `t`, until it settles: `claude --bg` registers a finished session, and `said` is what its transcript says, given the session's start.
 */
const settledResumed = async (t: Waiter, said: (startedAt: number) => Statement) => {
  const f = fake();
  try {
    const { Engine } = await import('../src/index.ts');
    const { builtEngine } = await import('./engine.ts');
    const root = tmp('root');
    let startedAt = 0;
    const ops = claudeOps({
      root,
      transcriptTime: async () => Date.now(),
      closeoutFrom: async () => said(startedAt),
      parentCallFrom: async () => ({ lastCall: PARENT_CALL }),
      usageFrom: async () => undefined,
    });
    const runner = {
      spawn: (r: SpawnRequest) => Effect.runPromise(ops.spawn(r)),
      observe: () => Effect.runPromise(ops.observe),
      stop: (id: string) => Effect.runPromise(ops.stop(id)),
      logs: async () => '',
    };
    const e = builtEngine(Engine.layer({ root, harnesses: { bg: asyncOps(runner) } }));
    const id = await Effect.runPromise(
      e.file({ brief: 'b', cwd: f.dir, harness: 'bg', resumeFrom: PARENT_ID, closeoutSchema: { type: 'object' } }),
    );
    await until(
      t,
      async () => {
        if ((await Effect.runPromise(e.view(id))).state.settled) return true;
        await Effect.runPromise(e.tick());
        const name = f.read('bg-args')?.[2];
        if (name && !startedAt) {
          startedAt = Date.now();
          fs.writeFileSync(path.join(f.dir, 'agents.json'), JSON.stringify([bgRow(name, 'done', 'idle', startedAt)]));
        }
        return false;
      },
      `${id} settled`,
      { everyMs: 10 },
    );
    return (await Effect.runPromise(e.view(id))).state.attempts[0];
  } finally {
    f.restore();
  }
};

test(
  "a resumed session's statement is its own by its call id, never its parent's — on the runner, and through the engine",
  WAITED,
  async (t) => {
    await t.test(
      "REFUSED by identity: an idle session's statement with its parent's last call id is its parent's, though made after it began",
      async () => {
        const startedAt = Date.now() - 60_000;
        const seen = await seenWith({
          record: JSON.stringify({ lastCall: PARENT_CALL }),
          said: { payload: { by: 'parent' }, at: startedAt + 1_000, id: PARENT_CALL, lastWord: true },
          row: bgRow('ae/r/2', 'working', 'idle', startedAt),
        });
        assert.equal(seen?.state, 'working');
        assert.equal(seen?.closeout, undefined, 'its time would keep it; its id says it was inherited');
      },
    );
    await t.test(
      "kept by identity: an idle session's own statement is reported with no time, made before its start by the clock or not",
      async () => {
        const startedAt = Date.now();
        for (const lastCall of [PARENT_CALL, null]) {
          const seen = await seenWith({
            record: JSON.stringify({ lastCall }),
            said: { payload: { by: 'child' }, at: startedAt - 60_000, id: OWN_CALL, lastWord: true },
            row: bgRow('ae/r/2', 'working', 'idle', startedAt),
          });
          assert.deepEqual(seen?.closeout, { payload: { by: 'child' } }, `parent's last call ${lastCall}`);
          assert.equal('at' in (seen?.closeout ?? {}), false, 'no time for the engine to drop it by');
        }
      },
    );
    await t.test(
      'a busy session quiet for the floor whose own statement is its last word reports it with no time, whatever its clock — its parent’s, nothing',
      async () => {
        const startedAt = Date.now() - 20 * QUIESCENT_AFTER_MS;
        const busy = bgRow('ae/r/2', 'working', 'busy', startedAt);
        const own = await seenWith({
          record: JSON.stringify({ lastCall: PARENT_CALL }),
          said: { payload: { by: 'child' }, at: startedAt - 60_000, id: OWN_CALL, lastWord: true },
          row: busy,
        });
        assert.deepEqual(own?.closeout, { payload: { by: 'child' } }, 'stamped before its start, and its own all the same');
        assert.ok((own?.quietMs ?? 0) >= QUIESCENT_AFTER_MS, 'and quiet');

        const inherited = await seenWith({
          record: JSON.stringify({ lastCall: PARENT_CALL }),
          said: { payload: { by: 'parent' }, at: startedAt + 1_000, id: PARENT_CALL, lastWord: true },
          row: busy,
        });
        assert.equal(inherited?.closeout, undefined);
        assert.equal(inherited?.quietMs, undefined, 'its last word is its parent’s: it has said nothing of its own');
      },
    );
    await t.test(
      'with no record, or one that does not read, a statement keeps its time for the engine to judge — never a refusal',
      async () => {
        const startedAt = Date.now();
        const said = { payload: { by: 'someone' }, at: startedAt - 60_000, id: OWN_CALL, lastWord: true };
        for (const record of [undefined, 'not json', JSON.stringify({ lastCall: 7 }), JSON.stringify([PARENT_CALL])]) {
          const seen = await seenWith({
            ...(record !== undefined ? { record } : {}),
            said,
            row: bgRow('ae/r/2', 'working', 'idle', startedAt),
          });
          assert.deepEqual(seen?.closeout, { payload: { by: 'someone' }, at: startedAt - 60_000 }, `record ${record}`);
        }
        const noId = await seenWith({
          record: JSON.stringify({ lastCall: PARENT_CALL }),
          said: { payload: { by: 'someone' }, at: startedAt - 60_000, lastWord: true },
          row: bgRow('ae/r/2', 'working', 'idle', startedAt),
        });
        assert.deepEqual(noId?.closeout, { payload: { by: 'someone' }, at: startedAt - 60_000 }, 'a call with no id cannot be told');
      },
    );
    await t.test(
      "through the engine, a resumed session's own statement is on the record when this process's clock runs ahead of its transcript's",
      WAITED,
      async (t: TestContext) => {
        stepClock(t, 60_000);
        const attempt = await settledResumed(t, (startedAt) => ({
          payload: { by: 'child' },
          at: startedAt - 60_000 + 1_000,
          id: OWN_CALL,
          lastWord: true,
        }));
        assert.deepEqual(attempt?.closeout, { by: 'child' });
        assert.notEqual(attempt?.closedOut, false);
      },
    );
    await t.test(
      "through the engine, a resumed session that ended with only its parent's statement said nothing of its own",
      WAITED,
      async (t) => {
        const attempt = await settledResumed(t, (startedAt) => ({
          payload: { by: 'parent' },
          at: startedAt + 1_000,
          id: PARENT_CALL,
          lastWord: true,
        }));
        assert.equal(attempt?.closeout, undefined);
        assert.equal(attempt?.closedOut, false);
      },
    );
  },
);

/**
 * A runner over `rows`, its usage read recording each session and start it is counted from, and the record of those asks; its
 * transcripts last written at `writtenAt`, now by default.
 */
const countingOps = (f: ReturnType<typeof fake>, rows: object[], writtenAt?: number) => {
  fs.writeFileSync(path.join(f.dir, 'agents.json'), JSON.stringify(rows));
  const asked: Array<[string, number]> = [];
  const ops = claudeCodeOps({
    ...opsOptions(tmp('root')),
    ...(writtenAt !== undefined ? { transcriptTime: async () => writtenAt } : {}),
    usageFrom: async (sessionId: string, since: number) => {
      asked.push([sessionId, since]);
      return { responses: asked.length };
    },
  });
  return { ops, asked };
};

const OTHER_ID = '5e551011-0000-4000-8000-00000000000d';

/**
 * The pass's look told each session's start, then `between`, then the release of each `released`: each release must read its spend
 * from the start the pass was told, whatever `between` named or left out.
 */
const raced = async (
  rows: object[],
  told: ReadonlyArray<{ name: string; since: number }>,
  between: ReadonlyArray<{ name: string; since?: number }>,
  released: ReadonlyArray<{ sessionId: string; since: number }>,
) => {
  const f = fake();
  try {
    const { ops, asked } = countingOps(f, rows);
    await Effect.runPromise(ops.observeFor!(told.map((t) => ({ ...t, harness: 'claude' }))));
    await Effect.runPromise(ops.observeFor!(between.map((b) => ({ ...b, harness: 'claude' }))));
    for (const r of released) {
      await Effect.runPromise(ops.release!({ sessionId: r.sessionId, state: 'working' }, {}));
      assert.deepEqual(asked.at(-1), [r.sessionId, r.since], `${r.sessionId}'s release reads its spend from the start the pass was told`);
    }
  } finally {
    f.restore();
  }
};

test(
  "a long-lived attempt's usage is counted from the start the pass was told, by its look and its release, whatever look comes between",
  WAITED,
  async (t) => {
    await t.test(
      "a long-lived attempt's usage is counted from the start a pass is told of, by its look and by its release — though a full listing comes between",
      async () => {
        const f = fake();
        try {
          const startedAt = Date.now() - 60_000;
          const since = startedAt - 3_600_000;
          const { ops, asked } = countingOps(f, [bgRow('ae/r/2', 'working', 'idle', startedAt)]);

          const seen = await Effect.runPromise(ops.observeFor!([{ name: 'ae/r/2', harness: 'claude', since }]));
          assert.deepEqual(asked, [[BG_ID, since]], 'counted from when the attempt began, across the processes it was respawned in');
          assert.deepEqual(seen.seen.get('ae/r/2')?.usage, { responses: 1 });

          await Effect.runPromise(ops.observe);
          await Effect.runPromise(ops.release!({ sessionId: BG_ID, state: 'working' }, {}));
          assert.deepEqual(asked.at(-1), [BG_ID, since], 'the release reads the spend from the start the pass was told');
          assert.ok(
            asked.every(([, from]) => from === since),
            "a view's look between, told nothing, keeps it for a session still listed, and never counts from the row's start",
          );
        } finally {
          f.restore();
        }
      },
    );
    await t.test(
      "a long-lived attempt's release counts from the start the pass was told, though a view's look of every attempt, told no start, comes between",
      async () => {
        const startedAt = Date.now() - 60_000;
        const since = startedAt - 3_600_000;
        await raced(
          [bgRow('ae/r/2', 'working', 'idle', startedAt)],
          [{ name: 'ae/r/2', since }],
          [{ name: 'ae/r/1' }, { name: 'ae/r/2' }],
          [{ sessionId: BG_ID, since }],
        );
      },
    );
    await t.test(
      "a long-lived attempt's release counts from the start the pass was told, though `forget`'s look of the attempts' names comes between",
      async () => {
        const startedAt = Date.now() - 60_000;
        const since = startedAt - 3_600_000;
        await raced(
          [bgRow('ae/r/2', 'working', 'idle', startedAt)],
          [{ name: 'ae/r/2', since }],
          ['ae/r/1', 'ae/r/2'].map((name) => ({ name })),
          [{ sessionId: BG_ID, since }],
        );
      },
    );
    await t.test(
      "a long-lived attempt's release counts from the start the pass was told, though a look for another task's session comes between",
      async () => {
        const startedAt = Date.now() - 60_000;
        const since = startedAt - 3_600_000;
        await raced(
          [bgRow('ae/r/2', 'working', 'idle', startedAt), { ...bgRow('ae/o/1', 'working', 'idle', startedAt), sessionId: OTHER_ID }],
          [{ name: 'ae/r/2', since }],
          [{ name: 'ae/o/1' }],
          [{ sessionId: BG_ID, since }],
        );
      },
    );
    await t.test("a restarted long-lived task's earlier attempt keeps its start when a look names only its last", async () => {
      const startedAt = Date.now() - 60_000;
      const first = startedAt - 7_200_000;
      const last = startedAt - 3_600_000;
      await raced(
        [{ ...bgRow('ae/r/1', 'working', 'idle', startedAt), sessionId: OTHER_ID }, bgRow('ae/r/2', 'working', 'idle', startedAt)],
        [
          { name: 'ae/r/1', since: first },
          { name: 'ae/r/2', since: last },
        ],
        [{ name: 'ae/r/2', since: last }],
        [
          { sessionId: OTHER_ID, since: first },
          { sessionId: BG_ID, since: last },
        ],
      );
    });
    await t.test(
      "through the engine, a stopped long-lived attempt's spend is read from its journalled start though the task is viewed between the pass's look and its release",
      WAITED,
      async (t) => {
        const f = fake();
        try {
          const { Engine } = await import('../src/index.ts');
          const { builtEngine } = await import('./engine.ts');
          const root = tmp('root');
          const asked: Array<[string, number]> = [];
          let exited = false;
          const ops = claudeOps({
            root,
            transcriptTime: async () => Date.now(),
            closeoutFrom: async () => undefined,
            usageFrom: async (sessionId: string, since: number) => {
              asked.push([sessionId, since]);
              return { responses: asked.length, ...(exited ? { costUsd: 0.25 } : {}) };
            },
          });
          const released: Array<{ asked: Array<[string, number]>; measured: unknown }> = [];
          let view = (): Effect.Effect<unknown, unknown> => Effect.void;
          const viewed: typeof ops = {
            ...ops,
            observeFor: (expected) =>
              ops.observeFor!(expected).pipe(
                Effect.tap(() => (expected.some((x) => x.since !== undefined) ? Effect.ignore(view()) : Effect.void)),
              ),
            release: (session, task) => {
              const from = asked.length;
              exited = true;
              return ops.release!(session, task).pipe(
                Effect.tap((measured) => Effect.sync(() => released.push({ asked: asked.slice(from), measured }))),
              );
            },
          };
          const e = builtEngine(Engine.layer({ root, harnesses: { bg: viewed } }));
          const id = await Effect.runPromise(e.file({ brief: 'b', cwd: f.dir, harness: 'bg', restartPolicy: 'Always' }));
          view = () => e.view(id);
          const name = await looked(
            t,
            async () => {
              await Effect.runPromise(e.tick());
              return f.read('bg-args')?.[2];
            },
            'the session spawned',
          );
          const begun = Date.parse((await Effect.runPromise(e.view(id))).state.attempts[0].startedAt);
          const listing = (state: string) =>
            fs.writeFileSync(
              path.join(f.dir, 'agents.json'),
              JSON.stringify([{ ...bgRow(name, state, 'idle', begun + 3_600_000), pid: process.pid }]),
            );
          listing('working');
          await Effect.runPromise(e.tick());
          await Effect.runPromise(e.stop(id));
          await Effect.runPromise(e.tick());
          listing('stopped');
          const release = await looked(
            t,
            async () => {
              await Effect.runPromise(e.tick());
              return released[0];
            },
            'the session released',
          );
          assert.deepEqual(
            release.asked,
            [[BG_ID, begun]],
            "the release reads the spend from the attempt's journalled start, not its row's",
          );
          const entries = (await Effect.runPromise(e.feed(0))).entries.filter((x) => x.taskId === id).map((x) => x.event);
          assert.deepEqual(
            entries.flatMap((x) => (x.kind === 'measured' ? [x.usage] : [])),
            [release.measured],
            'what the release read is journalled as the attempt measured',
          );
        } finally {
          f.restore();
        }
      },
    );
    await t.test(
      "a session expected with no start, or with one that is no number, is counted from its row's start — by its look and its release",
      async () => {
        const f = fake();
        try {
          const startedAt = Date.now() - 60_000;
          for (const since of [undefined, 'yesterday', Number.NaN]) {
            const { ops, asked } = countingOps(f, [bgRow('ae/r/2', 'working', 'idle', startedAt)]);
            await Effect.runPromise(ops.observeFor!([{ name: 'ae/r/2', harness: 'claude', since: since as never }]));
            await Effect.runPromise(ops.release!({ sessionId: BG_ID, state: 'working' }, {}));
            assert.deepEqual(
              asked,
              [
                [BG_ID, startedAt],
                [BG_ID, startedAt],
              ],
              `since ${String(since)}`,
            );
          }
        } finally {
          f.restore();
        }
      },
    );
    await t.test(
      "an ended session's usage kept from its row's start is not what a look told an earlier start is handed — it is read again from then",
      async () => {
        const f = fake();
        try {
          const startedAt = Date.now() - 60_000;
          const since = startedAt - 3_600_000;
          const { ops, asked } = countingOps(f, [bgRow('ae/r/2', 'done', 'idle', startedAt)], startedAt);
          await Effect.runPromise(ops.observe);
          await Effect.runPromise(ops.observe);
          assert.deepEqual(asked, [[BG_ID, startedAt]], 'an ended session whose transcript is unchanged is read once, and kept');
          const seen = await Effect.runPromise(ops.observeFor!([{ name: 'ae/r/2', harness: 'claude', since }]));
          assert.deepEqual(asked.at(-1), [BG_ID, since]);
          assert.deepEqual(seen.seen.get('ae/r/2')?.usage, { responses: 2 }, 'the read counted from the start it was told');
        } finally {
          f.restore();
        }
      },
    );
  },
);

/**
 * The options a job's own process gives that same task, held as written so a change to it is seen: a job has no argv of ours,
 * and these are what `query()` is handed beside its environment and the runner's own callbacks.
 */
const PINNED_JOB_OPTIONS = {
  cwd: '/r',
  tools: ['Read'],
  disallowedTools: ['SendMessage'],
  allowedTools: ['Edit(**)'],
  includePartialMessages: true,
  permissionMode: 'dontAsk',
  settingSources: ['project'],
  settings: { autoMemoryEnabled: false },
  systemPrompt: { type: 'preset', preset: 'claude_code' },
  strictMcpConfig: true,
  model: 'opus',
  extraArgs: { 'no-chrome': null },
};

/** The argv each Claude Code spawn gives a task with no mounts, held as written so a change to it is seen. */
const PINNED_ARGV: Record<string, string[]> = {
  'a background session': [
    '--bg',
    '--name',
    'ae/b/1',
    '--tools',
    'Read',
    '--disallowedTools',
    'SendMessage',
    '--allowedTools',
    'Edit(**)',
    '--settings',
    '{"autoMemoryEnabled":false}',
    '--permission-mode',
    'dontAsk',
    '--strict-mcp-config',
    '--no-chrome',
    '--model',
    'opus',
    'the brief',
  ],
  'claude-detached': [
    '-p',
    'the brief',
    '--output-format',
    'json',
    '--tools',
    'Read',
    '--disallowedTools',
    'SendMessage',
    '--allowedTools',
    'Edit(**)',
    '--settings',
    '{"autoMemoryEnabled":false}',
    '--permission-mode',
    'dontAsk',
    '--strict-mcp-config',
    '--no-chrome',
    '--setting-sources',
    'project',
    '--model',
    'opus',
  ],
};
