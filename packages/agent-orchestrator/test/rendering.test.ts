/**
 * An agent rendered for Claude Code (`rendering.ts`, card 1 of `docs/design-2026-09-25-agents-and-skills.md`): the skills it gives by name,
 * found in the workflow's own root, the repository's `.claude/` or the store, the repository's before the store's; what becomes of Claude Code's
 * system prompt; what `wf start` writes under `runs/<id>/agents/<step>/`; and the flags the tick files the step with. Each refusal at shipped
 * defaults. The runs are folder teams, so no git is asked.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { AUTO_UNSUPPORTED, keepsAuto, parseAgent, renderAgent, WorkflowError, type Agent, type Workflow } from '../src/workflow.ts';
import { agentsFor, agentVersion, formerKeyLines, loadWorkflows, lookupRoots, skillsFor } from '../src/workflow-store.ts';
import { briefBody, noCodingStyle, renderedFlags, renderedPrompt, rendersAgent, unrendered } from '../src/rendering.ts';
import { scratch } from './scratch.ts';

const ROOT = scratch('wf-render-');
process.env.WF_ROOT = ROOT;
const { advance, readRun, start } = await import('../src/runner.ts');
const { agentFilesDir } = await import('../src/store.ts');

type Engine = Parameters<typeof advance>[0];
type Filed = { id: string; brief: string; cwd: string; harness?: string; config?: { claude?: Record<string, unknown>; permissionMode?: string } };

/** Just enough engine to file: every task's spec as it was filed, none of them started. */
const board = () => {
  const filed = new Map<string, Filed>();
  const e = {
    view: async (id: string) => ({ id, phase: 'pending', sessionId: null, state: { brief: filed.get(id)?.brief ?? '', settled: null, stopRequested: false, said: [], attempts: [] } }),
    file: async (spec: Filed) => { filed.set(spec.id, spec); return spec.id; },
    stop: async () => {},
    logs: async () => '',
    feed: async () => ({ entries: [], cursor: 0 }),
  } as unknown as Engine;
  return { e, filed };
};

/** A tree of files under a fresh directory, each written from `files` by its path from it; the directory. */
function tree(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(ROOT, 'tree-'));
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  }
  return dir;
}

/** What `fn` is refused with, as a `WorkflowError`'s message. */
function refusal(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof WorkflowError, String(err));
    return err.message;
  }
  return assert.fail('it was not refused');
}

const SKILL = (name: string, extra = '') => `---\nname: ${name}\ndescription: Use this when ${name.replace(/-/g, ' ')} is asked.\n${extra}---\nHow to ${name.replace(/-/g, ' ')}.\n`;

/** A team of one step `build` naming `agent: <name>` in `<dir>/workflows/team`, the agent and skills beside it as `files` gives them. */
const team = (agent: string, files: Record<string, string>, step = '---\nagent: builder\n---\nThe step\'s own note.\n'): string =>
  path.join(tree({ 'workflows/team/build.md': step, 'workflows/agents/builder.md': agent, ...files }), 'workflows', 'team');

test('an agent gives skills by name and says what becomes of the system prompt, each its own line, read and written back', () => {
  const a = parseAgent('builder', '---\nskills: review-a-change, write-a-note\nsystemPrompt: no-coding\ntools: Read, Skill\n---\nYou build.\n');
  assert.deepEqual(a.skills, ['review-a-change', 'write-a-note']);
  assert.equal(a.systemPrompt, 'no-coding');
  assert.equal('skills' in a.keys, false, 'no role key: a step does not inherit it as one of its own');
  const written = renderAgent({ name: 'builder', skills: 'review-a-change, write-a-note', systemPrompt: 'no-coding', keys: { tools: 'Read, Skill' }, body: 'You build.\n' });
  assert.equal(written, '---\nskills: review-a-change, write-a-note\nsystemPrompt: no-coding\ntools: Read, Skill\n---\nYou build.\n');
  assert.deepEqual(parseAgent('builder', written).skills, a.skills);
});

test('REFUSED at shipped defaults: a skill name that is none, a name given twice, an empty list, and a system prompt that is not one of the three', () => {
  assert.match(refusal(() => parseAgent('builder', '---\nskills: Review A Change\n---\nx\n')), /^agents\/builder\.md: `skills: Review A Change` has `Review A Change`, which is not a skill's name/);
  assert.match(refusal(() => parseAgent('builder', '---\nskills: a-b, a-b\n---\nx\n')), /names `a-b` twice/);
  assert.match(refusal(() => parseAgent('builder', '---\nskills: ,\n---\nx\n')), /names no skill/);
  assert.match(refusal(() => parseAgent('builder', '---\nsystemPrompt: terse\n---\nx\n')), /^agents\/builder\.md: `systemPrompt: terse` is not one of default, no-coding, own/);
});

test('REFUSED at shipped defaults: `systemPrompt: own` with no instructions, which would start a session with no system prompt at all', () => {
  assert.match(refusal(() => parseAgent('builder', '---\nsystemPrompt: own\n---\n')), /`systemPrompt: own` puts the agent's instructions in place of Claude Code's system prompt, and this agent has none/);
  assert.equal(parseAgent('builder', '---\nsystemPrompt: own\n---\nYou are the whole prompt.\n').systemPrompt, 'own');
});

test('REFUSED at shipped defaults: skills an agent gives with no `Skill` in its tools, or with `Skill` denied (F11)', () => {
  assert.match(refusal(() => parseAgent('builder', '---\nskills: write-a-note\ntools: Read, Write\n---\nx\n')), /^agents\/builder\.md: `skills: write-a-note` gives the agent skills, and `tools: Read, Write` has no `Skill`/);
  assert.match(refusal(() => parseAgent('builder', '---\nskills: write-a-note\ndisallowedTools: Skill\n---\nx\n')), /`disallowedTools: Skill` denies `Skill`/);
  assert.deepEqual(parseAgent('builder', '---\nskills: write-a-note\n---\nx\n').skills, ['write-a-note'], 'no `tools:` is every tool, Skill among them');
});

test("REFUSED at shipped defaults: a step's own `tools:` or deny list that takes `Skill` from an agent that gives skills", () => {
  const skills = { 'workflows/skills/write-a-note/SKILL.md': SKILL('write-a-note') };
  const agent = '---\nskills: write-a-note\ntools: Read, Skill\n---\nYou build.\n';
  assert.match(refusal(() => loadWorkflows(team(agent, skills, '---\nagent: builder\ntools: Read\n---\n'))), /^build: `agent: builder`: `skills: write-a-note` gives the agent skills, and `tools: Read` has no `Skill`/);
  assert.match(refusal(() => loadWorkflows(team(agent, skills, '---\nagent: builder\ndisallowedTools: Skill\n---\n'))), /^build: .*denies `Skill`/);
  assert.equal(loadWorkflows(team(agent, skills)).length, 1);
});

test('REFUSED at shipped defaults: a codex agent with skills or a system prompt, and a Claude Code agent with them run on codex by its step', () => {
  assert.match(refusal(() => parseAgent('builder', '---\nharness: codex\nskills: write-a-note\n---\nx\n')), /`skills: write-a-note` gives Claude Code skills from a plugin directory of the step's own, and codex loads none/);
  assert.match(refusal(() => parseAgent('builder', '---\nharness: codex\nsystemPrompt: no-coding\n---\nx\n')), /`systemPrompt: no-coding` shapes Claude Code's system prompt, and codex is handed its instructions in the brief/);
  const skills = { 'workflows/skills/write-a-note/SKILL.md': SKILL('write-a-note') };
  assert.match(refusal(() => loadWorkflows(team('---\nskills: write-a-note\n---\nYou build.\n', skills, '---\nagent: builder\nharness: codex\n---\n'))), /^build: `agent: builder`: `skills: write-a-note` gives Claude Code skills .* codex loads none/);
  assert.match(refusal(() => loadWorkflows(team('---\nsystemPrompt: own\n---\nYou build.\n', {}, '---\nagent: builder\nharness: codex\n---\n'))), /^build: `agent: builder`: `systemPrompt: own` shapes Claude Code's system prompt/);
  // A codex agent that says only `default`, or nothing, is what it was: its instructions in the brief.
  const [codex] = loadWorkflows(team('---\nharness: codex\nsystemPrompt: default\n---\nYou build.\n', {}));
  assert.equal(rendersAgent(codex!), false);
  assert.match(briefBody(codex!), /^You build\./);
});

test('REFUSED at shipped defaults: skills or a system prompt on a step that continues another session, which keeps its own (F13)', () => {
  const dir = team('---\nsystemPrompt: no-coding\n---\nYou build.\n', { 'workflows/team/plan.md': '---\n---\nPlan it.\n' }, '---\nagent: builder\nafter: plan\nresume: plan\n---\n');
  assert.match(refusal(() => loadWorkflows(dir)), /^build: `agent: builder`: `systemPrompt: no-coding` shapes the system prompt of a session the step starts, and `resume: plan` continues plan's/);
  // Instructions alone are told in the brief of a step that resumes, as before 2026-09-25.
  const told = loadWorkflows(team('---\n---\nYou build.\n', { 'workflows/team/plan.md': '---\n---\nPlan it.\n' }, '---\nagent: builder\nafter: plan\nresume: plan\n---\nAnd go on.\n')).find((s) => s.name === 'build')!;
  assert.equal(rendersAgent(told), false);
  assert.match(briefBody(told), /^You build\.[\s\S]*And go on\./);
});

test("REFUSED at shipped defaults: `auto` on a model Claude Code drops it on (F21) — the runtime's default mode or written — and let through where it is kept", () => {
  for (const model of ['haiku', 'claude-haiku-4-5-20251001', 'claude-sonnet-4-5']) {
    assert.match(refusal(() => loadWorkflows(team(`---\nmodel: ${model}\n---\nYou build.\n`, {}))), new RegExp(`^build: \`agent: builder\` names an agent whose file is refused — agents/builder\\.md: \`model: ${model}\` names no \`permissionMode:\`, so it is filed in \`auto\`, the runtime's default, and Claude Code drops \`auto\` on that model`));
    assert.match(refusal(() => loadWorkflows(team('---\n---\nx\n', {}, `---\nagent: builder\nmodel: ${model}\npermissionMode: auto\n---\n`))), /^build: `model: .*` says `permissionMode: auto`, and Claude Code drops `auto`/);
  }
  // Kept: a mode the model keeps, a model that keeps auto, a codex step, and no model at all.
  assert.equal(loadWorkflows(team('---\nmodel: haiku\npermissionMode: dontAsk\n---\nx\n', {})).length, 1);
  assert.equal(loadWorkflows(team('---\nmodel: sonnet\n---\nx\n', {})).length, 1);
  assert.equal(loadWorkflows(team('---\nharness: codex\nmodel: haiku\n---\nx\n', {})).length, 1);
  assert.equal(loadWorkflows(team('---\n---\nx\n', {})).length, 1);
  assert.deepEqual([...AUTO_UNSUPPORTED], ['haiku', 'claude-haiku-4-5', 'claude-sonnet-4-5'], 'F21 measured these three; a new one is measured first');
  assert.equal(keepsAuto('claude-sonnet-4-5-20250929'), false);
  assert.equal(keepsAuto('claude-sonnet-5'), true, 'a name that only begins like one measured is not it');
});

test('REFUSED at shipped defaults: a skill no place has, naming each place looked in, in order', () => {
  const repo = tree({});
  const dir = team('---\nskills: draw-a-map\n---\nYou build.\n', {});
  const message = refusal(() => loadWorkflows(dir, { repo, home: ROOT }));
  const looked = [path.join(path.dirname(dir), 'skills'), path.join(repo, '.claude', 'skills'), path.join(ROOT, 'workflows', 'skills')].join(', ');
  assert.match(message, /^build: `agent: builder` gives the skill `draw-a-map`, and no skills folder has it — looked in /);
  assert.ok(message.includes(looked), message);
});

test("a name is looked for in the workflow's own root, then the repository's .claude/, then the store — the repository's before the store's", () => {
  const home = tree({ 'workflows/skills/write-a-note/SKILL.md': SKILL('write-a-note'), 'workflows/agents/helper.md': '---\n---\nThe store\'s helper.\n' });
  const repo = tree({ '.claude/skills/write-a-note/SKILL.md': SKILL('write-a-note', 'preload: true\n'), '.claude/agents/helper.md': '---\n---\nThe repository\'s helper.\n' });
  const dir = team('---\nskills: write-a-note\n---\nYou build.\n', {});
  const places = { repo, home };
  assert.deepEqual(lookupRoots(dir, places), [path.dirname(dir), path.join(repo, '.claude'), path.join(home, 'workflows')]);
  assert.equal(skillsFor(dir, places).at.get('write-a-note'), path.join(repo, '.claude', 'skills', 'write-a-note'));
  assert.equal((agentsFor(dir, places).get('helper') as { body: string }).body.trim(), "The repository's helper.");
  assert.equal(skillsFor(dir, { home }).at.get('write-a-note'), path.join(home, 'workflows', 'skills', 'write-a-note'), 'with no repository, the store');
  // The workflow's own root first: a store workflow's is the store, so its own come first there.
  const own = team('---\nskills: write-a-note\n---\nYou build.\n', { 'workflows/skills/write-a-note/SKILL.md': SKILL('write-a-note') });
  assert.equal(skillsFor(own, places).at.get('write-a-note'), path.join(path.dirname(own), 'skills', 'write-a-note'));
});

// As Claude Code's `/agents` wizard writes a project subagent (2.1.282): its name, a description with an example, its tools, its model, its colour.
const WIZARD = '---\nname: code-reviewer\ndescription: Use this agent when a change needs a second look. Example: after a feature is written.\ntools: Read, Grep, Glob, Bash\nmodel: sonnet\ncolor: blue\n---\nYou are a careful code reviewer.\n';

test("an agent Claude Code's /agents wizard wrote into .claude/agents/ runs as it is: `color` read and ignored, every other line the run's", () => {
  const repo = tree({ '.claude/agents/code-reviewer.md': WIZARD });
  const home = tree({ 'workflows/team/review.md': '---\nagent: code-reviewer\n---\nReview the change.\n' });
  const [step] = loadWorkflows(path.join(home, 'workflows', 'team'), { repo, home });
  assert.deepEqual([step!.model, step!.tools, step!.permissionMode], ['sonnet', ['Read', 'Grep', 'Glob', 'Bash'], undefined]);
  const agent = agentsFor(path.join(home, 'workflows', 'team'), { repo, home }).get('code-reviewer') as Agent;
  assert.equal(agent.description, 'Use this agent when a change needs a second look. Example: after a feature is written.');
  assert.equal(agent.body.trim(), 'You are a careful code reviewer.');
  assert.ok(!('color' in agent.keys), 'not a role key: no step inherits it');
  assert.doesNotMatch(renderAgent({ name: agent.name, description: agent.description, keys: agent.keys, body: agent.body }), /color/, 'not written back');
});

test("REFUSED at shipped defaults: Claude Code's own subagent keys a run would drop — each named, with what does it in a run — and `model: inherit`, which a step has no parent to inherit from", () => {
  const cases: Array<[string, RegExp]> = [
    ['maxTurns: 20', /`budget:` and `deadlineSeconds:`/],
    ['mcpServers: github', /`\.mcp\.json`/],
    ['hooks: lint', /`\.claude\/settings\.json`/],
    ['memory: project', /no memory of an agent's own/],
    ['isolation: worktree', /`workspace:`/],
  ];
  for (const [line, why] of cases) {
    const said = refusal(() => parseAgent('code-reviewer', `---\ndescription: Reviews.\n${line}\n---\nYou review.\n`));
    assert.ok(said.startsWith(`agents/code-reviewer.md: \`${line.split(':')[0]}\` is Claude Code's own subagent key, and a run does not carry it to its sessions — `), said);
    assert.match(said, why);
  }
  assert.match(refusal(() => parseAgent('code-reviewer', WIZARD.replace('model: sonnet', 'model: inherit'))), /^agents\/code-reviewer\.md: `model: inherit` is Claude Code's word for a subagent that runs on the model of the conversation that called it/);
  // A key that is no one's is still refused as before.
  assert.match(refusal(() => parseAgent('code-reviewer', '---\ncolour: blue\n---\n')), /`colour` is not a key an agent has/);
});

test("REFUSED at shipped defaults: a name in both of one repository's places, workflows/ and .claude/ — an agent and a skill — naming both", () => {
  const repo = tree({
    'workflows/team/build.md': '---\nagent: builder\n---\n',
    'workflows/agents/builder.md': '---\nskills: write-a-note\n---\nYou build.\n',
    'workflows/skills/write-a-note/SKILL.md': SKILL('write-a-note'),
    '.claude/skills/write-a-note/SKILL.md': SKILL('write-a-note'),
  });
  const dir = path.join(repo, 'workflows', 'team');
  const skill = refusal(() => loadWorkflows(dir, { repo }));
  assert.match(skill, /write-a-note is a skill in both .* one repository's two places for skills, and nothing says which a session is given/);
  assert.ok(skill.includes(path.join(repo, 'workflows', 'skills', 'write-a-note')) && skill.includes(path.join(repo, '.claude', 'skills', 'write-a-note')), skill);
  fs.rmSync(path.join(repo, '.claude', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(repo, '.claude', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.claude', 'agents', 'builder.md'), '---\n---\nAnother builder.\n');
  assert.match(refusal(() => loadWorkflows(dir, { repo })), /builder is an agent in both .* one repository's two places for agents, and nothing says which runs/);
  // Read with no repository, the same folder finds its own and is not refused: the clash is one repository's.
  assert.equal(loadWorkflows(dir).length, 1);
});

test("the card is `card:` since 2026-09-25: a `skills:` line naming a card file is read as the card, `wf start` names it, and both at once are refused", () => {
  const card = JSON.stringify([{ id: 'build', name: 'Build', description: 'Builds it.', tags: ['code'] }]);
  const read = (file: string) => (file === 'builder.skills.json' ? card : undefined);
  const legacy = parseAgent('builder', '---\nskills: builder.skills.json\n---\nx\n', read);
  assert.equal(legacy.card?.file, 'builder.skills.json');
  assert.equal(legacy.skills, undefined, 'the line names a card, and gives no skills');
  const dir = team('---\nskills: builder.skills.json\n---\nYou build.\n', { 'workflows/agents/builder.skills.json': card });
  assert.ok(formerKeyLines(dir).some((line) => /builder\.md.*`skills: builder\.skills\.json`.*`card:`/.test(line)), formerKeyLines(dir).join('\n'));
  assert.match(refusal(() => parseAgent('builder', '---\nskills: builder.skills.json\ncard: builder.skills.json\n---\nx\n', read)), /names a card, as `skills:` did until 2026-09-25, and `card: builder\.skills\.json` names one too/);
  assert.match(refusal(() => renderAgent({ name: 'builder', skills: 'builder.skills.json', keys: {}, body: 'x\n' })), /^agents\/builder\.md: `skills: builder\.skills\.json` names a card, which is `card:` since 2026-09-25/);
});

test("an agent's version moves with each skill it gives, and not with one it does not", () => {
  const dir = team('---\nskills: write-a-note\n---\nYou build.\n', { 'workflows/skills/write-a-note/SKILL.md': SKILL('write-a-note'), 'workflows/skills/other/SKILL.md': SKILL('other') });
  const agents = path.join(path.dirname(dir), 'agents');
  const skills = path.join(path.dirname(dir), 'skills');
  const at = agentVersion(agents, 'builder');
  fs.appendFileSync(path.join(skills, 'other', 'SKILL.md'), 'More.\n');
  assert.equal(agentVersion(agents, 'builder'), at, 'a skill it does not give');
  fs.appendFileSync(path.join(skills, 'write-a-note', 'SKILL.md'), 'More.\n');
  const edited = agentVersion(agents, 'builder');
  assert.notEqual(edited, at, 'its SKILL.md');
  fs.writeFileSync(path.join(skills, 'write-a-note', 'template.md'), '# A template\n');
  assert.notEqual(agentVersion(agents, 'builder'), edited, 'a file beside it, which the plugin copies too');
});

/** A step as the parser resolves it, for the pure functions. */
const resolved = (agent: string, files: Record<string, string> = {}, step?: string): Workflow => loadWorkflows(team(agent, files, step))[0]!;

test('the prompt is the instructions, then each skill by its namespaced name, then each skill that asks to be told whole', () => {
  const step = resolved('---\nskills: write-a-note, review-a-change\n---\nYou build.\n', { 'workflows/skills/write-a-note/SKILL.md': SKILL('write-a-note'), 'workflows/skills/review-a-change/SKILL.md': SKILL('review-a-change') });
  assert.equal(renderedPrompt(step, [{ name: 'write-a-note' }, { name: 'review-a-change', whole: 'Read the diff.\n' }]),
    'You build.\n\nYour skills, each loaded with the Skill tool by its name when you need it: `hkb-builder:write-a-note`.\n\n## Skill `hkb-builder:review-a-change`\n\nRead the diff.\n');
  assert.match(noCodingStyle('builder'), /^---\nname: no-coding\n[\s\S]*keep-coding-instructions: false\n---\n/);
});

test('the flags: the prompt appended by default and for no-coding, in place of Claude Code\'s for own; the plugin for skills or a style; the style by its namespaced name', () => {
  const dir = '/runs/r/agents/build';
  const flags = (agent: string, files: Record<string, string> = {}) => renderedFlags(resolved(agent, files), dir);
  const skill = { 'workflows/skills/write-a-note/SKILL.md': SKILL('write-a-note') };
  assert.deepEqual(flags('---\n---\nYou build.\n'), { appendSystemPromptFile: `${dir}/prompt.md` });
  assert.deepEqual(flags('---\nskills: write-a-note\n---\nYou build.\n', skill), { appendSystemPromptFile: `${dir}/prompt.md`, pluginDir: [`${dir}/hkb-builder`] });
  assert.deepEqual(flags('---\nsystemPrompt: own\n---\nYou build.\n'), { systemPromptFile: `${dir}/prompt.md` });
  assert.deepEqual(flags('---\nsystemPrompt: no-coding\n---\nYou build.\n'), {
    appendSystemPromptFile: `${dir}/prompt.md`,
    pluginDir: [`${dir}/hkb-builder`],
    settings: JSON.stringify({ outputStyle: 'hkb-builder:no-coding' }),
  });
  // Nothing to render: an agent with no instructions, no skills and the default prompt, and a step with no agent.
  assert.equal(flags('---\nmodel: opus\n---\n'), undefined);
  assert.equal(renderedFlags(loadWorkflows(path.join(tree({ 'workflows/team/build.md': 'Just a step.\n' }), 'workflows', 'team'))[0]!, dir), undefined);
});

test('a rendered step is briefed with its own note alone, and one whose folder is gone is told as before — its instructions in its brief, no flags', () => {
  const step = resolved('---\n---\nYou build.\n');
  assert.equal(briefBody(step).trim(), "The step's own note.");
  const before = unrendered(step);
  assert.equal(rendersAgent(before), false);
  assert.match(briefBody(before), /^You build\.\n[\s\S]*The step's own note\./);
  assert.equal(renderedFlags(before, '/x'), undefined);
});

// ─── wf start and the tick ──────────────────────────────────────────────────

/** A folder team in the store's own workflows, beside the store's agents and skills. */
function storeTeam(name: string, steps: Record<string, string>): string {
  const dir = path.join(ROOT, 'workflows', name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [step, text] of Object.entries(steps)) fs.writeFileSync(path.join(dir, `${step}.md`), text);
  return dir;
}
const FOLDER = 'workspace: folder\npermissionMode: dontAsk\nallowedTools: Edit(**)\n';
const HERE = fs.mkdirSync(path.join(ROOT, 'here'), { recursive: true }) ?? path.join(ROOT, 'here');
fs.mkdirSync(path.join(ROOT, 'workflows', 'agents'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'workflows', 'skills', 'write-a-note'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'workflows', 'agents', 'scribe.md'), '---\nskills: write-a-note, mind-the-tone\nsystemPrompt: no-coding\ntools: Read, Edit, Skill\n---\nYou write notes.\n');
fs.writeFileSync(path.join(ROOT, 'workflows', 'agents', 'coder.md'), '---\nharness: codex\n---\nYou write code.\n');
fs.writeFileSync(path.join(ROOT, 'workflows', 'skills', 'write-a-note', 'SKILL.md'), SKILL('write-a-note'));
fs.writeFileSync(path.join(ROOT, 'workflows', 'skills', 'write-a-note', 'template.md'), '# Title\n');
// The repository's, for a folder team started from it: the directory it is started in is the repository its `.claude/` is read from.
fs.mkdirSync(path.join(HERE, '.claude', 'skills', 'mind-the-tone'), { recursive: true });
fs.writeFileSync(path.join(HERE, '.claude', 'skills', 'mind-the-tone', 'SKILL.md'), SKILL('mind-the-tone', 'preload: true\n'));

test("wf start renders each Claude Code step's agent under runs/<id>/agents/<step>/, and the tick files it with the flags and a brief without the instructions", async () => {
  const dir = storeTeam('noted', { write: `---\nagent: scribe\n${FOLDER}---\nWrite about tides.\n`, code: `---\nagent: coder\nworkspace: folder\nafter: write\n---\nCode it.\n` });
  const run = start({ brief: 'a note on tides', repo: HERE, workflowDir: dir });
  const at = agentFilesDir(run, 'write');
  assert.equal(fs.readFileSync(path.join(at, 'prompt.md'), 'utf8'),
    'You write notes.\n\nYour skills, each loaded with the Skill tool by its name when you need it: `hkb-scribe:write-a-note`.\n\n## Skill `hkb-scribe:mind-the-tone`\n\nHow to mind the tone.\n');
  assert.equal(fs.readFileSync(path.join(at, 'hkb-scribe', 'skills', 'write-a-note', 'SKILL.md'), 'utf8'), SKILL('write-a-note'), 'the store\'s skill, copied');
  assert.equal(fs.readFileSync(path.join(at, 'hkb-scribe', 'skills', 'write-a-note', 'template.md'), 'utf8'), '# Title\n', 'whole, with what is beside its SKILL.md');
  assert.ok(fs.existsSync(path.join(at, 'hkb-scribe', 'skills', 'mind-the-tone', 'SKILL.md')), "the repository's skill, copied");
  assert.equal(JSON.parse(fs.readFileSync(path.join(at, 'hkb-scribe', '.claude-plugin', 'plugin.json'), 'utf8')).name, 'hkb-scribe');
  assert.equal(fs.readFileSync(path.join(at, 'hkb-scribe', 'output-styles', 'no-coding.md'), 'utf8'), noCodingStyle('scribe'));
  assert.equal(fs.existsSync(agentFilesDir(run, 'code')), false, 'a codex step is not rendered');

  // An edit after the start reaches no run already started: the folder is the run's.
  fs.appendFileSync(path.join(ROOT, 'workflows', 'skills', 'write-a-note', 'SKILL.md'), 'Edited later.\n');
  assert.doesNotMatch(fs.readFileSync(path.join(at, 'hkb-scribe', 'skills', 'write-a-note', 'SKILL.md'), 'utf8'), /Edited later/);

  const { e, filed } = board();
  assert.deepEqual((await advance(e, readRun(run.id))).filed, ['write']);
  const write = filed.get(`${run.id}-write`)!;
  assert.deepEqual(write.config?.claude, {
    appendSystemPromptFile: path.join(at, 'prompt.md'),
    pluginDir: [path.join(at, 'hkb-scribe')],
    settings: JSON.stringify({ outputStyle: 'hkb-scribe:no-coding' }),
  });
  assert.match(write.brief, /^Write about tides\.\n/, 'the step\'s own note first');
  assert.doesNotMatch(write.brief, /You write notes/, 'the instructions are in the system prompt, not the brief');
});

test('a codex step is filed as before: its instructions in its brief, and no Claude Code flags', async () => {
  const dir = storeTeam('coded', { code: `---\nagent: coder\nworkspace: folder\n---\nCode it.\n` });
  const run = start({ brief: 'some code', repo: HERE, workflowDir: dir });
  const { e, filed } = board();
  await advance(e, readRun(run.id));
  const code = filed.get(`${run.id}-code`)!;
  assert.equal(code.config?.claude, undefined);
  assert.match(code.brief, /^You write code\.\n\nCode it\./);
});

test('a rendered step whose folder is gone is filed as before 2026-09-25 — the instructions in its brief, no flag naming a file that is not there — and told its skills whole', async () => {
  const dir = storeTeam('lost', { write: `---\nagent: scribe\n${FOLDER}---\nWrite about tides.\n` });
  const run = start({ brief: 'a note on tides', repo: HERE, workflowDir: dir });
  fs.rmSync(agentFilesDir(run, 'write'), { recursive: true });
  const { e, filed } = board();
  await advance(e, readRun(run.id));
  const write = filed.get(`${run.id}-write`)!;
  assert.equal(write.config?.claude, undefined);
  assert.match(write.brief, /^You write notes\.\n\nWrite about tides\./);
  // With no plugin there is nothing to load, so each skill is told whole, read again where a start of the run's folder finds it: the store's.
  // A folder run keeps no repository, so the skill the start found in the one it was typed in is said not to be told, and where it was looked for.
  assert.match(write.brief, /Write about tides\.\n\nNo skill is loaded with the Skill tool for this step[^\n]*\n\n## Skill `write-a-note`\n\nHow to write a note\./);
  assert.match(write.brief, /\n## Skill `mind-the-tone`\n\nNot told: no folder holds it in [^\n]*\/workflows\/skills\. Sign off blocked if you need it\.\n\n## What was asked for/);
});

test("a git run's step whose folder is gone is told a skill from the run's repository too, as its start found it", async () => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q', '-b', 'main');
  fs.mkdirSync(path.join(repo, '.claude', 'skills', 'mind-the-tone'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.claude', 'skills', 'mind-the-tone', 'SKILL.md'), SKILL('mind-the-tone', 'preload: true\n').replace('How to', 'In this repository, how to'));
  git('add', '-A');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'skills');
  const dir = storeTeam('lost-git', { write: '---\nagent: scribe\n---\nWrite about tides.\n' });
  const run = start({ brief: 'a note on tides', repo, workflowDir: dir, isolate: false });
  fs.rmSync(agentFilesDir(run, 'write'), { recursive: true });
  const { e, filed } = board();
  await advance(e, readRun(run.id));
  const write = filed.get(`${run.id}-write`)!;
  assert.equal(write.config?.claude, undefined);
  assert.match(write.brief, /\n## Skill `mind-the-tone`\n\nIn this repository, how to mind the tone\.\n/);
});

test('REFUSED at shipped defaults: wf start of a team whose agent gives a skill no place has, and nothing written', () => {
  const dir = storeTeam('unskilled', { write: `---\nagent: scribe\n${FOLDER}---\nWrite.\n` });
  const runs = path.join(ROOT, 'runs');
  const before = fs.existsSync(runs) ? fs.readdirSync(runs).sort() : [];
  // Started from a directory whose `.claude/` has no mind-the-tone: the store has write-a-note alone.
  const elsewhere = fs.mkdtempSync(path.join(ROOT, 'elsewhere-'));
  assert.throws(() => start({ brief: 'x', repo: elsewhere, workflowDir: dir }), (e: Error) => /gives the skill `mind-the-tone`, and no skills folder has it/.test(e.message));
  assert.deepEqual(fs.existsSync(runs) ? fs.readdirSync(runs).sort() : [], before);
});
