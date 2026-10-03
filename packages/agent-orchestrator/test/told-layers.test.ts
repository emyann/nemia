/**
 * What a step was told, by layer (`toldLayers`): its agent's instructions, the person's custom instructions, the step's own policy and the
 * skills it adds, and the task, cut from the brief the step was filed with only where that brief opens with the layers above it. And the
 * skills split between the agent and the step (`skillLayers`), from the frozen record.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAgent, parseWorkflow, type Agents, type Workflow } from '../src/workflow.ts';
import { composeBrief, toldLayers, type GitRun } from '../src/run.ts';
import { briefBody, skillLayers, unrendered } from '../src/agents/agents.ts';

const AGENTS: Agents = new Map([
  ['ada', { ...parseAgent('ada', '---\nskills: alpha, beta\n---\nYou are Ada.\n'), customInstructions: 'Be terse.' }],
  ['bare', parseAgent('bare', '---\n---\nYou are bare.\n')],
  ['cody', { ...parseAgent('cody', '---\n---\nYou are Cody.\n'), customInstructions: 'Be terse.' }],
]);

/** The step `name` written with `lines` as its frontmatter and `note` as its own words, resolved with the agents above. */
const stepOf = (lines: string, note = 'Build it.', name = 'build'): Workflow =>
  parseWorkflow(name, `---\n${lines}\n---\n${note}\n`, undefined, AGENTS);

/** A run of `steps`, none filed, asked for `brief`. */
const runOf = (steps: readonly Workflow[], brief = 'add a flag'): GitRun => ({
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
  assert.equal(told.policy, 'Build it.');
  assert.deepEqual(told.agentSkills, ['alpha', 'beta']);
  assert.deepEqual(told.addedSkills, ['gamma']);
  assert.ok(told.task?.startsWith('## What was asked for\n\nadd a flag'), told.task ?? 'null');
  assert.ok(!told.task?.includes('Build it.'), 'the policy is not told again in the task');
  assert.equal(`${briefBody(step)}\n\n${told.task}`, brief, 'the cut loses nothing');
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

test('a brief that does not open with the layers is the task whole, never cut at a wrong offset', () => {
  const step = stepOf('agent: ada');
  const resumed = '## Your answer\n\nTry again.\n\n## When you are finished\n\nSign off.';
  assert.equal(toldLayers(step, resumed).task, resumed, "a resumed try's brief opens with its own section");
  const shorter = `${'x'.repeat(step.agent!.body.length)}\n\n## What was asked for`;
  assert.equal(toldLayers(step, shorter).task, shorter, 'a brief as long as the note, opening with other words');
  const old = { ...step, agent: { ...step.agent!, instructions: undefined, customInstructions: undefined, skills: undefined } };
  const told = toldLayers(old, `${old.body}\n\n## What was asked for`);
  assert.equal(told.instructions, null);
  assert.ok(told.task?.startsWith('You are Ada.'), 'a record frozen without the instructions keeps them in the task, not lost');
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
  const step = parseWorkflow('build', 'Build it.\n');
  const told = toldLayers(step, null);
  assert.deepEqual(told, {
    agent: null,
    instructions: null,
    custom: null,
    agentSkills: [],
    policy: 'Build it.',
    addedSkills: [],
    task: null,
    via: 'brief',
  });
  assert.equal(toldLayers(step, briefOf(step)).task?.startsWith('## What was asked for'), true);
});

test("a skill both the agent and the step name is the agent's; only what the step's line adds is the step's", () => {
  assert.deepEqual(skillLayers(stepOf('agent: ada\nskills: beta, gamma')), { agent: ['alpha', 'beta'], added: ['gamma'] });
  assert.deepEqual(skillLayers(stepOf('agent: ada')), { agent: ['alpha', 'beta'], added: [] });
  assert.deepEqual(skillLayers(stepOf('agent: bare\nskills: gamma')), { agent: [], added: ['gamma'] });
  assert.deepEqual(skillLayers(parseWorkflow('build', 'Build it.\n')), { agent: [], added: [] });
});

test("a record frozen before the added skills were: every skill the step's line names counts as the step's", () => {
  const step = stepOf('agent: ada\nskills: beta, gamma');
  const { addedSkills: _added, ...agent } = step.agent!;
  assert.deepEqual(skillLayers({ ...step, agent }), { agent: ['alpha'], added: ['beta', 'gamma'] });
});
