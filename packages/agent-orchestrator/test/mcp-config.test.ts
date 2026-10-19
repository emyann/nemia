/**
 * The repository's browser, held to its shape: the root `.mcp.json` names Playwright's MCP server and
 * nothing else, and the engine names that file on every Claude spawn beside `--strict-mcp-config`, so
 * every step in a worktree of this repository has the `browser_*` tools and none of the operator's servers.
 *
 * The shape is the point, so each way out of it is made to refuse: `npx` (a download at every spawn), a
 * script named by an absolute path (one checkout, not the worktree's `node_modules` link), a headed or
 * non-Chromium browser, a profile kept on disk and shared between steps, and output files written into the
 * workspace — `.playwright-mcp/` by default, where the run would commit them.
 *
 * The server is spawned as Claude Code spawns the entry, in the session's cwd, speaking JSON-RPC on stdio; listing its tools launches no
 * browser, so that test costs nothing and needs no install.
 *
 * A step's session loads only the servers its agent's `mcp:` line and its own name: started on a fake `claude` that records its argv, a
 * session of a step and an agent that name none is named no MCP config in a checkout that has one, a step that names one over an agent
 * that names none is named that one alone and no rule that allows a tool of it, and every shipped step given the `look` skill names
 * `playwright`, itself or by its agent.
 *
 * The last test runs against the real harness — skipped unless `AE_LIVE=1`, because it spends money. It files a task at shipped defaults:
 * the engine's built-in harnesses, `claude` first, asked for a background session, with no `mcp` on the task, so the only servers it can
 * have are the ones the checkout's `.mcp.json` names. A settled session stays in the harness's registry, so the test stops and removes
 * its own after, as far as `claude` lets it.
 *
 *   AE_LIVE=1 node --test test/mcp-config.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { TaskView } from 'agent-runtime';
import { Effect } from 'effect';
import { Engine as EngineService } from 'agent-runtime';
import { type Engine } from '../src/runtime-client.ts';
import { parseAgent, parseWorkflow } from '../src/workflow.ts';
import { filedConfig, STEP_FILES } from '../src/filed/filed.ts';
import { loadWorkflows } from '../src/folder/folder.store.ts';
import { scratch } from './scratch.ts';
import { placesOf, shippedFolders } from './team.ts';
import { plainEngine } from './promised.ts';
import { until, WAITED } from 'agent-runtime/testing';

const REPO = path.resolve(import.meta.dirname, '..', '..', '..');
const read = (file: string) => JSON.parse(fs.readFileSync(path.join(REPO, file), 'utf8'));
const shipped = () => read('.mcp.json') as { mcpServers: Record<string, { command: string; args: string[] }> };

/** Why `config` is not this repository's browser, one sentence each — none when it is. */
const refusals = (config: unknown, repo: string): string[] => {
  const servers = (config as { mcpServers?: unknown } | null)?.mcpServers;
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) return ['names no map of servers under `mcpServers`'];
  const names = Object.keys(servers);
  if (names.length !== 1 || names[0] !== 'playwright') return [`names ${JSON.stringify(names)}, not exactly one server, \`playwright\``];
  const { command, args } = (servers as Record<string, { command?: unknown; args?: unknown }>).playwright;
  const out: string[] = [];
  if (command !== 'node') out.push(`runs ${JSON.stringify(command)}, not node: npx downloads at every spawn`);
  if (!Array.isArray(args) || !args.every((a) => typeof a === 'string')) return [...out, 'gives no list of string arguments'];
  const [script, ...flags] = args;
  if (!script || path.isAbsolute(script))
    out.push(`names its script ${JSON.stringify(script)}, not by a path relative to the repository: an absolute one is one checkout`);
  else if (!fs.statSync(path.join(repo, script), { throwIfNoEntry: false })?.isFile())
    out.push(`names its script ${script}, which is not on disk under ${repo}`);
  const value = (flag: string) => (flags.includes(flag) ? flags[flags.indexOf(flag) + 1] : undefined);
  if (!flags.includes('--headless')) out.push('is not --headless: a step has no display');
  if (value('--browser') !== 'chromium') out.push(`asks for --browser ${value('--browser')}, not chromium from ~/.cache/ms-playwright`);
  if (!flags.includes('--isolated')) out.push('is not --isolated: the profile is kept on disk and shared by every step');
  if (flags.includes('--user-data-dir')) out.push('names a --user-data-dir: a profile shared by every step');
  return [...out, ...outputDirRefusals(value('--output-dir'), repo)];
};

/**
 * Why an `--output-dir` is not a step's files directory with an absolute default outside the repository, `${WF_STEP_FILES:-/abs}`,
 * one sentence each — none when it is. Claude Code expands the variable as it spawns the server; a nested one it does not.
 */
const outputDirRefusals = (dir: string | undefined, repo: string): string[] => {
  if (dir === undefined) return ['writes its files to .playwright-mcp, relative to the workspace, where the run commits them'];
  const read = /^\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-(.*))?\}$/.exec(dir);
  if (!read)
    return [
      `writes its files to ${dir} for every step alike: give \`\${${STEP_FILES}:-<an absolute folder>}\`, so a step writes where its run keeps them`,
    ];
  const [, name, fallback] = read;
  if (name !== STEP_FILES) return [`writes its files to the folder \`${name}\` names, not a step's own: read \`${STEP_FILES}\``];
  if (fallback === undefined) return [`gives \`${STEP_FILES}\` no default, and a session outside a run is given none`];
  if (fallback.includes('${')) return [`nests a variable in its default, ${fallback}, which Claude Code does not expand`];
  if (!path.isAbsolute(fallback))
    return [`writes its files to ${fallback} outside a run, relative to the workspace, where the run commits them`];
  if (!path.relative(repo, fallback).startsWith('..')) return [`writes its files to ${fallback} outside a run, inside the repository`];
  return [];
};

/** `args` as Claude Code spawns the server in an environment `env`: each `${NAME:-default}` read from it, else its default. */
const expanded = (args: string[], env: Record<string, string | undefined>): string[] =>
  args.map((a) => a.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*):-([^}]*)\}/g, (_, name: string, fallback: string) => env[name] || fallback));

/** Where `command` is found on PATH, as the harness finds it. */
const onPath = (command: string) =>
  (process.env.PATH ?? '')
    .split(path.delimiter)
    .map((dir) => path.join(dir, command))
    .find((f) => fs.statSync(f, { throwIfNoEntry: false })?.isFile());

test('the root .mcp.json parses and names exactly one server, playwright, run from disk as headless, isolated chromium', () => {
  const config = shipped();
  assert.deepEqual(Object.keys(config.mcpServers), ['playwright']);
  const { command, args } = config.mcpServers.playwright;
  assert.ok(onPath(command), `${command} is on PATH`);
  assert.ok(fs.statSync(path.join(REPO, args[0])).isFile(), `${args[0]} is on disk under ${REPO}`);
  assert.ok(args.includes('--headless'));
  assert.equal(args[args.indexOf('--browser') + 1], 'chromium');
  assert.deepEqual(refusals(config, REPO), []);
});

test('each way out of that shape is refused', () => {
  const cases: Array<[string, (s: { command: string; args: string[] }, c: { mcpServers: Record<string, unknown> }) => void, RegExp]> = [
    [
      'npx',
      (s) => {
        s.command = 'npx';
        s.args = ['@playwright/mcp@latest', ...s.args.slice(1)];
      },
      /not node: npx downloads/,
    ],
    [
      'an absolute script',
      (s) => {
        s.args[0] = path.join(REPO, s.args[0]);
      },
      /an absolute one is one checkout/,
    ],
    [
      'a script not on disk',
      (s) => {
        s.args[0] = 'node_modules/@playwright/nope/cli.js';
      },
      /not on disk/,
    ],
    [
      'headed',
      (s) => {
        s.args = s.args.filter((a) => a !== '--headless');
      },
      /not --headless/,
    ],
    [
      "the operator's Chrome",
      (s) => {
        s.args[s.args.indexOf('--browser') + 1] = 'chrome';
      },
      /--browser chrome, not chromium/,
    ],
    [
      'a profile on disk',
      (s) => {
        s.args = s.args.filter((a) => a !== '--isolated');
      },
      /not --isolated/,
    ],
    [
      'a shared profile',
      (s) => {
        s.args.push('--user-data-dir', '/tmp/profile');
      },
      /--user-data-dir/,
    ],
    [
      'the default output dir',
      (s) => {
        s.args.splice(s.args.indexOf('--output-dir'), 2);
      },
      /\.playwright-mcp, relative to the workspace/,
    ],
    [
      'an output dir no variable names',
      (s) => {
        s.args[s.args.indexOf('--output-dir') + 1] = '/tmp/x';
      },
      /\/tmp\/x for every step alike/,
    ],
    [
      "another variable's folder",
      (s) => {
        s.args[s.args.indexOf('--output-dir') + 1] = '${OTHER:-/tmp/x}';
      },
      /the folder `OTHER` names/,
    ],
    [
      'the variable with no default',
      (s) => {
        s.args[s.args.indexOf('--output-dir') + 1] = '${WF_STEP_FILES}';
      },
      /no default/,
    ],
    [
      'a relative default',
      (s) => {
        s.args[s.args.indexOf('--output-dir') + 1] = '${WF_STEP_FILES:-shots}';
      },
      /shots outside a run, relative to the workspace/,
    ],
    [
      'a default in the repository',
      (s) => {
        s.args[s.args.indexOf('--output-dir') + 1] = `\${WF_STEP_FILES:-${path.join(REPO, 'shots')}}`;
      },
      /inside the repository/,
    ],
    [
      'a nested default',
      (s) => {
        s.args[s.args.indexOf('--output-dir') + 1] = '${WF_STEP_FILES:-${HOME}/x}';
      },
      /nests a variable/,
    ],
    [
      'a second server',
      (_s, c) => {
        c.mcpServers.other = { command: 'x' };
      },
      /not exactly one server/,
    ],
  ];
  for (const [label, change, why] of cases) {
    const config = structuredClone(shipped());
    change(config.mcpServers.playwright, config);
    assert.match(refusals(config, REPO).join('; '), why, label);
  }
  assert.deepEqual(refusals({ servers: {} }, REPO), ['names no map of servers under `mcpServers`']);
});

test('an interactive session in the checkout is given the same server, and it is the pinned one', () => {
  assert.deepEqual(read('.claude/settings.json').enabledMcpjsonServers, Object.keys(shipped().mcpServers));
  const exact = (v: unknown) => typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v);
  assert.equal([exact('^0.0.80'), exact('latest'), exact('0.0.80')].join(), 'false,false,true', 'the pin check refuses a range');
  const pinned = read('package.json').devDependencies['@playwright/mcp'];
  assert.ok(exact(pinned), `@playwright/mcp is pinned exactly, not ${pinned}`);
  const script = shipped().mcpServers.playwright.args[0];
  assert.equal(
    read(path.join(path.dirname(script), 'package.json')).version,
    pinned,
    'the script on disk is the pinned version; run `npm install`',
  );
});

test('the server starts as configured, from the repository root, and offers browser_navigate', async () => {
  const { command, args } = shipped().mcpServers.playwright;
  const child = spawn(command, expanded(args, { [STEP_FILES]: scratch('wf-mcp-files-') }), { cwd: REPO, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => {
    stderr += d;
  });
  const send = (m: object) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...m })}\n`);
  try {
    const tools = await new Promise<string[]>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no tools/list answer within 30 s. It printed:\n${stderr}`)), 30_000);
      child.on('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`exited ${code} before listing its tools:\n${stderr}`));
      });
      let buf = '';
      child.stdout.on('data', (d) => {
        buf += d;
        for (let at = buf.indexOf('\n'); at !== -1; at = buf.indexOf('\n')) {
          const msg = JSON.parse(buf.slice(0, at)) as { id?: number; result?: { tools?: Array<{ name: string }> } };
          buf = buf.slice(at + 1);
          if (msg.id === 1) {
            send({ method: 'notifications/initialized' });
            send({ id: 2, method: 'tools/list' });
          }
          if (msg.id === 2) {
            clearTimeout(timer);
            resolve((msg.result?.tools ?? []).map((t) => t.name));
          }
        }
      });
      send({
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'mcp-config.test', version: '1' } },
      });
    });
    assert.ok(tools.includes('browser_navigate'), tools.join(' '));
  } finally {
    child.removeAllListeners('exit');
    child.kill();
  }
});

/** The steps of the folder `dir` given the `look` skill that load no `playwright`, by their line or their agent's: each could not look. */
const blindLookers = (dir: string, places = placesOf(dir)): string[] =>
  loadWorkflows(dir, places)
    .filter((step) => step.agent?.skills?.includes('look') && !step.agent.mcp?.includes('playwright'))
    .map((step) => `${path.basename(dir)}/${step.name}`);

test('every shipped step given the look skill names playwright, itself or by its agent, whose tools the skill uses', () => {
  const lookers = shippedFolders().flatMap((dir) => loadWorkflows(dir, placesOf(dir)).filter((s) => s.agent?.skills?.includes('look')));
  assert.ok(lookers.length > 0, 'a step of this repository is given look');
  assert.deepEqual(
    shippedFolders().flatMap((dir) => blindLookers(dir)),
    [],
  );
  const root = scratch('wf-mcp-look-');
  fs.mkdirSync(path.join(root, 'agents'));
  fs.mkdirSync(path.join(root, 'dev'));
  fs.mkdirSync(path.join(root, 'skills', 'look'), { recursive: true });
  fs.writeFileSync(path.join(root, 'skills', 'look', 'SKILL.md'), '---\nname: look\ndescription: Looks.\n---\nLook.\n');
  fs.writeFileSync(path.join(root, 'agents', 'sighted.md'), '---\nmcp: playwright\n---\nYou look.\n');
  fs.writeFileSync(path.join(root, 'agents', 'blind.md'), '---\nmcp: docs\n---\nYou look.\n');
  fs.writeFileSync(path.join(root, 'agents', 'plain.md'), '---\ndescription: Looks.\n---\nYou look.\n');
  const step = (name: string, agent: string, lines = '') =>
    fs.writeFileSync(path.join(root, 'dev', `${name}.md`), `---\nplace: git\nagent: ${agent}\nskills: look\n${lines}---\nLook.\n`);
  step('sighted', 'sighted');
  step('blind', 'blind');
  step('named', 'plain', 'mcp: playwright\n');
  step('unnamed', 'plain');
  assert.deepEqual(
    blindLookers(path.join(root, 'dev'), {}),
    ['dev/blind', 'dev/unnamed'],
    'a step given look is refused where neither it nor its agent names playwright, and passes where the step alone does',
  );
});

/** A fake `claude` in a new folder, first on PATH while `f` runs: it writes the argv of the session it is started for to `args`. */
const withFakeClaude = async <T>(f: (args: string) => Promise<T>): Promise<T> => {
  const bin = scratch('wf-mcp-bin-');
  const args = path.join(bin, 'args');
  fs.writeFileSync(
    path.join(bin, 'claude'),
    ['#!/bin/sh', 'case "$1" in', '  agents) echo "[]" ;;', `  *) printf '%s\\n' "$@" > '${args}'; exit 1 ;;`, 'esac', ''].join('\n'),
    { mode: 0o755 },
  );
  const prev = process.env.PATH;
  process.env.PATH = `${bin}:${prev}`;
  try {
    return await f(args);
  } finally {
    process.env.PATH = prev;
  }
};

/** The MCP configs Claude Code is named on the argv `args`: every value after `--mcp-config` up to the next flag. */
const mcpConfigsOf = (args: string[]): string[] => {
  const at = args.indexOf('--mcp-config');
  if (at === -1) return [];
  const rest = args.slice(at + 1);
  const end = rest.findIndex((a) => a.startsWith('-'));
  return end === -1 ? rest : rest.slice(0, end);
};

/**
 * The argv Claude Code is started with for the first session of a step whose file has the lines `own`, filled by an agent whose file has
 * the lines `agent`, in a checkout whose `.mcp.json` names the servers `repo` and `other`: the step resolved and frozen as a start does,
 * filed as the tick files it.
 */
const sessionArgv = async (t: Parameters<typeof until>[0], agent: string, own = ''): Promise<{ cwd: string; args: string[] }> => {
  const cwd = scratch('wf-mcp-checkout-');
  fs.writeFileSync(
    path.join(cwd, '.mcp.json'),
    JSON.stringify({ mcpServers: { repo: { command: 'repo-server' }, other: { command: 'o' } } }),
  );
  const scout = parseAgent('scout', `---\n${agent}---\nYou look.\n`);
  const step = parseWorkflow('look', `---\nplace: git\nagent: scout\n${own}---\nLook.\n`, undefined, new Map([['scout', scout]]));
  const config = filedConfig(
    step,
    [step],
    { gates: [] },
    {
      model: undefined,
      budgetUsd: undefined,
      runArtifacts: scratch('wf-mcp-artifacts-'),
      inbox: scratch('wf-mcp-inbox-'),
      own: {},
      landingDenied: () => [],
    },
  );
  return withFakeClaude(async (args) => {
    const e = plainEngine(EngineService.layer({ root: scratch('wf-mcp-root-'), harnesses: { claude: 'claude' } }));
    const id = await Effect.runPromise(e.file({ brief: 'b', cwd, harness: 'claude', config }));
    await until(
      t,
      async () => {
        if ((await Effect.runPromise(e.view(id))).state.settled) return true;
        await Effect.runPromise(e.tick());
        return false;
      },
      'the fake Claude Code task settled',
      { everyMs: 50 },
    );
    return { cwd, args: fs.readFileSync(args, 'utf8').replace(/\n$/, '').split('\n') };
  });
};

test(
  'a session of an agent that names no server, in a checkout whose .mcp.json names one, is started with none loaded',
  WAITED,
  async (t) => {
    const { args } = await sessionArgv(t, 'description: Looks.\n');
    assert.deepEqual(mcpConfigsOf(args), [], "no MCP config is named, the checkout's least of all");
    assert.ok(args.includes('--strict-mcp-config'), 'and strict, so nothing loads in its place');
  },
);

test("a session of an agent that names one of its checkout's servers is started with that one alone", WAITED, async (t) => {
  const { cwd, args } = await sessionArgv(t, 'mcp: repo\n');
  const configs = mcpConfigsOf(args);
  assert.equal(configs.length, 1, JSON.stringify(configs));
  assert.notEqual(configs[0], path.join(cwd, '.mcp.json'), "not the checkout's file, which names another too");
  assert.deepEqual(JSON.parse(fs.readFileSync(configs[0], 'utf8')), { mcpServers: { repo: { command: 'repo-server' } } });
});

/** The servers the one MCP config named on `args` holds, by name, in its order. */
const serversLoaded = (args: string[]): string[] => {
  const configs = mcpConfigsOf(args);
  assert.equal(configs.length, 1, JSON.stringify(configs));
  return Object.keys((JSON.parse(fs.readFileSync(configs[0], 'utf8')) as { mcpServers: object }).mcpServers);
};

test('a session of a step that names a server, filled by an agent that names none, is started with that one alone', WAITED, async (t) => {
  const { cwd, args } = await sessionArgv(t, 'description: Looks.\n', 'mcp: repo\n');
  const configs = mcpConfigsOf(args);
  assert.equal(configs.length, 1, JSON.stringify(configs));
  assert.notEqual(configs[0], path.join(cwd, '.mcp.json'), "not the checkout's file, which names another too");
  assert.deepEqual(JSON.parse(fs.readFileSync(configs[0], 'utf8')), { mcpServers: { repo: { command: 'repo-server' } } });
  assert.ok(args.includes('--strict-mcp-config'));
});

test("a session loads its agent's servers and its step's, and one both name once", WAITED, async (t) => {
  assert.deepEqual(serversLoaded((await sessionArgv(t, 'mcp: other\n', 'mcp: repo\n')).args).sort(), ['other', 'repo']);
  assert.deepEqual(serversLoaded((await sessionArgv(t, 'mcp: repo\n', 'mcp: repo\n')).args), ['repo']);
});

test(
  'loading a server allows none of its tools: a dontAsk session of a step that names one is started in dontAsk with no rule for it',
  WAITED,
  async (t) => {
    const { args } = await sessionArgv(t, 'permissionMode: dontAsk\nallowedTools: Read\n', 'mcp: repo\n');
    assert.deepEqual(serversLoaded(args), ['repo'], 'the server is loaded');
    assert.equal(args[args.indexOf('--permission-mode') + 1], 'dontAsk', 'in the mode that denies what no rule allows');
    assert.deepEqual(
      args.filter((arg) => arg.includes('mcp__')),
      [],
      'and no argument names a tool of the server, so nothing allows one',
    );
  },
);

const live = process.env.AE_LIVE === '1';

const BRIEF = [
  'Some MCP servers may still be connecting when you start, and you are told which.',
  'While you are told that any server is still connecting, run `sleep 15` with your Bash tool and look again, at most six times.',
  'Then give your closing statement: in mcpServers, the name of every MCP server you have been told of, connected, connecting or failed;',
  'in mcpTools, the exact name of every tool you have whose name begins with mcp__, loaded or deferred. Use an empty list for none.',
  'Call no MCP tool, and no tool at all except Bash for the sleep and the one that gives your closing statement.',
].join(' ');
const CLOSEOUT = {
  type: 'object',
  properties: {
    mcpServers: { type: 'array', items: { type: 'string' } },
    mcpTools: { type: 'array', items: { type: 'string' } },
  },
  required: ['mcpServers', 'mcpTools'],
  additionalProperties: false,
};

test(
  "a --bg task filed in this repository has Playwright's browser_navigate and none of the operator's servers",
  {
    skip: live ? false : 'set AE_LIVE=1 to run against Claude Code (spends money)',
    timeout: 12 * 60_000,
  },
  async (t) => {
    const engine: Engine = plainEngine(EngineService.layer({ root: scratch('wf-live-mcp-') }));
    const id = await Effect.runPromise(
      engine.file({
        brief: BRIEF,
        cwd: REPO,
        closeoutSchema: CLOSEOUT,
        deadlineSeconds: 480,
        config: { effort: 'low', background: true },
      }),
    );
    let view: TaskView | undefined;
    try {
      await until(
        t,
        async () => {
          await Effect.runPromise(engine.tick());
          view = await Effect.runPromise(engine.view(id));
          return view.state.settled;
        },
        `${id} settled on Claude Code`,
        { everyMs: 5_000 },
      );
      assert.equal(view?.state.settled, 'succeeded', `settled: ${view?.phase}`);
      const said = view.state.attempts.at(-1)?.closeout as { mcpServers?: string[]; mcpTools?: string[] } | undefined;
      assert.deepEqual(said?.mcpServers, ['playwright'], `the repository's server and only that; it said ${JSON.stringify(said)}`);
      assert.ok(said?.mcpTools?.includes('mcp__playwright__browser_navigate'), `the browser's tools; it said ${JSON.stringify(said)}`);
      assert.deepEqual(
        said?.mcpTools?.filter((t) => !t.startsWith('mcp__playwright__')),
        [],
        "no tool from any of the operator's servers",
      );
    } finally {
      const short = view?.sessionId?.split('-')[0];
      for (const verb of short ? ['stop', 'rm'] : []) {
        try {
          execFileSync('claude', [verb, short!], { stdio: 'ignore', timeout: 30_000 });
        } catch {}
      }
    }
  },
);

const SHOT = [
  'Use the browser: navigate to `data:text/html,<h1>hello</h1>`, then take one screenshot, giving no filename.',
  'Then give your closing statement: in saved, the path the screenshot tool said it saved the picture to, or an empty string if it said none.',
  'Call no other tool.',
].join(' ');

test(
  "a job filed a step's files directory has the browser write a screenshot given no filename there, outside the workspace",
  {
    skip: live ? false : 'set AE_LIVE=1 to run against Claude Code (spends money)',
    timeout: 8 * 60_000,
  },
  async (t) => {
    const config = process.env.CLAUDE_CONFIG_DIR;
    delete process.env.CLAUDE_CONFIG_DIR;
    t.after(() => {
      process.env.CLAUDE_CONFIG_DIR = config;
    });
    const files = scratch('wf-live-files-');
    const engine: Engine = plainEngine(EngineService.layer({ root: scratch('wf-live-shot-') }));
    const id = await Effect.runPromise(
      engine.file({
        brief: SHOT,
        cwd: REPO,
        closeoutSchema: { type: 'object', properties: { saved: { type: 'string' } }, required: ['saved'], additionalProperties: false },
        deadlineSeconds: 360,
        config: {
          model: 'haiku',
          effort: 'low',
          permissionMode: 'dontAsk',
          allowedTools: ['mcp__playwright__browser_navigate', 'mcp__playwright__browser_take_screenshot'],
          checkoutMcp: ['playwright'],
          budgetUsd: 1,
          env: { [STEP_FILES]: files },
        },
      }),
    );
    let view: TaskView | undefined;
    await until(
      t,
      async () => {
        await Effect.runPromise(engine.tick());
        view = await Effect.runPromise(engine.view(id));
        return view.state.settled;
      },
      `${id} settled on Claude Code`,
      { everyMs: 5_000 },
    );
    const said = view?.state.attempts.at(-1)?.closeout as { saved?: string } | undefined;
    const pictures = fs
      .readdirSync(files, { recursive: true })
      .map(String)
      .filter((f) => f.endsWith('.png'));
    const logs = await Effect.runPromise(engine.logs(id)).catch((e: Error) => e.message);
    t.diagnostic(`logs ${JSON.stringify(logs).slice(-3000)}`);
    t.diagnostic(`settled ${view?.state.settled}; it said ${JSON.stringify(said)}; ${files} holds ${JSON.stringify(pictures)}`);
    assert.equal(view?.state.settled, 'succeeded', `settled: ${view?.phase}`);
    assert.equal(pictures.length, 1, `one picture in ${files}; it said ${JSON.stringify(said)}`);
  },
);
