/**
 * Claude Code as the engine runs it: every session on the Agent SDK — a job in a process of its own, and every verb given a session
 * id reaching the job by its name.
 *
 * Against the real worker and the Agent SDK's own stand-in CLI (`fixtures/stand-in-claude.ts`), which the runner is given as its
 * `claudeExecutable` — a job is no `claude` command line, so what it was given is read where the SDK put it, in the stand-in's own
 * folder (`argv.jsonl`, `said.jsonl`). Its plan rides the test process's environment, which the bin's `Options.env` carries down
 * to it.
 */
import { test } from 'node:test';

import assert from 'node:assert/strict';

import { Effect } from 'effect';

import fs from 'node:fs';

import path from 'node:path';

import { scratch } from './scratch.ts';

import { ioCounts } from '../src/core/engine/tally.ts';

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

const { claudeCodeRefuses, claudeRefuses } = await import('../src/harness/claude/vocabulary.ts');

const JOB_ID = '5e551011-0000-4000-8000-00000000000a';

/** A session id that is none of this runner's: a session a job resumes, started elsewhere. */
const OTHER_ID = '5e551011-0000-4000-8000-00000000000b';

/**
 * The stand-in Claude Code (`STAND_IN`) a job's road runs, its plan and folder set on this process's environment, which reaches it
 * because a job's own process lays the engine's environment under `Options.env` (`attachedOptions`). `JOB_ID` is the session id it
 * answers under, which `CLAUDE_INIT_START` reads off its first line.
 */
const fake = (plan: object = {}) => {
  const dir = tmp('bin');
  const prevStandIn = { dir: process.env.STANDIN_DIR, plan: process.env.STANDIN_PLAN };
  process.env.STANDIN_DIR = dir;
  process.env.STANDIN_PLAN = JSON.stringify({ id: JOB_ID, cost: 0.03, output: { outcome: 'done' }, ...plan });
  return {
    dir,
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

/** The Claude Code runner over a store at `root`, its jobs run on the stand-in. */
const opsIn = (root: string) => claudeCodeOps({ claudeExecutable: STAND_IN, root });

/** What `read` answers, in test `t`, once it answers anything: read again every 100ms. */
const looked = <T>(t: Waiter, read: () => Promise<T | undefined>, what: string) => until(t, read, what, { everyMs: 100 });

test(
  'a job is run as its own process: seen by its name with its own id and answer, found by its run file, its words to its stdin, its conversation by its name or its id, and every verb reaching it by its name',
  WAITED,
  async (t) => {
    const s = story(t);
    const f = fake();
    t.after(() => f.restore());
    const root = tmp('root');
    const ops = opsIn(root);
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

    await s.test('a task is run as a job: seen by its name, with its own id and answer', async (c) => {
      await Effect.runPromise(ops.spawn({ name: 'ae/j/1', brief: 'go', cwd: f.dir }));
      const seen = await done('ae/j/1', c);
      assert.deepEqual(said(), ['go'], 'the brief reached the session, and its input ended at the result');
      assert.equal(seen.sessionId, 'ae/j/1', 'a job is known by its name');
      assert.equal(seen.nativeId, JOB_ID, "and carries Claude Code's own id, to resume and read by");
      assert.deepEqual(seen.closeout?.payload, { outcome: 'done' });
      assert.equal(seen.usage?.costUsd, 0.03);
    });

    await s.test('observeFor reads the jobs it is told of, and nothing for nothing told', async () => {
      const reads = ioCounts().reads;
      assert.equal((await Effect.runPromise(ops.observeFor!([]))).seen.size, 0, 'nothing expected: nothing listed');
      assert.equal(ioCounts().reads - reads, 0, 'and no run file read');
      const jobs = await Effect.runPromise(ops.observeFor!([{ name: 'ae/j/1', harness: 'claude' }]));
      assert.equal(jobs.seen.get('ae/j/1')?.sessionId, 'ae/j/1');
      assert.deepEqual(jobs.unread, new Set());
    });

    await s.test(
      "a job is found by its run file and nothing else — no other job's, and no job's output, though every log changed since both ended; a name no job has is not found, and a run file another name folds onto is not the job asked for",
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
        assert.equal(await Effect.runPromise(ops.find!('ae/b/9')), undefined, 'no job by that name');
        assert.equal(
          await Effect.runPromise(ops.find!('ae-j/1')),
          undefined,
          '`ae-j/1` is written at the same path as `ae/j/1`, and the file says whose it is',
        );
      },
    );

    await s.test(
      'a job resumed from a session none of its runs is, the SDK writing its resume as one argument, carries no cost it cannot tell from its parent',
      async (c) => {
        const argvs = f.said('argv.jsonl')?.length ?? 0;
        await Effect.runPromise(ops.spawn({ name: 'ae/u/2', brief: 'go', cwd: f.dir, resumeFrom: OTHER_ID }));
        const seen = await done('ae/u/2', c);
        assert.ok(
          (f.said('argv.jsonl')?.[argvs] as string[] | undefined)?.includes(`--resume=${OTHER_ID}`),
          `the SDK wrote the resume as one argument: ${JSON.stringify(f.said('argv.jsonl')?.[argvs])}`,
        );
        assert.deepEqual(seen.closeout?.payload, { outcome: 'done' });
        assert.equal(seen.usage?.costUsd, undefined, "the printed total carries the parent's on");
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

    await s.test('a stop and words reach a job by its name — with no observe made first, as after a restart', async (c) => {
      const before = said().length;
      await Effect.runPromise(ops.spawn({ name: 'ae/j/2', brief: 'wait', cwd: f.dir }));
      await looked(c, async () => (said().length > before ? true : undefined), 'the job started');
      const fresh = opsIn(root);
      await Effect.runPromise(fresh.stop('ae/j/2'));
      const stopped = await looked(
        c,
        async () => {
          const seen = (await Effect.runPromise(fresh.observe)).get('ae/j/2');
          return seen?.state === 'canceled' ? seen : undefined;
        },
        'the job stopped by its worker',
      );
      assert.equal(stopped.sessionId, 'ae/j/2');
      assert.equal(fresh.release, undefined, 'a job has nothing to let go of: its run file is its record');
      const toJob = await Effect.runPromise(Effect.flip(fresh.say!({ name: 'ae/j/2', sessionId: 'ae/j/2' }, 'hello')));
      assert.match(toJob.message, /^claude: `ae\/j\/2` is `stopped`, not running/, "a job's words go to its worker");
    });
  },
);

test('a pass over many ended jobs reads the run file and output of the job it expects, and no other', async () => {
  {
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
    const before = ioCounts().reads;
    const told = await Effect.runPromise(ops.observeFor!([{ name: 'ae/s7/1', harness: 'claude' }]));
    const reads = ioCounts().reads - before;
    assert.ok(reads <= 3, `read ${reads} files: its run file, what its output said and its closeout`);
    assert.deepEqual([...told.seen.keys()], ['ae/s7/1']);
    assert.deepEqual(told.seen.get('ae/s7/1'), full.get('ae/s7/1'));
  }
});

test('observeFor: a job whose run file is there and half written is unread, never gone', async () => {
  const root = tmp('root');
  const runs = path.join(root, 'runs', 'claude');
  fs.mkdirSync(runs, { recursive: true });
  fs.writeFileSync(path.join(runs, 'ae_j_3.json'), '{"name": "ae/j/3", "sta');
  const told = await Effect.runPromise(opsIn(root).observeFor!([{ name: 'ae/j/3', harness: 'claude' }]));
  assert.deepEqual([...told.seen.keys()], []);
  assert.deepEqual(told.unread, new Set(['ae/j/3']));
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

/** A task's mounts, one read-only and one writable. */
const MOUNTED = {
  disallowedTools: ['SendMessage'],
  mounts: [
    { path: '/srv/notes', readOnly: true },
    { path: '/srv/scratch', readOnly: false },
  ],
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

test("Claude Code's road, pinned: a job's command and options — its own flags, mounts, setting sources and environment", async (t) => {
  await t.test(
    'a job is this runtime’s own process running one session on the Agent SDK — no `claude -p` argv anywhere on its road',
    async () => {
      const { CLAUDE_JOB_BIN, claudeJobSpec } = await import('../src/harness/claude/code.ts');
      const request = {
        name: 'ae/t/1',
        brief: 'the prompt',
        cwd: '/r',
        resumeFrom: OTHER_ID,
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
      assert.equal(given.resume, OTHER_ID);
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
    "Claude Code's own flags (`config.claude`) reach a job as the SDK takes them: plugins and settings on their own options, the rest on `extraArgs`",
    () => {
      const claude = { pluginDir: ['/a/nemia-x', '/a/nemia-y'], settings: '{"outputStyle":"nemia-x:no-coding"}', bare: true as const };
      const flagged = attachedOptions({ name: 'ae/t/1', brief: 'b', cwd: '/r', config: { tools: ['Read', 'Skill'], claude } });
      assert.deepEqual(
        flagged.plugins?.map((p) => p.path),
        [path.resolve('/r', '/a/nemia-x'), path.resolve('/r', '/a/nemia-y')],
      );
      assert.deepEqual(flagged.settings, { outputStyle: 'nemia-x:no-coding', autoMemoryEnabled: false });
      assert.equal(flagged.extraArgs?.bare, null, 'what the SDK has no option for is on `extraArgs`, the rest on its own option');
      const none = attachedOptions({ name: 'ae/t/1', brief: 'b', cwd: '/r' });
      const empty = attachedOptions({ name: 'ae/t/1', brief: 'b', cwd: '/r', config: { claude: {} } });
      assert.deepEqual({ ...empty, env: undefined }, { ...none, env: undefined }, 'none given, none handed over');
    },
  );
  await t.test(
    'a mount is an added folder, a read-only one an edit denied under it, in the one deny list, and a writable one an edit allowed under it, in the one allow list',
    () => {
      const given = attachedOptions({ name: 'ae/t/1', brief: 'b', cwd: '/r', config: { ...MOUNTED, allowedTools: ['Edit(**)'] } });
      assert.deepEqual(given.additionalDirectories, ['/srv/notes', '/srv/scratch']);
      assert.deepEqual(
        given.allowedTools,
        ['Edit(**)', 'Edit(//srv/scratch/**)'],
        'the writable mount is allowed, and the read-only one is not',
      );
      assert.deepEqual(given.disallowedTools, ['SendMessage', 'Edit(//srv/notes/**)'], 'the writable mount is not denied');
      const alone = attachedOptions({
        name: 'ae/t/1',
        brief: 'b',
        cwd: '/r',
        config: { mounts: [{ path: '/srv/scratch', readOnly: false }] },
      });
      assert.deepEqual(
        alone.allowedTools,
        ['Edit(//srv/scratch/**)'],
        'a writable mount alone is an allow list of its own: `dontAsk` refuses a write under an added folder that no allow names',
      );
      const ro = attachedOptions({ name: 'ae/t/1', brief: 'b', cwd: '/r', config: { mounts: [{ path: '/srv/notes', readOnly: true }] } });
      assert.deepEqual(ro.disallowedTools, ['Edit(//srv/notes/**)'], 'a read-only mount alone is a deny list of its own');
    },
  );
  await t.test('a task with no mounts is given what it was given before mounts existed', () => {
    const config = {
      tools: ['Read'],
      disallowedTools: ['SendMessage'],
      allowedTools: ['Edit(**)'],
      permissionMode: 'dontAsk',
      model: 'opus',
    };
    const { env, ...given } = attachedOptions({ name: 'ae/t/1', brief: 'the brief', cwd: '/r', config });
    assert.ok(env, "a job's environment is its own, and is read where it is laid (`attached-options.test.ts`)");
    assert.deepEqual(given, PINNED_JOB_OPTIONS);
  });
  await t.test("a job reads its checkout's shared settings and neither the operator's nor a `settings.local.json`", () => {
    assert.deepEqual(
      attachedOptions({ name: 'ae/t/1', brief: 'b', cwd: '/r', config: { claude: { settings: '{}' } } }).settingSources,
      ['project'],
      "on the SDK's own option, beside the caller's own settings",
    );
  });
  await t.test(
    "REFUSED at shipped defaults: a job runs with background tasks off and its calls' default timeout at the most one may take",
    () => {
      const saved = JOB_ENV_KEYS.map((key) => [key, process.env[key]] as const);
      for (const key of JOB_ENV_KEYS) delete process.env[key];
      let job: Record<string, string | undefined> | undefined;
      try {
        job = attachedOptions({ name: 'ae/j/1', brief: 'go', cwd: '/r' }).env;
      } finally {
        for (const [key, value] of saved) if (value !== undefined) process.env[key] = value;
      }
      assert.deepEqual(
        JOB_ENV_KEYS.map((key) => job?.[key]),
        ['1', '600000'],
        "the environment a job's own process lays on the session it runs",
      );
    },
  );
  await t.test(
    "a bridge asked in `config.claude` is no flag: it is opened on the SDK's control request, and left off the command line",
    () => {
      const given = attachedOptions({ name: 'ae/t/1', brief: 'b', cwd: '/r', config: { claude: { remoteControl: true, bare: true } } });
      assert.equal('remote-control' in (given.extraArgs ?? {}), false);
      assert.equal(given.extraArgs?.bare, null, 'the rest of the bag is handed over');
    },
  );
});

test("REFUSED at the door: Claude Code's flags on the wrong harness, a flag the runtime gives itself, and a mount no permission rule can name", async (t) => {
  await t.test(
    'what Claude Code refuses as the engine runs it is what Claude Code cannot: a job and a long-lived session take a bridge and a spend cap',
    () => {
      assert.equal(claudeCodeRefuses({ brief: 'b', cwd: '/r', config: { budgetUsd: 1 } }), undefined, 'a job keeps a cap');
      assert.equal(
        claudeCodeRefuses({ brief: 'b', cwd: '/r', restartPolicy: 'Always', config: { budgetUsd: 1 } }),
        undefined,
        'and so does a long-lived session',
      );
      for (const remoteControl of [true, 'phone'] as const) {
        assert.equal(
          claudeCodeRefuses({ brief: 'b', cwd: '/r', config: { claude: { remoteControl } } }),
          undefined,
          `a job bridged: ${remoteControl}`,
        );
        assert.equal(
          claudeCodeRefuses({ brief: 'b', cwd: '/r', restartPolicy: 'Always', config: { claude: { remoteControl } } }),
          undefined,
        );
      }
      assert.equal(claudeCodeRefuses({ brief: 'b', cwd: '/r' }), undefined);
      assert.match(
        claudeCodeRefuses({ brief: 'b', cwd: '/r', config: { effort: 'huge' } }) ?? '',
        /^`effort: huge` is not an effort Claude Code has/,
      );
      assert.match(
        claudeCodeRefuses({ brief: 'b', cwd: '/r', config: { permissionMode: 'yolo' } }) ?? '',
        /^`permissionMode: yolo` is not a mode/,
      );
    },
  );
  await t.test(
    'REFUSED at shipped defaults: a mount whose path a permission rule cannot name, read-only or writable, on a job',
    async () => {
      const { Engine } = await import('../src/index.ts');
      const { builtEngine } = await import('./engine.ts');
      const e = builtEngine(Engine.layer({ root: tmp('root') }));
      for (const at of UNRULED_MOUNTS) {
        const config = { mounts: [{ path: at, readOnly: true }] };
        const refused = await Effect.runPromise(e.file({ brief: 'b', cwd: tmp('cwd'), harness: 'claude', config })).then(
          () => undefined,
          (err: Error & { _tag?: string }) => err,
        );
        assert.equal(refused?._tag, 'FileRefused', at);
        mountRefused(refused?.message, at, 'read-only', at);
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
  await t.test('a bridge in `config.claude` is taken by a job, whose own process opens it, and the rest of the bag with it', () => {
    assert.equal(claudeJob.refuses?.({ brief: 'b', cwd: '/r', config: { claude: { remoteControl: true } } }), undefined);
    assert.equal(claudeJob.refuses?.({ brief: 'b', cwd: '/r', config: { claude: { appendSystemPromptFile: 'p.md' } } }), undefined);
  });
  await t.test(
    'REFUSED at shipped defaults: a flag the runtime gives Claude Code itself, in `config.claude` — and every flag a job gives is on that list',
    async () => {
      const { CLAUDE_OWNED_FLAGS } = await import('../src/harness/claude/vocabulary.ts');
      const request = {
        name: 'ae/t/1',
        brief: 'b',
        cwd: '/r',
        resumeFrom: OTHER_ID,
        closeoutSchema: { type: 'object' },
        config: EVERYTHING,
      };
      const io = { projectMcpConfig: '/r/.mcp.json', mcpConfigFile: '/m.json' };
      assert.deepEqual(
        flagsIn(claudeJob.command(request, { ...io, requestFile: '/r.json' }).args),
        [],
        'a job gives Claude Code no flag at all: its argv is the bin and the spawn request it reads',
      );
      const stray = Object.keys(attachedOptions(request).extraArgs ?? {}).filter(
        (flag) => !CLAUDE_OWNED_FLAGS.includes(flag.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())),
      );
      assert.deepEqual(stray, [], 'every flag a job hands Claude Code on `extraArgs` is on the list');
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

test('a spawn the OS could not make for a short-lived reason is no refusal: EAGAIN, EMFILE, ENFILE, ENOMEM are left to the grace window, while ENOENT, EACCES and ENOTDIR refuse', () => {
  const failed = (code: string) => Object.assign(new Error(`spawn claude ${code}`), { code, syscall: 'spawn claude', errno: -1 });
  assert.deepEqual([...TRANSIENT_ERRNOS], ['EAGAIN', 'EMFILE', 'ENFILE', 'ENOMEM'], 'the shipped set');
  for (const code of TRANSIENT_ERRNOS) assert.equal(refusedOsError(failed(code)), false, code);
  for (const code of ['ENOENT', 'EACCES', 'ENOTDIR']) assert.equal(refusedOsError(failed(code)), true, code);
  assert.equal(refusedOsError(new Error('no code at all')), true, 'an error with no code is no short-lived one');
});

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
