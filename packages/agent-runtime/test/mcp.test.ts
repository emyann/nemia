/**
 * MCP servers, at shipped defaults: what a session is given and — the point — what it is not.
 *
 * Spawned with no MCP flags, a Claude Code session loads every server the operator has: user scope (`~/.claude.json`) and
 * their claude.ai connectors — mail, calendar, drive — beside the checkout's `.mcp.json`, as the `init` event of `claude -p`
 * lists. Strict is not the whole fence: Claude in Chrome, which a user setting switches on, connects in a `--bg` session
 * spawned strict. A job reads its prompt on its stdin, where no `--mcp-config` list can take it; `claude-detached` takes it as
 * `-p`'s value, and `claude --bg` last, after the list. A checkout's `.mcp.json` that is not JSON is refused before anything
 * runs: named on the command line, it stops Claude Code before a session exists, and waiting out the grace window to call
 * that `lost` would only hide the reason.
 *
 * Every case below goes through the engine's own harnesses with a fake `claude` and `codex` on PATH, each writing down
 * the argv it was given, so what is checked is what the engine really runs. The last two are of `everyMcpServer` alone, the same
 * servers as a value rather than a file: what an attached session rides on `Options.mcpServers`, whose own spawn is pinned in
 * `attached.boundary.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import type { McpServer, TaskSpec } from '../src/index.ts';
import { Engine } from '../src/index.ts';
import { claudeOps } from '../src/harness/claude/bg.ts';
import { attachedOptions } from '../src/harness/claude/attached-options.ts';
import { detachedOps, type HarnessIO, type HarnessSpec } from '../src/harness/detached/detached.ts';
import { codex } from '../src/harness/codex/codex.ts';
import { codexMcpServerNames, everyMcpServer } from '../src/harness/mcp.ts';
import { scratch } from './scratch.ts';
import { builtEngine } from './engine.ts';
import { until, WAITED, type Waiter } from '../src/waits/index.ts';

const tmp = (label: string) => scratch(`ae-mcp-${label}-`);

/**
 * A fake `claude` and `codex`: each writes its argv, one line per argument, to `<bin>/<name>.argv` — written, then moved, so
 * no reader sees half. `claude agents` answers an empty registry: nobody is running.
 */
const fakeBin = () => {
  const bin = tmp('bin');
  for (const name of ['claude', 'codex']) {
    const out = path.join(bin, `${name}.argv`);
    const agents = name === 'claude' ? `if [ "$1" = agents ]; then echo '[]'; exit 0; fi\n` : '';
    fs.writeFileSync(path.join(bin, name), `#!/bin/sh\n${agents}printf '%s\\n' "$@" > '${out}.tmp' && mv '${out}.tmp' '${out}'\n`, {
      mode: 0o755,
    });
  }
  return bin;
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

const argvIn = (file: string) => fs.readFileSync(file, 'utf8').replace(/\n$/, '').split('\n');

/**
 * File one task at shipped defaults, run one tick, and return the argv its harness was given — none
 * when the spawn was refused before anything ran. Codex reads its config from `codexHome`, an empty
 * one unless a test gives one, so no case depends on the servers this machine's own Codex has. A detached harness is run by
 * its worker a moment after the tick returns, so its argv is waited for in `t`'s test, unless the spawn was refused at the tick
 * and wrote none.
 */
const spawnAtDefaults = (t: Waiter, task: Omit<TaskSpec, 'brief'>, codexHome = tmp('codex-home')) => {
  const bin = fakeBin();
  const prevHome = process.env.CODEX_HOME;
  process.env.CODEX_HOME = codexHome;
  return onPath(bin, async () => {
    const root = tmp('root');
    const engine = builtEngine(Engine.layer({ root }));
    const id = await Effect.runPromise(engine.file({ brief: 'the prompt', ...task }));
    await Effect.runPromise(engine.tick());
    const attempt = (await Effect.runPromise(engine.view(id))).state.attempts[0];
    const file = path.join(bin, `${task.harness === 'codex' ? 'codex' : 'claude'}.argv`);
    if (attempt?.reason !== 'unstartable') await until(t, () => fs.existsSync(file), `${file} written by the harness`, { everyMs: 50 });
    return { root, attempt, args: fs.existsSync(file) ? argvIn(file) : undefined };
  }).finally(() => {
    if (prevHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = prevHome;
  });
};

/** The configs `--mcp-config` names — every argument after it up to the next flag — and that flag. */
const mcpConfigsOf = (args: string[]) => {
  const at = args.indexOf('--mcp-config');
  if (at === -1) return { configs: [], next: undefined };
  const rest = args.slice(at + 1);
  const end = rest.findIndex((a) => a.startsWith('-'));
  return { configs: end === -1 ? rest : rest.slice(0, end), next: end === -1 ? undefined : rest[end] };
};

/** MCP configs the runners wrote under the engine's root. */
const configsUnder = (root: string) =>
  (fs.readdirSync(root, { recursive: true }) as string[]).filter((f) => f.endsWith('.mcp.json') || f.split(path.sep)[0] === 'mcp');

const CLAUDES = ['claude', 'claude-detached'] as const;

/**
 * The servers a job is given, and how, read off the options its own process builds from its spawn request (`attachedOptions`):
 * `servers` is `Options.mcpServers`, `strict` whether nothing else loads, and `chrome` whether the operator's Chrome is left on.
 * A job names no `--mcp-config` at all — there is no argv of ours on that road — so what it loads is read here and the files it
 * writes are read under the engine's root.
 */
const jobServers = (cwd: string, config: TaskSpec['config'] = {}) => {
  const given = attachedOptions({ name: 'ae/t/1', brief: 'the prompt', cwd, config });
  return {
    servers: given.mcpServers,
    strict: given.strictMcpConfig === true,
    chrome: !Object.hasOwn(given.extraArgs ?? {}, 'no-chrome'),
  };
};


const MCP = {
  browser: { command: 'npx', args: ['-y', '@playwright/mcp'], env: { HEADLESS: '1' } },
  docs: { type: 'http', url: 'https://docs.example/mcp', headers: { Authorization: 'Bearer t' } },
} satisfies Record<string, McpServer>;

test("no mcp and no .mcp.json: Claude Code is spawned strict, with no config — none of the operator's servers", WAITED, async (t) => {
  const cwd = tmp('bare');
  const { args, root } = await spawnAtDefaults(t, { cwd, harness: 'claude-detached' });
  assert.ok(args, 'claude-detached was spawned');
  assert.ok(args.includes('--strict-mcp-config'), 'strict, so user scope and claude.ai connectors stay unloaded');
  assert.ok(args.includes('--no-chrome'), "nor the operator's Chrome, which no config names and strict leaves on");
  assert.equal(args.includes('--mcp-config'), false, 'and no server is named in their place');
  assert.deepEqual(configsUnder(root), [], 'nothing written for a task that named no servers');
  assert.equal(args[args.indexOf('-p') + 1], 'the prompt', 'the prompt survives');

  const job = jobServers(cwd);
  assert.equal(job.servers, undefined, 'a job: no server is given in their place');
  assert.ok(job.strict, 'a job: strict all the same');
  assert.equal(job.chrome, false, "a job: and not the operator's Chrome");
});

test(".mcp.json in the checkout: named, so strict keeps the repository's servers — and only those", WAITED, async (t) => {
  const cwd = tmp('checkout');
  fs.writeFileSync(path.join(cwd, '.mcp.json'), JSON.stringify({ mcpServers: { repo: { command: 'repo-server' } } }));
  const { args } = await spawnAtDefaults(t, { cwd, harness: 'claude-detached' });
  assert.ok(args, 'claude-detached was spawned');
  const { configs, next } = mcpConfigsOf(args);
  assert.deepEqual(configs, [path.join(cwd, '.mcp.json')], "the checkout's file, and nothing else");
  assert.equal(next, '--strict-mcp-config', 'still strict, and the variadic list is ended by it, not by the prompt');
  assert.ok(args.includes('--no-chrome'), 'and still no Chrome');
  assert.equal((await spawnAtDefaults(t, { cwd, harness: 'claude', config: { background: true } })).args?.at(-1), 'the prompt');

  const job = jobServers(cwd);
  assert.deepEqual(job.servers, { repo: { command: 'repo-server' } }, "a job: the checkout's servers, as a value");
  assert.ok(job.strict && !job.chrome, 'a job: still strict, still no Chrome');
});

test('a checkout whose .mcp.json is not JSON is refused before anything runs: unstartable, naming the file', WAITED, async (t) => {
  const cwd = tmp('broken');
  fs.writeFileSync(path.join(cwd, '.mcp.json'), '{"mcpServers": nope');
  for (const harness of CLAUDES) {
    const { args, attempt } = await spawnAtDefaults(t, { cwd, harness });
    assert.equal(args, undefined, `${harness}: the CLI never ran`);
    assert.equal(attempt?.reason, 'unstartable', harness);
    assert.match(attempt?.error ?? '', /\.mcp\.json is not valid JSON.*Fix the file, or remove it from the checkout/, harness);
  }
});

test(
  "a task's mcp is written outside the workspace and named after the checkout's — still strict, so nothing of the operator's",
  WAITED,
  async (t) => {
    const cwd = tmp('checkout');
    fs.writeFileSync(path.join(cwd, '.mcp.json'), JSON.stringify({ mcpServers: { repo: { command: 'repo-server' } } }));
    const harness = 'claude-detached';
    const { args } = await spawnAtDefaults(t, { cwd, harness, config: { mcp: MCP } });
    assert.ok(args, `${harness} was spawned`);
    const { configs, next } = mcpConfigsOf(args);
    assert.equal(configs.length, 2, `${harness}: ${JSON.stringify(configs)}`);
    assert.equal(configs[0], path.join(cwd, '.mcp.json'), `${harness}: the repository's servers first`);
    assert.deepEqual(
      JSON.parse(fs.readFileSync(configs[1], 'utf8')),
      { mcpServers: MCP },
      `${harness}: the task's servers, exactly, and no other`,
    );
    assert.ok(path.relative(cwd, configs[1]).startsWith('..'), `${harness}: written outside the workspace`);
    assert.equal(fs.statSync(configs[1]).mode & 0o077, 0, `${harness}: readable by its owner only — an env or a header may be a secret`);
    assert.equal(next, '--strict-mcp-config', harness);
    assert.ok(args.includes('--no-chrome'), `${harness}: a task's servers do not bring the operator's Chrome back`);

    const job = jobServers(cwd, { mcp: MCP });
    assert.deepEqual(job.servers, { repo: { command: 'repo-server' }, ...MCP }, "a job: the checkout's and the task's, as one value");
    assert.ok(job.strict && !job.chrome, 'a job: still strict, still no Chrome');
    assert.deepEqual(fs.readdirSync(cwd), ['.mcp.json'], 'nothing landed in the checkout');
  },
);

test('a spawn whose task names no servers clears a config left under its name — no servers it was not given', async () => {
  const root = tmp('root');
  const cwd = tmp('bare');
  const bin = fakeBin();
  await onPath(bin, async () => {
    const ops = claudeOps({ root });
    await Effect.runPromise(ops.spawn({ name: 'ae/t/1', brief: 'the prompt', cwd, config: { mcp: { a: { command: 'x' } } } }));
    const [written] = mcpConfigsOf(argvIn(path.join(bin, 'claude.argv'))).configs;
    assert.ok(written && fs.existsSync(written), 'written the first time');
    await Effect.runPromise(ops.spawn({ name: 'ae/t/1', brief: 'the prompt', cwd }));
    assert.equal(fs.existsSync(written), false, 'claude --bg: cleared');
    assert.equal(argvIn(path.join(bin, 'claude.argv')).includes('--mcp-config'), false);
  });

  let given: HarnessIO | undefined;
  const spy: HarnessSpec = {
    name: 'sh',
    command: (_r, io) => {
      given = io;
      return { cmd: 'sh', args: ['-c', 'exit 0'] };
    },
  };
  const detached = detachedOps(spy, root);
  await Effect.runPromise(detached.spawn({ name: 'ae/t/2', brief: 'x', cwd, config: { mcp: { a: { command: 'x' } } } }));
  const written = given?.mcpConfigFile;
  assert.ok(written && fs.existsSync(written), 'written the first time');
  await Effect.runPromise(detached.spawn({ name: 'ae/t/2', brief: 'x', cwd }));
  assert.equal(given?.mcpConfigFile, undefined);
  assert.equal(fs.existsSync(written), false, 'detached: cleared');
});

test("codex is given a task's servers as one mcp_servers override, and a task without mcp is given none", WAITED, async (t) => {
  const given = await spawnAtDefaults(t, { cwd: tmp('bare'), harness: 'codex', config: { mcp: MCP } });
  assert.ok(given.args, 'codex was spawned');
  const at = given.args.findIndex((a) => a.startsWith('mcp_servers='));
  assert.equal(given.args[at - 1], '-c');
  assert.equal(
    given.args[at],
    'mcp_servers={"browser"={"command"="npx","args"=["-y","@playwright/mcp"],"env"={"HEADLESS"="1"}},"docs"={"url"="https://docs.example/mcp","http_headers"={"Authorization"="Bearer t"}}}',
  );
  assert.equal(given.args.includes('--strict-mcp-config'), false, "Claude Code's flag is not Codex's");

  const plain = await spawnAtDefaults(t, { cwd: tmp('bare'), harness: 'codex' });
  assert.ok(plain.args, 'codex was spawned');
  assert.equal(
    plain.args.some((a) => a.startsWith('mcp_servers')),
    false,
    'no map, no override',
  );
});

test('codex quotes every name and value as TOML, and the override comes before `resume`', () => {
  const args = codex.command({
    name: 'ae/t/2',
    brief: 'the prompt',
    cwd: '/wt',
    resumeFrom: 'abc',
    config: { mcp: { 'a-b_c': { command: '/bin/x', args: ['say "hi"', 'back\\slash', 'two\nlines'], env: { 'K-1': 'v' } } } },
  }).args;
  const at = args.findIndex((a) => a.startsWith('mcp_servers='));
  assert.equal(args[at - 1], '-c');
  assert.equal(
    args[at],
    'mcp_servers={"a-b_c"={"command"="/bin/x","args"=["say \\"hi\\"","back\\\\slash","two\\nlines"],"env"={"K-1"="v"}}}',
    'one value, names quoted: Codex splits a dotted `-c` key on every dot, quotes or none, and `codex mcp get --json` reads this back as exactly these arguments',
  );
  assert.ok(at < args.indexOf('resume'), 'before resume, which rejects flags after its id');
  assert.equal(args.at(-1), 'the prompt');
});

test('a relative cwd or root still names each config by an absolute path — Claude resolves the flag inside the cwd', async () => {
  const was = process.cwd();
  const bin = fakeBin();
  process.chdir(tmp('parent'));
  try {
    const here = process.cwd();
    fs.mkdirSync('repo');
    fs.writeFileSync(path.join('repo', '.mcp.json'), '{"mcpServers":{}}');
    await onPath(bin, () =>
      Effect.runPromise(
        claudeOps({ root: 'board' }).spawn({ name: 'ae/t/1', brief: 'the prompt', cwd: 'repo', config: { mcp: { a: { command: 'x' } } } }),
      ),
    );
    const { configs } = mcpConfigsOf(argvIn(path.join(bin, 'claude.argv')));
    assert.deepEqual(configs, [path.join(here, 'repo', '.mcp.json'), path.join(here, 'board', 'mcp', 'ae_t_1.json')]);
    for (const c of configs) assert.ok(fs.existsSync(path.resolve(here, 'repo', c)), `${c} is found from inside repo`);
  } finally {
    process.chdir(was);
  }
});

test("a task's server named like one in the operator's Codex config is refused at spawn — Codex would merge the two", WAITED, async (t) => {
  const home = tmp('codex-home');
  fs.writeFileSync(
    path.join(home, 'config.toml'),
    [
      '[mcp_servers.browser]',
      'url = "https://operator.example/mcp"',
      '',
      '[mcp_servers.docs]',
      'command = "operator-docs"',
      '',
      '[mcp_servers.docs.env]',
      'SECRET = "operator"',
      '',
    ].join('\n'),
  );

  const clash = await spawnAtDefaults(t, { cwd: tmp('bare'), harness: 'codex', config: { mcp: MCP } }, home);
  assert.equal(clash.args, undefined, 'codex never ran');
  assert.equal(
    clash.attempt?.reason,
    'unstartable',
    "Codex merges a task's server into the operator's of its name: the task's `docs` would run with the operator's SECRET, and its `browser` would not load beside the operator's url",
  );
  assert.match(
    clash.attempt?.error ?? '',
    /`mcp.browser`, `mcp.docs`: .*config\.toml already has a server by that name.*Give the task's server another name/,
  );

  const apart = await spawnAtDefaults(t, { cwd: tmp('bare'), harness: 'codex', config: { mcp: { mine: { command: 'x' } } } }, home);
  assert.ok(
    apart.args?.some((a) => a.startsWith('mcp_servers={"mine"')),
    'a name the operator does not use is given to codex',
  );
});

test('the MCP server names a Codex config gives are read the way codex mcp add writes them, and only those', () => {
  const toml = [
    '[mcp_servers.probe]',
    'command = "echo"',
    '',
    '[mcp_servers.probe.env]',
    'K = "v"',
    '',
    '[mcp_servers."quoted-name"]',
    'url = "https://e.example/mcp"',
    '',
    '[projects."/r"]',
    'trust_level = "trusted"',
    '[mcp_servers_extra.nope]',
    'x = 1',
  ].join('\n');
  assert.deepEqual([...codexMcpServerNames(toml)].sort(), ['probe', 'quoted-name']);
});

const TWO = { a: { command: 'a-server', args: ['${HOME}/x'], extra: { kept: true } }, b: { type: 'http', url: 'https://b.example/mcp' } };

const checkoutOf = (servers: object = TWO) => {
  const cwd = tmp('checkout');
  fs.writeFileSync(path.join(cwd, '.mcp.json'), JSON.stringify({ mcpServers: servers }));
  return cwd;
};

test(
  "checkoutMcp: [] leaves the checkout's .mcp.json out: no config named, still strict, as a job, detached and --bg",
  WAITED,
  async (t) => {
    const cwd = checkoutOf();
    for (const task of [{ harness: 'claude-detached' }, { harness: 'claude', config: { background: true } }]) {
      const label = JSON.stringify(task);
      const { args, root } = await spawnAtDefaults(t, { cwd, ...task, config: { ...task.config, checkoutMcp: [] } });
      assert.ok(args, `${label} was spawned`);
      assert.equal(args.includes('--mcp-config'), false, `${label}: the checkout's servers are not named`);
      assert.ok(args.includes('--strict-mcp-config') && args.includes('--no-chrome'), `${label}: and nothing else loads in their place`);
      assert.deepEqual(configsUnder(root), [], `${label}: nothing written`);
    }
    const job = jobServers(cwd, { checkoutMcp: [] });
    assert.equal(job.servers, undefined, "a job: the checkout's servers are not given");
    assert.ok(job.strict && !job.chrome, 'a job: and nothing else loads in their place');
  },
);

test("checkoutMcp: names loads those entries alone, as the file gives them, from the task's own 0600 config", WAITED, async (t) => {
  const cwd = checkoutOf();
  const own = { mine: { command: 'x' } };
  for (const task of [{ harness: 'claude-detached' }, { harness: 'claude', config: { background: true } }]) {
    const label = JSON.stringify(task);
    const { args } = await spawnAtDefaults(t, { cwd, ...task, config: { ...task.config, checkoutMcp: ['a'], mcp: own } });
    assert.ok(args, `${label} was spawned`);
    const { configs, next } = mcpConfigsOf(args);
    assert.equal(configs.length, 1, `${label}: ${JSON.stringify(configs)}`);
    assert.notEqual(configs[0], path.join(cwd, '.mcp.json'), `${label}: not the checkout's file, which names b too`);
    assert.deepEqual(
      JSON.parse(fs.readFileSync(configs[0], 'utf8')),
      { mcpServers: { a: TWO.a, ...own } },
      `${label}: a verbatim, and the task's`,
    );
    assert.equal(fs.statSync(configs[0]).mode & 0o077, 0, `${label}: owner-only`);
    assert.equal(next, '--strict-mcp-config', label);
  }
  assert.deepEqual(
    jobServers(cwd, { checkoutMcp: ['a'], mcp: own }).servers,
    { a: TWO.a, ...own },
    "a job: a verbatim, and the task's, given as a value and written to no file",
  );
});

test(
  'a checkoutMcp name the file does not declare, a checkout with no file, and a file that is not JSON each refuse the spawn, naming the fix',
  WAITED,
  async (t) => {
    for (const harness of [...CLAUDES, 'codex']) {
      const absent = await spawnAtDefaults(t, { cwd: checkoutOf(), harness, config: { checkoutMcp: ['a', 'nope'] } });
      assert.equal(absent.args, undefined, `${harness}: the CLI never ran`);
      assert.equal(absent.attempt?.reason, 'unstartable', harness);
      assert.match(
        absent.attempt?.error ?? '',
        /`checkoutMcp: \["a","nope"\]` names `nope`, which \S+\.mcp\.json does not declare: its servers are a, b\. Declare the server there, or take the name off the task\./,
        harness,
      );
      const bare = await spawnAtDefaults(t, { cwd: tmp('bare'), harness, config: { checkoutMcp: ['a'] } });
      assert.equal(bare.attempt?.reason, 'unstartable', harness);
      assert.match(
        bare.attempt?.error ?? '',
        /names servers of \S+\.mcp\.json, which cannot be read .*Declare them there, or take the names off the task\./,
        harness,
      );
      const broken = tmp('broken');
      fs.writeFileSync(path.join(broken, '.mcp.json'), '{"mcpServers": nope');
      const unparsed = await spawnAtDefaults(t, { cwd: broken, harness, config: { checkoutMcp: ['a'] } });
      assert.equal(unparsed.attempt?.reason, 'unstartable', harness);
      assert.match(unparsed.attempt?.error ?? '', /\.mcp\.json is not valid JSON .*Fix the file\./, harness);
    }
    const none = await spawnAtDefaults(t, { cwd: tmp('bare'), harness: 'claude-detached', config: { checkoutMcp: [] } });
    assert.ok(none.args, 'no name reads no file: a checkout with none starts');
  },
);

test(
  'codex is handed the picked entries with the task own in one mcp_servers override, and none for checkoutMcp: []',
  WAITED,
  async (t) => {
    const cwd = checkoutOf({ a: { command: 'a-server' }, b: { type: 'http', url: 'https://b.example/mcp' } });
    const picked = await spawnAtDefaults(t, { cwd, harness: 'codex', config: { checkoutMcp: ['b'], mcp: { mine: { command: 'x' } } } });
    assert.equal(
      picked.args?.find((a) => a.startsWith('mcp_servers=')),
      'mcp_servers={"b"={"url"="https://b.example/mcp"},"mine"={"command"="x"}}',
    );
    const none = await spawnAtDefaults(t, { cwd, harness: 'codex', config: { checkoutMcp: [] } });
    assert.ok(none.args, 'codex was spawned');
    assert.equal(
      none.args.some((a) => a.startsWith('mcp_servers')),
      false,
    );
  },
);

test(
  "codex refuses a picked entry it cannot be handed: an SSE server, a shape its table cannot say, a name its operator's config has",
  WAITED,
  async (t) => {
    const cwd = checkoutOf({ sse: { type: 'sse', url: 'https://s.example/sse' }, odd: TWO.a, docs: { command: 'd' } });
    const sse = await spawnAtDefaults(t, { cwd, harness: 'codex', config: { checkoutMcp: ['sse'] } });
    assert.equal(sse.args, undefined);
    assert.match(sse.attempt?.error ?? '', /`mcp.sse` is an SSE server, .*It is an entry of \S+\.mcp\.json, picked by `checkoutMcp`\./);
    const odd = await spawnAtDefaults(t, { cwd, harness: 'codex', config: { checkoutMcp: ['odd'] } });
    assert.equal(odd.args, undefined);
    assert.match(
      odd.attempt?.error ?? '',
      /`mcp.odd` has `extra`, which a server with a `command` does not take\..*picked by `checkoutMcp`\./,
    );
    const home = tmp('codex-home');
    fs.writeFileSync(path.join(home, 'config.toml'), '[mcp_servers.docs]\ncommand = "operator-docs"\n');
    const clash = await spawnAtDefaults(t, { cwd, harness: 'codex', config: { checkoutMcp: ['docs'] } }, home);
    assert.equal(clash.args, undefined);
    assert.match(clash.attempt?.error ?? '', /`mcp.docs`: .*config\.toml already has a server by that name/);
  },
);

test(
  'a task filed with checkoutMcp reads it back from its journal, and one filed without names the whole file again',
  WAITED,
  async (t) => {
    const cwd = checkoutOf();
    const root = tmp('root');
    const engine = builtEngine(Engine.layer({ root }));
    const id = await Effect.runPromise(engine.file({ brief: 'b', cwd, harness: 'claude', config: { checkoutMcp: ['a'] } }));
    const again = builtEngine(Engine.layer({ root }));
    assert.deepEqual((await Effect.runPromise(again.view(id))).state.config?.checkoutMcp, ['a']);
    const { args } = await spawnAtDefaults(t, { cwd, harness: 'claude-detached' });
    assert.deepEqual(mcpConfigsOf(args!).configs, [path.join(cwd, '.mcp.json')]);
  },
);

test('everyMcpServer answers the servers a session gets as one value: the checkout whole, the task laid over it', () => {
  const cwd = tmp('every');
  fs.writeFileSync(
    path.join(cwd, '.mcp.json'),
    JSON.stringify({ mcpServers: { repo: { command: 'repo-server' }, both: { type: 'http', url: 'https://theirs' } } }),
  );
  assert.deepEqual(
    everyMcpServer(cwd, { mcp: { mine: { command: 'my-server' }, both: { command: 'ours' } } }),
    { repo: { command: 'repo-server' }, both: { command: 'ours' }, mine: { command: 'my-server' } },
    "the whole file, as `claude -p` reads its second config, with the task's own winning a name both give",
  );
  assert.deepEqual(
    everyMcpServer(cwd, { checkoutMcp: ['repo'], mcp: { mine: { command: 'my-server' } } }),
    { repo: { command: 'repo-server' }, mine: { command: 'my-server' } },
    'a task that picks entries by name gets those and no more of the file, as `pickedCheckoutMcp` picks them',
  );
  assert.deepEqual(everyMcpServer(cwd, { checkoutMcp: [] }), {}, 'and `checkoutMcp: []` leaves the file out altogether');
});

test('everyMcpServer answers {} for a cwd with no .mcp.json and a task with no server, and refuses a file that is not JSON', () => {
  const bare = tmp('every-bare');
  assert.deepEqual(everyMcpServer(bare, undefined), {}, 'no config of ours is named when there is nothing to name');
  assert.deepEqual(everyMcpServer(bare, {}), {});
  const broken = tmp('every-broken');
  const file = path.join(broken, '.mcp.json');
  fs.writeFileSync(file, '{ not json');
  assert.throws(
    () => everyMcpServer(broken, undefined),
    (err: Error) => err.message.includes(file) && err.message.includes('not valid JSON'),
    'refused here as `checkoutMcpConfig` refuses it, before a session exists',
  );
});
