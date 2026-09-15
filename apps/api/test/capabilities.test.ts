import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// agent-workflows locates its store when the module loads, so point it at a scratch directory before app.ts imports it.
process.env.WF_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-api-capabilities-'));
const { app } = await import('../src/app.ts');
const { HOME_REPO, MEASURED_TOOLS, capabilitiesOf, denyingRule, frontmatterOf, repoOf } = await import('../src/capabilities.ts');
const { DISALLOW } = await import('../src/reach.ts');

const FIXTURE_SERVER = path.join(import.meta.dirname, 'fixtures', 'mcp-server.ts');

/** A checkout with only these files in it. An object is written as JSON. */
const repoWith = (files: Record<string, string | object>): string => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-api-repo-'));
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
    return { status: res.status, body: await res.json() };
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
  // A map or a list under a key is not a value: skipped, and the keys after it still read.
  assert.deepEqual(read('name: x\nmetadata:\n  type: user\ntools:\n  - Read\ndescription: after them'), { name: 'x', description: 'after them' });
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

test('a repository with none of it — or no repository at all — is empty lists and a 200, never an error', async () => {
  const gone = path.join(os.tmpdir(), `hkb-api-no-such-repo-${process.pid}`);
  // `.claude/skills` a file, not a directory: absent all the same.
  for (const repo of [repoWith({}), gone, repoWith({ '.claude/skills': 'a file', '.claude/agents': 'a file' })]) {
    const { status, body } = await served(repo);
    assert.equal(status, 200, repo);
    assert.deepEqual(body, { repo, skills: [], agents: [], mcp: [], denied: [], allowed: [], warnings: [], measured: MEASURED_TOOLS, steps: [] }, repo);
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
  assert.deepEqual({ ...server, checkedAt: undefined }, {
    name: 'fixture', source: '.mcp.json', type: 'stdio', command: process.execPath, args: [FIXTURE_SERVER], url: null, enabled: true,
    tools: [
      { name: 'echo', description: 'Say it back.\nA second line, which a one-line description leaves out.', denied: null },
      { name: 'wipe', description: 'Remove everything in the workspace.', denied: 'mcp__fixture__wipe' },
    ],
    error: null, notAsked: null, checkedAt: undefined,
  });
  assert.ok(Date.parse(server.checkedAt) > 0, `checkedAt is when it was asked: ${server.checkedAt}`);
});

test('a server whose command does not exist is an error on its entry: a 200, and the other server still lists its tools', async () => {
  const repo = repoWith({
    '.mcp.json': { mcpServers: { missing: { command: 'hkb-no-such-mcp-server', args: ['--stdio'] }, fixture: fixture() } },
    '.claude/settings.json': { enabledMcpjsonServers: ['missing', 'fixture'] },
  });
  const { status, body } = await served(repo);
  assert.equal(status, 200);
  const [missing, working] = body.mcp;
  assert.equal(missing.name, 'missing');
  assert.equal(missing.tools, null);
  assert.equal(
    missing.error,
    '`hkb-no-such-mcp-server --stdio` did not start: there is no command `hkb-no-such-mcp-server` on its PATH. Install it, or fix `command` for missing in .mcp.json.',
  );
  assert.deepEqual(working.tools.map((tool: { name: string }) => tool.name), ['echo', 'wipe']);
});

test('a server that offers no tools lists none, and is not asked tools/list, which it has no answer to', async () => {
  const repo = repoWith({
    '.mcp.json': { mcpServers: { prompts: fixture({ HKB_TEST_MODE: 'prompts' }) } },
    '.claude/settings.json': { enabledMcpjsonServers: ['prompts'] },
  });
  const { status, body } = await served(repo);
  assert.equal(status, 200);
  assert.deepEqual([body.mcp[0].tools, body.mcp[0].error], [[], null]);
  assert.ok(Date.parse(body.mcp[0].checkedAt) > 0, 'it was asked, and answered');
});

test('a server that exits before it answers is an error with what it printed on stderr', async () => {
  const repo = repoWith({
    '.mcp.json': { mcpServers: { crash: fixture({ HKB_TEST_MODE: 'crash' }) } },
    '.claude/settings.json': { enabledMcpjsonServers: ['crash'] },
  });
  const { status, body } = await served(repo);
  assert.equal(status, 200);
  assert.equal(body.mcp[0].tools, null);
  assert.match(body.mcp[0].error, /did not list its tools: .+\. Run it yourself to see why, or fix its entry in \.mcp\.json\.\nWhat it printed on stderr:\nfixture: no licence key in FIXTURE_KEY$/);
});

test('a server that never answers is an error once its time is up, and it is stopped', async () => {
  const starts = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-api-starts-')), 'starts');
  const repo = repoWith({
    '.mcp.json': { mcpServers: { silent: fixture({ HKB_TEST_MODE: 'silent', HKB_TEST_STARTS: starts }) } },
    '.claude/settings.json': { enabledMcpjsonServers: ['silent'] },
  });
  // Given a deadline the test can wait for; the api's own is ASK_MS.
  const { mcp: [server] } = await capabilitiesOf(repo, { deadlineMs: 500 });
  assert.equal(server!.tools, null);
  assert.match(server!.error!, /did not list its tools: it did not list its tools within 0\.5 s\./);
  const [pid] = startsIn(starts);
  assert.throws(() => process.kill(pid!, 0), { code: 'ESRCH' }, 'the server is not left running');
});

test('each server is asked once while the api runs: requests after the first, and requests at once, read that answer', async () => {
  const starts = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-api-starts-')), 'starts');
  const repo = repoWith({
    '.mcp.json': { mcpServers: { fixture: fixture({ HKB_TEST_STARTS: starts }) } },
    '.claude/settings.json': { enabledMcpjsonServers: ['fixture'] },
  });
  const [first, second] = await Promise.all([capabilitiesOf(repo), capabilitiesOf(repo)]);
  const third = await capabilitiesOf(repo);
  assert.equal(startsIn(starts).length, 1, 'started once');
  for (const answer of [second, third]) assert.deepEqual(answer.mcp, first.mcp);

  // A server started otherwise is another server: an edit to its entry asks again.
  write(path.join(repo, '.mcp.json'), { mcpServers: { fixture: { ...fixture({ HKB_TEST_STARTS: starts }), args: [FIXTURE_SERVER, '--edited'] } } });
  const edited = await capabilitiesOf(repo);
  assert.equal(startsIn(starts).length, 2, 'started again for the edited entry');
  assert.deepEqual(edited.mcp[0]!.args, [FIXTURE_SERVER, '--edited']);
});

test("an entry is started as a session starts it — ${VAR} and ${VAR:-default} expanded from the api's environment, which the server inherits — and shown as written", async () => {
  const set: Record<string, string> = {
    HKB_TEST_FIXTURE_DIR: path.dirname(FIXTURE_SERVER), HKB_TEST_SECRET: 's3cret', HKB_TEST_INHERITED: 'from the api', PORT: '8787',
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
            env: { HKB_TEST_MODE: 'env', HKB_TEST_NAMED: '${HKB_TEST_SECRET}', HKB_TEST_DEFAULTED: '${HKB_TEST_NEVER_SET_DEFAULTED:-the default}' },
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
    assert.deepEqual(JSON.parse(server.tools[0].description), {
      argv: ['--token=s3cret'],
      HKB_TEST_NAMED: 's3cret',
      HKB_TEST_DEFAULTED: 'the default',
      HKB_TEST_INHERITED: 'from the api',
      CLAUDE_PROJECT_DIR: repo,
    }, "what the server was started with — and no PORT, which is the api's");
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("an entry naming a variable the api's environment does not set, with no default, is an error on its entry, and not started", async () => {
  const starts = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-api-starts-')), 'starts');
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
  const starts = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-api-starts-')), 'starts');
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
    assert.deepEqual(body.mcp[0], {
      name: 'off', source: '.mcp.json', type: 'stdio', command: process.execPath, args: [FIXTURE_SERVER], url: null, enabled: false,
      tools: null, error: null, checkedAt: null,
      notAsked: 'Not enabled by .claude/settings.json, so the api does not start it. Add "off" to enabledMcpjsonServers there to list its tools.',
    }, JSON.stringify(settings));
  }
  assert.deepEqual(startsIn(starts), [], 'never started');

  // enableAllProjectMcpServers enables what it does not disable.
  const all = repoWith({ '.mcp.json': { mcpServers: { off } }, '.claude/settings.json': { enableAllProjectMcpServers: true } });
  const { body } = await served(all);
  assert.equal(body.mcp[0].enabled, true);
  assert.equal(body.mcp[0].tools.length, 2);
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
  assert.equal(remote.notAsked, 'Not a stdio server (http, at https://mcp.example.com/mcp): the api asks only stdio servers for their tools.');
  assert.equal(broken.tools, null);
  assert.equal(broken.error, '.mcp.json gives broken neither a `command` nor a `url` and `args` that are not a list of strings, so it is not started. Fix its entry.');
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
  assert.match(body.warnings[0], /^\.claude\/settings\.json is not a JSON object, so nothing is read as denied or enabled from it\. Make it one/);
  assert.match(body.warnings[1], /^\.mcp\.json does not parse as JSON \(.+\), so no MCP server is listed from it\. Fix the file/);

  const listless = repoWith({ '.claude/settings.json': { permissions: { deny: 'mcp__fixture__wipe' } } });
  const { body: denied } = await served(listless);
  assert.deepEqual(denied.denied, []);
  assert.deepEqual(denied.warnings, ['permissions.deny in .claude/settings.json is not a list of strings, so it is read as empty. Make it one: `["…"]`.']);
});

test("a deny rule refuses a server's tool by the tool's name, the server's, or every tool of the server — and by nothing else", () => {
  const tool = ['playwright', 'browser_click'] as const;
  assert.equal(denyingRule(['Read', 'mcp__playwright__browser_click'], ...tool), 'mcp__playwright__browser_click');
  assert.equal(denyingRule(['mcp__playwright'], ...tool), 'mcp__playwright');
  assert.equal(denyingRule(['mcp__playwright__*'], ...tool), 'mcp__playwright__*');
  for (const rule of ['mcp__play', 'mcp__playwrightx', 'mcp__playwright__browser', 'mcp__playwright__browser_click_', 'mcp__other__browser_click', 'Bash(git push)', '*']) {
    assert.equal(denyingRule([rule], ...tool), null, rule);
  }
});

test("unset, the api serves its own checkout: Playwright's server lists browser_run_code_unsafe, and the rule that denies it", async () => {
  assert.equal(repoOf({}), HOME_REPO);
  assert.equal(repoOf({ HKB_REPO: '  ' }), HOME_REPO);
  assert.equal(repoOf({ HKB_REPO: 'elsewhere' }), path.resolve('elsewhere'));
  assert.ok(fs.existsSync(path.join(HOME_REPO, 'CLAUDE.md')), `${HOME_REPO} is the checkout`);

  delete process.env.HKB_REPO;
  const res = await app.request('/api/capabilities');
  assert.equal(res.status, 200);
  const body = await res.json();
  const playwright = body.mcp.find((server: { name: string }) => server.name === 'playwright');
  assert.equal(playwright.enabled, true);
  assert.equal(playwright.error, null);
  const unsafe = playwright.tools.find((tool: { name: string }) => tool.name === 'browser_run_code_unsafe');
  assert.equal(unsafe.denied, 'mcp__playwright__browser_run_code_unsafe');
  assert.ok(body.denied.some((d: { rule: string }) => d.rule === 'mcp__playwright__browser_run_code_unsafe'));
});

// ─── what each step gets ─────────────────────────────────────────────────────

/**
 * A checkout with workflows: `dev`'s implement on Claude Code with no `tools:` and a `disallow:`, its review fenced to four tools in `dontAsk`;
 * and `codexed`, one step on Codex. The settings enable the fixture server, deny one of its tools and a push, and allow three Bash commands and a
 * search. The fixture server lists `echo` and `wipe`.
 */
const stepsRepo = () => repoWith({
  '.claude/settings.json': {
    enabledMcpjsonServers: ['fixture'],
    permissions: { deny: ['Bash(git push:*)', 'mcp__fixture__wipe'], allow: ['Bash(npm test)', 'Bash(git diff:*)', 'Bash(npm run build)', 'WebSearch'] },
  },
  '.mcp.json': { mcpServers: { fixture: fixture() } },
  '.claude/skills/review/SKILL.md': '---\nname: code-review\ndescription: Review a diff.\n---\n',
  'workflows/dev/implement.md': '---\nharness: claude\ndisallow: SendMessage, CronCreate, mcp__fixture__echo, Bash(npm run build)\n---\nImplement it.\n',
  'workflows/dev/review.md': '---\nharness: claude\nafter: implement\ntools: Read, Grep, Glob, Bash\npermissionMode: dontAsk\neffort: high\n---\nReview it.\n',
  'workflows/codexed/plan.md': '---\nharness: codex\n---\nPlan it.\n',
});

/** The steps GET /api/capabilities says each step gets, by `<workflow>/<step>`. */
const stepsOf = async (repo: string): Promise<Record<string, any>> => {
  const { status, body } = await served(repo);
  assert.equal(status, 200);
  return Object.fromEntries(body.steps.map((s: { workflow: string; step: string }) => [`${s.workflow}/${s.step}`, s]));
};

const SETTINGS = '.claude/settings.json';

test('a step with `tools:` gets exactly those — no skill without Skill, the tools of each server the checkout enables, and the settings\' deny', async () => {
  const { 'dev/review': review } = await stepsOf(stepsRepo());
  assert.deepEqual(review.fence, { tools: ['Read', 'Grep', 'Glob', 'Bash'], disallow: [], permissionMode: 'dontAsk', effort: 'high', mcp: null });
  assert.deepEqual(review.tools, { from: 'declared', names: ['Read', 'Grep', 'Glob', 'Bash'], removed: [] });
  assert.equal(review.claudeCode, true);
  assert.deepEqual(review.skills.names, []);
  assert.match(review.skills.why, /^Its tools have no `Skill`, so it cannot load a skill/);
  assert.deepEqual(review.denied, [{ rule: 'Bash(git push:*)', source: SETTINGS }, { rule: 'mcp__fixture__wipe', source: SETTINGS }]);
  assert.deepEqual(review.mcp.map((s: { server: string }) => s.server), ['fixture']);
});

test('a step without `tools:` gets the harness\'s own set, as measured — with its date and version, never claimed current — and every skill, with Skill in it', async () => {
  const body = (await served(stepsRepo())).body;
  assert.deepEqual({ harness: body.measured.harness, version: body.measured.version, measuredAt: body.measured.measuredAt }, { harness: 'Claude Code', version: '2.1.270', measuredAt: '2026-09-14' });
  assert.match(body.measured.source, /what a worker gets, measured/);
  const implement = body.steps.find((s: { step: string }) => s.step === 'implement');
  assert.equal(implement.tools.from, 'measured');
  // Its own set, less the one tool its `disallow:` names whole.
  assert.deepEqual(implement.tools.names, MEASURED_TOOLS.tools.filter((name: string) => name !== 'SendMessage'));
  assert.deepEqual(implement.skills, { names: ['code-review'], why: null });
  assert.deepEqual(implement.fence, { tools: null, disallow: ['SendMessage', 'CronCreate', 'mcp__fixture__echo', 'Bash(npm run build)'], permissionMode: null, effort: null, mcp: null });
});

test('REFUSED: `disallow` takes away — a tool, one of a family, a server\'s tool — and a command it denies is not allowed, though the settings allow it', async () => {
  const { 'dev/implement': implement, 'dev/review': review } = await stepsOf(stepsRepo());
  assert.ok(!implement.tools.names.includes('SendMessage'), 'SendMessage is not among its tools');
  assert.deepEqual(implement.tools.removed, [
    { name: 'SendMessage', rule: 'SendMessage', source: DISALLOW, of: null },
    // One of a family the measurement names as one: the family stays, and the tool is named as taken.
    { name: 'CronCreate', rule: 'CronCreate', source: DISALLOW, of: 'Cron*' },
  ]);
  assert.ok(implement.tools.names.includes('Cron*'));
  assert.deepEqual(implement.mcp[0].tools, [
    { name: 'echo', denied: { rule: 'mcp__fixture__echo', source: DISALLOW }, allowed: false },
    { name: 'wipe', denied: { rule: 'mcp__fixture__wipe', source: SETTINGS }, allowed: false },
  ]);
  // A deny beats an allow: `npm run build` is allowed by the settings, and denied by the step.
  assert.deepEqual(implement.allowed, { rules: ['Bash(npm test)', 'Bash(git diff:*)', 'WebSearch'], bash: ['npm test', 'git diff:*'], dontAsk: false });
  assert.deepEqual(implement.denied.slice(2).map((d: { rule: string }) => d.rule), ['SendMessage', 'CronCreate', 'mcp__fixture__echo', 'Bash(npm run build)']);
  // And none of it reaches the step beside it, which denies nothing of its own.
  assert.ok(review.allowed.bash.includes('npm run build'));
  assert.equal(review.mcp[0].tools[0].denied, null);
});

test('a `dontAsk` step under the settings shows what Bash commands are allowed, and a server\'s tool no rule allows runs no more than a denied one', async () => {
  const { 'dev/review': review, 'dev/implement': implement } = await stepsOf(stepsRepo());
  assert.deepEqual(review.allowed, { rules: ['Bash(npm test)', 'Bash(git diff:*)', 'Bash(npm run build)', 'WebSearch'], bash: ['npm test', 'git diff:*', 'npm run build'], dontAsk: true });
  assert.deepEqual(review.mcp[0].tools, [{ name: 'echo', denied: null, allowed: false }, { name: 'wipe', denied: { rule: 'mcp__fixture__wipe', source: SETTINGS }, allowed: false }]);
  assert.equal(implement.allowed.dontAsk, false, 'a step in no mode is not dontAsk');
});

test('a Codex step shows its fence, and nothing it was not measured to get: no tools, skills or servers are claimed for it', async () => {
  const { 'codexed/plan': plan } = await stepsOf(stepsRepo());
  assert.deepEqual([plan.harness, plan.claudeCode, plan.tools, plan.skills, plan.mcp], ['codex', false, null, null, null]);
  assert.deepEqual(plan.fence, { tools: null, disallow: [], permissionMode: null, effort: null, mcp: null });
});

test('a workflow the loader refuses has no step on the page, and a repository with a workflow and nothing else still says what its step gets', async () => {
  const repo = repoWith({
    'workflows/broken/review.md': '---\nafer: implement\n---\nReview it.\n',
    'workflows/lone/implement.md': 'Implement it.\n',
  });
  const steps = await stepsOf(repo);
  assert.deepEqual(Object.keys(steps), ['lone/implement']);
  // No harness named: the engine's first, Claude Code. No settings: nothing denied or allowed; no `.mcp.json`: no server.
  assert.deepEqual([steps['lone/implement'].harness, steps['lone/implement'].tools.from, steps['lone/implement'].mcp, steps['lone/implement'].allowed], ['claude', 'measured', [], { rules: [], bash: [], dontAsk: false }]);
});
