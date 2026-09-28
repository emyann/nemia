/**
 * MCP servers, at shipped defaults: what a session is given and — the point — what it is not.
 *
 * Spawned with no MCP flags, a Claude Code session loads every server the operator has: user scope
 * (`~/.claude.json`) and their claude.ai connectors — mail, calendar, drive — beside the checkout's
 * `.mcp.json` (the `init` event of `claude -p` on 2.1.270). Strict is not the whole fence: Claude in
 * Chrome, which a user setting switches on, was still connecting in a `--bg` session spawned strict.
 * Every case below goes through
 * `createEngine()`'s own harnesses with a fake `claude` and `codex` on PATH, each writing down the
 * argv it was given, so what is checked is what the engine really runs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import { createEngine, type McpServer, type TaskSpec } from '../src/facade.ts';
import { claudeOps } from '../src/runner.ts';
import { detachedOps, type HarnessIO, type HarnessSpec } from '../src/runner-detached.ts';
import { codex } from '../src/runner-codex.ts';
import { codexMcpServerNames } from '../src/runner-mcp.ts';
import { scratch } from './scratch.ts';

const tmp = (label: string) => scratch(`ae-mcp-${label}-`);

/** A fake `claude` and `codex`: each writes its argv, one line per argument, to `<bin>/<name>.argv`. */
const fakeBin = () => {
  const bin = tmp('bin');
  for (const name of ['claude', 'codex']) {
    const out = path.join(bin, `${name}.argv`);
    // `claude agents` is the registry, and nobody is running. Written, then moved, so no reader sees half.
    const agents = name === 'claude' ? `if [ "$1" = agents ]; then echo '[]'; exit 0; fi\n` : '';
    fs.writeFileSync(path.join(bin, name), `#!/bin/sh\n${agents}printf '%s\\n' "$@" > '${out}.tmp' && mv '${out}.tmp' '${out}'\n`, { mode: 0o755 });
  }
  return bin;
};

const onPath = async <T>(bin: string, f: () => Promise<T>): Promise<T> => {
  const prev = process.env.PATH;
  process.env.PATH = `${bin}:${prev}`;
  try { return await f(); } finally { process.env.PATH = prev; }
};

const argvIn = (file: string) => fs.readFileSync(file, 'utf8').replace(/\n$/, '').split('\n');

/**
 * File one task at shipped defaults, run one tick, and return the argv its harness was given — none
 * when the spawn was refused before anything ran. Codex reads its config from `codexHome`, an empty
 * one unless a test gives one, so no case depends on the servers this machine's own Codex has.
 */
const spawnAtDefaults = (task: Omit<TaskSpec, 'brief'>, codexHome = tmp('codex-home')) => {
  const bin = fakeBin();
  const prevHome = process.env.CODEX_HOME;
  process.env.CODEX_HOME = codexHome;
  return onPath(bin, async () => {
    const root = tmp('root');
    const engine = createEngine({ root });
    const id = await engine.file({ brief: 'the prompt', ...task });
    await engine.tick();
    const attempt = (await engine.view(id)).state.attempts[0];
    const file = path.join(bin, `${task.harness === 'codex' ? 'codex' : 'claude'}.argv`);
    // A detached harness is run by its worker, a moment after the tick returns.
    const until = Date.now() + 15_000;
    // A spawn refused at the tick writes no argv, so there is nothing to wait for.
    if (attempt?.reason !== 'unstartable') while (!fs.existsSync(file) && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
    return { root, attempt, args: fs.existsSync(file) ? argvIn(file) : undefined };
  }).finally(() => {
    if (prevHome === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = prevHome;
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

const MCP = {
  browser: { command: 'npx', args: ['-y', '@playwright/mcp'], env: { HEADLESS: '1' } },
  docs: { type: 'http', url: 'https://docs.example/mcp', headers: { Authorization: 'Bearer t' } },
} satisfies Record<string, McpServer>;

test("no mcp and no .mcp.json: Claude Code is spawned strict, with no config — none of the operator's servers", async () => {
  for (const harness of CLAUDES) {
    const { args, root } = await spawnAtDefaults({ cwd: tmp('bare'), harness });
    assert.ok(args, `${harness} was spawned`);
    assert.ok(args.includes('--strict-mcp-config'), `${harness}: strict, so user scope and claude.ai connectors stay unloaded`);
    assert.ok(args.includes('--no-chrome'), `${harness}: nor the operator's Chrome, which no config names and strict leaves on`);
    assert.equal(args.includes('--mcp-config'), false, `${harness}: and no server is named in their place`);
    assert.deepEqual(configsUnder(root), [], `${harness}: nothing written for a task that named no servers`);
    // A job reads its prompt on its stdin, where no list can take it; `claude-detached` takes it as `-p`'s value.
    if (harness === 'claude-detached') assert.equal(args[args.indexOf('-p') + 1], 'the prompt', `${harness}: the prompt survives`);
    else assert.equal(args.includes('the prompt'), false, `${harness}: the prompt is not an argument`);
  }
});

test(".mcp.json in the checkout: named, so strict keeps the repository's servers — and only those", async () => {
  const cwd = tmp('checkout');
  fs.writeFileSync(path.join(cwd, '.mcp.json'), JSON.stringify({ mcpServers: { repo: { command: 'repo-server' } } }));
  for (const harness of CLAUDES) {
    const { args } = await spawnAtDefaults({ cwd, harness });
    assert.ok(args, `${harness} was spawned`);
    const { configs, next } = mcpConfigsOf(args);
    assert.deepEqual(configs, [path.join(cwd, '.mcp.json')], `${harness}: the checkout's file, and nothing else`);
    assert.equal(next, '--strict-mcp-config', `${harness}: still strict, and the variadic list is ended by it, not by the prompt`);
    assert.ok(args.includes('--no-chrome'), `${harness}: and still no Chrome`);
  }
  // `claude --bg` takes its prompt last, after the list; a job on its stdin, where no list reaches it.
  assert.equal((await spawnAtDefaults({ cwd, harness: 'claude', config: { background: true } })).args?.at(-1), 'the prompt');
  const job = (await spawnAtDefaults({ cwd, harness: 'claude' })).args!;
  assert.equal(job.includes('the prompt'), false);
});

test('a checkout whose .mcp.json is not JSON is refused before anything runs: unstartable, naming the file', async () => {
  // Named on the command line, it stops Claude Code before a session exists; waiting out the grace
  // window to call that `lost` would only hide the reason.
  const cwd = tmp('broken');
  fs.writeFileSync(path.join(cwd, '.mcp.json'), '{"mcpServers": nope');
  for (const harness of CLAUDES) {
    const { args, attempt } = await spawnAtDefaults({ cwd, harness });
    assert.equal(args, undefined, `${harness}: the CLI never ran`);
    assert.equal(attempt?.reason, 'unstartable', harness);
    assert.match(attempt?.error ?? '', /\.mcp\.json is not valid JSON.*Fix the file, or remove it from the checkout/, harness);
  }
});

test("a task's mcp is written outside the workspace and named after the checkout's — still strict, so nothing of the operator's", async () => {
  const cwd = tmp('checkout');
  fs.writeFileSync(path.join(cwd, '.mcp.json'), JSON.stringify({ mcpServers: { repo: { command: 'repo-server' } } }));
  for (const harness of CLAUDES) {
    const { args } = await spawnAtDefaults({ cwd, harness, config: { mcp: MCP } });
    assert.ok(args, `${harness} was spawned`);
    const { configs, next } = mcpConfigsOf(args);
    assert.equal(configs.length, 2, `${harness}: ${JSON.stringify(configs)}`);
    assert.equal(configs[0], path.join(cwd, '.mcp.json'), `${harness}: the repository's servers first`);
    assert.deepEqual(JSON.parse(fs.readFileSync(configs[1]!, 'utf8')), { mcpServers: MCP }, `${harness}: the task's servers, exactly, and no other`);
    assert.ok(path.relative(cwd, configs[1]!).startsWith('..'), `${harness}: written outside the workspace`);
    assert.equal(fs.statSync(configs[1]!).mode & 0o077, 0, `${harness}: readable by its owner only — an env or a header may be a secret`);
    assert.equal(next, '--strict-mcp-config', harness);
    assert.ok(args.includes('--no-chrome'), `${harness}: a task's servers do not bring the operator's Chrome back`);
  }
  assert.deepEqual(fs.readdirSync(cwd), ['.mcp.json'], 'nothing landed in the checkout');
});

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
  const spy: HarnessSpec = { name: 'sh', command: (_r, io) => { given = io; return { cmd: 'sh', args: ['-c', 'exit 0'] }; } };
  const detached = detachedOps(spy, root);
  await Effect.runPromise(detached.spawn({ name: 'ae/t/2', brief: 'x', cwd, config: { mcp: { a: { command: 'x' } } } }));
  const written = given?.mcpConfigFile;
  assert.ok(written && fs.existsSync(written), 'written the first time');
  await Effect.runPromise(detached.spawn({ name: 'ae/t/2', brief: 'x', cwd }));
  assert.equal(given?.mcpConfigFile, undefined);
  assert.equal(fs.existsSync(written), false, 'detached: cleared');
});

test("codex is given a task's servers as one mcp_servers override, and a task without mcp is given none", async () => {
  const given = await spawnAtDefaults({ cwd: tmp('bare'), harness: 'codex', config: { mcp: MCP } });
  assert.ok(given.args, 'codex was spawned');
  const at = given.args.findIndex((a) => a.startsWith('mcp_servers='));
  assert.equal(given.args[at - 1], '-c');
  assert.equal(
    given.args[at],
    'mcp_servers={"browser"={"command"="npx","args"=["-y","@playwright/mcp"],"env"={"HEADLESS"="1"}},"docs"={"url"="https://docs.example/mcp","http_headers"={"Authorization"="Bearer t"}}}',
  );
  assert.equal(given.args.includes('--strict-mcp-config'), false, "Claude Code's flag is not Codex's");

  const plain = await spawnAtDefaults({ cwd: tmp('bare'), harness: 'codex' });
  assert.ok(plain.args, 'codex was spawned');
  assert.equal(plain.args.some((a) => a.startsWith('mcp_servers')), false, 'no map, no override');
});

test('codex quotes every name and value as TOML, and the override comes before `resume`', () => {
  // One value, names quoted: a dotted `-c` key is split on every dot, quotes or none. Read back by
  // codex-cli 0.154.0 (`codex mcp get --json`) as exactly these arguments.
  const args = codex.command({
    name: 'ae/t/2', brief: 'the prompt', cwd: '/wt', resumeFrom: 'abc',
    config: { mcp: { 'a-b_c': { command: '/bin/x', args: ['say "hi"', 'back\\slash', 'two\nlines'], env: { 'K-1': 'v' } } } },
  }).args;
  const at = args.findIndex((a) => a.startsWith('mcp_servers='));
  assert.equal(args[at - 1], '-c');
  assert.equal(args[at], 'mcp_servers={"a-b_c"={"command"="/bin/x","args"=["say \\"hi\\"","back\\\\slash","two\\nlines"],"env"={"K-1"="v"}}}');
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
    await onPath(bin, () => Effect.runPromise(
      claudeOps({ root: 'board' }).spawn({ name: 'ae/t/1', brief: 'the prompt', cwd: 'repo', config: { mcp: { a: { command: 'x' } } } }),
    ));
    const { configs } = mcpConfigsOf(argvIn(path.join(bin, 'claude.argv')));
    assert.deepEqual(configs, [path.join(here, 'repo', '.mcp.json'), path.join(here, 'board', 'mcp', 'ae_t_1.json')]);
    // What Claude Code does with each: resolve it from inside the session's cwd.
    for (const c of configs) assert.ok(fs.existsSync(path.resolve(here, 'repo', c)), `${c} is found from inside repo`);
  } finally { process.chdir(was); }
});

test("a task's server named like one in the operator's Codex config is refused at spawn — Codex would merge the two", async () => {
  // As `codex mcp add` writes them. Measured on 0.154.0: a task's `docs` would run the task's command
  // with the operator's SECRET, and a task's `browser` would not load beside the operator's url.
  const home = tmp('codex-home');
  fs.writeFileSync(path.join(home, 'config.toml'), [
    '[mcp_servers.browser]', 'url = "https://operator.example/mcp"', '',
    '[mcp_servers.docs]', 'command = "operator-docs"', '', '[mcp_servers.docs.env]', 'SECRET = "operator"', '',
  ].join('\n'));

  const clash = await spawnAtDefaults({ cwd: tmp('bare'), harness: 'codex', config: { mcp: MCP } }, home);
  assert.equal(clash.args, undefined, 'codex never ran');
  assert.equal(clash.attempt?.reason, 'unstartable');
  assert.match(clash.attempt?.error ?? '', /`mcp.browser`, `mcp.docs`: .*config\.toml already has a server by that name.*Give the task's server another name/);

  const apart = await spawnAtDefaults({ cwd: tmp('bare'), harness: 'codex', config: { mcp: { mine: { command: 'x' } } } }, home);
  assert.ok(apart.args?.some((a) => a.startsWith('mcp_servers={"mine"')), 'a name the operator does not use is given to codex');
});

test('the MCP server names a Codex config gives are read the way codex mcp add writes them, and only those', () => {
  const toml = [
    '[mcp_servers.probe]', 'command = "echo"', '', '[mcp_servers.probe.env]', 'K = "v"', '',
    '[mcp_servers."quoted-name"]', 'url = "https://e.example/mcp"', '',
    '[projects."/r"]', 'trust_level = "trusted"', '[mcp_servers_extra.nope]', 'x = 1',
  ].join('\n');
  assert.deepEqual([...codexMcpServerNames(toml)].sort(), ['probe', 'quoted-name']);
});
