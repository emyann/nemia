/**
 * What a step was told, by layer (`toldLayers`): its agent's instructions, the person's custom instructions, its factory's rules, the
 * step's own policy and the skills it adds, and the task, cut from the brief the step was filed with only where that brief opens with the
 * layers above it. And the skills split between the agent and the step (`skillLayers`), from the frozen record.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAgent, parseWorkflow, type Agents, type Workflow } from '../src/workflow.ts';
import { composeBrief, PRECEDENCE, toldLayers, type RepositoryRun } from '../src/run.ts';
import { briefBody, skillLayers, unrendered } from '../src/agents/agents.ts';
import { headedLayers } from '../src/workflow/index.ts';

const AGENTS: Agents = new Map([
  ['ada', { ...parseAgent('ada', '---\nskills: alpha, beta\n---\nYou are Ada.\n'), customInstructions: 'Be terse.' }],
  ['bare', parseAgent('bare', '---\n---\nYou are bare.\n')],
  ['cody', { ...parseAgent('cody', '---\n---\nYou are Cody.\n'), customInstructions: 'Be terse.' }],
  ['dee', parseAgent('dee', '---\nmodel: opus\ndisallowedTools: Bash(git push:*)\n---\nYou are Dee.\n')],
]);

/** The step `name` written with `lines` as its frontmatter and `note` as its own words, resolved with the agents above. */
const stepOf = (lines: string, note = 'Build it.', name = 'build'): Workflow =>
  parseWorkflow(name, `---\nplace: git\n${lines}\n---\n${note}\n`, undefined, AGENTS);

const RULES = 'Never push on a Friday.';

/** The step `build` written with `lines`, in a factory whose rules are `RULES`. */
const ruledStep = (lines: string): Workflow =>
  parseWorkflow('build', `---\nplace: git\n${lines}\n---\nBuild it.\n`, undefined, AGENTS, undefined, undefined, RULES);

/** A run of `steps`, none filed, asked for `brief`. */
const runOf = (steps: readonly Workflow[], brief = 'add a flag'): RepositoryRun => ({
  id: 'r-1',
  repo: '/repo',
  workspace: '/wt',
  baseRef: 'abc123',
  branch: 'main',
  isolate: true,
  brief,
  workflowDir: '/wf',
  createdAt: '2026-01-01T00:00:00Z',
  steps: Object.fromEntries(steps.map((s) => [s.name, { taskId: null }])),
});

/** What `step` would be told as the first step of a run of it alone. */
const briefOf = (step: Workflow): string => composeBrief(step, runOf([step]), [step]);

test("a rendered step's layers: the agent's words and the person's apart, its own note as the policy, and the task after the note", () => {
  const step = stepOf('agent: ada\nskills: beta, gamma');
  const brief = briefOf(step);
  const told = toldLayers(step, brief);
  assert.equal(told.via, 'prompt');
  assert.equal(told.agent, 'ada');
  assert.equal(told.instructions, 'You are Ada.');
  assert.equal(told.custom, 'Be terse.');
  assert.equal(told.factory, null, 'a step frozen with no rules was told none');
  assert.equal(told.policy, 'Build it.');
  assert.deepEqual(told.agentSkills, ['alpha', 'beta']);
  assert.deepEqual(told.addedSkills, ['gamma']);
  assert.ok(told.task?.startsWith('## What was asked for\n\nadd a flag'), told.task ?? 'null');
  assert.ok(!told.task?.includes('Build it.'), 'the policy is not told again in the task');
  assert.equal(`${PRECEDENCE}\n\n${briefBody(step)}\n\n${told.task}`, brief, 'the cut loses nothing');
});

test("a codex step and a `resume:` step are told their agent's words in the brief: the task starts after the policy", () => {
  for (const step of [stepOf('agent: cody\nharness: codex'), stepOf('agent: cody\nresume: plan')]) {
    const brief = `${step.body}\n\n## What was asked for\n\nadd a flag`;
    const told = toldLayers(step, brief);
    assert.equal(told.via, 'brief', step.harness ?? step.resume);
    assert.equal(told.instructions, 'You are Cody.');
    assert.equal(told.custom, 'Be terse.');
    assert.equal(told.policy, 'Build it.');
    assert.equal(told.task, '## What was asked for\n\nadd a flag');
  }
  const codex = stepOf('agent: cody\nharness: codex');
  assert.equal(toldLayers(codex, briefOf(codex)).task?.startsWith('## What was asked for'), true);
});

test("the factory's rules are a layer of their own, as frozen: apart from the custom instructions and the policy, never told again in the task", () => {
  const rendered = ruledStep('agent: ada');
  const brief = briefOf(rendered);
  const told = toldLayers(rendered, brief);
  assert.equal(told.via, 'prompt');
  assert.equal(told.factory, RULES);
  assert.equal(told.custom, 'Be terse.');
  assert.equal(told.policy, 'Build it.');
  assert.ok(told.task?.startsWith('## What was asked for'), told.task ?? 'null');
  assert.ok(!brief.includes(RULES), "the rules are the rendered prompt's, not the brief's");

  for (const step of [ruledStep('agent: cody\nharness: codex'), ruledStep('agent: cody\nresume: plan')]) {
    const inBrief = toldLayers(step, `${step.body}\n\n## What was asked for\n\nadd a flag`);
    assert.equal(inBrief.via, 'brief', step.harness ?? step.resume);
    assert.equal(inBrief.factory, RULES);
    assert.equal(inBrief.policy, 'Build it.');
    assert.equal(inBrief.task, '## What was asked for\n\nadd a flag', 'the task starts after the four layers');
  }

  const bare = ruledStep('agent: bare\nharness: codex');
  assert.equal(toldLayers(bare, null).custom, null);
  assert.equal(toldLayers(bare, null).factory, RULES, 'with no custom instructions, the rules are still their own layer');

  const { factoryRules: _r, ...before } = rendered.agent!;
  assert.equal(toldLayers({ ...rendered, agent: before }, brief).factory, null, 'a record frozen before there were rules shows none');
});

test('a brief that does not open with the layers is the task whole, never cut at a wrong offset', () => {
  const step = stepOf('agent: ada');
  const resumed = '## Your answer\n\nTry again.\n\n## When you are finished\n\nSign off.';
  assert.equal(toldLayers(step, resumed).task, resumed, "a resumed try's brief opens with its own section");
  const shorter = `${'x'.repeat(step.agent!.body.length)}\n\n## What was asked for`;
  assert.equal(toldLayers(step, shorter).task, shorter, 'a brief as long as the note, opening with other words');
  const old = { ...step, agent: { ...step.agent!, instructions: undefined, customInstructions: undefined, skills: undefined } };
  const frozen = `${old.body}\n\n## What was asked for`;
  const told = toldLayers(old, frozen);
  assert.equal(told.instructions, null);
  assert.equal(told.task, frozen, 'a record frozen without the instructions keeps them in the task, not lost');
  assert.ok(told.task.includes('You are Ada.'));
});

test('a step filed with its rendered folder gone is told its layers in its brief, then its skills whole, which stay in the task', () => {
  const step = stepOf('agent: ada');
  const filed = unrendered(step, [{ name: 'alpha', text: 'Alpha.' }]);
  const told = toldLayers(step, `${filed.body}\n\n## What was asked for\n\nadd a flag`);
  assert.equal(told.via, 'brief');
  assert.ok(told.task?.startsWith('No skill is loaded with the Skill tool'), told.task ?? 'null');
  assert.ok(!told.task?.includes('You are Ada.'));
});

test('a step with no agent: its own words are the policy, no agent layer, and a brief not filed is no task', () => {
  const step = parseWorkflow('build', '---\nplace: git\n---\nBuild it.\n');
  const told = toldLayers(step, null);
  assert.deepEqual(told, {
    agent: null,
    instructions: null,
    custom: null,
    factory: null,
    agentSkills: [],
    policy: 'Build it.',
    addedSkills: [],
    fence: [],
    folderFiles: true,
    task: null,
    via: 'brief',
  });
  assert.equal(toldLayers(step, briefOf(step)).task?.startsWith('## What was asked for'), true);
});

test("a skill both the agent and the step name is the agent's; only what the step's line adds is the step's", () => {
  assert.deepEqual(skillLayers(stepOf('agent: ada\nskills: beta, gamma')), { agent: ['alpha', 'beta'], added: ['gamma'] });
  assert.deepEqual(skillLayers(stepOf('agent: ada')), { agent: ['alpha', 'beta'], added: [] });
  assert.deepEqual(skillLayers(stepOf('agent: bare\nskills: gamma')), { agent: [], added: ['gamma'] });
  assert.deepEqual(skillLayers(parseWorkflow('build', '---\nplace: git\n---\nBuild it.\n')), { agent: [], added: [] });
});

test("a record frozen before the added skills were: every skill the step's line names counts as the step's", () => {
  const step = stepOf('agent: ada\nskills: beta, gamma');
  const { addedSkills: _added, ...agent } = step.agent!;
  assert.deepEqual(skillLayers({ ...step, agent }), { agent: ['alpha'], added: ['beta', 'gamma'] });
});

test("the step's fence lines are the fence keys its own file sets, as resolved: never a role key, never its agent's fence", () => {
  const step = stepOf('agent: dee\nmodel: sonnet\ndisallowedTools: Bash(git push:*), Bash(rm:*)');
  assert.deepEqual(toldLayers(step, null).fence, [{ key: 'disallowedTools', value: 'Bash(rm:*)' }], "its own denies, not its agent's");
  const added = stepOf('agent: dee\ndisallowedTools: Bash(rm:*)');
  assert.deepEqual(added.disallowedTools, ['Bash(rm:*)', 'Bash(git push:*)'], "a step's line adds to its agent's");
  assert.deepEqual(toldLayers(added, null).fence, [{ key: 'disallowedTools', value: 'Bash(rm:*)' }]);
  const repeated = stepOf('agent: dee\ndisallowedTools: Bash(git push:*)');
  assert.deepEqual(toldLayers(repeated, null).fence, [], 'a line that only repeats its agent tightens nothing');
  const inherited = stepOf('agent: dee');
  assert.deepEqual(inherited.disallowedTools, ['Bash(git push:*)'], "the step runs its agent's fence");
  assert.deepEqual(toldLayers(inherited, null).fence, [], "the agent's fence is not the step's policy");
});

test("the brief opens with the precedence, in the person's words, then the layers the step is told in its brief", () => {
  const codex = stepOf('agent: cody\nharness: codex');
  const brief = briefOf(codex);
  assert.equal(brief.split('\n')[0], PRECEDENCE, "the precedence is the brief's first line");
  assert.equal(
    brief.slice(0, PRECEDENCE.length + 2 + briefBody(codex).length),
    `${PRECEDENCE}\n\n${briefBody(codex)}`,
    "and the step's layers follow it, before anything else",
  );
  const rendered = stepOf('agent: ada');
  assert.ok(briefOf(rendered).startsWith(`${PRECEDENCE}\n\nBuild it.\n\n`), 'a rendered step: the precedence, then its own note');
  const bare = parseWorkflow('build', '---\nplace: git\nagent: ada\n---\n', undefined, AGENTS);
  assert.ok(
    briefOf(bare).startsWith(`${PRECEDENCE}\n\n## What was asked for`),
    'a rendered step with no note of its own: the precedence alone',
  );
});

test('a brief composed with the precedence cuts back to the identical task, and so does one filed before it was written', () => {
  for (const step of [stepOf('agent: ada'), stepOf('agent: cody\nharness: codex'), stepOf('')]) {
    const brief = briefOf(step);
    const told = toldLayers(step, brief);
    const task = told.task ?? '';
    assert.ok(task.startsWith('## What was asked for\n\nadd a flag'), `${step.harness ?? 'rendered'}: ${task}`);
    assert.ok(!task.includes(PRECEDENCE), 'the precedence is a layer of its own, never part of the task');
  }
  const resumed = stepOf('agent: cody\nresume: plan');
  assert.ok(
    briefOf(resumed).startsWith(`${PRECEDENCE}\n\n${resumed.body}`),
    'a step that continues another opens on the precedence and its layers too',
  );
  const codex = stepOf('agent: cody\nharness: codex');
  const headed = toldLayers(codex, `${codex.body}\n\n## What was asked for\n\nadd a flag`);
  assert.equal(headed.task, '## What was asked for\n\nadd a flag', 'a brief filed before the precedence, its layers headed');
  const plain = ['You are Cody.', 'Be terse.', 'Build it.'].join('\n\n');
  const before = toldLayers(codex, `${plain}\n\n## What was asked for\n\nadd a flag`);
  assert.equal(before.task, '## What was asked for\n\nadd a flag', 'a brief filed before the headings, its layers joined plainly');
  assert.equal(before.via, 'brief');
});

test('each layer the brief is told in carries its number and its owner, and the body is cut on them', () => {
  const codex = ruledStep('agent: cody\nharness: codex');
  assert.equal(
    codex.body,
    headedLayers([
      ['instructions', 'You are Cody.'],
      ['custom', 'Be terse.'],
      ['factory', RULES],
      ['policy', 'Build it.'],
    ]),
  );
  for (const heading of [
    "## 1. Instructions — your role's own words",
    '## 2. Custom instructions — the person who hired you',
    "## 4. The factory's rules — every step of this factory",
    "## 5. The step's policy — this step of this process",
  ])
    assert.ok(codex.body.includes(`${heading}\n\n`), heading);
  const told = toldLayers(codex, briefOf(codex));
  assert.equal(told.task?.startsWith('## What was asked for'), true, 'the task starts after the headed layers');
  const dropped = headedLayers([
    ['instructions', 'You are Cody.'],
    ['custom', 'Be terse.'],
    ['policy', 'Build it.'],
  ]);
  assert.equal(
    toldLayers(codex, `${PRECEDENCE}\n\n${dropped}\n\n## What was asked for`).task,
    `${PRECEDENCE}\n\n${dropped}\n\n## What was asked for`,
    'a brief whose layers are not the ones frozen is the task whole, never cut at a wrong offset',
  );
});

test("the folder's files are a layer the session reads itself: told for a step that works in a folder here, never for one on a remote agent", () => {
  assert.equal(toldLayers(stepOf('agent: ada'), null).folderFiles, true, 'a rendered step');
  assert.equal(toldLayers(parseWorkflow('build', '---\nplace: git\n---\nBuild it.\n'), null).folderFiles, true, 'a step with no agent');
  const remote = stepOf('agent: bare\nharness: a2a:partner');
  assert.equal(toldLayers(remote, null).folderFiles, false, 'a remote step works wherever its operator put it');
});
