/**
 * The factory agent page's reads for its stories (`Pages/Agent, a factory's`): Agora, the reviewer of the factory `nemia`, read only,
 * hired into the review step of two workflows, with its key form, models, steps, skills and marks, and the runs not finished that
 * hold none, one or four of its sessions at work. Each is typed by the board's own reads of `objects`.
 */
import type { HarnessModels, WorkflowStepPage } from 'objects';
import type { AgentListing } from '../../src/lib/api/agents';
import type { KeyForm } from '../../src/lib/api/builder';
import type { FinishedPage, OpenRuns } from '../../src/lib/api/runs';
import type { SkillPlace } from '../../src/lib/api/skills';
import { atWorkSince, givenAgent, listed, summary } from '../../test/run.fixture';
import { FACTORY } from './proposals';

/** The factory the stories read in. */
export { FACTORY };

/** The agent's name. */
export const AGORA = 'agora';

/** Instructions as a file hard-wraps them: a paragraph's lines break where the file's do. */
const BODY = `## Your role

You read a change against its plan, and you pass it or ask for another
round. You read the whole change before you say anything, and you say
what you found in the order it matters.

## What you refuse

- A test that was weakened to make the suite pass.
- A change that leaves dead code behind it.
- A name the rest of the code does not use.

## How you answer

Say each finding once, where it is and what to do about it. A finding
you cannot name a fix for is a question, and you ask it as one.

## What you read

Start from the plan, then the diff, then the tests the diff touched.
Read a file whole before you judge a line of it, and read the
documentation of a tool before you judge how it is called.

## When you are unsure

Say so, and say what would settle it. A review that hides its doubt
sends the doubt to the person who lands the change.

## Your last word

Pass the change only when you would land it yourself.
`;

/** One skill of the factory's own tree, as the picker lists it. */
const skill = (name: string, description: string, from: SkillPlace['from'] = 'factory') => ({
  name,
  from,
  dir: `/factories/nemia/skills/${name}`,
  entry: { id: name, name, description, tags: [] },
  error: null,
  preload: false,
  cost: null,
  usedBy: [],
  found: null,
});

/** The skills of the factory, by place: each says what it is for. */
export const skillPlaces: SkillPlace[] = [
  {
    from: 'factory',
    dir: '/factories/nemia/skills',
    skills: [
      skill('code-review', 'Reads a change along its standards and its spec.'),
      skill('look', 'Looks at a page as a person would, in both themes.'),
      skill('tsverify', 'Proves a function by the laws of its contract.'),
    ],
  },
];

/** Agora, the factory's reviewer: read only, hired into the review step of two workflows. */
export const agora: AgentListing & { factories: string[] } = {
  name: AGORA,
  from: 'factory',
  dir: '/factories/nemia/workflows/agents',
  file: '/factories/nemia/workflows/agents/agora.md',
  role: 'Code reviewer',
  description: 'Use this when a change has been built and needs reading before it lands.',
  keys: {
    harness: 'claude',
    model: 'claude-opus-5-5',
    effort: 'high',
    permissionMode: 'dontAsk',
    context: '200k',
    tools: 'Read, Grep, Glob, Bash',
    allowedTools: 'Bash(git diff *), Bash(git log *)',
    disallowedTools: 'Bash(git push *)',
    output: 'agora.schema.json',
  },
  body: BODY,
  schema: null,
  card: null,
  cardError: null,
  skills: 'code-review',
  harnessPrompt: null,
  mcp: 'playwright',
  given: [
    {
      name: 'code-review',
      from: 'factory',
      foundIn: '/factories/nemia/skills/code-review',
      entry: { id: 'code-review', name: 'code-review', description: 'Reads a change along its standards and its spec.', tags: [] },
      error: null,
      preload: false,
      cost: null,
    },
  ],
  source: `---\nname: agora\n---\n${BODY}`,
  version: 'agora-1',
  usedBy: [],
  fills: [
    { from: 'factory', workflow: 'build', step: 'review', hired: false },
    { from: 'factory', workflow: 'quick', step: 'review', hired: false },
  ],
  error: null,
  untried: null,
  factories: [FACTORY],
};

/** The step form's keys: what each role key means, and the words the effort takes. */
export const keyForm: KeyForm = {
  keys: [
    { key: 'harness', meaning: 'Which harness runs the session.', kind: 'choice', choices: ['claude', 'codex'], byHarness: null },
    { key: 'model', meaning: 'Which model answers.', kind: 'text', choices: null, byHarness: null },
    { key: 'effort', meaning: 'How hard the model thinks.', kind: 'harness-word', choices: null, byHarness: { claude: ['low', 'medium', 'high', 'xhigh'] } },
    { key: 'permissionMode', meaning: 'How the session asks before it acts.', kind: 'harness-word', choices: null, byHarness: null },
    { key: 'context', meaning: 'How many tokens it may hold.', kind: 'tokens', choices: null, byHarness: null },
  ],
  defaultHarness: 'claude',
  roleKeys: ['harness', 'model', 'effort', 'permissionMode', 'context'],
  policyKeys: [],
  agents: {},
  remote: { prefix: 'a2a:', refuses: [] },
};

/** The models the claude harness lists. */
export const models: HarnessModels = {
  harnesses: [
    {
      harness: 'claude',
      at: '2026-11-27T10:00:00.000Z',
      models: [{ id: 'claude-opus-5-5', aliases: ['opus'], name: 'Opus 5.5', keepsAuto: true, efforts: ['low', 'medium', 'high', 'xhigh'] }],
    },
  ],
};

/**
 * The review step of `workflow`, read in the factory: the agent hired into it, the skills its layers add and where each is found.
 * @param workflow The workflow the step is of.
 */
export const reviewStep = (workflow: 'build' | 'quick'): WorkflowStepPage => ({
  workflow,
  from: 'repo',
  dir: `/factories/nemia/workflows/${workflow}`,
  step: 'review',
  body: 'Read the change against its plan, and pass it or ask for another round.',
  source: '---\nagent: agora\n---\nRead the change against its plan.\n',
  keys: [
    { key: 'agent', value: 'agora', meaning: 'what is attached to this node to do its work' },
    { key: 'mcp', value: 'playwright', meaning: 'the MCP servers its sessions load' },
  ],
  agentSkills: null,
  factory: FACTORY,
  layers: {
    agent: null,
    instructions: null,
    custom: null,
    factory: null,
    agentSkills: ['code-review'],
    policy: 'Read the change against its plan.',
    addedSkills: ['look', 'tsverify'],
    fence: [],
    folderFiles: false,
    task: null,
    via: 'prompt',
  },
  hired: null,
  hiredIn: [],
  hiring: { refused: null, agents: [] },
  skillsFrom: [
    { name: 'look', from: 'repo', foundIn: '/factories/nemia/skills/look' },
    { name: 'tsverify', from: 'builtin', foundIn: null },
  ],
  recentRuns: [],
});

/** The change marks of the stats: the file, a step and a skill edited, one of them marked twice on a day. */
export const marks = [
  { day: '2026-11-27', kind: 'step', name: 'review' },
  { day: '2026-11-27', kind: 'step', name: 'review' },
  { day: '2026-11-27', kind: 'skill', name: 'git' },
  { day: '2026-11-26', kind: 'agent', name: AGORA },
] as const;

/** An instant `minutes` ago, half a minute over, so the page's whole minutes say `minutes` until the story has run for thirty seconds. */
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000 - 30_000).toISOString();

/**
 * A run in flight whose review step is at work by Agora, since `minutes` ago.
 * @param id The run's id.
 * @param title The run's title, the first line of its brief.
 * @param minutes How long the session has been at work.
 * @param workflow The workflow it runs.
 * @param round The round of the step's loop; 1 where it is the first.
 */
const atWork = (id: string, title: string, minutes: number, workflow: 'build' | 'quick' = 'build', round = 1) => {
  const run = summary([['review', 'working']], { id, brief: title, labels: { workflow }, factory: FACTORY });
  const [review] = run.steps;
  return listed({
    ...run,
    steps: [
      {
        ...review!,
        spec: givenAgent(AGORA),
        timeline: atWorkSince(ago(minutes)),
        current: { try: 1, round, phase: 'running', reason: 'Running', outcome: null, verdict: null },
      },
    ],
  });
};

/**
 * The factory's runs not finished, with `runs` in flight.
 * @param runs The runs in flight.
 */
export const open = (runs: OpenRuns['inFlight']) =>
  ({ asOf: '2026-11-27T10:00:00.000Z', counts: { waiting: 0, inFlight: runs.length, finished: 0 }, waiting: [], inFlight: runs }) satisfies OpenRuns;

/** None of Agora's sessions at work. */
export const idle = open([]);

/** One session of Agora at work, on the review of a card. */
export const one = open([atWork('r-7k2m-quick', 'board: The approve modal uses the step’s card', 2, 'quick')]);

/** Four sessions at work, the second of its third review round, in no order of their minutes. */
export const four = open([
  atWork('r-1a2b-9c3d', 'runtime: Sessions park on pause', 6),
  atWork('r-4e5f-p7q8', 'board: A card shows its cost', 14, 'build', 2),
  atWork('r-9g0h-w1x2', 'docs: The glossary says retired words', 3, 'quick'),
  atWork('r-3i4j-y5z6', 'api: Stats answer by factory', 31),
]);

/** The first page of the finished runs, the last of which had a session of Agora end 51 minutes ago. */
export const finished: FinishedPage = {
  asOf: '2026-11-27T10:00:00.000Z',
  total: 1,
  runs: [
    (() => {
      const run = summary([['review', 'succeeded']], { id: 'r-0z9y-8x7w', brief: 'cli: The inbox lists cards', labels: { workflow: 'quick' }, factory: FACTORY });
      const [review] = run.steps;
      const at = ago(51);
      const [open] = atWorkSince(at);
      return {
        ...run,
        steps: [{ ...review!, spec: givenAgent(AGORA), timeline: [{ ...open!, session: { ...open!.session!, endedAt: at } }] }],
        wallMs: 0,
        finishedAt: at,
        outcome: 'succeeded' as const,
        clock: null,
      };
    })(),
  ],
  continue: null,
};
