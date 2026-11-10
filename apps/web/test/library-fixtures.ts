/**
 * The library's reads as the api answers them, every key the board reads: an agent (`agent`), as the list reads it (`listedAgent`), the
 * skills by place (`skillPlace`), one skill's page (`skillDetail`), a workflow (`workflow`, its steps' keys from `stepSpec`), a step's page
 * (`stepPage`) and the builder's form (`keyForm`). Each takes keys to put over its own. And each definition as the objects serve it, made
 * from the board's view of it (`workflowObject`, `agentObject`, `skillObject`): the object a read answers, whose view is the fixture.
 */
import type { Agent, Skill, Workflow } from 'objects';
import { writtenStepOf } from '../src/lib/api/workflows.ts';
import type { AgentListing, LibraryAgent } from '../src/lib/api/agents.ts';
import type { AgentSkill, WorkflowStepSpec } from '../src/lib/api/library.ts';
import type { KeyForm } from '../src/lib/api/builder.ts';
import type { SkillDetail, SkillPlace, SkillRow } from '../src/lib/api/skills.ts';
import type { WorkflowListing, WorkflowStepPage } from '../src/lib/api/workflows.ts';

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
  memory: null,
  budget: 5,
  check: 'npm test',
  retries: 1,
  gate: true,
  output: 'ship.schema.json',
  tally: [],
  loop: null,
  rounds: null,
  routes: null,
  route: null,
  when: null,
  ends: null,
  workflow: null,
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

/** When an object was made, where the fixture does not say. */
const MADE = '2026-10-01T00:00:00.000Z';

/** `listing` as the Workflow object the api serves in `namespace`: its view is `listing` with its graph's nodes. */
export const workflowObject = (listing: WorkflowListing = workflow(), namespace = 'default'): Workflow => ({
  apiVersion: 'nemia/v1',
  kind: 'Workflow',
  metadata: { name: listing.name, namespace, creationTimestamp: MADE, resourceVersion: listing.version },
  spec: { description: listing.description, readme: listing.readme, steps: listing.steps.map(writtenStepOf) },
  status: {
    origin: listing.from,
    dir: listing.dir,
    graph: { ...listing.graph, nodes: listing.graph.nodes ?? listing.steps.map((step) => ({ name: step.name, kind: 'step' as const })) },
    steps: listing.steps,
    schemas: listing.schemas,
    folderTeam: listing.folderTeam,
    error: listing.error,
    unfilled: listing.unfilled,
  },
});

/** `listed` as the Agent object the api serves in `namespace`: its view is `listed`. */
export const agentObject = (listed: LibraryAgent = listedAgent(), namespace = 'default'): Agent => ({
  apiVersion: 'nemia/v1',
  kind: 'Agent',
  metadata: { name: listed.name, namespace, creationTimestamp: MADE, resourceVersion: listed.version },
  spec: {
    role: listed.role,
    description: listed.description,
    keys: listed.keys,
    skills: listed.skills,
    harnessPrompt: listed.harnessPrompt,
    mcp: listed.mcp,
    output: listed.schema,
    instructions: listed.body,
  },
  status: {
    origin: listed.from,
    dir: listed.dir,
    file: listed.file,
    source: listed.source,
    usedBy: listed.usedBy,
    fills: [],
    factories: listed.factories,
    given: listed.given,
    copied: null,
    untried: listed.untried,
    card: listed.card,
    cardError: listed.cardError,
    error: listed.error,
  },
});

/**
 * `detail` as the Skill object the api serves in `namespace`: its view is `detail`, where the row's `usedBy` names the agents of yours
 * among its `users` (`consistentSkill`).
 */
export const skillObject = (detail: SkillDetail = consistentSkill(), namespace = 'default'): Skill => {
  const { name: _, ...draft } = detail.draft ?? { name: '', body: detail.body };
  return {
    apiVersion: 'nemia/v1',
    kind: 'Skill',
    metadata: { name: detail.skill.name, namespace, creationTimestamp: MADE, resourceVersion: detail.version },
    spec: draft,
    status: {
      origin: detail.skill.from,
      dir: detail.skill.dir,
      entry: detail.skill.entry,
      error: detail.skill.error,
      preload: detail.skill.preload,
      cost: detail.skill.cost,
      usedBy: detail.users,
      found: detail.skill.found,
      copyHint: detail.copyHint,
    },
  };
};

/** `skillDetail` with its row's `usedBy` the agents of yours its `users` name, as one object says both. */
export const consistentSkill = (extra: Partial<SkillDetail> = {}): SkillDetail => {
  const detail = skillDetail(extra);
  return {
    ...detail,
    skill: { ...detail.skill, usedBy: detail.users.filter((u) => u.from === 'yours').map((u) => u.name) },
  };
};

/** A page of `items` of `kind`, the last. */
export const listOfItems = <K extends string, T>(kind: K, items: readonly T[]) => ({
  apiVersion: 'nemia/v1' as const,
  kind: `${kind}List` as const,
  metadata: {},
  items,
});
