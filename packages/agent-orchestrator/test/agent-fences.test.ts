/**
 * Every shipped step is refused `git push`, a forced branch delete, a kill by name (`pkill`, `killall`) and Playwright's
 * `browser_run_code_unsafe` by its own fence, and the checkout's `.claude/settings.json` refuses none of them: the settings bind a
 * person's own session in this checkout too, and a person may ask their session to push.
 *
 * The guard reads every workflow folder `shippedFolders` finds under `SHIPPED_HOLDERS`: the repository's `workflows/`, this repository's
 * own team, and the package's own, none on disk. It holds the tests' team (`team.ts`) to the same fence: each refusal below is made on
 * the team, cut back, and on a watcher's step written here, so whatever is shipped is held by a guard proven to refuse.
 *
 * Each step is read at shipped defaults, as `wf start` freezes it (`loadWorkflows`). A step in `auto` — the engine's default — runs
 * whatever no deny names, so its own `disallowedTools` must name each call. A step in `dontAsk` runs only what an allow reaches, so
 * no rule of its `allowedTools`, of the settings' allow or of a skill's `allowed-tools` may reach one. A step that reads settings the
 * repository does not ship — a background session reads the person's user settings, and a job in the checkout itself that checkout's
 * working-tree `.claude/settings.json`, which a person may have edited — may be allowed anything there, so it too must name each call
 * itself. A step on codex is fenced by a
 * read-only sandbox. The matcher is Claude Code's rule shapes this suite relies on, and throws on a wildcard it does not model, so an
 * allow it cannot read fails the test rather than passing it. A command is matched part by part, as Claude Code matches it (`partsOf`):
 * a deny of any part refuses the whole, and a dontAsk step runs it only when an allow reaches every part.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadWorkflows, readSkillRules, RULES_FILE } from '../src/folder/folder.store.ts';
import type { SkillRule } from '../src/skills/skills.ts';
import { scratch } from './scratch.ts';
import { placesOf, shippedFolders, SHIPPED_HOLDERS, TEAM, TEAM_DEV, teamCopy } from './team.ts';

const REPO = path.join(import.meta.dirname, '..', '..', '..');

/** Every shipped workflow folder, read off the disk: this repository's own team's, under its `workflows/`. */
const FOLDERS = shippedFolders();

/** Every shipped agents folder there is: each agent in it is named by a step of a shipped folder. */
const AGENT_FOLDERS = SHIPPED_HOLDERS.map((holder) => path.join(holder, 'agents')).filter((dir) => fs.existsSync(dir));

/**
 * Every folder of skills a step may load, whose `allowed-tools` a loaded skill grants the session: the repository's, shipped, the team's.
 */
const SKILL_FOLDERS = [
  path.join(REPO, '.claude', 'skills'),
  ...SHIPPED_HOLDERS.map((holder) => path.join(holder, 'skills')),
  path.join(TEAM, 'skills'),
].filter((dir) => fs.existsSync(dir));

type Settings = { permissions?: { allow?: string[]; deny?: string[] } };
const SETTINGS = JSON.parse(fs.readFileSync(path.join(REPO, '.claude', 'settings.json'), 'utf8')) as Settings;

/** A call a session makes: a shell command, or a tool by its name. */
type Call = { tool: 'Bash'; command: string } | { tool: string; command?: undefined };

/** What no shipped step may run, in the spellings a session types. */
const FENCED: Call[] = [
  { tool: 'Bash', command: 'git push' },
  { tool: 'Bash', command: 'git push origin main' },
  { tool: 'Bash', command: 'git push --force origin wf/r-1/implement' },
  { tool: 'Bash', command: 'git branch -D wf/r-1/implement' },
  { tool: 'Bash', command: 'git branch --delete --force wf/r-1/implement' },
  { tool: 'Bash', command: 'pkill -f "turbo run test"' },
  { tool: 'Bash', command: 'killall node' },
  { tool: 'Bash', command: 'cd packages/agent-orchestrator && pkill -f "turbo run test"' },
  { tool: 'Bash', command: 'timeout 5 pkill -f turbo' },
  { tool: 'Bash', command: 'true; killall node' },
  { tool: 'mcp__playwright__browser_run_code_unsafe' },
];

/** A call as a rule would name it, for a message. */
const shown = (call: Call): string => (call.command === undefined ? call.tool : `Bash(${call.command})`);

/**
 * Whether a permission rule reaches a call: a bare tool name is that tool, `mcp__<server>` or `mcp__<server>__*` every tool of the
 * server, `Bash(x)` the command `x` exactly, and `Bash(x:*)` or `Bash(x *)` the command `x` or `x` followed by a space and more. Any
 * other `Tool(x)` reaches some call of that tool, so it is read as reaching every one; Claude Code matches a write against `Edit` rules,
 * so an `Edit` rule reaches `Write` too. Throws on a `*` anywhere else, which this matcher does not model.
 */
function reaches(rule: string, call: Call): boolean {
  const bash = /^Bash\((.*)\)$/s.exec(rule)?.[1];
  if (bash === undefined) {
    const tool = rule.includes('(') ? rule.slice(0, rule.indexOf('(')) : undefined;
    if (call.tool === 'Write' && (rule === 'Edit' || tool === 'Edit')) return true;
    if (tool !== undefined) return tool === call.tool && call.command === undefined;
    const server = rule.startsWith('mcp__') ? rule.replace(/__\*$/, '') : undefined;
    if (server !== undefined && !server.includes('*') && server.split('__').length === 2)
      return rule === call.tool || call.tool.startsWith(`${server}__`);
    if (rule.includes('*')) throw new Error(`${rule}: a wildcard in a tool name is not modelled; say how it reads, here`);
    return rule === call.tool;
  }
  if (call.command === undefined) return false;
  const prefix = /^(.*?)(?::\*| \*)$/s.exec(bash)?.[1];
  const exact = prefix ?? bash;
  if (exact.includes('*')) throw new Error(`${rule}: a wildcard inside a Bash rule is not modelled; say how it reads, here`);
  return prefix === undefined ? call.command === bash : call.command === prefix || call.command.startsWith(`${prefix} `);
}

/** A wrapper Claude Code strips before it matches a part: a leading assignment, `timeout` with its duration, `nohup`. */
const WRAPPER = /^(?:[A-Za-z_]\w*=\S*|timeout \d+(?:\.\d+)?[smhd]?|nohup)\s+/;

/** A part with every leading wrapper stripped (`WRAPPER`). */
function unwrapped(part: string): string {
  let rest = part.trim();
  let wrapper = WRAPPER.exec(rest);
  while (wrapper) {
    rest = rest.slice(wrapper[0].length).trimStart();
    wrapper = WRAPPER.exec(rest);
  }
  return rest;
}

/**
 * The parts of a shell command Claude Code matches a rule against, each `unwrapped`: split on `&&`, `||`, `;`, `|&`, `|`, `&` and a
 * newline outside quotes. Throws on a substitution, a redirection, an escape, an unclosed quote or a separator inside quotes, which
 * this matcher does not model.
 */
function partsOf(command: string): string[] {
  if (/\$\(|[`<>\\]/.test(command))
    throw new Error(`${command}: a substitution, redirection or escape is not modelled; say how it reads, here`);
  const tokens = [...command.matchAll(/'[^']*'|"[^"]*"|&&|\|\||\|&|[;|&\n]|[^'"&|;\n]+/g)].map((token) => token[0]);
  const quoted = tokens.filter((token) => /^['"]/.test(token));
  if (tokens.join('') !== command || quoted.some((token) => /[;&|\n]/.test(token)))
    throw new Error(`${command}: an unclosed quote or a separator inside quotes is not modelled; say how it reads, here`);
  const parts = [''];
  for (const token of tokens)
    if (/^(?:&&|\|\||\|&|[;|&\n])$/.test(token)) parts.push('');
    else parts[parts.length - 1] += token;
  return parts.map(unwrapped).filter(Boolean);
}

/** A call as the parts Claude Code matches: each part of a shell command (`partsOf`), or the tool call itself. */
const partsOfCall = (call: Call): Call[] =>
  call.command === undefined ? [call] : partsOf(call.command).map((command) => ({ tool: 'Bash', command }) as const);

/** A SKILL.md's `allowed-tools`, split on commas: what a session that loads the skill may run without asking. */
function allowedToolsOf(file: string): string[] {
  const front = /^---\n([\s\S]*?)\n---/.exec(fs.readFileSync(file, 'utf8'))?.[1] ?? '';
  const line = /^allowed-tools:(.*)$/m.exec(front)?.[1]?.trim();
  if (line === undefined) return [];
  if (line === '' || line.startsWith('[')) throw new Error(`${file}: allowed-tools is not one line of rules; read its shape here`);
  return line.split(/,\s*/).filter(Boolean);
}

/** Every skill's grants, from every folder a shipped step may load one from. */
const SKILL_GRANTS = SKILL_FOLDERS.flatMap((dir) =>
  fs
    .readdirSync(dir)
    .map((name) => path.join(dir, name, 'SKILL.md'))
    .filter((file) => fs.existsSync(file))
    .flatMap(allowedToolsOf),
);

type Step = ReturnType<typeof loadWorkflows>[number];

/** What of `FENCED` a step could run, each as `<step>: <call>`; empty for a step fenced from all of it. */
function unfenced(step: Step, settings: Settings = SETTINGS): string[] {
  const harness = step.harness ?? 'claude';
  if (harness === 'codex')
    return step.sandbox === 'read-only' ? [] : [`${step.name}: on codex in sandbox ${step.sandbox ?? 'workspace-write'}, not read-only`];
  if (harness !== 'claude' && harness !== 'claude-detached')
    return [`${step.name}: on ${harness}, which this test does not know how to fence`];
  const denies = [...(step.disallowedTools ?? []), ...(settings.permissions?.deny ?? [])];
  const allows = [...(step.allowedTools ?? []), ...(settings.permissions?.allow ?? []), ...SKILL_GRANTS];
  const unshipped = step.background === true || step.workspace === 'main';
  const dontAsk = step.permissionMode === 'dontAsk' && !unshipped;
  return FENCED.filter((call) => {
    if (partsOfCall(call).some((part) => denies.some((rule) => reaches(rule, part)))) return false;
    return !dontAsk || partsOfCall(call).every((part) => allows.some((rule) => reaches(rule, part)));
  }).map((call) => `${step.name}: ${shown(call)}`);
}

/**
 * The check commands a repository skill names: every backticked `npm …` or `npx …` span in its paragraph that starts at `from`, up to
 * the next blank line or numbered item. Throws, naming the skill, when `from` is not in it.
 */
function checksOf(skill: string, from: string): string[] {
  const text = fs.readFileSync(path.join(REPO, '.claude', 'skills', skill, 'SKILL.md'), 'utf8');
  const start = text.indexOf(from);
  if (start < 0) throw new Error(`${skill}: no "${from}" to read its checks from; name the line its checks are on, here`);
  const rest = text.slice(start);
  const end = /\n\s*\n|\n\d+\.\s/.exec(rest)?.index ?? rest.length;
  return [...rest.slice(0, end).matchAll(/`(np[mx]\s[^`]*)`/g)].map((span) => span[1].replace(/\s+/g, ' '));
}

/** The commands a step's fence would refuse: reached by no allow of its own or of the settings, or by a deny of its own. */
function unallowed(step: Step, commands: string[]): string[] {
  const allows = [...(step.allowedTools ?? []), ...(SETTINGS.permissions?.allow ?? [])];
  return commands.filter((command) => {
    const call = { tool: 'Bash', command } as const;
    return !allows.some((rule) => reaches(rule, call)) || (step.disallowedTools ?? []).some((rule) => reaches(rule, call));
  });
}

/** Every step of every shipped folder, by its folder. */
const shipped = (): { dir: string; step: Step }[] =>
  FOLDERS.flatMap((dir) => loadWorkflows(dir, placesOf(dir)).map((step) => ({ dir, step })));

/** The step of the tests' team that names an agent, as its folder resolves it. */
const stepOf = (agent: string): Step => loadWorkflows(TEAM_DEV).find((step) => step.agent?.name === agent)!;

/** A folder of steps written from their frontmatter and a one-line body, beside no agents. */
const folderOf = (steps: Record<string, string>): string => {
  const dir = scratch('wf-fences-folder-');
  for (const [name, front] of Object.entries(steps)) fs.writeFileSync(path.join(dir, `${name}.md`), `---\n${front}\n---\n${name} it\n`);
  return dir;
};

test('the matcher reads the rule shapes the fences use, and throws on a wildcard it does not model', () => {
  const push = { tool: 'Bash', command: 'git push origin main' } as const;
  assert.equal(reaches('Bash(git push:*)', push), true);
  assert.equal(reaches('Bash(git push *)', push), true);
  assert.equal(reaches('Bash(git push)', push), false, 'a rule with no wildcard is the command exactly');
  assert.equal(reaches('Bash(git push)', { tool: 'Bash', command: 'git push' }), true);
  assert.equal(reaches('Bash(git pu:*)', push), false, 'a prefix ends at a word');
  assert.equal(reaches('Bash(git:*)', push), true);
  assert.equal(reaches('Bash', push), true, 'a bare Bash is every command');
  assert.equal(reaches('Bash(git branch --list:*)', { tool: 'Bash', command: 'git branch -D x' }), false);
  const unsafe = { tool: 'mcp__playwright__browser_run_code_unsafe' };
  assert.equal(reaches('mcp__playwright__browser_run_code_unsafe', unsafe), true);
  assert.equal(reaches('mcp__playwright', unsafe), true, 'a server is every tool of it');
  assert.equal(reaches('mcp__playwright__*', unsafe), true);
  assert.equal(reaches('mcp__playwright__browser_navigate', unsafe), false);
  assert.equal(reaches('Bash(git push:*)', unsafe), false);
  assert.equal(reaches('Edit(**)', { tool: 'Edit' }), true, 'an edit rule on any path reaches an edit');
  assert.equal(reaches('Edit(src/**)', { tool: 'Write' }), true, 'a write is matched against Edit rules');
  assert.equal(reaches('Edit', { tool: 'Write' }), true);
  assert.equal(reaches('Read(**)', { tool: 'Edit' }), false);
  assert.equal(reaches('Edit(**)', push), false);
  assert.throws(
    () => reaches('Bash(git * push)', push),
    (err: Error) => err.message.includes('not modelled'),
  );
  assert.throws(
    () => reaches('mcp__play*', unsafe),
    (err: Error) => err.message.includes('not modelled'),
  );
});

test('the matcher splits a command into the parts Claude Code matches, strips the wrappers it strips, and throws on a form it does not model', () => {
  assert.deepEqual(partsOf('cd packages/agent-orchestrator && pkill -f "turbo run test"'), [
    'cd packages/agent-orchestrator',
    'pkill -f "turbo run test"',
  ]);
  assert.deepEqual(partsOf('a || b; c | d |& e & f\ng'), ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  assert.deepEqual(partsOf('timeout 5 pkill -f turbo'), ['pkill -f turbo']);
  assert.deepEqual(partsOf('FOO=1 nohup timeout 2.5s killall node'), ['killall node']);
  assert.deepEqual(partsOf('true &'), ['true'], 'a command sent to the background is its own part');
  assert.deepEqual(partsOf("bash -c 'pkill -f x'"), ["bash -c 'pkill -f x'"], 'a shell started by a command is one part');
  assert.deepEqual(partsOf('timeoutx pkill'), ['timeoutx pkill'], 'a wrapper is a whole word');
  for (const command of ['kill $(pgrep -f turbo)', 'kill `pgrep -f turbo`', "bash -c 'a; pkill x'", 'npm test 2>&1', 'echo "a'])
    assert.throws(
      () => partsOf(command),
      (err: Error) => err.message.includes('not modelled'),
      command,
    );
  const compound = { tool: 'Bash', command: 'cd packages/agent-orchestrator && pkill -f "turbo run test"' } as const;
  assert.equal(reaches('Bash(pkill:*)', compound), false, 'a rule matched against the whole command misses the part');
  assert.ok(partsOfCall(compound).some((part) => reaches('Bash(pkill:*)', part)));
  assert.deepEqual(partsOfCall({ tool: 'Edit' }), [{ tool: 'Edit' }]);
});

test('every shipped agent is named by a shipped step, so the fence below reads each one', () => {
  const named = new Set(shipped().flatMap(({ step }) => (step.agent ? [step.agent.name] : [])));
  for (const dir of AGENT_FOLDERS)
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md'))
      assert.ok(named.has(path.basename(file, '.md')), `${path.join(dir, file)} is named by no shipped step`);
});

test('every shipped step is refused git push, a forced branch delete, a kill by name and browser_run_code_unsafe: by its own deny in auto, by no allow in dontAsk, by a read-only sandbox on codex', () => {
  const open = shipped().flatMap(({ dir, step }) => unfenced(step).map((what) => `${path.relative(REPO, dir)}/${what}`));
  assert.deepEqual(open, []);
  assert.ok(
    FOLDERS.every((dir) => !['agents', 'skills'].includes(path.basename(dir))),
    'agents and skills are no workflow of their own',
  );
});

test("the tests' team is fenced as a shipped team must be: every step of its dev, auto and dontAsk", () => {
  const steps = loadWorkflows(TEAM_DEV);
  assert.deepEqual(
    steps.flatMap((step) => unfenced(step)),
    [],
  );
  assert.ok(steps.some((step) => step.permissionMode === 'auto') && steps.some((step) => step.permissionMode === 'dontAsk'), 'both modes');
});

test('the settings deny none of them: the refusal is each worker’s own, and a person’s session may push', () => {
  const deny = SETTINGS.permissions?.deny ?? [];
  for (const call of FENCED)
    assert.deepEqual(
      deny.filter((rule) => reaches(rule, call)),
      [],
      `${shown(call)} is denied by .claude/settings.json, which binds a person's own session too`,
    );
});

/** The shipped step an agent runs, as `wf start` freezes it. */
const shippedStepOf = (agent: string): Step => {
  const found = shipped().find(({ step }) => step.agent?.name === agent);
  assert.ok(found, `no shipped step runs ${agent}`);
  return found.step;
};

/** Each dontAsk agent whose skill names the checks it runs, with the line those checks are on. */
const CHECKERS = [
  { agent: 'seldon', skill: 'write-a-spec', from: 'Run each check bare' },
  { agent: 'agora', skill: 'review-a-change', from: '**Run the suite yourself**' },
  { agent: 'argus', skill: 'read-the-stats', from: '**Run each read bare**' },
];

test('every check the skills of Seldon, Agora and Argus name is one their fence allows', () => {
  for (const { agent, skill, from } of CHECKERS) {
    const step = shippedStepOf(agent);
    assert.equal(step.permissionMode, 'dontAsk', `${agent} runs dontAsk`);
    const checks = checksOf(skill, from);
    assert.ok(checks.length >= 3, `${skill} names its checks: ${checks.join(', ')}`);
    assert.deepEqual(unallowed(step, checks), [], `${agent}'s fence refuses a check ${skill} names`);
  }
});

test("REFUSED: a skill's check the agent's fence does not allow is named", () => {
  const seldon = shippedStepOf('seldon');
  const agora = shippedStepOf('agora');
  const without = (step: Step, rule: string): Step => ({ ...step, allowedTools: step.allowedTools?.filter((r) => r !== rule) });
  assert.deepEqual(unallowed(without(seldon, 'Bash(npm run lint)'), checksOf('write-a-spec', 'Run each check bare')), ['npm run lint']);
  assert.deepEqual(
    unallowed(without(agora, 'Bash(npx turbo run typecheck --force)'), checksOf('review-a-change', '**Run the suite yourself**')),
    ['npx turbo run typecheck --force'],
  );
  assert.deepEqual(unallowed(seldon, checksOf('review-a-change', '**Run the suite yourself**')), ['npx turbo run typecheck --force']);
  assert.deepEqual(unallowed({ ...agora, disallowedTools: ['Bash(npm run lint)'] }, ['npm run lint']), ['npm run lint'], 'a deny wins');
  assert.throws(
    () => checksOf('write-a-spec', 'Run no check'),
    (err: Error) => err.message.includes('write-a-spec: no "Run no check"'),
  );
});

test('REFUSED: an auto step without its own deny, and a dontAsk step an allow reaches, are open', () => {
  const implementer = stepOf('implementer');
  assert.equal(implementer.permissionMode, 'auto');
  const bare = {
    ...implementer,
    disallowedTools: implementer.disallowedTools?.filter((rule) => !FENCED.some((call) => reaches(rule, call))),
  };
  assert.equal(unfenced(bare).length, FENCED.length, unfenced(bare).join('\n'));
  assert.deepEqual(
    unfenced(bare, { permissions: { deny: ['Bash(git push:*)'] } }).filter((what) => what.includes('git push')),
    [],
    'the same step is fenced from push by a deny in the settings, which is the refusal this test moves off the checkout',
  );

  const reviewer = stepOf('reviewer');
  assert.equal(reviewer.permissionMode, 'dontAsk');
  assert.deepEqual(unfenced({ ...reviewer, allowedTools: [...(reviewer.allowedTools ?? []), 'Bash(git push:*)'] }), [
    'review: Bash(git push)',
    'review: Bash(git push origin main)',
    'review: Bash(git push --force origin wf/r-1/implement)',
  ]);
  assert.deepEqual(unfenced({ ...reviewer, allowedTools: ['mcp__playwright'] }), ['review: mcp__playwright__browser_run_code_unsafe']);
  assert.deepEqual(unfenced(reviewer, { permissions: { allow: ['Bash(git branch:*)'] } }), [
    'review: Bash(git branch -D wf/r-1/implement)',
    'review: Bash(git branch --delete --force wf/r-1/implement)',
  ]);
  assert.deepEqual(unfenced({ ...stepOf('reviewer'), harness: 'codex', permissionMode: undefined, sandbox: 'workspace-write' }), [
    'review: on codex in sandbox workspace-write, not read-only',
  ]);
});

test("REFUSED: a watcher's step without its own deny of the forced delete is open, though it runs dontAsk and the settings allow it none", () => {
  const supervise = loadWorkflows(
    folderOf({
      supervise:
        'workspace: main\nslot: none\nharness: claude\nbackground: true\npermissionMode: dontAsk\n' +
        'disallowedTools: Bash(git push:*), Bash(git branch -D:*), Bash(git branch --delete --force:*), Bash(pkill:*), Bash(killall:*), ' +
        'mcp__playwright__browser_run_code_unsafe',
    }),
  ).find((s) => s.name === 'supervise')!;
  assert.deepEqual(unfenced(supervise), [], 'fenced by its own list');
  assert.equal(supervise.permissionMode, 'dontAsk');
  assert.equal(supervise.background, true, "a background session, which reads the person's user settings as well as the checkout's");
  const bare = {
    ...supervise,
    disallowedTools: supervise.disallowedTools?.filter((rule) => !rule.startsWith('Bash(git branch')),
  };
  assert.deepEqual(unfenced(bare), [
    'supervise: Bash(git branch -D wf/r-1/implement)',
    'supervise: Bash(git branch --delete --force wf/r-1/implement)',
  ]);
  assert.deepEqual(
    unfenced({ ...bare, background: undefined, workspace: 'folder' }),
    [],
    'the same step as a job in a folder the run made reads only the settings shipped here, where no allow reaches a forced delete',
  );
  assert.deepEqual(
    unfenced({ ...bare, background: undefined }),
    ['supervise: Bash(git branch -D wf/r-1/implement)', 'supervise: Bash(git branch --delete --force wf/r-1/implement)'],
    "a job in the checkout itself reads that checkout's working-tree settings.json, which a person may have edited",
  );
});

test("REFUSED: the team's implementer with its deny line cut back to the four it had is open, read from its file as a run reads it", () => {
  const root = teamCopy('wf-fences-');
  const file = path.join(root, 'agents', 'implementer.md');
  const text = fs.readFileSync(file, 'utf8');
  const cut = text.replace(/^disallowedTools: .*$/m, 'disallowedTools: SendMessage, CronCreate, CronDelete, RemoteTrigger');
  assert.notEqual(cut, text, 'the implementer has a deny line to cut');
  fs.writeFileSync(file, cut);
  const implement = loadWorkflows(path.join(root, 'dev')).find((s) => s.name === 'implement')!;
  assert.equal(implement.agent?.name, 'implementer');
  assert.equal(unfenced(implement).length, FENCED.length, unfenced(implement).join('\n'));
});

/** Every call of `FENCED` that runs `pkill` or `killall` in some part, as `unfenced` names it for `step`. */
const killsByName = (step: string): string[] =>
  FENCED.filter((call) => partsOfCall(call).some((part) => /^(?:pkill|killall)\b/.test(part.command ?? ''))).map(
    (call) => `${step}: ${shown(call)}`,
  );

test("REFUSED: Ada without its deny of pkill and killall, read from its file as a run reads it, is open on each kill by name, the compound's too", () => {
  const ada = shippedStepOf('ada');
  const line = ada.disallowedTools!.filter((rule) => rule !== 'Bash(pkill:*)' && rule !== 'Bash(killall:*)');
  assert.equal(line.length, ada.disallowedTools!.length - 2, 'Ada denies both by name');
  const bare = shippedWith('ada', 'build', 'disallowedTools', line.join(', '));
  assert.equal(bare.permissionMode, 'auto');
  assert.deepEqual(unfenced(bare), killsByName(bare.name));
  assert.ok(
    unfenced(bare).includes(`${bare.name}: Bash(cd packages/agent-orchestrator && pkill -f "turbo run test")`),
    'the form that killed a landing check',
  );
});

test('REFUSED: a dontAsk step an allow of pkill reaches is open on each kill by pkill whose every part some allow reaches', () => {
  const reviewer = stepOf('reviewer');
  assert.equal(reviewer.permissionMode, 'dontAsk');
  assert.deepEqual(unfenced({ ...reviewer, allowedTools: [...(reviewer.allowedTools ?? []), 'Bash(pkill:*)'] }), [
    'review: Bash(pkill -f "turbo run test")',
    'review: Bash(cd packages/agent-orchestrator && pkill -f "turbo run test")',
    'review: Bash(timeout 5 pkill -f turbo)',
  ]);
  assert.deepEqual(
    unfenced({ ...reviewer, allowedTools: [...(reviewer.allowedTools ?? []), 'Bash(killall:*)'] }),
    ['review: Bash(killall node)'],
    'no allow reaches `true`, so the compound stays fenced',
  );
  assert.ok(
    (SETTINGS.permissions?.allow ?? []).includes('Bash(cd:*)'),
    'the settings allow cd, and still the compound is fenced: its pkill part is reached by no allow',
  );
  assert.deepEqual(unfenced(reviewer), []);
});

/** What a janitor must never do, in the spellings a session types: start, file, queue or drop a card, approve or retry a step, edit. */
const ACTS: Call[] = [
  ...['wf start x', 'wf inbox add x', 'wf inbox queue x', 'wf inbox rm x', 'wf approve r s', 'wf retry r s'].flatMap((command) => [
    { tool: 'Bash', command: `npx ${command}` } as const,
    { tool: 'Bash', command } as const,
  ]),
  { tool: 'Edit' },
  { tool: 'Write' },
];

/**
 * What of `ACTS` a step could run: in a dontAsk job, each that a rule of its own, of the settings or of a skill allows and none of its
 * own denies; any other step runs every call no deny names.
 */
function acting(step: Step): string[] {
  if (step.permissionMode !== 'dontAsk' || step.background === true || step.workspace === 'main')
    return [`${step.name}: not a dontAsk job, so every call no deny names runs`];
  const allows = [...(step.allowedTools ?? []), ...(SETTINGS.permissions?.allow ?? []), ...SKILL_GRANTS];
  return ACTS.filter(
    (call) => allows.some((rule) => reaches(rule, call)) && !(step.disallowedTools ?? []).some((rule) => reaches(rule, call)),
  ).map(shown);
}

/**
 * The step of the shipped `workflow` that `agent` runs, read from a scratch copy of the shipped team, its agent's `key` line replaced
 * by `line`.
 */
function shippedWith(agent: string, workflow: string, key: 'allowedTools' | 'disallowedTools', line: string): Step {
  const root = scratch(`wf-fences-${agent}-`);
  fs.cpSync(SHIPPED_HOLDERS[0], root, { recursive: true });
  const file = path.join(root, 'agents', `${agent}.md`);
  const text = fs.readFileSync(file, 'utf8');
  const changed = text.replace(new RegExp(`^${key}: .*$`, 'm'), `${key}: ${line}`);
  assert.notEqual(changed, text, `${agent} has a ${key} line to replace`);
  fs.writeFileSync(file, changed);
  return loadWorkflows(path.join(root, workflow), { repo: REPO }).find((step) => step.agent?.name === agent)!;
}

/** The step of the shipped `workflow` that `agent` runs, its agent's `allowedTools` line replaced by `allowed` (`shippedWith`). */
const shippedAllowed = (agent: string, workflow: string, allowed: string): Step => shippedWith(agent, workflow, 'allowedTools', allowed);

/** The janitor's step, its agent's `allowedTools` line replaced by `allowed` (`shippedAllowed`). */
const argusAllowed = (allowed: string): Step => shippedAllowed('argus', 'janitor', allowed);

test('Argus is refused every wf verb that acts and every edit: it runs dontAsk, and no allow reaches one', () => {
  assert.deepEqual(acting(shippedStepOf('argus')), []);
});

test('REFUSED: Argus allowed every wf verb, the inbox whole or an edit, read from its file as a run reads it, could act', () => {
  assert.deepEqual(acting(argusAllowed('Bash(npx wf:*)')), [
    'Bash(npx wf start x)',
    'Bash(npx wf inbox add x)',
    'Bash(npx wf inbox queue x)',
    'Bash(npx wf inbox rm x)',
    'Bash(npx wf approve r s)',
    'Bash(npx wf retry r s)',
  ]);
  assert.deepEqual(acting(argusAllowed('Bash(npx wf stats:*), Bash(npx wf inbox:*)')), [
    'Bash(npx wf inbox add x)',
    'Bash(npx wf inbox queue x)',
    'Bash(npx wf inbox rm x)',
  ]);
  assert.deepEqual(acting(argusAllowed('Bash(wf:*), Edit(**)')), [
    'Bash(wf start x)',
    'Bash(wf inbox add x)',
    'Bash(wf inbox queue x)',
    'Bash(wf inbox rm x)',
    'Bash(wf approve r s)',
    'Bash(wf retry r s)',
    'Edit',
    'Write',
  ]);
  assert.deepEqual(acting({ ...shippedStepOf('argus'), permissionMode: 'auto' }), [
    'argus: not a dontAsk job, so every call no deny names runs',
  ]);
});

/** Every shipped skill that declares rules (`RULES_FILE`), by its name, each rule read as a run reads it (`readSkillRules`). */
const SHIPPED_RULES = SKILL_FOLDERS.filter((dir) => dir !== path.join(TEAM, 'skills')).flatMap((dir) =>
  fs
    .readdirSync(dir)
    .filter((name) => fs.existsSync(path.join(dir, name, RULES_FILE)))
    .map((name) => ({ skill: name, rules: readSkillRules(path.join(dir, name)) })),
);

/** The call a `breaks` pattern names, as the runtime records a denial of it: a command by its first word, any other tool by its name. */
function brokenBy(pattern: string): Call {
  const written = /^([^()]+)\((.*)\)$/s.exec(pattern);
  if (!written) return { tool: pattern };
  if (written[1] !== 'Bash') return { tool: written[1] };
  return {
    tool: 'Bash',
    command: written[2]
      .replace(/(?::\*| \*)$/, '')
      .trim()
      .split(/\s+/)[0],
  };
}

/**
 * Each pattern of `rules` that a dontAsk job's fence lets through, so no denial of it is ever recorded and the rule could never break:
 * reached by an allow of the step's, of the settings' or of a skill's, and by no deny of its own. Each as `<step>: <rule> <pattern>`.
 */
function unbreakable(step: Step, rules: readonly SkillRule[]): string[] {
  const allows = [...(step.allowedTools ?? []), ...(SETTINGS.permissions?.allow ?? []), ...SKILL_GRANTS];
  const denies = [...(step.disallowedTools ?? []), ...(SETTINGS.permissions?.deny ?? [])];
  return rules.flatMap((rule) =>
    rule.breaks
      .filter((pattern) => {
        const call = brokenBy(pattern);
        return allows.some((r) => reaches(r, call)) && !denies.some((r) => reaches(r, call));
      })
      .map((pattern) => `${step.name}: ${rule.id} ${pattern}`),
  );
}

/** Whether a step is a dontAsk job, which runs only what an allow reaches: what a denial of its is recorded for. */
const dontAskJob = (step: Step): boolean => step.permissionMode === 'dontAsk' && step.background !== true && step.workspace !== 'main';

test("every shipped skill's rules.json reads, and every call that breaks one of its rules is refused to each dontAsk step given it", () => {
  assert.ok(SHIPPED_RULES.length > 0, 'a skill ships its rules');
  for (const { skill, rules } of SHIPPED_RULES) {
    const steps = shipped()
      .map(({ step }) => step)
      .filter((step) => step.agent?.skills?.includes(skill) && dontAskJob(step));
    assert.ok(steps.length > 0, `${skill} declares rules, and no shipped dontAsk step is given it to refuse a call that breaks one`);
    for (const step of steps) assert.deepEqual(unbreakable(step, rules), [], `${skill}: a call that breaks a rule is allowed`);
  }
});

test('REFUSED: a call that breaks a shipped rule, allowed to the step given the skill, is named — by its own allow or the settings', () => {
  const [spec] = SHIPPED_RULES.filter(({ skill }) => skill === 'write-a-spec');
  assert.ok(spec, 'write-a-spec declares its rules');
  const seldon = shippedAllowed('seldon', 'build', 'Agent, Bash(npm run lint), Bash(cat:*)');
  assert.deepEqual(unbreakable(seldon, spec.rules), ['design: read-with-read Bash(cat:*)']);
  const cd = [{ id: 'checks-bare', says: 'never cd', breaks: ['Bash(cd:*)'] }];
  assert.deepEqual(unbreakable(shippedStepOf('seldon'), cd), ['design: checks-bare Bash(cd:*)'], "the settings' allow reaches cd");
  assert.deepEqual(unbreakable({ ...seldon, disallowedTools: ['Bash(cat:*)'] }, spec.rules), [], 'a deny of its own refuses it');
  assert.deepEqual(brokenBy('Bash(git -C:*)'), { tool: 'Bash', command: 'git' }, "a denial keeps a command's first word");
  assert.deepEqual(brokenBy('Read(//etc/**)'), { tool: 'Read' });
});
