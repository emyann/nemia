/**
 * MCP servers, at shipped defaults: what a session is given and — the point — what it is not.
 *
 * Spawned with no MCP settings, a Claude Code session loads every server the operator has: user scope (`~/.claude.json`) and
 * their claude.ai connectors — mail, calendar, drive — beside the checkout's `.mcp.json`. Every Claude Code session runs on the
 * Agent SDK, so its servers are a value (`Options.mcpServers`, strict, Chrome left off), read here off the options its own process
 * builds (`attachedOptions`); a `HarnessSpec` handed a config file is given one written owner-only under the engine's root, outside
 * the workspace. A checkout's `.mcp.json` that is not JSON is refused before anything runs: waiting out the grace window to call
 * that `lost` would only hide the reason.
 *
 * Codex goes through the engine's own harness with a fake `codex` on PATH writing down the argv it was given, so what is checked
 * is what the engine really runs. The last table is of `everyMcpServer` and `mcpServerOf` alone, the same servers as a value: what
 * an attached session rides on `Options.mcpServers`, whose own spawn is pinned in `attached.boundary.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import type { McpServer, TaskSpec } from '../src/index.ts';
import { Engine } from '../src/index.ts';
import { attachedOptions } from '../src/harness/claude/attached-options.ts';
import { detachedOps, type HarnessIO, type HarnessSpec } from '../src/harness/detached/detached.ts';
import { codex } from '../src/harness/codex/codex.ts';
import { codexMcpServerNames, codexMcpServers, everyMcpServer, mcpRefuses, mcpServerOf } from '../src/harness/mcp.ts';
import type { RemoteMcpServer } from '../src/harness/seam.ts';
import { scratch } from './scratch.ts';
import { story } from './checkpoints.ts';
import { builtEngine } from './engine.ts';
import { until, WAITED, type Waiter } from '../src/waits/index.ts';

const tmp = (label: string) => scratch(`ae-mcp-${label}-`);

/**
 * A fake `claude` and `codex`: each writes its argv, one line per argument, to `<bin>/<name>.argv` — written, then moved, so
 * no reader sees half.
 */
const fakeBin = () => {
  const bin = tmp('bin');
  for (const name of ['claude', 'codex']) {
    const out = path.join(bin, `${name}.argv`);
    fs.writeFileSync(path.join(bin, name), `#!/bin/sh\nprintf '%s\\n' "$@" > '${out}.tmp' && mv '${out}.tmp' '${out}'\n`, {
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

/** MCP configs the runners wrote under the engine's root. */
const configsUnder = (root: string) =>
  (fs.readdirSync(root, { recursive: true }) as string[]).filter((f) => f.endsWith('.mcp.json') || f.split(path.sep)[0] === 'mcp');

const CLAUDES = ['claude'] as const;

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

const TWO = { a: { command: 'a-server', args: ['${HOME}/x'], extra: { kept: true } }, b: { type: 'http', url: 'https://b.example/mcp' } };

const checkoutOf = (servers: object = TWO) => {
  const cwd = tmp('checkout');
  fs.writeFileSync(path.join(cwd, '.mcp.json'), JSON.stringify({ mcpServers: servers }));
  return cwd;
};

/**
 * A factory's recorded server, the one the card is built for: the hosted GitHub server with a toolset header and the Nemia Factory
 * App's client. Its headers are given out of order on purpose, so what `mcpServerOf` answers proves it fixes the order.
 */
const RECORDED: RemoteMcpServer = {
  type: 'http',
  url: 'https://api.githubcopilot.com/mcp/',
  headers: { 'X-MCP-Toolsets': 'actions,repos', 'X-MCP-Readonly': 'false' },
  oauth: { clientId: 'Iv23liQBfm9prqhvXkuY', callbackPort: 8791 },
};

test("a task's MCP servers reach each runner strictly, the checkout's and the task's own and never the operator's", WAITED, async (t) => {
  const s = story(t);

  await s.test("no mcp and no .mcp.json: Claude Code is given no server, strict — none of the operator's servers", () => {
    const job = jobServers(tmp('bare'));
    assert.equal(job.servers, undefined, 'no server is given in their place');
    assert.ok(job.strict, 'strict, so user scope and claude.ai connectors stay unloaded');
    assert.equal(job.chrome, false, "nor the operator's Chrome, which no config names and strict leaves on");
  });

  await s.test(".mcp.json in the checkout: given, so strict keeps the repository's servers — and only those", () => {
    const cwd = tmp('checkout');
    fs.writeFileSync(path.join(cwd, '.mcp.json'), JSON.stringify({ mcpServers: { repo: { command: 'repo-server' } } }));
    const job = jobServers(cwd);
    assert.deepEqual(job.servers, { repo: { command: 'repo-server' } }, "the checkout's servers, as a value");
    assert.ok(job.strict && !job.chrome, 'still strict, still no Chrome');
  });

  await s.test("a task's mcp is laid over the checkout's — still strict, so nothing of the operator's, and nothing in the checkout", () => {
    const cwd = tmp('checkout');
    fs.writeFileSync(path.join(cwd, '.mcp.json'), JSON.stringify({ mcpServers: { repo: { command: 'repo-server' } } }));
    const job = jobServers(cwd, { mcp: MCP });
    assert.deepEqual(job.servers, { repo: { command: 'repo-server' }, ...MCP }, "the checkout's and the task's, as one value");
    assert.ok(job.strict && !job.chrome, "a task's servers do not bring the operator's Chrome back");
    assert.deepEqual(fs.readdirSync(cwd), ['.mcp.json'], 'nothing landed in the checkout');
  });

  await s.test("projectMcp: [] leaves the checkout's .mcp.json out, still strict", () => {
    const job = jobServers(checkoutOf(), { projectMcp: [] });
    assert.equal(job.servers, undefined, "the checkout's servers are not given");
    assert.ok(job.strict && !job.chrome, 'and nothing else loads in their place');
  });

  await s.test("projectMcp: names gives those entries alone, as the file gives them, with the task's own", () => {
    const own = { mine: { command: 'x' } };
    assert.deepEqual(jobServers(checkoutOf(), { projectMcp: ['a'], mcp: own }).servers, { a: TWO.a, ...own }, 'a verbatim, b left out');
  });

  await s.test(
    'a task filed with projectMcp reads it back from its journal, and one filed without names the whole file again',
    async () => {
      const cwd = checkoutOf();
      const root = tmp('root');
      const engine = builtEngine(Engine.layer({ root }));
      const id = await Effect.runPromise(engine.file({ brief: 'b', cwd, harness: 'claude', config: { projectMcp: ['a'] } }));
      const again = builtEngine(Engine.layer({ root }));
      assert.deepEqual((await Effect.runPromise(again.view(id))).state.config?.projectMcp, ['a']);
      assert.deepEqual(jobServers(cwd).servers, TWO, 'filed without, the whole file again');
    },
  );

  await s.test("codex is given a task's servers as one mcp_servers override, and a task without mcp is given none", async () => {
    const given = await spawnAtDefaults(t, { cwd: tmp('bare'), harness: 'codex', config: { mcp: MCP } });
    assert.ok(given.args, 'codex was spawned');
    const at = given.args.findIndex((a) => a.startsWith('mcp_servers='));
    assert.equal(given.args[at - 1], '-c');
    assert.equal(
      given.args[at],
      'mcp_servers={"browser"={"command"="npx","args"=["-y","@playwright/mcp"],"env"={"HEADLESS"="1"}},"docs"={"url"="https://docs.example/mcp","transport"="http","http_headers"={"Authorization"="Bearer t"}}}',
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

  await s.test(
    'codex is handed the picked entries with the task own in one mcp_servers override, and none for projectMcp: []',
    async () => {
      const cwd = checkoutOf({ a: { command: 'a-server' }, b: { type: 'http', url: 'https://b.example/mcp' } });
      const picked = await spawnAtDefaults(t, { cwd, harness: 'codex', config: { projectMcp: ['b'], mcp: { mine: { command: 'x' } } } });
      assert.equal(
        picked.args?.find((a) => a.startsWith('mcp_servers=')),
        'mcp_servers={"b"={"url"="https://b.example/mcp","transport"="http"},"mine"={"command"="x"}}',
      );
      const none = await spawnAtDefaults(t, { cwd, harness: 'codex', config: { projectMcp: [] } });
      assert.ok(none.args, 'codex was spawned');
      assert.equal(
        none.args.some((a) => a.startsWith('mcp_servers')),
        false,
      );
    },
  );
});

/** A spawn of `task` refused before anything ran: no argv, an `unstartable` attempt, and the words it was refused in. */
const unstartable = async (t: Waiter, task: Omit<TaskSpec, 'brief'>, codexHome?: string): Promise<string | undefined> => {
  const { args, attempt } = await spawnAtDefaults(t, task, codexHome);
  assert.equal(args, undefined, 'the CLI never ran');
  assert.equal(attempt?.reason, 'unstartable');
  return attempt?.error;
};

/** A Codex home whose `config.toml` holds `toml`. */
const codexHomeWith = (toml: string) => {
  const home = tmp('codex-home');
  fs.writeFileSync(path.join(home, 'config.toml'), toml);
  return home;
};

const OPERATOR = [
  '[mcp_servers.browser]',
  'url = "https://operator.example/mcp"',
  '',
  '[mcp_servers.docs]',
  'command = "operator-docs"',
  '',
  '[mcp_servers.docs.env]',
  'SECRET = "operator"',
  '',
].join('\n');

const brokenCheckout = () => {
  const cwd = tmp('broken');
  fs.writeFileSync(path.join(cwd, '.mcp.json'), '{"mcpServers": nope');
  return cwd;
};

const PICKABLE = { sse: { type: 'sse', url: 'https://s.example/sse' }, odd: TWO.a, docs: { command: 'd' } };

/** `mcpRefuses` of one server named `github`. */
const refusesOne = (server: unknown) => mcpRefuses({ github: server });
const REMOTE = { type: 'http', url: 'https://e.example/mcp' } as const;

type Refusal = { name: string; refused: (t: Waiter) => Promise<string | undefined> | string | undefined; names: readonly string[] };

const REFUSALS: readonly Refusal[] = [
  ...CLAUDES.map((harness) => ({
    name: `${harness}: a checkout whose .mcp.json is not JSON is refused before anything runs, naming the file`,
    refused: (t: Waiter) => unstartable(t, { cwd: brokenCheckout(), harness }),
    names: ['.mcp.json is not valid JSON', 'remove it from the checkout'],
  })),
  ...[...CLAUDES, 'codex'].flatMap((harness) => [
    {
      name: `${harness}: a projectMcp name the file does not declare`,
      refused: (t: Waiter) => unstartable(t, { cwd: checkoutOf(), harness, config: { projectMcp: ['a', 'nope'] } }),
      names: ['`projectMcp: ["a","nope"]` names `nope`', 'its servers are a, b', 'Declare the server there'],
    },
    {
      name: `${harness}: projectMcp names in a checkout with no file`,
      refused: (t: Waiter) => unstartable(t, { cwd: tmp('bare'), harness, config: { projectMcp: ['a'] } }),
      names: ['names servers of', 'cannot be read', 'Declare them there'],
    },
    {
      name: `${harness}: projectMcp names in a checkout whose file is not JSON`,
      refused: (t: Waiter) => unstartable(t, { cwd: brokenCheckout(), harness, config: { projectMcp: ['a'] } }),
      names: ['.mcp.json is not valid JSON', 'Fix the file.'],
    },
  ]),
  {
    name: "codex: a task's server named like one in the operator's Codex config — Codex would merge the two",
    refused: (t) => unstartable(t, { cwd: tmp('bare'), harness: 'codex', config: { mcp: MCP } }, codexHomeWith(OPERATOR)),
    names: ['`mcp.browser`, `mcp.docs`', 'config.toml already has a server by that name', "Give the task's server another name"],
  },
  {
    name: 'codex: a picked SSE server',
    refused: (t) => unstartable(t, { cwd: checkoutOf(PICKABLE), harness: 'codex', config: { projectMcp: ['sse'] } }),
    names: ['`mcp.sse` is an SSE server', 'picked by `projectMcp`'],
  },
  {
    name: 'codex: a picked shape its table cannot say',
    refused: (t) => unstartable(t, { cwd: checkoutOf(PICKABLE), harness: 'codex', config: { projectMcp: ['odd'] } }),
    names: ['`mcp.odd` has `extra`', 'picked by `projectMcp`'],
  },
  {
    name: "codex: a picked name its operator's config has",
    refused: (t) =>
      unstartable(
        t,
        { cwd: checkoutOf(PICKABLE), harness: 'codex', config: { projectMcp: ['docs'] } },
        codexHomeWith('[mcp_servers.docs]\ncommand = "operator-docs"\n'),
      ),
    names: ['`mcp.docs`', 'config.toml already has a server by that name'],
  },
  {
    name: 'everyMcpServer: a file that is not JSON, as `projectMcpConfig` refuses it, before a session exists',
    refused: () => {
      const broken = brokenCheckout();
      const file = path.join(broken, '.mcp.json');
      try {
        everyMcpServer(broken, undefined);
        return undefined;
      } catch (err) {
        const words = (err as Error).message;
        assert.ok(words.includes(file), `the file in: ${words}`);
        return words;
      }
    },
    names: ['.mcp.json', 'not valid JSON'],
  },
  {
    name: 'mcpRefuses: oauth that names no client',
    refused: () => refusesOne({ ...REMOTE, oauth: { callbackPort: 8791 } }),
    names: ['names no client', 'Set `clientId`'],
  },
  {
    name: 'mcpRefuses: an empty client id names none',
    refused: () => refusesOne({ ...REMOTE, oauth: { clientId: '' } }),
    names: ['names no client'],
  },
  {
    name: 'mcpRefuses: a callbackPort that is no number',
    refused: () => refusesOne({ ...REMOTE, oauth: { clientId: 'c', callbackPort: '8791' } }),
    names: ['callbackPort` is not a port', 'from 1 to 65535'],
  },
  {
    name: 'mcpRefuses: a callbackPort of 0',
    refused: () => refusesOne({ ...REMOTE, oauth: { clientId: 'c', callbackPort: 0 } }),
    names: ['is not a port'],
  },
  {
    name: 'mcpRefuses: a callbackPort past 65535',
    refused: () => refusesOne({ ...REMOTE, oauth: { clientId: 'c', callbackPort: 65536 } }),
    names: ['is not a port'],
  },
  {
    name: 'mcpRefuses: oauth that is no object',
    refused: () => refusesOne({ ...REMOTE, oauth: 'Iv23li' }),
    names: ['is not an OAuth client', 'Give it as'],
  },
  {
    name: 'mcpRefuses: a secret, by name — Claude Code reads one from its own store alone',
    refused: () => refusesOne({ ...REMOTE, oauth: { clientId: 'c', clientSecret: 's' } }),
    names: ['has `clientSecret`', 'no secret'],
  },
  {
    name: 'mcpRefuses: a local server takes no oauth — said in its own words, not as a stray',
    refused: () => refusesOne({ command: 'npx', oauth: { clientId: 'c' } }),
    names: ['has a `command` and `oauth`', 'signs in to nothing'],
  },
];

/** What is not refused beside them: each a spawn that starts, or a server accepted. */
const TAKEN: readonly { name: string; taken: (t: Waiter) => Promise<boolean> | boolean }[] = [
  {
    name: 'projectMcp: [] reads no file: a checkout with none starts',
    taken: () => jobServers(tmp('bare'), { projectMcp: [] }).servers === undefined,
  },
  {
    name: "codex: a name the operator's config does not use is given to codex",
    taken: async (t) =>
      (
        await spawnAtDefaults(
          t,
          { cwd: tmp('bare'), harness: 'codex', config: { mcp: { mine: { command: 'x' } } } },
          codexHomeWith(OPERATOR),
        )
      ).args?.some((a) => a.startsWith('mcp_servers={"mine"')) === true,
  },
  { name: 'mcpRefuses: a recorded server is accepted, its oauth no stray', taken: () => refusesOne(RECORDED) === undefined },
  { name: 'mcpRefuses: a clientId alone is enough', taken: () => refusesOne({ ...REMOTE, oauth: { clientId: 'c' } }) === undefined },
];

test(
  'MCP refusals: a server or a checkout a session cannot be given is refused before anything runs, naming the fix',
  WAITED,
  async (t) => {
    for (const row of REFUSALS)
      await t.test(row.name, async (sub) => {
        const refused = (await row.refused(sub)) ?? '';
        for (const name of row.names) assert.ok(refused.includes(name), `${name} in: ${refused}`);
      });
    for (const row of TAKEN)
      await t.test(row.name, async (sub) => {
        assert.equal(await row.taken(sub), true);
      });
  },
);

test("a spec's config file: the task's servers written owner-only outside the workspace, by an absolute path, and cleared when none", async (t) => {
  let given: HarnessIO | undefined;
  const spy: HarnessSpec = {
    name: 'sh',
    command: (_r, io) => {
      given = io;
      return { cmd: 'sh', args: ['-c', 'exit 0'] };
    },
  };

  await t.test(
    "written with the picked entries and the task's own, owner-only, outside the workspace; cleared on a spawn without",
    async () => {
      const root = tmp('root');
      const cwd = checkoutOf();
      const detached = detachedOps(spy, root);
      const own = { mine: { command: 'x' } };
      await Effect.runPromise(detached.spawn({ name: 'ae/t/2', brief: 'x', cwd, config: { projectMcp: ['a'], mcp: own } }));
      const written = given?.mcpConfigFile;
      assert.ok(written && fs.existsSync(written), 'written the first time');
      assert.deepEqual(JSON.parse(fs.readFileSync(written, 'utf8')), { mcpServers: { a: TWO.a, ...own } }, "a verbatim, and the task's");
      assert.ok(path.relative(cwd, written).startsWith('..'), 'written outside the workspace');
      assert.equal(fs.statSync(written).mode & 0o077, 0, 'readable by its owner only — an env or a header may be a secret');
      assert.deepEqual(configsUnder(root).length, 1, 'one config, under the engine’s root');
      await Effect.runPromise(detached.spawn({ name: 'ae/t/2', brief: 'x', cwd }));
      assert.equal(given?.mcpConfigFile, undefined);
      assert.equal(fs.existsSync(written), false, 'cleared: no servers it was not given');
    },
  );

  await t.test('a relative root still names the config by an absolute path — a harness resolves the flag inside the cwd', async () => {
    const was = process.cwd();
    process.chdir(tmp('parent'));
    try {
      const here = process.cwd();
      fs.mkdirSync('repo');
      await Effect.runPromise(
        detachedOps(spy, 'board').spawn({ name: 'ae/t/1', brief: 'x', cwd: 'repo', config: { mcp: { a: { command: 'x' } } } }),
      );
      const written = given?.mcpConfigFile;
      assert.ok(written && path.isAbsolute(written), `absolute: ${written}`);
      assert.ok(written.startsWith(path.join(here, 'board') + path.sep), `under the root: ${written}`);
      assert.ok(fs.existsSync(path.resolve(here, 'repo', written)), `${written} is found from inside repo`);
    } finally {
      process.chdir(was);
    }
  });
});

test("Codex's MCP config: a task's servers written as one TOML value, and the operator's server names read back", async (t) => {
  await t.test('codex quotes every name and value as TOML, and the override comes before `resume`', () => {
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

  await t.test("codexMcpServers writes a remote server's transport, and writes no oauth table even when the record has one", () => {
    const toml = codexMcpServers({ github: RECORDED });
    assert.equal(
      toml,
      '{"github"={"url"="https://api.githubcopilot.com/mcp/","transport"="http","http_headers"={"X-MCP-Toolsets"="actions,repos","X-MCP-Readonly"="false"}}}',
      'a url with no transport is the half-formed entry mcpRefuses exists to prevent: Codex names the transport itself',
    );
    assert.equal(toml.includes('oauth'), false, 'nothing of Codex is measured, so no oauth table is guessed into its config');
    assert.equal(toml.includes('Iv23li'), false, 'and the client id reaches it nowhere');
    assert.equal(
      codexMcpServers({ sse: { type: 'sse', url: 'https://e.example/sse' } }),
      '{"sse"={"url"="https://e.example/sse","transport"="sse"}}',
      'sse says sse',
    );
  });

  await t.test('the MCP server names a Codex config gives are read the way codex mcp add writes them, and only those', () => {
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
});

test('everyMcpServer and mcpServerOf: the servers a session gets as one value, spelt by one producer', async (t) => {
  const withCheckout = () => {
    const cwd = tmp('every');
    fs.writeFileSync(
      path.join(cwd, '.mcp.json'),
      JSON.stringify({ mcpServers: { repo: { command: 'repo-server' }, both: { type: 'http', url: 'https://theirs' } } }),
    );
    return cwd;
  };
  const EVERY: readonly { name: string; cwd: () => string; config: TaskSpec['config']; servers: object }[] = [
    {
      name: "the checkout whole, as `claude -p` reads its second config, with the task's own winning a name both give",
      cwd: withCheckout,
      config: { mcp: { mine: { command: 'my-server' }, both: { command: 'ours' } } },
      servers: { repo: { command: 'repo-server' }, both: { command: 'ours' }, mine: { command: 'my-server' } },
    },
    {
      name: 'a task that picks entries by name gets those and no more of the file, as `pickedProjectMcp` picks them',
      cwd: withCheckout,
      config: { projectMcp: ['repo'], mcp: { mine: { command: 'my-server' } } },
      servers: { repo: { command: 'repo-server' }, mine: { command: 'my-server' } },
    },
    { name: '`projectMcp: []` leaves the file out altogether', cwd: withCheckout, config: { projectMcp: [] }, servers: {} },
    { name: 'a cwd with no .mcp.json and a task with no config: {}', cwd: () => tmp('every-bare'), config: undefined, servers: {} },
    { name: 'a cwd with no .mcp.json and a task with no server: {}', cwd: () => tmp('every-bare'), config: {}, servers: {} },
  ];
  for (const row of EVERY)
    await t.test(row.name, () => {
      assert.deepEqual(everyMcpServer(row.cwd(), row.config), row.servers);
    });

  const BYTES: readonly { name: string; server: RemoteMcpServer; spelt: string }[] = [
    {
      name: 'a recorded server in one fixed key order, headers sorted — the bytes a sign-in is filed under',
      server: RECORDED,
      spelt:
        '{"type":"http","url":"https://api.githubcopilot.com/mcp/","headers":{"X-MCP-Readonly":"false","X-MCP-Toolsets":"actions,repos"},"oauth":{"clientId":"Iv23liQBfm9prqhvXkuY","callbackPort":8791}}',
    },
    {
      name: 'a server with neither headers nor oauth carries neither key — an empty map would be other bytes',
      server: { type: 'http', url: 'https://api.githubcopilot.com/mcp/' },
      spelt: '{"type":"http","url":"https://api.githubcopilot.com/mcp/"}',
    },
    {
      name: 'a callbackPort left out is left out, not written as undefined',
      server: { ...RECORDED, oauth: { clientId: 'Iv23liQBfm9prqhvXkuY' } },
      spelt:
        '{"type":"http","url":"https://api.githubcopilot.com/mcp/","headers":{"X-MCP-Readonly":"false","X-MCP-Toolsets":"actions,repos"},"oauth":{"clientId":"Iv23liQBfm9prqhvXkuY"}}',
    },
    {
      name: "the record's own header order is no part of the identity: a person who reorders two headers keeps their sign-in",
      server: { ...RECORDED, headers: { 'X-MCP-Readonly': 'false', 'X-MCP-Toolsets': 'actions,repos' } },
      spelt: JSON.stringify(mcpServerOf(RECORDED)),
    },
  ];
  for (const row of BYTES)
    await t.test(`mcpServerOf: ${row.name}`, () => {
      assert.equal(JSON.stringify(mcpServerOf(row.server)), row.spelt);
    });

  await t.test('the state read and the session are handed the same bytes, because mcpServerOf is the one producer', () => {
    const cwd = tmp('one-producer');
    const mcp = { github: mcpServerOf(RECORDED) };
    const session = jobServers(cwd, { mcp }).servers;
    const probe = everyMcpServer(cwd, { mcp });
    assert.equal(
      JSON.stringify(session),
      JSON.stringify(probe),
      'a session handed one spelling and a state read handed another are two servers to Claude Code, and the second finds no sign-in',
    );
    assert.equal(JSON.stringify(probe), JSON.stringify({ github: mcpServerOf(RECORDED) }), 'and both are what the one producer spells');
  });
});
