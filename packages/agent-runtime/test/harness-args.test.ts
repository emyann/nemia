/**
 * The checks every harness shares of a task's `config`, in their own file (`src/harness/args.ts`), and asked through the
 * `Runner` — each made to refuse, at shipped defaults.
 *
 * `test/refusal.test.ts` holds their words. A harness argument filed beside `config` is refused naming where
 * it goes, and a `config` that is not an object, or holds a key that is no harness argument, is refused rather than
 * carried to a runner that would drop it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect, Layer } from 'effect';
import { argsRefusalOf, configForTurn, HARNESS_ARGS, TURN_ARGS, turnArgsRefusalOf, type HarnessArgs } from '../src/harness/args.ts';
import { Runner, testOps, type RunnerOps } from '../src/harness/seam.ts';
import { composite } from '../src/harness/seam.ts';
import { sdkRunner } from '../src/harness/sdk.ts';
import { Journal } from '../src/core/engine/journal.ts';
import { file, type Filing } from '../src/core/engine/filing.ts';

const task = { brief: 'b', cwd: '/r' };
type Asked = Parameters<NonNullable<RunnerOps['refuses']>>[0];

/** What `ops`, made a `Runner` as every runner is (`Runner.layer`), says of `t`. */
const refusedBy = (ops: RunnerOps, t: Asked) =>
  Effect.runSync(
    Effect.gen(function* () {
      return (yield* Runner).refuses?.(t);
    }).pipe(Effect.provide(Runner.layer(ops))),
  );

test("HARNESS_ARGS is the nineteen arguments a harness takes — the spend cap, the mounts, a call's admission, Claude Code's own flags, Codex's and a command's among them, and remoteControl not: it is one of those flags", () => {
  assert.deepEqual([...HARNESS_ARGS].sort(), [
    'allowedTools',
    'background',
    'budgetUsd',
    'callAdmission',
    'checkoutMcp',
    'claude',
    'codex',
    'command',
    'contextTokens',
    'disallowedTools',
    'effort',
    'env',
    'mcp',
    'model',
    'mounts',
    'niceness',
    'permissionMode',
    'tools',
    'worktree',
  ]);
});

test("remoteControl, one of Claude Code's own flags, is refused under config and beside it at any value, naming config.claude — and taken there", () => {
  const says =
    "`remoteControl` is Claude Code's own flag, not a harness argument: file it with Claude Code's flags, as `config: { claude: { remoteControl: true } }`, or leave it out.";
  for (const value of [true, false, undefined]) {
    assert.equal(argsRefusalOf({ ...task, config: { remoteControl: value } } as never), says, `config.remoteControl: ${value}`);
    assert.equal(argsRefusalOf({ ...task, remoteControl: value } as never), says, `remoteControl: ${value} beside config`);
    assert.equal(
      argsRefusalOf({ ...task, model: 'opus', config: { remoteControl: value } } as never),
      says,
      'before any other refusal: a caller that files it with a model loose beside config is told about the move first',
    );
  }
  assert.equal(argsRefusalOf({ ...task, config: { background: true, claude: { remoteControl: true } } }), undefined);
});

test('a harness argument filed beside config is refused, naming where it goes — each of the nineteen — and the same value under config is taken', () => {
  const value: Record<keyof HarnessArgs, unknown> = {
    model: 'opus',
    permissionMode: 'auto',
    effort: 'high',
    tools: ['Read'],
    allowedTools: ['Edit(**)'],
    disallowedTools: ['SendMessage'],
    mcp: {},
    checkoutMcp: ['playwright'],
    contextTokens: 200000,
    background: true,
    worktree: true,
    budgetUsd: 5,
    claude: { appendSystemPromptFile: 'prompt.md' },
    codex: { trustFrom: '/repo' },
    command: ['sh', '-c', 'npm test'],
    env: { CI: '1' },
    niceness: 10,
    mounts: [{ path: '/repo', readOnly: true }],
    callAdmission: { command: ['my-admit'], tools: ['Bash'] },
  };
  for (const key of HARNESS_ARGS) {
    const says = argsRefusalOf({ ...task, [key]: value[key] } as never);
    assert.equal(says, `\`${key}\` is the harness's configuration: file it under \`config\`, as \`config: { ${key}: … }\`.`, key);
    assert.equal(argsRefusalOf({ ...task, config: { [key]: value[key] } }), undefined, `config.${key}`);
  }
  assert.equal(
    argsRefusalOf({ ...task, model: undefined } as never),
    undefined,
    'an absent key a JSON caller spelled out as undefined is no argument at all',
  );
});

test('a config that is not an object of arguments is refused, and says what one is', () => {
  for (const config of [null, 'opus', 7, ['model'], true]) {
    const says = argsRefusalOf({ ...task, config } as never) ?? '';
    assert.ok(
      says.startsWith(`\`config: ${JSON.stringify(config)}\` is not a harness's configuration. Give an object of its arguments`),
      says,
    );
  }
  assert.equal(argsRefusalOf({ ...task, config: {} }), undefined, 'an empty one is the harness defaults');
  assert.equal(argsRefusalOf({ ...task, config: undefined }), undefined, 'and so is none');
});

test('a key in config that is no harness argument is refused by name, with the list', () => {
  const says = argsRefusalOf({ ...task, config: { model: 'opus', modle: 'haiku' } } as never) ?? '';
  assert.ok(says.startsWith('`config.modle` is not a harness argument.'), says);
  for (const key of HARNESS_ARGS) assert.ok(says.includes(key), `the list names ${key}`);
  assert.match(
    argsRefusalOf({ ...task, config: { priority: 1 } } as never) ?? '',
    /^`config\.priority` is not a harness argument\./,
    'priority, a word of a task and never of a harness, is refused as any other',
  );
});

test('a spend cap is dollars above 0, under config: anything else is refused, and saying what one is', () => {
  for (const bad of [0, -1, Number.NaN, Infinity, 'five', '5', null]) {
    const says = argsRefusalOf({ ...task, config: { budgetUsd: bad } } as never) ?? '';
    assert.ok(
      says.startsWith(
        `\`budgetUsd: ${typeof bad === 'number' ? bad : JSON.stringify(bad)}\` is not an amount of dollars. Give dollars above 0`,
      ),
      says,
    );
    assert.ok(says.endsWith('or leave it out for no cap.'), says);
  }
  for (const good of [0.01, 5, 250]) assert.equal(argsRefusalOf({ ...task, config: { budgetUsd: good } }), undefined, String(good));
});

test("Claude Code's own flags are an object of flags in camelCase, each saying one thing on the command line: anything else is refused, at shipped defaults", () => {
  for (const claude of [null, 'x', 7, ['pluginDir'], true]) {
    const says = argsRefusalOf({ ...task, config: { claude } } as never) ?? '';
    assert.ok(says.startsWith(`\`claude: ${JSON.stringify(claude)}\` is not a set of Claude Code's flags.`), says);
  }
  for (const key of ['append-system-prompt-file', 'AppendSystemPromptFile', 'p', 'plugin_dir', '--settings', '']) {
    const says = argsRefusalOf({ ...task, config: { claude: { [key]: 'x' } } }) ?? '';
    assert.ok(says.startsWith(`\`claude.${key}\` is not a flag's name in camelCase.`), `${key}: ${says}`);
  }
  for (const value of [false, null, '', {}, [], ['a', ''], [1], Number.NaN]) {
    const says = argsRefusalOf({ ...task, config: { claude: { pluginDir: value } } } as never) ?? '';
    assert.ok(
      says.startsWith(`\`claude.pluginDir: ${JSON.stringify(value)}\` is not a flag's value.`),
      `${JSON.stringify(value)}: ${says}`,
    );
  }
  assert.equal(argsRefusalOf({ ...task, config: { claude: {} } }), undefined, 'none at all is no flag');
  assert.equal(
    argsRefusalOf({
      ...task,
      config: { claude: { appendSystemPromptFile: 'p.md', pluginDir: ['a', 'b'], settings: '{}', bare: true, maxTurns: 2 } },
    }),
    undefined,
  );
});

test("Codex's own arguments are an object holding only `trustFrom`, an absolute directory: anything else is refused, at shipped defaults", () => {
  for (const codex of [null, 'x', 7, [], true]) {
    const says = argsRefusalOf({ ...task, config: { codex } } as never) ?? '';
    assert.ok(says.startsWith(`\`codex: ${JSON.stringify(codex)}\` is not a set of Codex's arguments.`), says);
    assert.ok(says.includes('{ "trustFrom": "/path/to/repo" }'), says);
  }
  assert.equal(
    argsRefusalOf({ ...task, config: { codex: { trustfrom: '/a' } } } as never),
    "`codex.trustfrom` is not one of Codex's arguments. Its only one is `trustFrom`, the directory whose trust in your Codex config extends to the cwd.",
  );
  for (const trustFrom of ['', 'rel/dir', 7, null]) {
    const says = argsRefusalOf({ ...task, config: { codex: { trustFrom } } } as never) ?? '';
    assert.ok(says.startsWith(`\`codex.trustFrom: ${JSON.stringify(trustFrom)}\` is not an absolute directory.`), says);
  }
  assert.equal(argsRefusalOf({ ...task, config: { codex: {} } }), undefined, 'none at all names no directory');
  assert.equal(argsRefusalOf({ ...task, config: { codex: { trustFrom: '/repo' } } }), undefined);
  assert.equal(argsRefusalOf({ ...task, config: { codex: { trustFrom: undefined } } }), undefined, 'an absent key spelled out');
});

test('a turn gives its own spend cap and nothing else of the configuration, which the session it continues was started with: each refused, at shipped defaults', () => {
  assert.deepEqual([...TURN_ARGS], ['budgetUsd']);
  assert.equal(turnArgsRefusalOf(undefined), undefined, "none: the task's own");
  assert.equal(turnArgsRefusalOf({}), undefined);
  assert.equal(turnArgsRefusalOf({ budgetUsd: 0.5 }), undefined);
  for (const bad of [null, 'opus', 7, ['budgetUsd']]) {
    const says = turnArgsRefusalOf(bad) ?? '';
    assert.ok(says.startsWith(`\`config: ${JSON.stringify(bad)}\` is not a turn's configuration.`), says);
  }
  for (const key of ['model', 'permissionMode', 'worktree', 'modle']) {
    const says = turnArgsRefusalOf({ [key]: 'x' }) ?? '';
    assert.ok(says.startsWith(`\`config.${key}\` cannot be given to one turn`) && says.includes('(`resumeFrom`)'), says);
  }
  for (const bad of [0, -2, Number.NaN, 'lots']) {
    const says = turnArgsRefusalOf({ budgetUsd: bad }) ?? '';
    assert.ok(
      says.startsWith(`\`budgetUsd: ${typeof bad === 'number' ? bad : JSON.stringify(bad)}\` is not an amount of dollars.`) &&
        says.endsWith("or leave it out for the task's own."),
      says,
    );
  }
});

test("a turn's configuration is laid over the task's own, which it leaves unchanged", () => {
  const own: HarnessArgs = { model: 'opus', budgetUsd: 2 };
  assert.equal(configForTurn(own, undefined), own, "no turn of its own: the filing's, as it is");
  assert.equal(configForTurn(undefined, undefined), undefined);
  assert.deepEqual(configForTurn(own, { budgetUsd: 0.5 }), { model: 'opus', budgetUsd: 0.5 });
  assert.deepEqual(configForTurn(undefined, { budgetUsd: 0.5 }), { budgetUsd: 0.5 });
  assert.deepEqual(own, { model: 'opus', budgetUsd: 2 }, 'the filing is not written through');
});

test('where a key is and whether it is one are said before what its value is', () => {
  const first = 'two faults: the first sentence a person reads fixes the one that makes the second make sense';
  assert.match(
    argsRefusalOf({ ...task, model: 'opus', config: { effort: '' } } as never) ?? '',
    /^`model` is the harness's configuration/,
    first,
  );
  assert.match(
    argsRefusalOf({ ...task, config: { stray: 1, effort: '' } } as never) ?? '',
    /^`config\.stray` is not a harness argument/,
    first,
  );
});

test('every Runner refuses the shared checks before its own, and asks its own when they pass', () => {
  const asked: string[] = [];
  const ops: RunnerOps = {
    ...testOps(),
    refuses: (t) => {
      asked.push(t.config?.model ?? '-');
      return t.config?.model === 'huge' ? 'no huge models' : undefined;
    },
  };
  const refuses = (t: Asked) => refusedBy(ops, t);

  assert.match(refuses({ ...task, config: { model: '' } }) ?? '', /^`model` is empty\./);
  assert.deepEqual(asked, [], 'a value no harness could use never reaches the runner');
  assert.equal(refuses({ ...task, config: { model: 'huge' } }), 'no huge models', 'its own words, once the shared checks pass');
  assert.equal(refuses({ ...task, config: { model: 'opus' } }), undefined);
  assert.deepEqual(asked, ['huge', 'opus']);

  const bare = { ...testOps() };
  delete bare.refuses;
  assert.match(
    refusedBy(bare, { ...task, config: { tools: ['Read,Grep'] } }) ?? '',
    /^`tools: \["Read,Grep"\]` is not a list of tool names\./,
    'a runner that says nothing of its own still refuses the shared checks: `Runner.layer` asks them for it',
  );
});

test("a composite asks the task's own harness, as a spawn is sent", () => {
  const said = (word: string): RunnerOps => ({ ...testOps(), refuses: () => word });
  const both = composite({ a: said('a refuses'), b: said('b refuses') }, 'a');
  assert.equal(both.refuses?.({ ...task, harness: 'b' }), 'b refuses');
  assert.equal(both.refuses?.(task), 'a refuses', 'and the fallback for a task that names none');
  assert.match(
    refusedBy(both, { ...task, harness: 'b', config: { effort: '' } }) ?? '',
    /^`effort` is empty\./,
    'through the layer, the shared checks come first whichever harness is named',
  );
});

/** A task no harness could use, one of each kind: a value, a list, where a key is, what `config` is, and a key it holds. */
const UNUSABLE: [Record<string, unknown>, RegExp][] = [
  [{ config: { model: '' } }, /^`model` is empty\./],
  [{ config: { tools: ['Read,Grep'] } }, /^`tools: \["Read,Grep"\]` is not a list of tool names\./],
  [{ model: 'opus' }, /^`model` is the harness's configuration/],
  [{ config: 'opus' }, /^`config: "opus"` is not a harness's configuration\./],
  [{ config: { priority: 5 } }, /^`config\.priority` is not a harness argument\./],
  [{ config: { budgetUsd: 0 } }, /^`budgetUsd: 0` is not an amount of dollars\./],
];

/** `file` through the Effect door over `runner`, and what it journalled. */
const filedOver = async (runner: Layer.Layer<Runner>, spec: Filing) => {
  const layer = Layer.mergeAll(Journal.test(), runner);
  const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.runPromise(e.pipe(Effect.provide(layer)));
  const err = await run(Effect.flip(file(spec)));
  return { err, listed: await run(Effect.flatMap(Journal, (j) => j.list)) };
};

test('the SDK runner is made a Runner by Runner.layer, so it refuses the shared checks as every runner does', () => {
  const refuses = (t: Asked) =>
    Effect.runSync(
      Effect.gen(function* () {
        return (yield* Runner).refuses?.(t);
      }).pipe(Effect.provide(sdkRunner())),
    );
  for (const [bad, says] of UNUSABLE) assert.match(refuses({ ...task, ...bad }) ?? '', says, JSON.stringify(bad));
  assert.equal(refuses({ ...task, config: { model: 'opus' } }), undefined);
});

test('file asks the shared checks itself, over any runner: the SDK runner, and one a consumer builds by hand with the exported Runner.of, skipping Runner.layer', async () => {
  const RUNNERS: [string, Layer.Layer<Runner>][] = [
    ['sdkRunner()', sdkRunner()],
    ['Runner.of by hand', Layer.succeed(Runner)(Runner.of(testOps()))],
  ];
  for (const [label, runner] of RUNNERS) {
    for (const [bad, says] of UNUSABLE) {
      const { err, listed } = await filedOver(runner, { ...task, ...bad });
      assert.equal(err._tag, 'FileRefused', `${label}, ${JSON.stringify(bad)}: failed with ${err._tag}`);
      assert.match(err.message, says, `${label}, ${JSON.stringify(bad)}`);
      assert.deepEqual(listed, [], `${label}: nothing journalled`);
    }
  }
});

test('a command is a list of strings, the program first and no NUL in any: anything else is refused, and saying what one is', () => {
  const nul = String.fromCharCode(0);
  for (const bad of [[], [''], 'npm test', [1], ['sh', 7], ['sh', `-c${nul}`], null, { cmd: 'sh' }]) {
    const says = argsRefusalOf({ ...task, config: { command: bad } } as never) ?? '';
    assert.equal(
      says,
      `\`command: ${JSON.stringify(bad)}\` is not a command. Give the program and its arguments as a list of strings, the program first, like ["sh", "-c", "npm test"].`,
      JSON.stringify(bad),
    );
  }
  for (const good of [['true'], ['sh', '-c', 'npm test'], ['node', '']]) {
    assert.equal(argsRefusalOf({ ...task, config: { command: good } }), undefined, JSON.stringify(good));
  }
});

test('an env is an object of variable names to strings with no NUL: an array, a name a shell would not take, a value that is no string, each refused', () => {
  const nul = String.fromCharCode(0);
  for (const bad of [['CI'], 'CI=1', null, 7]) {
    const says = argsRefusalOf({ ...task, config: { env: bad } } as never) ?? '';
    assert.ok(says.startsWith(`\`env: ${JSON.stringify(bad)}\` is not an environment.`), says);
  }
  for (const name of ['1CI', 'A-B', 'A=B', '', 'A B']) {
    const says = argsRefusalOf({ ...task, config: { env: { OK: '1', [name]: '1' } } }) ?? '';
    assert.ok(says.startsWith(`\`env.${name}\` is not a variable's name.`), says);
  }
  for (const value of [1, null, true, `a${nul}b`]) {
    const says = argsRefusalOf({ ...task, config: { env: { CI: value } } } as never) ?? '';
    assert.ok(says.startsWith(`\`env.CI: ${JSON.stringify(value)}\` is not a variable's value.`), says);
  }
  assert.equal(argsRefusalOf({ ...task, config: { env: { CI: '1', _X9: '' } } }), undefined);
  assert.equal(argsRefusalOf({ ...task, config: { env: {} } }), undefined, "an empty one is the worker's own");
});

test('a niceness is a whole number from 0 to 19: anything else is refused, and saying what one is', () => {
  for (const bad of [-1, 20, 1.5, Number.NaN, Infinity, '10', null]) {
    const says = argsRefusalOf({ ...task, config: { niceness: bad } } as never) ?? '';
    assert.ok(says.startsWith('`niceness: ') && says.includes('` is not a niceness. Give a whole number from 0 to 19'), String(bad));
  }
  for (const good of [0, 1, 10, 19]) assert.equal(argsRefusalOf({ ...task, config: { niceness: good } }), undefined, String(good));
});

test('checkoutMcp is a list of server names, none twice and none the task gives itself: anything else is refused, saying what one is', () => {
  for (const bad of ['playwright', [''], ['a', 3], ['a b'], { a: true }, null]) {
    const says = argsRefusalOf({ ...task, config: { checkoutMcp: bad } } as never) ?? '';
    assert.match(
      says,
      /^`checkoutMcp: .*` is not a list of server names\. Give the names .*\[\] for none, or leave it out for the whole file\.$/,
    );
  }
  assert.equal(
    argsRefusalOf({ ...task, config: { checkoutMcp: ['a', 'b', 'a'] } }),
    '`checkoutMcp` names `a` twice. Name each server once.',
  );
  assert.match(
    argsRefusalOf({ ...task, config: { checkoutMcp: ['a'], mcp: { a: { command: 'x' } } } }) ?? '',
    /^`checkoutMcp` names `a`, and `mcp.a` gives a server of that name too: one would hide the other\./,
  );
  assert.equal(argsRefusalOf({ ...task, config: { checkoutMcp: [] } }), undefined, 'none of the file');
  assert.equal(argsRefusalOf({ ...task, config: { checkoutMcp: ['a'], mcp: { b: { command: 'x' } } } }), undefined);
});
