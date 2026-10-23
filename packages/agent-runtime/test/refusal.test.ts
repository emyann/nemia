/**
 * What `file` refuses, in the core and through the engine, in one set of words.
 *
 * The harness-agnostic refusals live under the core `file` (`refusalOf` in `src/core/engine/filing.ts`), so a caller of
 * `agent-runtime` cannot journal `deadlineSeconds: NaN`, which would stop its task on the first pass, and the `Engine`
 * service's `file` fails with the same `FileRefused`: one table, every row at both doors. The harness's own words are the
 * engine's, a second table at the engine door; the core `file` has no harnesses to ask. A third holds what each door takes, and how
 * it is carried on the record. Codex's arguments (`config.codex`) on a harness that is not Codex, and a long-lived task
 * on a harness that ends its session with its turn, are refused by the `Engine` service, which has harnesses to ask.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { Effect, Layer } from 'effect';
import { Journal } from '../src/core/engine/journal.ts';
import { Runner } from '../src/harness/seam.ts';
import { file, type Filing } from '../src/core/engine/filing.ts';
import {
  claudeDetached,
  codex,
  type EngineOptions,
  type Event,
  type HarnessArgs,
  type HarnessSpec,
  type Sighting,
  type TaskSpec,
  type TaskView,
} from '../src/index.ts';
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
  return {
    engine: builtEngine(Engine.layer({ root: scratch('ae-refusal-root-'), journal: asyncStore(journal) })),
    listed: () => journal.list(),
  };
};

const ok: Filing = { brief: 'b', cwd: '/r' };

/**
 * Every harness-agnostic refusal: what is filed beside `ok`, and the sentence it is refused in. Values a type forbids are
 * cast, as a JSON caller would send them. Among them:
 *
 * - `maxAttempts` and `resume` are retired, at any value their defaults had: the runtime makes one attempt per start, and
 *   trying again is the caller's.
 * - `priority` is a whole number in int32, a Pod's priority: anything else is refused, on every harness, ahead of the harness's
 *   own words — `check` is a harness neither door has.
 * - `remoteControl` is Claude Code's own flag: refused as a harness argument or beside `config`, whatever it says, with a
 *   sentence naming where it goes.
 * - A harness argument goes under `config`, and nothing else goes there: one filed beside it (`model`, `permissionMode`,
 *   `worktree`, `budgetUsd`), by an untyped caller or a record an older caller wrote, would otherwise start its session
 *   without it, saying nothing; the refusal says where it goes.
 * - A `cwd` that is not absolute is refused on every harness, naming it resolved: the process that ticks would resolve it, and
 *   need not be the one that filed it, so no detached worker is launched into `repo/repo`.
 */
const REFUSALS: Array<[Record<string, unknown>, RegExp]> = [
  [{ brief: '  ' }, /^`brief` is empty\. Say what the session should do\.$/],
  [{ cwd: '' }, /^`cwd` is empty\./],
  ...['claude', 'codex', 'claude-detached'].map((harness): [Record<string, unknown>, RegExp] => [
    { cwd: 'repo', harness },
    new RegExp(`^\`cwd: repo\` is not an absolute path.*from here that is ${path.resolve('repo')}\\.$`),
  ]),
  [{ cwd: './repo' }, /^`cwd: \.\/repo` is not an absolute path/],
  [{ cwd: '~/repo' }, /^`cwd: ~\/repo` is not an absolute path/],
  [
    { maxAttempts: 1 },
    /^`maxAttempts` is retired: the runtime makes one attempt per start.*file it again.*`resumeFrom: <session id>`.*`retries:`.*`wf retry <run> <step>`/,
  ],
  [{ maxAttempts: 2 }, /^`maxAttempts` is retired:/],
  [{ resume: 'interrupted' }, /^`resume` is retired: the runtime makes one attempt per start.*`retries:`.*`wf retry <run> <step>`/],
  [{ resume: 'always' }, /^`resume` is retired:/],
  [{ deadlineSeconds: Number.NaN }, /^`deadlineSeconds: NaN` is not a number of seconds\./],
  [{ deadlineSeconds: 0 }, /^`deadlineSeconds: 0` is not a number of seconds\./],
  [{ deadlineSeconds: -5 }, /^`deadlineSeconds: -5` is not a number of seconds\./],
  [{ deadlineSeconds: Infinity }, /^`deadlineSeconds: Infinity` is not a number of seconds\./],
  [{ config: { model: '' } }, /^`model` is empty\./],
  [{ resumeFrom: '' }, /^`resumeFrom` is empty\./],
  [{ config: { effort: '' } }, /^`effort` is empty\./],
  [{ config: { tools: ['Read,Grep'] } }, /^`tools: \["Read,Grep"\]` is not a list of tool names\./],
  ...[[''], [' Read'], 'Read'].map((tools): [Record<string, unknown>, RegExp] => [{ config: { tools } }, /is not a list of tool names/]),
  [
    { config: { disallowedTools: ['Bash npm run build'] } },
    /^`disallowedTools: \["Bash npm run build"\]` is not a list of permission rules\./,
  ],
  ...[
    'SendMessage',
    [''],
    [' SendMessage'],
    [42],
    ['SendMessage,CronCreate'],
    ['Bash(npm run build'],
    ['Bash()'],
    ['(npm run build)'],
    ['-p'],
  ].map((disallowedTools): [Record<string, unknown>, RegExp] => [
    { config: { disallowedTools } },
    /is not a list of permission rules\. Give one rule per entry/,
  ]),
  [{ config: { allowedTools: ['Write(**'] } }, /^`allowedTools: \["Write\(\*\*"\]` is not a list of permission rules\./],
  ...['Write(**)', [''], [' Write(**)'], [42], ['Write(**),Edit(**)'], ['Bash npm test'], ['Write()'], ['(**)'], ['-p']].map(
    (allowedTools): [Record<string, unknown>, RegExp] => [
      { config: { allowedTools } },
      /is not a list of permission rules\. Give one rule per entry/,
    ],
  ),
  [{ config: { mcp: [] } }, /^`mcp: \[\]` is not a map of MCP servers by name\./],
  [{ config: { mcp: null } }, /`mcp: null` is not a map of MCP servers by name/],
  [{ config: { mcp: 'npx @playwright/mcp' } }, /is not a map of MCP servers by name/],
  [{ config: { mcp: { 'my server': { command: 'x' } } } }, /`mcp: "my server"` is not a server name/],
  [{ config: { mcp: { web: 'npx server' } } }, /`mcp.web` is not a server\. An entry is/],
  [{ config: { mcp: { web: {} } } }, /^`mcp\.web` has neither `command` nor `url`\./],
  [{ config: { mcp: { web: { command: 'x', url: 'https://h/mcp' } } } }, /`mcp.web` has both `command` and `url`/],
  [{ config: { mcp: { web: { command: '' } } } }, /`mcp.web.command` is not a program to run/],
  [{ config: { mcp: { web: { command: 'x', args: '-y server' } } } }, /`mcp.web.args` is not a list of strings/],
  [{ config: { mcp: { web: { command: 'x', env: { PORT: 3000 } } } } }, /`mcp.web.env` is not a map of strings/],
  [{ config: { mcp: { web: { command: 'x', cwd: '/r' } } } }, /`mcp.web` has `cwd`, which a server with a `command` does not take/],
  [{ config: { mcp: { web: { command: 'x', type: 'http' } } } }, /`mcp.web` has a `command` and `type: "http"`/],
  [{ config: { mcp: { web: { url: 'https://h/mcp' } } } }, /`mcp.web` has a `url` and no `type`.*Claude Code loads no server/],
  [{ config: { mcp: { web: { type: 'ws', url: 'https://h/mcp' } } } }, /`mcp.web` has a `url` and `type: "ws"`/],
  [{ config: { mcp: { web: { type: 'http', url: 7 } } } }, /`mcp.web.url` is not an address/],
  [
    { config: { mcp: { web: { type: 'http', url: 'https://h/mcp', env: {} } } } },
    /`mcp.web` has `env`, which a server with a `url` does not take/,
  ],
  [
    { config: { mcp: { web: { type: 'http', url: 'https://h/mcp', headers: { Authorization: 1 } } } } },
    /`mcp.web.headers` is not a map of strings/,
  ],
  [{ config: { budgetUsd: 0 } }, /^`budgetUsd: 0` is not an amount of dollars\./],
  [{ config: { budgetUsd: -1 } }, /^`budgetUsd: -1` is not an amount of dollars\./],
  [{ config: { budgetUsd: Number.NaN } }, /^`budgetUsd: NaN` is not an amount of dollars\./],
  [{ config: { budgetUsd: Infinity } }, /^`budgetUsd: Infinity` is not an amount of dollars\./],
  [{ config: { budgetUsd: '5' } }, /^`budgetUsd: "5"` is not an amount of dollars\./],
  ...[0, -1, Number.NaN, Infinity, '5'].map((budgetUsd): [Record<string, unknown>, RegExp] => [
    { harness: 'claude-detached', config: { budgetUsd } },
    /is not an amount of dollars\. Give dollars above 0/,
  ]),
  [
    { priority: 1.5 },
    /^`priority: 1\.5` is not a priority\. Give a whole number from -2147483648 to 2147483647, higher first, or leave it out for 0\.$/,
  ],
  [{ priority: 2 ** 31 }, /^`priority: 2147483648` is not a priority\./],
  [{ priority: Number.NaN }, /^`priority: NaN` is not a priority\./],
  [{ priority: '1' }, /^`priority: "1"` is not a priority\./],
  [{ priority: null }, /^`priority: null` is not a priority\./],
  ...['claude', 'codex', 'claude-detached', 'check'].flatMap((harness) =>
    [1.5, '1', 2 ** 31, -(2 ** 31) - 1, Number.NaN, null, Infinity].map((priority): [Record<string, unknown>, RegExp] => [
      { harness, priority },
      /^`priority: .*` is not a priority\. Give a whole number from -2147483648 to 2147483647, higher first, or leave it out for 0\./,
    ]),
  ),
  [
    { config: { remoteControl: true } },
    /^`remoteControl` is Claude Code's own flag, not a harness argument: file it with Claude Code's flags, as `config: \{ claude: \{ remoteControl: true \} \}`, or leave it out\.$/,
  ],
  [{ config: { remoteControl: 'true' } }, /^`remoteControl` is Claude Code's own flag/],
  [{ config: { remoteControl: false } }, /^`remoteControl` is Claude Code's own flag/],
  [{ remoteControl: true }, /^`remoteControl` is Claude Code's own flag/],
  [
    { config: { background: 'yes' } },
    /^`background: "yes"` is not true or false\. Give true to run the session as `claude --bg`, or leave it out to run it as a job\.$/,
  ],
  [{ config: { background: 1 } }, /^`background: 1` is not true or false\./],
  [{ config: { contextTokens: 0 } }, /^`contextTokens: 0` is not a number of tokens\./],
  [{ config: { contextTokens: 150000.5 } }, /^`contextTokens: 150000\.5` is not a number of tokens\./],
  [{ config: { contextTokens: '200k' } }, /^`contextTokens: "200k"` is not a number of tokens\./],
  ...[-200000, Number.NaN, Infinity, '200000'].map((contextTokens): [Record<string, unknown>, RegExp] => [
    { config: { contextTokens } },
    /`contextTokens: .*` is not a number of tokens\. Give a whole number of tokens, like 200000/,
  ]),
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
  ...['yes', 1, null].map((queued): [Record<string, unknown>, RegExp] => [{ queued }, /^`queued: .*` is not a yes or a no/]),
  ...[false, 'yes', 1].map((holdOpen): [Record<string, unknown>, RegExp] => [{ holdOpen }, /^`holdOpen: .*` is not a yes\. Give true/]),
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

/** A row's name: what it files beside `ok`. */
const nameOf = (bad: object) =>
  Object.entries(bad)
    .map(([k, v]) => `${k}: ${typeof v === 'number' ? v : JSON.stringify(v)}`)
    .join(', ');

test('file: every harness-agnostic refusal, in the core and through the engine at shipped defaults, in one sentence — FileRefused, and nothing journalled at either door', async (t) => {
  const effect = coreDoor();
  const door = engineDoor();
  for (const [bad, says] of REFUSALS) {
    await t.test(nameOf(bad), async () => {
      const spec = { ...ok, ...bad };
      const err = await effect.run(Effect.flip(file(spec)));
      assert.equal(err._tag, 'FileRefused', `failed with ${err._tag}: ${err.message}`);
      assert.match(err.message, says);
      assert.deepEqual(await effect.listed(), [], 'nothing was journalled, so no tick can spawn it');

      const refused = await Effect.runPromise(Effect.flip(door.engine.file(spec)));
      assert.equal(refused._tag, 'FileRefused', `failed with ${refused._tag}: ${refused.message}`);
      assert.equal(refused.message, err.message, 'one function, one sentence, in the core and through the engine');
      assert.deepEqual(await door.listed(), []);
    });
  }
});

/** A harness in eight lines, whose sessions are a map. */
const fakeHarness = (sessions: Map<string, Sighting>): AsyncRunner => ({
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
});

/** A command a test harness runs: nothing. */
const check: HarnessSpec = { name: 'check', command: () => ({ cmd: 'sh', args: ['-c', 'true'] }) };

/**
 * The engines the harness rows file through, each over a store in memory a row can read, built once per test: the doors a
 * caller of `agent-runtime` has. `shipped` is the three built-in harnesses; the rest bring their own.
 */
const harnessDoors = () => {
  const over = (harnesses?: EngineOptions['harnesses'], defaultHarness?: string) => {
    const journal = memoryStore();
    const engine = builtEngine(
      Engine.layer({
        root: scratch('ae-refusal-root-'),
        journal: asyncStore(journal),
        ...(harnesses ? { harnesses } : {}),
        ...(defaultHarness ? { defaultHarness } : {}),
      }),
    );
    return { engine, journal };
  };
  const picky: HarnessSpec = {
    name: 'picky',
    command: () => ({ cmd: 'true', args: [] }),
    refuses: (task) => (task.config?.model === 'huge' ? 'picky runs no huge models' : undefined),
  };
  const own = { ...asyncOps(fakeHarness(new Map())), refuses: (task: TaskSpec) => (task.brief === 'no' ? 'own runs no "no"' : undefined) };
  const bare: HarnessSpec = { name: 'bare', command: () => ({ cmd: 'sh', args: ['-c', 'true'] }) };
  const windowed: HarnessSpec = { ...bare, name: 'windowed', contextTokens: { least: 8_000, most: 32_000 } };
  const runner: AsyncRunner = { spawn: async () => {}, observe: async () => new Map(), stop: async () => {}, logs: async () => '' };
  return {
    shipped: over(),
    flags: over({ claude: 'claude-bg', codex, 'claude-detached': claudeDetached, check }),
    bgOnly: over({ claude: 'claude-bg' }),
    codexOnly: over({ codex }),
    brought: over({ picky, fake: asyncOps(fakeHarness(new Map())) }, 'picky'),
    own: over({ own }, 'own'),
    windows: over({ bare, windowed, runner: asyncOps(runner) }),
  };
};
type Doors = ReturnType<typeof harnessDoors>;

/**
 * What only an engine refuses, since it has harnesses to ask: the harness's own words (a mode, an effort, a list Codex has no
 * place for), a knob the harness lacks, Claude Code's own flags off Claude Code, and what a harness brought as a spec or as its
 * own `RunnerOps` says. Each on the engine `door` names, with `spec` beside `ok`.
 */
const HARNESS_REFUSALS: Array<{ name: string; door: keyof Doors; spec: Record<string, unknown>; says: RegExp }> = [
  {
    name: 'a harness the engine does not have, rather than run the task on the fallback',
    door: 'shipped',
    spec: { harness: 'banana' },
    says: /`harness: banana` is not a harness this engine has.*claude, codex, claude-detached/,
  },
  {
    name: "a permission mode outside Claude Code's own words",
    door: 'shipped',
    spec: { config: { permissionMode: 'yolo' } },
    says: /`permissionMode: yolo` is not a mode Claude Code has/,
  },
  {
    name: "Codex's sandbox on claude-detached",
    door: 'shipped',
    spec: { harness: 'claude-detached', config: { permissionMode: 'read-only' } },
    says: /not a mode Claude Code has/,
  },
  {
    name: "Claude Code's mode on codex",
    door: 'shipped',
    spec: { harness: 'codex', config: { permissionMode: 'auto' } },
    says: /`permissionMode: auto` is not a sandbox Codex has/,
  },
  {
    name: 'an effort Claude Code does not have, which it would have ignored',
    door: 'shipped',
    spec: { config: { effort: 'extreme' } },
    says: /`effort: extreme` is not an effort Claude Code has/,
  },
  {
    name: 'an effort Codex does not have',
    door: 'shipped',
    spec: { harness: 'codex', config: { effort: 'extreme' } },
    says: /not a reasoning effort Codex has/,
  },
  {
    name: 'a deny list on codex',
    door: 'shipped',
    spec: { harness: 'codex', config: { disallowedTools: ['SendMessage'] } },
    says: /is a deny list, and Codex has no tool list/,
  },
  {
    name: 'an allow list on codex',
    door: 'shipped',
    spec: { harness: 'codex', config: { allowedTools: ['Write(**)'] } },
    says: /is an allow list, and Codex has no tool list/,
  },
  {
    name: 'an SSE server on codex',
    door: 'shipped',
    spec: { harness: 'codex', config: { mcp: { docs: { type: 'sse', url: 'https://h/sse' } } } },
    says: /`mcp.docs` is an SSE server, and Codex connects only to stdio and streamable HTTP/,
  },
  {
    name: 'a spend cap on a background session, which keeps none',
    door: 'shipped',
    spec: { config: { budgetUsd: 5, background: true } },
    says: /`budgetUsd: 5` is a spend cap, and a `claude --bg` session does not keep one.*Leave `config\.background` off to run the task as a job, which ends the session at its cap/,
  },
  {
    name: 'a spend cap on codex',
    door: 'shipped',
    spec: { harness: 'codex', config: { budgetUsd: 5 } },
    says: /`budgetUsd: 5` is a spend cap in dollars, and `codex exec` has none/,
  },
  ...['codex', 'claude-detached', 'check'].map((harness) => ({
    name: `claude.remoteControl on ${harness}, which has no such flag, ahead of the bag's own refusal`,
    door: 'flags' as const,
    spec: { harness, config: { claude: { remoteControl: true } } },
    says: new RegExp(
      `^\`claude\\.remoteControl\` asks for a session bridged to claude\\.ai, and the \`${harness}\` harness has no such flag.*File the task on \`claude\`, or leave \`claude\\.remoteControl\` off`,
    ),
  })),
  {
    name: 'claude.remoteControl on an engine none of whose harnesses bridges a session',
    door: 'codexOnly',
    spec: { config: { claude: { remoteControl: true } } },
    says: /the `codex` harness has no such flag.*Leave `claude\.remoteControl` off: none of this engine's harnesses bridges a session/,
  },
  {
    name: 'claude.remoteControl on a job, which a task at shipped defaults is unless it asks for a background session',
    door: 'shipped',
    spec: { config: { claude: { remoteControl: true } } },
    says: /^`claude\.remoteControl` bridges a session to claude\.ai, and only a background session \(`claude --bg`\) can be bridged.*Give `config\.background: true` as well, or leave `claude\.remoteControl` off/,
  },
  ...['codex', 'claude-detached'].map((harness) => ({
    name: `background on ${harness}, which has no such mode`,
    door: 'shipped' as const,
    spec: { harness, config: { background: true } },
    says: new RegExp(
      `\`background: true\` asks for a Claude Code background session, and the \`${harness}\` harness has no such mode\\. File the task on \`claude\`, or leave \`background\` off`,
    ),
  })),
  {
    name: 'background on a claude-bg harness, every session of which is one already',
    door: 'bgOnly',
    spec: { config: { background: true } },
    says: /the `claude` harness has no such mode: every session of it is one already\. Leave `background` off/,
  },
  ...['claude', 'claude-detached'].flatMap((harness) =>
    [99_999, 1_000_001, 1_000].map((contextTokens) => ({
      name: `contextTokens: ${contextTokens} on ${harness}, outside what Claude Code takes — it refuses one as it parses its arguments, so a spawn would fail on every pass`,
      door: 'shipped' as const,
      spec: { harness, config: { contextTokens } },
      says: new RegExp(
        `\`contextTokens: ${contextTokens}\` is outside the windows the \`${harness}\` harness takes.*from 100000 to 1000000`,
      ),
    })),
  ),
  {
    name: 'contextTokens on codex',
    door: 'shipped',
    spec: { harness: 'codex', config: { contextTokens: 200000 } },
    says: /`contextTokens: 200000` sets the session's context window, and the `codex` harness has no such knob.*File the task on `claude` or `claude-detached`/,
  },
  {
    name: 'contextTokens on a HarnessSpec that declares no windows',
    door: 'windows',
    spec: { harness: 'bare', config: { contextTokens: 16_000 } },
    says: /the `bare` harness has no such knob: it would run on its own window.*File the task on `windowed`, whose sessions compact past it, or leave `contextTokens` off/,
  },
  {
    name: 'contextTokens outside the windows a HarnessSpec declares',
    door: 'windows',
    spec: { harness: 'windowed', config: { contextTokens: 64_000 } },
    says: /from 8000 to 32000/,
  },
  {
    name: "contextTokens on an engine none of whose harnesses sets a session's window",
    door: 'codexOnly',
    spec: { config: { contextTokens: 200000 } },
    says: /Leave `contextTokens` off: none of this engine's harnesses sets a session's window/,
  },
  {
    name: 'a harness brought as a spec is asked its own refusals',
    door: 'brought',
    spec: { config: { model: 'huge' } },
    says: /picky runs no huge models/,
  },
  {
    name: 'a runner brought as its own RunnerOps is asked its own refusal',
    door: 'own',
    spec: { brief: 'no' },
    says: /own runs no "no"/,
  },
];

test("file: what only an engine refuses, in its harness's words or a brought harness's own — FileRefused, and nothing journalled", async (t) => {
  const doors = harnessDoors();
  for (const row of HARNESS_REFUSALS) {
    await t.test(row.name, async () => {
      const { engine, journal } = doors[row.door];
      const before = await journal.list();
      const err = await Effect.runPromise(Effect.flip(engine.file({ ...ok, ...row.spec })));
      assert.equal(err._tag, 'FileRefused', err.message);
      assert.match(err.message, row.says);
      assert.deepEqual(await journal.list(), before, 'nothing was journalled');
    });
  }
});

/** The filing event a task was journalled with. */
const filedOf = async (journal: AsyncJournal, id: string) => (await journal.read(id))[0] as Extract<Event, { kind: 'filed' }>;

/**
 * What `file` takes, and how it carries it: on the record for the runner, under `config` and nowhere else, and read back by `view`.
 * Each row files through the door it names and reads what it journalled.
 */
const TAKEN: Array<{
  name: string;
  door: keyof Doors;
  spec: Record<string, unknown>;
  holds: (filed: Extract<Event, { kind: 'filed' }>, view: TaskView) => void;
}> = [
  ...(
    [
      ['codex', { permissionMode: 'read-only' }],
      ['claude', { permissionMode: 'default' }],
      ['claude', { effort: 'xhigh' }],
      ['codex', { effort: 'minimal' }],
      ['claude', { tools: ['Read', 'Grep', 'Glob'] }],
      [
        'claude',
        {
          disallowedTools: [
            'SendMessage',
            'Bash(npm run build)',
            'mcp__playwright__browser_run_code_unsafe',
            'Read(//home/**)',
            `Bash(git commit -m 'wip')`,
          ],
        },
      ],
      [
        'claude',
        { allowedTools: ['Write(**)', 'Edit(**)', 'Bash(npm test)', 'mcp__playwright__browser_navigate', `Bash(git commit -m 'wip')`] },
      ],
      ['claude-detached', { mcp: { docs: { type: 'sse', url: 'https://h/sse' } } }],
      [
        'claude',
        {
          mcp: {
            browser: { command: 'npx', args: ['-y', '@playwright/mcp'], env: { HEADLESS: '1' } },
            docs: { type: 'http', url: 'https://h/mcp' },
          },
        },
      ],
      ['claude', { background: true }],
      ['claude', { background: true, claude: { remoteControl: true } }],
      ['claude', { background: false }],
    ] as Array<[string, HarnessArgs]>
  ).map(([harness, config]) => ({
    name: `${harness} journals ${JSON.stringify(config)} on the record, for the runner`,
    door: 'shipped' as const,
    spec: { harness, config },
    holds: (filed: Extract<Event, { kind: 'filed' }>) => assert.deepEqual(filed.config, config),
  })),
  ...(['claude-detached', 'claude'] as const).map((harness) => ({
    name: `a job keeps its spend cap on ${harness}, under config and nowhere else: \`claude -p\` ends the session at it`,
    door: 'shipped' as const,
    spec: { harness, config: { budgetUsd: 0.25 } },
    holds: (filed: Extract<Event, { kind: 'filed' }>, view: TaskView) => {
      assert.deepEqual(filed.config, { budgetUsd: 0.25 }, 'on the record, for the runner');
      assert.equal('budgetUsd' in filed, false, 'and nowhere else');
      assert.equal(view.state.config?.budgetUsd, 0.25);
    },
  })),
  ...[1, -1, 2 ** 31 - 1].map((priority) => ({
    name: `a whole priority in int32, ${priority}, carried on the record`,
    door: 'shipped' as const,
    spec: { harness: 'codex', priority },
    holds: (_: unknown, view: TaskView) => assert.equal(view.state.priority, priority),
  })),
  {
    name: 'claude.remoteControl on claude, on the record and read back',
    door: 'flags',
    spec: { config: { claude: { remoteControl: true } } },
    holds: (filed, view) => {
      assert.deepEqual(filed.config, { claude: { remoteControl: true } }, 'on the record, for the runner');
      assert.equal(view.state.config?.claude?.remoteControl, true);
    },
  },
  ...(
    [
      ['claude', 200000],
      ['claude-detached', 100000],
      ['claude', 1000000],
    ] as const
  ).map(([harness, contextTokens]) => ({
    name: `contextTokens: ${contextTokens} on ${harness}, both ends of the range taken`,
    door: 'shipped' as const,
    spec: { harness, config: { contextTokens } },
    holds: (filed: Extract<Event, { kind: 'filed' }>, view: TaskView) => {
      assert.equal(filed.config?.contextTokens, contextTokens, 'on the record, for the runner');
      assert.equal(view.state.config?.contextTokens, contextTokens);
    },
  })),
  {
    name: 'a cwd resolved, the same directory a relative one names',
    door: 'shipped',
    spec: { cwd: path.resolve('repo') },
    holds: (filed) => assert.equal(filed.cwd, path.resolve('repo')),
  },
  {
    name: 'a harness brought as a runner is asked nothing of its mode',
    door: 'brought',
    spec: { harness: 'fake', config: { permissionMode: 'anything' } },
    holds: (filed) => assert.equal(filed.config?.permissionMode, 'anything'),
  },
  {
    name: 'a harness brought as a spec takes what its own refusal passes',
    door: 'brought',
    spec: { config: { model: 'small' } },
    holds: (filed) => assert.equal(filed.harness, 'picky'),
  },
  {
    name: 'a runner brought as its own RunnerOps takes what its refusal passes',
    door: 'own',
    spec: { brief: 'yes' },
    holds: (filed) => assert.equal(filed.brief, 'yes'),
  },
  {
    name: 'contextTokens inside the windows a HarnessSpec declares',
    door: 'windows',
    spec: { harness: 'windowed', config: { contextTokens: 16_000 } },
    holds: (filed) => assert.equal(filed.config?.contextTokens, 16_000),
  },
  {
    name: "contextTokens on a runner, which is a runner's own business",
    door: 'windows',
    spec: { harness: 'runner', config: { contextTokens: 5 } },
    holds: (filed) => assert.equal(filed.config?.contextTokens, 5),
  },
];

test('file journals what it takes: on the record for the runner, under config and nowhere else, read back by view', async (t) => {
  const doors = harnessDoors();
  for (const row of TAKEN) {
    await t.test(row.name, async () => {
      const { engine, journal } = doors[row.door];
      const id = await Effect.runPromise(engine.file({ ...ok, ...row.spec }));
      row.holds(await filedOf(journal, id), await Effect.runPromise(engine.view(id)));
    });
  }
  await t.test('the core `file` journals a filing that refuses nothing, with every checked key set', async () => {
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
  await t.test('the core `file` journals a long-lived filing with its restart policy, and a filing without one as a job', async () => {
    const effect = coreDoor();
    const always = await effect.run(file({ ...ok, restartPolicy: 'Always', queued: true, config: { background: true } }));
    const job = await effect.run(file(ok));
    const filedIn = (id: string) => effect.run(Effect.flatMap(Journal, (j) => j.read(id))).then((es) => es[0]);
    const filed = await filedIn(always);
    assert.equal(filed.kind === 'filed' && filed.restartPolicy, 'Always');
    assert.equal(Object.hasOwn(await filedIn(job), 'restartPolicy'), false, 'a job journals no restart policy');
  });
  await t.test("the core `file` journals a harness's own words it cannot check: it has no harness to ask", async () => {
    const effect = coreDoor();
    await effect.run(file({ ...ok, harness: 'banana', config: { permissionMode: 'yolo' } }));
    assert.equal(
      (await effect.listed()).length,
      1,
      "a harness's own words are its runner's to refuse: the day the core `file` refuses them, this test says so",
    );
  });
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
