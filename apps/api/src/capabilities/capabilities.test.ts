/**
 * GET /api/capabilities (capabilities.ts, reach.ts): the skills, agents, MCP servers and permission rules of a scratch checkout, and what
 * each step of its workflows gets of them.
 */
import '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect, Exit, Layer } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import { app, appOf, liveOf } from '../app.ts';
import { ApiConfig } from '../layer.ts';
import {
  HOME_REPO,
  MEASURED_TOOLS,
  READ_ONLY_COMMANDS,
  capabilitiesOf,
  dated,
  denyingRule,
  frontmatterOf,
  readOnlyCommands,
  repoOf,
  serverAsk,
} from './capabilities.ts';
import { DISALLOW, askDenierOf, bashCovers } from './reach.ts';

type CapabilitiesWithSteps = import('./reach.ts').CapabilitiesWithSteps;
type StepReach = import('./reach.ts').StepReach;
assert.equal(
  DISALLOW,
  'disallowedTools:',
  "a step's own deny rules come from its line, as the step writes it: every assertion below reads the constant, so this one reads the words",
);

const FIXTURE_SERVER = path.join(import.meta.dirname, '..', '..', 'test', 'fixtures', 'mcp-server.ts');

/** A checkout with only these files in it. An object is written as JSON. */
const repoWith = (files: Record<string, string | object>): string => {
  const repo = scratch('nemia-api-repo-');
  for (const [file, content] of Object.entries(files)) write(path.join(repo, file), content);
  return repo;
};

const write = (file: string, content: string | object): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
};

/** GET /api/capabilities, with the api serving the repository at `repo`. */
const served = async (repo: string) => {
  process.env.HKB_REPO = repo;
  try {
    const res = await app.request('/api/capabilities');
    return { status: res.status, body: (await res.json()) as CapabilitiesWithSteps };
  } finally {
    delete process.env.HKB_REPO;
  }
};

/** The fixture server as an `.mcp.json` entry: node on its file, with `env`. */
const fixture = (env: Record<string, string> = {}) => ({ command: process.execPath, args: [FIXTURE_SERVER], env });

/** The pids a fixture server wrote to `file`, one per start. */
const startsIn = (file: string): number[] =>
  fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(Number) : [];

test('frontmatter: a name and a description in each form a skill or an agent writes them', () => {
  const read = (front: string) => frontmatterOf(`---\n${front}\n---\n# The body\n`);
  assert.deepEqual(read('name: review\ndescription: Reviews a diff.'), { name: 'review', description: 'Reviews a diff.' });
  assert.equal(read('description: "Use when: a diff is ready, \\"now\\""')?.description, 'Use when: a diff is ready, "now"');
  assert.equal(read("description: 'It''s for reviews: all of them'")?.description, "It's for reviews: all of them");
  assert.equal(read('description: |\n  First line.\n  Second line.')?.description, 'First line.\nSecond line.');
  assert.equal(read('description: >-\n  Folded\n  into one.\n\n  Then another.')?.description, 'Folded into one.\nThen another.');
  assert.equal(read('description: Runs on\n  over two lines.')?.description, 'Runs on over two lines.');
  assert.equal(read('description: Plain  # and a comment')?.description, 'Plain');
  assert.deepEqual(
    read('name: x\nmetadata:\n  type: user\ntools:\n  - Read\ndescription: after them'),
    { name: 'x', description: 'after them' },
    'a map or a list under a key is not a value: skipped, and the keys after it still read',
  );
  assert.deepEqual(frontmatterOf('\uFEFF---\r\nname: crlf\r\n---\r\nbody\r\n'), { name: 'crlf' });
});

test('frontmatter: a file without it, or whose frontmatter never closes, has none', () => {
  assert.equal(frontmatterOf('# A skill\n\nname: not a key, prose\n'), null);
  assert.equal(frontmatterOf('---\nname: never closed\n# The body\n'), null);
  assert.equal(frontmatterOf(''), null);
});

test('skills and agents, with frontmatter and without: named by it or by their directory or file, with where each was read', async () => {
  const repo = repoWith({
    '.claude/skills/review/SKILL.md': '---\nname: code-review\ndescription: Review a diff for bugs.\n---\n# Review\n',
    '.claude/skills/bare/SKILL.md': '# Bare\n\nNo frontmatter here.\n',
    '.claude/skills/unnamed/SKILL.md': '---\ndescription: Says what, not who.\n---\n',
    '.claude/skills/notes/README.md': 'A directory with no SKILL.md is not a skill.\n',
    '.claude/agents/tester.md': '---\nname: tester\ndescription: Writes the tests.\ntools: Read, Write\n---\nYou write tests.\n',
    '.claude/agents/plain.md': 'You have no frontmatter.\n',
    '.claude/agents/notes.txt': 'Not markdown, so not an agent.\n',
  });
  const { status, body } = await served(repo);
  assert.equal(status, 200);
  assert.deepEqual(body.skills, [
    { name: 'bare', description: null, source: '.claude/skills/bare/SKILL.md' },
    { name: 'code-review', description: 'Review a diff for bugs.', source: '.claude/skills/review/SKILL.md' },
    { name: 'unnamed', description: 'Says what, not who.', source: '.claude/skills/unnamed/SKILL.md' },
  ]);
  assert.deepEqual(body.agents, [
    { name: 'plain', description: null, source: '.claude/agents/plain.md' },
    { name: 'tester', description: 'Writes the tests.', source: '.claude/agents/tester.md' },
  ]);
  assert.equal(body.repo, repo);
  assert.deepEqual(body.warnings, []);
});

test('a repository with none of it — or no repository at all, or `.claude/skills` a file and not a directory — is empty lists and a 200, never an error', async () => {
  const gone = path.join(scratch('nemia-api-nowhere-'), 'no-such-repo');
  for (const repo of [repoWith({}), gone, repoWith({ '.claude/skills': 'a file', '.claude/agents': 'a file' })]) {
    const { status, body } = await served(repo);
    assert.equal(status, 200, repo);
    assert.deepEqual(
      body,
      {
        repo,
        skills: [],
        agents: [],
        mcp: [],
        denied: [],
        asked: [],
        allowed: [],
        warnings: [],
        measured: MEASURED_TOOLS,
        readOnly: READ_ONLY_COMMANDS,
        steps: [],
      },
      repo,
    );
  }
});

test('the denied list is permissions.deny in .claude/settings.json, in its order', async () => {
  const repo = repoWith({
    '.claude/settings.json': { permissions: { deny: ['Bash(git push:*)', 'mcp__playwright__browser_run_code_unsafe'], allow: ['Read'] } },
  });
  const { body } = await served(repo);
  assert.deepEqual(body.denied, [
    { rule: 'Bash(git push:*)', source: '.claude/settings.json' },
    { rule: 'mcp__playwright__browser_run_code_unsafe', source: '.claude/settings.json' },
  ]);
});

test('a server that lists its tools: each with its description, and the one a rule denies marked with that rule', async () => {
  const repo = repoWith({
    '.mcp.json': { mcpServers: { fixture: fixture() } },
    '.claude/settings.json': { enabledMcpjsonServers: ['fixture'], permissions: { deny: ['mcp__fixture__wipe'] } },
  });
  const { status, body } = await served(repo);
  assert.equal(status, 200);
  const [server] = body.mcp;
  assert.deepEqual(
    { ...server, checkedAt: undefined },
    {
      name: 'fixture',
      source: '.mcp.json',
      type: 'stdio',
      command: process.execPath,
      args: [FIXTURE_SERVER],
      url: null,
      enabled: true,
      factoryState: null,
      tools: [
        { name: 'echo', description: 'Say it back.\nA second line, which a one-line description leaves out.', denied: null },
        { name: 'wipe', description: 'Remove everything in the workspace.', denied: 'mcp__fixture__wipe' },
      ],
      error: null,
      notAsked: null,
      checkedAt: undefined,
    },
  );
  assert.ok(Date.parse(server.checkedAt ?? '') > 0, `checkedAt is when it was asked: ${server.checkedAt}`);
});

test('a server whose command does not exist is an error on its entry: a 200, and the other server still lists its tools', async () => {
  const repo = repoWith({
    '.mcp.json': { mcpServers: { missing: { command: 'nemia-no-such-mcp-server', args: ['--stdio'] }, fixture: fixture() } },
    '.claude/settings.json': { enabledMcpjsonServers: ['missing', 'fixture'] },
  });
  const { status, body } = await served(repo);
  assert.equal(status, 200);
  const [missing, working] = body.mcp;
  assert.equal(missing.name, 'missing');
  assert.equal(missing.tools, null);
  assert.equal(
    missing.error,
    '`nemia-no-such-mcp-server --stdio` did not start: there is no command `nemia-no-such-mcp-server` on its PATH. Install it, or fix `command` for missing in .mcp.json.',
  );
  assert.deepEqual(
    working.tools?.map((tool) => tool.name),
    ['echo', 'wipe'],
  );
});

test('a server that offers no tools lists none, and is not asked tools/list, which it has no answer to', async () => {
  const repo = repoWith({
    '.mcp.json': { mcpServers: { prompts: fixture({ HKB_TEST_MODE: 'prompts' }) } },
    '.claude/settings.json': { enabledMcpjsonServers: ['prompts'] },
  });
  const { status, body } = await served(repo);
  assert.equal(status, 200);
  assert.deepEqual([body.mcp[0].tools, body.mcp[0].error], [[], null]);
  assert.ok(Date.parse(body.mcp[0].checkedAt ?? '') > 0, 'it was asked, and answered');
});

test('a server that exits before it answers is an error with what it printed on stderr', async () => {
  const repo = repoWith({
    '.mcp.json': { mcpServers: { crash: fixture({ HKB_TEST_MODE: 'crash' }) } },
    '.claude/settings.json': { enabledMcpjsonServers: ['crash'] },
  });
  const { status, body } = await served(repo);
  assert.equal(status, 200);
  assert.equal(body.mcp[0].tools, null);
  assert.match(
    body.mcp[0].error ?? '',
    /did not list its tools: .+\. Run it yourself to see why, or fix its entry in \.mcp\.json\.\nWhat it printed on stderr:\nfixture: no licence key in FIXTURE_KEY$/,
  );
});

/** A deadline for asking a server that the test can wait for; the api's own is `ASK_MS`. */
const WAITABLE_DEADLINE_MS = 500;

/** The most asks the silent-server test makes, each with twice the deadline of the one before, for the server to start within it. */
const SILENT_TRIES = 6;

test("a server that never answers is an error once its time is up, and it is stopped: by the MCP SDK's close, after the SDK's own 2 s grace", async () => {
  for (let tries = 1, deadlineMs = WAITABLE_DEADLINE_MS; ; tries++, deadlineMs *= 2) {
    const starts = path.join(scratch('nemia-api-starts-'), 'starts');
    const repo = repoWith({
      '.mcp.json': { mcpServers: { silent: fixture({ HKB_TEST_MODE: 'silent', HKB_TEST_STARTS: starts }) } },
      '.claude/settings.json': { enabledMcpjsonServers: ['silent'] },
    });
    const {
      mcp: [server],
    } = await capabilitiesOf(repo, { deadlineMs });
    assert.equal(server.tools, null);
    assert.ok(
      server.error!.includes(`did not list its tools: it did not list its tools within ${deadlineMs / 1000} s.`),
      `try ${tries}: ${server.error}`,
    );
    const [pid] = startsIn(starts);
    if (pid === undefined) {
      assert.ok(tries < SILENT_TRIES, `the server started within its deadline, on one of ${SILENT_TRIES} tries`);
      continue;
    }
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' }, 'the server is not left running');
    return;
  }
});

test('REFUSED: a server asked, whose ask is interrupted before it answers, is stopped before the interruption returns', async () => {
  const starts = path.join(scratch('nemia-api-starts-'), 'starts');
  const repo = scratch('nemia-api-repo-');
  const args = [FIXTURE_SERVER];
  const env = { ...(process.env as Record<string, string>), HKB_TEST_MODE: 'deaf', HKB_TEST_STARTS: starts };
  const stop = new AbortController();
  const exit = Effect.runPromiseExit(
    serverAsk(repo, { name: 'deaf', command: process.execPath, args }, { command: process.execPath, args, env }, 60_000),
    { signal: stop.signal },
  );
  const ended = exit.then(() => true);
  let over = false;
  while (startsIn(starts).length === 0 && !over) over = await Promise.race([ended, new Promise<boolean>((r) => setTimeout(r, 20, false))]);
  const [pid] = startsIn(starts);
  assert.ok(pid, 'the server started before its ask ended');
  stop.abort();
  assert.ok(Exit.hasInterrupts(await exit), 'the ask was interrupted, not answered');
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' }, 'the server is not left running');
});

test("each server is asked once while an app runs: requests after the first, and requests at once, read that answer, the app's environment naming the repository", async () => {
  const starts = path.join(scratch('nemia-api-starts-'), 'starts');
  const repo = repoWith({
    '.mcp.json': { mcpServers: { fixture: fixture({ HKB_TEST_STARTS: starts }) } },
    '.claude/settings.json': { enabledMcpjsonServers: ['fixture'] },
  });
  const { app: own } = appOf(Layer.merge(liveOf(), ApiConfig.layer({ ...process.env, HKB_REPO: repo })));
  const capabilitiesOf = async (): Promise<CapabilitiesWithSteps> => {
    const res = await own.request('/api/capabilities');
    assert.equal(res.status, 200);
    return (await res.json()) as CapabilitiesWithSteps;
  };
  const [first, second] = await Promise.all([capabilitiesOf(), capabilitiesOf()]);
  const third = await capabilitiesOf();
  assert.equal(first.repo, repo, "the repository the app's environment names, not the process's");
  assert.equal(startsIn(starts).length, 1, 'started once');
  for (const answer of [second, third]) assert.deepEqual(answer.mcp, first.mcp);

  write(path.join(repo, '.mcp.json'), {
    mcpServers: { fixture: { ...fixture({ HKB_TEST_STARTS: starts }), args: [FIXTURE_SERVER, '--edited'] } },
  });
  const edited = await capabilitiesOf();
  assert.equal(startsIn(starts).length, 2, 'a server started otherwise is another server: started again for the edited entry');
  assert.deepEqual(edited.mcp[0].args, [FIXTURE_SERVER, '--edited']);
});

test("an entry is started as a session starts it — ${VAR} and ${VAR:-default} expanded from the api's environment, which the server inherits — and shown as written", async () => {
  const set: Record<string, string> = {
    HKB_TEST_FIXTURE_DIR: path.dirname(FIXTURE_SERVER),
    HKB_TEST_SECRET: 's3cret',
    HKB_TEST_INHERITED: 'from the api',
    PORT: '8787',
  };
  const before = Object.fromEntries(Object.keys(set).map((key) => [key, process.env[key]]));
  Object.assign(process.env, set);
  try {
    const args = ['${HKB_TEST_FIXTURE_DIR}/mcp-server.ts', '--token=${HKB_TEST_SECRET}'];
    const repo = repoWith({
      '.mcp.json': {
        mcpServers: {
          expands: {
            command: process.execPath,
            args,
            env: {
              HKB_TEST_MODE: 'env',
              HKB_TEST_NAMED: '${HKB_TEST_SECRET}',
              HKB_TEST_DEFAULTED: '${HKB_TEST_NEVER_SET_DEFAULTED:-the default}',
            },
          },
        },
      },
      '.claude/settings.json': { enabledMcpjsonServers: ['expands'] },
    });
    const { status, body } = await served(repo);
    assert.equal(status, 200);
    const [server] = body.mcp;
    assert.equal(server.error, null);
    assert.deepEqual(server.args, args, 'shown as written: expanded, a token would be on the page');
    const [echoed] = server.tools ?? [];
    assert.ok(echoed?.description, JSON.stringify(server));
    assert.deepEqual(
      JSON.parse(echoed.description),
      {
        argv: ['--token=s3cret'],
        HKB_TEST_NAMED: 's3cret',
        HKB_TEST_DEFAULTED: 'the default',
        HKB_TEST_INHERITED: 'from the api',
        CLAUDE_PROJECT_DIR: repo,
      },
      "what the server was started with — and no PORT, which is the api's",
    );
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("an entry naming a variable the api's environment does not set, with no default, is an error on its entry, and not started", async () => {
  const starts = path.join(scratch('nemia-api-starts-'), 'starts');
  const repo = repoWith({
    '.mcp.json': {
      mcpServers: {
        needs: {
          ...fixture({ HKB_TEST_STARTS: starts, GITHUB_PERSONAL_ACCESS_TOKEN: '${HKB_TEST_NEVER_SET_TOKEN}' }),
          args: [FIXTURE_SERVER, '--from=${HKB_TEST_NEVER_SET_ARG}'],
        },
      },
    },
    '.claude/settings.json': { enabledMcpjsonServers: ['needs'] },
  });
  const { status, body } = await served(repo);
  assert.equal(status, 200);
  assert.deepEqual([body.mcp[0].tools, body.mcp[0].checkedAt], [null, null]);
  assert.equal(
    body.mcp[0].error,
    ".mcp.json gives needs `${HKB_TEST_NEVER_SET_ARG}` and `${HKB_TEST_NEVER_SET_TOKEN}` with no default, and the api's environment does not set them, so it is not started. Set them where the api runs, or give each a default: `${NAME:-value}`.",
  );
  assert.deepEqual(startsIn(starts), [], 'never started');
});

test('a server .claude/settings.json does not enable is listed, and not started', async () => {
  const starts = path.join(scratch('nemia-api-starts-'), 'starts');
  const off = fixture({ HKB_TEST_STARTS: starts });
  for (const settings of [
    null,
    { enabledMcpjsonServers: ['another'] },
    { enabledMcpjsonServers: ['off'], disabledMcpjsonServers: ['off'] },
    { enableAllProjectMcpServers: true, disabledMcpjsonServers: ['off'] },
  ]) {
    const repo = repoWith({ '.mcp.json': { mcpServers: { off } }, ...(settings ? { '.claude/settings.json': settings } : {}) });
    const { status, body } = await served(repo);
    assert.equal(status, 200);
    assert.deepEqual(
      body.mcp[0],
      {
        name: 'off',
        source: '.mcp.json',
        type: 'stdio',
        command: process.execPath,
        args: [FIXTURE_SERVER],
        url: null,
        enabled: false,
        factoryState: null,
        tools: null,
        error: null,
        checkedAt: null,
        notAsked:
          'Not enabled by .claude/settings.json, so the api does not start it. Add "off" to enabledMcpjsonServers there to list its tools.',
      },
      JSON.stringify(settings),
    );
  }
  assert.deepEqual(startsIn(starts), [], 'never started');

  const all = repoWith({ '.mcp.json': { mcpServers: { off } }, '.claude/settings.json': { enableAllProjectMcpServers: true } });
  const { body } = await served(all);
  assert.equal(body.mcp[0].enabled, true, 'enableAllProjectMcpServers enables what it does not disable');
  assert.equal(body.mcp[0].tools?.length, 2);
});

test('a server that is not stdio, or whose entry does not read, is listed with why, and not started', async () => {
  const repo = repoWith({
    '.mcp.json': { mcpServers: { remote: { type: 'http', url: 'https://mcp.example.com/mcp' }, broken: { args: 'not a list' } } },
    '.claude/settings.json': { enabledMcpjsonServers: ['remote', 'broken'] },
  });
  const { status, body } = await served(repo);
  assert.equal(status, 200);
  const [remote, broken] = body.mcp;
  assert.deepEqual([remote.type, remote.url, remote.tools, remote.error], ['http', 'https://mcp.example.com/mcp', null, null]);
  assert.equal(
    remote.notAsked,
    'Not a stdio server (http, at https://mcp.example.com/mcp): the api asks only stdio servers for their tools.',
  );
  assert.equal(broken.tools, null);
  assert.equal(
    broken.error,
    '.mcp.json gives broken neither a `command` nor a `url` and `args` that are not a list of strings, so it is not started. Fix its entry.',
  );
});

test('a .mcp.json or a settings file that does not read is a warning naming it and the fix, and the rest is still served', async () => {
  const repo = repoWith({
    '.mcp.json': '{ "mcpServers": ',
    '.claude/settings.json': '["not", "an object"]',
    '.claude/skills/review/SKILL.md': '---\nname: review\n---\n',
  });
  const { status, body } = await served(repo);
  assert.equal(status, 200);
  assert.deepEqual([body.mcp, body.denied], [[], []]);
  assert.equal(body.skills[0].name, 'review');
  assert.equal(body.warnings.length, 2);
  assert.match(
    body.warnings[0],
    /^\.claude\/settings\.json is not a JSON object, so nothing is read as denied or enabled from it\. Make it one/,
  );
  assert.match(body.warnings[1], /^\.mcp\.json does not parse as JSON \(.+\), so no MCP server is listed from it\. Fix the file/);

  const listless = repoWith({ '.claude/settings.json': { permissions: { deny: 'mcp__fixture__wipe' } } });
  const { body: denied } = await served(listless);
  assert.deepEqual(denied.denied, []);
  assert.deepEqual(denied.warnings, [
    'permissions.deny in .claude/settings.json is not a list of strings, so it is read as empty. Make it one: `["…"]`.',
  ]);
});

test("a deny rule refuses a server's tool by the tool's name, the server's, or every tool of the server — and by nothing else", () => {
  const tool = ['playwright', 'browser_click'] as const;
  assert.equal(denyingRule(['Read', 'mcp__playwright__browser_click'], ...tool), 'mcp__playwright__browser_click');
  assert.equal(denyingRule(['mcp__playwright'], ...tool), 'mcp__playwright');
  assert.equal(denyingRule(['mcp__playwright__*'], ...tool), 'mcp__playwright__*');
  for (const rule of [
    'mcp__play',
    'mcp__playwrightx',
    'mcp__playwright__browser',
    'mcp__playwright__browser_click_',
    'mcp__other__browser_click',
    'Bash(git push)',
    '*',
  ]) {
    assert.equal(denyingRule([rule], ...tool), null, rule);
  }
});

/** Whether `dir` is the checkout: the folder whose `package.json` declares the workspaces. */
const isCheckout = (dir: string): boolean => {
  const file = path.join(dir, 'package.json');
  return fs.existsSync(file) && Array.isArray((JSON.parse(fs.readFileSync(file, 'utf8')) as { workspaces?: unknown }).workspaces);
};

test("HOME_REPO, built from capabilities.ts's own place, is the checkout: a `..` too few or too many is refused", () => {
  assert.equal(isCheckout(path.join(HOME_REPO, 'apps', 'api')), false, "the api's own package.json declares no workspaces");
  assert.equal(isCheckout(path.join(HOME_REPO, 'apps')), false, 'apps/ has no package.json');
  assert.ok(
    isCheckout(HOME_REPO),
    `${HOME_REPO} is not the checkout: capabilities.ts builds it from its own folder, so a move changes its \`..\``,
  );
});

test("unset, the api serves its own checkout: Playwright's server lists browser_run_code_unsafe, which the settings deny no session", async () => {
  assert.equal(repoOf({}), HOME_REPO);
  assert.equal(repoOf({ HKB_REPO: '  ' }), HOME_REPO);
  assert.equal(repoOf({ HKB_REPO: 'elsewhere' }), path.resolve('elsewhere'));
  const install = { kind: 'install', root: '/s/releases/v1', tag: 'v1', commit: 'abc', source: '/home/me/nemia', builtAt: '' } as const;
  assert.equal(repoOf({}, install), '/home/me/nemia', 'an install serves the repository it was built from, not its own folder');
  assert.equal(repoOf({ HKB_REPO: 'elsewhere' }, install), path.resolve('elsewhere'), 'HKB_REPO first');
  assert.equal(repoOf({}, { kind: 'checkout', root: '/elsewhere' }), HOME_REPO, 'a checkout serves its own');
  assert.ok(fs.existsSync(path.join(HOME_REPO, 'CLAUDE.md')), `${HOME_REPO} is the checkout`);

  delete process.env.HKB_REPO;
  const res = await app.request('/api/capabilities');
  assert.equal(res.status, 200);
  const body = (await res.json()) as CapabilitiesWithSteps;
  const playwright = body.mcp.find((server) => server.name === 'playwright');
  assert.ok(playwright, JSON.stringify(body.mcp.map((server) => server.name)));
  assert.equal(playwright.enabled, true);
  assert.equal(playwright.error, null);
  const unsafe = playwright.tools?.find((tool) => tool.name === 'browser_run_code_unsafe');
  assert.ok(unsafe, 'the server lists it');
  assert.equal(unsafe.denied, null, "the settings bind a person's own session too, and deny it nobody");
  assert.deepEqual(body.denied, [], 'the settings deny nothing: each step is fenced by its own keys');
});

/**
 * A checkout with workflows: `dev`'s implement on Claude Code with no `tools:` and a `disallowedTools:`, its review fenced to four tools in
 * `dontAsk`; and `codexed`, one step on Codex, in its `read-only` sandbox. The settings enable the fixture server, deny one of its tools
 * and a push, and allow three Bash commands and a search. The fixture server lists `echo` and `wipe`.
 */
const stepsRepo = () =>
  repoWith({
    '.claude/settings.json': {
      enabledMcpjsonServers: ['fixture'],
      permissions: {
        deny: ['Bash(git push:*)', 'mcp__fixture__wipe'],
        allow: ['Bash(npm test)', 'Bash(git diff:*)', 'Bash(npm run build)', 'WebSearch'],
      },
    },
    '.mcp.json': { mcpServers: { fixture: fixture() } },
    '.claude/skills/review/SKILL.md': '---\nname: code-review\ndescription: Review a diff.\n---\n',
    'workflows/dev/implement.md':
      '---\nplace: git\nagent: reader\nharness: claude\ndisallowedTools: SendMessage, CronCreate, mcp__fixture__echo, Bash(npm run build)\n---\nImplement it.\n',
    'workflows/dev/review.md':
      '---\nplace: git\nagent: reader\nharness: claude\nafter: implement\ntools: Read, Grep, Glob, Bash\npermissionMode: dontAsk\nallowedTools: Edit(**)\neffort: high\n---\nReview it.\n',
    'workflows/agents/reader.md': '---\nmcp: fixture\n---\nYou read.\n',
    'workflows/codexed/plan.md': '---\nplace: git\nharness: codex\nsandbox: read-only\n---\nPlan it.\n',
  });

/** The steps GET /api/capabilities says each step gets, by `<workflow>/<step>`. */
const stepsOf = async (repo: string): Promise<Record<string, StepReach>> => {
  const { status, body } = await served(repo);
  assert.equal(status, 200);
  return Object.fromEntries(body.steps.map((s) => [`${s.workflow}/${s.step}`, s]));
};

/** A Claude Code step's reach, with what was measured of it: a step on another harness has each of these null. */
type Measured = StepReach & {
  tools: NonNullable<StepReach['tools']>;
  skills: NonNullable<StepReach['skills']>;
  mcp: NonNullable<StepReach['mcp']>;
  readOnly: NonNullable<StepReach['readOnly']>;
};

/** The Claude Code steps of `stepsOf`, by `<workflow>/<step>`, each asserted to carry what was measured of it. */
const claudeStepsOf = async (repo: string): Promise<Record<string, Measured>> => {
  const claude = Object.entries(await stepsOf(repo)).filter(([, step]) => step.claudeCode);
  return Object.fromEntries(
    claude.map(([name, step]) => {
      const { tools, skills, mcp, readOnly } = step;
      assert.ok(tools && skills && mcp && readOnly, `${name} is on Claude Code, whose set was measured: ${JSON.stringify(step)}`);
      return [name, { ...step, tools, skills, mcp, readOnly }];
    }),
  );
};

const SETTINGS = '.claude/settings.json';

/**
 * A Bash allow rule standing as the page gives it: its command, the narrower denies that still refuse some of it, and the ask rules that
 * make some of it ask.
 */
const bashRule = (rule: string, except: string[] = [], asks: string[] = []) => ({
  rule,
  command: rule.slice('Bash('.length, -1),
  except,
  asks,
});

/**
 * Nothing of the settings taken back or out of reach, and no reason for no Bash: what `allowed` has beside `rules` and `bash` on a plain
 * step.
 */
const nothingElse = { takenBack: [], asked: [], unused: [], exceptions: [], why: null };

test("a step with `tools:` gets exactly those — no skill without Skill, the tools of each server the checkout enables, and the settings' deny", async () => {
  const { 'dev/review': review } = await claudeStepsOf(stepsRepo());
  assert.deepEqual(
    review.fence,
    {
      tools: ['Read', 'Grep', 'Glob', 'Bash'],
      disallowedTools: [],
      allowedTools: ['Edit(**)'],
      permissionMode: 'dontAsk',
      sandbox: null,
      effort: 'high',
      mcp: ['fixture'],
    },
    'its `allowedTools:` among them: in dontAsk what a rule allows is the difference between a step that can do its work and one that cannot',
  );
  assert.deepEqual(review.tools, { from: 'declared', names: ['Read', 'Grep', 'Glob', 'Bash'], inferred: [], removed: [] });
  assert.equal(review.claudeCode, true);
  assert.deepEqual(review.skills.names, []);
  assert.match(review.skills.why ?? '', /^Its tools have no `Skill`, so it cannot load a skill/);
  assert.deepEqual(review.denied, [
    { rule: 'Bash(git push:*)', source: SETTINGS },
    { rule: 'mcp__fixture__wipe', source: SETTINGS },
  ]);
  assert.deepEqual(
    review.mcp.map((s: { server: string }) => s.server),
    ['fixture'],
  );
});

test('a step reaches the servers its agent names and no other: none for a step with no agent, and a name the checkout does not declare said with why', async () => {
  const repo = repoWith({
    '.claude/settings.json': { enabledMcpjsonServers: ['fixture', 'other'] },
    '.mcp.json': { mcpServers: { fixture: fixture(), other: fixture() } },
    'workflows/dev/bare.md': '---\nplace: git\nharness: claude\n---\nDo it.\n',
    'workflows/dev/quiet.md': '---\nplace: git\nagent: quiet\n---\nDo it.\n',
    'workflows/dev/one.md': '---\nplace: git\nagent: one\n---\nDo it.\n',
    'workflows/dev/lost.md': '---\nplace: git\nagent: lost\n---\nDo it.\n',
    'workflows/agents/quiet.md': '---\nharness: claude\n---\nYou work.\n',
    'workflows/agents/one.md': '---\nharness: claude\nmcp: other\n---\nYou work.\n',
    'workflows/agents/lost.md': '---\nharness: claude\nmcp: fixture, ghost\n---\nYou work.\n',
  });
  const steps = await claudeStepsOf(repo);
  const servers = (step: string) => steps[`dev/${step}`].mcp.map((s) => s.server);
  assert.deepEqual([steps['dev/bare'].fence.mcp, servers('bare')], [[], []], 'a step with no agent loads no server');
  assert.deepEqual([steps['dev/quiet'].fence.mcp, servers('quiet')], [[], []], 'nor does one whose agent names none');
  assert.deepEqual([steps['dev/one'].fence.mcp, servers('one')], [['other'], ['other']], 'one of the two the checkout enables');
  assert.ok(steps['dev/one'].mcp[0].tools?.length, 'with the tools it listed');
  assert.deepEqual(steps['dev/lost'].fence.mcp, ['fixture', 'ghost']);
  assert.deepEqual(servers('lost'), ['fixture', 'ghost']);
  assert.deepEqual(steps['dev/lost'].mcp[1], {
    server: 'ghost',
    tools: null,
    why: "The checkout's .mcp.json declares no server named ghost: a session of this step is refused at its start. Declare the server there, or take the name off the `mcp:` line that names it, the step's or its agent's.",
  });
});

test('a server an agent names that the settings do not enable is still a row of its step, with why its tools are not listed and that it is loaded', async () => {
  const repo = repoWith({
    '.claude/settings.json': { enabledMcpjsonServers: ['fixture'] },
    '.mcp.json': { mcpServers: { fixture: fixture(), other: fixture() } },
    'workflows/dev/one.md': '---\nplace: git\nagent: one\n---\nDo it.\n',
    'workflows/agents/one.md': '---\nharness: claude\nmcp: other\n---\nYou work.\n',
  });
  const one = (await claudeStepsOf(repo))['dev/one'];
  assert.deepEqual(one.fence.mcp, ['other']);
  assert.equal(one.mcp.length, 1, JSON.stringify(one.mcp));
  assert.deepEqual([one.mcp[0].server, one.mcp[0].tools], ['other', null]);
  assert.match(one.mcp[0].why ?? '', /^Not enabled by .*enabledMcpjsonServers.* A session of this step loads it all the same: /);
  assert.ok(
    one.mcp[0].why?.endsWith(" an `mcp:` line, its own or its agent's, names it, and the settings are not asked."),
    one.mcp[0].why ?? '',
  );
});

test('a server a step names itself, over an agent that names none, is a row of that step alone; and in dontAsk, with nothing allowed, each of its tools is not allowed', async () => {
  const repo = repoWith({
    '.claude/settings.json': { enabledMcpjsonServers: ['fixture'] },
    '.mcp.json': { mcpServers: { fixture: fixture() } },
    'workflows/dev/named.md': '---\nplace: git\nagent: quiet\npermissionMode: dontAsk\nmcp: fixture\n---\nDo it.\n',
    'workflows/dev/unnamed.md': '---\nplace: git\nagent: quiet\npermissionMode: dontAsk\n---\nDo it.\n',
    'workflows/agents/quiet.md': '---\nharness: claude\n---\nYou work.\n',
  });
  const { 'dev/named': named, 'dev/unnamed': unnamed } = await claudeStepsOf(repo);
  assert.deepEqual([unnamed.fence.mcp, unnamed.mcp], [[], []], 'the step that names none loads none');
  assert.deepEqual([named.fence.mcp, named.mcp.map((s) => s.server)], [['fixture'], ['fixture']]);
  assert.deepEqual(
    named.mcp[0].tools?.map((t: { name: string; allowed: boolean }) => [t.name, t.allowed]),
    [
      ['echo', false],
      ['wipe', false],
    ],
    'loading a server allows none of its tools',
  );
  assert.deepEqual(named.allowed, unnamed.allowed, 'naming it allows nothing the other step is not allowed');
});

test("a step without `tools:` gets the harness's own set — what was measured, with its date and version and never claimed current, and what was only inferred marked so — and every skill, with Skill in it", async () => {
  const body = (await served(stepsRepo())).body;
  assert.deepEqual(
    { harness: body.measured.harness, version: body.measured.version, measuredAt: body.measured.measuredAt },
    { harness: 'Claude Code', version: '2.1.270', measuredAt: '2026-09-14' },
  );
  assert.match(body.measured.source, /what a worker gets, measured/);
  for (const { name, why } of body.measured.inferred) assert.ok(why.length > 0, `${name} says why it is inferred`);
  const implement = body.steps.find((s) => s.step === 'implement');
  assert.ok(implement?.tools, JSON.stringify(implement));
  assert.equal(implement.tools.from, 'measured');
  const inferred = MEASURED_TOOLS.inferred.map((t: { name: string }) => t.name);
  assert.deepEqual(
    implement.tools.names,
    [...MEASURED_TOOLS.tools, ...inferred].filter((name: string) => name !== 'SendMessage'),
    'its own set, less the one tool its `disallowedTools:` names whole',
  );
  assert.deepEqual(implement.tools.inferred, inferred, 'and which of what it has were inferred');
  assert.deepEqual(implement.skills, { names: ['code-review'], why: null });
  assert.deepEqual(implement.fence, {
    tools: null,
    disallowedTools: ['SendMessage', 'CronCreate', 'mcp__fixture__echo', 'Bash(npm run build)'],
    allowedTools: [],
    permissionMode: null,
    sandbox: null,
    effort: null,
    mcp: ['fixture'],
  });
});

/** The `names` the ledger's `bullet` does not write as a tool of its own, in backticks of their own. */
const unnamedIn = (bullet: string, names: readonly string[]): string[] => names.filter((name) => !bullet.includes(`\`${name}\``));

test("REFUSED: the measured set holds only what the ledger's measurement names, as a tool of its own — a tool it does not name is inferred, with why, or not there", () => {
  const plan = fs.readFileSync(path.join(HOME_REPO, 'docs', 'plan-hold-the-bar.md'), 'utf8');
  const at = plan.indexOf('- **what a worker gets, measured');
  assert.ok(at >= 0, 'the ledger has the bullet MEASURED_TOOLS cites');
  const next = plan.indexOf('\n- **', at + 1);
  const bullet = plan.slice(at, next < 0 ? undefined : next);
  assert.ok(bullet.includes(MEASURED_TOOLS.measuredAt), 'measured on the day the bullet says');
  const unnamed = (names: readonly string[]) => unnamedIn(bullet, names);
  assert.deepEqual(unnamed(MEASURED_TOOLS.tools), []);
  assert.deepEqual(unnamed(MEASURED_TOOLS.lacks), []);
  assert.deepEqual(
    unnamed([...MEASURED_TOOLS.tools, 'Edit', 'Bash']),
    ['Edit', 'Bash'],
    "refused: Edit, which the bullet never names, and Bash, which it names only in the fenced reviewer's list — each would read as measured",
  );
  const inferred = MEASURED_TOOLS.inferred.map((t: { name: string }) => t.name);
  assert.deepEqual(
    inferred.filter((name: string) => (MEASURED_TOOLS.tools as readonly string[]).includes(name)),
    [],
    'no tool is both measured and inferred',
  );
});

test("REFUSED: `disallow` takes away — a tool, one of a family, a server's tool — and a command it denies is not allowed, though the settings allow it", async () => {
  const { 'dev/implement': implement, 'dev/review': review } = await claudeStepsOf(stepsRepo());
  assert.ok(!implement.tools.names.includes('SendMessage'), 'SendMessage is not among its tools');
  assert.deepEqual(
    implement.tools.removed,
    [
      { name: 'SendMessage', rule: 'SendMessage', source: DISALLOW, of: null },
      { name: 'CronCreate', rule: 'CronCreate', source: DISALLOW, of: 'Cron*' },
    ],
    'CronCreate, one of a family the measurement names as one, is named as taken',
  );
  assert.ok(implement.tools.names.includes('Cron*'), 'and the family stays');
  assert.deepEqual(implement.mcp[0].tools, [
    { name: 'echo', denied: { rule: 'mcp__fixture__echo', source: DISALLOW }, asks: null, allowed: false },
    { name: 'wipe', denied: { rule: 'mcp__fixture__wipe', source: SETTINGS }, asks: null, allowed: false },
  ]);
  assert.deepEqual(
    implement.allowed,
    {
      rules: ['Bash(npm test)', 'Bash(git diff:*)', 'WebSearch'],
      takenBack: [{ rule: 'Bash(npm run build)', by: { rule: 'Bash(npm run build)', source: DISALLOW } }],
      asked: [],
      unused: [],
      bash: [bashRule('Bash(npm test)'), bashRule('Bash(git diff:*)')],
      exceptions: [],
      dontAsk: false,
      askDenier: 'a job',
      why: null,
    },
    'a deny beats an allow: `npm run build` is allowed by the settings, and denied by the step',
  );
  assert.deepEqual(
    implement.denied.slice(2).map((d: { rule: string }) => d.rule),
    ['SendMessage', 'CronCreate', 'mcp__fixture__echo', 'Bash(npm run build)'],
  );
  assert.ok(
    review.allowed.bash.some((b: { command: string }) => b.command === 'npm run build'),
    'none of it reaches the step beside it, which denies nothing of its own',
  );
  assert.equal(review.mcp[0].tools?.[0]?.denied, null, "nor its server's tool");
});

test("a `dontAsk` step under the settings shows what Bash commands are allowed — and an allow of a tool it does not have is not among them — and a server's tool no rule allows runs no more than a denied one", async () => {
  const { 'dev/review': review, 'dev/implement': implement } = await claudeStepsOf(stepsRepo());
  assert.deepEqual(
    review.allowed,
    {
      rules: ['Bash(npm test)', 'Bash(git diff:*)', 'Bash(npm run build)'],
      takenBack: [],
      asked: [],
      unused: ['WebSearch'],
      bash: [bashRule('Bash(npm test)'), bashRule('Bash(git diff:*)'), bashRule('Bash(npm run build)')],
      exceptions: [],
      dontAsk: true,
      askDenier: 'dontAsk',
      why: null,
    },
    'the allow of WebSearch is unused: `--tools` gives the step exactly Read, Grep, Glob and Bash',
  );
  assert.deepEqual(review.mcp[0].tools, [
    { name: 'echo', denied: null, asks: null, allowed: false },
    { name: 'wipe', denied: { rule: 'mcp__fixture__wipe', source: SETTINGS }, asks: null, allowed: false },
  ]);
  assert.equal(implement.allowed.dontAsk, false, 'a step in no mode is not dontAsk');
});

test("a Bash rule covers another as Claude Code matches them: `*` any text, spaces included; `:*` a trailing ` *`, which matches the bare command too; no `*`, one command — the permissions docs' own examples, a colon anywhere but the end a colon, and a rule against a rule covering every command of the inner one", () => {
  const cases: Array<[outer: string, inner: string, covers: boolean]> = [
    ['ls *', 'ls -la', true],
    ['ls *', 'ls', true],
    ['ls *', 'lsof', false],
    ['ls*', 'lsof', true],
    ['ls:*', 'ls -la', true],
    ['git log *', 'git log', true],
    ['* --help *', 'npm --help x', true],
    ['* --help *', 'npm --help', false],
    ['git:* push', 'git push', false],
    ['git:* push', 'git:x push', true],
    ['git:*', 'git diff:*', true],
    ['git diff:*', 'git:*', false],
    ['npm run:*', 'npm run build', true],
    ['npm run build', 'npm run:*', false],
    ['npm test *', 'npm test', true],
    ['npm test', 'npm test *', false],
    ['npm run build', 'npm run build', true],
    ['npx turbo run test:*', 'npx turbo run test build', true],
    ['npx turbo run test build', 'npx turbo run test:*', false],
    ['git *', 'git log *', true],
    ['git log *', 'git *', false],
  ];
  for (const [outer, inner, covers] of cases) assert.equal(bashCovers(outer, inner), covers, `${outer} covers ${inner}: ${covers}`);
});

test('REFUSED: a deny takes back every allow whose commands it matches, however narrow the allow — a prefix, a bare command, the tool whole — and a narrower deny is an exception to the allow it falls in', async () => {
  const repo = repoWith({
    '.claude/settings.json': {
      permissions: {
        deny: ['Bash(git:*)', 'Bash(npm test *)', 'Bash(ls *)', 'Bash(npx turbo run test build)'],
        allow: [
          'Bash(npm run build)',
          'Bash(git diff:*)',
          'Bash(git log)',
          'Bash(npm test)',
          'Bash(lsof)',
          'Bash(npx turbo run test:*)',
          'Bash(node --version)',
        ],
      },
    },
    'workflows/dev/review.md':
      '---\nplace: git\nharness: claude\ntools: Read, Bash\npermissionMode: dontAsk\ndisallowedTools: Bash(npm run:*)\n---\nReview it.\n',
    'workflows/dev/shut.md':
      '---\nplace: git\nharness: claude\ntools: Read, Bash\npermissionMode: dontAsk\ndisallowedTools: Bash(*)\n---\nRead it.\n',
  });
  const { 'dev/review': review, 'dev/shut': shut } = await claudeStepsOf(repo);
  const settings = (rule: string) => ({ rule, source: SETTINGS });
  assert.deepEqual(
    review.allowed.takenBack,
    [
      { rule: 'Bash(npm run build)', by: { rule: 'Bash(npm run:*)', source: DISALLOW } },
      { rule: 'Bash(git diff:*)', by: settings('Bash(git:*)') },
      { rule: 'Bash(git log)', by: settings('Bash(git:*)') },
      { rule: 'Bash(npm test)', by: settings('Bash(npm test *)') },
    ],
    "a prefix deny of the step's own takes back a narrower allow of the settings, and a trailing ` *` matches the bare command too",
  );
  assert.deepEqual(
    review.allowed.rules,
    ['Bash(lsof)', 'Bash(npx turbo run test:*)', 'Bash(node --version)'],
    '`ls *` needs a space after ls, so lsof stands',
  );
  assert.deepEqual(review.allowed.bash, [
    bashRule('Bash(lsof)'),
    bashRule('Bash(npx turbo run test:*)', ['Bash(npx turbo run test build)']),
    bashRule('Bash(node --version)'),
  ]);
  assert.deepEqual(review.allowed.exceptions, [
    { rule: 'Bash(npx turbo run test:*)', except: ['Bash(npx turbo run test build)'], asks: [] },
  ]);
  assert.ok(
    !review.allowed.bash.some((b: { command: string }) => ['npm run build', 'git diff:*', 'git log', 'npm test'].includes(b.command)),
    'no command a deny refuses is one it may run',
  );

  assert.deepEqual(
    shut.tools.removed,
    [{ name: 'Bash', rule: 'Bash(*)', source: DISALLOW, of: null }],
    '`Bash(*)` is `Bash`: the tool is removed',
  );
  assert.deepEqual(shut.allowed.bash, [], 'no command listed');
  assert.equal(shut.allowed.takenBack.length, 7, 'every Bash allow taken back');
  assert.ok(shut.allowed.takenBack.every((t) => t.by.rule === 'Bash(*)' || t.by.source === SETTINGS));
  assert.equal(
    shut.allowed.why,
    '`Bash` is denied by Bash(*) (disallowedTools:), so it runs no command, whatever the settings allow.',
    'with why',
  );
});

test('REFUSED: a `dontAsk` step without Bash runs no command, whatever the settings allow — its tools have none, or a deny names it — and says why', async () => {
  const repo = repoWith({
    '.claude/settings.json': { permissions: { allow: ['Bash(npm test)', 'Bash(git diff:*)', 'Read'] } },
    'workflows/dev/reader.md': '---\nplace: git\nharness: claude\ntools: Read, Grep\npermissionMode: dontAsk\n---\nRead it.\n',
    'workflows/dev/denied.md': '---\nplace: git\nharness: claude\npermissionMode: dontAsk\ndisallowedTools: Bash\n---\nRead it.\n',
  });
  const { 'dev/reader': reader, 'dev/denied': denied } = await claudeStepsOf(repo);
  assert.deepEqual(reader.allowed, {
    rules: ['Read'],
    takenBack: [],
    asked: [],
    unused: ['Bash(npm test)', 'Bash(git diff:*)'],
    bash: [],
    exceptions: [],
    dontAsk: true,
    askDenier: 'dontAsk',
    why: 'Its tools have no `Bash`, so it runs no command, whatever the settings allow.',
  });
  assert.ok(!denied.tools.names.includes('Bash'), 'the measured set, less the Bash its disallowedTools: names whole');
  assert.deepEqual(denied.allowed.bash, []);
  assert.deepEqual(
    denied.allowed.takenBack.map((t: { rule: string }) => t.rule),
    ['Bash(npm test)', 'Bash(git diff:*)'],
  );
  assert.equal(denied.allowed.why, '`Bash` is denied by Bash (disallowedTools:), so it runs no command, whatever the settings allow.');
});

test('a Codex step shows its fence, and nothing it was not measured to get or does not read: no tools, skills, servers, or rules of the settings', async () => {
  const { 'codexed/plan': plan } = await stepsOf(stepsRepo());
  assert.deepEqual(
    [plan.harness, plan.claudeCode, plan.tools, plan.skills, plan.mcp, plan.denied, plan.asked],
    ['codex', false, null, null, null, [], []],
  );
  assert.deepEqual(plan.fence, {
    tools: null,
    disallowedTools: [],
    allowedTools: [],
    permissionMode: null,
    sandbox: 'read-only',
    effort: null,
    mcp: [],
  });
  assert.deepEqual(plan.allowed, {
    rules: [],
    takenBack: [],
    asked: [],
    unused: [],
    bash: [],
    exceptions: [],
    dontAsk: false,
    askDenier: null,
    why: 'codex reads no .claude/settings.json, so none of its rules is claimed for this step.',
  });
});

test('a workflow the loader refuses has no step on the page, and a repository with a workflow and nothing else still says what its step gets', async () => {
  const repo = repoWith({
    'workflows/broken/review.md': '---\nplace: git\nafer: implement\n---\nReview it.\n',
    'workflows/lone/implement.md': '---\nplace: git\n---\nImplement it.\n',
  });
  const steps = await stepsOf(repo);
  assert.deepEqual(Object.keys(steps), ['lone/implement']);
  assert.deepEqual(
    [steps['lone/implement'].harness, steps['lone/implement'].tools?.from, steps['lone/implement'].mcp, steps['lone/implement'].allowed],
    ['claude', 'measured', [], { rules: [], bash: [], dontAsk: false, askDenier: 'a job', ...nothingElse }],
    "no harness named is the engine's first, Claude Code; no settings, nothing denied or allowed; no .mcp.json, no server",
  );
});

test('REFUSED: a deny of a whole MCP server takes back an allow of one of its tools, or of all of them — as its tools row reads the deny — and a deny of one tool is an exception to an allow of the server', async () => {
  const repo = repoWith({
    '.claude/settings.json': {
      enabledMcpjsonServers: ['fixture'],
      permissions: {
        allow: ['mcp__fixture__echo', 'mcp__fixture', 'mcp__other__x', 'mcp__third__*'],
        deny: ['mcp__third__wipe', 'mcp__other__*'],
      },
    },
    '.mcp.json': { mcpServers: { fixture: fixture() } },
    'workflows/dev/shut.md': '---\nplace: git\nagent: reader\nharness: claude\ndisallowedTools: mcp__fixture\n---\nWork.\n',
    'workflows/dev/open.md': '---\nplace: git\nagent: reader\nharness: claude\n---\nWork.\n',
    'workflows/agents/reader.md': '---\nmcp: fixture\n---\nYou read.\n',
  });
  const { 'dev/shut': shut, 'dev/open': open } = await claudeStepsOf(repo);
  const settings = (rule: string) => ({ rule, source: SETTINGS });
  const disallowed = { rule: 'mcp__fixture', source: DISALLOW };
  assert.deepEqual(
    shut.allowed.takenBack,
    [
      { rule: 'mcp__fixture__echo', by: disallowed },
      { rule: 'mcp__fixture', by: disallowed },
      { rule: 'mcp__other__x', by: settings('mcp__other__*') },
    ],
    'mcp__<server>__* is every tool of the server, as mcp__<server> is',
  );
  assert.deepEqual(shut.allowed.rules, ['mcp__third__*']);
  assert.deepEqual(
    shut.mcp[0].tools?.find((t: { name: string }) => t.name === 'echo'),
    { name: 'echo', denied: disallowed, asks: null, allowed: false },
    'its tools row and its allow rules say the same of echo: denied, and not allowed',
  );
  assert.deepEqual(
    shut.allowed.exceptions,
    [{ rule: 'mcp__third__*', except: ['mcp__third__wipe'], asks: [] }],
    'a deny of one tool leaves an allow of the whole server standing, with that exception',
  );

  assert.deepEqual(
    open.allowed.takenBack,
    [{ rule: 'mcp__other__x', by: settings('mcp__other__*') }],
    "the step beside it denies nothing of its own: only the settings' whole-server deny takes anything back",
  );
  assert.deepEqual(
    open.mcp[0].tools?.find((t: { name: string }) => t.name === 'echo'),
    { name: 'echo', denied: null, asks: null, allowed: true },
    'and echo is allowed there',
  );
});

/**
 * Every read-only command as a step with Bash and no deny or ask rule of them gets it: the measured ones first, then what the docs name.
 */
const readOnlyAll = () => [
  ...READ_ONLY_COMMANDS.measured.map((command: string) => ({ command, measured: true, denied: null, asks: null })),
  ...READ_ONLY_COMMANDS.documented.map((command: string) => ({ command, measured: false, denied: null, asks: null })),
];

test("a step with Bash runs Claude Code's read-only commands with no rule, in dontAsk or not — dated, what was measured apart from what is only documented — and a step without Bash, or on Codex, none", async () => {
  const body = (await served(stepsRepo())).body;
  assert.deepEqual(
    { harness: body.readOnly.harness, version: body.readOnly.version, measuredAt: body.readOnly.measuredAt },
    { harness: 'Claude Code', version: '2.1.272', measuredAt: '2026-09-15' },
  );
  const steps = Object.fromEntries(body.steps.map((s) => [`${s.workflow}/${s.step}`, s]));
  assert.deepEqual(
    steps['dev/review'].readOnly,
    readOnlyAll(),
    "the settings deny git push:*, which is not every git command: git's read-only forms still run",
  );
  assert.equal(steps['dev/review'].allowed.dontAsk, true);
  assert.deepEqual(steps['dev/implement'].readOnly, readOnlyAll());
  assert.equal(steps['codexed/plan'].readOnly, null, 'nothing of a Codex session was measured');
  const repo = repoWith({
    'workflows/dev/reader.md': '---\nplace: git\nharness: claude\ntools: Read, Grep\npermissionMode: dontAsk\n---\nRead it.\n',
    'workflows/dev/denied.md': '---\nplace: git\nharness: claude\npermissionMode: dontAsk\ndisallowedTools: Bash(*)\n---\nRead it.\n',
  });
  const { 'dev/reader': reader, 'dev/denied': denied } = await claudeStepsOf(repo);
  assert.deepEqual(reader.readOnly, [], 'its tools have no Bash');
  assert.deepEqual(denied.readOnly, [], 'a deny takes Bash whole');
});

test('REFUSED: a deny that covers a read-only command refuses it — a prefix, a pattern, every git command — and one narrower than the command does not take all of it', async () => {
  const repo = repoWith({
    '.claude/settings.json': { permissions: { deny: ['Bash(cat:*)', 'Bash(git push:*)', 'Bash(head -c *)'] } },
    'workflows/dev/review.md':
      '---\nplace: git\nharness: claude\ntools: Read, Bash\npermissionMode: dontAsk\ndisallowedTools: Bash(find *), Bash(git:*), Bash(ls -la)\n---\nReview it.\n',
  });
  const { 'dev/review': review } = await claudeStepsOf(repo);
  const refused = Object.fromEntries(
    review.readOnly.filter((c: { denied: unknown }) => c.denied).map((c: { command: string; denied: unknown }) => [c.command, c.denied]),
  );
  assert.deepEqual(refused, {
    cat: { rule: 'Bash(cat:*)', source: SETTINGS },
    find: { rule: 'Bash(find *)', source: DISALLOW },
    git: { rule: 'Bash(git:*)', source: DISALLOW },
  });
  for (const command of ['head', 'ls', 'grep'])
    assert.equal(
      review.readOnly.find((c: { command: string }) => c.command === command)?.denied,
      null,
      `${command}: head -c *, git push:* and ls -la each refuse part of a command, which still runs the rest without a rule`,
    );
  assert.equal(review.readOnly.length, readOnlyAll().length, 'a command refused is marked, not dropped');
});

test('the ask list is permissions.ask in .claude/settings.json, in its order — and one that is not a list of strings is a warning, read as empty', async () => {
  const { body } = await served(
    repoWith({ '.claude/settings.json': { permissions: { ask: ['Bash(cat:*)', 'mcp__fixture__echo'], deny: ['Bash(git push:*)'] } } }),
  );
  assert.deepEqual(body.asked, [
    { rule: 'Bash(cat:*)', source: SETTINGS },
    { rule: 'mcp__fixture__echo', source: SETTINGS },
  ]);
  assert.deepEqual(body.warnings, []);
  const broken = (await served(repoWith({ '.claude/settings.json': { permissions: { ask: 'Bash(cat:*)' } } }))).body;
  assert.deepEqual(broken.asked, []);
  assert.deepEqual(broken.warnings, [
    'permissions.ask in .claude/settings.json is not a list of strings, so it is read as empty. Make it one: `["…"]`.',
  ]);
});

/**
 * A checkout whose settings may ask: review in dontAsk with Bash, implement in no mode with Bash — a job, as every step is but one that
 * says `background: true` — and watch, a background session in no mode with Bash, the one of the three a call that asks is put to a person
 * on.
 */
const askingRepo = (permissions: object) =>
  repoWith({
    '.claude/settings.json': { permissions },
    'workflows/dev/review.md': '---\nplace: git\nharness: claude\ntools: Read, Bash\npermissionMode: dontAsk\n---\nReview it.\n',
    'workflows/dev/implement.md': '---\nplace: git\nharness: claude\ntools: Read, Bash\n---\nImplement it.\n',
    'workflows/dev/watch.md': '---\nplace: git\nharness: claude\ntools: Read, Bash\nbackground: true\n---\nWatch it.\n',
  });

test('REFUSED: an ask rule that covers a read-only command makes it ask — denied on a dontAsk step and on a job, asking on a background session — and a deny over it is still the deny', async () => {
  const cat = { rule: 'Bash(cat:*)', source: SETTINGS };
  const {
    'dev/review': review,
    'dev/implement': implement,
    'dev/watch': watch,
  } = await claudeStepsOf(askingRepo({ ask: ['Bash(cat:*)'] }));
  const of = (step: { readOnly: Array<{ command: string }> }, command: string) => step.readOnly.find((c) => c.command === command);
  assert.deepEqual(
    of(review, 'cat'),
    { command: 'cat', measured: true, denied: cat, asks: cat },
    'on a dontAsk step, cat under an ask rule is denied, never shown as running without a prompt',
  );
  assert.deepEqual(
    of(implement, 'cat'),
    { command: 'cat', measured: true, denied: cat, asks: cat },
    'a job asks nobody: claude -p denies what would ask and carries on',
  );
  assert.deepEqual([review.allowed.askDenier, implement.allowed.askDenier, watch.allowed.askDenier], ['dontAsk', 'a job', null]);
  assert.deepEqual(
    of(watch, 'cat'),
    { command: 'cat', measured: true, denied: null, asks: cat },
    'a background session in no mode asks a person: there cat asks, and is not denied',
  );
  assert.deepEqual(review.asked, [cat]);
  for (const step of [review, implement, watch]) {
    assert.deepEqual(
      step.readOnly.filter((c: { command: string }) => c.command !== 'cat'),
      readOnlyAll().filter((c) => c.command !== 'cat'),
      'no other command asks',
    );
  }

  const plain = await claudeStepsOf(askingRepo({}));
  assert.deepEqual(plain['dev/review'].readOnly, readOnlyAll(), 'with no ask rule, every read-only command runs with no rule');
  assert.deepEqual(plain['dev/implement'].readOnly, readOnlyAll(), 'on both steps');
  assert.deepEqual(plain['dev/review'].asked, []);

  const whole = (await claudeStepsOf(askingRepo({ ask: ['Bash'] })))['dev/review'];
  assert.ok(
    whole.readOnly.every(
      (c: { denied: { rule: string } | null; asks: { rule: string } | null }) => c.asks?.rule === 'Bash' && c.denied?.rule === 'Bash',
    ),
    `an ask rule naming Bash whole makes every command ask: ${JSON.stringify(whole.readOnly)}`,
  );
  assert.ok(whole.tools.names.includes('Bash'), 'an ask rule removes no tool: only a deny does');
  const mixed = (await claudeStepsOf(askingRepo({ ask: ['Bash(head -c *)', 'Bash(git:*)'], deny: ['Bash(git:*)'] })))['dev/review'];
  assert.deepEqual(
    of(mixed, 'head'),
    { command: 'head', measured: true, denied: null, asks: null },
    'an ask rule narrower than a command does not take all of it',
  );
  assert.deepEqual(
    of(mixed, 'git'),
    { command: 'git', measured: false, denied: { rule: 'Bash(git:*)', source: SETTINGS }, asks: null },
    'a deny comes before an ask',
  );
});

test('what asks is denied without a prompt in dontAsk, and on a job in each mode a job was measured in; it prompts on a background session in another mode, and a job in bypassPermissions is claimed neither way', () => {
  const cases: Array<[harness: string, permissionMode: string | null, background: boolean | null, denier: string | null]> = [
    ['claude', 'dontAsk', true, 'dontAsk'],
    ['claude', 'dontAsk', null, 'dontAsk'],
    ['claude', null, null, 'a job'],
    ['claude', 'auto', false, 'a job'],
    ['claude', 'default', null, 'a job'],
    ['claude', 'acceptEdits', null, 'a job'],
    ['claude-detached', 'auto', null, 'a job'],
    ['claude', 'auto', true, null],
    ['claude', null, true, null],
    ['claude', 'bypassPermissions', null, null],
  ];
  for (const [harness, permissionMode, background, denier] of cases) {
    assert.equal(askDenierOf(harness, { permissionMode, background }), denier, `${harness} ${permissionMode} background: ${background}`);
  }
});

test('REFUSED: an ask rule takes back every allow it matches the whole of, as a deny does, and a narrower one is an exception — the allow asks there, and in dontAsk runs no more — while a deny comes first', async () => {
  const repo = askingRepo({
    ask: [
      'Bash(git:*)',
      'Bash(npx turbo run test build)',
      'Bash(npm test)',
      'Bash(npx turbo run test e2e)',
      'Bash(npx turbo run test lint --fix)',
    ],
    deny: ['Bash(npm test)', 'Bash(npx turbo run test e2e)', 'Bash(npx turbo run test lint:*)'],
    allow: ['Bash(git diff:*)', 'Bash(npx turbo run test:*)', 'Bash(npm test)', 'Bash(node --version)'],
  });
  const { 'dev/review': review, 'dev/implement': implement } = await claudeStepsOf(repo);
  for (const step of [review, implement]) {
    assert.deepEqual(
      step.allowed.takenBack,
      [{ rule: 'Bash(npm test)', by: { rule: 'Bash(npm test)', source: SETTINGS } }],
      'the deny, not the ask rule',
    );
    assert.deepEqual(step.allowed.asked, [{ rule: 'Bash(git diff:*)', by: { rule: 'Bash(git:*)', source: SETTINGS } }]);
    assert.deepEqual(step.allowed.rules, ['Bash(npx turbo run test:*)', 'Bash(node --version)']);
    const except = ['Bash(npx turbo run test e2e)', 'Bash(npx turbo run test lint:*)'];
    assert.deepEqual(
      step.allowed.bash,
      [bashRule('Bash(npx turbo run test:*)', except, ['Bash(npx turbo run test build)']), bashRule('Bash(node --version)')],
      'a narrower ask rule a deny covers — the same words, or a wider deny — never asks: the deny comes first, and is said as the deny alone',
    );
    assert.deepEqual(step.allowed.exceptions, [{ rule: 'Bash(npx turbo run test:*)', except, asks: ['Bash(npx turbo run test build)'] }]);
  }
  assert.ok(
    !review.allowed.bash.some((b: { command: string }) => b.command === 'git diff:*'),
    'a dontAsk step is not shown running what asks',
  );
});

test("REFUSED: an ask rule over a server's tool makes it ask — not allowed, though an allow of the server covers it — and is an exception to that allow; a deny of it comes first", async () => {
  const repo = repoWith({
    '.claude/settings.json': {
      enabledMcpjsonServers: ['fixture'],
      permissions: { allow: ['mcp__fixture'], ask: ['mcp__fixture__echo', 'mcp__fixture__wipe'], deny: ['mcp__fixture__wipe'] },
    },
    '.mcp.json': { mcpServers: { fixture: fixture() } },
    'workflows/dev/review.md': '---\nplace: git\nagent: reader\nharness: claude\npermissionMode: dontAsk\n---\nReview it.\n',
    'workflows/agents/reader.md': '---\nmcp: fixture\n---\nYou read.\n',
  });
  const { 'dev/review': review } = await claudeStepsOf(repo);
  assert.deepEqual(review.mcp[0].tools, [
    { name: 'echo', denied: null, asks: { rule: 'mcp__fixture__echo', source: SETTINGS }, allowed: false },
    { name: 'wipe', denied: { rule: 'mcp__fixture__wipe', source: SETTINGS }, asks: null, allowed: false },
  ]);
  assert.deepEqual(review.allowed.rules, ['mcp__fixture']);
  assert.deepEqual(
    review.allowed.exceptions,
    [{ rule: 'mcp__fixture', except: ['mcp__fixture__wipe'], asks: ['mcp__fixture__echo'] }],
    'wipe is denied, which comes first: it never asks, so only echo is an ask beside the allow',
  );
  const whole = repoWith({
    '.claude/settings.json': { enabledMcpjsonServers: ['fixture'], permissions: { allow: ['mcp__fixture__echo'], ask: ['mcp__fixture'] } },
    '.mcp.json': { mcpServers: { fixture: fixture() } },
    'workflows/dev/review.md': '---\nplace: git\nagent: reader\nharness: claude\npermissionMode: dontAsk\n---\nReview it.\n',
    'workflows/agents/reader.md': '---\nmcp: fixture\n---\nYou read.\n',
  });
  const { 'dev/review': asked } = await claudeStepsOf(whole);
  assert.deepEqual(
    asked.allowed.asked,
    [{ rule: 'mcp__fixture__echo', by: { rule: 'mcp__fixture', source: SETTINGS } }],
    'an ask rule of the whole server takes the allow back',
  );
  assert.deepEqual(
    asked.mcp[0].tools?.map((t: { name: string; allowed: boolean }) => [t.name, t.allowed]),
    [
      ['echo', false],
      ['wipe', false],
    ],
  );
});

test("the read-only commands are data of the day they were measured: the list's shape and its date pinned, and settings that allow some of them change nothing of it", async () => {
  assert.deepEqual(Object.keys(READ_ONLY_COMMANDS), ['harness', 'version', 'measuredAt', 'source', 'measured', 'documented', 'docs']);
  assert.deepEqual(
    { harness: READ_ONLY_COMMANDS.harness, version: READ_ONLY_COMMANDS.version, measuredAt: READ_ONLY_COMMANDS.measuredAt },
    { harness: 'Claude Code', version: '2.1.272', measuredAt: '2026-09-15' },
  );
  assert.deepEqual(READ_ONLY_COMMANDS.measured, ['cat', 'grep', 'head', 'ls', 'tail']);
  assert.equal(readOnlyCommands('READ_ONLY_COMMANDS', READ_ONLY_COMMANDS), READ_ONLY_COMMANDS, 'the shipped list passes its own guard');
  assert.equal(dated('MEASURED_TOOLS', MEASURED_TOOLS), MEASURED_TOOLS);

  const repo = askingRepo({ allow: ['Bash(ls:*)', 'Bash(cat:*)'] });
  const { body } = await served(repo);
  assert.deepEqual(
    body.readOnly,
    READ_ONLY_COMMANDS,
    "under settings that allow ls and cat, the measurement, taken under that day's settings, is served as it is",
  );
  const review = body.steps.find((s) => s.step === 'review');
  assert.ok(review, JSON.stringify(body.steps.map((s) => s.step)));
  assert.deepEqual(review.readOnly, readOnlyAll(), 'each command still measured');
  assert.deepEqual(review.allowed.bash, [bashRule('Bash(ls:*)'), bashRule('Bash(cat:*)')], 'and the allows listed as allows');
});

/**
 * The shipped list `of`, with `key` set to `value` — or left out, for undefined — returned `as never`: not a measurement, on purpose,
 * so the readers are handed what their type refuses, to prove they refuse it at run time too.
 */
const edited = (of: object, key: string, value?: unknown): never => {
  const copy: Record<string, unknown> = { ...of };
  if (value === undefined) delete copy[key];
  else copy[key] = value;
  return copy as never;
};

test('REFUSED: a measurement without a date, or a version, is refused by name with the fix — and a day not on the calendar, a list naming a command twice, or docs with no day read', () => {
  const refuses = (run: () => unknown, pattern: RegExp) =>
    assert.throws(
      run,
      (err: Error & { exitCode?: number }) =>
        pattern.test(err.message) && err.exitCode === 2 && /give it the day it was taken|Fix the list/.test(err.message),
    );
  const R = READ_ONLY_COMMANDS;
  refuses(
    () => readOnlyCommands('READ_ONLY_COMMANDS', edited(R, 'measuredAt')),
    /^READ_ONLY_COMMANDS has no `measuredAt` day written as 2026-09-15 \(null\)\./,
  );
  refuses(
    () => readOnlyCommands('READ_ONLY_COMMANDS', edited(R, 'version')),
    /^READ_ONLY_COMMANDS has no `version` numbered as 2\.1\.272 \(null\)\./,
  );
  refuses(
    () => readOnlyCommands('READ_ONLY_COMMANDS', edited(edited(R, 'version', ''), 'measuredAt')),
    /^READ_ONLY_COMMANDS has no `version` .*, no `measuredAt` day/,
  );
  refuses(() => readOnlyCommands('READ_ONLY_COMMANDS', edited(R, 'version', 'latest')), /no `version` numbered as 2\.1\.272 \("latest"\)/);
  for (const day of ['2026-02-30', '2026-13-01', 'September 15', '2026-9-15', 'today']) {
    refuses(() => readOnlyCommands('READ_ONLY_COMMANDS', edited(R, 'measuredAt', day)), /no `measuredAt` day written as 2026-09-15/);
  }
  refuses(() => dated('MEASURED_TOOLS', edited(MEASURED_TOOLS, 'measuredAt')), /^MEASURED_TOOLS has no `measuredAt` day/);
  refuses(() => dated('MEASURED_TOOLS', edited(MEASURED_TOOLS, 'version')), /^MEASURED_TOOLS has no `version`/);
  refuses(() => dated('MEASURED_TOOLS', edited(MEASURED_TOOLS, 'source', ' ')), /^MEASURED_TOOLS has no `source`/);
  refuses(
    () => readOnlyCommands('READ_ONLY_COMMANDS', edited(R, 'documented', [...R.documented, 'cat'])),
    /^READ_ONLY_COMMANDS has cat listed twice\./,
  );
  refuses(() => readOnlyCommands('READ_ONLY_COMMANDS', edited(R, 'measured', [])), /no `measured` list of commands/);
  refuses(() => readOnlyCommands('READ_ONLY_COMMANDS', edited(R, 'measured', ['cat -n'])), /no `measured` list of commands/);
  refuses(
    () => readOnlyCommands('READ_ONLY_COMMANDS', edited(R, 'docs', 'code.claude.com/docs/en/permissions')),
    /no `docs` ending in the day they were read/,
  );
});
