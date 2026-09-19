/**
 * An agent is written once: a file in `agents/`, beside the workflows whose steps name it — its frontmatter the role keys, its body its
 * instructions. What an agent file may say, and where the folder of them is not a workflow.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { AGENT_KEYS, agentsDir, loadAgents, loadWorkflows, parseAgent, parseWorkflow, renderStep, STEP_KEYS, workflowFolder, workflowsIn, WorkflowError, type Agent, type Agents } from '../src/workflow.ts';

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-agents-'));
process.env.WF_ROOT = ROOT;
const { start, writeWorkflow } = await import('../src/runner.ts');

/** A folder of workflows under a fresh directory, each file written from `files`, by its path from the folder. */
function workflows(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(ROOT, 'workflows-'));
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

const agent = (name: string, text: string, read?: (file: string) => string | undefined): Agent => parseAgent(name, text, read);

test('an agent is its role keys as written, its description, and its body as its instructions', () => {
  const a = agent('implementer', '---\ndescription: Does the work\nharness: claude\nmodel: opus\neffort: high\ncontext: 200k\ndisallow: SendMessage\n---\nImplement what you are asked.\n');
  assert.equal(a.name, 'implementer');
  assert.equal(a.description, 'Does the work');
  assert.deepEqual(a.keys, { harness: 'claude', model: 'opus', effort: 'high', context: '200k', disallow: 'SendMessage' });
  assert.equal(a.body, 'Implement what you are asked.');
  assert.equal(agent('quiet', '---\nmodel: opus\n---\n').body, '', 'an agent may set only how its steps run');
});

test('the role keys are the keys a step has, but for wiring, and the description', () => {
  for (const key of AGENT_KEYS) if (key !== 'description') assert.ok((STEP_KEYS as readonly string[]).includes(key), key);
});

test('REFUSED at shipped defaults: every wiring key in an agent file, by name, saying it belongs on the step', () => {
  const wiring = ['after', 'resume', 'input', 'workspace', 'slot', 'check', 'retries', 'gate', 'loop', 'rounds', 'budget', 'maxAttempts', 'deadlineSeconds'];
  assert.deepEqual(STEP_KEYS.filter((k) => !(AGENT_KEYS as readonly string[]).includes(k) && k !== ('agent' as string)).sort(), [...wiring].sort(), 'every key an agent may not set is wiring');
  for (const key of wiring) {
    const said = refusal(() => agent('implementer', `---\n${key}: something\n---\nImplement it.\n`));
    assert.ok(said.startsWith(`agents/implementer.md: \`${key}\` is wiring, and belongs on the step:`), said);
    assert.ok(said.includes('Move the line to each step that names this agent.'), said);
  }
});

test('REFUSED at shipped defaults: `agent:` inside an agent file, a key no agent has, and a value no step could run with — each naming agents/<file>', () => {
  const nested = refusal(() => agent('reviewer', '---\nagent: implementer\n---\nReview it.\n'));
  assert.ok(nested.startsWith("agents/reviewer.md: `agent` is a step's key, which attaches an agent to the step, and an agent does not name another."), nested);

  const unknown = refusal(() => agent('reviewer', '---\ncolour: red\n---\nReview it.\n'));
  assert.ok(unknown.startsWith(`agents/reviewer.md: \`colour\` is not a key an agent has. An agent's keys are: ${AGENT_KEYS.join(', ')}.`), unknown);

  const guide = refusal(() => agent('reviewer', '---\nguide: CLAUDE.md\n---\nReview it.\n'));
  assert.ok(guide.startsWith('agents/reviewer.md: an agent may not set `guide`'), guide);

  const effort = refusal(() => agent('reviewer', '---\neffort: loud\n---\nReview it.\n'));
  assert.ok(effort.startsWith('agents/reviewer.md: `effort: loud` is not an effort claude has'), effort);

  const tools = refusal(() => agent('reviewer', '---\nharness: codex\ntools: Read\n---\nReview it.\n'));
  assert.ok(tools.startsWith('agents/reviewer.md: `tools: Read` is a tool list, and codex has none'), tools);

  const twice = refusal(() => agent('reviewer', '---\nmodel: opus\nmodel: sonnet\n---\nReview it.\n'));
  assert.ok(twice.startsWith('agents/reviewer.md: `model` is set twice'), twice);

  const schema = refusal(() => agent('reviewer', '---\noutput: review.schema.json\n---\nReview it.\n', () => undefined));
  assert.ok(schema.startsWith('agents/reviewer.md: `output: review.schema.json` is not there.'), schema);
  assert.ok(schema.includes('write it beside agents/reviewer.md,'), schema);
});

test("loadAgents reads every agent in the folder, and keeps a broken one's refusal for the step that names it", () => {
  const dir = workflows({
    'agents/implementer.md': '---\nmodel: opus\n---\nImplement it.\n',
    'agents/broken.md': '---\ncheck: npm test\n---\nBreak it.\n',
    'agents/README.md': '# Agents\n\nThe agents the workflows name.\n',
    'agents/notes.txt': 'not an agent\n',
  });
  const agents = loadAgents(path.join(dir, 'agents'));
  assert.deepEqual([...agents.keys()].sort(), ['broken', 'implementer'], 'the README and a file that is not markdown are not agents');
  assert.equal((agents.get('implementer') as Agent).body, 'Implement it.');
  const broken = agents.get('broken');
  assert.ok(broken instanceof WorkflowError);
  assert.ok(broken.message.startsWith('agents/broken.md: `check` is wiring'), broken.message);
  assert.equal(loadAgents(path.join(dir, 'nowhere')).size, 0, 'no folder, no agents');
});

test('REFUSED at shipped defaults: an agent file that is a link, by name, in the words a linked step is refused with', () => {
  const dir = workflows({ 'elsewhere/implementer.md': '---\nmodel: opus\n---\nImplement it.\n', 'agents/reviewer.md': 'Review it.\n' });
  fs.symlinkSync(path.join(dir, 'elsewhere', 'implementer.md'), path.join(dir, 'agents', 'implementer.md'));
  const agents = loadAgents(path.join(dir, 'agents'));
  const linked = agents.get('implementer');
  assert.ok(linked instanceof WorkflowError, 'refused, though the file it points at is a good agent');
  assert.ok(linked.message.startsWith(`${path.join(dir, 'agents', 'implementer.md')} is a link, and an agent's file is its own:`), linked.message);
  assert.ok(linked.message.includes('Replace the link with a file of its own — remove the link and copy what it pointed at into its place, rm <file> && cp <target> <file> — or take it out of the folder.'), linked.message);
  assert.ok(!(agents.get('reviewer') instanceof WorkflowError), 'the agent beside it is read');
});

test('agents/ is beside the workflow folders, and is not one of them: workflowsIn does not list it', () => {
  const dir = workflows({ 'dev/implement.md': 'Implement it.\n', 'agents/implementer.md': 'Implement it.\n' });
  assert.equal(agentsDir(path.join(dir, 'dev')), path.join(dir, 'agents'));
  assert.deepEqual(workflowsIn(dir), ['dev']);
  const none = refusal(() => loadWorkflows(dir));
  assert.ok(none.endsWith(`— it holds workflows, each a folder of steps: dev. Name one of them: ${path.join(dir, 'dev')}.`), none);
});

test('REFUSED at shipped defaults: a workflow named agents — loaded, named bare, or written', () => {
  const repo = workflows({ 'workflows/dev/implement.md': 'Implement it.\n', 'workflows/agents/implementer.md': 'Implement it.\n' });
  const folder = path.join(repo, 'workflows', 'agents');
  const loaded = refusal(() => loadWorkflows(folder));
  assert.equal(loaded, `${folder} is agents/, the folder of the agents the workflows beside it name — its files are agents, not steps, so no workflow has its name. Name a workflow beside it, or give yours another name.`);

  const named = refusal(() => workflowFolder('agents', path.join(repo, 'elsewhere'), repo));
  assert.ok(named.startsWith(`${folder} is agents/, the folder of the agents`), named);

  const before = fs.readFileSync(path.join(folder, 'implementer.md'), 'utf8');
  const written = refusal(() => writeWorkflow(folder, [{ name: 'implement', after: [], body: 'Implement it.' }], undefined, { anywhere: true }));
  assert.ok(written.startsWith(`${folder} is agents/, the folder of the agents`), written);
  assert.deepEqual(fs.readdirSync(folder), ['implementer.md'], 'nothing written');
  assert.equal(fs.readFileSync(path.join(folder, 'implementer.md'), 'utf8'), before);
});

/** The agents a step may name, by name, each parsed from its file's text. */
const agentsOf = (files: Record<string, string>): Agents => new Map(Object.entries(files).map(([name, text]) => [name, agent(name, text)]));

const IMPLEMENTER = '---\ndescription: Does the work\nharness: claude\nmodel: opus\neffort: high\ncontext: 200k\ndisallow: SendMessage\n---\nImplement what you are asked.\n';

test("a step that names an agent runs with the agent's role keys, its own keys winning, and is told the agent's words, then its own", () => {
  const agents = agentsOf({ implementer: IMPLEMENTER });
  // The step is `build`, not `implementer`: nothing ties a step's name to its agent's.
  const build = parseWorkflow('build', '---\nagent: implementer\nafter: plan\nmodel: sonnet\ncheck: npm test\n---\nBuild the parser first.\n', undefined, agents);
  assert.equal(build.name, 'build');
  assert.equal(build.harness, 'claude');
  assert.equal(build.model, 'sonnet', "the step's own key wins");
  assert.equal(build.effort, 'high', "the agent's key is the default");
  assert.equal(build.context, 200000);
  assert.deepEqual(build.disallow, ['SendMessage']);
  assert.deepEqual(build.after, ['plan']);
  assert.equal(build.check, 'npm test');
  assert.equal(build.body, 'Implement what you are asked.\n\nBuild the parser first.');
  assert.deepEqual(build.agent, { name: 'implementer', keys: ['after', 'model', 'check'], body: 'Build the parser first.' });

  const bare = parseWorkflow('build', '---\nagent: implementer\n---\n', undefined, agents);
  assert.equal(bare.body, 'Implement what you are asked.', "no note of its own: the agent's words alone");
  assert.equal(bare.model, 'opus');

  const same = parseWorkflow('build', '---\nharness: claude\nmodel: opus\neffort: high\ncontext: 200k\ndisallow: SendMessage\n---\nImplement what you are asked.\n');
  const { agent: _agent, ...resolved } = bare;
  assert.deepEqual(resolved, same, 'resolved, it is the step written out whole');
  assert.equal(same.agent, undefined, 'a step with no agent carries no `agent`');
});

test('REFUSED at shipped defaults: a step naming an agent there is not, listing the agents there are — or saying there are none', () => {
  const agents = agentsOf({ implementer: IMPLEMENTER, reviewer: '---\nmodel: opus\n---\nReview it.\n' });
  const unknown = refusal(() => parseWorkflow('build', '---\nagent: builder\n---\nBuild it.\n', undefined, agents));
  assert.equal(unknown, 'build: `agent: builder` is not an agent here. The agents are: implementer, reviewer — name one, or write agents/builder.md beside them.');
  const none = refusal(() => parseWorkflow('build', '---\nagent: builder\n---\nBuild it.\n'));
  assert.ok(none.startsWith('build: `agent: builder` is not an agent here. There are none: an agent is a file in agents/'), none);
  const empty = refusal(() => parseWorkflow('build', '---\nagent: quiet\n---\n', undefined, agentsOf({ quiet: '---\nmodel: opus\n---\n' })));
  assert.ok(empty.startsWith("build: the body is empty, and so is agents/quiet.md's"), empty);
});

test("a schema the agent's output: names is read beside the agent, and one the step names beside the step", () => {
  const dir = workflows({
    'agents/reviewer.md': '---\noutput: review.schema.json\n---\nReview it.\n',
    'agents/review.schema.json': '{"type":"object","properties":{"verdict":{"type":"string"}},"required":["verdict"],"additionalProperties":false}',
    'dev/implement.md': 'Implement it.\n',
    'dev/check.md': '---\nagent: reviewer\nafter: implement\n---\n',
    'dev/judge.md': '---\nagent: reviewer\nafter: implement\noutput: judge.schema.json\n---\n',
    'dev/judge.schema.json': '{"type":"object","properties":{"ok":{"type":"boolean"}},"required":["ok"],"additionalProperties":false}',
  });
  const steps = loadWorkflows(path.join(dir, 'dev'));
  const check = steps.find((s) => s.name === 'check')!;
  assert.equal(check.output?.file, 'review.schema.json');
  assert.deepEqual(Object.keys((check.output?.schema as { properties: object }).properties), ['verdict']);
  const judge = steps.find((s) => s.name === 'judge')!;
  assert.deepEqual(Object.keys((judge.output?.schema as { properties: object }).properties), ['ok']);
});

test('REFUSED at shipped defaults: a broken agent, only when a step names it, naming agents/<file> — a linked one too', () => {
  const dir = workflows({
    'agents/implementer.md': IMPLEMENTER,
    'agents/broken.md': '---\nretries: 2\n---\nBreak it.\n',
    'elsewhere/linked.md': '---\nmodel: opus\n---\nLinked.\n',
    'dev/build.md': '---\nagent: implementer\n---\n',
    'bad/build.md': '---\nagent: broken\n---\n',
    'linked/build.md': '---\nagent: linked\n---\n',
  });
  fs.symlinkSync(path.join(dir, 'elsewhere', 'linked.md'), path.join(dir, 'agents', 'linked.md'));
  assert.equal(loadWorkflows(path.join(dir, 'dev'))[0]!.model, 'opus', 'a broken agent beside it stops no step that does not name it');
  const broken = refusal(() => loadWorkflows(path.join(dir, 'bad')));
  assert.ok(broken.startsWith('build: `agent: broken` names an agent whose file is refused — agents/broken.md: `retries` is wiring, and belongs on the step:'), broken);
  const linked = refusal(() => loadWorkflows(path.join(dir, 'linked')));
  assert.ok(linked.startsWith(`build: \`agent: linked\` names an agent whose file is refused — ${path.join(dir, 'agents', 'linked.md')} is a link`), linked);
});

test("renderStep writes a resolved step as its file was: `agent:`, the step's own keys and its own note — never the agent's", () => {
  const agents = agentsOf({ implementer: IMPLEMENTER });
  const text = '---\nafter: plan\nresume: plan\nagent: implementer\nmodel: sonnet\n---\nBuild the parser first.\n';
  const build = parseWorkflow('build', text, undefined, agents);
  const rendered = renderStep(build);
  assert.equal(rendered, '---\nafter: plan\nresume: plan\nagent: implementer\nmodel: sonnet\n---\nBuild the parser first.\n');
  assert.deepEqual(parseWorkflow('build', rendered, undefined, agents), build, 'it reads back as the same step');
  assert.equal(renderStep(parseWorkflow('build', '---\nagent: implementer\n---\n', undefined, agents)), '---\nagent: implementer\n---\n\n');

  const draft = renderStep({ name: 'build', after: [], agent: 'implementer', model: 'sonnet', body: 'Build it.' });
  assert.equal(draft, '---\nagent: implementer\nmodel: sonnet\n---\nBuild it.\n', "a draft naming its agent is its own keys and note");
});

test('writeWorkflow resolves against the agents beside the folder, keeps a file that reads as its step, and refuses an agent there is not', () => {
  const dir = workflows({ 'agents/implementer.md': IMPLEMENTER, 'dev/build.md': '---\n# the implementer, cheaper\nagent: implementer\nmodel: sonnet\n---\n' });
  const folder = path.join(dir, 'dev');
  const steps = loadWorkflows(folder);
  const written = writeWorkflow(folder, steps, undefined, { anywhere: true });
  assert.deepEqual(written.kept, ['build.md'], 'the file with its comment is kept');
  assert.deepEqual(written.steps, steps);

  const unknown = refusal(() => writeWorkflow(folder, [{ name: 'build', after: [], agent: 'builder', body: 'Build it.' }], undefined, { anywhere: true }));
  assert.ok(unknown.startsWith('build: `agent: builder` is not an agent here. The agents are: implementer'), unknown);
  assert.equal(fs.readFileSync(path.join(folder, 'build.md'), 'utf8'), '---\n# the implementer, cheaper\nagent: implementer\nmodel: sonnet\n---\n', 'nothing written');
});

test('wf start freezes the resolved steps on the run: an agent edited after the start changes no step of the run', () => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(repo, 'README.md'), 'x\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  const dir = workflows({ 'agents/implementer.md': IMPLEMENTER, 'dev/build.md': '---\nagent: implementer\n---\nBuild it.\n' });
  const run = start({ brief: 'build it', repo, workflowDir: path.join(dir, 'dev'), isolate: false });
  fs.writeFileSync(path.join(dir, 'agents', 'implementer.md'), '---\nmodel: haiku\n---\nSomething else.\n');
  const [build] = run.workflow;
  assert.equal(build!.model, 'opus');
  assert.equal(build!.body, 'Implement what you are asked.\n\nBuild it.');
  assert.deepEqual(build!.agent, { name: 'implementer', keys: [], body: 'Build it.' });
});
