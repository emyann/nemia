/**
 * An agent rendered for Claude Code (`agents/agents.ts`): the skills it gives by name, found in the workflow's own root, the repository's
 * `.claude/` or the store, the repository's before the store's; what becomes of Claude Code's own prompt (`harnessPrompt:`); what
 * `nemia start` writes under `runs/<id>/agents/<step>/`; and the flags the tick files the step with. Each refusal at shipped defaults. The
 * runs are folder teams, so no git is asked; a folder team started from `HERE` reads that directory's `.claude/` as its repository's.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { codex, CODEX_SANDBOXES } from 'agent-runtime';
import { CLAUDE_AUTO_DROPPED } from 'agent-runtime/vocabulary';
import { autoDropped, modeOf, parseAgent, parseWorkflow, renderAgent, WorkflowError, type Agent, type Workflow } from '../src/workflow.ts';
import { loadWorkflows } from '../src/folder/folder.store.ts';
import { agentsFor, agentVersion } from '../src/agents/read.store.ts';
import { PLACE_SKILLS, isShippedPlace, lookupRoots, skillsFor } from '../src/skills/read.store.ts';
import { SHIPPED_PLACE } from '../src/place/shipped.store.ts';
import { briefBody, noCodingStyle, pluginOf, renderedFlags, renderedPrompt, rendersAgent, unrendered } from '../src/agents/agents.ts';
import { scratch } from './scratch.ts';
import { promised } from './promised.ts';
import { testPlace } from '../place/memory/index.ts';
import { eachTest, runGiven, runOver } from './placed.ts';

const ROOT = scratch('wf-render-');
process.env.WF_ROOT = ROOT;
const stand = eachTest(testPlace);
const { advanceRun, startRun, runWith: runEngine } = await import('../src/runner.ts');
const runWith = runOver(runEngine, () => stand().layer);
const runPlaced = runGiven(() => stand().layer);
const { readRun } = await import('../src/record/record.store.ts');
const { agentFilesDir } = await import('../src/agents/agents.store.ts');

type Filed = {
  id: string;
  brief: string;
  cwd: string;
  harness?: string;
  config?: { claude?: Record<string, unknown>; permissionMode?: string };
};

/** Just enough engine to file: every task's spec as it was filed, none of them started. */
const board = () => {
  const filed = new Map<string, Filed>();
  const e = promised({
    view: async (id: string) => ({
      id,
      phase: 'pending',
      sessionId: null,
      state: { brief: filed.get(id)?.brief ?? '', settled: null, stopRequested: false, said: [], attempts: [] },
    }),
    file: async (spec: Filed) => {
      filed.set(spec.id, spec);
      return spec.id;
    },
    stop: async () => {},
    logs: async () => '',
    feed: async () => ({ entries: [], cursor: 0 }),
  });
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

const SKILL = (name: string, extra = '') =>
  `---\nname: ${name}\ndescription: Use this when ${name.replace(/-/g, ' ')} is asked.\n${extra}---\nHow to ${name.replace(/-/g, ' ')}.\n`;

/**
 * A team of one step `build` on `place: git` naming `agent: <name>` in `<dir>/workflows/team`, the agent and skills beside it as `files`
 * gives them.
 */
const team = (agent: string, files: Record<string, string>, step = "---\nagent: builder\n---\nThe step's own note.\n"): string =>
  path.join(
    tree({ 'workflows/team/build.md': step.replace(/^---\n/, '---\nplace: git\n'), 'workflows/agents/builder.md': agent, ...files }),
    'workflows',
    'team',
  );

test("an agent gives skills by name and says what becomes of Claude Code's prompt, each its own line, read and written back", () => {
  const a = parseAgent(
    'builder',
    '---\nskills: review-a-change, write-a-note\nharnessPrompt: no-coding\ntools: Read, Skill\n---\nYou build.\n',
  );
  assert.deepEqual(a.skills, ['review-a-change', 'write-a-note']);
  assert.equal(a.harnessPrompt, 'no-coding');
  assert.equal('skills' in a.keys, false, 'no role key: a step does not inherit it as one of its own');
  const written = renderAgent({
    name: 'builder',
    skills: 'review-a-change, write-a-note',
    harnessPrompt: 'no-coding',
    keys: { tools: 'Read, Skill' },
    body: 'You build.\n',
  });
  assert.equal(written, '---\nskills: review-a-change, write-a-note\nharnessPrompt: no-coding\ntools: Read, Skill\n---\nYou build.\n');
  assert.deepEqual(parseAgent('builder', written).skills, a.skills);
  for (const word of ['keep', 'no-coding', 'replace']) {
    const agent = parseAgent('builder', `---\nharnessPrompt: ${word}\n---\nYou build.\n`);
    assert.equal(agent.harnessPrompt, word);
    assert.equal(
      renderAgent({ name: 'builder', harnessPrompt: agent.harnessPrompt, keys: {}, body: agent.body }),
      `---\nharnessPrompt: ${word}\n---\nYou build.\n`,
    );
  }
});

test('the former `systemPrompt:` line is still read, each of its words as the one it is now, and written back as `harnessPrompt:`', () => {
  for (const [former, now] of [
    ['default', 'keep'],
    ['no-coding', 'no-coding'],
    ['own', 'replace'],
  ] as const) {
    const agent = parseAgent('builder', `---\nsystemPrompt: ${former}\n---\nYou build.\n`);
    assert.equal(agent.harnessPrompt, now, `systemPrompt: ${former}`);
    assert.equal('systemPrompt' in agent, false, 'nothing reads the former field');
    const written = renderAgent({ name: 'builder', harnessPrompt: agent.harnessPrompt, keys: {}, body: agent.body });
    assert.equal(written, `---\nharnessPrompt: ${now}\n---\nYou build.\n`);
  }
});

test('REFUSED at shipped defaults: a skill name that is none, a name given twice, an empty list, and a harness prompt that is not one of the three', () => {
  assert.match(
    refusal(() => parseAgent('builder', '---\nskills: Review A Change\n---\nx\n')),
    /^agents\/builder\.md: `skills: Review A Change` has `Review A Change`, which is not a skill's name/,
  );
  assert.match(
    refusal(() => parseAgent('builder', '---\nskills: a-b, a-b\n---\nx\n')),
    /names `a-b` twice/,
  );
  assert.match(
    refusal(() => parseAgent('builder', '---\nskills: ,\n---\nx\n')),
    /names no skill/,
  );
  assert.match(
    refusal(() => parseAgent('builder', '---\nharnessPrompt: terse\n---\nx\n')),
    /^agents\/builder\.md: `harnessPrompt: terse` is not one of keep, no-coding, replace/,
  );
  assert.match(
    refusal(() => parseAgent('builder', '---\nsystemPrompt: terse\n---\nx\n')),
    /^agents\/builder\.md: `systemPrompt: terse` is not one of keep, no-coding, replace/,
  );
});

test('REFUSED at shipped defaults: a former word under the new key, which a file written after the rename does not say', () => {
  assert.match(
    refusal(() => parseAgent('builder', '---\nharnessPrompt: own\n---\nx\n')),
    /^agents\/builder\.md: `harnessPrompt: own` is not one of keep, no-coding, replace\. `own` is the former word, under `systemPrompt:`, for `replace`: write `harnessPrompt: replace`/,
  );
  assert.match(
    refusal(() => parseAgent('builder', '---\nharnessPrompt: default\n---\nx\n')),
    /write `harnessPrompt: keep`/,
  );
});

test('REFUSED at shipped defaults: `systemPrompt:` and `harnessPrompt:` both set, which are one key', () => {
  assert.match(
    refusal(() => parseAgent('builder', '---\nsystemPrompt: own\nharnessPrompt: keep\n---\nx\n')),
    /^agents\/builder\.md: `harnessPrompt: keep` and `systemPrompt: own` are both set, and they are one key/,
  );
});

test('REFUSED: a draft that sends the former `systemPrompt`, among its keys or as its own line, which nothing writes', () => {
  assert.match(
    refusal(() => renderAgent({ name: 'builder', keys: { systemPrompt: 'own' } as never, body: 'x' })),
    /^agents\/builder\.md: `systemPrompt` is `harnessPrompt`'s former name, which a file may still say but nothing writes/,
  );
  assert.match(
    refusal(() => renderAgent({ name: 'builder', systemPrompt: 'own', keys: {}, body: 'x' } as never)),
    /^agents\/builder\.md: `systemPrompt` is `harnessPrompt`'s former name/,
  );
});

test('REFUSED at shipped defaults: `harnessPrompt: replace` with no instructions, which would start a session with no prompt at all', () => {
  assert.match(
    refusal(() => parseAgent('builder', '---\nharnessPrompt: replace\n---\n')),
    /`harnessPrompt: replace` puts the agent's instructions in place of Claude Code's own prompt, and this agent has none/,
  );
  assert.match(
    refusal(() => parseAgent('builder', '---\nsystemPrompt: own\n---\n')),
    /`systemPrompt: own` puts the agent's instructions in place of Claude Code's own prompt, and this agent has none/,
  );
  assert.equal(parseAgent('builder', '---\nharnessPrompt: replace\n---\nYou are the whole prompt.\n').harnessPrompt, 'replace');
});

test('REFUSED at shipped defaults: skills an agent gives with no `Skill` in its tools, or with `Skill` denied (F11)', () => {
  assert.match(
    refusal(() => parseAgent('builder', '---\nskills: write-a-note\ntools: Read, Write\n---\nx\n')),
    /^agents\/builder\.md: `skills: write-a-note` gives the agent skills, and `tools: Read, Write` has no `Skill`/,
  );
  assert.match(
    refusal(() => parseAgent('builder', '---\nskills: write-a-note\ndisallowedTools: Skill\n---\nx\n')),
    /`disallowedTools: Skill` denies `Skill`/,
  );
  assert.deepEqual(
    parseAgent('builder', '---\nskills: write-a-note\n---\nx\n').skills,
    ['write-a-note'],
    'no `tools:` is every tool, Skill among them',
  );
});

test("REFUSED at shipped defaults: a step's own `tools:` or deny list that takes `Skill` from an agent that gives skills", () => {
  const skills = { 'workflows/skills/write-a-note/SKILL.md': SKILL('write-a-note') };
  const agent = '---\nskills: write-a-note\ntools: Read, Skill\n---\nYou build.\n';
  assert.match(
    refusal(() => loadWorkflows(team(agent, skills, '---\nagent: builder\ntools: Read\n---\n'))),
    /^build: `agent: builder`: `skills: write-a-note` gives the agent skills, and `tools: Read` has no `Skill`/,
  );
  assert.match(
    refusal(() => loadWorkflows(team(agent, skills, '---\nagent: builder\ndisallowedTools: Skill\n---\n'))),
    /^build: .*denies `Skill`/,
  );
  assert.equal(loadWorkflows(team(agent, skills)).length, 1);
});

test('REFUSED at shipped defaults: a codex agent with skills or a harness prompt, and a Claude Code agent with them run on codex by its step', () => {
  assert.match(
    refusal(() => parseAgent('builder', '---\nharness: codex\nskills: write-a-note\n---\nx\n')),
    /`skills: write-a-note` gives Claude Code skills from a plugin directory of the step's own, and codex loads none/,
  );
  assert.match(
    refusal(() => parseAgent('builder', '---\nharness: codex\nharnessPrompt: no-coding\n---\nx\n')),
    /`harnessPrompt: no-coding` shapes Claude Code's own prompt, and codex is handed its instructions in the brief/,
  );
  const skills = { 'workflows/skills/write-a-note/SKILL.md': SKILL('write-a-note') };
  assert.match(
    refusal(() =>
      loadWorkflows(team('---\nskills: write-a-note\n---\nYou build.\n', skills, '---\nagent: builder\nharness: codex\n---\n')),
    ),
    /^build: `agent: builder`: `skills: write-a-note` gives Claude Code skills .* codex loads none/,
  );
  assert.match(
    refusal(() => loadWorkflows(team('---\nharnessPrompt: replace\n---\nYou build.\n', {}, '---\nagent: builder\nharness: codex\n---\n'))),
    /^build: `agent: builder`: `harnessPrompt: replace` shapes Claude Code's own prompt/,
  );
  assert.match(
    refusal(() => loadWorkflows(team('---\nsystemPrompt: own\n---\nYou build.\n', {}, '---\nagent: builder\nharness: codex\n---\n'))),
    /^build: `agent: builder`: `harnessPrompt: replace` shapes Claude Code's own prompt/,
    'the former line is judged as the word it is now',
  );
  const [codex] = loadWorkflows(team('---\nharness: codex\nharnessPrompt: keep\n---\nYou build.\n', {}));
  assert.equal(
    rendersAgent(codex),
    false,
    'a codex agent that says only `keep`, or nothing, is not rendered: its instructions are in the brief',
  );
  assert.match(briefBody(codex), /^You build\./);
});

test('REFUSED at shipped defaults: skills or a harness prompt on a step that continues another session, which keeps its own (F13)', () => {
  const dir = team(
    '---\nharnessPrompt: no-coding\n---\nYou build.\n',
    { 'workflows/team/plan.md': '---\nplace: git\n---\nPlan it.\n' },
    '---\nagent: builder\nafter: plan\nresume: plan\n---\n',
  );
  assert.match(
    refusal(() => loadWorkflows(dir)),
    /^build: `agent: builder`: `harnessPrompt: no-coding` shapes the prompt of a session the step starts, and `resume: plan` continues plan's/,
  );
  const told = loadWorkflows(
    team(
      '---\n---\nYou build.\n',
      { 'workflows/team/plan.md': '---\nplace: git\n---\nPlan it.\n' },
      '---\nagent: builder\nafter: plan\nresume: plan\n---\nAnd go on.\n',
    ),
  ).find((s) => s.name === 'build')!;
  assert.equal(rendersAgent(told), false, 'instructions alone are told in the brief of a step that resumes');
  assert.match(briefBody(told), /^You build\.[\s\S]*And go on\./);
});

test("REFUSED at shipped defaults: `auto` on a model Claude Code drops it on (F21) — the runtime's default mode or written — and let through where it is kept", () => {
  for (const model of ['haiku', 'claude-haiku-4-5-20251001', 'claude-sonnet-4-5']) {
    assert.match(
      refusal(() => loadWorkflows(team(`---\nmodel: ${model}\n---\nYou build.\n`, {}))),
      new RegExp(
        `^build: \`agent: builder\` names an agent whose file is refused — agents/builder\\.md: \`model: ${model}\` names no \`permissionMode:\`, so it is filed in \`auto\`, the runtime's default, and Claude Code drops \`auto\` on that model`,
      ),
    );
    assert.match(
      refusal(() => loadWorkflows(team('---\n---\nx\n', {}, `---\nagent: builder\nmodel: ${model}\npermissionMode: auto\n---\n`))),
      /^build: `model: .*` says `permissionMode: auto`, and Claude Code drops `auto`/,
    );
  }
  assert.equal(loadWorkflows(team('---\nmodel: haiku\npermissionMode: dontAsk\n---\nx\n', {})).length, 1, 'kept: a mode the model keeps');
  assert.equal(loadWorkflows(team('---\nmodel: sonnet\n---\nx\n', {})).length, 1, 'kept: a model that keeps auto');
  assert.equal(loadWorkflows(team('---\nharness: codex\nmodel: haiku\n---\nx\n', {})).length, 1, 'kept: a codex step');
  assert.equal(loadWorkflows(team('---\n---\nx\n', {})).length, 1, 'kept: no model at all');
  assert.deepEqual(
    [...CLAUDE_AUTO_DROPPED],
    ['haiku', 'claude-haiku-4-5', 'claude-sonnet-4-5'],
    'F21 measured these three; a new one is measured first',
  );
  assert.ok(autoDropped('claude', 'claude-sonnet-4-5-20250929', undefined));
  assert.equal(autoDropped('claude', 'claude-sonnet-5', undefined), undefined, 'a name that only begins like one measured is not it');
});

test('REFUSED at shipped defaults: a skill no place has, naming each place looked in, in order', () => {
  const repo = tree({});
  const dir = team('---\nskills: draw-a-map\n---\nYou build.\n', {});
  const message = refusal(() => loadWorkflows(dir, { repo, home: ROOT }));
  const looked = [
    path.join(path.dirname(dir), 'skills'),
    path.join(repo, '.claude', 'skills'),
    path.join(ROOT, 'workflows', 'skills'),
  ].join(', ');
  assert.match(message, /^build: `agent: builder` gives the skill `draw-a-map`, and no skills folder has it — looked in /);
  assert.ok(message.includes(looked), message);
});

test("a name is looked for in the workflow's own root, then the repository's .claude/, then the store — the repository's before the store's", () => {
  const home = tree({
    'workflows/skills/write-a-note/SKILL.md': SKILL('write-a-note'),
    'workflows/agents/helper.md': "---\n---\nThe store's helper.\n",
  });
  const repo = tree({
    '.claude/skills/write-a-note/SKILL.md': SKILL('write-a-note', 'preload: true\n'),
    '.claude/agents/helper.md': "---\n---\nThe repository's helper.\n",
  });
  const dir = team('---\nskills: write-a-note\n---\nYou build.\n', {});
  const places = { repo, home };
  assert.deepEqual(lookupRoots(dir, places), [path.dirname(dir), path.join(repo, '.claude'), path.join(home, 'workflows')]);
  assert.equal(skillsFor(dir, places).at.get('write-a-note'), path.join(repo, '.claude', 'skills', 'write-a-note'));
  assert.equal((agentsFor(dir, places).get('helper') as { body: string }).body.trim(), "The repository's helper.");
  assert.equal(
    skillsFor(dir, { home }).at.get('write-a-note'),
    path.join(home, 'workflows', 'skills', 'write-a-note'),
    'with no repository, the store',
  );
  const own = team('---\nskills: write-a-note\n---\nYou build.\n', { 'workflows/skills/write-a-note/SKILL.md': SKILL('write-a-note') });
  assert.equal(
    skillsFor(own, places).at.get('write-a-note'),
    path.join(path.dirname(own), 'skills', 'write-a-note'),
    "the workflow's own root first: a store workflow's is the store, so its own come first there",
  );
});

test("the package's place skill is found after every place, where none has its name: a place's own `git` comes first", () => {
  const home = tree({});
  const repo = tree({});
  const dir = team('---\nskills: git\n---\nYou build.\n', {});
  const found = skillsFor(dir, { repo, home });
  assert.equal(found.at.get('git'), SHIPPED_PLACE);
  assert.equal(found.looked.at(-1), PLACE_SKILLS);
  assert.ok(isShippedPlace(SHIPPED_PLACE));
  const own = team('---\nskills: git\n---\nYou build.\n', { 'workflows/skills/git/SKILL.md': SKILL('git') });
  const ownGit = path.join(path.dirname(own), 'skills', 'git');
  assert.equal(skillsFor(own, { repo, home }).at.get('git'), ownGit);
  assert.equal(isShippedPlace(ownGit), false);
});

/**
 * A project subagent as Claude Code's /agents wizard writes one: its name, a description with an example, its tools, its model, its
 * colour.
 */
const WIZARD =
  '---\nname: code-reviewer\ndescription: Use this agent when a change needs a second look. Example: after a feature is written.\ntools: Read, Grep, Glob, Bash\nmodel: sonnet\ncolor: blue\n---\nYou are a careful code reviewer.\n';

test("an agent Claude Code's /agents wizard wrote into .claude/agents/ runs as it is: `color` read and ignored, every other line the run's", () => {
  const repo = tree({ '.claude/agents/code-reviewer.md': WIZARD });
  const home = tree({ 'workflows/team/review.md': '---\nplace: git\nagent: code-reviewer\n---\nReview the change.\n' });
  const [step] = loadWorkflows(path.join(home, 'workflows', 'team'), { repo, home });
  assert.deepEqual([step.model, step.tools, step.permissionMode], ['sonnet', ['Read', 'Grep', 'Glob', 'Bash'], undefined]);
  const agent = agentsFor(path.join(home, 'workflows', 'team'), { repo, home }).get('code-reviewer') as Agent;
  assert.equal(agent.description, 'Use this agent when a change needs a second look. Example: after a feature is written.');
  assert.equal(agent.body.trim(), 'You are a careful code reviewer.');
  assert.ok(!('color' in agent.keys), 'not a role key: no step inherits it');
  assert.doesNotMatch(
    renderAgent({ name: agent.name, description: agent.description, keys: agent.keys, body: agent.body }),
    /color/,
    'not written back',
  );
});

test("REFUSED at shipped defaults: Claude Code's own subagent keys a run would drop — each named, with what does it in a run — and `model: inherit`, which a step has no parent to inherit from", () => {
  const cases: Array<[string, RegExp]> = [
    ['maxTurns: 20', /`budget:` and `deadlineSeconds:`/],
    ['mcpServers: github', /name the servers of the repository's `\.mcp\.json` its sessions load on an `mcp:` line/],
    ['hooks: lint', /`\.claude\/settings\.json`/],
    ['memory: project', /no memory of an agent's own/],
    ['isolation: worktree', /`workspace:`/],
  ];
  for (const [line, why] of cases) {
    const said = refusal(() => parseAgent('code-reviewer', `---\ndescription: Reviews.\n${line}\n---\nYou review.\n`));
    assert.ok(
      said.startsWith(
        `agents/code-reviewer.md: \`${line.split(':')[0]}\` is Claude Code's own subagent key, and a run does not carry it to its sessions — `,
      ),
      said,
    );
    assert.match(said, why);
  }
  assert.match(
    refusal(() => parseAgent('code-reviewer', WIZARD.replace('model: sonnet', 'model: inherit'))),
    /^agents\/code-reviewer\.md: `model: inherit` is Claude Code's word for a subagent that runs on the model of the conversation that called it/,
  );
  assert.match(
    refusal(() => parseAgent('code-reviewer', '---\ncolour: blue\n---\n')),
    /`colour` is not a key an agent has/,
    "a key that is no one's is refused",
  );
});

test("REFUSED at shipped defaults: a name in both of one repository's places, workflows/ and .claude/ — an agent and a skill — naming both", () => {
  const repo = tree({
    'workflows/team/build.md': '---\nplace: git\nagent: builder\n---\n',
    'workflows/agents/builder.md': '---\nskills: write-a-note\n---\nYou build.\n',
    'workflows/skills/write-a-note/SKILL.md': SKILL('write-a-note'),
    '.claude/skills/write-a-note/SKILL.md': SKILL('write-a-note'),
  });
  const dir = path.join(repo, 'workflows', 'team');
  const skill = refusal(() => loadWorkflows(dir, { repo }));
  assert.match(
    skill,
    /write-a-note is a skill in both .* one repository's two places for skills, and nothing says which a session is given/,
  );
  assert.ok(
    skill.includes(path.join(repo, 'workflows', 'skills', 'write-a-note')) &&
      skill.includes(path.join(repo, '.claude', 'skills', 'write-a-note')),
    skill,
  );
  fs.rmSync(path.join(repo, '.claude', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(repo, '.claude', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.claude', 'agents', 'builder.md'), '---\n---\nAnother builder.\n');
  assert.match(
    refusal(() => loadWorkflows(dir, { repo })),
    /builder is an agent in both .* one repository's two places for agents, and nothing says which runs/,
  );
  assert.equal(
    loadWorkflows(dir).length,
    1,
    "read with no repository, the same folder finds its own and is not refused: the clash is one repository's",
  );
});

test('a `skills:` line naming a card file, as it did until 2026-09-25, is refused where it is read and where it is written: the card file is retired', () => {
  const legacy = refusal(() => parseAgent('builder', '---\nskills: builder.skills.json\n---\nx\n', () => '[]'));
  assert.match(
    legacy,
    /^agents\/builder\.md: `skills: builder\.skills\.json` names a card file, which is retired: an agent's card is generated/,
  );
  const dir = team('---\nskills: builder.skills.json\n---\nYou build.\n', { 'workflows/agents/builder.skills.json': '[]' });
  assert.match(
    refusal(() => loadWorkflows(dir)),
    /`skills: builder\.skills\.json` names a card file, which is retired/,
  );
  const written = refusal(() => renderAgent({ name: 'builder', skills: 'builder.skills.json', keys: {}, body: 'x\n' }));
  assert.match(written, /^agents\/builder\.md: `skills: builder\.skills\.json` names a card file, which is retired/);
  assert.match(written, /A page that sends it is stale: reload it, and save again\.$/);
  assert.match(
    refusal(() => renderAgent({ name: 'builder', card: 'builder.skills.json', keys: {}, body: 'x\n' } as never)),
    /^agents\/builder\.md: `card: builder\.skills\.json` names a card file, which is retired/,
  );
});

test("an agent's version moves with each skill it gives, and not with one it does not", () => {
  const dir = team('---\nskills: write-a-note\n---\nYou build.\n', {
    'workflows/skills/write-a-note/SKILL.md': SKILL('write-a-note'),
    'workflows/skills/other/SKILL.md': SKILL('other'),
  });
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
const resolved = (agent: string, files: Record<string, string> = {}, step?: string): Workflow => loadWorkflows(team(agent, files, step))[0];

test('the prompt is the instructions, then each skill by its namespaced name, then each skill that asks to be told whole', () => {
  const step = resolved('---\nskills: write-a-note, review-a-change\n---\nYou build.\n', {
    'workflows/skills/write-a-note/SKILL.md': SKILL('write-a-note'),
    'workflows/skills/review-a-change/SKILL.md': SKILL('review-a-change'),
  });
  assert.equal(
    renderedPrompt(step, [{ name: 'write-a-note' }, { name: 'review-a-change', whole: 'Read the diff.\n' }]),
    'You build.\n\nYour skills, each loaded with the Skill tool by its name when you need it: `nemia-builder:write-a-note`.\n\n## Skill `nemia-builder:review-a-change`\n\nRead the diff.\n',
  );
  assert.match(noCodingStyle('builder'), /^---\nname: no-coding\n[\s\S]*keep-coding-instructions: false\n---\n/);
});

test("the flags: the prompt appended by default and for no-coding, in place of Claude Code's for own; the plugin for skills or a style; the style by its namespaced name; each named skill's bare copy off", () => {
  const dir = '/runs/r/agents/build';
  const flags = (agent: string, files: Record<string, string> = {}) => renderedFlags(resolved(agent, files), dir);
  const skill = { 'workflows/skills/write-a-note/SKILL.md': SKILL('write-a-note') };
  assert.deepEqual(flags('---\n---\nYou build.\n'), { appendSystemPromptFile: `${dir}/prompt.md` });
  assert.deepEqual(flags('---\nskills: write-a-note\n---\nYou build.\n', skill), {
    appendSystemPromptFile: `${dir}/prompt.md`,
    pluginDir: [`${dir}/nemia-builder`],
    settings: JSON.stringify({ skillOverrides: { 'write-a-note': 'off' } }),
  });
  assert.deepEqual(flags('---\nharnessPrompt: no-coding\nskills: write-a-note\n---\nYou build.\n', skill), {
    appendSystemPromptFile: `${dir}/prompt.md`,
    pluginDir: [`${dir}/nemia-builder`],
    settings: JSON.stringify({ outputStyle: 'nemia-builder:no-coding', skillOverrides: { 'write-a-note': 'off' } }),
  });
  assert.deepEqual(flags('---\nharnessPrompt: replace\n---\nYou build.\n'), { systemPromptFile: `${dir}/prompt.md` });
  assert.deepEqual(flags('---\nharnessPrompt: keep\n---\nYou build.\n'), { appendSystemPromptFile: `${dir}/prompt.md` });
  assert.deepEqual(flags('---\nharnessPrompt: no-coding\n---\nYou build.\n'), {
    appendSystemPromptFile: `${dir}/prompt.md`,
    pluginDir: [`${dir}/nemia-builder`],
    settings: JSON.stringify({ outputStyle: 'nemia-builder:no-coding' }),
  });
  assert.deepEqual(flags('---\nsystemPrompt: own\n---\nYou build.\n'), { systemPromptFile: `${dir}/prompt.md` }, 'own is replace');
  assert.deepEqual(flags('---\nsystemPrompt: default\n---\nYou build.\n'), { appendSystemPromptFile: `${dir}/prompt.md` });
  assert.deepEqual(flags('---\nsystemPrompt: no-coding\n---\nYou build.\n'), {
    appendSystemPromptFile: `${dir}/prompt.md`,
    pluginDir: [`${dir}/nemia-builder`],
    settings: JSON.stringify({ outputStyle: 'nemia-builder:no-coding' }),
  });
  assert.equal(
    flags('---\nmodel: opus\n---\n'),
    undefined,
    'nothing to render: an agent with no instructions, no skills and the default prompt',
  );
  assert.equal(
    renderedFlags(
      loadWorkflows(path.join(tree({ 'workflows/team/build.md': '---\nplace: git\n---\nJust a step.\n' }), 'workflows', 'team'))[0],
      dir,
    ),
    undefined,
    'nothing to render: a step with no agent',
  );
});

test('a rendered step is briefed with its own note alone, and one whose folder is gone is told as before — its instructions in its brief, no flags', () => {
  const step = resolved('---\n---\nYou build.\n');
  assert.equal(briefBody(step).trim(), "The step's own note.");
  const before = unrendered(step);
  assert.equal(rendersAgent(before), false);
  assert.match(briefBody(before), /^You build\.\n[\s\S]*The step's own note\./);
  assert.equal(renderedFlags(before, '/x'), undefined);
});

/** A folder team in the store's own workflows, beside the store's agents and skills. */
function storeTeam(name: string, steps: Record<string, string>): string {
  const dir = path.join(ROOT, 'workflows', name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [step, text] of Object.entries(steps)) fs.writeFileSync(path.join(dir, `${step}.md`), text);
  return dir;
}
const FOLDER = 'workspace: folder\npermissionMode: dontAsk\n';
const HERE = fs.mkdirSync(path.join(ROOT, 'here'), { recursive: true }) ?? path.join(ROOT, 'here');
fs.mkdirSync(path.join(ROOT, 'workflows', 'agents'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'workflows', 'skills', 'write-a-note'), { recursive: true });
fs.writeFileSync(
  path.join(ROOT, 'workflows', 'agents', 'scribe.md'),
  '---\nskills: write-a-note, mind-the-tone\nharnessPrompt: no-coding\ntools: Read, Edit, Skill\nallowedTools: Edit(**)\n---\nYou write notes.\n',
);
fs.writeFileSync(path.join(ROOT, 'workflows', 'agents', 'coder.md'), '---\nharness: codex\n---\nYou write code.\n');
fs.writeFileSync(path.join(ROOT, 'workflows', 'skills', 'write-a-note', 'SKILL.md'), SKILL('write-a-note'));
fs.writeFileSync(path.join(ROOT, 'workflows', 'skills', 'write-a-note', 'template.md'), '# Title\n');
fs.mkdirSync(path.join(HERE, '.claude', 'skills', 'mind-the-tone'), { recursive: true });
fs.writeFileSync(path.join(HERE, '.claude', 'skills', 'mind-the-tone', 'SKILL.md'), SKILL('mind-the-tone', 'preload: true\n'));

test("nemia start renders each Claude Code step's agent under runs/<id>/agents/<step>/, and the tick files it with the flags and a brief without the instructions", async () => {
  const dir = storeTeam('noted', {
    write: `---\nagent: scribe\n${FOLDER}---\nWrite about tides.\n`,
    code: `---\nagent: coder\nworkspace: folder\nafter: write\n---\nCode it.\n`,
  });
  const run = await runPlaced(startRun({ brief: 'a note on tides', repo: HERE, workflowDir: dir }));
  const at = agentFilesDir(run, 'write');
  assert.equal(
    fs.readFileSync(path.join(at, 'prompt.md'), 'utf8'),
    'You write notes.\n\nYour skills, each loaded with the Skill tool by its name when you need it: `nemia-scribe:write-a-note`.\n\n## Skill `nemia-scribe:mind-the-tone`\n\nHow to mind the tone.\n',
  );
  assert.equal(
    fs.readFileSync(path.join(at, 'nemia-scribe', 'skills', 'write-a-note', 'SKILL.md'), 'utf8'),
    SKILL('write-a-note'),
    "the store's skill, copied",
  );
  assert.equal(
    fs.readFileSync(path.join(at, 'nemia-scribe', 'skills', 'write-a-note', 'template.md'), 'utf8'),
    '# Title\n',
    'whole, with what is beside its SKILL.md',
  );
  assert.ok(fs.existsSync(path.join(at, 'nemia-scribe', 'skills', 'mind-the-tone', 'SKILL.md')), "the repository's skill, copied");
  assert.equal(JSON.parse(fs.readFileSync(path.join(at, 'nemia-scribe', '.claude-plugin', 'plugin.json'), 'utf8')).name, 'nemia-scribe');
  assert.equal(fs.readFileSync(path.join(at, 'nemia-scribe', 'output-styles', 'no-coding.md'), 'utf8'), noCodingStyle('scribe'));
  assert.equal(fs.existsSync(agentFilesDir(run, 'code')), false, 'a codex step is not rendered');

  fs.appendFileSync(path.join(ROOT, 'workflows', 'skills', 'write-a-note', 'SKILL.md'), 'Edited later.\n');
  assert.doesNotMatch(
    fs.readFileSync(path.join(at, 'nemia-scribe', 'skills', 'write-a-note', 'SKILL.md'), 'utf8'),
    /Edited later/,
    "an edit after the start reaches no run already started: the folder is the run's",
  );

  const { e, filed } = board();
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).filed, ['write']);
  const write = filed.get(`${run.id}-write`)!;
  assert.deepEqual(write.config?.claude, {
    appendSystemPromptFile: path.join(at, 'prompt.md'),
    pluginDir: [path.join(at, 'nemia-scribe')],
    settings: JSON.stringify({ outputStyle: 'nemia-scribe:no-coding', skillOverrides: { 'write-a-note': 'off', 'mind-the-tone': 'off' } }),
  });
  assert.match(write.brief, /^Write about tides\.\n/, "the step's own note first");
  assert.doesNotMatch(write.brief, /You write notes/, "the instructions are in Claude Code's prompt, not the brief");
});

test('a codex step is filed as before: its instructions in its brief, and no Claude Code flags', async () => {
  const dir = storeTeam('coded', { code: `---\nagent: coder\nworkspace: folder\n---\nCode it.\n` });
  const run = await runPlaced(startRun({ brief: 'some code', repo: HERE, workflowDir: dir }));
  const { e, filed } = board();
  await runWith(e, advanceRun(readRun(run.id)));
  const code = filed.get(`${run.id}-code`)!;
  assert.equal(code.config?.claude, undefined);
  assert.match(code.brief, /^You write code\.\n\nCode it\./);
});

test('a rendered step whose folder is gone is filed as before 2026-09-25 — the instructions in its brief, no flag naming a file that is not there — and told its skills whole', async () => {
  const dir = storeTeam('lost', { write: `---\nagent: scribe\n${FOLDER}---\nWrite about tides.\n` });
  const run = await runPlaced(startRun({ brief: 'a note on tides', repo: HERE, workflowDir: dir }));
  fs.rmSync(agentFilesDir(run, 'write'), { recursive: true });
  const { e, filed } = board();
  await runWith(e, advanceRun(readRun(run.id)));
  const write = filed.get(`${run.id}-write`)!;
  assert.equal(write.config?.claude, undefined);
  assert.match(write.brief, /^You write notes\.\n\nWrite about tides\./);
  assert.match(
    write.brief,
    /Write about tides\.\n\nNo skill is loaded with the Skill tool for this step[^\n]*\n\n## Skill `write-a-note`\n\nHow to write a note\./,
    "with no plugin there is nothing to load, so each skill is told whole, read again where a start of the run's folder finds it: the store's",
  );
  assert.ok(
    write.brief.includes(`/workflows/skills, ${PLACE_SKILLS}. Sign off blocked if you need it.\n\n## What was asked for`),
    write.brief,
  );
  assert.match(
    write.brief,
    /\n## Skill `mind-the-tone`\n\nNot told: no folder holds it in [^\n]*\/workflows\/skills, [^\n]*\. Sign off blocked if you need it\.\n\n## What was asked for/,
    'a folder run keeps no repository, so the skill the start found in the one it was typed in is said not to be told, and where it was looked for',
  );
});

test('a rendered step whose plugin is under another name, as a start before the rename wrote it, is filed as one whose folder is gone; one that names no plugin is filed with its prompt', async () => {
  fs.writeFileSync(
    path.join(ROOT, 'workflows', 'agents', 'plain.md'),
    '---\ntools: Read\nallowedTools: Edit(**)\n---\nYou write plainly.\n',
  );
  const dir = storeTeam('renamed', {
    write: `---\nagent: scribe\n${FOLDER}---\nWrite about tides.\n`,
    plain: `---\nagent: plain\n${FOLDER}---\nWrite plainly.\n`,
  });
  const run = await runPlaced(startRun({ brief: 'a note on tides', repo: HERE, workflowDir: dir }));
  const at = agentFilesDir(run, 'write');
  fs.renameSync(path.join(at, pluginOf('scribe')), path.join(at, 'before-scribe'));
  const { e, filed } = board();
  await runWith(e, advanceRun(readRun(run.id)));
  const write = filed.get(`${run.id}-write`)!;
  assert.equal(write.config?.claude, undefined, 'no flag naming a plugin that is not there');
  assert.match(write.brief, /^You write notes\.\n\nWrite about tides\./);
  assert.match(write.brief, /\n## Skill `write-a-note`\n\nHow to write a note\./, 'and its skills told whole');
  const plain = filed.get(`${run.id}-plain`)!;
  assert.deepEqual(plain.config?.claude, { appendSystemPromptFile: path.join(agentFilesDir(run, 'plain'), 'prompt.md') });
  assert.equal(fs.readdirSync(agentFilesDir(run, 'plain')).join(), 'prompt.md', 'its folder holds no plugin, and names none');
});

test("a repository run's step whose folder is gone is told a skill from the run's repository too, as its start found it", async () => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  fs.mkdirSync(path.join(repo, '.claude', 'skills', 'mind-the-tone'), { recursive: true });
  const skill = SKILL('mind-the-tone', 'preload: true\n').replace('How to', 'In this repository, how to');
  fs.writeFileSync(path.join(repo, '.claude', 'skills', 'mind-the-tone', 'SKILL.md'), skill);
  stand().world.repository(repo, { '.claude/skills/mind-the-tone/SKILL.md': skill });
  const dir = storeTeam('lost-git', { write: '---\nplace: git\nagent: scribe\n---\nWrite about tides.\n' });
  const run = await runPlaced(startRun({ brief: 'a note on tides', repo, workflowDir: dir, isolate: false }));
  fs.rmSync(agentFilesDir(run, 'write'), { recursive: true });
  const { e, filed } = board();
  await runWith(e, advanceRun(readRun(run.id)));
  const write = filed.get(`${run.id}-write`)!;
  assert.equal(write.config?.claude, undefined);
  assert.match(write.brief, /\n## Skill `mind-the-tone`\n\nIn this repository, how to mind the tone\.\n/);
});

test('REFUSED at shipped defaults: nemia start of a team whose agent gives a skill no place has, and nothing written', async () => {
  const dir = storeTeam('unskilled', { write: `---\nagent: scribe\n${FOLDER}---\nWrite.\n` });
  const runs = path.join(ROOT, 'runs');
  const before = fs.existsSync(runs) ? fs.readdirSync(runs).sort() : [];
  const elsewhere = fs.mkdtempSync(path.join(ROOT, 'elsewhere-'));
  await assert.rejects(
    async () => await runPlaced(startRun({ brief: 'x', repo: elsewhere, workflowDir: dir })),
    (e: Error) => /gives the skill `mind-the-tone`, and no skills folder has it/.test(e.message),
    'started from a directory whose .claude/ has no mind-the-tone, and the store has write-a-note alone',
  );
  assert.deepEqual(fs.existsSync(runs) ? fs.readdirSync(runs).sort() : [], before);
});

test("a codex step's `sandbox:` reaches Codex as its `-s`, every sandbox, and the one it was written as before 2026-09-23 the same", () => {
  const sandboxOf = (text: string) => {
    const step = parseWorkflow('review', text);
    const { args } = codex.command({
      name: 'review',
      brief: 'b',
      cwd: scratch('wf-rendering-codex-'),
      config: { permissionMode: modeOf(step) },
    });
    return args[args.indexOf('-s') + 1];
  };
  for (const sandbox of CODEX_SANDBOXES) {
    assert.equal(sandboxOf(`---\nplace: git\nharness: codex\nsandbox: ${sandbox}\n---\nreview it\n`), sandbox);
    assert.equal(
      sandboxOf(`---\nplace: git\nharness: codex\npermissionMode: ${sandbox}\n---\nreview it\n`),
      sandbox,
      `the former line, ${sandbox}`,
    );
  }
  assert.equal(sandboxOf('---\nplace: git\nharness: codex\npermissionMode: bypassPermissions\n---\nreview it\n'), 'danger-full-access');
  const { args } = codex.command({
    name: 'review',
    brief: 'b',
    cwd: scratch('wf-rendering-codex-'),
    config: { permissionMode: parseWorkflow('review', '---\nplace: git\nharness: codex\nsandbox: read-only\n---\nr\n').permissionMode },
  });
  assert.equal(
    args[args.indexOf('-s') + 1],
    'workspace-write',
    "filed from permissionMode alone, without modeOf, the reviewer runs in Codex's default, which writes",
  );
});
