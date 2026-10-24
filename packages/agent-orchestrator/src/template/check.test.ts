/**
 * `checkTemplate` on folders held in memory: draft 3's example package `software-team/`, without its imports, lock and fetched file, and
 * its architect an agent of its own, passes; each rule is made to refuse by a fixture that breaks it, and its words name where.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { HARNESS_KNOBS } from 'agent-runtime/vocabulary';
import { checkTemplate } from './check.ts';
import type { Refusal } from './layout.ts';

/** A document of `kind` named `name`, holding `spec`. */
const doc = (kind: string, name: string, spec: Record<string, unknown>) => ({
  apiVersion: 'nemia.dev/v1alpha1',
  kind,
  metadata: { name },
  spec,
});

/** Draft 3's `software-team/`, its documents by file: no imports, no lock, no fetch, and seldon and grilling carried in the folder. */
const documents = (): Record<string, any> => ({
  'nemia.yaml': {
    ...doc('FactoryTemplate', 'software-team', {
      version: '1.0.0',
      parameters: { check: { type: 'string', description: 'The command that proves the work.', default: 'npm test && npm run lint' } },
      hires: { 'build/design': 'seldon', 'build/implement': 'ada', 'build/review': 'agora', 'build/land': 'otto' },
    }),
    metadata: { name: 'software-team', description: 'Builds accepted intents into reviewed code on main.' },
  },
  'agents/ada/agent.yaml': doc('Agent', 'ada', {
    role: 'Software engineer',
    description: 'Builds the change a spec describes, with the tests that prove it.',
    skills: ['implement-a-change', 'grilling'],
    harness: 'claude',
    claude: {
      model: 'opus',
      effort: 'high',
      fence: { permissionMode: 'auto', disallowedTools: ['Bash(git push:*)', 'Bash(pkill:*)'] },
      options: { maxTurns: 60 },
    },
    codex: { model: 'gpt-5-codex', effort: 'high', fence: { sandbox: 'workspace-write' } },
  }),
  'agents/agora/agent.yaml': doc('Agent', 'agora', {
    role: 'Code reviewer',
    description: 'Reviews a change as a second engineer would.',
    skills: ['review-a-change'],
    claude: {
      model: 'opus',
      effort: 'high',
      fence: { permissionMode: 'dontAsk', allowedTools: ['Read', 'Grep'], disallowedTools: ['Edit', 'Write'] },
    },
    codex: { fence: { sandbox: 'read-only' } },
  }),
  'agents/otto/agent.yaml': doc('Agent', 'otto', {
    role: 'Release engineer',
    description: "Lands a run's result on the base branch once a person approves it.",
    skills: ['land-a-branch'],
    claude: { model: 'sonnet', effort: 'medium', fence: { permissionMode: 'dontAsk', disallowedTools: ['Bash(git push:*)'] } },
  }),
  'agents/seldon/agent.yaml': doc('Agent', 'seldon', {
    role: 'Software architect',
    description: 'Turns an accepted intent into a spec.',
    skills: ['write-a-spec'],
  }),
  'workflows/build/workflow.yaml': {
    ...doc('Workflow', 'build', {
      steps: [
        { name: 'design', gate: true, budget: 4 },
        {
          name: 'implement',
          after: ['design'],
          input: ['design'],
          place: 'git',
          budget: 40,
          check: { param: 'check' },
          overrides: { skills: ['change-the-board'], claude: { fence: { disallowedTools: ['Bash(npm publish:*)'] } } },
        },
        { name: 'review', after: ['implement'], loop: 'implement', rounds: 3, budget: 16, overrides: { claude: { model: 'sonnet' } } },
        { name: 'land', after: ['review'], workspace: 'main', gate: true, check: { param: 'check' } },
      ],
    }),
    metadata: { name: 'build', description: 'An accepted intent to main: design → implement ⇄ review → land.' },
  },
});

/** The files of `software-team/` that are no document. */
const OTHER_FILES = [
  'NEMIA.md',
  'agents/ada/instructions.md',
  'agents/ada/output.schema.json',
  'agents/agora/instructions.md',
  'agents/otto/instructions.md',
  'skills/change-the-board/SKILL.md',
  'skills/grilling/SKILL.md',
  'skills/implement-a-change/SKILL.md',
  'skills/implement-a-change/scripts/coverage.ts',
  'skills/land-a-branch/SKILL.md',
  'skills/review-a-change/SKILL.md',
  'skills/write-a-spec/SKILL.md',
  'workflows/build/design.md',
  'workflows/build/implement.md',
  'workflows/build/land.md',
  'workflows/build/review.md',
];

/** The refusals of `software-team/` once `edit` has changed its documents and `files` its other files; `placeSkills` are shipped. */
function refusalsOf(
  edit: (docs: Record<string, any>) => void = () => {},
  files: (others: string[]) => string[] = (others) => others,
  placeSkills: readonly string[] = ['git'],
): Refusal[] {
  const docs = documents();
  edit(docs);
  return checkTemplate(
    { name: 'software-team', files: [...Object.keys(docs), ...files([...OTHER_FILES])].sort(), documents: new Map(Object.entries(docs)) },
    placeSkills,
  );
}

/** Whether `refusals` hold one in `file` at `at` whose words include `words`. */
const refuses = (refusals: Refusal[], file: string, at: ReadonlyArray<string | number>, words: string): boolean =>
  refusals.some((r) => r.file === file && JSON.stringify(r.at) === JSON.stringify(at) && r.message.includes(words));

/** Asserts `refusals` hold the one described, printing them all when they do not. */
function assertRefused(refusals: Refusal[], file: string, at: ReadonlyArray<string | number>, words: string): void {
  assert.ok(
    refuses(refusals, file, at, words),
    `no refusal in ${file} at ${JSON.stringify(at)} saying "${words}":\n${JSON.stringify(refusals, null, 1)}`,
  );
}

/** A harness the runtime fences by a word and its tool lists, and one fenced by a word alone, as the runtime gives them. */
const LISTED = Object.keys(HARNESS_KNOBS).find((h) => HARNESS_KNOBS[h].fence.lists.length > 0)!;
const WORDED = Object.keys(HARNESS_KNOBS).find((h) => HARNESS_KNOBS[h].fence.lists.length === 0)!;
const AGENT = 'agents/ada/agent.yaml';

test("draft 3's software-team, carried whole in its folder, passes", () => {
  assert.deepEqual(refusalsOf(), []);
});

test('a file outside the layout is refused by name, and so is a folder without its file', () => {
  const refusals = refusalsOf(undefined, (others) => [...others, 'agents/ada/extra.yaml', 'notes.txt', 'agents/seldon.md']);
  for (const file of ['agents/ada/extra.yaml', 'notes.txt', 'agents/seldon.md']) assertRefused(refusals, file, [], 'outside the template');
  assertRefused(
    refusalsOf(undefined, (others) => others.filter((f) => f !== 'skills/grilling/SKILL.md').concat('skills/grilling/x.sh')),
    'skills/grilling',
    [],
    'holds no SKILL.md',
  );
  assertRefused(
    refusalsOf((docs) => delete docs['nemia.yaml']),
    'nemia.yaml',
    [],
    'has no nemia.yaml',
  );
});

test("RULES.md at the root is a file of the layout, the factory's rules; another .md there, or RULES.md further down, is outside it", () => {
  assert.deepEqual(
    refusalsOf(undefined, (others) => [...others, 'RULES.md']),
    [],
  );
  const refusals = refusalsOf(undefined, (others) => [...others, 'POLICY.md', 'agents/RULES.md']);
  assertRefused(refusals, 'POLICY.md', [], 'A template holds nemia.yaml, NEMIA.md, RULES.md and nemia.lock.yaml at its root');
  assertRefused(refusals, 'agents/RULES.md', [], 'outside the template');
  assert.deepEqual(
    refusalsOf((docs) => (docs['nemia.yaml'].spec.rules = 'Never push on a Friday.')),
    [],
    'the manifest may hold them instead',
  );
});

test("a workflow's README and its files that are no .md or .yaml are carried, and a .md that names no step is refused", () => {
  assert.deepEqual(
    refusalsOf(undefined, (others) => [...others, 'workflows/build/README.md', 'workflows/build/coverage.ts']),
    [],
  );
  assertRefused(
    refusalsOf(undefined, (others) => [...others, 'workflows/build/notes.md']),
    'workflows/build/notes.md',
    [],
    'names no step',
  );
  assertRefused(
    refusalsOf(undefined, (others) => [...others, 'workflows/build/extra.yaml']),
    'workflows/build/extra.yaml',
    [],
    'outside',
  );
});

test("a document's apiVersion, kind and name are refused when wrong, and a key it has no place for", () => {
  assertRefused(
    refusalsOf((d) => (d[AGENT].apiVersion = 'nemia.dev/v1')),
    AGENT,
    ['apiVersion'],
    'write nemia.dev/v1alpha1',
  );
  const workflow = 'workflows/build/workflow.yaml';
  assertRefused(
    refusalsOf((d) => (d[workflow].kind = 'Agent')),
    workflow,
    ['kind'],
    'write kind: Workflow',
  );
  assertRefused(
    refusalsOf((d) => (d[AGENT].metadata.name = 'other')),
    AGENT,
    ['metadata', 'name'],
    'write ada',
  );
  assertRefused(
    refusalsOf((d) => (d['nemia.yaml'].metadata.name = 'team')),
    'nemia.yaml',
    ['metadata', 'name'],
    'write software-team',
  );
  assertRefused(
    refusalsOf((d) => (d[AGENT].spec.agent = 'x')),
    AGENT,
    ['spec', 'agent'],
    'no key of spec',
  );
  assertRefused(
    refusalsOf((d) => (d[workflow].spec.steps[0].budget = 'four')),
    workflow,
    ['spec', 'steps', 0, 'budget'],
    'a number or {param',
  );
  assertRefused(
    refusalsOf((d) => (d[workflow].spec.steps[0].rounds = '3')),
    workflow,
    ['spec', 'steps', 0, 'rounds'],
    'a number',
  );
  assertRefused(
    refusalsOf((d) => (d['nemia.yaml'].spec.revisions = 'always')),
    'nemia.yaml',
    ['spec', 'revisions'],
    'follow or pinned',
  );
  assertRefused(
    refusalsOf((d) => delete d[AGENT].spec.role),
    AGENT,
    ['spec'],
    'no `role`',
  );
});

test('a hire naming no workflow, no step or no agent is refused', () => {
  const hire = (key: string, agent: string) => refusalsOf((d) => (d['nemia.yaml'].spec.hires[key] = agent));
  assertRefused(hire('build/nope', 'ada'), 'nemia.yaml', ['spec', 'hires', 'build/nope'], 'names no step of build');
  assertRefused(hire('nope/design', 'ada'), 'nemia.yaml', ['spec', 'hires', 'nope/design'], 'names no workflow');
  assertRefused(hire('build/design', 'nobody'), 'nemia.yaml', ['spec', 'hires', 'build/design'], 'no agent of agents/');
});

test("a skill the folder lacks is refused, an agent's or a step's, and a place skill nemia ships is present", () => {
  assertRefused(
    refusalsOf((d) => d[AGENT].spec.skills.push('nope')),
    AGENT,
    ['spec', 'skills', 2],
    'skill nope is not in skills/',
  );
  const workflow = 'workflows/build/workflow.yaml';
  const at = ['spec', 'steps', 1, 'overrides', 'skills', 1];
  assertRefused(
    refusalsOf((d) => d[workflow].spec.steps[1].overrides.skills.push('nope')),
    workflow,
    at,
    'skill nope',
  );
  assert.deepEqual(
    refusalsOf((d) => {
      d[AGENT].spec.skills.push('app:y');
      d[workflow].spec.steps[1].overrides.skills.push('apps/web:ds-build');
    }),
    [],
    'named with its folder: named, never carried',
  );

  assertRefused(
    refusalsOf((d) => d[AGENT].spec.skills.push('App:Y')),
    AGENT,
    ['spec', 'skills', 2],
    'skill App:Y is not in skills/',
  );
  assertRefused(
    refusalsOf((d) => d[AGENT].spec.skills.push('../app:y')),
    AGENT,
    ['spec', 'skills', 2],
    'skill ../app:y is not in skills/',
  );
  assert.deepEqual(
    refusalsOf((d) => d[AGENT].spec.skills.push('git')),
    [],
  );
  assertRefused(
    refusalsOf((d) => d[AGENT].spec.skills.push('git'), undefined, []),
    AGENT,
    ['spec', 'skills', 2],
    'skill git',
  );
});

test('after:, input: and loop: naming no sibling step are refused, and a step named twice', () => {
  const workflow = 'workflows/build/workflow.yaml';
  const step = (edit: (s: any) => void) => refusalsOf((d) => edit(d[workflow].spec.steps[2]));
  assertRefused(
    step((s) => (s.after = ['nope'])),
    workflow,
    ['spec', 'steps', 2, 'after', 0],
    'no other step',
  );
  assertRefused(
    step((s) => (s.input = ['nope'])),
    workflow,
    ['spec', 'steps', 2, 'input', 0],
    'no other step',
  );
  assertRefused(
    step((s) => (s.loop = 'nope')),
    workflow,
    ['spec', 'steps', 2, 'loop'],
    'no other step',
  );
  assertRefused(
    step((s) => (s.loop = 'review')),
    workflow,
    ['spec', 'steps', 2, 'loop'],
    'no other step',
  );
  assertRefused(
    step((s) => (s.name = 'design')),
    workflow,
    ['spec', 'steps', 2, 'name'],
    'named twice',
  );
});

test("a step's place, workspace, reads and tally are today's words", () => {
  const workflow = 'workflows/build/workflow.yaml';
  const step = (edit: (s: any) => void) => refusalsOf((d) => edit(d[workflow].spec.steps[0]));
  assert.deepEqual(
    step((s) => Object.assign(s, { reads: ['costs'], tally: ['findings', 'findings.kind=placement', 'findings.fixed'] })),
    [],
  );
  assertRefused(
    step((s) => (s.reads = ['secrets'])),
    workflow,
    ['spec', 'steps', 0, 'reads', 0],
    'reads is one of',
  );
  assertRefused(
    step((s) => (s.tally = ['a.b.c'])),
    workflow,
    ['spec', 'steps', 0, 'tally', 0],
    'none of a field',
  );
  assertRefused(
    step((s) => (s.workspace = 'home')),
    workflow,
    ['spec', 'steps', 0, 'workspace'],
    'workspace is one of',
  );
  assertRefused(
    step((s) => (s.place = 'cloud')),
    workflow,
    ['spec', 'steps', 0, 'place'],
    'place is one of',
  );
});

test('a {param:} nemia.yaml does not declare is refused, a budget or a check, and a declared one passes', () => {
  const workflow = 'workflows/build/workflow.yaml';
  const at = (i: number, key: string) => ['spec', 'steps', i, key];
  assertRefused(
    refusalsOf((d) => (d[workflow].spec.steps[0].budget = { param: 'missing' })),
    workflow,
    at(0, 'budget'),
    'parameter missing',
  );
  assertRefused(
    refusalsOf((d) => (d[workflow].spec.steps[1].check = { param: 'missing' })),
    workflow,
    at(1, 'check'),
    'parameter missing',
  );
  const declared = (d: Record<string, any>) => {
    d['nemia.yaml'].spec.parameters.spend = { type: 'number', description: 'Dollars a try.' };
    d[workflow].spec.steps[0].budget = { param: 'spend' };
  };
  assert.deepEqual(refusalsOf(declared), []);
});

test("an effort, a fence key or word, a context and an option the harness lacks are refused, through the runtime's knobs", () => {
  const block = (harness: string, profile: Record<string, unknown>) => refusalsOf((d) => (d[AGENT].spec[harness] = profile));
  const at = (harness: string, ...rest: string[]) => ['spec', harness, ...rest];
  assertRefused(block(LISTED, { effort: 'enormous' }), AGENT, at(LISTED, 'effort'), `no effort ${LISTED} knows`);
  const listedKey = HARNESS_KNOBS[LISTED].fence.key;
  const wordedKey = HARNESS_KNOBS[WORDED].fence.key;
  assertRefused(
    block(LISTED, { fence: { [wordedKey]: HARNESS_KNOBS[WORDED].fence.words[0] } }),
    AGENT,
    at(LISTED, 'fence', wordedKey),
    "another harness's fence key",
  );
  assertRefused(
    block(WORDED, { fence: { [listedKey]: HARNESS_KNOBS[LISTED].fence.words[0] } }),
    AGENT,
    at(WORDED, 'fence', listedKey),
    "another harness's fence key",
  );
  assertRefused(block(WORDED, { fence: { tools: ['Read'] } }), AGENT, at(WORDED, 'fence', 'tools'), "another harness's fence key");
  assertRefused(block(LISTED, { fence: { [listedKey]: 'everything' } }), AGENT, at(LISTED, 'fence', listedKey), 'no word');
  const contextless = Object.keys(HARNESS_KNOBS).find((h) => !HARNESS_KNOBS[h].context)!;
  assertRefused(block(contextless, { context: '200k' }), AGENT, at(contextless, 'context'), 'takes no context window');
  assert.deepEqual(block(LISTED, { context: '200k', effort: HARNESS_KNOBS[LISTED].effort[0] }), []);
});

test('an option that is a fence key, a key of the block, a flag the runtime owns, or one an `only` harness does not read is refused', () => {
  const options = (harness: string, opts: Record<string, unknown>) => refusalsOf((d) => (d[AGENT].spec[harness] = { options: opts }));
  const at = (harness: string, key: string) => ['spec', harness, 'options', key];
  const listedKey = HARNESS_KNOBS[LISTED].fence.key;
  assertRefused(options(LISTED, { [listedKey]: 'x' }), AGENT, at(LISTED, listedKey), 'is a fence key');
  assertRefused(options(LISTED, { model: 'x' }), AGENT, at(LISTED, 'model'), 'a key of the block');
  const flags = HARNESS_KNOBS[LISTED].flags;
  const owned = 'owned' in flags ? flags.owned.find((f) => f === 'print')! : 'print';
  assertRefused(options(LISTED, { [owned]: true }), AGENT, at(LISTED, owned), 'the runtime sets itself');
  assert.deepEqual(options(LISTED, { maxTurns: 60 }), []);
  const only = Object.keys(HARNESS_KNOBS).find((h) => 'only' in HARNESS_KNOBS[h].flags)!;
  const read = HARNESS_KNOBS[only].flags as { only: readonly string[] };
  assertRefused(options(only, { maxTurns: 60 }), AGENT, at(only, 'maxTurns'), `reads only ${read.only.join(', ')}`);
  assert.deepEqual(options(only, { [read.only[0]]: '/repo' }), []);
});

test('a block named for no harness is refused, and so is a harness that is none', () => {
  assertRefused(
    refusalsOf((d) => (d[AGENT].spec.gemini = { model: 'x' })),
    AGENT,
    ['spec', 'gemini'],
    'no key of spec',
  );
  assertRefused(
    refusalsOf((d) => (d[AGENT].spec.harness = 'gemini')),
    AGENT,
    ['spec', 'harness'],
    'is no harness',
  );
});

test('an a2a: agent carrying a block is refused, and a step overriding onto one with a block', () => {
  const remote = refusalsOf((d) => (d[AGENT].spec.harness = 'a2a:remote'));
  assertRefused(remote, AGENT, ['spec', LISTED], 'a remote agent picks its own model');
  const bare = refusalsOf((d) => {
    d[AGENT].spec = { role: 'r', description: 'd', harness: 'a2a:remote', skills: ['implement-a-change'] };
    d['workflows/build/workflow.yaml'].spec.steps[1].overrides = { skills: ['change-the-board'] };
  });
  assert.deepEqual(bare, []);
  const workflow = 'workflows/build/workflow.yaml';
  const step = refusalsOf((d) => (d[workflow].spec.steps[2].overrides = { harness: 'a2a:remote', [LISTED]: { model: 'x' } }));
  assertRefused(step, workflow, ['spec', 'steps', 2, 'overrides', LISTED], 'a remote agent picks its own model');
});

test('a git or url source is refused as not yet, wherever it stands', () => {
  const at = (...keys: Array<string | number>) => keys;
  const manifest = (edit: (spec: any) => void) => refusalsOf((d) => edit(d['nemia.yaml'].spec));
  assertRefused(
    manifest((s) => (s.instruction = { git: 'https://x', ref: 'v1' })),
    'nemia.yaml',
    at('spec', 'instruction'),
    'not yet',
  );
  assertRefused(
    manifest((s) => (s.instruction = { url: 'https://x', digest: 'sha256:00' })),
    'nemia.yaml',
    at('spec', 'instruction'),
    'not yet',
  );
  const imports = manifest((s) => (s.imports = [{ kind: 'Agent', name: 'x', from: { git: 'g', ref: 'r' }, version: '^1' }]));
  assertRefused(imports, 'nemia.yaml', at('spec', 'imports', 0), 'not yet');
  const skill = 'skills/grilling/skill.yaml';
  const fetched = refusalsOf((d) => (d[skill] = doc('Skill', 'grilling', { fetch: { 'bin/probe': { url: 'u', digest: 'sha256:0' } } })));
  assertRefused(fetched, skill, at('spec', 'fetch', 'bin/probe'), 'not yet');
  const lock = (resolved: unknown[]) =>
    refusalsOf((d) => (d['nemia.lock.yaml'] = { apiVersion: 'nemia.dev/v1alpha1', kind: 'Lock', resolved }));
  assertRefused(lock([{ kind: 'Agent', name: 'x' }]), 'nemia.lock.yaml', at('resolved', 0), 'not yet');
  assert.deepEqual(lock([]), []);
});

test('a {path:} passes when the folder holds the file, and is refused when it does not, or leaves the folder', () => {
  const instructions = (path: string, files: (f: string[]) => string[] = (f) => f) =>
    refusalsOf((d) => (d[AGENT].spec.instructions = { path }), files);
  assert.deepEqual(
    instructions('agents/ada/notes.md', (f) => [...f, 'agents/ada/notes.md']),
    [],
  );
  assertRefused(instructions('agents/ada/notes.md'), AGENT, ['spec', 'instructions'], 'is not in the template');
  assertRefused(instructions('../secrets.md'), AGENT, ['spec', 'instructions'], 'never through ..');
});

test('every refusal comes back at once, sorted by file', () => {
  const refusals = refusalsOf((d) => {
    d['workflows/build/workflow.yaml'].spec.steps[3].after = ['nope'];
    d[AGENT].apiVersion = 'v0';
    d['nemia.yaml'].spec.hires['build/nope'] = 'ada';
  });
  assert.deepEqual(
    refusals.map((r) => r.file),
    [AGENT, 'nemia.yaml', 'workflows/build/workflow.yaml'],
  );
});
