/**
 * An agent is written once: a file in `agents/`, beside the workflows whose steps name it — its frontmatter the role keys, its body its
 * instructions. What an agent file may say, and where the folder of them is not a workflow.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AGENT_KEYS, agentsDir, loadAgents, loadWorkflows, parseAgent, STEP_KEYS, workflowFolder, workflowsIn, WorkflowError, type Agent } from '../src/workflow.ts';

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-agents-'));
process.env.WF_ROOT = ROOT;
const { writeWorkflow } = await import('../src/runner.ts');

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
