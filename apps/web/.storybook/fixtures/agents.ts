/**
 * The Agents pages' reads and Nemia's, for their stories (`Store/AgentForm`, `Pages/Agent`, `Pages/Agents`, `Pages/Skill`,
 * `Store/NemiaSettings` and the parts they draw): an agent of yours and the repository's (`scribe`, `critic`), a factory's own two
 * (`millAgents`), the skills an agent can be given by place (`skillPlaces`), a skill's page (`skillDetail`), your store's folders
 * (`yourStore`), Nemia's level (`nemiaLevel`) and her rules for Auto (`policyList`), each typed by the board's own reads of `objects`,
 * so a key the api renames fails the typecheck here first. Each story seeds its own query client with them (`seeded`, `proposals.ts`),
 * its queries never asked of the network.
 */
import type { AgentListing } from '../../src/lib/api/agents';

/** An agent read whole, with the factories it fills a step in: what its page reads, and every key its list row has besides. */
type WholeAgent = AgentListing & { factories: string[] };
import type { SkillDetail, SkillPlace, SkillRow } from '../../src/lib/api/skills';
import type { NemiaLevel, NemiaMemory } from '../../src/lib/api/nemia';
import type { PolicyList, PolicyRule } from '../../src/lib/api/policy';
import type { YourStore } from 'objects';

/** What a skill of these costs a turn, named and not loaded whole. */
const COST = { preload: false, listed: 60, body: 1200, perTurn: 60 };

/**
 * A skill of `from`'s, named `name`, that says what it does, given by `usedBy`.
 * @param name The skill's name.
 * @param from Where it is found.
 * @param usedBy The agents of yours that give it.
 */
const skillRow = (name: string, from: SkillRow['from'], usedBy: string[] = []) => ({
  name,
  from,
  dir: from === 'builtin' ? `/nemia/skills/${name}` : `/store/skills/${name}`,
  entry: { id: name, name, description: `What ${name} does, as its SKILL.md says it.`, tags: ['notes'] },
  error: null,
  preload: false,
  cost: COST,
  usedBy,
  found: from === 'builtin' ? null : 'user',
}) satisfies SkillRow;

/** An agent of yours that writes a change's notes, giving one skill and leaving `Skill` out of its tools. */
export const scribe: WholeAgent = {
  name: 'scribe',
  from: 'user',
  dir: '/store/agents',
  file: '/store/agents/scribe.md',
  role: 'Note writer',
  description: 'Use this when a change needs its notes written.',
  keys: { harness: 'claude', model: 'sonnet', tools: 'Read, Grep' },
  body: '## How you work\n\nRead the change, then write its notes.\n',
  schema: null,
  card: [{ id: 'write-a-note', name: 'Write a note', description: 'Writes the notes of a change.', tags: ['notes'] }],
  cardError: null,
  skills: 'write-a-note',
  harnessPrompt: null,
  mcp: null,
  given: [
    {
      name: 'write-a-note',
      from: 'user',
      foundIn: '/store/skills/write-a-note',
      entry: { id: 'write-a-note', name: 'Write a note', description: 'Writes the notes of a change.', tags: ['notes'] },
      error: null,
      preload: false,
      cost: COST,
    },
  ],
  source: '---\nname: scribe\n---\n## How you work\n',
  version: 'scribe-1',
  usedBy: [],
  fills: [],
  error: null,
  untried: null,
  factories: [],
};

/** The repository's agent, read and not written: its form drawn read-only. */
export const critic: WholeAgent = {
  ...scribe,
  name: 'critic',
  from: 'repo',
  dir: '/repo/workflows/agents',
  file: '/repo/workflows/agents/critic.md',
  role: 'Reviewer',
  description: 'Use this when a change needs reading before it lands.',
  harnessPrompt: 'no-coding',
  version: 'critic-1',
  untried: { why: 'Only an agent of yours can be tried. Copy it to yours to try it.', copy: 'nemia agent copy critic' },
};

/**
 * The factory `mill`'s own agents, read from its tree: a builder that fills its build workflow's implement step, and a reviewer that fills
 * none yet.
 */
export const millAgents: WholeAgent[] = [
  {
    ...scribe,
    name: 'builder',
    from: 'factory',
    dir: '/factories/mill/workflows/agents',
    file: '/factories/mill/workflows/agents/builder.md',
    role: 'Lead engineer',
    description: 'Use this when a card needs its change built.',
    version: 'builder-1',
    fills: [{ from: 'factory', workflow: 'build', step: 'implement', hired: false }],
    factories: ['mill'],
  },
  {
    ...scribe,
    name: 'warden',
    from: 'factory',
    dir: '/factories/mill/workflows/agents',
    file: '/factories/mill/workflows/agents/warden.md',
    role: 'Reviewer',
    description: 'Use this when a change needs reading before it lands.',
    version: 'warden-1',
    factories: ['mill'],
  },
];

/** The skills an agent of yours can be given: your library's two, and Nemia's own one, copied before it is given. */
export const skillPlaces: SkillPlace[] = [
  { from: 'user', dir: '/store/skills', skills: [skillRow('write-a-note', 'user', ['scribe']), skillRow('ask-first', 'user')] },
  { from: 'builtin', dir: null, skills: [skillRow('grill-me', 'builtin')] },
];

/** Your library's skill `write-a-note`, as its page reads it: given by scribe, named and not loaded whole. */
export const skillDetail: SkillDetail = {
  skill: skillRow('write-a-note', 'user', ['scribe']),
  version: 'write-a-note-1',
  draft: {
    name: 'write-a-note',
    title: 'Write a note',
    description: 'Writes the notes of a change.',
    tags: ['notes'],
    examples: ['Write the notes of this change.'],
    body: 'Read the change, then write its notes.\n',
  },
  body: 'Read the change, then write its notes.\n',
  users: [{ from: 'user', name: 'scribe' }],
  copyHint: null,
};

/** Your store's folders and lines. */
export const yourStore: YourStore = {
  workflows: '/store/workflows',
  agents: '/store/agents',
  skills: '/store/skills',
  fileFactory: 'nemia factory file <name>',
  turnOnNemia: 'nemia level semi-auto',
};

/** Nemia at `level`, her session up and two factories beside the default one, one raised for a stretch. */
export const nemiaLevel = (level: NemiaLevel['level']) => ({
  level,
  since: '2026-11-15T12:00:00.000Z',
  task: 'nemia-1',
  phase: 'working',
  sessionId: '0123456789abcdef',
  reach: ['attach 01234567'],
  bridge: null,
  rests: false,
  stopped: false,
  spend: { usd: 1.25, measured: 2, unmeasured: 0 },
  allows: ['Bash(git status)'],
  factories: [
    { factory: 'default', level, default: level, own: null, raise: null },
    { factory: 'mill', level: 'semi-auto', default: 'manual', own: 'manual', raise: { level: 'semi-auto', until: '2026-11-15T20:00:00.000Z' } },
    { factory: 'quay', level: 'manual', default: 'manual', own: 'manual', raise: null },
  ],
  untrusted: null,
}) satisfies NemiaLevel;

/** The facts she keeps: two, none opened. */
export const nemiaMemory: NemiaMemory = { dir: '/store/nemia/memory', facts: ['owner.md', 'style.md'], fact: null };

/** The builtin rule, in force where no list was confirmed. */
const DEFAULT_RULE: PolicyRule = {
  id: 'default',
  answer: 'approve',
  when: ['checked'],
  from: 'default',
  words: 'Approve a gate once its check passed.',
};

/** The rule she proposed: try implement again once its check is in. */
export const RETRY_RULE: PolicyRule = {
  id: 'retry-implement',
  answer: 'retry',
  steps: ['implement'],
  when: ['checked'],
  words: 'Try implement again.',
};

/** Nemia's rules for Auto: the default in force, and one she proposed, not yet confirmed. */
export const policyList: PolicyList = {
  agent: 'nemia',
  file: '/store/auto/nemia.json',
  isDefault: true,
  rules: [DEFAULT_RULE],
  proposalRules: [],
  builtin: DEFAULT_RULE,
  proposed: {
    file: '/store/auto/nemia.proposed.json',
    at: '2026-11-15T12:00:00.000Z',
    rules: [{ ...RETRY_RULE, confirmed: false }],
    proposalRules: [],
    guidance: ['Write to me in French.'],
    stale: false,
  },
  instruction: 'Try implement again when its check fails. Write to me in French.',
};
