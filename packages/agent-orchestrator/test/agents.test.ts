/**
 * An agent is written once: a file in `agents/`, beside the workflows whose steps name it — its frontmatter the role keys, its body its
 * instructions. What an agent file may say, and where the folder of them is not a workflow.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { AGENT_KEYS, AGENT_OWN_KEYS, agentsDir, parseAgent, parseWorkflow, renderStep, STEP_KEYS, WorkflowError, type Agent, type Agents } from '../src/workflow.ts';
import { loadAgents, loadWorkflows, workflowFolder, workflowsIn } from '../src/workflow-store.ts';
import { scratch } from './scratch.ts';

const ROOT = scratch('wf-agents-');
process.env.WF_ROOT = ROOT;
const { start, writeWorkflow } = await import('../src/runner.ts');
const { agentFilesDir } = await import('../src/store.ts');

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
  const a = agent('implementer', '---\ndescription: Does the work\nharness: claude\nmodel: opus\neffort: high\ncontext: 200k\ndisallowedTools: SendMessage\n---\nImplement what you are asked.\n');
  assert.equal(a.name, 'implementer');
  assert.equal(a.description, 'Does the work');
  assert.deepEqual(a.keys, { harness: 'claude', model: 'opus', effort: 'high', context: '200k', disallowedTools: 'SendMessage' });
  assert.equal(a.body, 'Implement what you are asked.');
  assert.equal(agent('quiet', '---\nmodel: opus\n---\n').body, '', 'an agent may set only how its steps run');
});

// `description`, `card`, `skills` and `systemPrompt` describe the agent itself — who it is, what it says it can do, what it is given and how its
// sessions are told — and a step has none: a step's work is the workflow's, not the agent's. Every other agent key is a key a step may set for
// itself, and takes from its agent when it does not.
const AGENT_OWN = ['description', 'card', 'skills', 'systemPrompt'];

test('the role keys are the keys a step has, but for wiring, the agent\'s own keys', () => {
  assert.deepEqual([...AGENT_OWN_KEYS], AGENT_OWN, 'the package names the same keys as its own');
  for (const key of AGENT_KEYS) if (!AGENT_OWN.includes(key)) assert.ok((STEP_KEYS as readonly string[]).includes(key), key);
  for (const key of AGENT_OWN) assert.ok(!(STEP_KEYS as readonly string[]).includes(key), `${key} describes the agent, and is no step's key`);
});

test('REFUSED at shipped defaults: every wiring key in an agent file, by name, saying it belongs on the step', () => {
  const wiring = ['after', 'resume', 'input', 'workspace', 'slot', 'denials', 'background', 'check', 'retries', 'gate', 'loop', 'rounds', 'budget', 'deadlineSeconds'];
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

  const attempts = refusal(() => agent('reviewer', '---\nmaxAttempts: 1\n---\nReview it.\n'));
  assert.ok(attempts.startsWith('agents/reviewer.md: an agent may not set `maxAttempts` — the runtime makes one attempt at a session'), attempts);
  assert.ok(attempts.includes('`wf retry <run> <step>`'), attempts);

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

const IMPLEMENTER = '---\ndescription: Does the work\nharness: claude\nmodel: opus\neffort: high\ncontext: 200k\ndisallowedTools: SendMessage\n---\nImplement what you are asked.\n';

test("a step that names an agent runs with the agent's role keys, its own keys winning, and is told the agent's words, then its own", () => {
  const agents = agentsOf({ implementer: IMPLEMENTER });
  // The step is `build`, not `implementer`: nothing ties a step's name to its agent's.
  const build = parseWorkflow('build', '---\nagent: implementer\nafter: plan\nmodel: sonnet\ncheck: npm test\n---\nBuild the parser first.\n', undefined, agents);
  assert.equal(build.name, 'build');
  assert.equal(build.harness, 'claude');
  assert.equal(build.model, 'sonnet', "the step's own key wins");
  assert.equal(build.effort, 'high', "the agent's key is the default");
  assert.equal(build.context, 200000);
  assert.deepEqual(build.disallowedTools, ['SendMessage']);
  assert.deepEqual(build.after, ['plan']);
  assert.equal(build.check, 'npm test');
  assert.equal(build.body, 'Implement what you are asked.\n\nBuild the parser first.');
  assert.deepEqual(build.agent, {
    name: 'implementer', keys: ['after', 'model', 'check'], body: 'Build the parser first.',
    given: { harness: 'claude', effort: 'high', context: '200k', disallowedTools: 'SendMessage' },
    instructions: 'Implement what you are asked.',
  }, 'the keys the step set, its note, what each key it did not set read as, and the agent\'s instructions, which a Claude Code step is told in its system prompt');

  const bare = parseWorkflow('build', '---\nagent: implementer\n---\n', undefined, agents);
  assert.equal(bare.body, 'Implement what you are asked.', "no note of its own: the agent's words alone");
  assert.equal(bare.model, 'opus');

  const same = parseWorkflow('build', '---\nharness: claude\nmodel: opus\neffort: high\ncontext: 200k\ndisallowedTools: SendMessage\n---\nImplement what you are asked.\n');
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

  // A key the step did not set, changed since it was read, is the step's own now — never dropped for being the agent's.
  assert.equal(renderStep({ ...build, effort: 'low', after: ['plan', 'lint'] }), '---\nafter: plan, lint\nresume: plan\nagent: implementer\nmodel: sonnet\neffort: low\n---\nBuild the parser first.\n');
  const derived = parseWorkflow('build', '---\nresume: plan\nagent: implementer\n---\n', undefined, agents);
  assert.deepEqual(derived.after, ['plan']);
  assert.equal(renderStep(derived), '---\nresume: plan\nagent: implementer\n---\n\n', "an after: the parser made of resume: is not written as the step's");

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

test("a codex agent names its sandbox as `sandbox:`, and one that says `permissionMode:`, as before 2026-09-23, is read so — its steps too, whichever file says `harness: codex`", () => {
  const REVIEWER = '---\ndescription: Reviews\nharness: codex\nsandbox: read-only\n---\nReview the change.\n';
  assert.deepEqual(agent('reviewer', REVIEWER).keys, { harness: 'codex', sandbox: 'read-only' });
  assert.deepEqual(agent('reviewer', '---\nharness: codex\npermissionMode: read-only\n---\nReview.\n').keys, { harness: 'codex', sandbox: 'read-only' }, 'the former line, read as the key');
  assert.deepEqual(agent('reviewer', '---\npermissionMode: bypassPermissions\nharness: codex\n---\nReview.\n').keys, { harness: 'codex', sandbox: 'danger-full-access' });

  const agents = agentsOf({ reviewer: REVIEWER });
  const review = parseWorkflow('review', '---\nagent: reviewer\n---\n', undefined, agents);
  assert.deepEqual([review.harness, review.sandbox, review.permissionMode], ['codex', 'read-only', undefined]);
  assert.deepEqual(review.agent?.given, { harness: 'codex', sandbox: 'read-only' });
  // A step on codex by its agent's line, whose own line names the sandbox the former way: read as its own `sandbox:`.
  const own = parseWorkflow('review', '---\nagent: reviewer\npermissionMode: workspace-write\n---\n', undefined, agents);
  assert.deepEqual([own.sandbox, own.permissionMode, own.agent?.keys], ['workspace-write', undefined, ['sandbox']]);
});

test('REFUSED at shipped defaults: `permissionMode:` on an agent or a step that runs on codex by the other, naming `sandbox:` — and `sandbox:` inherited onto Claude Code', () => {
  const namesSandbox = (said: string) => said.includes("`permissionMode:` is Claude Code's permission mode, and codex has none: its fence is its sandbox, `sandbox:`");
  const codexAgent = refusal(() => agent('reviewer', '---\nharness: codex\npermissionMode: dontAsk\n---\nReview.\n'));
  assert.ok(codexAgent.startsWith('agents/reviewer.md: `permissionMode: dontAsk` is not a key codex takes.') && namesSandbox(codexAgent), codexAgent);
  assert.ok(refusal(() => agent('reviewer', '---\nharness: codex\npermissionMode: read-only\nsandbox: read-only\n---\nReview.\n')).includes('are both set, and on codex they are one key'));
  assert.ok(refusal(() => agent('writer', '---\nsandbox: read-only\n---\nWrite.\n')).includes("`sandbox:` is Codex's sandbox, and Claude Code has none"));

  // A Claude Code agent's mode, taken by a step that runs on codex by its own line: no sandbox, and refused as one.
  const agents = agentsOf({ implementer: '---\nharness: claude\npermissionMode: dontAsk\n---\nImplement.\n', reviewer: '---\nharness: codex\nsandbox: read-only\n---\nReview.\n' });
  const moved = refusal(() => parseWorkflow('build', '---\nagent: implementer\nharness: codex\neffort: high\n---\n', undefined, agents));
  assert.ok(moved.startsWith('build: `permissionMode: dontAsk` is not a key codex takes.') && namesSandbox(moved), moved);
  // A codex agent's sandbox, taken by a step that runs on Claude Code by its own line.
  assert.ok(refusal(() => parseWorkflow('review', '---\nagent: reviewer\nharness: claude\n---\n', undefined, agents)).includes("`sandbox:` is Codex's sandbox, and Claude Code has none"));
  assert.ok(refusal(() => parseWorkflow('review', '---\nagent: reviewer\npermissionMode: read-only\nsandbox: read-only\n---\n', undefined, agents)).includes('are both set'));
});

test("a step's own fence replaces its agent's under either name: a Claude Code agent run on codex with a sandbox of the step's own, and a codex agent run on Claude Code with a mode", () => {
  const agents = agentsOf({ implementer: '---\nharness: claude\npermissionMode: dontAsk\n---\nImplement.\n', reviewer: '---\nharness: codex\nsandbox: read-only\n---\nReview.\n' });
  // As written before 2026-09-23, `permissionMode:` naming the sandbox, and as written since.
  for (const line of ['permissionMode: read-only', 'sandbox: read-only']) {
    const step = parseWorkflow('build', `---\nagent: implementer\nharness: codex\n${line}\n---\n`, undefined, agents);
    assert.deepEqual([step.harness, step.sandbox, step.permissionMode], ['codex', 'read-only', undefined], line);
    assert.deepEqual(step.agent?.keys, ['harness', 'sandbox'], line);
    assert.deepEqual(step.agent?.given, {}, `${line}: the agent's mode is not given to the step`);
    assert.equal(renderStep(step), '---\nagent: implementer\nharness: codex\nsandbox: read-only\n---\n\n', `${line}: written back without the agent's mode`);
  }
  const moved = parseWorkflow('review', '---\nagent: reviewer\nharness: claude\npermissionMode: plan\n---\n', undefined, agents);
  assert.deepEqual([moved.harness, moved.permissionMode, moved.sandbox], ['claude', 'plan', undefined]);
  // A step that writes no fence of its own still takes its agent's, and one written for the wrong harness is still refused.
  assert.equal(parseWorkflow('build', '---\nagent: implementer\n---\n', undefined, agents).permissionMode, 'dontAsk');
  assert.ok(refusal(() => parseWorkflow('build', '---\nagent: implementer\nharness: codex\npermissionMode: plan\n---\n', undefined, agents)).startsWith('build: `permissionMode: plan` is not a key codex takes.'));
});

test('REFUSED at shipped defaults: writeWorkflow of a draft on codex by its agent that sends its sandbox as `permissionMode`, as a page open since before 2026-09-23 does — and nothing written', () => {
  const dir = workflows({ 'agents/reviewer.md': '---\nharness: codex\nsandbox: read-only\n---\nReview.\n', 'dev/review.md': '---\nagent: reviewer\n---\n' });
  const folder = path.join(dir, 'dev');
  const said = refusal(() => writeWorkflow(folder, [{ name: 'review', after: [], agent: 'reviewer', permissionMode: 'workspace-write', body: '' }], undefined, { anywhere: true }));
  assert.ok(said.startsWith('review: `permissionMode: workspace-write` on a step that runs on codex is what `sandbox:` was called there until 2026-09-23') && said.includes('Send `sandbox: workspace-write` instead'), said);
  // A Claude Code mode kept by a step moved onto codex names no sandbox: the parser refuses it, naming `sandbox:`, and not as a former name.
  const kept = refusal(() => writeWorkflow(folder, [{ name: 'review', after: [], agent: 'reviewer', permissionMode: 'dontAsk', body: '' }], undefined, { anywhere: true }));
  assert.ok(kept.startsWith('review: `permissionMode: dontAsk` is not a key codex takes.') && kept.includes('Write `sandbox:` instead'), kept);
  assert.equal(fs.readFileSync(path.join(folder, 'review.md'), 'utf8'), '---\nagent: reviewer\n---\n', 'nothing written');
  // Sent under its own name, it is written.
  writeWorkflow(folder, [{ name: 'review', after: [], agent: 'reviewer', sandbox: 'workspace-write', body: '' }], undefined, { anywhere: true });
  assert.equal(fs.readFileSync(path.join(folder, 'review.md'), 'utf8'), '---\nagent: reviewer\nsandbox: workspace-write\n---\n\n');
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
  assert.deepEqual(build!.agent, { name: 'implementer', keys: [], body: 'Build it.', given: { harness: 'claude', model: 'opus', effort: 'high', context: '200k', disallowedTools: 'SendMessage' }, instructions: 'Implement what you are asked.' });
  // And the agent as the run renders it for Claude Code, frozen with it: the edit reaches neither.
  assert.equal(fs.readFileSync(path.join(agentFilesDir(run, 'build'), 'prompt.md'), 'utf8'), 'Implement what you are asked.\n');
});

test("`wf start` names each node's agent beside it — by the agent's name, not the step's — and a node with no agent by its name alone", async (t) => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(repo, 'README.md'), 'x\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  const dir = workflows({
    'agents/coder.md': IMPLEMENTER,
    'agents/critic.md': '---\nharness: claude\n---\nFind what is wrong.\n',
    'dev/build.md': '---\nagent: coder\n---\n',
    'dev/judge.md': '---\nafter: build\nagent: critic\n---\n',
    'dev/wrap.md': '---\nafter: judge\n---\nWrap it up.\n',
  });
  const printed: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => { printed.push(args.map(String).join(' ')); });
  const { main } = await import('../src/cli.ts');
  await main(['start', 'build it', '--workflows', path.join(dir, 'dev'), '--repo', repo], {} as never);
  const [id, said] = printed[0]!.split('  ');
  assert.ok(id, printed.join('\n'));
  assert.equal(said, '3 step(s): build (coder) → judge (critic) → wrap');
});

/** An agent whose `card:` names a file the reader is handed: what `loadAgents` hands `parseAgent` for a file beside it. */
const withSkills = (name: string, json: string, line = `${name}.skills.json`): Agent =>
  agent(name, `---\ndescription: Does the work\ncard: ${line}\n---\nDo it.\n`, (file) => (file === `${name}.skills.json` ? json : undefined));

const ONE_SKILL = '[{"id":"review-a-change","name":"Review a change","description":"Read a branch against its brief.","tags":["code","review"],"examples":["Use this when a change needs a second pair of eyes."]}]';

test('an agent says what it can do in the A2A protocol\'s words: the skills its `card:` names, beside it', () => {
  const a = withSkills('reviewer', ONE_SKILL);
  assert.equal(a.card?.file, 'reviewer.skills.json');
  assert.deepEqual(a.card?.list, [{
    id: 'review-a-change',
    name: 'Review a change',
    description: 'Read a branch against its brief.',
    tags: ['code', 'review'],
    examples: ['Use this when a change needs a second pair of eyes.'],
  }]);
  assert.equal(agent('quiet', '---\ndescription: Does the work\n---\nDo it.\n').card, undefined, 'an agent may say nothing of what it can do');
  // `card` is the agent's own line, as `description` is: no step takes it, so it never reaches a step's keys.
  assert.equal((a.keys as Record<string, unknown>).card, undefined);
});

test("an agent's skills are read with the optional A2A fields it writes, and without the ones it does not", () => {
  const a = withSkills('coder', '[{"id":"a","name":"A","description":"d","tags":["t"],"inputModes":["text/plain"],"outputModes":["application/json"]}]');
  assert.deepEqual(a.card?.list[0], { id: 'a', name: 'A', description: 'd', tags: ['t'], inputModes: ['text/plain'], outputModes: ['application/json'] });
  assert.ok(!('examples' in a.card!.list[0]!), 'a field the file does not write is not on the skill');
});

test('REFUSED at shipped defaults: a `card:` that is not a .json file beside the agent', () => {
  for (const line of ['../elsewhere.skills.json', 'sub/skills.json', '/etc/skills.json', 'skills.yaml', '.hidden.json']) {
    const said = refusal(() => withSkills('reviewer', ONE_SKILL, line));
    assert.ok(said.startsWith(`agents/reviewer.md: \`card: ${line}\` is not a card's name.`), said);
    assert.ok(said.includes('`card: reviewer.skills.json`'), said);
  }
});

test('REFUSED at shipped defaults: a card that is not there, not JSON, not a list, or empty', () => {
  const missing = refusal(() => agent('reviewer', '---\ncard: reviewer.skills.json\n---\nDo it.\n', () => undefined));
  assert.ok(missing.startsWith('agents/reviewer.md: `card: reviewer.skills.json` is not there.'), missing);
  assert.ok(missing.includes('write it beside agents/reviewer.md'), missing);

  const unread = refusal(() => agent('reviewer', '---\ncard: reviewer.skills.json\n---\nDo it.\n'));
  assert.ok(unread.includes('this agent was read without its folder'), unread);

  const notJson = refusal(() => withSkills('reviewer', '[{'));
  assert.ok(notJson.startsWith('agents/reviewer.md: `card: reviewer.skills.json` is not JSON ('), notJson);

  const notList = refusal(() => withSkills('reviewer', '{"id":"a"}'));
  assert.ok(notList.startsWith('agents/reviewer.md: `card: reviewer.skills.json` is not a list.'), notList);

  const none = refusal(() => withSkills('reviewer', '[]'));
  assert.ok(none.includes('is an empty list, and an agent with no skills says nothing it can do'), none);
});

test('REFUSED at shipped defaults: a skill missing a field the protocol marks REQUIRED, or with an id no caller could name', () => {
  for (const key of ['id', 'name', 'description']) {
    const entry: Record<string, unknown> = { id: 'a-skill', name: 'A skill', description: 'What it does.', tags: ['t'] };
    delete entry[key];
    const said = refusal(() => withSkills('reviewer', JSON.stringify([entry])));
    assert.ok(said.startsWith(`agents/reviewer.md: \`card: reviewer.skills.json\`, skill 1 has no \`${key}\`, and the A2A protocol marks it REQUIRED.`), said);
    const blank = refusal(() => withSkills('reviewer', JSON.stringify([{ ...entry, [key]: '  ' }])));
    assert.ok(blank.includes(`has no \`${key}\``), blank);
  }
  const notObject = refusal(() => withSkills('reviewer', '["review"]'));
  assert.ok(notObject.includes('skill 1 is "review", not a skill.'), notObject);

  for (const id of ['Review A Change', 'review_a_change', 'review a change', '-review', 'review-']) {
    const said = refusal(() => withSkills('reviewer', JSON.stringify([{ id, name: 'A', description: 'd', tags: ['t'] }])));
    assert.ok(said.includes(`skill \`${id}\` is not an id`), said);
    assert.ok(said.includes('lowercase words joined by dashes'), said);
  }
});

test('REFUSED at shipped defaults: tags missing or empty, a list that is not one, a key A2A has not, and a duplicate id', () => {
  const noTags = refusal(() => withSkills('reviewer', '[{"id":"a","name":"A","description":"d"}]'));
  assert.ok(noTags.includes('skill `a` has no `tags`, and the A2A protocol marks them REQUIRED'), noTags);

  const empty = refusal(() => withSkills('reviewer', '[{"id":"a","name":"A","description":"d","tags":[]}]'));
  assert.ok(empty.includes('has an empty `tags`, which says as little as none'), empty);

  for (const key of ['tags', 'examples', 'inputModes', 'outputModes']) {
    const said = refusal(() => withSkills('reviewer', JSON.stringify([{ id: 'a', name: 'A', description: 'd', tags: ['t'], [key]: 'one' }])));
    assert.ok(said.includes(`skill \`a\`: \`${key}\` is a JSON array of words`), said);
    const blank = refusal(() => withSkills('reviewer', JSON.stringify([{ id: 'a', name: 'A', description: 'd', tags: ['t'], [key]: [''] }])));
    assert.ok(blank.includes(`\`${key}\` is a JSON array of words`), blank);
  }

  const unknown = refusal(() => withSkills('reviewer', '[{"id":"a","name":"A","description":"d","tags":["t"],"inputSchema":{}}]'));
  assert.ok(unknown.includes('skill 1 sets `inputSchema`, which an A2A skill does not have.'), unknown);
  assert.ok(unknown.includes('id, name, description, tags, examples, inputModes, outputModes'), unknown);

  // A real A2A field all the same, and refused on its own words: it names a security scheme a card with no interfaces never declares.
  const secured = refusal(() => withSkills('reviewer', '[{"id":"a","name":"A","description":"d","tags":["t"],"securityRequirements":[]}]'));
  assert.ok(secured.includes('sets `securityRequirements`'), secured);
  assert.ok(secured.includes('nothing here serves this agent over A2A'), secured);

  const twice = refusal(() => withSkills('reviewer', '[{"id":"a","name":"A","description":"d","tags":["t"]},{"id":"a","name":"B","description":"e","tags":["u"]}]'));
  assert.ok(twice.includes('gives `a` twice, as skill 1 and skill 2'), twice);
});

test("a broken skills file is the agent's refusal, thrown only at a step that names it", () => {
  const dir = workflows({
    'agents/reviewer.md': '---\ndescription: Reviews\ncard: reviewer.skills.json\n---\nReview it.\n',
    'agents/reviewer.skills.json': '[]',
    'agents/implementer.md': IMPLEMENTER,
    'dev/implement.md': '---\nagent: implementer\n---\n',
  });
  const agents = loadAgents(agentsDir(path.join(dir, 'dev')));
  assert.ok(agents.get('reviewer') instanceof WorkflowError, 'the broken one is kept as its refusal');
  assert.ok(!(agents.get('implementer') instanceof WorkflowError), 'and stops no agent beside it');
  assert.equal(loadWorkflows(path.join(dir, 'dev')).length, 1, 'nor a workflow that does not name it');
});
