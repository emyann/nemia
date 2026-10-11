/**
 * A step's policy may add skills to its agent's (`skills:` on a step): the session is given the agent's skills and then the step's, each
 * once, frozen at `nemia start`; the step's file is written back with its own line; and a step never takes one away. Refused: a skill the
 * agent's fence cannot load (`addedSkillsRefusal`), one no place has, a line on a step with no agent, and one the step's harness or
 * `resume:` cannot reach. Each refusal beside what still loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parseAgent, parseWorkflow, renderStep, WorkflowError, type Agents, type Workflow } from '../src/workflow.ts';
import { FrozenStepSchema, loadWorkflows } from '../src/folder/folder.store.ts';
import { skillsFor } from '../src/skills/read.store.ts';
import { Result, Schema } from 'effect';
import { scratch } from './scratch.ts';
import { teamCopy } from './team.ts';
import { testPlace } from '../place/memory/index.ts';
import { eachTest, runGiven } from './placed.ts';

const ROOT = scratch('wf-step-skills-');
process.env.WF_ROOT = ROOT;
const { startRun, writeWorkflow } = await import('../src/runner.ts');
const stand = eachTest(testPlace);
const runPlaced = runGiven(() => stand().layer);
const { readRun } = await import('../src/record/record.store.ts');
const { agentFilesDir } = await import('../src/agents/agents.store.ts');

/** The agents of `files`, by name, each parsed from its file's text. */
const agentsOf = (files: Record<string, string>): Agents =>
  new Map(Object.entries(files).map(([name, text]) => [name, parseAgent(name, text)]));

/** The step `name` written with `lines` as its frontmatter, resolved with `agents`. */
const stepOf = (agents: Agents, lines: string, name = 'build'): Workflow =>
  parseWorkflow(name, `---\nplace: git\n${lines}\n---\nDo it.\n`, undefined, agents);

/** What `fn` was refused with: a `WorkflowError`'s message, or a failed assertion when it was not refused. */
function refusal(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof WorkflowError, String(err));
    return err.message;
  }
  return assert.fail('it was not refused');
}

const AGENTS = agentsOf({ ada: '---\nskills: alpha, beta\n---\nWork.\n', bare: '---\n---\nWork.\n' });

test("the session is given the agent's skills, then the step's, each once; the step keeps its own line", () => {
  const step = stepOf(AGENTS, 'agent: ada\nskills: beta, gamma');
  assert.deepEqual(step.agent?.skills, ['alpha', 'beta', 'gamma']);
  assert.deepEqual(step.skills, ['beta', 'gamma']);
  assert.deepEqual(stepOf(AGENTS, 'agent: bare\nskills: gamma').agent?.skills, ['gamma'], 'an agent with none is given the step’s');
  assert.equal(stepOf(AGENTS, 'agent: bare').agent?.skills, undefined, 'none from either, none at all');
});

test("the skills a step's line adds beyond its agent's are frozen apart, in its order; a step with no line freezes none", () => {
  assert.deepEqual(stepOf(AGENTS, 'agent: ada\nskills: beta, gamma').agent?.addedSkills, ['gamma']);
  assert.deepEqual(stepOf(AGENTS, 'agent: ada\nskills: beta, alpha').agent?.addedSkills, [], 'a line naming only the agent’s adds none');
  assert.deepEqual(stepOf(AGENTS, 'agent: bare\nskills: gamma, delta').agent?.addedSkills, ['gamma', 'delta']);
  assert.equal(stepOf(AGENTS, 'agent: ada').agent?.addedSkills, undefined, 'no line, no key');
});

test('a step never takes a skill from its agent: naming a few of them still gives the session all', () => {
  const step = stepOf(AGENTS, 'agent: ada\nskills: alpha');
  assert.deepEqual(step.agent?.skills, ['alpha', 'beta']);
  assert.deepEqual(step.skills, ['alpha']);
});

test("a step is written back with its own `skills:` line as it wrote it, never its agent's, and reads back as the same step", () => {
  const step = stepOf(AGENTS, 'agent: ada\nskills: beta, gamma');
  const text = renderStep(step);
  assert.equal(text, '---\nplace: git\nagent: ada\nskills: beta, gamma\n---\nDo it.\n');
  assert.ok(isDeepStrictEqual(parseWorkflow('build', text, undefined, AGENTS), step), text);
  assert.equal(
    renderStep(stepOf(AGENTS, 'agent: ada')),
    '---\nplace: git\nagent: ada\n---\nDo it.\n',
    'a step that adds none writes no line',
  );
});

/** Holds a fence refusal to its parts: the step and its line, the skill, the agent's file, the rule and both fixes. */
function holds(said: string, skill: string, agent: string): void {
  assert.ok(said.startsWith(`build: \`skills: ${skill}\` adds \`${skill}\` to ${agent}'s skills`), said);
  assert.ok(said.includes(`agents/${agent}.md`), said);
  assert.ok(said.includes("a step never widens its agent's fence"), said);
  assert.ok(said.includes(`take \`${skill}\` off this step's \`skills:\``), said);
}

test('REFUSED at shipped defaults: a skill added to an agent whose fence keeps the session from loading it, by `tools:` or by a deny', () => {
  const agents = agentsOf({
    tooled: '---\ntools: Read, Bash\n---\nWork.\n',
    denied: '---\ndisallowedTools: Skill\n---\nWork.\n',
    one: '---\ndisallowedTools: Skill(look)\n---\nWork.\n',
    other: '---\ndisallowedTools: Skill(other)\n---\nWork.\n',
    able: '---\ntools: Read, Bash, Skill\n---\nWork.\n',
  });
  const tooled = refusal(() => stepOf(agents, 'agent: tooled\nskills: look'));
  holds(tooled, 'look', 'tooled');
  assert.ok(tooled.includes('`tools: Read, Bash`'), tooled);
  assert.ok(tooled.includes('Give tooled `Skill`'), tooled);
  holds(
    refusal(() => stepOf(agents, 'agent: denied\nskills: look')),
    'look',
    'denied',
  );
  const one = refusal(() => stepOf(agents, 'agent: one\nskills: look'));
  holds(one, 'look', 'one');
  assert.ok(one.includes('`Skill(look)`'), one);
  assert.deepEqual(stepOf(agents, 'agent: other\nskills: look').agent?.skills, ['look'], 'a deny of another skill');
  assert.deepEqual(stepOf(agents, 'agent: able\nskills: look').agent?.skills, ['look'], 'an agent with `Skill`');
});

test('REFUSED at shipped defaults: the same skill added over a factory hire, and through writeWorkflow, which writes nothing', () => {
  const agents = agentsOf({ tooled: '---\ntools: Read, Bash\n---\nWork.\n' });
  const hire = { agent: 'tooled', factory: 'nemia', step: 'dev/build' };
  holds(
    refusal(() => parseWorkflow('build', '---\nplace: git\nskills: look\n---\nDo it.\n', undefined, agents, undefined, hire)),
    'look',
    'tooled',
  );

  const dir = fs.mkdtempSync(path.join(ROOT, 'workflows-'));
  fs.mkdirSync(path.join(dir, 'agents'));
  fs.mkdirSync(path.join(dir, 'dev'));
  fs.writeFileSync(path.join(dir, 'agents', 'tooled.md'), '---\ntools: Read, Bash\n---\nWork.\n');
  fs.writeFileSync(path.join(dir, 'dev', 'build.md'), '---\nplace: git\nagent: tooled\n---\n');
  const folder = path.join(dir, 'dev');
  holds(
    refusal(() =>
      writeWorkflow(folder, [{ name: 'build', after: [], place: 'git', agent: 'tooled', skills: ['look'], body: '' }], undefined, {
        anywhere: true,
      }),
    ),
    'look',
    'tooled',
  );
  assert.equal(fs.readFileSync(path.join(folder, 'build.md'), 'utf8'), '---\nplace: git\nagent: tooled\n---\n', 'nothing written');
});

test('REFUSED: `skills:` on a step with no agent, naming the fix; the same file over a factory hire loads', () => {
  const said = refusal(() => parseWorkflow('build', '---\nplace: git\nskills: look\n---\nDo it.\n'));
  assert.ok(said.startsWith('build: `skills: look`'), said);
  assert.ok(said.includes('`agent: <name>`'), said);
  const hired = parseWorkflow('build', '---\nplace: git\nskills: look\n---\nDo it.\n', undefined, AGENTS, undefined, {
    agent: 'ada',
    factory: 'nemia',
    step: 'dev/build',
  });
  assert.deepEqual(hired.agent?.skills, ['alpha', 'beta', 'look']);
});

test("REFUSED: a skill the step adds that its harness or `resume:` cannot reach, or that the step's own `tools:` cannot load, named for the step", () => {
  const codex = refusal(() => stepOf(AGENTS, 'agent: bare\nharness: codex\nskills: look'));
  assert.ok(codex.startsWith('build: `skills: look`'), codex);
  assert.ok(codex.includes('codex loads none'), codex);
  const remote = refusal(() => stepOf(AGENTS, 'agent: bare\nharness: a2a:reviewer\nskills: look'));
  assert.ok(remote.startsWith('build: `skills: look`'), remote);
  assert.ok(remote.includes('remote A2A agent'), remote);
  const resumed = refusal(() => stepOf(AGENTS, 'agent: bare\nresume: plan\nskills: look'));
  assert.ok(resumed.startsWith('build: `skills: look`'), resumed);
  assert.ok(resumed.includes('`resume: plan`'), resumed);
  const narrowed = refusal(() =>
    stepOf(agentsOf({ able: '---\ntools: Read, Skill\n---\nWork.\n' }), 'agent: able\ntools: Read\nskills: look'),
  );
  assert.ok(narrowed.startsWith('build: `skills: look`'), narrowed);
  assert.ok(narrowed.includes('Add `Skill` to `tools:`'), narrowed);
});

test("REFUSED: a step's `skills:` that names no skill, one twice, or a name no skill has, in the agent line's words", () => {
  assert.equal(
    refusal(() => stepOf(AGENTS, 'agent: ada\nskills: a, a')),
    'build: `skills: a, a` names `a` twice. Name it once.',
  );
  assert.ok(
    refusal(() => stepOf(AGENTS, 'agent: ada\nskills: Look')).startsWith("build: `skills: Look` has `Look`, which is not a skill's name."),
  );
});

/** The tests' team, copied, with `dev/implement.md` written as `text`: the copy's root. */
function teamWith(text: string): string {
  const root = teamCopy('wf-step-skills-team-');
  fs.writeFileSync(path.join(root, 'dev', 'implement.md'), text);
  return root;
}

test('REFUSED: a skill the step adds that no place has, naming every place looked in and the fix; one the team has loads', () => {
  const root = teamWith('---\nplace: git\nagent: implementer\nskills: no-such-skill\n---\n');
  const said = refusal(() => loadWorkflows(path.join(root, 'dev')));
  assert.ok(said.startsWith('implement: `skills: no-such-skill` adds the skill `no-such-skill`, and no skills folder has it'), said);
  for (const looked of skillsFor(path.join(root, 'dev')).looked) assert.ok(said.includes(looked), `names ${looked}: ${said}`);
  assert.ok(said.includes("take `no-such-skill` off this step's `skills:`"), said);

  const found = teamWith('---\nplace: git\nagent: implementer\nskills: review-a-change\n---\n');
  const step = loadWorkflows(path.join(found, 'dev')).find((s) => s.name === 'implement')!;
  assert.deepEqual(step.agent?.skills, ['implement-a-change', 'review-a-change']);
});

test("`nemia start` freezes the step's own line and the session's list, renders the added skill and names it; a later edit changes nothing", async () => {
  const root = teamWith('---\nplace: git\nagent: implementer\nskills: review-a-change\n---\n');
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stand().world.repository(repo, {});
  const run = await runPlaced(startRun({ brief: 'add a skill', repo, workflowDir: path.join(root, 'dev') }));
  fs.writeFileSync(path.join(root, 'dev', 'implement.md'), '---\nplace: git\nagent: implementer\n---\n');
  const frozen = (readRun(run.id).workflow ?? []).find((s) => s.name === 'implement')!;
  assert.deepEqual(frozen.skills, ['review-a-change']);
  assert.deepEqual(frozen.agent?.skills, ['implement-a-change', 'review-a-change']);
  assert.deepEqual(frozen.agent?.addedSkills, ['review-a-change']);
  const at = agentFilesDir(run, 'implement');
  const plugin = fs.readdirSync(at).find((entry) => fs.statSync(path.join(at, entry)).isDirectory())!;
  assert.ok(fs.existsSync(path.join(at, plugin, 'skills', 'review-a-change', 'SKILL.md')), `${at}/${plugin}`);
  assert.ok(fs.readFileSync(path.join(at, 'prompt.md'), 'utf8').includes(`\`${plugin}:review-a-change\``));
});

test('a frozen step with its own `skills:` reads back by the schema, and so does an older one without', () => {
  const step = stepOf(AGENTS, 'agent: ada\nskills: beta, gamma');
  const decode = Schema.decodeUnknownResult(FrozenStepSchema);
  for (const frozen of [step, stepOf(AGENTS, 'agent: ada')].map((s) => JSON.parse(JSON.stringify(s)) as unknown)) {
    const read = decode(frozen);
    assert.ok(Result.isSuccess(read), Result.isFailure(read) ? String(read.failure) : '');
    assert.deepEqual(read.success, frozen);
  }
  const wrong = decode({ ...JSON.parse(JSON.stringify(step)), skills: 'beta' });
  assert.ok(Result.isFailure(wrong), 'a line that is not a list is refused');
  const added = decode({ ...JSON.parse(JSON.stringify(step)), agent: { ...step.agent, addedSkills: 'gamma' } });
  assert.ok(Result.isFailure(added), 'added skills that are not a list are refused');
});
