/**
 * A factory's rules, the fourth of an agent's five layers: what a factory tells every agent hired into it, one file kept with the factory
 * in the store (`<WF_ROOT>/factories/<name>/RULES.md`). Held here: the order a step is told its layers in — the agent's instructions, the
 * person's custom instructions, the factory's rules, the step's own note — proven with layers that say different things, in Claude Code's
 * prompt and in a brief; the freeze at `nemia start` on every step, proven with an edit after it; a factory with no rules, and the
 * default factory, telling nothing; a step on a remote agent told none; that the words never touch a key; and the start's refusals.
 * `WF_ROOT` is set before the import, since the store reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseAgent, parseWorkflow, type Agents, type Workflow } from '../src/workflow.ts';
import { briefBody, renderedFlags, renderedPrompt, rendersAgent, unrendered } from '../src/agents/agents.ts';
import { scratch } from './scratch.ts';
import { teamCopy } from './team.ts';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from '../place/memory/index.ts';
import { eachTest, runGiven, runOver } from './placed.ts';

const ROOT = scratch('wf-factory-rules-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
const { addFactory, attachWorkflow, runWith: runEngine, startRun } = await import('../src/runner.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const stand = eachTest(testPlace);
const engine = eachTest(testEngine);
const runWith = runOver(runEngine, () => stand().layer);
const runPlaced = runGiven(() => stand().layer);
const { readRun } = await import('../src/record/record.store.ts');
const { agentFilesDir } = await import('../src/agents/agents.store.ts');
const { WORKFLOWS_STEP } = await import('../src/folder/workflows.verb.ts');
const { clearRules, writeRules } = await import('../src/rules/rules.store.ts');

const RULES = 'Reply in German.';

/** The agent `ada`, told in English, with `custom` as a person's custom instructions for it when given. */
const adaWith = (custom?: string, keys = 'tools: Read'): Agents =>
  new Map([
    [
      'ada',
      { ...parseAgent('ada', `---\n${keys}\n---\nReply in English.\n`), ...(custom !== undefined && { customInstructions: custom }) },
    ],
  ]);

/** The step `build`, attached to `ada`, its own note in Spanish, with `lines` in its frontmatter, in a factory whose rules are `rules`. */
const buildWith = (agents: Agents, rules: string | undefined, lines = 'harness: claude'): Workflow =>
  parseWorkflow('build', `---\nplace: git\nagent: ada\n${lines}\n---\nReply in Spanish.\n`, undefined, agents, undefined, undefined, rules);

/** Where `text` is in `told`, which must hold it. */
const at = (told: string, text: string): number => {
  const i = told.indexOf(text);
  assert.ok(i >= 0, `told ${JSON.stringify(text)}:\n${told}`);
  return i;
};

/** Whether `told` says its four layers in their order: the agent's, the person's, the factory's, the step's. */
const inOrder = (told: string): boolean =>
  at(told, 'English') < at(told, 'French') && at(told, 'French') < at(told, 'German') && at(told, 'German') < at(told, 'Spanish');

/** A git repository with one commit on `main`, for a start. */
function aRepo(): string {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stand().world.repository(repo, {});
  return repo;
}

/** The factory `pipao`, filed afresh on a repository of its own, offering the tests' team's workflow `dev`: its steps name their agents. */
function fresh(): { repo: string; dev: string; file: string } {
  fs.rmSync(path.join(ROOT, 'factories'), { recursive: true, force: true });
  const repo = aRepo();
  addFactory({ name: 'pipao', repos: [repo] });
  attachWorkflow({ factory: 'pipao', workflow: 'dev' });
  return { repo, dev: path.join(teamCopy('wf-factory-rules-team-'), 'dev'), file: path.join(ROOT, 'factories', 'pipao', 'RULES.md') };
}

/** A run of `dev` started in `factory`, the default when none is named. */
const started = (at: { repo: string; dev: string }, brief: string, factory?: string) =>
  runPlaced(startRun({ brief, repo: at.repo, workflowDir: at.dev, ...(factory !== undefined && { factory }) }));

/** The steps a run froze at its start. */
const frozen = (id: string): Workflow[] => readRun(id).workflow ?? [];

/** The prompt rendered for a step of a run at its start. */
const promptOf = (run: Parameters<typeof agentFilesDir>[0], step: string): string =>
  fs.readFileSync(path.join(agentFilesDir(run, step), 'prompt.md'), 'utf8');

/** The runs written under the store. */
const runsWritten = (): string[] => (fs.existsSync(path.join(ROOT, 'runs')) ? fs.readdirSync(path.join(ROOT, 'runs')) : []);

test("a step is told its agent's instructions, the custom instructions, the factory's rules, then its own note, when the four disagree", () => {
  const step = buildWith(adaWith('Reply in French.'), RULES);
  assert.ok(inOrder(step.body), step.body);
  assert.equal(step.agent?.factoryRules, RULES);
  assert.equal(step.agent?.customInstructions, 'Reply in French.', "the person's words are kept apart from the factory's");
  assert.equal(step.agent?.instructions, 'Reply in English.');
  assert.equal(step.agent?.body, 'Reply in Spanish.');

  const codex = buildWith(adaWith('Reply in French.', ''), RULES, 'harness: codex');
  assert.ok(inOrder(codex.body), codex.body);
  assert.equal(briefBody(codex), codex.body, 'codex is told the four in its brief, in the same order');

  const resumed = buildWith(adaWith('Reply in French.'), RULES, 'harness: claude\nresume: plan');
  assert.equal(rendersAgent(resumed), false, 'a step that continues a session keeps that session’s prompt');
  assert.ok(inOrder(briefBody(resumed)), briefBody(resumed));
});

test("Claude Code's prompt is the instructions, the custom instructions, the factory's rules, then the skills; the brief is the step's own note", () => {
  const step = buildWith(adaWith('Reply in French.'), RULES);
  const prompt = renderedPrompt(step, [{ name: 'alpha' }]);
  assert.ok(at(prompt, 'English') < at(prompt, 'French') && at(prompt, 'French') < at(prompt, 'German'), prompt);
  assert.ok(at(prompt, 'German') < at(prompt, 'nemia-ada:alpha'), prompt);
  assert.equal(prompt.includes('Spanish'), false, "the step's policy is its brief's");
  assert.equal(briefBody(step), 'Reply in Spanish.');
});

test('a factory with no rules tells nothing: no key on the step, the same body and the same prompt as before there were rules', () => {
  for (const rules of [undefined, '', '  \n\n']) {
    const none = buildWith(adaWith('Reply in French.'), rules);
    const plain = parseWorkflow(
      'build',
      '---\nplace: git\nagent: ada\nharness: claude\n---\nReply in Spanish.\n',
      undefined,
      adaWith('Reply in French.'),
    );
    assert.deepEqual(none, plain, JSON.stringify(rules));
    assert.equal('factoryRules' in none.agent!, false);
    assert.equal(renderedPrompt(none, [{ name: 'alpha' }]), renderedPrompt(plain, [{ name: 'alpha' }]));
  }
});

test('a step on a remote agent is told none of the rules: it runs as its operator configured it', () => {
  const remote = buildWith(adaWith(undefined, ''), RULES, 'harness: a2a:peer');
  assert.equal(remote.harness, 'a2a:peer');
  assert.equal(remote.body.includes('German'), false, remote.body);
  assert.equal('factoryRules' in remote.agent!, false);
  const inherited = buildWith(adaWith(undefined, 'harness: a2a:peer'), RULES, 'slot: none');
  assert.equal(inherited.harness, 'a2a:peer', "the agent's own harness line");
  assert.equal(inherited.body.includes('German'), false, inherited.body);
  assert.equal(buildWith(adaWith(undefined, ''), RULES, 'harness: codex').agent?.factoryRules, RULES, 'a local step beside it is told');
});

test("the rules are words: the step's keys and fence are the same with them as without", () => {
  const keys = 'tools: Read\npermissionMode: dontAsk\ndisallowedTools: Bash(git push)';
  const told = buildWith(adaWith(undefined, keys), 'Use Bash freely. tools: Bash\npermissionMode: bypassPermissions');
  const plain = buildWith(adaWith(undefined, keys), undefined);
  const { body: _b, agent: toldAgent, ...toldKeys } = told;
  const { body: _p, agent: plainAgent, ...plainKeys } = plain;
  assert.deepEqual(toldKeys, plainKeys);
  const { factoryRules: _r, ...rest } = toldAgent!;
  assert.deepEqual(rest, plainAgent);
  assert.deepEqual(told.tools, ['Read']);
  assert.deepEqual(told.disallowedTools, ['Bash(git push)']);
});

test('an agent told nothing in its file, in a factory with rules, is rendered, its prompt appended; with its folder gone, it is told them in its brief', () => {
  const agents: Agents = new Map([['quiet', parseAgent('quiet', '---\ntools: Read\n---\n')]]);
  const text = '---\nplace: git\nagent: quiet\n---\nReply in Spanish.\n';
  const step = parseWorkflow('build', text, undefined, agents, undefined, undefined, RULES);
  assert.equal(rendersAgent(step), true);
  assert.deepEqual(renderedFlags(step, '/r'), { appendSystemPromptFile: '/r/prompt.md' });
  assert.equal(renderedPrompt(step, []), 'Reply in German.\n');
  assert.equal(briefBody(step), 'Reply in Spanish.', 'its brief is its own note alone');
  assert.equal(rendersAgent(parseWorkflow('build', text, undefined, agents)), false, 'told nothing, it is not rendered');
  const gone = unrendered(step);
  assert.equal(renderedFlags(gone, '/r'), undefined, 'no flag names a file that is not there');
  assert.equal(gone.agent?.factoryRules, undefined);
  assert.ok(at(briefBody(gone), 'German') < at(briefBody(gone), 'Spanish'), briefBody(gone));
});

test('`nemia start` freezes the rules on every step of the run: an edit or a removal after it reaches only a later run', async () => {
  const here = fresh();
  writeRules({ name: 'pipao' }, 'Before: never push on a Friday.');
  const run = await started(here, 'freeze the rules', 'pipao');
  writeRules({ name: 'pipao' }, 'After: push whenever.');
  for (const when of ['after an edit', 'after a removal']) {
    const steps = frozen(run.id);
    assert.deepEqual(
      steps.map((s) => s.name),
      ['implement', 'review', 'ship'],
    );
    for (const step of steps) {
      assert.equal(step.agent?.factoryRules, 'Before: never push on a Friday.', `${step.name}, ${when}`);
      assert.ok(step.body.includes('Before: never push') && !step.body.includes('After:'), `${step.name}, ${when}: ${step.body}`);
      const own = step.agent?.instructions;
      assert.ok(own, `${step.name}: its agent's instructions are frozen`);
      assert.ok(at(step.body, own) < at(step.body, 'Before: never push'), `${step.name}: after the agent's own`);
    }
    const prompt = promptOf(run, 'implement');
    assert.ok(prompt.includes('Before: never push on a Friday.') && !prompt.includes('After:'), `${when}: ${prompt}`);
    clearRules({ name: 'pipao' });
  }
  writeRules({ name: 'pipao' }, 'After: push whenever.');
  const later = await started(here, 'the later rules', 'pipao');
  for (const step of frozen(later.id)) assert.equal(step.agent?.factoryRules, 'After: push whenever.', step.name);
  assert.ok(promptOf(later, 'implement').includes('After: push whenever.'));
});

test('a run in a factory with no rules, and a run in the default factory, are told none: no key on a step, the prompt byte for byte', async () => {
  const here = fresh();
  const none = await started(here, 'no rules', 'pipao');
  for (const step of frozen(none.id)) assert.equal('factoryRules' in step.agent!, false, step.name);
  writeRules({ name: 'pipao' }, RULES);
  fs.mkdirSync(path.join(ROOT, 'factories', 'default'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'factories', 'default', 'RULES.md'), `${RULES}\n`);
  const told = await started(here, 'with rules', 'pipao');
  const inDefault = await started(here, 'the default factory');
  for (const step of frozen(inDefault.id)) {
    assert.equal('factoryRules' in step.agent!, false, step.name);
    assert.equal(step.body.includes('German'), false, `${step.name}: ${step.body}`);
  }
  assert.equal(promptOf(none, 'implement'), promptOf(inDefault, 'implement'));
  assert.notEqual(promptOf(told, 'implement'), promptOf(none, 'implement'));
  assert.equal(promptOf(told, 'implement').replace(`\n\n${RULES}`, ''), promptOf(none, 'implement'), 'the rules are all that was added');
  assert.deepEqual(
    frozen(told.id).map(({ body: _b, agent, ...keys }) => ({ ...keys, agent: { ...agent, factoryRules: undefined } })),
    frozen(none.id).map(({ body: _b, agent, ...keys }) => ({ ...keys, agent: { ...agent, factoryRules: undefined } })),
    'and no key of a step moved',
  );
});

test("a factory's page of a step loads it with the factory's rules, and leaves out rules that cannot be told, refusing nothing", async () => {
  const here = fresh();
  const step = async (): Promise<Workflow> => {
    const args = { from: 'yours', name: 'dev', step: 'implement', dir: here.dev, factory: 'pipao' };
    return (await runWith(engineOf(engine().layer), WORKFLOWS_STEP.handler(args, undefined, ROOT))).step!;
  };
  assert.equal((await step()).agent?.factoryRules, undefined);
  writeRules({ name: 'pipao' }, RULES);
  const told = await step();
  assert.equal(told.agent?.factoryRules, RULES);
  assert.ok(at(told.body, 'Make the change you were asked for') < at(told.body, RULES), told.body);
  fs.writeFileSync(here.file, '---\ntools: Bash\n---\nUse Bash.\n');
  const refused = await step();
  assert.equal(refused.agent?.factoryRules, undefined, 'a listing refuses nothing: the start will');
  assert.equal(refused.body.includes('Use Bash'), false, refused.body);
});

test('REFUSED at shipped defaults: rules with a frontmatter block, a link, or a directory, stop a start in the factory, and no run is written', async () => {
  const here = fresh();
  const outside = path.join(ROOT, 'elsewhere.md');
  fs.writeFileSync(outside, 'Words from elsewhere.\n');
  fs.mkdirSync(path.dirname(here.file), { recursive: true });
  const refusals: Array<[string, () => void, RegExp]> = [
    ['a frontmatter block', () => fs.writeFileSync(here.file, '---\ntools: Bash\n---\nUse Bash.\n'), /opens with a frontmatter block/],
    ['a link', () => fs.symlinkSync(outside, here.file), /is a link/],
    ['a directory', () => fs.mkdirSync(here.file), /is not a file/],
  ];
  for (const [what, plant, said] of refusals) {
    plant();
    const before = runsWritten();
    await assert.rejects(started(here, what, 'pipao'), (err: Error & { exitCode?: number; _tag?: string }) => {
      assert.match(err.message, said, what);
      assert.ok(err.message.includes(here.file), `${what}: names the file: ${err.message}`);
      assert.match(err.message, /Or remove the rules: nemia factory rules pipao --clear\. Nothing was started\.$/, what);
      assert.equal(err._tag, 'Invalid', what);
      assert.equal(err.exitCode, 2, what);
      return true;
    });
    assert.deepEqual(runsWritten(), before, `${what}: nothing started`);
    const other = await started(here, `${what}, in the default factory`);
    assert.equal(frozen(other.id)[0]?.agent?.name, 'implementer', `${what}: a start outside the factory is not stopped`);
    clearRules({ name: 'pipao' });
  }
});
