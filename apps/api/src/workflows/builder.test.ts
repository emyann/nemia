/**
 * The workflow builder's api (builder.ts): a folder of yours put back from its steps and the schemas pasted for them, made with a first
 * step, and the form a step's keys are drawn in — in a scratch store and a scratch repository. Every write is read back from disk, and
 * every refusal is made to refuse, with the folder asserted as it was.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import { TEAM } from '../../test/team.ts';
import { app } from '../app.ts';
import { DEFAULT_HARNESS, putSchemasBack, stepsNamed } from './builder.ts';
import { workflowVersion as versionIn } from 'agent-orchestrator';
import { listWorkflows } from './workflows.ts';
import { engine, HARNESS_CHOICES, loadWorkflows, workflowTaken, writeWorkflow } from 'agent-orchestrator';
import {
  AGENT_KEYS,
  HARNESSES,
  parseFolder,
  parseWorkflow,
  POLICY_KEYS,
  REMOTE_REFUSED_KEYS,
  renderStep,
  STEP_KEY_MEANINGS,
  STEP_KEYS,
} from 'agent-orchestrator/workflow';
const repo = scratch('nemia-api-builder-repo-');
process.env.HKB_REPO = repo;
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });

/** A folder's version as the board reads it: its agents and skills looked for in the repository's `.claude/` and in yours too. */
const versionOf = (dir: string): string => versionIn(dir, { repo, home: root });

type KeyForm = import('./builder.ts').KeyForm;
type WorkflowSaved = import('./builder.ts').WorkflowSaved;
type BuildRefused = import('./builder.ts').BuildRefused;
type ListedStep = import('./workflows.ts').ListedStep;
type WorkflowStepSpec = import('./workflows.ts').WorkflowStepSpec;

const STORE = path.join(root, 'workflows');
const TEAM_DEV = path.join(TEAM, 'dev');

const write = (file: string, text: string): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

const again = JSON.stringify({
  type: 'object',
  properties: { again: { type: 'boolean' } },
  required: ['again'],
  additionalProperties: false,
});

/** Every file directly in `dir`, by name, with what it holds — a folder as one — : what a refused write must leave as it was. */
const snapshot = (dir: string): Record<string, string> =>
  fs.existsSync(dir)
    ? Object.fromEntries(
        fs
          .readdirSync(dir)
          .sort()
          .map((f) => [f, fs.statSync(path.join(dir, f)).isDirectory() ? '(a folder)' : fs.readFileSync(path.join(dir, f), 'utf8')]),
      )
    : {};

/**
 * A copy of the tests' team's `dev` — README, comments and `budget: 20` — as a workflow of yours named `name`, with the agents it names
 * beside it.
 */
function devIn(name: string): string {
  const dir = path.join(STORE, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.cpSync(path.join(TEAM, 'agents'), path.join(STORE, 'agents'), { recursive: true });
  fs.cpSync(path.join(TEAM, 'skills'), path.join(STORE, 'skills'), { recursive: true });
  for (const file of fs.readdirSync(TEAM_DEV)) fs.copyFileSync(path.join(TEAM_DEV, file), path.join(dir, file));
  return dir;
}

/** A workflow of yours, `plan` then `build`, with a schema `build` does not name yet. */
function planned(name: string): string {
  const dir = path.join(STORE, name);
  write(path.join(dir, 'plan.md'), '---\nplace: git\n# Plans first.\nharness: claude\n---\nWrite PLAN.md.\n');
  write(path.join(dir, 'build.md'), '---\nafter: plan\nplace: git\ncheck: npm test\n---\nBuild what PLAN.md says.\n');
  write(path.join(dir, 'build.schema.json'), again);
  return dir;
}

/** The repository's own, which the builder never writes. */
const theirs = path.join(repo, 'workflows', 'good');
write(path.join(theirs, 'implement.md'), '---\nplace: git\nmodel: opus\n---\nImplement it.\n');

/** A workflow's steps as GET /api/workflows lists them. */
async function listedSteps(name: string, from = 'yours'): Promise<ListedStep[]> {
  const all = (await (await app.request('/api/workflows')).json()) as Array<{ name: string; from: string; steps: ListedStep[] }>;
  const found = all.find((w) => w.name === name && w.from === from);
  assert.ok(found, `${from} lists ${name}`);
  return found.steps;
}

const json = { 'content-type': 'application/json' };
/**
 * A PUT of `body`: sent with the folder's version as it is on disk now, as a board that has just read it sends it — unless the body says
 * `version` itself, which the tests of a stale or a missing one do.
 */
const put = (name: string, body: unknown, from = 'yours', headers: Record<string, string> = json) => {
  const read =
    typeof body === 'object' && body !== null && !Array.isArray(body) && !('version' in body)
      ? { version: versionOf(path.join(STORE, decodeURIComponent(name))), ...body }
      : body;
  return app.request(`/api/workflows/${from}/${name}`, {
    method: 'PUT',
    headers,
    body: typeof read === 'string' ? read : JSON.stringify(read),
  });
};
const post = (body: unknown, from = 'yours', headers: Record<string, string> = json) =>
  app.request(`/api/workflows/${from}`, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

/** A spec with every key unset but `fields` and the `place: git` every step says, as the listing has one. */
const spec = (fields: Partial<WorkflowStepSpec> = {}): WorkflowStepSpec => ({
  harness: null,
  model: null,
  effort: null,
  context: null,
  after: [],
  resume: null,
  input: [],
  place: 'git',
  workspace: null,
  writable: [],
  reads: [],
  slot: null,
  agent: null,
  skills: [],
  permissionMode: null,
  sandbox: null,
  tools: null,
  disallowedTools: [],
  allowedTools: [],
  denials: null,
  background: null,
  remote: null,
  deadlineSeconds: null,
  budget: null,
  check: null,
  retries: null,
  gate: null,
  output: null,
  tally: [],
  loop: null,
  rounds: null,
  ...fields,
});

test("GET /api/workflows/keys is the form a step is drawn in: every key in the package's order with its line of meaning, how it is set, and the words it may take", async () => {
  const res = await app.request('/api/workflows/keys');
  assert.equal(res.status, 200);
  const form = (await res.json()) as KeyForm;
  assert.deepEqual(
    form.keys.map((k) => k.key),
    [...STEP_KEYS],
  );
  for (const k of form.keys) assert.equal(k.meaning, STEP_KEY_MEANINGS[k.key], k.key);
  const kindOf = Object.fromEntries(form.keys.map((k) => [k.key, k.kind]));
  assert.deepEqual(form.keys.find((k) => k.key === 'harness')?.choices, HARNESSES);
  assert.deepEqual(form.keys.find((k) => k.key === 'effort')?.byHarness, HARNESS_CHOICES.effort);
  assert.deepEqual(form.keys.find((k) => k.key === 'permissionMode')?.byHarness, HARNESS_CHOICES.permissionMode);
  assert.deepEqual(
    [kindOf.sandbox, form.keys.find((k) => k.key === 'sandbox')?.byHarness],
    ['harness-word', HARNESS_CHOICES.sandbox],
    "Codex's fence is its sandbox, a key of its own, offered to a step whose harness takes it",
  );
  for (const harness of HARNESSES)
    assert.equal(
      Object.hasOwn(HARNESS_CHOICES.permissionMode, harness) !== Object.hasOwn(HARNESS_CHOICES.sandbox, harness),
      true,
      `${harness} has one of a permission mode and a sandbox`,
    );
  assert.deepEqual(
    [kindOf.denials, form.keys.find((k) => k.key === 'denials')?.choices],
    ['choice', ['fail']],
    '`denials:` says one word or nothing, as `slot:` does: `fail`, which the parser reads and nothing else',
  );
  assert.equal(kindOf.skills, 'list', "a step's `skills:` is a plain list of the skills it adds to its agent's");
  write(
    path.join(STORE, 'agents', 'picked.md'),
    '---\nmodel: opus\ncontext: 200k\ntools: Read, Grep\noutput: picked.schema.json\n---\nPick me.\n',
  );
  write(
    path.join(STORE, 'agents', 'picked.schema.json'),
    JSON.stringify({ type: 'object', properties: { verdict: { type: 'string' } }, required: ['verdict'], additionalProperties: false }),
  );
  write(path.join(STORE, 'agents', 'broken.md'), '---\nloop: build\n---\nWired wrong.\n');
  const withAgents = (await (await app.request('/api/workflows/keys')).json()) as KeyForm;
  const agents = withAgents.keys.find((k) => k.key === 'agent');
  assert.deepEqual(
    [agents?.kind, agents?.choices?.includes('picked'), agents?.choices?.includes('broken')],
    ['choice', true, true],
    "the agent is picked from yours' agents/, one the load refuses included",
  );
  assert.deepEqual(
    agents?.choices,
    fs
      .readdirSync(path.join(STORE, 'agents'))
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.slice(0, -3))
      .sort(),
  );
  assert.deepEqual(
    withAgents.agents.picked,
    { model: 'opus', context: 200000, tools: ['Read', 'Grep'], output: 'picked.schema.json' },
    "an agent that loads comes with the role values it sets, as a step's spec gives them",
  );
  assert.equal(Object.hasOwn(withAgents.agents, 'broken'), false, 'an agent the load refuses gives no values');
  for (const file of ['picked.md', 'picked.schema.json', 'broken.md']) fs.rmSync(path.join(STORE, 'agents', file));
  const agentOnly = ['role', 'description', 'skills', 'harnessPrompt'];
  assert.deepEqual(
    form.roleKeys,
    ['harness', 'model', 'effort', 'context', 'permissionMode', 'sandbox', 'tools', 'disallowedTools', 'allowedTools', 'remote', 'output'],
    'the role keys, what the builder may set on the node, are written out: a key added to AGENT_KEYS is decided here, not inherited',
  );
  assert.deepEqual(
    form.roleKeys,
    AGENT_KEYS.filter((k) => !agentOnly.includes(k)),
    'the role keys are the agent keys but role, description, skills and harnessPrompt',
  );
  assert.deepEqual(
    form.policyKeys,
    ['tools', 'allowedTools', 'disallowedTools', 'permissionMode', 'sandbox', 'skills'],
    "the policy keys, which the builder groups as the step's policy over its agent: the fence keys and the skills it adds",
  );
  assert.deepEqual(form.policyKeys, [...POLICY_KEYS], "the package's list, never one of the api's own");
  for (const own of agentOnly)
    assert.equal(
      form.roleKeys.includes(own as never),
      false,
      `${own} says what the agent is, what it is given or what becomes of Claude Code's own prompt, and is no role key: a step adds skills to its agent's with a key of its own`,
    );

  const refusedAs = (key: string, value: string): string | null => {
    const lines = { after: 'a', place: 'git', output: 'b.schema.json', loop: 'a' } as Record<string, string>;
    lines[key] = value;
    const b = `---\n${Object.entries(lines)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n')}\n---\nDo b.\n`;
    try {
      parseFolder(
        [
          ['a', '---\nplace: git\n---\nDo a.\n'],
          ['b', b],
        ],
        (f) => (f === 'b.schema.json' ? again : undefined),
      );
      return null;
    } catch (err) {
      return (err as Error).message;
    }
  };
  for (const key of STEP_KEYS) {
    const said = refusedAs(key, 'several') ?? '';
    assert.equal(
      kindOf[key] === 'count',
      said.includes(`\`${key}: several\` is not a count`),
      `a count is what the parser refuses as not a count, and nothing else is — ${key} (${kindOf[key]}): ${said}`,
    );
  }
  const flags = Object.fromEntries(form.keys.filter((k) => k.kind === 'flag').map((k) => [k.key, k.choices]));
  assert.deepEqual(flags, { background: ['true', 'false'], remote: ['true', 'false'], gate: ['true'] });
  for (const [key, words] of Object.entries(flags))
    for (const word of words) assert.equal(refusedAs(key, word), null, `the parser takes the flag's word ${key}: ${word}`);
  assert.match(refusedAs('gate', 'false') ?? '', /`gate: false` is what a step without the line already is/, "gate's `false` is refused");
  assert.equal(form.defaultHarness, DEFAULT_HARNESS, "the default harness is the parser's");
  for (const mode of HARNESS_CHOICES.permissionMode[DEFAULT_HARNESS])
    parseWorkflow('a', `---\nplace: git\npermissionMode: ${mode}\n---\nDo a.\n`);
  assert.equal(Object.hasOwn(HARNESS_CHOICES.sandbox, DEFAULT_HARNESS), false, 'a step that names no harness takes no sandbox');
  const codexOnly = HARNESS_CHOICES.sandbox.codex.find((m) => !HARNESS_CHOICES.permissionMode[DEFAULT_HARNESS].includes(m))!;
  assert.equal(
    parseWorkflow('a', `---\nplace: git\npermissionMode: ${codexOnly}\n---\nDo a.\n`).permissionMode,
    codexOnly,
    "a mode's word is the runtime's to judge, at `nemia start`: the load reads it as written",
  );
  assert.throws(
    () => parseWorkflow('a', `---\nplace: git\nsandbox: ${codexOnly}\n---\nDo a.\n`),
    (e: Error) => e.message.startsWith('a: `sandbox: '),
  );
});

test("PUT /api/workflows/yours/:name with a folder's steps as the listing has them writes nothing: every file is kept, comments, budget and all", async () => {
  const dir = devIn('as-listed');
  const before = snapshot(dir);
  const steps = await listedSteps('as-listed');
  assert.equal(steps.find((s) => s.name === 'review')?.spec.budget, 20, "the listing carries review's budget, so a put does not drop it");
  assert.equal(steps.find((s) => s.name === 'ship')?.spec.workspace, 'main', "and ship's workspace, so a put does not drop that either");
  const res = await put('as-listed', { steps });
  assert.equal(res.status, 200, await res.clone().text());
  const saved = (await res.json()) as WorkflowSaved;
  assert.deepEqual([saved.written, saved.kept, saved.removed], [[], ['implement.md', 'review.md', 'ship.md'], []]);
  assert.deepEqual(snapshot(dir), before, 'byte for byte');
  assert.deepEqual(
    saved.workflow,
    (await listWorkflows(engine(), repo, root)).find((w) => w.name === 'as-listed' && w.from === 'yours'),
    'answered as the listing reads it',
  );
});

/** A workflow of yours whose one step, `build`, has the agent `coder` (a name not its own), with a key and a note of its own. */
function attached(name: string): string {
  const dir = path.join(STORE, name);
  write(path.join(STORE, 'agents', 'coder.md'), '---\nharness: claude\nmodel: opus\neffort: high\n---\nYou write code.\n');
  write(path.join(dir, 'build.md'), '---\nplace: git\nagent: coder\ncheck: npm test\n---\nAnd mind the cache.\n');
  return dir;
}

test('a step with an agent is listed resolved, with what its file sets itself (`own`), and put back as `agent`, its own keys and its own note — a key changed on the board is its own from then on', async () => {
  const dir = attached('with-agent');
  const [build] = await listedSteps('with-agent');
  assert.deepEqual(build, {
    name: 'build',
    spec: spec({ agent: 'coder', harness: 'claude', model: 'opus', effort: 'high', check: 'npm test' }),
    body: 'You write code.\n\nAnd mind the cache.',
    own: { keys: ['place', 'check'], body: 'And mind the cache.' },
    hired: null,
    layers: {
      agent: 'coder',
      instructions: 'You write code.',
      custom: null,
      factory: null,
      agentSkills: [],
      policy: 'And mind the cache.',
      addedSkills: [],
      fence: [],
      task: null,
      via: 'prompt',
    },
  });

  let res = await put('with-agent', { steps: [build] });
  assert.equal(res.status, 200, await res.clone().text());
  assert.deepEqual(
    ((await res.json()) as WorkflowSaved).kept,
    ['build.md'],
    "as listed, nothing is written: the agent's keys and words stay in its file",
  );

  const edited = {
    ...build,
    spec: { ...build.spec, effort: 'low' },
    own: { keys: [...build.own.keys, 'effort'], body: 'And mind the index.' },
  };
  res = await put('with-agent', { steps: [edited] });
  assert.equal(res.status, 200, await res.clone().text());
  assert.equal(
    fs.readFileSync(path.join(dir, 'build.md'), 'utf8'),
    '---\nplace: git\nagent: coder\neffort: low\ncheck: npm test\n---\nAnd mind the index.\n',
    "a key changed, which the board makes the node's own, and the note are written, and nothing else of the agent's",
  );
  const [read] = await listedSteps('with-agent');
  assert.deepEqual([read.spec.model, read.spec.effort, read.body], ['opus', 'low', 'You write code.\n\nAnd mind the index.']);

  res = await put('with-agent', {
    steps: [{ name: 'build', spec: { place: 'git', agent: 'coder', check: 'npm test' }, body: 'Mind nothing.' }],
  });
  assert.equal(res.status, 200, await res.clone().text());
  assert.equal(
    fs.readFileSync(path.join(dir, 'build.md'), 'utf8'),
    '---\nplace: git\nagent: coder\ncheck: npm test\n---\nMind nothing.\n',
    'a step sent without `own`, as one drafted by hand, has every key it sets as its own, and its body as its note',
  );
});

test("a step with an agent is listed with its layers — the agent's instructions, your custom instructions, the step's policy and the fence lines it tightens — and a save of the listing writes none of them", async () => {
  const dir = path.join(STORE, 'layered');
  write(path.join(STORE, 'agents', 'scribe.md'), '---\nmodel: opus\n---\nYou write things down.\n');
  write(path.join(root, 'custom-instructions', 'scribe.md'), 'Write it in French.\n');
  write(
    path.join(dir, 'note.md'),
    '---\nplace: git\nagent: scribe\nmodel: sonnet\ndisallowedTools: Bash(rm:*)\n---\nNote the decisions.\n',
  );
  write(path.join(dir, 'tidy.md'), '---\nafter: note\nplace: git\n---\nTidy up.\n');
  try {
    const before = snapshot(dir);
    const [note, tidy] = (await listedSteps('layered')) as [ListedStep, ListedStep];
    assert.deepEqual(note.layers, {
      agent: 'scribe',
      instructions: 'You write things down.',
      custom: 'Write it in French.',
      factory: null,
      agentSkills: [],
      policy: 'Note the decisions.',
      addedSkills: [],
      fence: [{ key: 'disallowedTools', value: 'Bash(rm:*)' }],
      task: null,
      via: 'prompt',
    });
    assert.equal(tidy.layers, null, 'a step with no agent has no layers over one');
    const res = await put('layered', { steps: [note, tidy] });
    assert.equal(res.status, 200, await res.clone().text());
    assert.deepEqual(snapshot(dir), before, 'the layers are read, never written back');
  } finally {
    fs.rmSync(path.join(root, 'custom-instructions', 'scribe.md'));
  }
});

test("REFUSED at shipped defaults: a step's `own` that is not the listing's shape is a 400 naming the step, and a step naming an agent agents/ does not have is the package's 422 — and nothing is written", async () => {
  const dir = attached('own-refused');
  const before = snapshot(dir);
  for (const own of [{ keys: 'check', body: '' }, { keys: ['check'] }, 'check', { keys: [1], body: '' }]) {
    const res = await put('own-refused', { steps: [{ name: 'build', spec: spec({ agent: 'coder' }), body: '', own }] });
    assert.equal(res.status, 400, JSON.stringify(own));
    const { error } = (await res.json()) as { error: string };
    assert.ok(error.startsWith("PUT /api/workflows/yours/own-refused: step 1 (build)'s `own` is "), error);
  }
  const res = await put('own-refused', {
    steps: [{ name: 'build', spec: spec({ agent: 'coderr' }), body: '', own: { keys: [], body: '' } }],
  });
  assert.equal(res.status, 422);
  const refused = (await res.json()) as BuildRefused;
  assert.ok(refused.error.startsWith('build: `agent: coderr` is not an agent here.'), refused.error);
  assert.deepEqual(refused.steps, ['build']);
  assert.deepEqual(snapshot(dir), before);
});

test("versionOf covers the agents a folder's steps name: an edit of one changes it, and an agent no step names does not", () => {
  const dir = attached('versioned');
  const at = versionOf(dir);
  write(path.join(STORE, 'agents', 'unnamed.md'), '---\nmodel: sonnet\n---\nNobody names me.\n');
  assert.equal(versionOf(dir), at, 'an agent no step names');
  fs.appendFileSync(path.join(STORE, 'agents', 'coder.md'), 'Write tests first.\n');
  assert.notEqual(versionOf(dir), at, 'the agent build names');
  fs.rmSync(path.join(STORE, 'agents', 'unnamed.md'));
});

test("versionOf reads `agent:` as the parser does — indented, or with a space before its colon — and covers the schema the agent's output: names", async () => {
  for (const [folder, line] of [
    ['indented', '  agent: critic'],
    ['spaced', 'agent : critic'],
  ] as const) {
    const dir = path.join(STORE, `version-${folder}`);
    write(path.join(STORE, 'agents', 'critic.md'), '---\nharness: claude\noutput: critique.schema.json\n---\nFind what is wrong.\n');
    write(
      path.join(STORE, 'agents', 'critique.schema.json'),
      JSON.stringify({ type: 'object', properties: { verdict: { type: 'string' } }, required: ['verdict'], additionalProperties: false }),
    );
    write(path.join(dir, 'judge.md'), `---\nplace: git\n${line}\n---\n`);
    const listing = (await listWorkflows(engine(), repo, root)).find((w) => w.name === `version-${folder}`);
    assert.equal(
      listing?.steps[0]?.spec.agent,
      'critic',
      `${folder}: the load reads the agent — ${JSON.stringify(listing?.error ?? listing)}`,
    );
    const at = versionOf(dir);
    fs.appendFileSync(path.join(STORE, 'agents', 'critic.md'), 'Say where.\n');
    assert.notEqual(versionOf(dir), at, `${folder}: an edit of the agent it names`);
    const again = versionOf(dir);
    write(
      path.join(STORE, 'agents', 'critique.schema.json'),
      JSON.stringify({
        type: 'object',
        properties: { verdict: { type: 'string' }, line: { type: 'number' } },
        required: ['verdict', 'line'],
        additionalProperties: false,
      }),
    );
    assert.notEqual(versionOf(dir), again, `${folder}: an edit of the schema its agent declares`);
  }
});

test("a folder whose agent's skill is in the repository's `.claude/skills/` is listed, versioned and saved as a start reads it — and one no place has is the package's 422", async () => {
  const skill = path.join(repo, '.claude', 'skills', 'mind-the-cache', 'SKILL.md');
  write(skill, '---\nname: mind-the-cache\ndescription: Use this when a change touches the cache.\n---\nRead the cache first.\n');
  write(path.join(STORE, 'agents', 'cacher.md'), '---\ntools: Read, Skill\nskills: mind-the-cache\n---\nYou mind the cache.\n');
  const dir = path.join(STORE, 'skilled');
  write(path.join(dir, 'build.md'), '---\nplace: git\nagent: cacher\n---\n');
  try {
    assert.throws(
      () => loadWorkflows(dir),
      (e: Error) => /gives the skill `mind-the-cache`, and no skills folder has it/.test(e.message),
      'read with its own place alone, the skill is not there',
    );
    const listing = (await listWorkflows(engine(), repo, root)).find((w) => w.name === 'skilled' && w.from === 'yours');
    assert.equal(
      listing?.error,
      null,
      `the board reads with the repository's place and yours, as nemia start --repo does: ${JSON.stringify(listing?.error)}`,
    );
    const [build] = await listedSteps('skilled');
    const at = versionOf(dir);
    fs.appendFileSync(skill, 'And say so.\n');
    const edited = versionOf(dir);
    assert.notEqual(
      edited,
      at,
      'an edit of the skill the agent names moves the version, or the board would save over an edit it never read',
    );
    write(path.join(path.dirname(skill), 'notes.md'), 'A file beside SKILL.md.\n');
    assert.notEqual(versionOf(dir), edited, 'a file added to the skill');
    let res = await put('skilled', { steps: [build] });
    assert.equal(res.status, 200, `saved as listed, judged and written with the places it was read with: ${await res.clone().text()}`);
    fs.rmSync(path.join(repo, '.claude'), { recursive: true });
    const before = snapshot(dir);
    res = await put('skilled', { steps: [build] });
    assert.equal(res.status, 422, "the skill gone from every place is the package's refusal");
    const refused = (await res.json()) as BuildRefused;
    assert.match(refused.error, /^build: `agent: cacher` gives the skill `mind-the-cache`, and no skills folder has it — looked in /);
    assert.ok(refused.error.includes(path.join(repo, '.claude', 'skills')), `naming where it looked: ${refused.error}`);
    assert.deepEqual(snapshot(dir), before, 'nothing written');
  } finally {
    fs.rmSync(path.join(repo, '.claude'), { recursive: true, force: true });
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(path.join(STORE, 'agents', 'cacher.md'));
  }
});

test("a skill only a step's own `skills:` adds moves the folder's version when its folder is edited, as the agent's own skills do; another skill does not", () => {
  const dir = path.join(STORE, 'step-skilled');
  const added = path.join(STORE, 'skills', 'mind-the-index', 'SKILL.md');
  const other = path.join(STORE, 'skills', 'mind-nothing', 'SKILL.md');
  write(added, '---\nname: mind-the-index\ndescription: Use this when a change touches the index.\n---\nRead the index first.\n');
  write(other, '---\nname: mind-nothing\ndescription: Use this never.\n---\nNothing.\n');
  write(path.join(STORE, 'agents', 'indexer.md'), '---\ntools: Read, Skill\n---\nYou mind the index.\n');
  write(path.join(dir, 'build.md'), '---\nplace: git\nagent: indexer\nskills: mind-the-index\n---\n');
  try {
    assert.equal(
      loadWorkflows(dir, { repo, home: root })
        .find((s) => s.name === 'build')
        ?.agent?.skills?.join(),
      'mind-the-index',
    );
    const at = versionOf(dir);
    fs.appendFileSync(other, 'And say so.\n');
    assert.equal(versionOf(dir), at, "a skill no step adds and no agent gives is not the folder's");
    fs.appendFileSync(added, 'And say so.\n');
    assert.notEqual(versionOf(dir), at, 'an edit of the skill the step adds moves the version, or the board would save over it unread');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(path.dirname(added), { recursive: true, force: true });
    fs.rmSync(path.dirname(other), { recursive: true, force: true });
    fs.rmSync(path.join(STORE, 'agents', 'indexer.md'));
  }
});

test('a folder that writes a list under its former name — `disallow:`, `allow:` — is listed under the name it has now, and a save of the step writes that name; a page from before, which sends the former name, is refused and nothing written', async () => {
  const dir = path.join(STORE, 'former');
  write(
    path.join(dir, 'write.md'),
    '---\nplace: git\npermissionMode: dontAsk\ndisallow: SendMessage\nallow: Edit(**)\n---\nWrite the note.\n',
  );
  const [step] = (await listedSteps('former')) as [ListedStep];
  assert.deepEqual([step.spec.disallowedTools, step.spec.allowedTools], [['SendMessage'], ['Edit(**)']]);
  assert.equal(Object.hasOwn(step.spec, 'allow') || Object.hasOwn(step.spec, 'disallow'), false, 'the listing has one name for each list');

  const before = snapshot(dir);
  const { disallowedTools, allowedTools, ...rest } = step.spec;
  const stale = await put('former', { steps: [{ ...step, spec: { ...rest, disallow: disallowedTools, allow: allowedTools } }] });
  const refusal = (await stale.json()) as BuildRefused;
  assert.equal(stale.status, 422, `a page that sends the lists under their former names is refused: ${JSON.stringify(refusal)}`);
  assert.match(
    refusal.error,
    /^write: `disallow` is `disallowedTools`'s former name, which a file may still say but nothing writes\. Send `disallowedTools` — a page that sends the former name is stale: reload it, and save again\./,
  );
  assert.deepEqual(snapshot(dir), before, 'nothing written');

  const saved = await put('former', { steps: [{ ...step, spec: { ...step.spec, allowedTools: ['Edit(notes/**)'] } }] });
  assert.equal(saved.status, 200, await saved.clone().text());
  assert.equal(
    fs.readFileSync(path.join(dir, 'write.md'), 'utf8'),
    '---\nplace: git\npermissionMode: dontAsk\ndisallowedTools: SendMessage\nallowedTools: Edit(notes/**)\n---\nWrite the note.\n',
    'a save of the step writes the names the keys have',
  );
});

test('a folder that says `workspace: folder` is listed with `place: folder`, a folder team, and a save writes `place:`; REFUSED: a page that sends `workspace: folder`, and a place that is not `git` or `folder` — nothing written', async () => {
  const dir = path.join(STORE, 'placed');
  write(path.join(dir, 'write.md'), '---\nworkspace: folder\npermissionMode: dontAsk\n---\nWrite the note.\n');
  const listed = (await (await app.request('/api/workflows')).json()) as Array<{ name: string; from: string; folderTeam: boolean }>;
  const folder = listed.find((w) => w.name === 'placed' && w.from === 'yours');
  assert.equal(folder?.folderTeam, true, 'the former spelling is still a folder team');
  const [step] = (await listedSteps('placed')) as [ListedStep];
  assert.deepEqual([step.spec.place, step.spec.workspace], ['folder', null], 'listed under the key it has now');

  const before = snapshot(dir);
  for (const [spec, error] of [
    [
      { ...step.spec, place: null, workspace: 'folder' },
      /^write: `workspace: folder` is the former spelling of `place: folder`, which a file may still say but nothing writes\. Send `place: folder`/,
    ],
    [
      { ...step.spec, place: 'cloud' },
      /^write: `place: cloud` is not a place a step works in\. `place: git` works on branches of a repository; `place: folder`/,
    ],
  ] as const) {
    const refused = await put('placed', { steps: [{ ...step, spec }] });
    const said = (await refused.json()) as BuildRefused;
    assert.equal(refused.status, 422, JSON.stringify(said));
    assert.match(said.error, error);
    assert.deepEqual(snapshot(dir), before, 'nothing written');
  }

  const saved = await put('placed', { steps: [{ ...step, spec: { ...step.spec, permissionMode: 'acceptEdits' } }] });
  assert.equal(saved.status, 200, await saved.clone().text());
  assert.equal(
    fs.readFileSync(path.join(dir, 'write.md'), 'utf8'),
    '---\nplace: folder\npermissionMode: acceptEdits\n---\nWrite the note.\n',
    'a save of the step writes `place: folder`, and no `workspace:` line',
  );
  const git = await put('placed', { steps: [{ ...step, spec: { ...step.spec, place: 'git' } }] });
  assert.equal(git.status, 200, await git.clone().text());
  assert.match(fs.readFileSync(path.join(dir, 'write.md'), 'utf8'), /^---\nplace: git\n/, 'and `place: git` as set');
});

test('a codex step that names its sandbox under the former key `permissionMode:` is listed with its `sandbox`, and a save writes `sandbox:`; REFUSED: a page that sends `permissionMode` for it, and `sandbox` on a Claude Code step — nothing written', async () => {
  const dir = path.join(STORE, 'fenced');
  write(path.join(dir, 'review.md'), '---\nplace: git\nharness: codex\npermissionMode: read-only\n---\nReview it.\n');
  const [step] = (await listedSteps('fenced')) as [ListedStep];
  assert.deepEqual(
    [step.spec.sandbox, step.spec.permissionMode],
    ['read-only', null],
    "listed under Codex's name, never as a Claude Code mode",
  );

  const before = snapshot(dir);
  const { sandbox, ...rest } = step.spec;
  const stale = await put('fenced', { steps: [{ ...step, spec: { ...rest, permissionMode: sandbox } }] });
  const refusal = (await stale.json()) as BuildRefused;
  assert.equal(stale.status, 422, JSON.stringify(refusal));
  assert.equal(
    refusal.error,
    'review: `permissionMode: read-only` on a step that runs on codex is the former name of `sandbox:` there, which a file may still say but nothing writes. Send the sandbox as `sandbox:` instead: a page that sends the former name is stale — reload it, and save again; and a step moved onto codex from Claude Code keeps its permission mode — clear it, and set the sandbox.',
  );
  assert.deepEqual(refusal.steps, ['review']);
  assert.deepEqual(snapshot(dir), before, 'nothing written');

  const claude = await put('fenced', { steps: [{ ...step, spec: { ...step.spec, harness: 'claude' } }] });
  const refused = (await claude.json()) as BuildRefused;
  assert.equal(claude.status, 422, `a Claude Code step has no sandbox: ${JSON.stringify(refused)}`);
  assert.ok(
    refused.error.startsWith(
      "review: `sandbox: read-only` is a codex step's sandbox, and this step runs on claude, which is fenced by its permission mode, `permissionMode:`",
    ),
    `refused naming its own fence: ${refused.error}`,
  );
  assert.deepEqual(snapshot(dir), before, 'nothing written');

  const kept = await put('fenced', { steps: [step] });
  assert.equal(kept.status, 200, await kept.clone().text());
  assert.deepEqual(snapshot(dir), before, 'saved unchanged, the file is kept, as it reads as the step');
  const saved = await put('fenced', { steps: [{ ...step, spec: { ...step.spec, sandbox: 'workspace-write' } }] });
  assert.equal(saved.status, 200, await saved.clone().text());
  assert.equal(
    fs.readFileSync(path.join(dir, 'review.md'), 'utf8'),
    '---\nplace: git\nharness: codex\nsandbox: workspace-write\n---\nReview it.\n',
    'saved with a change, it says `sandbox:`',
  );
});

test('the form offers each remote A2A agent the store declares as a harness, and a step on one is saved as the package reads it', async (t) => {
  const declared = path.join(root, 'a2a-agents.json');
  t.after(() => fs.rmSync(declared, { force: true }));
  write(declared, JSON.stringify({ reviewer: { url: 'https://agents.example.com/reviewer' } }));
  const form = (await (await app.request('/api/workflows/keys')).json()) as KeyForm;
  assert.deepEqual(form.keys.find((k) => k.key === 'harness')?.choices, [...HARNESSES, 'a2a:reviewer']);
  for (const key of ['effort', 'permissionMode', 'sandbox'] as const)
    assert.equal(
      Object.hasOwn(form.keys.find((k) => k.key === key)!.byHarness!, 'a2a:reviewer'),
      false,
      `${key}: a remote agent takes none of a harness's words`,
    );
  assert.deepEqual(form.remote, { prefix: 'a2a:', refuses: [...REMOTE_REFUSED_KEYS] });
  assert.ok(
    form.remote.refuses.includes('model') && form.remote.refuses.includes('permissionMode') && !form.remote.refuses.includes('after'),
    'the form leaves off a remote step every key the load refuses there',
  );

  write(declared, '{ "reviewer": ');
  const broken = await app.request('/api/workflows/keys');
  assert.equal(broken.status, 200, 'a file of agents refused as it stands still draws the form');
  assert.deepEqual(
    ((await broken.json()) as KeyForm).keys.find((k) => k.key === 'harness')?.choices,
    HARNESSES,
    'and offers none of its agents',
  );
  write(declared, JSON.stringify({ reviewer: { url: 'https://agents.example.com/reviewer' } }));

  const dir = path.join(STORE, 'asked');
  write(path.join(dir, 'ask.md'), '---\nworkspace: folder\n---\nAsk it.\n');
  const [ask] = (await listedSteps('asked')) as [ListedStep];
  const saved = await put('asked', { steps: [{ ...ask, spec: { ...ask.spec, harness: 'a2a:reviewer' } }] });
  assert.equal(saved.status, 200, await saved.clone().text());
  assert.equal(
    fs.readFileSync(path.join(dir, 'ask.md'), 'utf8'),
    '---\nplace: folder\nharness: a2a:reviewer\n---\nAsk it.\n',
    'saved, the step says its harness as the package reads it',
  );
  assert.equal((await listedSteps('asked'))[0].spec.harness, 'a2a:reviewer', "the listing carries the agent's name in the harness");

  const before = fs.readFileSync(path.join(dir, 'ask.md'), 'utf8');
  const [remote] = (await listedSteps('asked')) as [ListedStep];
  const refused = await put('asked', { steps: [{ ...remote, spec: { ...remote.spec, model: 'opus' } }] });
  const said = (await refused.json()) as BuildRefused;
  assert.equal(refused.status, 422, `a key a remote step may not set is refused: ${JSON.stringify(said)}`);
  assert.match(said.error, /^ask: `model: opus` .*`harness: a2a:reviewer` is a remote A2A agent\. Delete the line/);
  assert.equal(fs.readFileSync(path.join(dir, 'ask.md'), 'utf8'), before, 'nothing is written');
});

test('PUT /api/workflows/yours/:name writes the folder the steps make — a step added, an edge drawn, a key set, a step gone, the README — and answers it read back from disk', async () => {
  const dir = planned('drawn');
  const [plan, build] = (await listedSteps('drawn')) as [ListedStep, ListedStep];
  const review: ListedStep = {
    name: 'review',
    spec: spec({ after: ['build'], model: 'opus', output: 'build.schema.json', loop: 'build', rounds: 2 }),
    body: 'Review the build.',
    own: null,
    hired: null,
    layers: null,
  };
  const res = await put('drawn', {
    steps: [plan, { ...build, spec: { ...build.spec, retries: 1 } }, review],
    readme: '# drawn\n\nPlan, build, review.\n',
  });
  assert.equal(res.status, 200, await res.clone().text());
  const saved = (await res.json()) as WorkflowSaved;
  assert.deepEqual([saved.written, saved.kept, saved.removed], [['README.md', 'build.md', 'review.md'], ['plan.md'], []]);
  assert.equal(
    fs.readFileSync(path.join(dir, 'plan.md'), 'utf8'),
    '---\nplace: git\n# Plans first.\nharness: claude\n---\nWrite PLAN.md.\n',
    'a step unchanged keeps its file, comment and all',
  );
  assert.equal(
    fs.readFileSync(path.join(dir, 'build.md'), 'utf8'),
    '---\nafter: plan\nplace: git\ncheck: npm test\nretries: 1\n---\nBuild what PLAN.md says.\n',
  );
  assert.equal(
    fs.readFileSync(path.join(dir, 'review.md'), 'utf8'),
    '---\nafter: build\nplace: git\nmodel: opus\noutput: build.schema.json\nloop: build\nrounds: 2\n---\nReview the build.\n',
  );
  assert.equal(fs.readFileSync(path.join(dir, 'README.md'), 'utf8'), '# drawn\n\nPlan, build, review.\n');
  assert.deepEqual(
    saved.workflow.steps.map((s) => s.name),
    ['plan', 'build', 'review'],
  );
  assert.deepEqual(saved.workflow.graph.edges, [
    { from: 'plan', to: 'build', kind: 'after' },
    { from: 'build', to: 'review', kind: 'after' },
    { from: 'review', to: 'build', kind: 'loop', rounds: 2 },
  ]);
  assert.equal(saved.workflow.description, 'Plan, build, review.');
  assert.equal(saved.workflow.readme, '# drawn\n\nPlan, build, review.\n', 'the README it wrote, whole');
  assert.deepEqual(
    saved.workflow,
    (await listWorkflows(engine(), repo, root)).find((w) => w.name === 'drawn'),
    'answered as the listing reads it',
  );

  const windowed = await put('drawn', { steps: [plan, { ...build, spec: { ...build.spec, retries: 1, context: 150_000 } }, review] });
  assert.equal(windowed.status, 200, await windowed.clone().text());
  assert.match(
    fs.readFileSync(path.join(dir, 'build.md'), 'utf8'),
    /^context: 150k$/m,
    "a context window, sent as its tokens, is written in the package's one form",
  );
  assert.equal(
    ((await windowed.json()) as WorkflowSaved).workflow.steps.find((s) => s.name === 'build')?.spec.context,
    150_000,
    'and listed back as the number',
  );

  const background = await put('drawn', { steps: [plan, { ...build, spec: { ...build.spec, retries: 1, background: true } }, review] });
  assert.equal(background.status, 200, await background.clone().text());
  assert.match(fs.readFileSync(path.join(dir, 'build.md'), 'utf8'), /^background: true$/m);
  const listed = ((await background.json()) as WorkflowSaved).workflow.steps;
  assert.deepEqual(
    listed.map((s) => [s.name, s.spec.background]),
    [
      ['plan', null],
      ['build', true],
      ['review', null],
    ],
    'a step run as a background session says so and is listed back as one; a step that does not say is a job, listed as null',
  );

  const gone = await put('drawn', { steps: [plan, { name: 'build', spec: { place: 'git', check: 'npm test' }, body: 'Build it.' }] });
  assert.equal(gone.status, 200, await gone.clone().text());
  const after = (await gone.json()) as WorkflowSaved;
  assert.deepEqual([after.written, after.removed], [['build.md'], ['review.md']], 'a step gone takes its file');
  assert.equal(
    fs.readFileSync(path.join(dir, 'build.md'), 'utf8'),
    '---\nplace: git\ncheck: npm test\n---\nBuild it.\n',
    'an edge deleted takes its key, and a key the listing leaves out is unset',
  );
  assert.deepEqual(after.workflow.graph, { roots: ['build', 'plan'], edges: [] });
  assert.deepEqual(after.workflow.schemas, ['build.schema.json'], 'the schema is left as it is');
});

test("REFUSED at shipped defaults: what the package refuses is a 422 in its words, naming the steps it names — a cycle, an after naming no step, a key no step has, `maxAttempts`, a loop with no output, a schema not there, a name that is not a file's, a name twice, a list of no tools, a line break, a step with no place, no steps — and the folder is as it was", async () => {
  const dir = planned('refused');
  const before = snapshot(dir);
  const [plan, build] = (await listedSteps('refused')) as [ListedStep, ListedStep];
  const cases: Array<[string, unknown[], string[]]> = [
    ['a cycle', [{ ...plan, spec: { ...plan.spec, after: ['build'] } }, build], ['build', 'plan']],
    ['an after naming no step', [plan, { ...build, spec: { ...build.spec, after: ['plan', 'nope'] } }], ['build']],
    ['a key no step has', [plan, { ...build, spec: { ...build.spec, afer: ['plan'] } }], ['build']],
    ["a count of attempts, retired with the runtime's", [plan, { ...build, spec: { ...build.spec, maxAttempts: 2 } }], ['build']],
    ['a loop with no output', [plan, { ...build, spec: { ...build.spec, loop: 'plan' } }], ['build']],
    ['a schema not there', [plan, { ...build, spec: { ...build.spec, output: 'nope.schema.json' } }], ['build']],
    ['a schema outside the folder', [plan, { ...build, spec: { ...build.spec, output: '../drawn/build.schema.json' } }], ['build']],
    ["a name that is not a file's", [plan, { ...build, name: 'build/it' }], ['build/it']],
    ['a name twice', [plan, build, { ...build }], ['build']],
    ['no tools', [plan, { ...build, spec: { ...build.spec, tools: [] } }], ['build']],
    ['a line break in a check', [plan, { ...build, spec: { ...build.spec, check: 'npm test\nharness: codex' } }], ['build']],
    ['an empty body', [plan, { ...build, body: '  ' }], ['build']],
    ['a step with no place', [plan, { ...build, spec: { ...build.spec, place: null } }], ['build']],
    ['no steps', [], []],
  ];
  for (const [what, steps, named] of cases) {
    const res = await put('refused', { steps });
    assert.equal(res.status, 422, `${what}: ${await res.clone().text()}`);
    const { error, steps: said } = (await res.json()) as BuildRefused;
    const drafts = (steps as ListedStep[]).map((s) => ({
      ...Object.fromEntries(Object.entries(s.spec).filter(([, v]) => v !== null)),
      name: s.name,
      body: s.body,
      ...(s.spec.output ? { output: { file: s.spec.output } } : {}),
      after: s.spec.after ?? [],
    }));
    assert.throws(
      () => writeWorkflow(dir, drafts),
      (e: Error) => e.message === error,
      `${what}: the package's sentence, word for word, as writeWorkflow throws it for the same steps: ${error}`,
    );
    assert.deepEqual(said, named, `${what}: ${error}`);
    assert.deepEqual(snapshot(dir), before, `${what}: nothing written`);
  }
});

test("REFUSED at shipped defaults: a write to the repository's workflows is a 403 that says to copy the folder into the repository by hand — by the path and by the body's `from` — and nothing is written there or in yours", async () => {
  planned('mine');
  const before = [snapshot(theirs), snapshot(path.join(STORE, 'mine'))];
  const step = { name: 'implement', spec: spec({ model: 'sonnet' }), body: 'Implement it my way.' };
  const sentence = (route: string, name: string | null) =>
    `${route} refuses to write the repository's workflows (${path.join(repo, 'workflows')}): only yours is written, in ${STORE}, and nothing into a checkout. Build the workflow in yours${name ? ` — \`cp -r ${path.join(repo, 'workflows', name)} ${STORE}/\` starts from this one —` : ''} then copy the folder into ${path.join(repo, 'workflows')} by hand, where git shows it as a change to commit.`;
  for (const [res, route, name] of [
    [await put('good', { steps: [step] }, 'repo'), 'PUT /api/workflows/repo/good', 'good'],
    [await put('mine', { steps: [step], from: 'repo' }), 'PUT /api/workflows/yours/mine', 'mine'],
    [await post({ name: 'good', step }, 'repo'), 'POST /api/workflows/repo', null],
    [await post({ name: 'new', step, from: 'repo' }), 'POST /api/workflows/yours', 'new'],
  ] as const) {
    assert.equal(res.status, 403, route);
    assert.equal(((await res.json()) as { error: string }).error, sentence(route, name), route);
  }
  for (const res of [
    await put('mine', { steps: [step] }, 'elsewhere'),
    await post({ name: 'x', step }, 'elsewhere'),
    await put('mine', { steps: [step], from: 'elsewhere' }),
  ]) {
    assert.equal(res.status, 400, 'anywhere else is not a source at all');
    assert.match(
      ((await res.json()) as { error: string }).error,
      /the builder writes yours, at \/api\/workflows\/yours\/…, and this request named "elsewhere"\.$/,
    );
  }
  assert.deepEqual([snapshot(theirs), snapshot(path.join(STORE, 'mine'))], before);
  assert.equal(fs.existsSync(path.join(STORE, 'new')), false);
  assert.equal(fs.existsSync(path.join(STORE, 'x')), false);
});

test('REFUSED at shipped defaults: a write another site could make — a body not sent as application/json (415), a page on another site (403), a name that is not this machine (403) — for both writes, and nothing is written', async () => {
  const dir = planned('guarded');
  const before = snapshot(dir);
  const steps = await listedSteps('guarded');
  const writes = [
    ['PUT /api/workflows/yours/guarded', (h: Record<string, string>) => put('guarded', { steps: [steps[0]] }, 'yours', h)],
    ['POST /api/workflows/yours', (h: Record<string, string>) => post({ name: 'guarded-2', step: steps[0] }, 'yours', h)],
  ] as const;
  for (const [route, send] of writes) {
    const type = await send({ 'content-type': 'text/plain;charset=UTF-8' });
    assert.equal(type.status, 415, route);
    assert.ok(
      ((await type.json()) as { error: string }).error.startsWith(`${route} takes its body as \`content-type: application/json\``),
      route,
    );
    const site = await send({ 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' });
    assert.equal(site.status, 403, route);
    assert.ok(
      ((await site.json()) as { error: string }).error.startsWith(
        `${route} refuses a request made by a page on another site (Sec-Fetch-Site: cross-site)`,
      ),
      route,
    );
    const host = await send({ 'content-type': 'application/json', host: 'evil.example:8787' });
    assert.equal(host.status, 403, route);
    assert.ok(
      ((await host.json()) as { error: string }).error.startsWith(`${route} refuses a request addressed to evil.example:8787`),
      route,
    );
  }
  assert.deepEqual(snapshot(dir), before);
  assert.equal(fs.existsSync(path.join(STORE, 'guarded-2')), false);
});

test("REFUSED at shipped defaults: a body not in the listing's shape is a 400 naming the step and the key — a `version` left out among them, so a save that does not say what it read is never written over a folder changed since — and nothing is written", async () => {
  const dir = planned('shaped');
  const before = snapshot(dir);
  const [plan] = (await listedSteps('shaped')) as [ListedStep];
  const cases: Array<[unknown, RegExp]> = [
    ['not json', /takes a JSON body/],
    [[], /takes a JSON object/],
    [{}, /takes the workflow's steps in `steps`, a list/],
    [{ steps: 'plan' }, /`steps`, a list/],
    [{ steps: ['plan'] }, /step 1 is "plan", and a step is an object\./],
    [{ steps: [{ spec: plan.spec, body: plan.body }] }, /step 1 has no `name`/],
    [{ steps: [{ name: 'plan', spec: plan.spec }] }, /step 1 \(plan\) has no `body`/],
    [{ steps: [{ name: 'plan', spec: ['harness'], body: 'x' }] }, /step 1 \(plan\)'s `spec` is \["harness"\], and it is an object/],
    [
      { steps: [{ ...plan, spec: { after: 'build' } }] },
      /step 1 \(plan\)'s `after` is a list of strings, such as \["implement"\], or null for unset, and this request's was "build"\./,
    ],
    [
      { steps: [{ ...plan, spec: { deadlineSeconds: '5m' } }] },
      /`deadlineSeconds` is a number, or null for unset, and this request's was "5m"/,
    ],
    [{ steps: [{ ...plan, spec: { budget: '$5' } }] }, /`budget` is a number/],
    [{ steps: [{ ...plan, spec: { context: '200k' } }] }, /`context` is a number, or null for unset, and this request's was "200k"/],
    [{ steps: [{ ...plan, spec: { background: 'yes' } }] }, /`background` is true or false/],
    [{ steps: [{ ...plan, spec: { remote: 'yes' } }] }, /`remote` is true or false/],
    [{ steps: [{ ...plan, spec: { gate: 'true' } }] }, /`gate` is true or false/],
    [{ steps: [{ ...plan, spec: { output: { file: 'x.json' } } }] }, /`output` is a string, the schema file's name/],
    [{ steps: [{ ...plan, spec: { tools: ['Read', 3] } }] }, /`tools` is a list of strings/],
    [{ steps: [plan], readme: 42 }, /`readme` is the README's text, a string, or left out/],
    [
      { version: undefined, steps: [plan] },
      /takes the `version` the folder was read at, as GET \/api\/workflows lists it.*This request's was undefined/,
    ],
    [{ version: '', steps: [plan] }, /takes the `version` the folder was read at/],
    [{ version: 42, steps: [plan] }, /This request's was 42/],
    [{ steps: [plan], schemas: 'plan.schema.json' }, /`schemas` is the schemas to write beside the steps, a list, or left out for none/],
    [{ steps: [plan], schemas: [{ file: 'plan.schema.json' }] }, /schema 1 is \{"file":"plan\.schema\.json"\}, and a schema is/],
    [
      {
        steps: [plan],
        schemas: [
          { file: 'a.json', text: again },
          { file: 'a.json', text: again },
        ],
      },
      /a\.json is given twice/,
    ],
  ];
  for (const [body, said] of cases) {
    const res = await put('shaped', body);
    assert.equal(res.status, 400, JSON.stringify(body));
    const { error } = (await res.json()) as { error: string };
    assert.match(error, said, error);
    assert.ok(error.startsWith('PUT /api/workflows/yours/shaped'), error);
  }
  for (const [file, said] of [
    ['review.txt', /ends in \.json/],
    ['.hidden.json', /is hidden/],
    ['../x.json', /a slash names a file in another/],
    ['sub/x.json', /a slash/],
    ['.json', /is hidden/],
    ['tab\t.json', /control character/],
  ] as const) {
    const res = await put('shaped', { steps: [plan], schemas: [{ file, text: again }] });
    assert.equal(res.status, 400, `${file}: not a file directly in the folder`);
    assert.match(((await res.json()) as { error: string }).error, said, `${file}, in schemaNameRefusal's words`);
  }
  assert.deepEqual(snapshot(dir), before);
  assert.equal(fs.existsSync(path.join(STORE, 'x.json')), false);
});

test('REFUSED at shipped defaults: a put to a folder yours does not have is a 404 that says how to make one — a name only the repository has, a hidden folder, a name that climbs through an encoded slash (a URL resolves a bare `..` before the route) — and nothing is made', async () => {
  write(path.join(STORE, '.hidden', 'plan.md'), '---\nplace: git\n---\nPlan it.\n');
  const step = { name: 'plan', spec: spec(), body: 'Plan it.' };
  for (const name of ['nope', 'good', '.hidden', '..%2Fworkflows%2Fmine', '..%2F..%2Fworkflows']) {
    const res = await put(name, { steps: [step] });
    assert.equal(res.status, 404, name);
    const { error } = (await res.json()) as { error: string };
    assert.ok(
      error.startsWith(`No workflow '${decodeURIComponent(name)}' in ${STORE}.`) &&
        error.endsWith('To make a new one, POST /api/workflows/yours with its name and a first step.'),
      error,
    );
  }
  assert.equal(fs.existsSync(path.join(STORE, 'nope')), false);
  assert.equal(fs.existsSync(path.join(STORE, 'good')), false);
  assert.deepEqual(snapshot(path.join(STORE, '.hidden')), { 'plan.md': '---\nplace: git\n---\nPlan it.\n' });
});

test('POST /api/workflows/yours makes a folder with its first step, and a README when given one, answered read back from disk', async () => {
  const res = await post({
    name: 'fresh',
    step: { name: 'plan', spec: spec({ harness: 'codex', check: 'test -f PLAN.md' }), body: 'Write PLAN.md.' },
    readme: '# fresh\n\nA plan.\n',
  });
  assert.equal(res.status, 201, await res.clone().text());
  const saved = (await res.json()) as WorkflowSaved;
  const dir = path.join(STORE, 'fresh');
  assert.deepEqual(snapshot(dir), {
    'README.md': '# fresh\n\nA plan.\n',
    'plan.md': '---\nplace: git\nharness: codex\ncheck: test -f PLAN.md\n---\nWrite PLAN.md.\n',
  });
  assert.deepEqual(saved.written, ['README.md', 'plan.md']);
  assert.deepEqual(
    saved.workflow,
    (await listWorkflows(engine(), repo, root)).find((w) => w.name === 'fresh'),
  );
  assert.equal(saved.workflow.from, 'yours');
  assert.deepEqual(
    loadWorkflows(dir).map((s) => renderStep(s)),
    ['---\nplace: git\nharness: codex\ncheck: test -f PLAN.md\n---\nWrite PLAN.md.\n'],
    'the step as a start would read it',
  );

  const same = await post({ name: 'good', step: { name: 'implement', spec: spec(), body: 'Implement it.' } });
  assert.equal(
    same.status,
    201,
    `a name the repository has too is yours to make, and the board starts it with \`from\`: ${await same.clone().text()}`,
  );
  assert.deepEqual(snapshot(path.join(STORE, 'good')), { 'implement.md': '---\nplace: git\n---\nImplement it.\n' });
  fs.rmSync(path.join(STORE, 'good'), { recursive: true });
});

test("REFUSED at shipped defaults: a new folder whose name is not a folder's (400), one yours already has or a file has (409), and a first step the package refuses (422, naming it) — and nothing is made", async () => {
  planned('taken');
  write(path.join(STORE, 'NOTES.txt'), 'Ideas.\n');
  const listing = snapshot(STORE);
  const step = { name: 'plan', spec: spec(), body: 'Plan it.' };
  for (const [name, said] of [
    [undefined, /^A workflow has no name/],
    ['', /^A workflow has no name/],
    [42, /^A workflow has no name/],
    ['a/b', /a slash names a folder inside another/],
    ['..', /a folder whose name starts with a dot is hidden/],
    ['.hidden', /is hidden/],
    [' spaced ', /spaces around it/],
    ['tab\tbed', /control character/],
    ['x'.repeat(256), /255 bytes/],
    ['agents', /agents\/ is the folder of the agents the workflows beside it name/],
  ] as const) {
    const res = await post({ name, step });
    assert.equal(res.status, 400, String(name));
    assert.match(((await res.json()) as { error: string }).error, said, String(name));
  }
  const taken = await post({ name: 'taken', step });
  assert.equal(taken.status, 409);
  assert.equal(
    ((await taken.json()) as { error: string }).error,
    workflowTaken(path.join(STORE, 'taken'), versionOf(path.join(STORE, 'taken'))),
  );
  const file = await post({ name: 'NOTES.txt', step });
  assert.equal(file.status, 409);
  assert.equal(((await file.json()) as { error: string }).error, workflowTaken(path.join(STORE, 'NOTES.txt'), null));

  for (const [first, named] of [
    [{ name: 'plan', spec: spec(), body: '' }, ['plan']],
    [{ name: 'plan', spec: spec({ after: ['nope'] }), body: 'Plan it.' }, ['plan']],
    [{ name: 'plan', spec: spec({ gate: false as never }), body: 'Plan it.' }, ['plan']],
    [{ name: 'README', spec: spec(), body: 'Plan it.' }, ['README']],
  ] as const) {
    const res = await post({ name: 'unmade', step: first });
    assert.equal(res.status, 422, JSON.stringify(first));
    const { error, steps } = (await res.json()) as BuildRefused;
    assert.deepEqual(steps, named, error);
  }
  assert.equal((await post({ name: 'unmade', step: 'plan' })).status, 400);
  assert.equal((await post({ name: 'unmade', step, readme: ['#'] })).status, 400);
  assert.equal(fs.existsSync(path.join(STORE, 'unmade')), false, 'nothing made');
  assert.deepEqual(snapshot(STORE), listing);
});

test("REFUSED at shipped defaults: a new folder's body not in its shape is a 400 in the builder's words, word for word — not JSON, not an object, a step that is not one, a readme that is not text — and nothing is made", async () => {
  const route = 'POST /api/workflows/yours';
  const shape =
    '`{ "name": "<workflow>", "step": <step>, "readme"?: "<README.md>" }`, the step `{ "name": "<step>", "spec": { "after": ["<step>"], "harness": "claude", … }, "body": "<what its agent is told>", "own"?: { "keys": ["<key>", …], "body": "<its own note>" } }`, as GET /api/workflows lists a step, a key unset as null or left out';
  const step = { name: 'plan', spec: spec(), body: 'Plan it.' };
  for (const [body, said] of [
    ['not json', `${route} takes a JSON body: ${shape}.`],
    [[], `${route} takes a JSON object: ${shape}.`],
    [null, `${route} takes a JSON object: ${shape}.`],
    [{ name: 'unmade', step: 'plan' }, `${route}: \`step\` is "plan", and a step is an object. Send ${shape}.`],
    [
      { name: 'unmade', step: { ...step, name: 7 } },
      `${route}: \`step\` has no \`name\`: a step is named by its file, without .md. Send ${shape}.`,
    ],
    [
      { name: 'unmade', step: { name: 'plan', spec: spec() } },
      `${route}: \`step\` (plan) has no \`body\`, what its agent is told, as a string. Send ${shape}.`,
    ],
    [
      { name: 'unmade', step: { ...step, spec: null } },
      `${route}: \`step\` (plan)'s \`spec\` is null, and it is an object of the step's keys. Send ${shape}.`,
    ],
    [
      { name: 'unmade', step, readme: ['#'] },
      `${route}: \`readme\` is the README's text, a string, or left out to leave it as it is — this request's was ["#"]. Send ${shape}.`,
    ],
  ] as const) {
    const res = await post(body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(((await res.json()) as { error: string }).error, said);
  }
  assert.equal(fs.existsSync(path.join(STORE, 'unmade')), false, 'nothing made');
});

test("REFUSED at shipped defaults: a schema that is not `{ file, text }` is refused as one before its file's name is read — and nothing is written", async () => {
  const dir = planned('schema-order');
  const before = snapshot(dir);
  const [plan] = (await listedSteps('schema-order')) as [ListedStep];
  const res = await put('schema-order', { steps: [plan], schemas: [{ file: 'review.txt', text: 3 }] });
  assert.equal(res.status, 400);
  assert.match(((await res.json()) as { error: string }).error, /: schema 1 is \{"file":"review\.txt","text":3\}, and a schema is/);
  assert.deepEqual(snapshot(dir), before);
});

const risks = JSON.stringify(
  { type: 'object', properties: { risks: { type: 'array', items: { type: 'string' } } }, required: ['risks'], additionalProperties: false },
  null,
  2,
);

test('PUT /api/workflows/yours/:name writes the schemas pasted for it beside the steps, then the steps that name them — a new schema, and one replaced — and says which it wrote', async () => {
  const dir = planned('schemed');
  const [plan, build] = (await listedSteps('schemed')) as [ListedStep, ListedStep];
  const res = await put('schemed', {
    steps: [
      { ...plan, spec: { ...plan.spec, output: 'plan.schema.json' } },
      { ...build, spec: { ...build.spec, input: ['plan'] } },
    ],
    schemas: [{ file: 'plan.schema.json', text: risks }],
  });
  assert.equal(res.status, 200, await res.clone().text());
  const saved = (await res.json()) as WorkflowSaved;
  assert.deepEqual([saved.written, saved.kept, saved.removed], [['build.md', 'plan.md', 'plan.schema.json'], [], []]);
  assert.equal(fs.readFileSync(path.join(dir, 'plan.schema.json'), 'utf8'), `${risks}\n`, 'written ending in a line break');
  assert.deepEqual(
    saved.workflow.steps.map((s) => [s.name, s.spec.output, s.spec.input]),
    [
      ['plan', 'plan.schema.json', []],
      ['build', null, ['plan']],
    ],
  );
  assert.deepEqual(saved.workflow.schemas, ['build.schema.json', 'plan.schema.json']);
  assert.equal(saved.workflow.version, versionOf(dir), 'at the version the folder is at now, for the next save');

  const steps = saved.workflow.steps;
  const same = await put('schemed', { steps, schemas: [{ file: 'plan.schema.json', text: `${risks}\n` }] });
  assert.deepEqual(
    (({ written, kept }) => [written, kept])((await same.json()) as WorkflowSaved),
    [[], ['build.md', 'plan.md', 'plan.schema.json']],
    'the same text again is kept',
  );
  const wider = risks.replace('"risks"', '"notes"').replace('"risks"', '"notes"');
  const replaced = await put('schemed', { steps, schemas: [{ file: 'plan.schema.json', text: wider }] });
  assert.equal(replaced.status, 200, await replaced.clone().text());
  assert.deepEqual(((await replaced.json()) as WorkflowSaved).written, ['plan.schema.json'], 'another text replaces the file');
  assert.equal(fs.readFileSync(path.join(dir, 'plan.schema.json'), 'utf8'), `${wider}\n`);
});

test("REFUSED at shipped defaults: a pasted schema is judged with the steps before a byte of either is written — not JSON, not an object, not strict, a loop's schema without `again`, and a schema beside steps refused for something else, a cycle or a name — 422 or the package's refusal, naming the steps, and no schema written or replaced", async () => {
  const dir = path.join(STORE, 'pasted');
  write(path.join(dir, 'implement.md'), '---\nplace: git\n---\nImplement it.\n');
  write(path.join(dir, 'review.md'), '---\nafter: implement\nplace: git\noutput: review.schema.json\nloop: implement\n---\nReview it.\n');
  write(path.join(dir, 'review.schema.json'), again);
  const before = snapshot(dir);
  const [implement, review] = (await listedSteps('pasted')) as [ListedStep, ListedStep];
  const outputOf = (step: ListedStep, file: string): ListedStep => ({ ...step, spec: { ...step.spec, output: file } });
  const loose = JSON.stringify({ type: 'object', properties: { notes: { type: 'string' } } });
  const without = JSON.stringify({
    type: 'object',
    properties: { notes: { type: 'string' } },
    required: ['notes'],
    additionalProperties: false,
  });

  const cases: Array<[string, unknown, RegExp | string, string[], number]> = [
    [
      'not JSON',
      { steps: [outputOf(implement, 'implement.schema.json'), review], schemas: [{ file: 'implement.schema.json', text: '{ "type": ' }] },
      /^implement\.schema\.json is not JSON \(.+\)\. A schema is a JSON object/,
      ['implement'],
      422,
    ],
    [
      'not an object',
      { steps: [outputOf(implement, 'implement.schema.json'), review], schemas: [{ file: 'implement.schema.json', text: '["again"]' }] },
      /^implement\.schema\.json is \["again"\], and a schema is a JSON object/,
      ['implement'],
      422,
    ],
    [
      'not strict, for an output no step on disk names yet',
      { steps: [outputOf(implement, 'implement.schema.json'), review], schemas: [{ file: 'implement.schema.json', text: loose }] },
      /^implement: `output: implement\.schema\.json` is not strict at /,
      ['implement'],
      422,
    ],
    [
      "a loop's schema replaced without `again`",
      { steps: [implement, review], schemas: [{ file: 'review.schema.json', text: without }] },
      'review: `loop: implement` runs implement again when this step\'s closeout says `again: true`, and `output: review.schema.json` does not declare `again`. Declare it — `"again": { "type": "boolean" }`, listed in `required` — so the run reads a yes or a no, never prose.',
      ['review'],
      422,
    ],
    [
      'a good schema beside a cycle',
      {
        steps: [{ ...implement, spec: { ...implement.spec, after: ['review'] } }, review],
        schemas: [
          { file: 'review.schema.json', text: `${again}\n\n` },
          { file: 'x.schema.json', text: risks },
        ],
      },
      'these steps wait on each other: implement, review',
      ['implement', 'review'],
      422,
    ],
    [
      'a good schema beside a name refused, and a cycle: the name refused first, as writeWorkflow refuses it, and no schema judged ahead of it',
      {
        steps: [
          { ...implement, spec: { ...implement.spec, after: ['review/it'] } },
          { ...review, name: 'review/it' },
        ],
        schemas: [{ file: 'x.schema.json', text: risks }],
      },
      /^`review\/it` is not a step's name: a step is a file in its workflow's folder/,
      ['review/it'],
      422,
    ],
  ];
  for (const [what, body, said, named, status] of cases) {
    const res = await put('pasted', body);
    assert.equal(res.status, status, `${what}: ${await res.clone().text()}`);
    const { error, steps } = (await res.json()) as BuildRefused;
    if (typeof said === 'string') assert.equal(error, said, what);
    else assert.match(error, said, `${what}: ${error}`);
    assert.deepEqual(steps, named, `${what}: ${error}`);
    assert.deepEqual(snapshot(dir), before, `${what}: no schema written or replaced, and no step`);
  }
});

test('REFUSED at shipped defaults: a save of a folder that changed since it was read — a step edited, added or removed by hand, a schema or the README edited — is a 409 that says to read it again, and nothing is written over the change', async () => {
  const dir = planned('edited');
  write(path.join(dir, 'README.md'), '# edited\n');
  const [plan, build] = (await listedSteps('edited')) as [ListedStep, ListedStep];
  const read = versionOf(dir);
  const draft = { version: read, steps: [plan, { ...build, spec: { ...build.spec, retries: 2 } }] };
  const handEdits: Array<[string, () => void, () => void]> = [
    [
      'plan.md edited',
      () => write(path.join(dir, 'plan.md'), '---\nplace: git\nharness: claude\ncheck: test -f PLAN.md\n---\nWrite PLAN.md.\n'),
      () => write(path.join(dir, 'plan.md'), '---\nplace: git\n# Plans first.\nharness: claude\n---\nWrite PLAN.md.\n'),
    ],
    [
      'ship.md added',
      () => write(path.join(dir, 'ship.md'), '---\nafter: build\nplace: git\n---\nShip it.\n'),
      () => fs.rmSync(path.join(dir, 'ship.md')),
    ],
    [
      'build.md removed',
      () => fs.rmSync(path.join(dir, 'build.md')),
      () => write(path.join(dir, 'build.md'), '---\nafter: plan\nplace: git\ncheck: npm test\n---\nBuild what PLAN.md says.\n'),
    ],
    [
      'a schema edited',
      () => write(path.join(dir, 'build.schema.json'), `${again}\n`),
      () => write(path.join(dir, 'build.schema.json'), again),
    ],
    [
      'the README edited',
      () => write(path.join(dir, 'README.md'), '# edited, by hand\n'),
      () => write(path.join(dir, 'README.md'), '# edited\n'),
    ],
    [
      '.draft.md added, hidden and a step all the same, which a save without it would remove',
      () => write(path.join(dir, '.draft.md'), '---\nplace: git\n---\nDraft.\n'),
      () => fs.rmSync(path.join(dir, '.draft.md')),
    ],
    [
      '.shared.schema.json added, a hidden schema an `output:` may name and a save then reads',
      () => write(path.join(dir, '.shared.schema.json'), again),
      () => fs.rmSync(path.join(dir, '.shared.schema.json')),
    ],
  ];
  for (const [what, edit, undo] of handEdits) {
    edit();
    const edited = snapshot(dir);
    const now = versionOf(dir);
    assert.notEqual(now, read, `${what}: the folder's version moves`);
    const res = await put('edited', draft);
    assert.equal(res.status, 409, `${what}: ${await res.clone().text()}`);
    const { error, steps } = (await res.json()) as BuildRefused;
    assert.equal(
      error,
      `${dir} has changed since it was read at version ${read}: a step, the README or a schema there was edited, added or removed, and this save would write over it. Nothing was written. Read the folder again (it is at version ${now}), make the change on what it holds now, and save that.`,
      what,
    );
    assert.deepEqual(steps, []);
    assert.deepEqual(snapshot(dir), edited, `${what}: the hand edit is kept, and nothing else written`);
    undo();
    assert.equal(versionOf(dir), read, `${what}: undone, the folder is at the version it was read at again`);
  }

  write(path.join(dir, 'NOTES.txt'), 'Ideas.\n');
  write(path.join(dir, '.notes.txt'), 'Ideas.\n');
  write(path.join(dir, 'sub', 'x.md'), '---\nplace: git\n---\nNot a step.\n');
  assert.equal(
    versionOf(dir),
    read,
    'what is no step and no schema moves nothing: a note beside the steps, a hidden one, a folder inside it',
  );

  const taken = await put('edited', draft);
  assert.equal(taken.status, 200, `read at the version it is at, the save is taken: ${await taken.clone().text()}`);
  assert.match(fs.readFileSync(path.join(dir, 'build.md'), 'utf8'), /^retries: 2$/m);
  for (const kept of ['NOTES.txt', '.notes.txt', 'sub/x.md'])
    assert.ok(fs.existsSync(path.join(dir, kept)), `the save leaves ${kept}, which it did not count, where it was`);
  const again409 = await put('edited', { ...draft, steps: [plan, build] });
  assert.equal(again409.status, 409, 'a second save from the same read is refused: the first one changed the folder');
  assert.match(fs.readFileSync(path.join(dir, 'build.md'), 'utf8'), /^retries: 2$/m, 'and the first save stands');
});

test('a write the package does not refuse but the disk does puts each pasted schema back as it was: a step file that is a folder', async () => {
  const dir = path.join(STORE, 'blocked');
  write(path.join(dir, 'build.md'), '---\nplace: git\n---\nBuild it.\n');
  fs.mkdirSync(path.join(dir, 'plan.md'));
  write(path.join(dir, 'kept.schema.json'), again);
  const before = snapshot(dir);
  const res = await put('blocked', {
    steps: [
      { name: 'plan', spec: spec({ output: 'new.schema.json' }), body: 'Plan it.' },
      { name: 'build', spec: spec({ output: 'kept.schema.json' }), body: 'Build it.' },
    ],
    schemas: [
      { file: 'new.schema.json', text: risks },
      { file: 'kept.schema.json', text: risks },
    ],
  });
  assert.equal(res.status, 500, await res.clone().text());
  assert.match(((await res.json()) as { error: string }).error, /EISDIR/);
  assert.deepEqual(snapshot(dir), before, 'the new schema removed, the replaced one written back');
});

test(
  'a pasted schema the disk refuses at the open puts back every schema written before it: one of two read-only',
  { skip: process.getuid?.() === 0 ? 'root writes a read-only file all the same' : false },
  async () => {
    const dir = path.join(STORE, 'read-only');
    write(path.join(dir, 'plan.md'), '---\nplace: git\n---\nPlan it.\n');
    write(path.join(dir, 'build.md'), '---\nafter: plan\nplace: git\n---\nBuild it.\n');
    write(path.join(dir, 'kept.schema.json'), again);
    fs.chmodSync(path.join(dir, 'kept.schema.json'), 0o444);
    const before = snapshot(dir);
    try {
      const res = await put('read-only', {
        steps: [
          { name: 'plan', spec: spec({ output: 'new.schema.json' }), body: 'Plan it.' },
          { name: 'build', spec: spec({ after: ['plan'], output: 'kept.schema.json' }), body: 'Build it.' },
        ],
        schemas: [
          { file: 'new.schema.json', text: risks },
          { file: 'kept.schema.json', text: risks },
        ],
      });
      assert.equal(res.status, 500, await res.clone().text());
      assert.match(((await res.json()) as { error: string }).error, /EACCES/);
      assert.deepEqual(
        snapshot(dir),
        before,
        'new.schema.json, written before kept.schema.json was refused, removed as a refusal of the folder removes it; the read-only one as it was; and no step written',
      );
    } finally {
      fs.chmodSync(path.join(dir, 'kept.schema.json'), 0o644);
    }
  },
);

test(
  'putSchemasBack: a schema a write truncated after its open is put back — fs.writeFileSync truncates first, and a write that then failed (the disk full) is nothing the save can tell from which writes returned — one the write never opened is left alone — a read-only file, which writing back would refuse in turn — and one the save made is removed',
  { skip: process.getuid?.() === 0 ? 'root writes a read-only file all the same' : false },
  () => {
    const dir = path.join(STORE, 'put-back');
    write(path.join(dir, 'cut.schema.json'), again);
    write(path.join(dir, 'locked.schema.json'), again);
    fs.chmodSync(path.join(dir, 'locked.schema.json'), 0o444);
    write(path.join(dir, 'made.schema.json'), risks);
    fs.writeFileSync(path.join(dir, 'cut.schema.json'), '{ "type": ');
    try {
      putSchemasBack(dir, [
        { file: 'cut.schema.json', was: again },
        { file: 'locked.schema.json', was: again },
        { file: 'made.schema.json', was: undefined },
      ]);
      assert.deepEqual(
        snapshot(dir),
        { 'cut.schema.json': again, 'locked.schema.json': again },
        'the truncated schema back as it was, the read-only one untouched, the new one gone',
      );
    } finally {
      fs.chmodSync(path.join(dir, 'locked.schema.json'), 0o644);
    }
  },
);

test("stepsNamed: the steps a refusal names — a cycle's several, a name refused or given twice, and the step a refusal opens on, the longest name first", () => {
  const names = ['review', 'review-2', 'plan', 'a/b'];
  assert.deepEqual(stepsNamed('these steps wait on each other: plan, review', names), ['plan', 'review']);
  assert.deepEqual(stepsNamed('review-2: waits on "x", which is not a step here', names), ['review-2']);
  assert.deepEqual(stepsNamed('review: waits on "x", which is not a step here', names), ['review']);
  assert.deepEqual(stepsNamed("review is in two loops: a's and b's.", names), ['review']);
  assert.deepEqual(
    stepsNamed(
      "`a/b` is not a step's name: a step is a file in its workflow's folder, and a slash names a file in another. Name it as its file is named, without .md — implement, say.",
      names,
    ),
    ['a/b'],
  );
  assert.deepEqual(stepsNamed('two steps are named plan, and a step is its file, plan.md. Rename one of them.', names), ['plan']);
  assert.deepEqual(stepsNamed('no steps to write to /x, and a workflow has at least one.', names), []);
  assert.deepEqual(stepsNamed('planning: something', names), []);
});
