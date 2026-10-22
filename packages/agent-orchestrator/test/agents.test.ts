/**
 * An agent is written once: a file in `agents/`, beside the workflows whose steps name it — its frontmatter the role keys, its body its
 * instructions. What an agent file may say, and where the folder of them is not a workflow.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  AGENT_KEYS,
  AGENT_OWN_KEYS,
  agentsDir,
  parseAgent,
  parseWorkflow,
  renderStep,
  skillEntryOf,
  STEP_KEYS,
  WorkflowError,
  type Agent,
  type Agents,
} from '../src/workflow.ts';
import { loadWorkflows, workflowFolder, workflowsIn } from '../src/folder/folder.store.ts';
import { loadAgents } from '../src/agents/read.store.ts';
import { headedLayers } from '../src/workflow/index.ts';
import { scratch } from './scratch.ts';
import { testPlace } from '../place/memory/index.ts';
import { eachTest, runGiven } from './placed.ts';

const ROOT = scratch('wf-agents-');
process.env.WF_ROOT = ROOT;
const { startRun, writeWorkflow } = await import('../src/runner.ts');
const stand = eachTest(testPlace);
const runPlaced = runGiven(() => stand().layer);
const { agentFilesDir } = await import('../src/agents/agents.store.ts');

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
  const a = agent(
    'implementer',
    '---\ndescription: Does the work\nharness: claude\nmodel: opus\neffort: high\ncontext: 200k\ndisallowedTools: SendMessage\n---\nImplement what you are asked.\n',
  );
  assert.equal(a.name, 'implementer');
  assert.equal(a.description, 'Does the work');
  assert.deepEqual(a.keys, { harness: 'claude', model: 'opus', effort: 'high', context: '200k', disallowedTools: 'SendMessage' });
  assert.equal(a.body, 'Implement what you are asked.');
  assert.equal(agent('quiet', '---\nmodel: opus\n---\n').body, '', 'an agent may set only how its steps run');
});

/**
 * The agent's own keys: `role`, `description`, `skills`, `harnessPrompt` and `mcp` describe the agent itself — the job it holds, who it
 * is, what it is given (and so what it says it can do), how its sessions are told and the MCP servers they load — and a step sets none
 * of them for its agent: a step's work is the workflow's, not the agent's. A step's own `skills:` and `mcp:` add to its agent's and never
 * stand in for them. Every other agent key is a key a step may set for itself, and takes from its agent when it does not.
 */
const AGENT_OWN = ['role', 'description', 'skills', 'harnessPrompt', 'mcp'];

test("the role keys are the keys a step has, but for wiring, the agent's own keys", () => {
  assert.deepEqual([...AGENT_OWN_KEYS], AGENT_OWN, 'the package names the same keys as its own');
  for (const key of AGENT_KEYS) if (!AGENT_OWN.includes(key)) assert.ok((STEP_KEYS as readonly string[]).includes(key), key);
  for (const key of AGENT_OWN.filter((own) => own !== 'skills' && own !== 'mcp'))
    assert.ok(!(STEP_KEYS as readonly string[]).includes(key), `${key} describes the agent, and is no step's key`);
  assert.ok(STEP_KEYS.includes('skills'), "a step's `skills:` is a key of its own, which adds to its agent's skills");
  assert.ok(!AGENT_KEYS.filter((key) => !AGENT_OWN.includes(key)).includes('skills'), 'and no role key a step takes from it');
  assert.ok(STEP_KEYS.includes('mcp'), "a step's `mcp:` is a key of its own, which adds to its agent's servers");
  assert.ok(!AGENT_KEYS.filter((key) => !AGENT_OWN.includes(key)).includes('mcp'), 'and no role key a step takes from it');
});

test('REFUSED at shipped defaults: every wiring key in an agent file, by name, saying it belongs on the step', () => {
  const wiring = [
    'after',
    'resume',
    'input',
    'place',
    'workspace',
    'writable',
    'reads',
    'slot',
    'denials',
    'background',
    'check',
    'retries',
    'gate',
    'loop',
    'rounds',
    'budget',
    'deadlineSeconds',
    'tally',
  ];
  assert.deepEqual(
    STEP_KEYS.filter((k) => !(AGENT_KEYS as readonly string[]).includes(k) && k !== ('agent' as string)).sort(),
    [...wiring].sort(),
    'every key an agent may not set is wiring',
  );
  for (const key of wiring) {
    const said = refusal(() => agent('implementer', `---\n${key}: something\n---\nImplement it.\n`));
    assert.ok(said.startsWith(`agents/implementer.md: \`${key}\` is wiring, and belongs on the step:`), said);
    assert.ok(said.includes('Move the line to each step that names this agent.'), said);
  }
});

test('REFUSED at shipped defaults: `agent:` inside an agent file, a key no agent has, and a value no step could run with — each naming agents/<file>', () => {
  const nested = refusal(() => agent('reviewer', '---\nagent: implementer\n---\nReview it.\n'));
  assert.ok(
    nested.startsWith(
      "agents/reviewer.md: `agent` is a step's key, which attaches an agent to the step, and an agent does not name another.",
    ),
    nested,
  );

  const unknown = refusal(() => agent('reviewer', '---\ncolour: red\n---\nReview it.\n'));
  assert.ok(
    unknown.startsWith(`agents/reviewer.md: \`colour\` is not a key an agent has. An agent's keys are: ${AGENT_KEYS.join(', ')}.`),
    unknown,
  );

  const guide = refusal(() => agent('reviewer', '---\nguide: CLAUDE.md\n---\nReview it.\n'));
  assert.ok(guide.startsWith('agents/reviewer.md: an agent may not set `guide`'), guide);

  const attempts = refusal(() => agent('reviewer', '---\nmaxAttempts: 1\n---\nReview it.\n'));
  assert.ok(
    attempts.startsWith('agents/reviewer.md: an agent may not set `maxAttempts` — the runtime makes one attempt at a session'),
    attempts,
  );
  assert.ok(attempts.includes('`nemia retry <run> <step>`'), attempts);

  const context = refusal(() => agent('reviewer', '---\ncontext: loud\n---\nReview it.\n'));
  assert.ok(context.startsWith('agents/reviewer.md: `context: loud` is not a number of tokens'), context);

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
  assert.ok(
    linked.message.startsWith(`${path.join(dir, 'agents', 'implementer.md')} is a link, and an agent's file is its own:`),
    linked.message,
  );
  assert.ok(linked.message.includes('Replace the link with a file of its own'), linked.message);
  assert.ok(linked.message.includes('rm <file> && cp <target> <file>'), linked.message);
  assert.ok(linked.message.includes('or take it out of the folder'), linked.message);
  assert.ok(!(agents.get('reviewer') instanceof WorkflowError), 'the agent beside it is read');
});

test('agents/ is beside the workflow folders, and is not one of them: workflowsIn does not list it', () => {
  const dir = workflows({ 'dev/implement.md': '---\nplace: git\n---\nImplement it.\n', 'agents/implementer.md': 'Implement it.\n' });
  assert.equal(agentsDir(path.join(dir, 'dev')), path.join(dir, 'agents'));
  assert.deepEqual(workflowsIn(dir), ['dev']);
  const none = refusal(() => loadWorkflows(dir));
  assert.ok(none.endsWith(`— it holds workflows, each a folder of steps: dev. Name one of them: ${path.join(dir, 'dev')}.`), none);
});

test('REFUSED at shipped defaults: a workflow named agents — loaded, named bare, or written', () => {
  const repo = workflows({
    'workflows/dev/implement.md': '---\nplace: git\n---\nImplement it.\n',
    'workflows/agents/implementer.md': 'Implement it.\n',
  });
  const folder = path.join(repo, 'workflows', 'agents');
  const loaded = refusal(() => loadWorkflows(folder));
  assert.equal(
    loaded,
    `${folder} is agents/, the folder of the agents the workflows beside it name — its files are agents, not steps, so no workflow has its name. Name a workflow beside it, or give yours another name.`,
  );

  const named = refusal(() => workflowFolder('agents', path.join(repo, 'elsewhere'), repo));
  assert.ok(named.startsWith(`${folder} is agents/, the folder of the agents`), named);

  const before = fs.readFileSync(path.join(folder, 'implementer.md'), 'utf8');
  const written = refusal(() =>
    writeWorkflow(folder, [{ name: 'implement', after: [], place: 'git', body: 'Implement it.' }], undefined, { anywhere: true }),
  );
  assert.ok(written.startsWith(`${folder} is agents/, the folder of the agents`), written);
  assert.deepEqual(fs.readdirSync(folder), ['implementer.md'], 'nothing written');
  assert.equal(fs.readFileSync(path.join(folder, 'implementer.md'), 'utf8'), before);
});

/** The agents a step may name, by name, each parsed from its file's text. */
const agentsOf = (files: Record<string, string>): Agents => new Map(Object.entries(files).map(([name, text]) => [name, agent(name, text)]));

const IMPLEMENTER =
  '---\ndescription: Does the work\nharness: claude\nmodel: opus\neffort: high\ncontext: 200k\ndisallowedTools: SendMessage\n---\nImplement what you are asked.\n';

test("a step that names an agent runs with the agent's role keys, its own keys winning, and is told the agent's words, then its own", () => {
  const agents = agentsOf({ implementer: IMPLEMENTER });
  const build = parseWorkflow(
    'build',
    '---\nplace: git\nagent: implementer\nafter: plan\nmodel: sonnet\ncheck: npm test\n---\nBuild the parser first.\n',
    undefined,
    agents,
  );
  assert.equal(build.name, 'build', "the step is build, not implementer: nothing ties a step's name to its agent's");
  assert.equal(build.harness, 'claude');
  assert.equal(build.model, 'sonnet', "the step's own key wins");
  assert.equal(build.effort, 'high', "the agent's key is the default");
  assert.equal(build.context, 200000);
  assert.deepEqual(build.disallowedTools, ['SendMessage']);
  assert.deepEqual(build.after, ['plan']);
  assert.equal(build.check, 'npm test');
  assert.equal(
    build.body,
    headedLayers([
      ['instructions', 'Implement what you are asked.'],
      ['policy', 'Build the parser first.'],
    ]),
  );
  assert.deepEqual(
    build.agent,
    {
      name: 'implementer',
      keys: ['after', 'place', 'model', 'check'],
      body: 'Build the parser first.',
      given: { harness: 'claude', effort: 'high', context: '200k', disallowedTools: 'SendMessage' },
      instructions: 'Implement what you are asked.',
      mcp: [],
    },
    "the keys the step set, its note, what each key it did not set read as, and the agent's instructions, which a Claude Code step is told in Claude Code's prompt",
  );

  const bare = parseWorkflow('build', '---\nplace: git\nagent: implementer\n---\n', undefined, agents);
  assert.equal(bare.body, headedLayers([['instructions', 'Implement what you are asked.']]), "no note of its own: the agent's words alone");
  assert.equal(bare.model, 'opus');

  const same = parseWorkflow(
    'build',
    `---\nplace: git\nharness: claude\nmodel: opus\neffort: high\ncontext: 200k\ndisallowedTools: SendMessage\n---\n${headedLayers([['instructions', 'Implement what you are asked.']])}\n`,
  );
  const { agent: _agent, ...resolved } = bare;
  assert.deepEqual(resolved, same, 'resolved, it is the step written out whole');
  assert.equal(same.agent, undefined, 'a step with no agent carries no `agent`');
});

test('REFUSED at shipped defaults: a step naming an agent there is not, listing the agents there are — or saying there are none', () => {
  const agents = agentsOf({ implementer: IMPLEMENTER, reviewer: '---\nmodel: opus\n---\nReview it.\n' });
  const unknown = refusal(() => parseWorkflow('build', '---\nplace: git\nagent: builder\n---\nBuild it.\n', undefined, agents));
  assert.equal(
    unknown,
    'build: `agent: builder` is not an agent here. The agents are: implementer, reviewer — name one, or write agents/builder.md beside them.',
  );
  const none = refusal(() => parseWorkflow('build', '---\nplace: git\nagent: builder\n---\nBuild it.\n'));
  assert.ok(none.startsWith('build: `agent: builder` is not an agent here. There are none: an agent is a file in agents/'), none);
  const empty = refusal(() =>
    parseWorkflow('build', '---\nplace: git\nagent: quiet\n---\n', undefined, agentsOf({ quiet: '---\nmodel: opus\n---\n' })),
  );
  assert.ok(empty.startsWith("build: the body is empty, and so is agents/quiet.md's"), empty);
});

/** A factory's hire of `agent` into the workflow build's step `step`, as `nemia start --factory pipao` hands it to the parser. */
const hire = (agent: string, step = 'implement') => ({ agent, factory: 'pipao', step: `build/${step}` });

test('a step whose file names no agent, hired one, is resolved exactly as if its file said `agent:` it', () => {
  const agents = agentsOf({ implementer: IMPLEMENTER });
  const text = '---\nplace: git\nmodel: sonnet\n---\nBuild the parser first.\n';
  const hired = parseWorkflow('implement', text, undefined, agents, undefined, hire('implementer'));
  const written = parseWorkflow(
    'implement',
    '---\nplace: git\nagent: implementer\nmodel: sonnet\n---\nBuild the parser first.\n',
    undefined,
    agents,
  );
  assert.deepEqual(hired, written);
  assert.equal(hired.agent?.name, 'implementer');
  assert.equal(
    hired.body,
    headedLayers([
      ['instructions', 'Implement what you are asked.'],
      ['policy', 'Build the parser first.'],
    ]),
  );
  const bare = parseWorkflow('implement', '---\nafter: plan\nplace: git\n---\n', undefined, agents, undefined, hire('implementer'));
  assert.equal(
    bare.body,
    headedLayers([['instructions', 'Implement what you are asked.']]),
    "a step with no note of its own is told its hire's words",
  );
  assert.equal(parseWorkflow('implement', text, undefined, agents).agent, undefined, 'unhired, it names no agent');
});

test('REFUSED: a step whose file names its own agent, hired another, naming both and the fire that takes the hire back', () => {
  const agents = agentsOf({ implementer: IMPLEMENTER, reviewer: '---\nmodel: opus\n---\nReview it.\n' });
  const both = refusal(() =>
    parseWorkflow('implement', '---\nplace: git\nagent: implementer\n---\nBuild it.\n', undefined, agents, undefined, hire('reviewer')),
  );
  assert.equal(
    both,
    "implement: `agent: implementer` fills this step in every factory, and the factory pipao hires reviewer into it too. Take the hire back — nemia factory fire pipao --step build/implement — or delete the step's `agent:` line. Nothing was started.",
  );
  const same = refusal(() =>
    parseWorkflow('implement', '---\nplace: git\nagent: implementer\n---\nBuild it.\n', undefined, agents, undefined, hire('implementer')),
  );
  assert.match(
    same,
    /^implement: `agent: implementer` fills this step in every factory, and the factory pipao hires implementer into it too/,
  );
});

test("REFUSED: a hired agent there is not, in the factory's words — the agents there are, and the hire to make — never an `agent:` line", () => {
  const agents = agentsOf({ implementer: IMPLEMENTER, reviewer: '---\nmodel: opus\n---\nReview it.\n' });
  const unknown = refusal(() => parseWorkflow('implement', '---\nplace: git\n---\nBuild it.\n', undefined, agents, undefined, hire('ada')));
  assert.equal(
    unknown,
    'implement: the factory pipao hires `ada` into it, which is not an agent here. The agents are: implementer, reviewer — hire one — nemia factory hire pipao <agent> --step build/implement, or write agents/ada.md beside them.',
  );
  const none = refusal(() => parseWorkflow('implement', '---\nplace: git\n---\nBuild it.\n', undefined, undefined, undefined, hire('ada')));
  assert.match(
    none,
    /^implement: the factory pipao hires `ada` into it, which is not an agent here\. There are none: .* or hire one — nemia factory hire pipao <agent> --step build\/implement\.$/,
  );
  const refused: Agents = new Map([['ada', new WorkflowError('agents/ada.md: `after` is wiring.')]]);
  const broken = refusal(() => parseWorkflow('implement', '---\nplace: git\n---\nBuild it.\n', undefined, refused, undefined, hire('ada')));
  assert.equal(broken, 'implement: the factory pipao hires `ada` into it, and its file is refused — agents/ada.md: `after` is wiring.');
  for (const words of [unknown, none, broken]) assert.doesNotMatch(words, /`agent: ada`/);
});

test("a schema the agent's output: names is read beside the agent, one the step names beside the step, and the two are merged", () => {
  const dir = workflows({
    'agents/reviewer.md': '---\noutput: review.schema.json\n---\nReview it.\n',
    'agents/review.schema.json':
      '{"type":"object","properties":{"verdict":{"type":"string"}},"required":["verdict"],"additionalProperties":false}',
    'dev/implement.md': '---\nplace: git\n---\nImplement it.\n',
    'dev/check.md': '---\nplace: git\nagent: reviewer\nafter: implement\n---\n',
    'dev/judge.md': '---\nplace: git\nagent: reviewer\nafter: implement\noutput: judge.schema.json\n---\n',
    'dev/judge.schema.json': '{"type":"object","properties":{"ok":{"type":"boolean"}},"required":["ok"],"additionalProperties":false}',
  });
  const steps = loadWorkflows(path.join(dir, 'dev'));
  const check = steps.find((s) => s.name === 'check')!;
  assert.equal(check.output?.file, 'review.schema.json');
  assert.deepEqual(Object.keys((check.output.schema as { properties: object }).properties), ['verdict']);
  const judge = steps.find((s) => s.name === 'judge')!;
  assert.deepEqual(Object.keys((judge.output!.schema as { properties: object }).properties), ['verdict', 'ok']);
  assert.deepEqual(judge.output!.schema.required, ['verdict', 'ok']);
  assert.equal(judge.output!.file, 'judge.schema.json', "the step's own line is what its file says");
  assert.deepEqual(judge.output!.owners, {
    verdict: { by: 'agent', name: 'reviewer', file: 'review.schema.json' },
    ok: { by: 'step', name: 'judge', file: 'judge.schema.json' },
  });
});

test('REFUSED at load: a field both a step and its agent declare, naming the field and both declarers', () => {
  const dir = workflows({
    'agents/reviewer.md': '---\noutput: review.schema.json\n---\nReview it.\n',
    'agents/review.schema.json':
      '{"type":"object","properties":{"findings":{"type":"string"},"again":{"type":"boolean"}},"required":["findings","again"],"additionalProperties":false}',
    'dev/implement.md': '---\nplace: git\n---\nImplement it.\n',
    'dev/judge.md': '---\nplace: git\nagent: reviewer\nafter: implement\noutput: judge.schema.json\n---\n',
    'dev/judge.schema.json':
      '{"type":"object","properties":{"findings":{"type":"string"},"severity":{"type":"string"}},"required":["findings","severity"],"additionalProperties":false}',
  });
  const said = refusal(() => loadWorkflows(path.join(dir, 'dev')));
  assert.ok(said.startsWith('judge: `findings` is declared'), said);
  assert.ok(said.includes('agent reviewer (agents/reviewer.md, `output: review.schema.json`)'), said);
  assert.ok(said.includes('step judge (judge.md, `output: judge.schema.json`)'), said);
  assert.ok(said.includes('Delete it from one of the two'), said);
});

test('REFUSED at shipped defaults: a broken agent, only when a step names it, naming agents/<file> — a linked one too', () => {
  const dir = workflows({
    'agents/implementer.md': IMPLEMENTER,
    'agents/broken.md': '---\nretries: 2\n---\nBreak it.\n',
    'elsewhere/linked.md': '---\nmodel: opus\n---\nLinked.\n',
    'dev/build.md': '---\nplace: git\nagent: implementer\n---\n',
    'bad/build.md': '---\nplace: git\nagent: broken\n---\n',
    'linked/build.md': '---\nplace: git\nagent: linked\n---\n',
  });
  fs.symlinkSync(path.join(dir, 'elsewhere', 'linked.md'), path.join(dir, 'agents', 'linked.md'));
  assert.equal(loadWorkflows(path.join(dir, 'dev'))[0].model, 'opus', 'a broken agent beside it stops no step that does not name it');
  const broken = refusal(() => loadWorkflows(path.join(dir, 'bad')));
  assert.ok(
    broken.startsWith(
      'build: `agent: broken` names an agent whose file is refused — agents/broken.md: `retries` is wiring, and belongs on the step:',
    ),
    broken,
  );
  const linked = refusal(() => loadWorkflows(path.join(dir, 'linked')));
  assert.ok(
    linked.startsWith(`build: \`agent: linked\` names an agent whose file is refused — ${path.join(dir, 'agents', 'linked.md')} is a link`),
    linked,
  );
});

test("renderStep writes a resolved step as its file was: `agent:`, the step's own keys and its own note — never the agent's", () => {
  const agents = agentsOf({ implementer: IMPLEMENTER });
  const text = '---\nafter: plan\nresume: plan\nplace: git\nagent: implementer\nmodel: sonnet\n---\nBuild the parser first.\n';
  const build = parseWorkflow('build', text, undefined, agents);
  const rendered = renderStep(build);
  assert.equal(rendered, '---\nafter: plan\nresume: plan\nplace: git\nagent: implementer\nmodel: sonnet\n---\nBuild the parser first.\n');
  assert.deepEqual(parseWorkflow('build', rendered, undefined, agents), build, 'it reads back as the same step');
  assert.equal(
    renderStep(parseWorkflow('build', '---\nplace: git\nagent: implementer\n---\n', undefined, agents)),
    '---\nplace: git\nagent: implementer\n---\n\n',
  );

  assert.equal(
    renderStep({ ...build, effort: 'low', after: ['plan', 'lint'] }),
    '---\nafter: plan, lint\nresume: plan\nplace: git\nagent: implementer\nmodel: sonnet\neffort: low\n---\nBuild the parser first.\n',
    "a key the step did not set, changed since it was read, is the step's own now — never dropped for being the agent's",
  );
  const derived = parseWorkflow('build', '---\nresume: plan\nplace: git\nagent: implementer\n---\n', undefined, agents);
  assert.deepEqual(derived.after, ['plan']);
  assert.equal(
    renderStep(derived),
    '---\nresume: plan\nplace: git\nagent: implementer\n---\n\n',
    "an after: the parser made of resume: is not written as the step's",
  );

  const draft = renderStep({ name: 'build', after: [], place: 'git', agent: 'implementer', model: 'sonnet', body: 'Build it.' });
  assert.equal(
    draft,
    '---\nplace: git\nagent: implementer\nmodel: sonnet\n---\nBuild it.\n',
    'a draft naming its agent is its own keys and note',
  );
});

test('writeWorkflow resolves against the agents beside the folder, keeps a file that reads as its step, and refuses an agent there is not', () => {
  const dir = workflows({
    'agents/implementer.md': IMPLEMENTER,
    'dev/build.md': '---\nplace: git\n# the implementer, cheaper\nagent: implementer\nmodel: sonnet\n---\n',
  });
  const folder = path.join(dir, 'dev');
  const steps = loadWorkflows(folder);
  const written = writeWorkflow(folder, steps, undefined, { anywhere: true });
  assert.deepEqual(written.kept, ['build.md'], 'the file with its comment is kept');
  assert.deepEqual(written.steps, steps);

  const unknown = refusal(() =>
    writeWorkflow(folder, [{ name: 'build', after: [], place: 'git', agent: 'builder', body: 'Build it.' }], undefined, { anywhere: true }),
  );
  assert.ok(unknown.startsWith('build: `agent: builder` is not an agent here. The agents are: implementer'), unknown);
  assert.equal(
    fs.readFileSync(path.join(folder, 'build.md'), 'utf8'),
    '---\nplace: git\n# the implementer, cheaper\nagent: implementer\nmodel: sonnet\n---\n',
    'nothing written',
  );
});

test('a codex agent names its sandbox as `sandbox:`, and one that says `permissionMode:`, as before 2026-09-23, is read so — its steps too, whichever file says `harness: codex`', () => {
  const REVIEWER = '---\ndescription: Reviews\nharness: codex\nsandbox: read-only\n---\nReview the change.\n';
  assert.deepEqual(agent('reviewer', REVIEWER).keys, { harness: 'codex', sandbox: 'read-only' });
  assert.deepEqual(
    agent('reviewer', '---\nharness: codex\npermissionMode: read-only\n---\nReview.\n').keys,
    { harness: 'codex', sandbox: 'read-only' },
    'the former line, read as the key',
  );
  assert.deepEqual(agent('reviewer', '---\npermissionMode: bypassPermissions\nharness: codex\n---\nReview.\n').keys, {
    harness: 'codex',
    sandbox: 'danger-full-access',
  });

  const agents = agentsOf({ reviewer: REVIEWER });
  const review = parseWorkflow('review', '---\nplace: git\nagent: reviewer\n---\n', undefined, agents);
  assert.deepEqual([review.harness, review.sandbox, review.permissionMode], ['codex', 'read-only', undefined]);
  assert.deepEqual(review.agent?.given, { harness: 'codex', sandbox: 'read-only' });
  const own = parseWorkflow('review', '---\nplace: git\nagent: reviewer\npermissionMode: read-only\n---\n', undefined, agents);
  assert.deepEqual(
    [own.sandbox, own.permissionMode, own.agent?.keys],
    ['read-only', undefined, ['place', 'sandbox']],
    "a step on codex by its agent's line, whose own line names the sandbox the former way: read as its own sandbox:",
  );
});

test("REFUSED at shipped defaults: `sandbox:` on an agent or a step that runs on Claude Code, and a Claude Code agent's mode on a step that runs on codex by its own line — an agent's codex `permissionMode:` is its sandbox, whatever the word, for the runtime to judge at `nemia start`", () => {
  const onClaude = "is a codex step's sandbox, and this step runs on claude";
  assert.deepEqual(agent('reviewer', '---\nharness: codex\npermissionMode: dontAsk\n---\nReview.\n').keys, {
    harness: 'codex',
    sandbox: 'dontAsk',
  });
  const bothOnAgent = '---\nharness: codex\npermissionMode: read-only\nsandbox: read-only\n---\nReview.\n';
  assert.ok(refusal(() => agent('reviewer', bothOnAgent)).includes('are both set, and on codex they are one key'));
  assert.ok(refusal(() => agent('writer', '---\nsandbox: read-only\n---\nWrite.\n')).includes(onClaude));

  const agents = agentsOf({
    implementer: '---\nharness: claude\npermissionMode: dontAsk\n---\nImplement.\n',
    reviewer: '---\nharness: codex\nsandbox: read-only\n---\nReview.\n',
  });
  const moved = refusal(() =>
    parseWorkflow('build', '---\nplace: git\nagent: implementer\nharness: codex\neffort: high\n---\n', undefined, agents),
  );
  assert.ok(
    moved.startsWith('build: `harness: codex` runs its agent implementer on codex, and agents/implementer.md fences it for claude'),
    `a Claude Code agent's mode, taken by a step that runs on codex by its own line, cannot be compared with a sandbox: ${moved}`,
  );
  const taken = refusal(() => parseWorkflow('review', '---\nplace: git\nagent: reviewer\nharness: claude\n---\n', undefined, agents));
  assert.ok(
    taken.includes(onClaude),
    `a codex agent's sandbox, taken by a step that runs on Claude Code by its own line, is refused: ${taken}`,
  );
  const bothOnStep = '---\nplace: git\nagent: reviewer\npermissionMode: read-only\nsandbox: read-only\n---\n';
  assert.ok(refusal(() => parseWorkflow('review', bothOnStep, undefined, agents)).includes('are both set'));
});

test("REFUSED at shipped defaults: a step that runs a fenced agent on the other harness, with a fence of its own under either name — an agent with no fence moves, and the step's fence is its own", () => {
  const agents = agentsOf({
    implementer: '---\nharness: claude\npermissionMode: dontAsk\n---\nImplement.\n',
    reviewer: '---\nharness: codex\nsandbox: read-only\n---\nReview.\n',
    mover: '---\nharness: claude\n---\nMove.\n',
  });
  for (const line of ['permissionMode: read-only', 'sandbox: read-only']) {
    const fenced = refusal(() =>
      parseWorkflow('build', `---\nplace: git\nagent: implementer\nharness: codex\n${line}\n---\n`, undefined, agents),
    );
    assert.ok(fenced.startsWith('build: `harness: codex` runs its agent implementer on codex'), `${line}: ${fenced}`);
    assert.ok(fenced.includes('agents/implementer.md fences it for claude'), `${line}: ${fenced}`);
    const step = parseWorkflow('build', `---\nplace: git\nagent: mover\nharness: codex\n${line}\n---\n`, undefined, agents);
    assert.deepEqual(
      [step.harness, step.sandbox, step.permissionMode],
      ['codex', 'read-only', undefined],
      `${line}: the sandbox is read under its former name, permissionMode:, as under sandbox:`,
    );
    assert.deepEqual(step.agent?.keys, ['place', 'harness', 'sandbox'], line);
    assert.deepEqual(step.agent?.given, {}, `${line}: the agent gives the step nothing`);
    assert.equal(
      renderStep(step),
      '---\nplace: git\nagent: mover\nharness: codex\nsandbox: read-only\n---\n\n',
      `${line}: written back as its own`,
    );
  }
  const planOnClaude = '---\nplace: git\nagent: reviewer\nharness: claude\npermissionMode: plan\n---\n';
  const compared = refusal(() => parseWorkflow('review', planOnClaude, undefined, agents));
  assert.ok(
    compared.startsWith('review: `harness: claude` runs its agent reviewer on claude'),
    `a codex agent's sandbox cannot be compared with the step's mode: ${compared}`,
  );
  assert.equal(
    parseWorkflow('build', '---\nplace: git\nagent: implementer\n---\n', undefined, agents).permissionMode,
    'dontAsk',
    "a step that writes no fence of its own takes its agent's",
  );
  const planOnCodex = '---\nplace: git\nagent: implementer\nharness: codex\npermissionMode: plan\n---\n';
  assert.ok(
    refusal(() => parseWorkflow('build', planOnCodex, undefined, agents)).startsWith('build: `harness: codex` runs its agent'),
    'a fence written for the wrong harness is refused',
  );
});

test('REFUSED at shipped defaults: writeWorkflow of a draft on codex by its agent that sends its sandbox as `permissionMode`, as a page open since before 2026-09-23 does — and nothing written', () => {
  const dir = workflows({
    'agents/reviewer.md': '---\nharness: codex\nsandbox: read-only\n---\nReview.\n',
    'dev/review.md': '---\nplace: git\nagent: reviewer\n---\n',
  });
  const folder = path.join(dir, 'dev');
  const said = refusal(() =>
    writeWorkflow(
      folder,
      [{ name: 'review', after: [], place: 'git', agent: 'reviewer', permissionMode: 'read-only', body: '' }],
      undefined,
      {
        anywhere: true,
      },
    ),
  );
  assert.ok(
    said.startsWith('review: `permissionMode: read-only` on a step that runs on codex is the former name of `sandbox:` there') &&
      said.includes('Send the sandbox as `sandbox:` instead'),
    said,
  );
  const kept = refusal(() =>
    writeWorkflow(
      folder,
      [{ name: 'review', after: [], place: 'git', agent: 'reviewer', permissionMode: 'dontAsk', body: '' }],
      undefined,
      {
        anywhere: true,
      },
    ),
  );
  assert.ok(kept.startsWith('review: `permissionMode: dontAsk` on a step that runs on codex'), kept);
  assert.ok(kept.includes('the former name of `sandbox:`'), kept);
  assert.ok(kept.includes('clear it, and set the sandbox'), kept);
  assert.ok(
    !kept.includes('`sandbox: dontAsk`'),
    `a Claude Code mode kept by a step moved onto codex is refused as the sandbox a file would read it as: ${kept}`,
  );
  assert.equal(fs.readFileSync(path.join(folder, 'review.md'), 'utf8'), '---\nplace: git\nagent: reviewer\n---\n', 'nothing written');
  writeWorkflow(folder, [{ name: 'review', after: [], place: 'git', agent: 'reviewer', sandbox: 'read-only', body: '' }], undefined, {
    anywhere: true,
  });
  assert.equal(
    fs.readFileSync(path.join(folder, 'review.md'), 'utf8'),
    '---\nplace: git\nagent: reviewer\nsandbox: read-only\n---\n\n',
    'sent under its own name, it is written',
  );
});

test('nemia start freezes the resolved steps on the run: an agent edited after the start changes no step of the run', async () => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  fs.writeFileSync(path.join(repo, 'README.md'), 'x\n');
  stand().world.repository(repo, {});
  stand().world.commit(repo, 'base');
  const dir = workflows({ 'agents/implementer.md': IMPLEMENTER, 'dev/build.md': '---\nplace: git\nagent: implementer\n---\nBuild it.\n' });
  const run = await runPlaced(startRun({ brief: 'build it', repo, workflowDir: path.join(dir, 'dev'), isolate: false }));
  fs.writeFileSync(path.join(dir, 'agents', 'implementer.md'), '---\nmodel: haiku\n---\nSomething else.\n');
  assert.ok(run.workflow, 'the workflow is frozen on the record at start');
  const [build] = run.workflow;
  assert.equal(build.model, 'opus');
  assert.equal(
    build.body,
    headedLayers([
      ['instructions', 'Implement what you are asked.'],
      ['policy', 'Build it.'],
    ]),
  );
  assert.deepEqual(build.agent, {
    name: 'implementer',
    keys: ['place'],
    body: 'Build it.',
    given: { harness: 'claude', model: 'opus', effort: 'high', context: '200k', disallowedTools: 'SendMessage' },
    instructions: 'Implement what you are asked.',
    mcp: [],
    offSkills: ['git'],
  });
  assert.equal(
    fs.readFileSync(path.join(agentFilesDir(run, 'build'), 'prompt.md'), 'utf8'),
    `${headedLayers([['instructions', 'Implement what you are asked.']])}\n`,
    'the agent as the run renders it for Claude Code is frozen with the workflow: the edit reaches neither',
  );
});

test("`nemia start` names each node's agent beside it — by the agent's name, not the step's — and a node with no agent by its name alone", async (t) => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  fs.writeFileSync(path.join(repo, 'README.md'), 'x\n');
  stand().world.repository(repo, {});
  stand().world.commit(repo, 'base');
  const dir = workflows({
    'agents/coder.md': IMPLEMENTER,
    'agents/critic.md': '---\nharness: claude\n---\nFind what is wrong.\n',
    'dev/build.md': '---\nplace: git\nagent: coder\n---\n',
    'dev/judge.md': '---\nafter: build\nplace: git\nagent: critic\n---\n',
    'dev/wrap.md': '---\nafter: judge\nplace: git\n---\nWrap it up.\n',
  });
  const printed: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.map(String).join(' '));
  });
  const { main } = await import('../src/cli/main.ts');
  await main(['start', 'build it', '--workflows', path.join(dir, 'dev'), '--repo', repo], {} as never, undefined, stand().place);
  const [id, said] = printed[0].split('  ');
  assert.ok(id, printed.join('\n'));
  assert.equal(said, '3 step(s): build (coder) → judge (critic) → wrap');
});

/** The card entry a SKILL.md's frontmatter gives (`skillEntryOf`), or the refusal of it. */
const entry = (front: string) => skillEntryOf('skills/a-skill/SKILL.md', 'a-skill', `---\n${front}\n---\nHow to do it.\n`);

test("a skill's card entry reads each form a one-line YAML value takes, and passes over the keys it does not read", () => {
  assert.deepEqual(
    entry('name: a-skill\ntitle: A skill\ndescription: What it does.\ntags: ["code", "review"]\nexamples: ["Use this when…"]'),
    {
      id: 'a-skill',
      name: 'A skill',
      description: 'What it does.',
      tags: ['code', 'review'],
      examples: ['Use this when…'],
    },
  );
  assert.equal(entry('description: "Say \\"it\\" — twice."').description, 'Say "it" — twice.', 'double quotes read as JSON');
  assert.equal(entry("description: 'It''s done.'").description, "It's done.", "single quotes, '' a quote");
  assert.equal(entry('description: What it does. # and a comment').description, 'What it does.', 'a ` #` ends a plain value');
  const passed = entry('description: d\nallowed-tools:\n  - Read\n  - Grep\nmetadata:\n  owner: x\npreload: true');
  assert.deepEqual(
    passed,
    { id: 'a-skill', name: 'a-skill', description: 'd', tags: ['a-skill'] },
    "Claude Code's keys, in any form, are not the card's",
  );
});

test('REFUSED at shipped defaults: a SKILL.md whose card entry cannot be read off one line, or says no description', () => {
  const cases: [string, RegExp][] = [
    ['name: a', /has no `description:`, and the A2A protocol marks a skill's description REQUIRED/],
    ['description: ""', /has no `description:`/],
    ['description: >\n  What it does.', /`description` goes on over several lines/],
    ['description: |\n  What it does.', /`description` goes on over several lines/],
    ['description: What\n  it does.', /`description` goes on over several lines/],
    ['description: d\ntags:\n  - code', /`tags` is a list written over several lines/],
    ['description: d\ntags:\n- code', /`tags` is a list written over several lines/],
    ['description: d\ndescription: e', /`description` is set twice/],
    ['description: What: it does', /holds a colon and a space, which YAML reads as a map/],
    ['description: "never closed', /is not one quoted line/],
    ["description: 'never closed", /is not one quoted line/],
    ['description: *alias', /starts with a character YAML reads as something other than text/],
    ['description: {a: b}', /starts with a character YAML reads as something other than text/],
    ['description: ["a list"]', /`description` is one line of text, not a list/],
    ['description: d\ntags: code', /`tags: code` is one line of text, and `tags` is a list/],
    ['description: d\ntags: []', /`tags` is an empty list, which says as little as none/],
    ['description: d\nexamples: []', /`examples` is an empty list/],
    ['description: d\ntags: [code, review]', /is not a list a card reads — a list is JSON/],
    ['description: d\ntags: ["", "x"]', /is not a list of words/],
  ];
  for (const [front, why] of cases) {
    const said = refusal(() => entry(front));
    assert.match(said, /^skills\/a-skill\/SKILL\.md/, said);
    assert.match(said, why, `${JSON.stringify(front)}: ${said}`);
  }
  const bare = refusal(() => skillEntryOf('skills/a-skill/SKILL.md', 'a-skill', 'No frontmatter.\n'));
  assert.match(bare, /^skills\/a-skill\/SKILL\.md/, bare);
  assert.ok(bare.includes('has no frontmatter'), bare);
  assert.ok(bare.includes("a skill's card entry is read from it"), bare);
});

test('REFUSED at shipped defaults: a leftover `card:` line, or a `skills:` naming a card file, saying what replaced it', () => {
  const card = refusal(() => agent('reviewer', '---\ndescription: Reviews\ncard: reviewer.skills.json\n---\nReview it.\n'));
  assert.ok(card.startsWith("agents/reviewer.md: `card` names a card file, which is retired: an agent's card is generated"), card);
  assert.ok(card.includes("generated from its `skills:`, an entry for each skill made from its SKILL.md's frontmatter"), card);
  assert.ok(card.includes('Delete the line'), card);
  const anyValue = refusal(() => agent('reviewer', '---\ncard: nothing\n---\n'));
  assert.ok(
    anyValue.includes('which is retired'),
    `at any value, and whether or not a file is beside it: the line is refused, not its file read: ${anyValue}`,
  );
  const listed = refusal(() => agent('reviewer', '---\ndescription: Reviews\nskills: reviewer.skills.json\n---\nReview it.\n'));
  assert.ok(listed.startsWith('agents/reviewer.md: `skills: reviewer.skills.json` names a card file, which is retired'), listed);
  assert.ok(listed.includes('Delete the line, and reviewer.skills.json beside the agent'), listed);
  assert.ok(!(AGENT_KEYS as readonly string[]).includes('card'), '`card` is no agent key');
});

test("a leftover `card:` line is the agent's refusal, thrown only at a step that names it", () => {
  const dir = workflows({
    'agents/reviewer.md': '---\ndescription: Reviews\ncard: reviewer.skills.json\n---\nReview it.\n',
    'agents/reviewer.skills.json': '[]',
    'agents/implementer.md': IMPLEMENTER,
    'dev/implement.md': '---\nplace: git\nagent: implementer\n---\n',
  });
  const agents = loadAgents(agentsDir(path.join(dir, 'dev')));
  assert.ok(agents.get('reviewer') instanceof WorkflowError, 'the leftover one is kept as its refusal');
  assert.ok(!(agents.get('implementer') instanceof WorkflowError), 'and stops no agent beside it');
  assert.equal(loadWorkflows(path.join(dir, 'dev')).length, 1, 'nor a workflow that does not name it');
  fs.writeFileSync(path.join(dir, 'dev', 'review.md'), '---\nafter: implement\nplace: git\nagent: reviewer\n---\n');
  assert.throws(
    () => loadWorkflows(path.join(dir, 'dev')),
    (e: Error) => e.message.includes('which is retired'),
  );
});
