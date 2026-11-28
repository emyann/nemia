/**
 * The factory agent page's reads for its stories (`Pages/Factory agent`): Reviewer, the code reviewer of the factory `acme`, read only,
 * hired into the review step of two workflows, with its key form, models, steps, skills and marks, and the runs not finished that
 * hold none, one or four of its sessions at work, as its board (B5) draws it. Each is typed by the board's own reads of `objects`.
 */
import type { HarnessModels, WorkflowStepPage } from 'objects';
import type { AgentListing } from '../../src/lib/api/agents';
import type { KeyForm } from '../../src/lib/api/builder';
import type { FinishedPage, OpenRuns } from '../../src/lib/api/runs';
import type { SkillPlace } from '../../src/lib/api/skills';
import { atWorkSince, givenAgent, listed, summary } from '../../test/run.fixture';

/** The factory the stories read in. */
export const FACTORY = 'acme';

/** The agent's name. */
export const AGENT = 'reviewer';

/** Its instructions, as its file writes them. */
const BODY = "You are Reviewer, a code reviewer. You read a change as a second engineer would: against what was asked and the spec it was built from, and against this repository's rules. You read and run; you never write into the workspace.\n\nTo count or search, ask one question per call: the Grep tool (its `count` or `files_with_matches` mode, a `path` and a `glob`), or `git grep -c`, `-l` or `-n` over the folders you name. A `git grep` line holding a capital `O` anywhere is refused, since the fence cannot tell git's pager option `-O` from a pattern, so search such a word (`AUTO_PROPOSE`) with the Grep tool, or with `git grep -i` and the word in lower case. Your fence refuses plain `grep`, `cd`, a shell loop, a function, an assignment (`P=…`) and a pipe into anything outside your read-only set. A path with a `$` in its name (a route file such as `runs.$runId.tsx`) is refused to `git diff` and `git grep` however it is quoted, since `$` reads as a variable: the `git` skill, *Read what changed*, says the spelling that passes. Where the run's change is judged on GitHub, you read its pull request through the GitHub server, `mcp__github__pull_request_read` with `get`, `get_status` and `get_check_runs`, by the number its address ends on, and you hold no `gh` of your own. A subagent you start reads none of this and inherits your fence, so put these lines in its prompt.\n\nLoad your skill `review-a-change` with the Skill tool and follow it. Sign off `done` with your findings, and with `again` true only when a finding is worth another round of work; false when the change is done as far as a review can tell. A finding you raised in an earlier round, which the engineer answered, and which you would raise again, is no other round: sign off `blocked`, as your skill's last step says. What happens once you pass is the workflow's, never yours to name: a person approves the landing, or — where the workflow puts your pass before an ungated ending — the run files it. Where nobody reads the change after you, your step says so.\n\nWhere a claim of the spec or of the change rests on a page outside the repository, check it against the passage the steps before you handed for it, not against what you remember of the page. A passage that contradicts the claim, or says less than the change takes from it, is a finding. A claim you cannot check — no passage handed, and your fence refuses the page — goes at the top of your sign-off: the summary says how many, and the body opens with each, its page and what the change takes from it. Where nobody reads the change after you, your step says what to do instead.\n\nAnthropic's Agent SDK is documented at https://code.claude.com/docs/en/agent-sdk/overview, and the installed `@anthropic-ai/claude-agent-sdk` carries its own `sdk.d.ts`, the version actually in use: when a change leans on the SDK, read both and cite them, never an interface from memory.";

/**
 * One skill of the factory's list, as the picker lists it, in its place.
 * @param name The skill's name.
 * @param description What it is for.
 * @param from Its place.
 * @param dir Its folder.
 */
const skill = (name: string, description: string, from: SkillPlace['from'], dir: string) => ({
  name,
  from,
  dir,
  entry: { id: name, name, description, tags: [] },
  error: null,
  preload: false,
  cost: null,
  usedBy: [],
  found: null,
});

/** The repository's own skills its review step adds, each with what it is for. */
const ROOT_SKILLS = [
  [
    'shadcn',
    'Add, search, fix and compose shadcn components.'
  ],
  [
    'look',
    'Look at the web app as a person would, in light and dark, and name what is off.'
  ],
  [
    'react-aria',
    'Accessible parts with React Aria Components.'
  ],
  [
    'see-a-dashboard',
    'Render a Grafana dashboard with fake data before it lands, and read it.'
  ],
  [
    'tsverify',
    'Prove TypeScript functions: a spec’s laws first, then the verifier’s verdicts.'
  ]
] as const;

/** The folder of skills of the repository's root, and the one of the app whose skills are named with its folder. */
export const ROOT_FOLDER = '.claude/skills';
export const APP_FOLDER = 'apps/web/.claude/skills';

/** The board's skills, named with their folder, its review step adds, each with what it is for; the factory lists none of them. */
const NESTED_SKILLS = [
  ['ds-build', 'Build or review any UI of the design system: its role utilities, type primitives and state layers.'],
  ['ds-theme', 'Change the look of the design system: a colour, a font, corners, motion or dark mode.'],
  ['ds-spec', 'Read what Material Design 3 says about a size, a state or a colour role.'],
] as const;
const NESTED = NESTED_SKILLS.map(([name]) => name);

/** What review-a-change is for. */
const REVIEW_A_CHANGE = 'Review a change as a second engineer would: against its intent and spec, with findings that name the file and the line.';

/** The skills of the factory, by place: each says what it is for. */
export const skillPlaces: SkillPlace[] = [
  {
    from: 'factory',
    dir: '/factories/acme/tree/workflows/skills',
    skills: [skill('review-a-change', REVIEW_A_CHANGE, 'factory', '/factories/acme/tree/workflows/skills/review-a-change')],
  },
  {
    from: 'repo',
    dir: '/src/acme/.claude/skills',
    skills: ROOT_SKILLS.map(([name, description]) => skill(name, description, 'repo', `/src/acme/.claude/skills/${name}`)),
  },
];

/** A count of rules, each its own line of the file. */
const rules = (count: number, verb: string) => Array.from({ length: count }, (_, i) => `Bash(${verb} ${i} *)`).join(', ');

/** Reviewer, the factory's code reviewer: read only, hired into the review step of two workflows. */
export const reviewer: AgentListing & { factories: string[] } = {
  name: AGENT,
  from: 'factory',
  dir: '/factories/acme/tree/workflows/agents',
  file: '/factories/acme/tree/workflows/agents/reviewer.md',
  role: 'Code reviewer',
  description: 'Reviews a change as a second engineer would, against its intent and spec, and sends it back for another round while a finding is worth it.',
  keys: {
    harness: 'claude',
    model: 'claude-opus-5-5',
    effort: 'high',
    permissionMode: 'dontAsk',
    context: '400k',
    tools: 'Read, Grep, Glob, Bash, Skill, Agent, WebFetch, WebSearch',
    allowedTools: rules(154, 'git log'),
    disallowedTools: rules(33, 'git push'),
    output: 'reviewer.schema.json',
  },
  body: BODY,
  schema: null,
  card: null,
  cardError: null,
  skills: 'review-a-change, git',
  harnessPrompt: null,
  mcp: null,
  given: [
    {
      name: 'review-a-change',
      from: 'factory',
      foundIn: null,
      entry: { id: 'review-a-change', name: 'review-a-change', description: REVIEW_A_CHANGE, tags: [] },
      error: null,
      preload: false,
      cost: null,
    },
    {
      name: 'git',
      from: 'builtin',
      foundIn: null,
      entry: { id: 'git', name: 'git', description: 'The git place: each step works in a worktree on a branch of its own. How to keep work in it and read what changed.', tags: [] },
      error: null,
      preload: false,
      cost: null,
    },
  ],
  source: `---\nname: reviewer\n---\n${BODY}`,
  version: 'reviewer-1',
  usedBy: [],
  fills: [
    { from: 'factory', workflow: 'build', step: 'review', hired: true },
    { from: 'factory', workflow: 'quick', step: 'review', hired: true },
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
    { key: 'effort', meaning: 'How hard the model thinks.', kind: 'harness-word', choices: null, byHarness: { claude: ['low', 'medium', 'high', 'xhigh', 'max'] } },
    { key: 'permissionMode', meaning: 'How the session asks before it acts.', kind: 'harness-word', choices: null, byHarness: null },
    { key: 'context', meaning: 'How many tokens it may hold.', kind: 'tokens', choices: null, byHarness: null },
  ],
  defaultHarness: 'claude',
  roleKeys: ['harness', 'model', 'effort', 'permissionMode', 'context'],
  policyKeys: [],
  agents: {},
  remote: { prefix: 'a2a:', refuses: [] },
};

/** The models the claude harness lists, by the names Claude Code gives them, which say no version. */
export const models: HarnessModels = {
  harnesses: [
    {
      harness: 'claude',
      at: '2026-11-27T10:00:00.000Z',
      models: [{ id: 'claude-opus-5-5', aliases: ['opus'], name: 'Opus', keepsAuto: true, efforts: ['low', 'medium', 'high', 'xhigh', 'max'] }],
    },
  ],
};

/**
 * The review step of `workflow`, read in the factory: the agent hired into it, the skills its layers add and where each is found.
 * @param workflow The workflow the step is of.
 */
export const reviewStep = (workflow: 'build' | 'quick') => ({
  workflow,
  from: 'repo',
  dir: `/factories/acme/tree/workflows/${workflow}`,
  step: 'review',
  body: 'Read the change against what was asked, and pass it or ask for another round.',
  source: '---\nmcp: playwright\n---\nRead the change against what was asked.\n',
  keys: [
    { key: 'agent', value: AGENT, meaning: 'what is attached to this node to do its work' },
    { key: 'mcp', value: 'playwright', meaning: 'the MCP servers its sessions load' },
  ],
  agentSkills: null,
  factory: FACTORY,
  layers: {
    agent: null,
    instructions: null,
    custom: null,
    factory: null,
    agentSkills: ['review-a-change', 'git'],
    policy: 'Read the change against what was asked.',
    addedSkills: [...ROOT_SKILLS.map(([name]) => name), ...NESTED.map((name) => `apps/web:${name}`)],
    fence: [],
    folderFiles: false,
    task: null,
    via: 'prompt',
  },
  hired: null,
  hiredIn: [],
  hiring: { refused: null, agents: [] },
  skillsFrom: [
    { name: 'review-a-change', from: null, foundIn: null, description: null },
    { name: 'git', from: 'builtin', foundIn: null, description: null },
    ...ROOT_SKILLS.map(([name, description]) => ({ name, from: 'repo' as const, foundIn: `${ROOT_FOLDER}/${name}`, description })),
    ...NESTED_SKILLS.map(([name, description]) => ({
      name: `apps/web:${name}`,
      from: null,
      foundIn: `${APP_FOLDER}/${name}`,
      description,
    })),
  ],
  recentRuns: [],
}) satisfies WorkflowStepPage;

/** The change marks of the stats: its file, its step and its skills edited over a fortnight, 25 sentences, one mark twice on a day. */
export const marks = [
  { day: '2026-11-27', kind: 'step', name: 'review' },
  { day: '2026-11-27', kind: 'step', name: 'review' },
  { day: '2026-11-27', kind: 'skill', name: 'git' },
  { day: '2026-11-26', kind: 'skill', name: 'git' },
  { day: '2026-11-26', kind: 'skill', name: 'review-a-change' },
  { day: '2026-11-26', kind: 'step', name: 'review' },
  { day: '2026-11-26', kind: 'agent', name: AGENT },
  { day: '2026-11-25', kind: 'skill', name: 'git' },
  { day: '2026-11-22', kind: 'step', name: 'review' },
  { day: '2026-11-22', kind: 'skill', name: 'git' },
  { day: '2026-11-21', kind: 'skill', name: 'git' },
  { day: '2026-11-21', kind: 'step', name: 'review' },
  { day: '2026-11-20', kind: 'skill', name: 'git' },
  { day: '2026-11-20', kind: 'step', name: 'review' },
  { day: '2026-11-19', kind: 'step', name: 'review' },
  { day: '2026-11-19', kind: 'skill', name: 'git' },
  { day: '2026-11-19', kind: 'skill', name: 'review-a-change' },
  { day: '2026-11-18', kind: 'skill', name: 'git' },
  { day: '2026-11-18', kind: 'step', name: 'review' },
  { day: '2026-11-17', kind: 'step', name: 'review' },
  { day: '2026-11-16', kind: 'step', name: 'review' },
  { day: '2026-11-14', kind: 'step', name: 'review' },
  { day: '2026-11-13', kind: 'agent', name: AGENT },
  { day: '2026-11-13', kind: 'skill', name: 'review-a-change' },
  { day: '2026-11-13', kind: 'step', name: 'review' },
  { day: '2026-11-12', kind: 'skill', name: 'git' },
] as const;

/** An instant `minutes` ago, half a minute over, so the page's whole minutes say `minutes` until the story has run for thirty seconds. */
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000 - 30_000).toISOString();

/**
 * A run in flight whose review step is at work by Reviewer, since `minutes` ago.
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
        ...review,
        spec: givenAgent(AGENT),
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

/** None of Reviewer's sessions at work. */
export const idle = open([]);

/** One session of Reviewer at work, on the review of a card. */
export const one = open([atWork('board-two-tests-that-fail-ma-1xu6', 'board: Two tests that fail main’s ci by chance hold steady', 2, 'quick')]);

/** Four sessions at work, the second of its second review round, in no order of their minutes. */
export const four = open([
  atWork('board-two-tests-that-fail-ma-1xu6', 'board: Two tests that fail main’s ci by chance hold steady', 2, 'quick'),
  atWork('runtime-a-long-session-keeps-yrfr', 'runtime: A long session keeps its GitHub sign-in', 7, 'build', 2),
  atWork('board-a-factory-s-agents-pag-izma', 'board: A factory’s Agents page lists the factory’s agents', 5, 'quick'),
  atWork('run-core-a-card-is-parsed-on-dlkf', 'run-core: A card is parsed once per change, not once per pass', 14),
]);

/** The first page of the finished runs, the last of which had a session of Reviewer end 51 minutes ago. */
export const finished: FinishedPage = {
  asOf: '2026-11-27T10:00:00.000Z',
  total: 1,
  runs: [
    (() => {
      const run = summary([['review', 'succeeded']], { id: 'r-0z9y-8x7w', brief: 'cli: The inbox lists cards', labels: { workflow: 'quick' }, factory: FACTORY });
      const [review] = run.steps;
      const at = new Date(Date.now() - 51 * 60_000).toISOString();
      const [open] = atWorkSince(at);
      return {
        ...run,
        steps: [{ ...review, spec: givenAgent(AGENT), timeline: [{ ...open, session: { ...open.session, endedAt: at } }] }],
        wallMs: 0,
        finishedAt: at,
        outcome: 'succeeded' as const,
        clock: null,
      };
    })(),
  ],
  continue: null,
};
