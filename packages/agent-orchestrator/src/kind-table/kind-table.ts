/**
 * A page of agents, skills, factories or a factory's MCP servers as a table (`agentTable`, `skillTable`, `factoryTable`,
 * `mcpServerTable`), Kubernetes' server-side printing of a list (`objects`' `Table`), as `runTable` gives the runs': the columns `nemia
 * <verb>` prints of each kind — what a person scans by default at priority 0, the rest when asked wide — a row per item of the page in its
 * order, its cells in the columns' order, and the item's metadata beside them (`PartialObjectMetadata`), never the whole item: an agent's
 * instructions and source and a skill's body are what a table leaves out. Every cell is one line of text read off the served object, a
 * text of several lines cut at its first break, and none is `''`, never null. The api answers it to a list asked for a `Table`
 * (`TABLE_ACCEPT`), and `tableLines` prints it for the client and the MCP port alike. Pure.
 */
import {
  DEFAULT_NAMESPACE,
  type Agent,
  type AgentList,
  type Factory,
  type FactoryList,
  type McpServer,
  type McpServerList,
  type ObjectMeta,
  type Skill,
  type SkillList,
  type Table,
  type TableColumnDefinition,
} from 'objects';

/** A text column: its name, what it says and its priority (0 shown by default, 1 when asked wide). */
const column = (name: string, description: string, priority: 0 | 1): TableColumnDefinition => ({
  name,
  type: 'string',
  format: name === 'Name' ? 'name' : '',
  description,
  priority,
});

/** `text` up to its first line's end; `''` for none. */
const firstLine = (text: string | null | undefined): string => {
  if (!text) return '';
  const at = text.indexOf('\n');
  return at === -1 ? text : text.slice(0, at);
};

/** A row's object, as Kubernetes gives one beside a table's row: the item's metadata alone. */
const partialOf = (metadata: ObjectMeta) => ({ kind: 'PartialObjectMetadata', apiVersion: 'meta.k8s.io/v1', metadata });

/** A page as a table: its place (`continue`), its columns, and a row per item, its cells by `cells`, its metadata beside them. */
const tableOf = <Item extends { readonly metadata: ObjectMeta }>(
  page: { readonly metadata: { readonly continue?: string }; readonly items: readonly Item[] },
  columns: readonly TableColumnDefinition[],
  cells: (item: Item) => readonly string[],
): Table => ({
  kind: 'Table',
  apiVersion: 'meta.k8s.io/v1',
  metadata: page.metadata.continue === undefined ? {} : { continue: page.metadata.continue },
  columnDefinitions: columns,
  rows: page.items.map((item) => ({ cells: cells(item), object: partialOf(item.metadata) })),
});

/** What a definition's note says: why it does not read, and the origin that shadows it, `; `-joined; `''` for neither. */
const definitionNote = (error: string | null, shadowedBy: string | undefined): string =>
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
const canDo = ({ status }: Agent): string =>
  status.cardError ? `says nothing it can do — ${firstLine(status.cardError)}` : (status.card ?? []).map((entry) => entry.id).join(', ');

/** Where an agent was copied from, and whether its source moved since: `''` for one never copied. */
const copiedCell = ({ status: { copied } }: Agent): string => {
  if (copied === null) return '';
  const since = copied.now === 'changed' ? '; the source has changed since' : copied.now === 'gone' ? '; the source is gone' : '';
  return `from ${copied.source} at ${copied.version}${since}`;
};

/** A harness prompt as a cell: none, and `keep`, which sets none, are `''`. */
const harnessPromptCell = (prompt: string | null | undefined): string => (prompt === 'keep' ? '' : firstLine(prompt));

/** The cells of `agent`'s row, in `AGENT_COLUMNS`' order. */
const agentCells = (agent: Agent): readonly string[] => [
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

/** `list` as a table: `AGENT_COLUMNS`, and a row per agent of the page. */
export const agentTable = (list: AgentList): Table => tableOf(list, AGENT_COLUMNS, agentCells);

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
const skillCells = (skill: Skill): readonly string[] => [
  skill.metadata.name,
  skill.status.origin,
  firstLine(skill.spec.description ?? skill.status.entry?.description),
  definitionNote(skill.status.error, skill.status.shadowedBy),
  skill.status.preload ? 'preload' : '',
  skill.status.cost ? `${skill.status.cost.perTurn} tokens a turn` : '',
  skill.status.usedBy.map((user) => `${user.from}/${user.name}`).join(', '),
  (skill.spec.tags ?? []).join(', '),
];

/** `list` as a table: `SKILL_COLUMNS`, and a row per skill of the page. */
export const skillTable = (list: SkillList): Table => tableOf(list, SKILL_COLUMNS, skillCells);

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
const factoryNote = ({ metadata, status }: Factory): string => {
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
const sortedEntries = <V>(record: Readonly<Record<string, V>> | undefined, say: (key: string, value: V) => string): string =>
  Object.entries(record ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => say(key, value))
    .join(', ');

/** The template a factory was made from, and the version applied or that none is yet; `''` for none. */
const templateCell = ({ spec: { template }, status }: Factory): string =>
  template === undefined
    ? ''
    : `${template.source} ${template.version}, ${status.applied === undefined ? 'not rendered yet' : `applied at ${status.applied}`}`;

/** The cells of `factory`'s row, in `FACTORY_COLUMNS`' order. */
const factoryCells = (factory: Factory): readonly string[] => [
  factory.metadata.name,
  factory.spec.repos.join(', '),
  factoryNote(factory),
  factory.spec.workflows === undefined ? 'all' : [...factory.spec.workflows].sort().join(', '),
  sortedEntries(factory.spec.hires, (step, agent) => `${step} ← ${agent}`),
  templateCell(factory),
  factory.spec.revisions ?? '',
  sortedEntries(factory.spec.costLines, (workflow, usd) => `${workflow} $${usd.toFixed(2)}`),
  factory.spec.volumes.map((v) => `${v.name ? `${v.name}=` : ''}${v.path}${v.readOnly ? ' (read-only)' : ''}`).join(', '),
];

/** `list` as a table: `FACTORY_COLUMNS`, and a row per factory of the page. */
export const factoryTable = (list: FactoryList): Table => tableOf(list, FACTORY_COLUMNS, factoryCells);

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
const mcpServerCells = (server: McpServer): readonly string[] => [
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

/** `list` as a table: `MCP_SERVER_COLUMNS`, and a row per server of the page. */
export const mcpServerTable = (list: McpServerList): Table => tableOf(list, MCP_SERVER_COLUMNS, mcpServerCells);
