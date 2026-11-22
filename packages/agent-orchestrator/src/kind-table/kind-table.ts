/**
 * A page of agents, skills, factories, a factory's MCP servers or its proposals as a table (`agentTable`, `skillTable`, `factoryTable`,
 * `mcpServerTable`, `proposalTable`), Kubernetes' server-side printing of a list (`objects`' `Table`), as `runTable` gives the runs':
 * the columns `nemia <verb>` prints of each kind — what a person scans by default at priority 0, the rest when asked wide — a row per item
 * of the page in its order, its cells in the columns' order, and the item's metadata beside them (`PartialObjectMetadata`), never the
 * whole item: an agent's instructions and source, a skill's body and a proposal's objects are what a table leaves out. Every cell is one
 * line of text read off the served object, a text of several lines cut at its first break, and none is `''`, never null; a `boolean` or
 * `integer` column's cells are a boolean or a number. The api answers it to a list asked for a `Table` (`TABLE_ACCEPT`), and
 * `tableLines` prints it for the client and the MCP port alike. Pure.
 */
import {
  DEFAULT_NAMESPACE,
  type AgentList,
  type AgentListed,
  type Factory,
  type FactoryList,
  type McpServer,
  type McpServerList,
  type ProposalListed,
  type ProposalList,
  type SkillList,
  type SkillListed,
  type Table,
  type TableColumnDefinition,
} from 'objects';
import { column, firstLine, tableOf } from './table-of.ts';

/**
 * What a definition's note says: why it does not read, and the origin that shadows it, `; `-joined; `''` for neither.
 * @param error Why the definition does not read; null where it reads.
 * @param shadowedBy The origin that shadows it, where one does.
 */
export const definitionNote = (error: string | null, shadowedBy: string | undefined) =>
  [...(error ? [`does not read: ${firstLine(error)}`] : []), ...(shadowedBy ? [`shadowed by ${shadowedBy}`] : [])].join('; ');

/** The columns of an agent's row, in the order its cells are. */
export const AGENT_COLUMNS: readonly TableColumnDefinition[] = [
  column('Name', "The agent's name.", 0),
  column('Origin', 'Where the agent is defined: factory, repo, yours or builtin.', 0),
  column('Description', "The first line of the agent's description.", 0),
  column('Note', 'Why the agent does not read, and the origin that shadows it.', 0),
  column('Skills', "The agent's skills line.", 1),
  column('Can do', 'The ids its card says it can do, or why its card says nothing.', 1),
  column('MCP', "The agent's MCP line.", 1),
  column('Harness prompt', "The agent's harness prompt, where it sets one other than keep.", 1),
  column('Used by', 'The workflow steps that use it, workflow/step.', 1),
  column('Copied', 'Where it was copied from, and whether that source has changed or is gone.', 1),
];

/** What an agent's card says it can do: its entries' ids, or why it says nothing. */
const canDo = ({ status }: AgentListed) =>
  status.cardError ? `says nothing it can do — ${firstLine(status.cardError)}` : (status.card ?? []).map((entry) => entry.id).join(', ');

/** Where an agent was copied from, and whether its source moved since: `''` for one never copied. */
const copiedCell = ({ status: { copied } }: AgentListed) => {
  if (copied === null) return '';
  const since = copied.now === 'changed' ? '; the source has changed since' : copied.now === 'gone' ? '; the source is gone' : '';
  return `from ${copied.source} at ${copied.version}${since}`;
};

/** A harness prompt as a cell: none, and `keep`, which sets none, are `''`. */
const harnessPromptCell = (prompt: string | null | undefined) => (prompt === 'keep' ? '' : firstLine(prompt));

/** The cells of `agent`'s row, in `AGENT_COLUMNS`' order. */
const agentCells = (agent: AgentListed) => [
  agent.metadata.name,
  agent.status.origin,
  firstLine(agent.spec.description),
  definitionNote(agent.status.error, agent.status.shadowedBy),
  firstLine(agent.spec.skills),
  canDo(agent),
  firstLine(agent.spec.mcp),
  harnessPromptCell(agent.spec.harnessPrompt),
  agent.status.usedBy.map((user) => `${user.workflow}/${user.step}`).join(', '),
  copiedCell(agent),
];

/**
 * `list` as a table: `AGENT_COLUMNS`, and a row per agent of the page.
 * @param list The page of agents, as the list answers it.
 */
export const agentTable = (list: AgentList) => tableOf(list, AGENT_COLUMNS, agentCells) satisfies Table;

/** The columns of a skill's row, in the order its cells are. */
export const SKILL_COLUMNS: readonly TableColumnDefinition[] = [
  column('Name', "The skill's name.", 0),
  column('Origin', 'Where the skill is defined: factory, repo, yours or builtin.', 0),
  column('Description', "The first line of the skill's description.", 0),
  column('Note', 'Why the skill does not read, and the origin that shadows it.', 0),
  column('Preload', 'preload where the skill is loaded whole into every turn.', 1),
  column('Cost', 'What the skill costs a turn, about, in tokens.', 1),
  column('Used by', 'What uses it, from/name.', 1),
  column('Tags', "The skill's tags.", 1),
];

/** The cells of `skill`'s row, in `SKILL_COLUMNS`' order. */
const skillCells = (skill: SkillListed) => [
  skill.metadata.name,
  skill.status.origin,
  firstLine(skill.spec.description ?? skill.status.entry?.description),
  definitionNote(skill.status.error, skill.status.shadowedBy),
  skill.status.preload ? 'preload' : '',
  skill.status.cost ? `${skill.status.cost.perTurn} tokens a turn` : '',
  skill.status.usedBy.map((user) => `${user.from}/${user.name}`).join(', '),
  (skill.spec.tags ?? []).join(', '),
];

/**
 * `list` as a table: `SKILL_COLUMNS`, and a row per skill of the page.
 * @param list The page of skills, as the list answers it.
 */
export const skillTable = (list: SkillList) => tableOf(list, SKILL_COLUMNS, skillCells) satisfies Table;

/** The columns of a factory's row, in the order its cells are. */
export const FACTORY_COLUMNS: readonly TableColumnDefinition[] = [
  column('Name', "The factory's name.", 0),
  column('Repositories', 'The repositories it works on.', 0),
  column('Note', 'Why it does not read, its places a harness does not trust, and each condition amiss.', 0),
  column('Workflows', 'The workflows it offers, all where it names none.', 1),
  column('Hires', 'Each step it hires into, step ← agent.', 1),
  column('Template', 'The template it was made from, and the version applied.', 1),
  column('Revisions', 'Whether its runs follow merged revisions.', 1),
  column('Cost lines', 'Its cost line per workflow.', 1),
  column('Volumes', 'The folders it mounts into its steps.', 1),
];

/** What the default factory is, as `nemia factory ls` says it. */
const DEFAULT_FACTORY_NOTE = 'every run and card that names no factory — read, never written';

/**
 * A factory's note: why its file does not read; else each place a harness does not trust, and each condition that is not as it should
 * be (`Applied` false, any other true), as `nemia factory ls` words them; the default factory's, what it is.
 */
const factoryNote = ({ metadata, status }: Factory) => {
  if (status.error) return firstLine(status.error);
  if (metadata.name === DEFAULT_NAMESPACE) return DEFAULT_FACTORY_NOTE;
  const amiss = status.conditions.filter((c) => (c.type === 'Applied') === (c.status === 'False'));
  return [
    ...status.untrusted.map(
      (one) => `not trusted for ${one.harness}: ${one.place} — withheld: ${one.withheld}${one.never ? `. ${firstLine(one.never)}` : ''}`,
    ),
    ...amiss.map((c) => `${c.type} ${c.status}, ${c.reason}: ${firstLine(c.message)}`),
  ].join('; ');
};

/** A record's entries sorted by key, each as `say` words it, comma-separated. */
const sortedEntries = <V>(record: Readonly<Record<string, V>> | undefined, say: (key: string, value: V) => string) =>
  Object.entries(record ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => say(key, value))
    .join(', ');

/** The template a factory was made from, and the version applied or that none is yet; `''` for none. */
const templateCell = ({ spec: { template }, status }: Factory) =>
  template === undefined
    ? ''
    : `${template.source} ${template.version}, ${status.applied === undefined ? 'not rendered yet' : `applied at ${status.applied}`}`;

/** The cells of `factory`'s row, in `FACTORY_COLUMNS`' order. */
const factoryCells = (factory: Factory) => [
  factory.metadata.name,
  factory.spec.volumes
    .filter((v) => !v.readOnly)
    .map((v) => v.path)
    .join(', '),
  factoryNote(factory),
  factory.spec.workflows === undefined ? 'all' : [...factory.spec.workflows].sort().join(', '),
  sortedEntries(factory.spec.hires, (step, agent) => `${step} ← ${agent}`),
  templateCell(factory),
  factory.spec.revisions ?? '',
  sortedEntries(factory.spec.costLines, (workflow, usd) => `${workflow} $${usd.toFixed(2)}`),
  factory.spec.volumes.map((v) => `${v.name ? `${v.name}=` : ''}${v.path}${v.readOnly ? ' (read-only)' : ''}`).join(', '),
];

/**
 * `list` as a table: `FACTORY_COLUMNS`, and a row per factory of the page.
 * @param list The page of factories, as the list answers it.
 */
export const factoryTable = (list: FactoryList) => tableOf(list, FACTORY_COLUMNS, factoryCells) satisfies Table;

/** The columns of an MCP server's row, in the order its cells are. */
export const MCP_SERVER_COLUMNS: readonly TableColumnDefinition[] = [
  column('Name', "The server's name.", 0),
  column('Type', 'Its transport.', 0),
  column('URL', 'Where it is reached.', 0),
  column('State', 'Its state as last read, unread where none was.', 0),
  column('Tools', 'How many tools it offers, where read.', 0),
  column('Error', 'Why it last failed.', 0),
  column('Headers', 'The names of the headers it is sent, never their values.', 1),
];

/** The cells of `server`'s row, in `MCP_SERVER_COLUMNS`' order. */
const mcpServerCells = (server: McpServer) => [
  server.metadata.name,
  server.spec.type,
  server.spec.url,
  server.status?.state ?? 'unread',
  server.status?.tools === undefined ? '' : String(server.status.tools),
  firstLine(server.status?.error),
  Object.keys(server.spec.headers ?? {})
    .sort()
    .join(', '),
];

/**
 * `list` as a table: `MCP_SERVER_COLUMNS`, and a row per server of the page.
 * @param list The page of MCP servers, as the list answers it.
 */
export const mcpServerTable = (list: McpServerList) => tableOf(list, MCP_SERVER_COLUMNS, mcpServerCells) satisfies Table;

/** The most characters a proposal's `why` cell holds, its last a `…` where the text was cut. */
export const WHY_CELL_MOST = 200;

/** The columns of a proposal's row, in the order its cells are. */
export const PROPOSAL_COLUMNS: readonly TableColumnDefinition[] = [
  column('Name', "The proposal's name.", 0),
  column('Phase', 'Where the proposal stands in its life.', 0),
  column('Widens', 'Whether the whole proposal widens access.', 0, 'boolean'),
  column('Why', `The first line of why it is proposed, cut at ${WHY_CELL_MOST} characters.`, 0),
  column('Proposed by', 'Who proposed it: the person, or the agent with its run and step.', 1),
  column('Changes', 'How many changes it makes.', 1, 'integer'),
];

/** The first line of `why`, cut to `WHY_CELL_MOST` characters with a `…` where cut; `''` for none. */
const whyCell = (why: string | undefined) => {
  const line = firstLine(why);
  return line.length > WHY_CELL_MOST ? `${line.slice(0, WHY_CELL_MOST - 1)}…` : line;
};

/** Who proposed, as a cell: `person`, or the agent, with `(run/step)` where it was a run's. */
const proposedByCell = ({ status: { proposedBy } }: ProposalListed) => {
  if (proposedBy.agent === undefined) return 'person';
  return proposedBy.run === undefined ? proposedBy.agent : `${proposedBy.agent} (${proposedBy.run}/${proposedBy.step ?? ''})`;
};

/** The cells of `proposal`'s row, in `PROPOSAL_COLUMNS`' order. */
const proposalCells = (proposal: ProposalListed) => [
  proposal.metadata.name,
  proposal.status.phase,
  proposal.status.widens,
  whyCell(proposal.spec.why),
  proposedByCell(proposal),
  proposal.status.changes.length,
];

/**
 * `list` as a table: `PROPOSAL_COLUMNS`, and a row per proposal of the page, none of its objects.
 * @param list The page of proposals, as the list answers it.
 */
export const proposalTable = (list: ProposalList) => tableOf(list, PROPOSAL_COLUMNS, proposalCells) satisfies Table;
