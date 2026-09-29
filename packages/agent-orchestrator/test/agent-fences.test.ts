/**
 * Every shipped step is refused `git push`, a forced branch delete and Playwright's `browser_run_code_unsafe` by its own fence, and the
 * checkout's `.claude/settings.json` refuses none of them: the settings bind a person's own session in this checkout too, and a person
 * may ask their session to push.
 *
 * Nemia ships no team today, so the guard reads whatever is shipped (`shippedFolders`, none) and holds the tests' team (`team.ts`) to the
 * same fence: each refusal below is made on the team, cut back, and on a watcher's step written here, so a team shipped again is held
 * by a guard proven to refuse.
 *
 * Each step is read at shipped defaults, as `wf start` freezes it (`loadWorkflows`). A step in `auto` — the engine's default — runs
 * whatever no deny names, so its own `disallowedTools` must name each call. A step in `dontAsk` runs only what an allow reaches, so
 * no rule of its `allowedTools`, of the settings' allow or of a skill's `allowed-tools` may reach one. A step that reads settings the
 * repository does not ship — a background session reads the person's user settings, and a job in the checkout itself its
 * `settings.local.json` — may be allowed anything there, so it too must name each call itself. A step on codex is fenced by a
 * read-only sandbox. The matcher is Claude Code's rule shapes this suite relies on, and throws on a wildcard it does not model, so an
 * allow it cannot read fails the test rather than passing it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadWorkflows } from '../src/folder/folder.store.ts';
import { scratch } from './scratch.ts';
import { shippedFolders, SHIPPED_HOLDERS, TEAM, TEAM_DEV, teamCopy } from './team.ts';

const REPO = path.join(import.meta.dirname, '..', '..', '..');

/** Every shipped workflow folder, read off the disk: none today. */
const FOLDERS = shippedFolders();

/** Every shipped agents folder there is: each agent in it is named by a step of a shipped folder. */
const AGENT_FOLDERS = SHIPPED_HOLDERS.map((holder) => path.join(holder, 'agents')).filter((dir) => fs.existsSync(dir));

/** Every folder of skills a step may load, whose `allowed-tools` a loaded skill grants the session: the repository's, shipped, the team's. */
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
  { tool: 'mcp__playwright__browser_run_code_unsafe' },
];

/** A call as a rule would name it, for a message. */
const shown = (call: Call): string => (call.command === undefined ? call.tool : `Bash(${call.command})`);

/**
 * Whether a permission rule reaches a call: a bare tool name is that tool, `mcp__<server>` or `mcp__<server>__*` every tool of the
 * server, `Bash(x)` the command `x` exactly, and `Bash(x:*)` or `Bash(x *)` the command `x` or `x` followed by a space and more.
 * Throws on a `*` anywhere else, which this matcher does not model.
 */
function reaches(rule: string, call: Call): boolean {
  const bash = /^Bash\((.*)\)$/s.exec(rule)?.[1];
  if (bash === undefined) {
    if (rule.includes('(')) return false;
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
    if (denies.some((rule) => reaches(rule, call))) return false;
    return !dontAsk || allows.some((rule) => reaches(rule, call));
  }).map((call) => `${step.name}: ${shown(call)}`);
}

/** Every step of every shipped folder, by its folder. */
const shipped = (): { dir: string; step: Step }[] => FOLDERS.flatMap((dir) => loadWorkflows(dir).map((step) => ({ dir, step })));

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
  assert.throws(
    () => reaches('Bash(git * push)', push),
    (err: Error) => err.message.includes('not modelled'),
  );
  assert.throws(
    () => reaches('mcp__play*', unsafe),
    (err: Error) => err.message.includes('not modelled'),
  );
});

test('every shipped agent is named by a shipped step, so the fence below reads each one', () => {
  const named = new Set(shipped().flatMap(({ step }) => (step.agent ? [step.agent.name] : [])));
  for (const dir of AGENT_FOLDERS)
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md'))
      assert.ok(named.has(path.basename(file, '.md')), `${path.join(dir, file)} is named by no shipped step`);
});

test('every shipped step is refused git push, a forced branch delete and browser_run_code_unsafe: by its own deny in auto, by no allow in dontAsk, by a read-only sandbox on codex', () => {
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
        'disallowedTools: Bash(git push:*), Bash(git branch -D:*), Bash(git branch --delete --force:*), mcp__playwright__browser_run_code_unsafe',
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
    "a job in the checkout itself reads the person's settings.local.json there",
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
