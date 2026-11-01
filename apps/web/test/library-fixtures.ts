/**
 * The library's reads as the api answers them, every key the board reads: an agent (`agent`), as the list reads it (`listedAgent`), the
 * skills by place (`skillPlace`), one skill's page (`skillDetail`), a workflow (`workflow`, its steps' keys from `stepSpec`), a step's page
 * (`stepPage`), the builder's form (`keyForm`) and a machine (`machine`). Each takes keys to put over its own.
 */
import type {
  AgentListing,
  AgentSkill,
  KeyForm,
  LibraryAgent,
  MachineGraph,
  SkillDetail,
  SkillPlace,
  SkillRow,
  WorkflowListing,
  WorkflowStepPage,
  WorkflowStepSpec,
} from '../src/lib/api.ts';

/** A card entry that says every key the A2A protocol has. */
export const skillEntry = (extra: Partial<AgentSkill> = {}): AgentSkill => ({
  id: 'review-a-change',
  name: 'Review a change',
  description: 'Read a diff as a second engineer would.',
  tags: ['review'],
  examples: ['Review the branch'],
  inputModes: ['text/plain'],
  outputModes: ['application/json'],
  ...extra,
});

/** A skill as the picker lists it, found and costed. */
export const skillRow = (extra: Partial<SkillRow> = {}): SkillRow => ({
  name: 'review-a-change',
  from: 'builtin',
  dir: '/work/workflows/skills/review-a-change',
  entry: skillEntry(),
  error: null,
  preload: false,
  cost: { preload: false, listed: 30, body: 900, perTurn: 30 },
  usedBy: ['agora'],
  found: 'yours',
  ...extra,
});

/** One agent of yours, with a card, a schema, a skill it gives and a node that names it. */
export const agent = (extra: Partial<AgentListing> = {}): AgentListing => ({
  name: 'agora',
  from: 'yours',
  dir: '/store/workflows/agents',
  file: '/store/workflows/agents/agora.md',
  role: 'Code reviewer',
  description: 'Reviews a change.',
  keys: { harness: 'claude', model: 'opus', tools: 'Read, Bash' },
  body: 'Review the change.',
  schema: { file: 'agora.schema.json', text: '{}' },
  card: [skillEntry()],
  cardError: null,
  skills: 'review-a-change',
  harnessPrompt: null,
  mcp: null,
  given: [
    {
      name: 'review-a-change',
      from: 'yours',
      foundIn: null,
      entry: skillEntry(),
      error: null,
      preload: true,
      cost: { preload: true, listed: 30, body: 900, perTurn: 930 },
    },
  ],
  source: '---\nrole: Code reviewer\n---\nReview the change.\n',
  version: 'v-1',
  usedBy: [{ from: 'yours', workflow: 'build', step: 'review' }],
  error: null,
  untried: { why: 'a try runs Claude Code', copy: null },
  ...extra,
});

/** `agent` as the Agents page lists it, filling a step in the factory nemia; `factories` puts other names in its place. */
export const listedAgent = (extra: Partial<AgentListing> = {}, factories = ['nemia']): LibraryAgent => ({ ...agent(extra), factories });

/** The skills of one place. */
export const skillPlace = (extra: Partial<SkillPlace> = {}): SkillPlace => ({
  from: 'builtin',
  dir: '/work/workflows/skills',
  skills: [skillRow()],
  ...extra,
});

/** One skill of yours on its page, its draft setting every key. */
export const skillDetail = (extra: Partial<SkillDetail> = {}): SkillDetail => ({
  skill: skillRow({ from: 'yours', found: null }),
  version: 'v-2',
  draft: {
    name: 'review-a-change',
    title: 'Review a change',
    description: 'Read a diff.',
    tags: ['review'],
    examples: null,
    preload: false,
    body: 'Read the diff.',
  },
  body: 'Read the diff.',
  users: [{ from: 'repo', name: 'agora' }],
  copyHint: 'cp -r a b',
  ...extra,
});

/** A step's keys, one that ends a run in the repository's checkout and takes no run slot. */
export const stepSpec = (extra: Partial<WorkflowStepSpec> = {}): WorkflowStepSpec => ({
  harness: 'claude',
  model: 'opus',
  effort: 'high',
  context: 200_000,
  after: ['review'],
  resume: null,
  input: ['review'],
  workspace: 'base',
  place: 'git',
  writable: [],
  reads: [],
  slot: 'none',
  agent: 'otto',
  skills: [],
  mcp: [],
  permissionMode: 'dontAsk',
  sandbox: null,
  tools: ['Read'],
  disallowedTools: ['Bash(git push:*)'],
  allowedTools: [],
  denials: 'fail',
  remote: null,
  deadlineSeconds: 900,
  budget: 5,
  check: 'npm test',
  retries: 1,
  gate: true,
  output: 'ship.schema.json',
  tally: [],
  loop: null,
  rounds: null,
  ...extra,
});

/** A workflow of yours with one step, which sets two keys of its own over its agent's. */
export const workflow = (extra: Partial<WorkflowListing> = {}): WorkflowListing => ({
  name: 'build',
  from: 'yours',
  dir: '/store/workflows/build',
  description: 'An intent to main.',
  readme: '# build\n\nAn intent to main.\n\nEach step lands what the last one made.\n',
  steps: [
    {
      name: 'ship',
      spec: stepSpec(),
      body: 'Land it.',
      own: { keys: ['workspace', 'slot', 'gate'], body: 'Land it.' },
      hired: null,
      layers: null,
      mcp: [],
    },
  ],
  graph: { roots: ['ship'], edges: [{ from: 'review', to: 'ship', kind: 'after' }] },
  schemas: ['ship.schema.json'],
  folderTeam: false,
  version: 'v-3',
  error: null,
  unfilled: null,
  ...extra,
});

/** A step's page, its agent's card read. */
export const stepPage = (extra: Partial<WorkflowStepPage> = {}): WorkflowStepPage => ({
  workflow: 'build',
  from: 'repo',
  dir: '/work/workflows/build',
  step: 'ship',
  body: 'Land it.',
  source: '---\nplace: git\nworkspace: base\n---\nLand it.\n',
  keys: [
    { key: 'workspace', value: 'main', meaning: 'Where the step works.' },
    { key: 'model', value: null, meaning: 'The model.' },
  ],
  agentSkills: [skillEntry()],
  factory: null,
  layers: {
    agent: null,
    instructions: null,
    custom: null,
    factory: null,
    agentSkills: [],
    policy: 'Land it.',
    addedSkills: [],
    fence: [],
    folderFiles: true,
    task: null,
    via: 'brief',
  },
  hired: null,
  hiredIn: [],
  hiring: { refused: null, agents: [] },
  skillsFrom: [],
  recentRuns: [],
  ...extra,
});

/** The builder's form: a key of each shape, an agent of yours, and the keys a remote step refuses. */
export const keyForm = (extra: Partial<KeyForm> = {}): KeyForm => ({
  keys: [
    { key: 'workspace', meaning: 'Where the step works.', kind: 'choice', choices: ['base'], byHarness: null },
    { key: 'slot', meaning: 'Whether the run takes a slot.', kind: 'choice', choices: ['none'], byHarness: null },
    { key: 'effort', meaning: 'How hard it thinks.', kind: 'harness-word', choices: null, byHarness: { claude: ['low', 'high'] } },
  ],
  defaultHarness: 'claude',
  roleKeys: ['harness', 'model', 'output'],
  policyKeys: ['tools', 'allowedTools', 'disallowedTools', 'permissionMode', 'sandbox', 'skills', 'mcp'],
  agents: { otto: { harness: 'claude', gate: true, tools: ['Read'] }, bare: {} },
  remote: { prefix: 'a2a:', refuses: ['tools', 'workspace'] },
  ...extra,
});

/** A machine's graph, one edge under a guard and one without, and a verb a person writes from outside it. */
export const machine = (extra: Partial<MachineGraph> = {}): MachineGraph => ({
  name: 'lifecycle',
  title: "A task's lifecycle",
  source: 'packages/agent-runtime/src/core/lifecycle.ts',
  initial: 'queued',
  states: ['queued', 'running', 'done'],
  final: ['done'],
  edges: [
    { from: 'queued', event: 'start', guard: 'hasSlot', to: 'running', action: 'spawn' },
    { from: 'running', event: 'exit', to: 'done', action: 'record' },
  ],
  verbs: [{ verb: 'close', entry: 'closed', by: 'person', from: ['running'], to: 'done', guard: 'awaitsWord' }],
  ...extra,
});
