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
 *
 * A fence also reaches the run's artifacts folder: each step is filed the folder of every step it comes after, read-only
 * (`handedMounts`), and reads what it holds and writes none of it, in any mode; it is filed no folder of a step it does not come after.
 * The reach is read off the config a filing gives the harness (`filedConfig`), as Claude Code holds a mount (`readsAt`, `writesAt`).
 *
 * The build workflow's design, implement and review steps each list `effect`, `shadcn` and `change-the-board` to their sessions
 * (`workSkillsMissing`), and every path a repository skill says its work is on matches a file of the checkout (`appliesUnmatched`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadWorkflows, readSkillRules, RULES_FILE } from '../src/folder/folder.store.ts';
import { appliesMatch, appliesOf, type SkillRule } from '../src/skills/skills.ts';
import { filedConfig } from '../src/filed/filed.ts';
import { handedMounts } from '../src/artifacts/artifacts.ts';
import { sandboxed, upstreamOf } from '../src/workflow/index.ts';
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

/** The steps of the build workflow that design, write or judge a change, and the skills each gives its session to list. */
const WORK_STEPS = ['design', 'implement', 'review'];
const WORK_SKILLS = ['effect', 'shadcn', 'change-the-board'];

/** Each skill of `WORK_SKILLS` a work step of `steps` does not give, as `<step>: <skill>`, read off the agent each step froze. */
const workSkillsMissing = (steps: readonly Step[]): string[] =>
  WORK_STEPS.flatMap((name) => {
    const given = steps.find((step) => step.name === name)?.agent?.skills ?? [];
    return WORK_SKILLS.filter((skill) => !given.includes(skill)).map((skill) => `${name}: ${skill}`);
  });

/** The build workflow's steps, read from a scratch copy of the shipped team whose step `step` has its `skills:` line replaced by `line`. */
function buildWith(step: string, line: string): Step[] {
  const root = scratch('wf-fences-build-');
  fs.cpSync(SHIPPED_HOLDERS[0], root, { recursive: true });
  const file = path.join(root, 'build', `${step}.md`);
  const text = fs.readFileSync(file, 'utf8');
  const changed = text.replace(/^skills: .*\n/m, line);
  assert.notEqual(changed, text, `${step} has a skills: line to replace`);
  fs.writeFileSync(file, changed);
  return loadWorkflows(path.join(root, 'build'), { repo: REPO });
}

test("build's design, implement and review each give effect, shadcn and change-the-board, whatever their agents give", () => {
  const build = FOLDERS.find((dir) => path.basename(dir) === 'build');
  assert.ok(build, 'the build workflow is shipped');
  assert.deepEqual(workSkillsMissing(loadWorkflows(build, placesOf(build))), []);
});

test('REFUSED: a work step that gives one of the three skills no more is named, read from its file as a run reads it', () => {
  assert.deepEqual(workSkillsMissing(buildWith('review', 'skills: effect, shadcn\n')), ['review: change-the-board']);
  assert.deepEqual(workSkillsMissing(buildWith('design', '')), ['design: effect', 'design: shadcn', 'design: change-the-board']);
});

/** The folders a walk of the checkout leaves out: what an install, a build or git writes, none of them a file a change is on. */
const NOT_CHECKOUT = new Set(['node_modules', '.git', 'dist', '.turbo']);

/** Every file under the checkout `repo`, by its path from it, but under `NOT_CHECKOUT`. */
function checkoutFiles(repo: string, under = ''): string[] {
  return fs
    .readdirSync(path.join(repo, under), { withFileTypes: true })
    .filter((entry) => !NOT_CHECKOUT.has(entry.name))
    .flatMap((entry) => {
      const file = under ? `${under}/${entry.name}` : entry.name;
      return entry.isDirectory() ? checkoutFiles(repo, file) : [file];
    });
}

/** Each glob a skill of `skillsDir` applies to (`applies:`) that no file of the checkout `repo` matches, as `<skill>: <glob>`. */
function appliesUnmatched(skillsDir: string, repo: string): string[] {
  const files = checkoutFiles(repo);
  return fs
    .readdirSync(skillsDir)
    .filter((skill) => fs.existsSync(path.join(skillsDir, skill, 'SKILL.md')))
    .flatMap((skill) =>
      appliesOf(fs.readFileSync(path.join(skillsDir, skill, 'SKILL.md'), 'utf8'))
        .filter((glob) => !files.some((file) => appliesMatch(file, [glob])))
        .map((glob) => `${skill}: ${glob}`),
    );
}

test('every path a repository skill applies to matches a file of the checkout, and the two that say so are read', () => {
  const skills = path.join(REPO, '.claude', 'skills');
  assert.deepEqual(appliesUnmatched(skills, REPO), []);
  assert.deepEqual(appliesOf(fs.readFileSync(path.join(skills, 'change-the-board', 'SKILL.md'), 'utf8')), ['apps/web/**']);
  assert.equal(appliesOf(fs.readFileSync(path.join(skills, 'effect', 'SKILL.md'), 'utf8')).length, 7);
});

test('REFUSED: a skill that applies to a path no file of the checkout has is named, beside one that matches', () => {
  const skills = scratch('wf-fences-applies-');
  for (const [name, applies] of [
    ['typo', '["apps/webb/**", "apps/web/**"]'],
    ['none', ''],
  ]) {
    fs.mkdirSync(path.join(skills, name));
    const line = applies ? `applies: ${applies}\n` : '';
    fs.writeFileSync(path.join(skills, name, 'SKILL.md'), `---\nname: ${name}\ndescription: Do it.\n${line}---\nDo it.\n`);
  }
  assert.deepEqual(appliesUnmatched(skills, REPO), ['typo: apps/webb/**']);
});

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

/** The run's artifacts folder the reach below is filed against, one folder per step under it. */
const RUN_ARTIFACTS = '/s/runs/r-1/artifacts';

/** A file the step `by` handed over, in its own folder of the run's artifacts. */
const handedBy = (by: string): string => path.join(RUN_ARTIFACTS, by, 'shot.png');

/** Each step of `steps` by its name, with the config its first filing gives its harness (`filedConfig`), in a run that mounts nothing. */
const filedOf = (steps: readonly Step[]): Map<string, Filed> =>
  new Map(
    steps.map((step) => [
      step.name,
      filedConfig(step, steps, { gates: [] }, { model: undefined, budgetUsd: undefined, runArtifacts: RUN_ARTIFACTS, own: {} }),
    ]),
  );

type Filed = ReturnType<typeof filedConfig>;

/** Whether `file` is under the folder a rule `Tool(//<folder>/**)` of the tool `tool` names, for a rule of that shape. */
const ruleCovers = (rule: string, tool: string, file: string): boolean => {
  const folder = new RegExp(`^${tool}\\(/(/.*)/\\*\\*\\)$`).exec(rule)?.[1];
  return folder !== undefined && file.startsWith(`${folder}/`);
};

/** Whether a mount of a filed config holds `file`, read-only or writable as `readOnly` says. */
const mountHolds = (config: Filed, file: string, readOnly: boolean): boolean =>
  (config.mounts ?? []).some((m) => m.readOnly === readOnly && file.startsWith(`${m.path}/`));

/** Whether a session filed with `config` reads `file` outside its workspace: a mount holds it, or a `Read(//<folder>/**)` allow does. */
const readsAt = (config: Filed, file: string): boolean =>
  mountHolds(config, file, true) ||
  mountHolds(config, file, false) ||
  (config.allowedTools ?? []).some((rule) => ruleCovers(rule, 'Read', file));

/**
 * Whether a session filed with `config` may write `file` outside its workspace: a writable mount or an `Edit(//<folder>/**)` allow names
 * it, and neither a read-only mount, whose deny beats every allow and mode, nor an `Edit(//<folder>/**)` deny holds it.
 */
const writesAt = (config: Filed, file: string): boolean =>
  (mountHolds(config, file, false) || (config.allowedTools ?? []).some((rule) => ruleCovers(rule, 'Edit', file))) &&
  !mountHolds(config, file, true) &&
  !(config.disallowedTools ?? []).some((rule) => ruleCovers(rule, 'Edit', file));

test('a later step reads, and never writes, what each step it comes after handed over; its own folder is held by none', () => {
  const filed = filedOf(loadWorkflows(TEAM_DEV));
  const review = filed.get('review')!;
  const ship = filed.get('ship')!;
  const implement = filed.get('implement')!;
  assert.ok(readsAt(review, handedBy('implement')), "review reads implement's pictures");
  assert.equal(writesAt(review, handedBy('implement')), false, "review writes none of implement's");
  for (const by of ['implement', 'review']) {
    assert.ok(readsAt(ship, handedBy(by)), `ship reads ${by}'s`);
    assert.equal(writesAt(ship, handedBy(by)), false, `ship writes none of ${by}'s`);
  }
  assert.equal(readsAt(implement, handedBy('review')), false, 'implement comes after nothing, and reads no folder of the run');
  for (const [name, config] of filed) {
    assert.equal(mountHolds(config, handedBy(name), true), false, `${name}'s own folder is not mounted read-only`);
    assert.equal(mountHolds(config, handedBy(name), false), false, `${name}'s own folder is not mounted`);
  }
});

test('REFUSED: a step does not read the folder of a step it does not come after', () => {
  const steps = loadWorkflows(folderOf({ a: 'permissionMode: dontAsk', b: 'permissionMode: dontAsk', c: 'after: a', d: 'after: b, c' }));
  const filed = filedOf(steps);
  const reads = (name: string): string[] => ['a', 'b', 'c', 'd'].filter((by) => readsAt(filed.get(name)!, handedBy(by)));
  assert.deepEqual(reads('c'), ['a'], "c reads a's, never its sibling b's nor d's after it");
  assert.deepEqual(reads('d'), ['a', 'b', 'c'], 'd reads b and c, and a through c');
  assert.deepEqual(reads('a'), [], 'a comes after nothing');
  assert.deepEqual(reads('b'), [], 'b comes after nothing');
  assert.deepEqual(
    handedMounts(
      steps.find((s) => s.name === 'd')!,
      steps,
      RUN_ARTIFACTS,
    ),
    ['a', 'b', 'c'].map((by) => ({ path: path.join(RUN_ARTIFACTS, by), readOnly: true })),
    "in the workflow's order",
  );
});

test('REFUSED: a handed folder mounted writable is open to a write, and an Edit allow on it is no write while it is mounted read-only', () => {
  const review = filedOf(loadWorkflows(TEAM_DEV)).get('review')!;
  const opened = { ...review, mounts: review.mounts!.map((m) => ({ ...m, readOnly: false })) };
  assert.ok(writesAt(opened, handedBy('implement')), 'the model sees a writable mount as a write');
  const allowed = { ...review, allowedTools: [...(review.allowedTools ?? []), `Edit(/${path.join(RUN_ARTIFACTS, 'implement')}/**)`] };
  assert.ok(writesAt({ ...allowed, mounts: [] }, handedBy('implement')), 'the model sees an Edit allow as a write');
  assert.equal(writesAt(allowed, handedBy('implement')), false, "the read-only mount's deny beats the allow");
});

test('a step on a sandboxed or a remote harness is filed no handed mount', () => {
  const steps = loadWorkflows(TEAM_DEV);
  const review = steps.find((s) => s.name === 'review')!;
  const codex = { ...review, harness: 'codex', permissionMode: 'read-only' };
  assert.deepEqual(handedMounts(codex, steps, RUN_ARTIFACTS), [], 'codex reads the disk in its sandbox already');
  assert.equal(Object.hasOwn(filedOf(steps.map((s) => (s.name === 'review' ? codex : s))).get('review')!, 'mounts'), false, 'no key');
  assert.deepEqual(handedMounts({ ...review, harness: 'a2a:peer' }, steps, RUN_ARTIFACTS), [], 'a remote agent is filed no local field');
  assert.deepEqual(handedMounts({ ...review, harness: 'claude' }, steps, RUN_ARTIFACTS), [
    { path: path.join(RUN_ARTIFACTS, 'implement'), readOnly: true },
  ]);
});

test('every shipped step on a harness fenced by a permission mode reads, and never writes, what each step it comes after handed over', () => {
  const checked: string[] = [];
  for (const dir of FOLDERS) {
    const steps = loadWorkflows(dir, placesOf(dir));
    const filed = filedOf(steps);
    for (const step of steps.filter((s) => !sandboxed(s.harness ?? 'claude') && !s.harness?.startsWith('a2a:'))) {
      for (const by of upstreamOf(steps, step.name)) {
        const config = filed.get(step.name)!;
        assert.ok(readsAt(config, handedBy(by)), `${path.basename(dir)}/${step.name} reads ${by}'s`);
        assert.equal(writesAt(config, handedBy(by)), false, `${path.basename(dir)}/${step.name} writes none of ${by}'s`);
        checked.push(`${path.basename(dir)}/${step.name} <- ${by}`);
      }
    }
  }
  assert.ok(checked.includes('build/review <- implement'), checked.join('\n'));
});
