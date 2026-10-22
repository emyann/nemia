/**
 * What `file` refuses, in the core and through the engine, in one set of words.
 *
 * The harness-agnostic refusals live under the core `file` (`refusalOf` in `src/core/engine/filing.ts`), so a caller of
 * `agent-runtime` cannot journal `deadlineSeconds: NaN`, which would stop its task on the first pass, and the `Engine`
 * service's `file` fails with the same `FileRefused`. The harness's own words are the engine's (`test/engine-verbs.test.ts`); the
 * core `file` has no harnesses to ask. Codex's arguments (`config.codex`) on a harness that is not Codex, and a long-lived task
 * on a harness that ends its session with its turn, are refused by the `Engine` service, which has harnesses to ask.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { Effect, Layer } from 'effect';
import { Journal } from '../src/core/engine/journal.ts';
import { Runner } from '../src/harness/seam.ts';
import { file, type Filing } from '../src/core/engine/filing.ts';
import { claudeDetached, codex, type EngineOptions, type Event, type HarnessArgs, type Sighting } from '../src/index.ts';
import { Engine } from '../src/index.ts';
import { claudeBgRefuses, claudeCodeRefuses } from '../src/harness/claude/vocabulary.ts';
import { scratch } from './scratch.ts';
import { asyncStore, asyncOps, type AsyncJournal, type AsyncRunner } from './promise-runner.ts';
import { builtEngine } from './engine.ts';

/** The core `file`, over a store and a harness that cost nothing. */
const coreDoor = () => {
  const layer = Layer.mergeAll(Journal.test(), Runner.test({ sessions: new Map<string, Sighting>(), spawned: [] }));
  const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.runPromise(e.pipe(Effect.provide(layer)));
  return { run, listed: () => run(Effect.flatMap(Journal, (j) => j.list)) };
};

/** A store in memory a test can read. */
const memoryStore = (): AsyncJournal => {
  const tasks = new Map<string, Event[]>();
  return {
    async append(taskId, event) {
      tasks.set(taskId, [...(tasks.get(taskId) ?? []), event]);
    },
    async read(taskId) {
      return [...(tasks.get(taskId) ?? [])];
    },
    async list() {
      return [...tasks.keys()].sort();
    },
    async feed() {
      return { entries: [], cursor: 0 };
    },
  };
};

/** The `Engine` service, at shipped defaults, over a store a test can read. */
const engineDoor = () => {
  const journal = memoryStore();
  return { engine: builtEngine(Engine.layer({ root: scratch('ae-refusal-root-'), journal: asyncStore(journal) })), listed: () => journal.list() };
};

const ok: Filing = { brief: 'b', cwd: '/r' };

/**
 * Every harness-agnostic refusal: what is filed beside `ok`, and the sentence it is refused in. Values a type forbids are
 * cast, as a JSON caller would send them. Among them:
 *
 * - `maxAttempts` and `resume` are retired, at any value their defaults had: the runtime makes one attempt per start, and
 *   trying again is the caller's.
 * - `priority` is a whole number in int32, a Pod's priority: anything else is refused.
 * - `remoteControl` is Claude Code's own flag: refused as a harness argument or beside `config`, whatever it says, with a
 *   sentence naming where it goes.
 * - A harness argument goes under `config`, and nothing else goes there: one filed beside it (`model`, `permissionMode`,
 *   `worktree`, `budgetUsd`), by an untyped caller or a record an older caller wrote, would otherwise start its session
 *   without it, saying nothing; the refusal says where it goes.
 */
const REFUSALS: Array<
  [Partial<Record<keyof Filing | keyof HarnessArgs | 'maxAttempts' | 'resume' | 'priority' | 'remoteControl', unknown>>, RegExp]
> = [
  [{ brief: '  ' }, /^`brief` is empty\. Say what the session should do\.$/],
  [{ cwd: '' }, /^`cwd` is empty\./],
  [{ cwd: 'repo' }, new RegExp(`^\`cwd: repo\` is not an absolute path.*from here that is ${path.resolve('repo')}\\.$`)],
  [
    { maxAttempts: 1 },
    /^`maxAttempts` is retired: the runtime makes one attempt per start.*file it again.*`resumeFrom: <session id>`.*`retries:`.*`wf retry <run> <step>`/,
  ],
  [{ maxAttempts: 2 }, /^`maxAttempts` is retired:/],
  [{ resume: 'interrupted' }, /^`resume` is retired: the runtime makes one attempt per start.*`retries:`.*`wf retry <run> <step>`/],
  [{ resume: 'always' }, /^`resume` is retired:/],
  [{ deadlineSeconds: Number.NaN }, /^`deadlineSeconds: NaN` is not a number of seconds\./],
  [{ deadlineSeconds: 0 }, /^`deadlineSeconds: 0` is not a number of seconds\./],
  [{ deadlineSeconds: Infinity }, /^`deadlineSeconds: Infinity` is not a number of seconds\./],
  [{ config: { model: '' } }, /^`model` is empty\./],
  [{ resumeFrom: '' }, /^`resumeFrom` is empty\./],
  [{ config: { effort: '' } }, /^`effort` is empty\./],
  [{ config: { tools: ['Read,Grep'] } }, /^`tools: \["Read,Grep"\]` is not a list of tool names\./],
  [
    { config: { disallowedTools: ['Bash npm run build'] } },
    /^`disallowedTools: \["Bash npm run build"\]` is not a list of permission rules\./,
  ],
  [{ config: { allowedTools: ['Write(**'] } }, /^`allowedTools: \["Write\(\*\*"\]` is not a list of permission rules\./],
  [{ config: { mcp: [] } }, /^`mcp: \[\]` is not a map of MCP servers by name\./],
  [{ config: { mcp: { web: {} } } }, /^`mcp\.web` has neither `command` nor `url`\./],
  [{ config: { budgetUsd: 0 } }, /^`budgetUsd: 0` is not an amount of dollars\./],
  [{ config: { budgetUsd: -1 } }, /^`budgetUsd: -1` is not an amount of dollars\./],
  [{ config: { budgetUsd: Number.NaN } }, /^`budgetUsd: NaN` is not an amount of dollars\./],
  [{ config: { budgetUsd: Infinity } }, /^`budgetUsd: Infinity` is not an amount of dollars\./],
  [{ config: { budgetUsd: '5' } }, /^`budgetUsd: "5"` is not an amount of dollars\./],
  [
    { priority: 1.5 },
    /^`priority: 1\.5` is not a priority\. Give a whole number from -2147483648 to 2147483647, higher first, or leave it out for 0\.$/,
  ],
  [{ priority: 2 ** 31 }, /^`priority: 2147483648` is not a priority\./],
  [{ priority: Number.NaN }, /^`priority: NaN` is not a priority\./],
  [{ priority: '1' }, /^`priority: "1"` is not a priority\./],
  [{ priority: null }, /^`priority: null` is not a priority\./],
  [
    { config: { remoteControl: true } },
    /^`remoteControl` is Claude Code's own flag, not a harness argument: file it with Claude Code's flags, as `config: \{ claude: \{ remoteControl: true \} \}`, or leave it out\.$/,
  ],
  [{ config: { remoteControl: 'true' } }, /^`remoteControl` is Claude Code's own flag/],
  [{ remoteControl: true }, /^`remoteControl` is Claude Code's own flag/],
  [
    { config: { background: 'yes' } },
    /^`background: "yes"` is not true or false\. Give true to run the session as `claude --bg`, or leave it out to run it as a job\.$/,
  ],
  [{ config: { background: 1 } }, /^`background: 1` is not true or false\./],
  [{ config: { contextTokens: 0 } }, /^`contextTokens: 0` is not a number of tokens\./],
  [{ config: { contextTokens: 150000.5 } }, /^`contextTokens: 150000\.5` is not a number of tokens\./],
  [{ config: { contextTokens: '200k' } }, /^`contextTokens: "200k"` is not a number of tokens\./],
  [{ model: 'opus' }, /^`model` is the harness's configuration: file it under `config`, as `config: \{ model: … \}`\.$/],
  [{ permissionMode: 'dontAsk', config: { model: 'opus' } }, /^`permissionMode` is the harness's configuration: file it under `config`/],
  [{ worktree: true }, /^`worktree` is the harness's configuration/],
  [{ budgetUsd: 5 }, /^`budgetUsd` is the harness's configuration: file it under `config`, as `config: \{ budgetUsd: … \}`\.$/],
  [
    { config: 'opus' },
    /^`config: "opus"` is not a harness's configuration\. Give an object of its arguments, like \{ "model": "opus" \}, or leave it out\.$/,
  ],
  [{ config: null }, /^`config: null` is not a harness's configuration\./],
  [{ config: { priority: 1 } }, /^`config\.priority` is not a harness argument\. A harness's arguments are: model, permissionMode, /],
  [{ config: { codex: 'x' } }, /^`codex: "x"` is not a set of Codex's arguments\./],
  [{ config: { codex: { trust: '/r' } } }, /^`codex\.trust` is not one of Codex's arguments\. Its only one is `trustFrom`/],
  [{ config: { codex: { trustFrom: 'repo' } } }, /^`codex\.trustFrom: "repo"` is not an absolute directory\./],
  [
    { restartPolicy: 'Never' },
    /^`restartPolicy: "Never"` is not a restart policy the runtime takes\. Give `'Always'` to keep the session open until it is stopped, or leave it out to run the task to its end\.$/,
  ],
  [{ restartPolicy: true }, /^`restartPolicy: true` is not a restart policy the runtime takes\./],
  [{ restartPolicy: 'always' }, /^`restartPolicy: "always"` is not a restart policy the runtime takes\./],
  [
    { restartPolicy: 'Always', holdOpen: true },
    /^`restartPolicy: 'Always'` keeps the session open between turns, and `holdOpen` settles a turn's end to wait for an answer\. Leave `holdOpen` off, and `say` the session its next words\.$/,
  ],
  [
    { restartPolicy: 'Always', deadlineSeconds: 60 },
    /^`restartPolicy: 'Always'` keeps the session open until it is stopped, and `deadlineSeconds` would stop it at a time\. Leave `deadlineSeconds` off, and `stop` the task when it should end\.$/,
  ],
  [
    { restartPolicy: 'Always', closeoutSchema: { type: 'object' } },
    /^`restartPolicy: 'Always'` keeps the session open until it is stopped, and a closing statement \(`closeoutSchema`\) would end its attempt\. Leave `closeoutSchema` off\.$/,
  ],
];

for (const [bad, says] of REFUSALS) {
  const spec = { ...ok, ...bad } as Filing;
  const name = Object.entries(bad)
    .map(([k, v]) => `${k}: ${typeof v === 'number' ? v : JSON.stringify(v)}`)
    .join(', ');

  test(`the core \`file\` refuses ${name}, journals nothing, and the engine refuses it in the same words`, async () => {
    const effect = coreDoor();
    const err = await effect.run(Effect.flip(file(spec)));
    assert.equal(err._tag, 'FileRefused', `failed with ${err._tag}: ${err.message}`);
    assert.match(err.message, says);
    assert.deepEqual(await effect.listed(), [], 'nothing was journalled, so no tick can spawn it');

    const door = engineDoor();
    const refused = await Effect.runPromise(Effect.flip(door.engine.file(spec)));
    assert.equal(refused._tag, 'FileRefused', `failed with ${refused._tag}: ${refused.message}`);
    assert.equal(refused.message, err.message, 'one function, one sentence, in the core and through the engine');
    assert.deepEqual(await door.listed(), []);
  });
}

test('the core `file` journals a filing that refuses nothing, with every checked key set', async () => {
  const effect = coreDoor();
  const full: Filing = {
    ...ok,
    deadlineSeconds: 60,
    resumeFrom: 's-1',
    queued: true,
    holdOpen: true,
    config: {
      model: 'opus',
      effort: 'high',
      tools: ['Read', 'Grep'],
      disallowedTools: ['SendMessage', 'Bash(npm run build)'],
      allowedTools: ['Edit(**)'],
      mcp: { web: { command: 'npx', args: ['web'] } },
      background: true,
      contextTokens: 200000,
      claude: { remoteControl: true },
    },
  };
  const id = await effect.run(file(full));
  assert.deepEqual(await effect.listed(), [id]);
});

test('the core `file` journals a long-lived filing with its restart policy, and a filing without one as a job', async () => {
  const effect = coreDoor();
  const always = await effect.run(file({ ...ok, restartPolicy: 'Always', queued: true, config: { background: true } }));
  const job = await effect.run(file(ok));
  const filedOf = (id: string) => effect.run(Effect.flatMap(Journal, (j) => j.read(id))).then((es) => es[0]);
  const filed = await filedOf(always);
  assert.equal(filed.kind === 'filed' && filed.restartPolicy, 'Always');
  assert.equal(Object.hasOwn(await filedOf(job), 'restartPolicy'), false, 'a job journals no restart policy');
});

test("the core `file` journals a harness's own words it cannot check: it has no harness to ask", async () => {
  const effect = coreDoor();
  await effect.run(file({ ...ok, harness: 'banana', config: { permissionMode: 'yolo' } }));
  assert.equal(
    (await effect.listed()).length,
    1,
    "a harness's own words are its runner's to refuse: the day the core `file` refuses them, this test says so",
  );
});

test("REFUSED at shipped defaults: Codex's arguments on a harness that is not Codex, by the engine, naming the harness that takes them — and taken on Codex", async () => {
  const mine: AsyncRunner = {
    async spawn() {},
    async observe() {
      return new Map();
    },
    async stop() {},
    async logs() {
      return '';
    },
  };
  const options: EngineOptions = {
    root: scratch('ae-codex-bag-'),
    journal: asyncStore(memoryStore()),
    harnesses: {
      claude: 'claude',
      bg: 'claude-bg',
      codex,
      'claude-detached': claudeDetached,
      remote: { url: 'https://a.example' },
      mine: asyncOps(mine),
    },
  };
  const engine = builtEngine(Engine.layer(options));
  const refused = (spec: Filing) => Effect.runPromise(Effect.flip(engine.file(spec)));
  const config = { codex: { trustFrom: '/repo' } };
  for (const harness of ['claude', 'bg', 'claude-detached', 'remote']) {
    const says = `\`codex\` gives Codex arguments of its own, and the \`${harness}\` harness is not Codex: its session would start without them. File the task on \`codex\`, or leave \`codex\` off.`;
    const err = await refused({ ...ok, harness, config });
    assert.equal(err._tag, 'FileRefused', harness);
    assert.equal(err.message, says, harness);
  }
  assert.ok(await Effect.runPromise(engine.file({ ...ok, harness: 'codex', config })), 'Codex takes them');
  assert.ok(await Effect.runPromise(engine.file({ ...ok, harness: 'mine', config })), 'a runner brought as its own is asked nothing');
  const lone = builtEngine(
    Engine.layer({ root: scratch('ae-codex-bag-'), journal: asyncStore(memoryStore()), harnesses: { claude: 'claude' } }),
  );
  await assert.rejects(
    Effect.runPromise(lone.file({ ...ok, harness: 'claude', config })),
    (e: Error) =>
      e.message ===
      "`codex` gives Codex arguments of its own, and the `claude` harness is not Codex: its session would start without them. Leave `codex` off: none of this engine's harnesses is Codex.",
  );
});

test('REFUSED at shipped defaults: a long-lived task on a harness that ends its session with its turn, by the engine, naming the harnesses that keep one open — and taken on those', async () => {
  const mine: AsyncRunner = {
    async spawn() {},
    async observe() {
      return new Map();
    },
    async stop() {},
    async logs() {
      return '';
    },
  };
  const options: EngineOptions = {
    root: scratch('ae-long-lived-'),
    journal: asyncStore(memoryStore()),
    harnesses: {
      claude: 'claude',
      bg: 'claude-bg',
      codex,
      'claude-detached': claudeDetached,
      remote: { url: 'https://a.example' },
      mine: asyncOps(mine),
    },
  };
  const engine = builtEngine(Engine.layer(options));
  const refused = (spec: Filing) => Effect.runPromise(Effect.flip(engine.file(spec)));
  const open = 'File the task on `claude` with `config.background: true` or `bg`, or leave `restartPolicy` off.';
  const cases: Array<[string, string]> = [
    ['claude', 'the `claude` harness runs this task as a job, which ends its session with its turn.'],
    ['codex', 'the `codex` harness ends its session with its turn.'],
    ['claude-detached', 'the `claude-detached` harness ends its session with its turn.'],
    ['remote', 'the `remote` harness ends its session with its turn.'],
  ];
  for (const [harness, why] of cases) {
    const says = `\`restartPolicy: 'Always'\` keeps a session open until it is stopped, and ${why} ${open}`;
    const err = await refused({ ...ok, harness, restartPolicy: 'Always' });
    assert.equal(err._tag, 'FileRefused', harness);
    assert.equal(err.message, says, harness);
  }
  assert.ok(
    await Effect.runPromise(engine.file({ ...ok, harness: 'claude', restartPolicy: 'Always', config: { background: true } })),
    'claude --bg keeps it open',
  );
  assert.ok(await Effect.runPromise(engine.file({ ...ok, harness: 'bg', restartPolicy: 'Always' })), 'so does the claude-bg harness');
  assert.ok(
    await Effect.runPromise(engine.file({ ...ok, harness: 'mine', restartPolicy: 'Always' })),
    'a runner brought as its own is asked nothing',
  );
  const lone = builtEngine(
    Engine.layer({ root: scratch('ae-long-lived-'), journal: asyncStore(memoryStore()), harnesses: { claude: 'claude' } }),
  );
  await assert.rejects(
    Effect.runPromise(lone.file({ ...ok, harness: 'claude', config: { background: false }, restartPolicy: 'Always' })),
    (e: Error) =>
      e.message ===
      "`restartPolicy: 'Always'` keeps a session open until it is stopped, and the `claude` harness runs this task as a job, which ends its session with its turn. File the task on `claude` with `config.background: true`, or leave `restartPolicy` off.",
  );
  const jobs = builtEngine(Engine.layer({ root: scratch('ae-long-lived-'), journal: asyncStore(memoryStore()), harnesses: { codex } }));
  await assert.rejects(
    Effect.runPromise(jobs.file({ ...ok, harness: 'codex', restartPolicy: 'Always' })),
    (e: Error) =>
      e.message ===
      "`restartPolicy: 'Always'` keeps a session open until it is stopped, and the `codex` harness ends its session with its turn. Leave `restartPolicy` off: none of this engine's harnesses keeps a session open.",
  );
});

test('REFUSED: `mayAsk: true` on a session this runtime does not hold attached, and taken on the one it does', async () => {
  const options = {
    root: scratch('ae-may-ask-'),
    journal: asyncStore(memoryStore()),
    harnesses: { claude: 'claude' as const, hers: 'claude' as const, bg: 'claude-bg' as const, codex },
  };
  const engine = builtEngine(Engine.layer(options));
  const refused = (spec: Filing) => Effect.runPromise(Effect.flip(engine.file(spec)));
  const asked = { ...ok, config: { mayAsk: true } };
  const job = await refused({ ...asked, harness: 'claude' });
  assert.equal(job._tag, 'FileRefused');
  assert.equal(
    job.message,
    "`mayAsk: true` holds a call that would ask a person open until one answers it, and only a session this runtime holds attached can hold one: the `claude` harness runs this task as a job, which ends its session with its turn. File the task `restartPolicy: 'Always'` on a harness configured `'claude'`, which this runtime holds attached, or leave `mayAsk` off.",
  );
  const elsewhere = await refused({ ...asked, harness: 'codex' });
  assert.match(elsewhere.message, /the `codex` harness has no session this runtime holds attached/);
  const detached = await refused({ ...asked, harness: 'bg', restartPolicy: 'Always' });
  assert.match(
    detached.message,
    /the `bg` harness has no session this runtime holds attached/,
    'a `claude --bg` session is driven by no `query()` of ours, so no call of it is caught at a hook: a long-lived filing does not make it hold one',
  );
  assert.ok(
    await Effect.runPromise(engine.file({ ...ok, harness: 'claude', restartPolicy: 'Always', config: { background: true, mayAsk: true } })),
    'the long-lived `claude` session this runtime holds attached holds a call open, so it takes it',
  );
  assert.ok(
    await Effect.runPromise(engine.file({ ...ok, harness: 'hers', restartPolicy: 'Always', config: { background: true, mayAsk: true } })),
    'which harnesses hold a call is read off their configuration (`heldHarnessesOf`), never off the name: a harness named anything and configured `claude` holds one',
  );
  assert.match(
    (await refused({ ...asked, harness: 'hers' })).message,
    /the `hers` harness runs this task as a job/,
    'and the same harness filed as a job is refused in the words of a harness whose session ends with its turn',
  );
});

test("Claude Code's own runners refuse Codex's arguments, so a runner reached without the engine's door refuses them too", () => {
  const task = { ...ok, config: { codex: { trustFrom: '/repo' } } };
  const says =
    '`codex: {"trustFrom":"/repo"}` gives Codex arguments of its own, and Claude Code is not Codex. Leave `codex` off a Claude Code task.';
  assert.equal(claudeCodeRefuses(task), says);
  assert.equal(claudeBgRefuses(task), says);
  assert.equal(claudeDetached.refuses!(task), says);
  assert.equal(codex.refuses!(task), undefined);
});
